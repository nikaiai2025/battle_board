# Sprint-96 計画書

> 開始: 2026-03-22

## 目標

!aori コマンド実装（BOT召喚 + 非同期キュー + 使い切りBOTライフサイクル）

## 背景

練習コマンド③。BOT cron修正（Sprint-93 TASK-263 + Sprint-95 TASK-268）が本番で動作確認済みとなり、ブロッカー解除。
非同期キュー（pending_async_commands）の初実装であり、④!newspaperの前提基盤となる。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-269 | bdd-architect | !aori設計詳細化（pending_async_commandsスキーマ + Cron統合 + AoriHandler設計） | なし | assigned |
| TASK-270 | bdd-coding | !aori実装（ハンドラ + Repository + Cron + 煽り文句 + BDD 7シナリオ + 単体テスト） | TASK-269 | pending |

### 競合管理

直列実行（TASK-270はTASK-269の設計出力に依存）。

### TASK-269 locked_files
- `[NEW] tmp/workers/bdd-architect_269/aori_design.md`

### TASK-270 locked_files（予定。設計出力に応じて調整）
- `[NEW] src/lib/services/handlers/aori-handler.ts`
- `[NEW] src/lib/infrastructure/repositories/pending-async-command-repository.ts`
- `[NEW] config/aori-taunts.ts`
- `[NEW] supabase/migrations/00023_pending_async_commands.sql`
- `[NEW] features/step_definitions/command_aori.steps.ts`
- `[NEW] src/__tests__/lib/services/handlers/aori-handler.test.ts`
- config/commands.yaml
- config/commands.ts
- src/lib/services/command-service.ts
- src/app/api/internal/bot/execute/route.ts
- src/lib/services/bot-service.ts

## 結果

### TASK-269: !aori設計詳細化
- 出力: `tmp/workers/bdd-architect_269/aori_design.md`（全9章）
- pending_async_commands 汎用テーブル設計、AoriHandler、Cron統合、使い切りBOT、煽り文句、InMemoryテスト

### TASK-270: !aori実装
- 新規6ファイル: マイグレーション, Repository, Handler, 煽り文句100件, BDDステップ, 単体テスト
- 変更8ファイル: commands.yaml/ts, command-service.ts, bot-service.ts, route.ts, bot-repository.ts, bot-profiles
- InMemory対応4ファイル
- エスカレーション2件（いずれもlocked_files漏れ、自律解決）
- 設計修正: isActive=false→true（AttackHandlerが!isActiveを撃破済みと判定するため）
- rawArgs: CommandContextに追加（optional化で既存テスト互換維持）
- テスト: BDD 308シナリオ(292 passed, 16 pending) / vitest 82 passed / AoriHandler 16件PASS

### デプロイ・スモーク
- Vercel: Ready ✅
- Cloudflare Workers: 2026-03-22T09:41:11Z ✅
- 本番スモーク: 30/35 PASS（5 skipped = ローカル限定）✅
- コミット: 69c80fb
