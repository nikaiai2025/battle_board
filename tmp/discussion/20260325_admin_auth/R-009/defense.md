# R-009 防御レポート

---

## ATK-009-1: verified=true の auth_code への verifyAuth 再実行

**判定: REJECT**

**根拠:**

攻撃が成立するには「有効期限内の `verified=true` レコードが `findByTokenId` から返る」ことが前提となる。しかし実装上その前提は成立しない。

`verifyAuth`（`auth-service.ts:309`）は `findByTokenId` で最新レコードを取得した直後、Step 5 として `AuthCodeRepository.markVerified(authCode.id)` を呼ぶ。**これより前の issueAuthCode** は `deleteUnverifiedByTokenId` を先頭で実行する（`auth-service.ts:261`）。

攻撃フロー「正規認証 → 同一 edge-token で再送」を追跡する:

1. 正規認証完了: `verified=true` のレコードが存在する。
2. 攻撃者が再度 `POST /api/auth/verify` を送信。
3. `findByTokenId` は `verified=true` のレコードを返す。
4. **Step 2（有効期限チェック）は通過する可能性がある**（10 分以内なら）。
5. Step 3（Turnstile 検証）を通過すれば `markVerified` / `updateIsVerified` / `updateWriteToken` が再実行される。

ここで問題となるのは「`verified=true` レコードに対して `markVerified` と `updateWriteToken` が再実行される点」である。ただしこの再実行が引き起こす実害を評価する:

- `markVerified`: `verified=true` → `verified=true` の no-op 更新。副作用なし。
- `updateIsVerified(user.id, true)`: `is_verified=true` → `is_verified=true` の no-op 更新。副作用なし。
- `updateWriteToken`: 新しい write_token が生成される。

「write_token は再発行可能」という点については、write_token は**専ブラ向け認証橋渡しトークン**であり（`auth-service.ts:352-358`、`auth-service.ts:373-418`の `verifyWriteToken` 参照）、書き込み認証の主体は `verifyEdgeToken`（`is_verified=true` チェック）である。write_token は使い捨てで書き込み後は null になるが、Web UI ユーザーは write_token を使わない。専ブラユーザーが 10 分以内に再度 Turnstile を手動で通過して write_token を再取得する操作は、正当な認証行為と区別がつかない。

さらに **Turnstile を「通過すれば」という条件**が再現条件として挙げられているが、Turnstile は外部の CAPTCHA サービスであり、スタブが常に true を返すのはテスト環境限定の話である。本番環境では Turnstile を毎回通過させること自体が非自明なコストであり、攻撃の現実的な難度は高い。

`is_verified=true` のユーザーが既に書き込み可能な状態であることを考えると、再認証で得られるものは専ブラ向け write_token の再発行のみであり、セキュリティ上の実害はない。データ損失・セキュリティ侵害・サービス停止のいずれにも該当しない。

---

## ATK-009-2: edgeToken フィールドの入力長制限なし

**判定: REJECT**

**根拠:**

指摘の核心は「任意の文字列が Supabase クエリ `eq("token_id", tokenId)` の引数になる」という点である。以下の理由で実害は発生しない。

**SQLインジェクション脅威について:** Supabase クライアント（PostgREST）はパラメータバインディングを使用しており、`eq(column, value)` の第2引数はエスケープされてクエリに埋め込まれる。文字列値が SQL として解釈されることはない。これはフレームワークが保証する責務である。

**「意図しないレコードを引き当てる」について:** `auth_codes.token_id` カラムには実在する edge-token の UUID 文字列のみが格納されている。任意の文字列を渡してもこのカラムとマッチするレコードは存在しない（存在しても正規ユーザーの edge-token が一致した場合のみであり、その UUID を攻撃者が知っていることが前提）。インデックス設計の問題でランダムな文字列が意図しないレコードを返すケースは、B-Tree/Hash インデックスでは発生しない。

**長大文字列・DoS について:** 数MB規模の文字列を送信された場合、Next.js の `req.json()` パース段階またはネットワーク層（Vercel のリクエストサイズ制限）で弾かれる可能性が高い。仮にパースが通ったとしても、Supabase クエリの WHERE 句に長大な文字列リテラルが渡されることでクエリ処理が僅かに遅延するだけで、サービス停止には至らない。この種の DoS 対策はリクエストサイズ制限（インフラ層）・レートリミット（Cloudflare 層）が担う責務であり、アプリケーション層で長さバリデーションを追加することは防御的改善ではあるが、現状の欠如がサービス停止・データ損失・セキュリティ侵害を引き起こすとは言えない。

UUID フォーマット検証の追加は堅牢性向上として有益だが、現状で再現可能な実害が存在しないため REJECT とする。

---

## ATK-009-3: G1 シナリオのテスト検証不足

**判定: ACCEPT**

**根拠:**

攻撃レポートの分析は正確であり、テストが G1 の本来の振る舞いを検証できていない。

Given ステップ（`authentication.steps.ts:801-821`）は `issueEdgeToken` のみを呼び出し、`issueAuthCode` を呼んでいない。この状態でユーザーが書き込みを送信すると、`resolveAuth`（`post-service.ts:237-281`）内のフローは以下のようになる:

1. `verifyEdgeToken` が呼ばれる → `user.isVerified=false` のため `not_verified` を返す。
2. `not_verified` ブランチ（`post-service.ts:265-271`）: `issueAuthCode(ipHash, edgeToken)` を呼ぶ。
3. `issueAuthCode` 冒頭で `deleteUnverifiedByTokenId(edgeToken)` を呼ぶ（`auth-service.ts:261`）。
4. テストでは auth_code レコードが存在しないため delete は空振り。
5. 新規 auth_code が作成され、`authRequired` が返る。

テストはこの `authRequired` 応答が返ることを検証し PASS するが、これは `not_found` ブランチ（`post-service.ts:274-280`）でも全く同じ応答が返るため、**`not_verified` ブランチが削除されてもテストはグリーンのまま**となる。

具体的に検証できていない振る舞い:
- 既存の edge-token が維持されること（`not_found` では新規 edge-token が発行される）
- `deleteUnverifiedByTokenId` による重複防止が機能すること
- `not_verified` 時に `issueEdgeToken` が呼ばれないこと

修正方法: Given ステップで `issueAuthCode` も呼び出し（`issueEdgeToken` 後に auth_code を作成して `verified=false` の状態にする）、かつ Then ステップで「返却された edgeToken が元の edge-token と同一であること（新規発行されていないこと）」を追加検証する必要がある。

これはテスト未検出の実装欠陥であり、`not_verified` ブランチの実装を壊しても CI が通過するという問題が現に存在するため ACCEPT とする。
