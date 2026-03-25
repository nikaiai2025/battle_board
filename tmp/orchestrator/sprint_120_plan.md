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
| TASK-317 | completed | User-Agent ヘッダ追加。テスト11件PASS。本番確認済み |
| TASK-318 | completed | 14件の統合テスト追加（全PASS）。診断ログ追加。本番で正常動作確認済み |

## テスト結果

- vitest: 1891テスト 全PASS（+14件）
- cucumber-js: 331 passed / 16 pending（変更なし）
- 本番スモーク: 29/34 PASS（5件設計スキップ）

## デプロイ後確認

- コミット: dbb7b74
- CF Workers デプロイ: 2026-03-25 22:36 UTC
- `!newspaper`: GitHub workflow trigger 正常動作（403解消）
- `!w` welcome bot: チュートリアルBOT正常発動・コマンド効果（レス内マージ）確認
- `[BOT-DIAG]` ログでパイプライン全段の正常通過を確認

## 備考

- `!w` の根本修正はSprint-119（isBotGiver フラグ）。Sprint-120はCFの再デプロイによりワーカーインスタンスがリフレッシュされ、問題が解消したと推測
- 診断ログ `[BOT-DIAG]` はBOT書き込み時のみ発火するため、再発検知用に当面残置
