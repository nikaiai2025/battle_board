# Sprint-37 計画

> 開始日: 2026-03-17
> ステータス: completed

## スプリント目標

管理機能拡充②: ユーザー管理API + ダッシュボードAPI + 管理画面UI の実装。
admin.featureにユーザー管理3シナリオ + ダッシュボード2シナリオを追加（人間承認済み）。

## 背景

- 計画書: `tmp/feature_plan_admin_expansion.md` §4〜6（人間承認済み）
- Sprint-36でBAN + 通貨付与の基盤は実装済み
- 既存のAdminServiceにユーザー管理・ダッシュボード機能を追加

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-107 | bdd-coding | ユーザー管理 + ダッシュボード API（feature追加 + DB + Repository + Service + API + BDD） | なし | `features/admin.feature`, `features/step_definitions/admin.steps.ts`, `[NEW] supabase/migrations/00011_daily_stats.sql`, `src/lib/infrastructure/repositories/user-repository.ts`, `[NEW] src/lib/infrastructure/repositories/post-repository.ts`, `[NEW] src/lib/infrastructure/repositories/daily-stats-repository.ts`, `src/lib/services/admin-service.ts`, `[NEW] src/app/api/admin/users/route.ts`, `[NEW] src/app/api/admin/users/[userId]/route.ts`, `[NEW] src/app/api/admin/users/[userId]/posts/route.ts`, `[NEW] src/app/api/admin/dashboard/route.ts`, `[NEW] src/app/api/admin/dashboard/history/route.ts`, `[NEW] scripts/aggregate-daily-stats.ts` |
| TASK-108 | bdd-coding | 管理画面UI全ページ（レイアウト + ダッシュボード + ユーザー一覧/詳細 + IP BAN管理） | TASK-107 | `[NEW] src/app/(web)/admin/layout.tsx`, `[NEW] src/app/(web)/admin/page.tsx`, `[NEW] src/app/(web)/admin/users/page.tsx`, `[NEW] src/app/(web)/admin/users/[userId]/page.tsx`, `[NEW] src/app/(web)/admin/ip-bans/page.tsx` |

## 実行順序

TASK-108はAPIが存在する前提のUI実装のため、TASK-107完了後に起動。

```
TASK-107 (API全般) → TASK-108 (管理画面UI)
```

## 完了条件

- [x] admin.feature ユーザー管理3シナリオ全PASS
- [x] admin.feature ダッシュボード2シナリオ全PASS
- [x] 管理画面UIが動作（ダッシュボード/ユーザー一覧・詳細/IP BAN管理）
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js` 0 failed
- [x] `npm run build` 成功

## 最終テスト結果

- vitest: 39ファイル / 1047テスト / 全PASS
- cucumber-js: 228シナリオ (219 passed, 9 pending) / 0 failed
  - admin.feature ユーザー管理: 3シナリオ全PASS（TASK-107新規）
  - admin.feature ダッシュボード: 2シナリオ全PASS（TASK-107新規）
- npm run build: 成功（管理画面5ページ含む）

## 結果欄

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-107 | completed | ユーザー管理+ダッシュボード API（Repository+Service+API+BDD 5シナリオ+15テスト+日次集計スクリプト） |
| TASK-108 | completed | 管理画面UI 5ページ（layout+dashboard+users一覧/詳細+IP BAN管理） |
