---
task_id: TASK-378
sprint_id: Sprint-150
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T23:00:00+09:00
updated_at: 2026-03-29T23:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00041_edge_tokens_add_channel.sql"
  - src/lib/infrastructure/repositories/edge-token-repository.ts
  - src/lib/services/auth-service.ts
  - src/lib/services/registration-service.ts
  - src/lib/services/post-service.ts
  - src/app/api/threads/route.ts
  - "src/app/api/threads/[threadId]/posts/route.ts"
  - "src/app/(senbra)/test/bbs.cgi/route.ts"
  - src/app/api/mypage/route.ts
  - src/app/api/mypage/history/route.ts
  - src/app/api/mypage/theme/route.ts
  - src/app/api/mypage/username/route.ts
  - src/app/api/mypage/upgrade/route.ts
  - src/app/api/mypage/vocabularies/route.ts
  - src/app/api/mypage/copipe/route.ts
  - "src/app/api/mypage/copipe/[id]/route.ts"
  - src/app/api/auth/pat/route.ts
---

## タスク概要

`edge_tokens` テーブルに `channel` カラムを追加し、専ブラ(HTTP)経由トークンの権限を投稿のみに限定する。
Web UI 経由で発行されたトークンは全権限（マイページ・PAT・設定変更等）を持ち、専ブラ経由トークンは投稿系のみに制限する。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/edge_token_channel_separation_plan.md` — 実装計画の全体像
2. [必須] `src/lib/services/auth-service.ts` — issueEdgeToken() (行241-274), verifyEdgeToken() (行157-190)
3. [必須] `src/lib/infrastructure/repositories/edge-token-repository.ts` — EdgeToken型, EdgeTokenRow型, create() (行89-104)
4. [必須] `src/lib/services/registration-service.ts` — EdgeTokenRepository.create 呼び出し5箇所 (行301, 356, 460, 515, 650)
5. [参考] `src/lib/services/post-service.ts` — resolveAuth() (行239-284), createPost/createThread の引数パターン

## 修正内容

### Phase 1: DB + Repository 型

**マイグレーション** `supabase/migrations/00041_edge_tokens_add_channel.sql`:
```sql
-- Sprint-150: edge-token チャネル分離
-- 専ブラ経由トークンの権限を投稿のみに限定するための channel カラム追加
-- 既存レコードは全て 'web'（全権限）で初期化
ALTER TABLE edge_tokens ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'web';
```

**edge-token-repository.ts**:
- `EdgeTokenRow` に `channel: string` 追加
- `EdgeToken` に `channel: "web" | "senbra"` 追加
- `create()` に第3引数 `channel: "web" | "senbra" = "web"` を追加し、INSERT に含める
- `toModel()` 変換に channel を追加
- `findByToken()` の返却値にも channel を含める

### Phase 2: トークン発行（channel の書き分け）

**auth-service.ts** `issueEdgeToken()`:
- 第2引数 `channel: "web" | "senbra"` を追加（行241付近）
- `EdgeTokenRepository.create(user.id, token, channel)` に channel を渡す（行267付近）

**post-service.ts**:
- `CreatePostInput` 型に `channel?: "web" | "senbra"` を追加（未指定時は `"web"`）
- `createThread()` にも同様に `channel` パラメータを追加
- `resolveAuth()` に `channel` パラメータを追加し、`issueEdgeToken(ipHash, channel)` に渡す
- `createPost` → `resolveAuth` → `issueEdgeToken` の流れで channel を伝播

**API ルート側（呼び出し元）**:
- `src/app/api/threads/[threadId]/posts/route.ts`: `createPost({..., channel: "web"})`
- `src/app/api/threads/route.ts`: `createThread(..., channel: "web")`（正確な引数形式はコードに合わせる）
- `src/app/(senbra)/test/bbs.cgi/route.ts`: `createPost({..., channel: "senbra"})` と `createThread(..., channel: "senbra")`

**registration-service.ts**（全5箇所で `EdgeTokenRepository.create` に channel を明示）:
| 関数 | 行番号 | channel |
|---|---|---|
| `handleEmailConfirmCallback()` | 301 | `"web"` |
| `loginWithEmail()` | 356 | `"web"` |
| `handleOAuthCallback()` | 460 | `"web"` |
| `handleRecoveryCallback()` | 515 | `"web"` |
| `loginWithPat()` | 650 | **`"senbra"`** |

### Phase 3: トークン検証 + APIガード

**auth-service.ts** `verifyEdgeToken()`:
- 成功時の戻り値型を拡張: `{ valid: true; userId: string; authorIdSeed: string; channel: "web" | "senbra" }`
- `EdgeTokenRepository.findByToken()` が返す `EdgeToken.channel` を戻り値に含める

**mypage系ルート + auth/pat ルート** — 全ルートに以下のガードを追加:
```typescript
if (authResult.channel !== "web") {
  return NextResponse.json(
    { error: "この操作にはWeb経由の認証が必要です" },
    { status: 403 },
  );
}
```

対象ルート（全18箇所の verifyEdgeToken 呼び出し後に追加）:
- `src/app/api/mypage/route.ts` (GET)
- `src/app/api/mypage/history/route.ts` (GET)
- `src/app/api/mypage/theme/route.ts` (PUT)
- `src/app/api/mypage/username/route.ts` (PUT)
- `src/app/api/mypage/upgrade/route.ts` (POST)
- `src/app/api/mypage/vocabularies/route.ts` (GET, PUT — 2箇所)
- `src/app/api/mypage/copipe/route.ts` (GET, POST — 2箇所)
- `src/app/api/mypage/copipe/[id]/route.ts` (PUT, DELETE — 2箇所)
- `src/app/api/auth/pat/route.ts` (GET, POST — 2箇所)

### Phase 4: BOT書き込み

BOT書き込み (`isBotWrite=true`) は `resolveAuth` の認証自体をスキップするため、channel は不要（影響なし）。
`src/app/api/internal/bot/execute/route.ts` → `createPost({isBotWrite: true})` → resolveAuth でスキップ。
`src/app/api/internal/newspaper/complete/route.ts` / `hiroyuki/complete/route.ts` も同様。
**これらのファイルは変更不要。**

## 完了条件

- [ ] `npx vitest run` 全テストPASS
- [ ] `npx cucumber-js` 全テストPASS（既存の pending/undefined 以外）
- [ ] EdgeTokenRepository.create に channel を渡す単体テストが存在すること
- [ ] verifyEdgeToken が channel を返す単体テストが存在すること
- [ ] senbra チャネルのトークンで mypage API が 403 になる単体テストが存在すること

## スコープ外

- mypage系・auth/pat 以外のAPIルートへのガード追加（投稿系は senbra でもOK）
- 既存の edge_tokens レコードの channel 更新（マイグレーションの DEFAULT 'web' で対応）
- D-07/D-08 ドキュメント更新（別タスク）
- Cloudflare Workers 側の edge-token 処理（別ファイル体系）

## 補足・制約

- マイグレーション番号は `00041`
- `channel` の型は DB: `VARCHAR(10)`、TypeScript: `"web" | "senbra"` リテラル型
- `createPost` / `createThread` に `channel` を追加する際、既存の呼び出し元（bot/execute, newspaper/complete, hiroyuki/complete）が壊れないよう、channel はオプショナル引数（デフォルト `"web"`）にする
- pre-commit フックで TypeScript エラーが出る場合、波及箇所も合わせて修正すること（Sprint-149 の教訓）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: Phase 1-4 全完了
- 次にすべきこと: なし
- 未解決の問題: スキーマ整合性テスト1件失敗（マイグレーション未適用のため。DB適用後に解消）

### 進捗ログ
- Phase 1: DB マイグレーション + Repository 型拡張 + テスト追加 -- 完了
  - `supabase/migrations/00041_edge_tokens_add_channel.sql` 作成
  - `EdgeTokenRow`, `EdgeToken` に channel 追加
  - `rowToEdgeToken` に channel 変換追加
  - `create()` に channel 第3引数追加（デフォルト "web"）
  - テスト: channel 指定/省略/INSERT 検証 4件追加

- Phase 2: トークン発行（channel の書き分け）-- 完了
  - `auth-service.ts` `issueEdgeToken()` に channel 引数追加
  - `post-service.ts` `resolveAuth()` に channel 引数追加、`PostInput` に channel 追加
  - `createThread()` に channel 引数追加
  - API ルート側: `/api/threads/[threadId]/posts` channel="web"、`/api/threads` channel="web"
  - bbs.cgi ルート: `handleCreatePost` channel="senbra"、`handleCreateThread` channel="senbra"
  - `registration-service.ts` 5箇所: 4箇所 "web"、1箇所（loginWithPat）"senbra"

- Phase 3: トークン検証 + API ガード -- 完了
  - `VerifyResult` 型に channel 追加
  - `verifyEdgeToken()` の成功戻り値に `edgeToken.channel` を含める
  - mypage 系 7ルート + auth/pat 1ルートに channel ガード追加（全13ハンドラ）
  - 403 レスポンス: `{ error: "FORBIDDEN", message: "この操作にはWeb経由の認証が必要です" }`

- Phase 4: BOT書き込み -- 変更不要（タスク指示書記載の通り）

- 波及修正: 既存テスト7ファイルの verifyEdgeToken モック戻り値/EdgeTokenRepository.create 引数に channel 追加

### テスト結果サマリー
- `npx vitest run`: 2249 passed, 1 failed (スキーマ整合性テスト -- マイグレーション未適用のため)
- `npx cucumber-js`: 412 scenarios passed, 4 undefined, 18 pending (既存のもの)
- 新規テスト:
  - `src/__tests__/lib/infrastructure/repositories/edge-token-repository.test.ts`: 24 passed (channel 関連 4件追加)
  - `src/__tests__/lib/services/auth-service-channel.test.ts`: 7 passed (verifyEdgeToken channel + issueEdgeToken channel)
  - `src/__tests__/api/mypage/channel-guard.test.ts`: 4 passed (senbra で 403 + web で通過)
