# Sprint-120 計画: !newspaper 403修正 + welcome bot !w 診断修正

> 作成: 2026-03-26

## 背景

本番(CF Workers)で2件のバグ報告:
1. `!newspaper` が反応しない — GitHub workflow_dispatch が HTTP 403 で失敗（User-Agentヘッダ不足）
2. ウェルカムBOTの `!w` がレス内マージされない — Sprint-119 FK修正済みだが別のレイヤーで失敗

## スコープ

| TASK_ID | 内容 | 担当 | locked_files |
|---|---|---|---|
| TASK-317 | !newspaper 403修正 (User-Agent追加) | bdd-coding | `src/lib/infrastructure/adapters/github-workflow-trigger.ts` |
| TASK-318 | welcome bot !w 診断ログ追加 + 原因修正 | bdd-coding (Opus) | `src/lib/services/post-service.ts`, `src/lib/services/handlers/grass-handler.ts` |

## 依存関係

TASK-317 と TASK-318 は独立（locked_files 重複なし）→ 並行実行可能

## 結果

| TASK_ID | ステータス | 結果 |
|---|---|---|
| TASK-317 | | |
| TASK-318 | | |
