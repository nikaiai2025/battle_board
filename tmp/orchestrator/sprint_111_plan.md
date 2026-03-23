# Sprint-111: 管理画面UI + バグ修正 + 非同期コマンド即時トリガー

> 開始日: 2026-03-24
> ステータス: completed
> スモークテスト: 29/34 PASS（5件ローカル限定skip）
> コミット: ecd81eb (TASK-298), cebd451 (TASK-299, TASK-300)

## 背景

1. 管理者がスレッドやレスを削除するAPIは実装済みだが、管理画面にUIが存在しない
2. チュートリアルBOTの `!w` コマンドが本番環境で機能しないバグ（コマンドパーサーの後方引数優先ルールによるサイレント失敗）
3. 非同期コマンド（`!newspaper`等）のpending INSERT後にGitHub Actionsを即時起動する仕組みが未実装（最大30分の遅延）

## タスク分解

| TASK_ID | 担当 | 概要 | depends_on | model |
|---|---|---|---|---|
| TASK-298 | bdd-coding | Admin threads管理ページ（API + UI + ナビ更新） | - | sonnet |
| TASK-300 | bdd-coding | !w コマンドバグ修正（本文改行分割） | - | sonnet |
| TASK-299 | bdd-coding | 非同期コマンド即時トリガー（workflow_dispatch） | - | sonnet |

### locked_files

- TASK-298:
  - `[NEW] src/app/api/admin/threads/route.ts`
  - `src/app/api/admin/threads/[threadId]/route.ts`
  - `[NEW] src/app/(web)/admin/threads/page.tsx`
  - `src/app/(web)/admin/layout.tsx`
  - `src/lib/infrastructure/repositories/thread-repository.ts`
- TASK-300:
  - `features/welcome.feature`
  - `src/lib/services/bot-strategies/content/tutorial.ts`
  - `src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts`
  - `src/__tests__/lib/services/post-service-welcome-sequence.test.ts`
  - `docs/architecture/components/bot.md`
  - `features/step_definitions/welcome.steps.ts`
- TASK-299:
  - `[NEW] src/lib/infrastructure/adapters/github-workflow-trigger.ts`
  - `src/lib/services/command-service.ts`
  - `.github/workflows/newspaper-scheduler.yml`
  - `.github/workflows/ci-failure-notifier.yml`
  - `[NEW] src/__tests__/lib/infrastructure/adapters/github-workflow-trigger.test.ts`

## 結果

| TASK_ID | ステータス | 結果サマリー |
|---|---|---|
| TASK-298 | completed | Admin threads管理UI実装完了。vitest 1747 PASS, tsc clean |
| TASK-300 | completed | !wコマンドバグ修正。本文改行分割で後方引数問題回避。vitest 1747 PASS, cucumber 339 PASS |
| TASK-299 | completed | workflow_dispatch即時トリガー実装。cron 4h化。CI notifier権限修正。vitest 1758 PASS |
