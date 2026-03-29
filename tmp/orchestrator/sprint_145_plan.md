# Sprint-145: BOTインフラ修正（スケジューラ復活 + hiroyukiプロファイル同期）

> 開始: 2026-03-29

## スコープ

BOT挙動異常の調査で判明した2件のインフラ問題を修正する。

1. bot-scheduler.yml の schedule トリガー復活（3/21以降停止中）
2. bot-profiles.ts に hiroyuki プロファイル追加（yaml との同期漏れ）

※ collect-topics INSERT ユニーク制約違反は、話題A（キュレーション仕様変更）と一緒に修正するためスコープ外。

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-371 | bot-scheduler.yml schedule復活 + bot-profiles.ts hiroyuki追加 | bdd-coding | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-371 | `.github/workflows/bot-scheduler.yml`, `config/bot-profiles.ts` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-371 | completed | bot-scheduler schedule復活 + hiroyukiプロファイル追加。vitest 2224 PASS |
