# Sprint-36 計画

> 開始日: 2026-03-17
> ステータス: completed

## スプリント目標

管理機能拡充①: ユーザーBAN / IP BAN / 通貨付与の実装。
admin.featureにシナリオ追加（人間承認済み）し、DB・Repository・Service・API・BDDステップ定義を実装する。

## 背景

- 計画書: `tmp/feature_plan_admin_expansion.md`（アーキテクト作成済み・人間承認済み）
- 既存の管理者認証インフラ（admin_session Cookie、verifyAdminSession）を活用
- 既存のCurrencyService.creditを活用

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-105 | bdd-coding | BAN system（feature追加 + DB migration + Repository + Service + API + BDDステップ） | なし | `features/admin.feature`, `features/step_definitions/admin.steps.ts`, `[NEW] supabase/migrations/00010_ban_system.sql`, `src/lib/domain/models/user.ts`, `src/lib/infrastructure/repositories/user-repository.ts`, `[NEW] src/lib/infrastructure/repositories/ip-ban-repository.ts`, `src/lib/services/auth-service.ts`, `[NEW] src/app/api/admin/users/[userId]/ban/route.ts`, `[NEW] src/app/api/admin/ip-bans/route.ts`, `[NEW] src/app/api/admin/ip-bans/[banId]/route.ts`, `src/app/api/bbs.cgi/route.ts`, `src/app/api/posts/route.ts` |
| TASK-106 | bdd-coding | 通貨付与（feature追加 + API + BDDステップ） | TASK-105 | `features/admin.feature`, `features/step_definitions/admin.steps.ts`, `src/lib/domain/models/currency.ts`, `[NEW] src/app/api/admin/users/[userId]/currency/route.ts` |

## 実行順序

TASK-105とTASK-106はadmin.featureとadmin.steps.tsを共有するため直列実行。

```
TASK-105 (BAN system) → TASK-106 (通貨付与)
```

## 完了条件

- [x] admin.feature BAN関連7シナリオ全PASS
- [x] admin.feature 通貨付与2シナリオ全PASS
- [x] ユーザーBAN / IP BAN の書き込みガードが動作
- [x] 通貨付与APIが動作
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js` 0 failed

## 最終テスト結果

- vitest: 38ファイル / 1032テスト / 全PASS
- cucumber-js: 223シナリオ (214 passed, 9 pending) / 0 failed
  - admin.feature BAN関連: 7シナリオ全PASS（TASK-105新規）
  - admin.feature 通貨付与: 2シナリオ全PASS（TASK-106新規）

## 結果欄

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-105 | completed | BAN system（DB + Repository + Service + API + BDD 7シナリオ + 16テスト） |
| TASK-106 | completed | 通貨付与（CreditReason拡張 + API + BDD 2シナリオ） |
