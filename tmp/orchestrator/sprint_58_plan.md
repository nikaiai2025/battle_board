# Sprint-58: BOT本番稼働ブロッカー解消（seedデータCI化 + createBotServiceバグ修正）

> 開始: 2026-03-19
> ステータス: completed

## 背景

BOTスケジューラー（GitHub Actions cron）のインフラは Sprint-54 で構築済みだが、以下2つのブロッカーにより本番でBOT書き込みが実行されない状態。

1. **botsテーブルにレコードがない**: マイグレーションでテーブルは作成済みだがINSERTがない。cronが動いても投稿対象0件
2. **createBotService() に createPostFn/threadRepository が未注入**: executeBotPost() が即座にエラーを投げる

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-161 | 荒らし役ボットseedマイグレーション作成 + createBotServiceバグ修正 | bdd-coding | - | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-161 | [NEW] supabase/migrations/00016_seed_arashi_bot.sql, src/lib/services/bot-service.ts, src/__tests__/lib/services/bot-service.test.ts |

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-161 | seedマイグレーション作成（冪等INSERT）+ createBotService() に threadRepository/createPostFn 注入。テスト41件PASS、全体1269件PASS |

### デプロイ
- Vercel: ● Ready（cac50ff）
- Cloudflare: 変更なし（Workers側に影響する変更なし）
- migrate.yml: mainプッシュにより 00016_seed_arashi_bot.sql が自動適用される
