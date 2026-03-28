---
task_id: TASK-312
sprint_id: Sprint-115
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-25T04:00:00+09:00
updated_at: 2026-03-25T04:00:00+09:00
locked_files:
  - src/lib/infrastructure/supabase/client.ts
  - src/lib/services/registration-service.ts
  - src/__tests__/lib/services/registration-service.test.ts
  - features/support/in-memory/supabase-client.ts
---

## タスク概要

`loginWithEmail` がService層から `@supabase/supabase-js` の `createClient` を直接importしているレイヤー規約違反を修正し、テスト失敗8件（vitest 4 + BDD 4）を解消する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-311/security_review_loginWithEmail.md` — セキュリティレビュー結果と推奨修正方針（§3に具体的なコード差分あり）
2. [必須] `src/lib/services/registration-service.ts` — 修正対象（L212-247 loginWithEmail）
3. [必須] `src/lib/infrastructure/supabase/client.ts` — ファクトリ関数の追加先
4. [参考] `src/__tests__/lib/services/registration-service.test.ts` — テストモック修正
5. [参考] `features/support/in-memory/supabase-client.ts` — BDD用インメモリ実装

## 修正内容（TASK-311のレビュー結果に基づく）

### Step 1: `client.ts` にファクトリ関数を追加

```typescript
/**
 * 認証専用の使い捨てクライアントを生成する。
 *
 * signInWithPassword はクライアントのセッション状態を変更するため、
 * シングルトン supabaseAdmin で呼ぶとセッション汚染が発生する。
 * この関数は anon key + persistSession: false で使い捨てクライアントを返す。
 *
 * See: admin-user-repository.ts createAuthClient()（同一パターン）
 */
export function createAuthOnlyClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

### Step 2: `registration-service.ts` の修正

- `import { createClient } from "@supabase/supabase-js"` を削除
- `import { supabaseAdmin } from "../infrastructure/supabase/client"` に `createAuthOnlyClient` を追加
- `loginWithEmail` 内の `createClient(process.env.SUPABASE_URL ?? "", ...)` を `createAuthOnlyClient()` に置換

### Step 3: テストモック修正

**vitest (`registration-service.test.ts`):**
- 既存の `vi.mock("../../../lib/infrastructure/supabase/client")` に `createAuthOnlyClient` のモックを追加
- `createAuthOnlyClient` は `{ auth: mockSupabaseAuth }` を返すようにする

**BDD (`features/support/in-memory/supabase-client.ts`):**
- `createAuthOnlyClient` のエクスポートを追加（インメモリ版）
- BDDのモック登録（`register-mocks.js` 等）が `createAuthOnlyClient` をカバーすることを確認

## 完了条件
- [ ] `registration-service.ts` から `@supabase/supabase-js` の直接importが除去されている
- [ ] `npx vitest run` で loginWithEmail 4件を含む全テストPASS
- [ ] `npx cucumber-js` で user_registration 関連4件を含む全テストPASS（pending除く）
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外
- `admin-user-repository.ts` の同様のリファクタ（優先度低、別タスク）
- loginWithEmail 以外のサービス関数の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全4ステップ完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/infrastructure/supabase/client.ts` に `createAuthOnlyClient()` ファクトリ関数を追加
2. `src/lib/services/registration-service.ts` から `@supabase/supabase-js` の直接 import を削除し、`createAuthOnlyClient` に置換
3. `src/__tests__/lib/services/registration-service.test.ts` の `vi.mock` に `createAuthOnlyClient` モックを追加
4. `features/support/in-memory/supabase-client.ts` に `createAuthOnlyClient()` エクスポートを追加
5. `features/support/register-mocks.js` の `supabaseClientMock.exports` に `createAuthOnlyClient` を追加

### テスト結果サマリー

**vitest:**
- 修正前: 6件 FAILED (loginWithEmail 4件 + bbs-cgi-response 2件)
- 修正後: 2件 FAILED (bbs-cgi-response 2件のみ — タスクスコープ外の既存失敗)
- loginWithEmail 4件: PASS

**BDD (Cucumber):**
- 344 scenarios (16 pending, 328 passed)
- 1822 steps (16 pending, 37 skipped, 1769 passed)
- FAILED: 0件
- 16 pending は Discord OAuth 関連の想定済み保留（本タスクのスコープ外）
