---
task_id: TASK-269
sprint_id: Sprint-96
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_269
depends_on: []
created_at: 2026-03-22T17:00:00+09:00
updated_at: 2026-03-22T17:00:00+09:00
locked_files:
  - "[NEW] tmp/workers/bdd-architect_269/aori_design.md"
---

## タスク概要

!aori コマンド（煽りBOT召喚）の実装に必要な設計詳細化を行う。非同期キュー（pending_async_commands）テーブルスキーマ、Cron処理の統合設計、AoriHandler の実装仕様を `aori_design.md` に出力する。

## 対象BDDシナリオ
- `features/command_aori.feature` @全7シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/command_aori.feature` — 対象シナリオ（7件）
2. [必須] `docs/architecture/components/command.md` §5 — 非同期副作用のキューイングパターン
3. [必須] `tmp/orchestrator/practice_commands_implementation_guide.md` §3 — !aori実装スコープ
4. [参考] `src/lib/infrastructure/repositories/pending-tutorial-repository.ts` — 参考実装（pending_tutorials パターン）
5. [参考] `src/app/api/internal/bot/execute/route.ts` — 現行Cron処理（拡張先）
6. [参考] `src/lib/services/bot-service.ts` — BOTスポーン処理
7. [参考] `src/lib/services/command-service.ts` — CommandExecutionResult型（ステルス関連フィールド既存）
8. [参考] `tmp/workers/bdd-architect_265/iamsystem_design.md` — ステルス基盤の設計（再利用する部分）
9. [参考] `config/commands.yaml` — 現行コマンド設定

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_269/aori_design.md` — 設計書

## 設計で確定すべき事項

### 1. pending_async_commands テーブルスキーマ
- D-08 command.md §5 準拠: `command_type` カラムで種別区別する汎用テーブル
- 必要カラム: id, command_type, thread_id, target_post_number, invoker_user_id, created_at, payload(JSONB?)
- ④!newspaper でも再利用するため、汎用的に設計する
- マイグレーションSQL（`00023_pending_async_commands.sql`）を設計に含める

### 2. AoriHandler の実装仕様
- 同期処理部分: pending_async_commands にINSERT + ステルス結果を返す
- CommandHandlerResult の拡張が必要か？（非同期キューイング指示の伝達方法）
- pending INSERT はハンドラ内で直接行うか、CommandService経由か

### 3. Cron処理の統合設計
- 既存の `/api/internal/bot/execute` route.ts に Step として追加するか、別エンドポイントか
- CF Cron Triggers に配置（TDR-013準拠: AI API不使用のため）
- 処理フロー: pending読取 → BOTスポーン（使い切り設定）→ 煽り文句投稿 → pending削除
- BotService に `processAoriCommands()` メソッドを追加するか

### 4. 使い切りBOT のライフサイクル
- BOTのis_active=false（定期書き込みなし）をどう実現するか
- 日次リセットで復活しない設計（bulkReviveEliminatedからの除外条件）
- bot_profiles.yaml に煽りBOT定義が必要か、動的生成か

### 5. 煽り文句セット
- 100件を `config/aori-taunts.ts` に配置
- ランダム選択のロジック
- フォーマット: `>>{target_post_number} {煽り文句}` をBOTの書き込み本文とする

### 6. InMemoryテスト対応
- `features/support/in-memory/` に PendingAsyncCommandRepository の InMemory 版が必要
- BDDステップで使用する Cron 処理のモック戦略

## スコープ外
- ④!newspaper の AI API クライアント設計（次スプリント）
- 煽り文句100件の実際のテキスト作成（コーディングタスクで実施）

## 完了条件
- [ ] `aori_design.md` が上記6項目を網羅している
- [ ] マイグレーションSQLのドラフトが含まれている
- [ ] コーディングタスク（TASK-270）が着手可能な粒度になっている

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6項目（テーブルスキーマ / AoriHandler / Cron統合 / 使い切りBOT / 煽り文句 / InMemoryテスト）
- 次にすべきこと: TASK-270（コーディング）に引き渡し
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-22 設計完了

**出力:** `tmp/workers/bdd-architect_269/aori_design.md`（全9章）

**主要な設計判断:**

1. **pending_async_commands**: 汎用テーブル。command_type + payload(JSONB) で !newspaper にも再利用可能。マイグレーション SQL を 00023 番で作成
2. **AoriHandler**: pending INSERT をハンドラ内で直接実行（AttackHandler の BotService DI と同パターン）
3. **Cron 統合**: 既存 `/api/internal/bot/execute` の Step 5 として追加（processPendingTutorials と同パターン）
4. **使い切り BOT**: `is_active=false` + `next_post_at=null` で定期書き込みを抑止。`bulkReviveEliminated` の除外条件に `aori` を追加
5. **煽り文句**: `config/aori-taunts.ts` に100件を配置（bot_profiles の fixed_messages とは分離）
6. **InMemory テスト**: InMemory PendingAsyncCommandRepository を新規作成。Cron 処理は BotService.processAoriCommands() を直接呼び出し

**Supabase フィルタ構文に関する注意:** `bulkReviveEliminated` の `.or()` フィルタで `.not.in.(tutorial,aori)` が動作するか実装時に検証が必要（代替: `.neq` を複数連結）
