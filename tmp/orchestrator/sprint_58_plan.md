# Sprint-58: BOT本番稼働ブロッカー解消（seedデータCI化 + createBotServiceバグ修正）

> 開始: 2026-03-19
> ステータス: in_progress

## 背景

BOTスケジューラー（GitHub Actions cron）のインフラは Sprint-54 で構築済みだが、以下2つのブロッカーにより本番でBOT書き込みが実行されない状態。

1. **botsテーブルにレコードがない**: マイグレーションでテーブルは作成済みだがINSERTがない。cronが動いても投稿対象0件
2. **createBotService() に createPostFn/threadRepository が未注入**: executeBotPost() が即座にエラーを投げる

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-161 | 荒らし役ボットseedマイグレーション作成 + createBotServiceバグ修正 | bdd-coding | - | assigned |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-161 | [NEW] supabase/migrations/00016_seed_arashi_bot.sql, src/lib/services/bot-service.ts, src/__tests__/lib/services/bot-service.test.ts |

## 結果

（完了後に記載）
