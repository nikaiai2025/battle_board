---
sprint_id: Sprint-137
status: completed
created_at: 2026-03-28
---

# Sprint-137 計画書 — createBotService DI 欠落ホットフィックス

## 背景・目的

Sprint-136 でキュレーションBOT（curation_newsplus）を実装したが、
`createBotService()` ファクトリ関数に `createThreadFn` と `collectedTopicRepository` が未注入のまま本番デプロイされた。

その結果、CF Workers cron が `/api/internal/bot/execute` を呼ぶたびに
`"resolveStrategies: behavior_type='create_thread' には collectedTopicRepository が必要です"` エラーが発生し、
`next_post_at` も更新されないためエラーが毎回繰り返される状態になっている。

## スコープ

| TASK_ID | 担当 | 内容 | ステータス |
|---------|------|------|-----------|
| TASK-354 | bdd-coding | `createBotService()` に `createThread` と `collectedTopicRepository` を注入 | pending |

## locked_files

- `src/lib/services/bot-service.ts`

## 完了条件

- `npx vitest run` 全件 PASS（回帰なし）
- `npx cucumber-js` 既存 PASS 数維持
- CF デプロイ後スモークテスト PASS

## 結果

| TASK_ID | 結果 | 備考 |
|---------|------|------|
| TASK-354 | completed | vitest 2084 PASS / cucumber-js 373 PASS / 本番スモーク 17/17 PASS |
