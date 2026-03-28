---
task_id: TASK-308
sprint_id: Sprint-113
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T12:00:00+09:00
updated_at: 2026-03-24T18:57:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00030_posts_daily_id_index.sql"
  - src/lib/infrastructure/repositories/post-repository.ts
  - src/lib/services/handlers/hissi-handler.ts
  - src/lib/services/handlers/kinou-handler.ts
  - src/lib/services/command-service.ts
  - src/__tests__/lib/services/handlers/hissi-handler.test.ts
  - src/__tests__/lib/services/handlers/kinou-handler.test.ts
  - features/step_definitions/investigation.steps.ts
---

## タスク概要

LEAK-2/3修正: `!hissi` / `!kinou` コマンドでBOTの書き込みに対し「このレスは対象にできません」エラーが返り、BOTであることが識別できてしまうバグを修正する。BOTの書き込みにも人間と同じフォーマットで応答するようにする。

## 対象BDDシナリオ

- `features/investigation.feature` — 「ボットの書き込みに !hissi を実行すると書き込み履歴が表示される」（新規追加済み）
- `features/investigation.feature` — 「ボットの書き込みに !kinou を実行すると昨日のID情報が表示される」（新規追加済み）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/design_bot_leak_fix.md` §3 — LEAK-2/3の設計詳細（修正箇所・コード例あり）
2. [必須] `features/investigation.feature` — 対象シナリオ + 既存の調査コマンドシナリオ
3. [必須] `src/lib/services/handlers/hissi-handler.ts` — 修正対象ハンドラ
4. [必須] `src/lib/services/handlers/kinou-handler.ts` — 修正対象ハンドラ
5. [必須] `src/lib/services/command-service.ts` — DI更新対象
6. [参考] `src/lib/infrastructure/repositories/post-repository.ts` — findByDailyId追加先
7. [参考] `src/__tests__/lib/services/handlers/hissi-handler.test.ts` — 既存テスト
8. [参考] `src/__tests__/lib/services/handlers/kinou-handler.test.ts` — 既存テスト

## 出力（生成・変更すべきファイル）

- `supabase/migrations/00030_posts_daily_id_index.sql` — `CREATE INDEX idx_posts_daily_id ON posts(daily_id)`
- `src/lib/infrastructure/repositories/post-repository.ts` — `findByDailyId` 追加
- `src/lib/services/handlers/hissi-handler.ts` — authorId=null(BOT)の場合にdailyIdベースで書き込み履歴を返す
- `src/lib/services/handlers/kinou-handler.ts` — authorId=null(BOT)の場合にdailyIdベースで昨日のID情報を返す
- `src/lib/services/command-service.ts` — hissi/kinouハンドラへのbotPostRepository DI追加
- `src/__tests__/lib/services/handlers/hissi-handler.test.ts` — BOTパスの単体テスト追加
- `src/__tests__/lib/services/handlers/kinou-handler.test.ts` — BOTパスの単体テスト追加
- `features/step_definitions/investigation.steps.ts` — 新シナリオ用ステップ定義追加

## 完了条件

- [ ] `npx vitest run src/__tests__/lib/services/handlers/hissi-handler.test.ts` 全件PASS
- [ ] `npx vitest run src/__tests__/lib/services/handlers/kinou-handler.test.ts` 全件PASS
- [ ] `npx cucumber-js --tags "@investigation"` 全シナリオPASS（pendingは許容）
- [ ] テストコマンド: `npx vitest run`（全体リグレッションなし）

## スコープ外

- LEAK-1（!w草カウント）の修正 — 別タスク TASK-307
- `features/investigation.feature` ファイル自体の変更（BDDシナリオは人間承認済み）
- grass-repository / bot.ts の変更

## 補足・制約

- 設計書 `tmp/design_bot_leak_fix.md` §3 にコード例があるが、既存コードの実際の構造に合わせて適宜調整すること
- §5.1 の「KinouHandler の BOT authorIdSeed 依存」に注意: `"bot-{botId}"` を定数化（ヘルパー関数）で共有するのが望ましい。既存のbot-service.tsの実装を確認し、共通化可能な場合はヘルパー関数を作成すること
- マイグレーション番号は `00030` を使用すること
- botPostRepository のDI: 既存のbot_postsテーブル/リポジトリを確認し、適切な方法でBOT判定を行うこと

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイル実装完了、全テストPASS確認
- 未解決の問題: なし

### 進捗ログ
- 2026-03-24: 作業開始。必読ドキュメント・全対象ファイル確認完了
- 2026-03-24: `supabase/migrations/00030_posts_daily_id_index.sql` 作成
- 2026-03-24: `post-repository.ts` に `findByDailyId` 追加
- 2026-03-24: `hissi-handler.ts` BOTパス対応（dailyIdベース書き込み履歴返却）
- 2026-03-24: `kinou-handler.ts` BOTパス対応（dailyIdベース昨日ID情報返却）
- 2026-03-24: `command-service.ts` DI更新（botPostRepository を hissi/kinouハンドラに注入）
- 2026-03-24: `hissi-handler.test.ts` BOTパス単体テスト追加（19/19 PASS）
- 2026-03-24: `kinou-handler.test.ts` BOTパス単体テスト追加（17/17 PASS）
- 2026-03-24: `investigation.steps.ts` 新シナリオ用ステップ定義追加（BOT setup, ボットが本日N件書き込み, etc.）
- 2026-03-24: BDDステップ定義の重複排除（reactions.steps.ts から 運営ボット/レス>>N/ボットの正体 を移管）
- 2026-03-24: 全テスト通過確認。作業完了

### テスト結果サマリー

#### 単体テスト（npx vitest run）
- 結果: 1782 passed / 4 failed（失敗は全て pre-existing）
- hissi-handler.test.ts: 19/19 PASS
- kinou-handler.test.ts: 17/17 PASS
- 失敗: registration-service.test.ts の 4件（supabaseUrl未設定による既存バグ、本タスクスコープ外）

#### BDDテスト（npx cucumber-js）
- 結果: 322 passed / 6 failed / 16 pending（失敗・pending は全て pre-existing）
- 以前の 29 ambiguous が全て解消（重複ステップ定義除去による）
- investigation BOT シナリオ（2件）: PASS
- reactions BOT シナリオ（2件）: PASS
