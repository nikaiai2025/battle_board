---
sprint_id: Sprint-157
status: in_progress
created_at: 2026-05-30
---

# Sprint-157 計画

## 目標

BOT書き込み頻度を10分の1に削減 + スレッド保持数を50→20件に縮小。

## 承認済みBDD変更（人間承認: 2026-05-30）

| feature | 変更内容 |
|---|---|
| `features/bot_system.feature` | 荒らし役投稿間隔 1〜2時間 → 10〜20時間 |
| `features/human_mimic_bot.feature` | 人間模倣ボット投稿間隔 1〜2時間 → 10〜20時間 |
| `features/curation_bot.feature` | キュレーションBOT投稿間隔 12〜24時間 → 120〜240時間 |
| `features/thread.feature` | スレッド一覧保持数 50件 → 20件 |

## タスク一覧

| TASK_ID | 担当 | 内容 | 状態 |
|---|---|---|---|
| TASK-401 | bdd-coding | BOT投稿間隔×10 + スレッド保持数50→20 | assigned |

## 結果

（完了後に記録）
