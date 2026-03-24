# R-009 攻撃レポート

---

## ATK-009-1

**重大度**: CRITICAL

**問題の要約**: `verifyAuth` は既に `verified=true` の auth_code に対しても再実行可能であり、認証済みユーザーが Turnstile を何度でも通過させて `write_token` を再発行できる。

**詳細**:

`AuthCodeRepository.findByTokenId`（`src/lib/infrastructure/repositories/auth-code-repository.ts:161-181`）は `verified` フラグでフィルタせず、最新レコードを無条件に返す。`verifyAuth`（`src/lib/services/auth-service.ts:303-362`）は取得した auth_code が `verified=true` かどうかを確認するステップを持たない。

結果として以下のフローが成立する:

1. 正規の Turnstile 認証を完了し `verified=true` になる（write_token 発行済み）
2. 同一 edge-token で再度 `POST /api/auth/verify` を送信する
3. `findByTokenId` は `verified=true` のレコードを返す（有効期限内）
4. Step 4 の Turnstile 検証を通過すれば `markVerified`・`updateIsVerified`・`updateWriteToken` が再実行され、新たな write_token が生成される

write_token はワンタイム消費のはずだが、上記により無限に再生成可能となる。

**再現条件**: 認証完了後 10 分以内（auth_code の有効期限内）に同一 edge-token で `POST /api/auth/verify` を再送する。Turnstile のスタブが常に true を返す環境では無制限に再発行できる。

---

## ATK-009-2

**重大度**: CRITICAL

**問題の要約**: `POST /api/auth/verify` のリクエストボディ `edgeToken` フィールドに入力長制限がなく、任意の文字列を edge-token として認証フローに渡せる。

**詳細**:

`route.ts:103-137`（`src/app/api/auth/verify/route.ts`）では `bodyEdgeToken` に対して型チェック（`typeof bodyEdgeToken === "string"`）のみを行い、長さ・フォーマット・文字種のバリデーションが存在しない。

```
const edgeToken =
    (typeof bodyEdgeToken === "string" && bodyEdgeToken) ||
    cookieStore.get(EDGE_TOKEN_COOKIE)?.value;
```

この `edgeToken` は `AuthService.verifyAuth`（`auth-service.ts:309`）→ `AuthCodeRepository.findByTokenId`（`auth-code-repository.ts:161`）へそのまま渡され、Supabase クエリの `eq("token_id", tokenId)` の引数になる。攻撃者が任意の文字列（例: 数MB規模の文字列、SQLインジェクション相当の特殊文字）を投入した場合、Supabase クライアントのパラメータ処理に依存した予期しない挙動が発生しうる。加えて、UUID 形式でない文字列が `edge_tokens.token` と一致しないことが保証されていないため、DBのインデックス設計によっては意図しないレコードを引き当てる可能性もある。

**再現条件**: `POST /api/auth/verify` に `{ "turnstileToken": "valid", "edgeToken": "<任意の長文または特殊文字列>" }` を送信する。Cookie なしの環境（専ブラ向けフロー）では Cookie によるフォールバックがないため body の値が直接使われる。

---

## ATK-009-3

**重大度**: HIGH

**問題の要約**: バイパス防止シナリオ（G1）のテストは `issueAuthCode` を呼ばずに `createPost` を実行するため、実際の not_verified パスではなく auth_code 不在による not_found パスを通過しており、テストがグリーンでも G1 の実装は検証されていない。

**詳細**:

シナリオ「edge-token発行後、Turnstile未通過で再書き込みすると認証が再要求される」の Given ステップ定義（`features/step_definitions/authentication.steps.ts:801-821`）は `issueEdgeToken` のみを呼び出し、`issueAuthCode` を呼び出していない。

`verifyEdgeToken`（`auth-service.ts:157-190`）は `users.is_verified=false` を検出して `not_verified` を返す。しかし `resolveAuth`（`post-service.ts:264-271`）において `not_verified` ブランチは `issueAuthCode(ipHash, edgeToken)` を呼び出す（既存の未検証レコードを削除してから再作成する）。`issueAuthCode` の先頭で `deleteUnverifiedByTokenId` が呼ばれるが（`auth-service.ts:261`）、テストでは auth_code レコードが存在しないため delete は空振りする。

この結果、テストが検証しているのは「auth_code が存在しない場合に authRequired が返る」という not_found 相当の挙動であり、not_verified 時に「既存の edge-token を維持したまま認証を再要求する」という G1 の本来の振る舞い（issueAuthCode の冪等性・re-issue フロー）は一切検証されていない。実装を壊しても（例: not_verified ブランチを削除して not_found ブランチに統合しても）テストはグリーンのままとなる。

**再現条件**: `deleteUnverifiedByTokenId` の内部をスタブしてエラーをスローするよう改変する。正しく G1 を実装しているなら not_verified パスが失敗するはずだが、現テストはエラーなく通過する。
