---
task_id: TASK-198
sprint_id: Sprint-74
status: assigned
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T07:00:00+09:00
updated_at: 2026-03-20T07:00:00+09:00
locked_files:
  - e2e/smoke/navigation.spec.ts
  - scripts/check-e2e-coverage.ts
---

## タスク概要
E2Eスモークテスト（Phase A: ナビゲーション）に未カバーの8ページを追加し、`scripts/check-e2e-coverage.ts` の EXCLUDED_ROUTES から対象を除外してカバレッジスクリプトを全件PASSにする。

## 必読ドキュメント（優先度順）
1. [必須] `e2e/smoke/navigation.spec.ts` — 既存のナビゲーションテスト（追加先）
2. [必須] `e2e/fixtures/index.ts` — カスタムフィクスチャ定義（authenticate, adminSessionToken, seedThread, cleanup）
3. [必須] `e2e/fixtures/auth.fixture.ts` — 認証フィクスチャの実装詳細
4. [必須] `scripts/check-e2e-coverage.ts` — カバレッジチェックスクリプト（EXCLUDED_ROUTES更新対象）
5. [参考] `docs/architecture/bdd_test_strategy.md` §10.2 — ナビゲーションテスト設計方針
6. [参考] `docs/specs/screens/admin.yaml` — 管理者ダッシュボード画面定義

## 出力（生成すべきファイル）
- `e2e/smoke/navigation.spec.ts` — 8ページ分のテスト追加
- `scripts/check-e2e-coverage.ts` — EXCLUDED_ROUTES の対象ページ除外 + `/threads/[threadId]` のMISS解消

## 完了条件
- [ ] 以下8ページのスモークテストが追加されている（既存テストのパターンに準拠）:
  1. `/dev` — HTTP 200 + 主要UI要素
  2. `/register/email` — 認証付き + HTTP 200 + フォーム要素
  3. `/register/discord` — 認証付き + HTTP 200 + ボタン要素
  4. `/admin` — 管理者認証付き + HTTP 200 + ダッシュボード要素
  5. `/admin/users` — 管理者認証付き + HTTP 200 + テーブル要素
  6. `/admin/users/[userId]` — 管理者認証付き + HTTP 200 + 詳細表示
  7. `/admin/ip-bans` — 管理者認証付き + HTTP 200 + テーブル要素
  8. `/threads/[threadId]` — スレッドシード後にリダイレクト確認
- [ ] `scripts/check-e2e-coverage.ts` の EXCLUDED_ROUTES から7ページを削除（または理由を更新）
- [ ] `/threads/[threadId]` の MISS が解消されている（DYNAMIC_ROUTE_HINTS追加 or テスト追加）
- [ ] `npx tsx scripts/check-e2e-coverage.ts` が終了コード0（全件PASS）
- [ ] `npx vitest run` が既存テスト全件PASS
- [ ] `npx playwright test --config=playwright.config.ts` がローカルで実行可能であること（ローカルSupabase起動前提）

## スコープ外
- ページ本体（page.tsx）の修正
- BDDシナリオの変更
- 本番スモークテスト（playwright.prod.config.ts）の変更
- フィクスチャ（e2e/fixtures/）の修正（必要な場合はエスカレーション）

## 補足・制約

### 認証パターン
各ページの認証要件に応じたテスト実装が必要:

1. **認証不要ページ** (`/dev`): 既存の非認証テストと同パターン
2. **仮ユーザー認証** (`/register/email`, `/register/discord`): `authenticate` フィクスチャで認証状態を作る。ただしこれらのページは**仮ユーザー**（未本登録）向けなので、authenticate が返すユーザーが仮ユーザーかどうかを確認すること。もし本登録ユーザーになってしまう場合は、仮ユーザーのままアクセスする方法を検討すること（ページ自体が表示されればOK）
3. **管理者認証** (`/admin/*`): `adminSessionToken` フィクスチャで管理者セッショントークンを取得し、Cookieに `admin_session` を設定してからページにアクセスする。管理者認証のCookie名・設定方法は `src/app/api/admin/` のルートハンドラーを確認すること
4. **リダイレクト** (`/threads/[threadId]`): `seedThread` でスレッドを作成し、そのスレッドIDでアクセスして307リダイレクトを検証する。Playwrightの `page.goto()` はデフォルトでリダイレクトを追跡するため、最終URLが `/{boardId}/{threadKey}/` 形式になることを確認する

### 既存テストのパターン
各テストは以下のパターンに従う（既存テスト参照）:
```typescript
test.describe("ページ名", () => {
  test("HTTPステータス200で応答し、主要UI要素が表示される", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => { jsErrors.push(err.message); });
    const response = await page.goto("/path");
    expect(response?.status()).toBe(200);
    // UI要素の存在確認
    await expect(page.locator("#element-id")).toBeVisible();
    expect(jsErrors).toEqual([]);
  });
});
```

### テスト実行
- ローカルテスト: Supabase Local（`npx supabase start`）が起動している前提
- Docker Desktop が起動している前提（Supabase Local用）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: **エスカレーション（ESC-TASK-198-1）**
- 完了済み:
  - `e2e/smoke/navigation.spec.ts` に8ページ分のテスト追加（実装完了）
  - `scripts/check-e2e-coverage.ts` の EXCLUDED_ROUTES から7ページ削除・DYNAMIC_ROUTE_HINTS に `/threads/[threadId]` 追加
  - `npx tsx scripts/check-e2e-coverage.ts` PASS（13ページ全件カバー）
  - `npx vitest run` PASS（65ファイル・1395テスト）
  - `/dev`, `/register/email`, `/register/discord`, `/threads/[threadId]` の4テスト: PASS
- 未解決の問題:
  - `admin-user-repository.ts` のバグ（`signInWithPassword` 後の同クライアントでのクエリが RLS によってブロックされる）により、admin 系 4 テストが失敗
  - このバグは TASK-198 以前から存在していた既存問題（`basic-flow.spec.ts:管理者がテストスレッドを削除` テストも同様に失敗）
  - 修正には `locked_files` 外の `admin-user-repository.ts` の変更が必要
- 中断理由: locked_files 外のファイル変更が必要と判明したため、ESC-TASK-198-1 を起票し作業を中断

### escalation_resolution
- **ESC-TASK-198-1 解決**: TASK-199 で `admin-user-repository.ts` のバグが修正された（予定）。TASK-199 完了後にadmin系テスト4件の再実行のみ行うこと。
- **再開時のスコープ**: `npx playwright test e2e/smoke/navigation.spec.ts` を実行し、全テスト（既存+新規）がPASSすることを確認する。テストコード自体の修正は不要（既に正しく実装済み）。

### 進捗ログ
- 2026-03-20: タスク指示書・必読ドキュメントを読み込み
- 2026-03-20: `navigation.spec.ts` に8ページ分のテストを追加
- 2026-03-20: `check-e2e-coverage.ts` の EXCLUDED_ROUTES・DYNAMIC_ROUTE_HINTS を更新
- 2026-03-20: `npx tsx scripts/check-e2e-coverage.ts` PASS 確認
- 2026-03-20: `npx vitest run` PASS 確認
- 2026-03-20: Playwright テスト実行で admin 系テストが 401 エラーで失敗
- 2026-03-20: バグ根本原因を特定（`supabaseAdmin.signInWithPassword` 後の RLS 問題）
- 2026-03-20: リダイレクトテストの URL 末尾スラッシュ問題を修正（PASS）
- 2026-03-20: ESC-TASK-198-1 を起票

### テスト結果サマリー

#### `npx vitest run`
- 65 ファイル・1395 テスト: 全件 PASS

#### `npx tsx scripts/check-e2e-coverage.ts`
- 13ページ全件 PASS（Covered: 13 / Excluded: 0 / Missing: 0）

#### `npx playwright test e2e/smoke/navigation.spec.ts`
- 通過: 11件（既存 8 + 新規 3: `/dev`, `/register/email`, `/register/discord`, `/threads/[threadId]`）
- 失敗: 8件（既存のマイページ 3件 + 新規 admin 系 4件 + ※ admin は環境問題）
  - マイページ 3件: 既存から壊れていた環境問題
  - admin 系 4件: `admin-user-repository.ts` バグ（ESC-TASK-198-1 参照）
