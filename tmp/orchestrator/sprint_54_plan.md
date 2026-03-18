# Sprint-54: 荒らし役BOT本番稼働 — Internal API + cron基盤

> 開始: 2026-03-19
> ステータス: 実行中

## 背景

HUMAN-001が確定（TDR-010）。荒らし役BOTのビジネスロジックは実装済みだが、本番で動かすためのトリガー（Internal API + GitHub Actions cron）が未実装。本スプリントでこれを実装し、荒らし役BOTを本番稼働可能にする。

## 確定仕様（TDR-010）

- cron間隔: 30分（`0,30 * * * *`）
- 投稿タイミング制御: DB予定時刻方式（`bots.next_post_at`）
- 認証: Bearerトークン（BOT_API_KEY）
- 日次リセット: 15:00 UTC（= 00:00 JST）

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-151 | D-08 bot.md TDR-010反映 | bdd-architect | - | completed |
| TASK-152 | DB + BotService + Internal APIルート + 認証 + テスト | bdd-coding | TASK-151 | assigned |
| TASK-153 | GitHub Actionsワークフロー3本 | bdd-coding | - | assigned |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-152 | supabase/migrations/[NEW], src/lib/services/bot-service.ts, src/lib/infrastructure/repositories/bot-repository.ts, src/app/api/internal/[NEW], src/__tests__関連 |
| TASK-153 | .github/workflows/bot-scheduler.yml, .github/workflows/daily-maintenance.yml |

→ 重複なし。**並行起動可能**

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-151 | D-08 bot.md に TDR-010 反映完了 |
| TASK-152 | DB + BotService + API 3本 + 認証 + テスト40件。vitest 52ファイル/1240テスト全PASS |
| TASK-153 | GitHub Actionsワークフロー2本作成。YAML構文検証OK |

### 人間作業残
- GitHub Secrets登録: `BOT_API_KEY`, `DEPLOY_URL`
- Supabaseマイグレーション適用: `00015_bot_next_post_at.sql`
