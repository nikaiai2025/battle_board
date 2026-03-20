# Sprint-23 計画書

> 作成日: 2026-03-16

## 目的

Phase 2 実装着手前のドキュメント・スキーマ不整合（GAP-1〜7）を解消し、コーディングAIが迷いなく実装に着手できる状態にする。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-063 | bdd-architect | GAP-1〜7 解消方針の検討・提案 | なし | completed |
| TASK-064 | bdd-architect | D-08更新（GAP-6確定・GAP-7パース仕様追記） | TASK-063 | completed |
| TASK-065 | bdd-architect | スキーマ・仕様書更新（GAP-1,2,3,4,5） | TASK-063 | completed |
| TASK-066 | bdd-coding | Post型追加に伴うTSビルドエラー修正（56件） | TASK-065 | completed |

## 結果

| TASK_ID | ステータス | 成果物 |
|---|---|---|
| TASK-063 | completed | `tmp/workers/bdd-architect_TASK-063/gap_resolution_proposal.md` |

### TASK-063 結果サマリー
GAP-7のみ解消済み、GAP-1〜6は未解消。人間の判断4点を確認済み。

### TASK-064 結果サマリー
D-08 command.md §4「1レス1コマンド」確定化、§2.3 command-parser解析仕様追加。

### TASK-065 結果サマリー
GAP-1〜5 全件解消。OpenAPI/Post型/DB定義/D-05/D-06/D-07/config更新完了。

### Feature変更（オーケストレーター直接実施）
command_system.feature に「1レスに複数のコマンドが含まれる場合は先頭のみ実行される」シナリオを追加（人間承認済み）。
