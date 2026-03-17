# Sprint-35 計画

> 開始日: 2026-03-17
> ステータス: completed

## スプリント目標

固定スレッド（案内板）+ 開発連絡板（dev板）の実装。
thread.featureにシナリオ追加し、DB・Service・UI・専ブラを対応する。

## 背景

- 計画書: `tmp/feature_plan_pinned_thread_and_dev_board.md`（アーキテクト作成済み・人間承認済み）
- 既存のboardIdパラメータ化済みアーキテクチャの上に構築（大規模改修不要）

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-103 | bdd-coding | thread.featureにシナリオ追加 + DB（is_pinned）+ PostServiceガード + 固定スレッド生成スクリプト + BDDステップ定義 | なし | `features/thread.feature`, `features/step_definitions/thread.steps.ts`, `supabase/migrations/00009_pinned_thread.sql [NEW]`, `src/lib/services/post-service.ts`, `src/lib/domain/models/thread.ts`, `src/lib/infrastructure/repositories/thread-repository.ts`, `scripts/upsert-pinned-thread.ts [NEW]` |
| TASK-104 | bdd-coding | dev板（boardIdハードコード解消 + Web UI + bbsmenu追加 + SETTING.TXT対応） | なし | `src/app/api/threads/route.ts`, `src/app/(web)/dev/ [NEW]`, `src/app/(senbra)/bbsmenu.html/route.ts`, `src/app/(web)/threads/[threadId]/page.tsx`, `src/app/(web)/components/ThreadCreateForm.tsx` |

## 実行順序

TASK-103とTASK-104はlocked_filesが重複しないため並行起動可能。

```
TASK-103 (固定スレッド) ← 並行可 → TASK-104 (dev板)
```

## 完了条件

- [ ] thread.feature 固定スレッドシナリオ全PASS
- [ ] 固定スレッドがスレッド一覧の先頭に表示される
- [ ] 固定スレッドへの書き込みが拒否される
- [ ] dev板でスレッド一覧・作成・書き込みが動作する
- [ ] bbsmenuにdev板が表示される
- [ ] 既存テスト全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 0 failed

## 最終テスト結果

- vitest: 37ファイル / 1016テスト / 全PASS
- cucumber-js: 214シナリオ (205 passed, 9 pending) / 0 failed
  - thread.feature @pinned_thread: 3シナリオ全PASS（新規）
- npm run build: 成功（/dev ルート含む）

## 結果欄

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-103 | completed | 固定スレッド（is_pinned + ガード + スクリプト + BDD 3シナリオ + 11テスト） |
| TASK-104 | completed | dev板（boardIdハードコード解消 + Web UI + bbsmenu + SETTING.TXT） |
