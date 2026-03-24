# Sprint-112 計画: 管理者課金ステータス変更機能

> 作成日: 2026-03-24

## 目的

管理者がユーザーの有料/無料ステータスをUI上で切り替えられるようにする。
課金トラブル時の対応手段として使用。

## 背景

- `admin.feature` v4 に2シナリオ追加済み（人間承認済み）
- 既存の管理者操作（BAN/通貨付与）と同一パターンで実装可能
- API・BDDステップ・UIの全レイヤーが新規

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-301 | Backend: API + Service + Repository + BDDステップ + 単体テスト | bdd-coding | なし | `[NEW] src/app/api/admin/users/[userId]/premium/route.ts`, `src/lib/services/admin-service.ts`, `src/lib/infrastructure/repositories/user-repository.ts`, `features/step_definitions/admin.steps.ts`, `[NEW] src/__tests__/lib/services/admin-premium.test.ts` |
| TASK-302 | Frontend: 管理画面ユーザー詳細ページに課金ステータス切り替えUI追加 | bdd-coding | TASK-301 | `src/app/(web)/admin/users/[userId]/page.tsx` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-301 | assigned | |
| TASK-302 | pending | TASK-301完了後に開始 |
