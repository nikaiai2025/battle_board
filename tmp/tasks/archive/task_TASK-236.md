---
task_id: TASK-236
sprint_id: Sprint-83
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-236
depends_on: []
created_at: 2026-03-21T16:00:00+09:00
updated_at: 2026-03-21T16:00:00+09:00
locked_files: []
---

## タスク概要

ウェルカムシーケンス（welcome.feature）、CF Cron移行（TDR-013）、通貨v5変更の実装に必要なコンポーネント設計を行う。
後続の実装スプリントでbdd-codingが作業できる粒度まで設計を具体化し、タスク分解案も含めて出力する。

## 対象BDDシナリオ
- `features/welcome.feature` 全シナリオ（ウェルカムシーケンス ①②③）
- `features/currency.feature` @初期通貨（v5: 登録時0）

## 必読ドキュメント（優先度順）
1. [必須] `features/welcome.feature` — 実装対象シナリオ（初回書き込み検出、ボーナス、システムメッセージ、チュートリアルBOT）
2. [必須] `features/currency.feature` — v5変更（初期通貨50→0）
3. [必須] `tmp/migration_cf_cron.md` — CF Cron移行計画（Phase A〜C の詳細タスクリスト・実施順序）
4. [必須] `docs/architecture/architecture.md` — §12.2 定期ジョブ、TDR-010/013
5. [必須] `docs/architecture/components/posting.md` — PostService 設計（初回書き込み検出の追加先）
6. [必須] `docs/architecture/components/bot.md` — BotService 設計（チュートリアルBOT Strategy追加）
7. [必須] `docs/architecture/components/currency.md` — CurrencyService 設計（初期通貨変更、ボーナス付与）
8. [必須] `docs/architecture/components/command.md` — コマンドパイプライン（!w のBOT実行対応）
9. [参考] `docs/specs/openapi.yaml` — 既存API仕様
10. [参考] `src/lib/services/` — 既存サービス実装（実現可能性確認用）
11. [参考] `wrangler.toml` — 現在のCF Workers設定

## 設計対象

### 1. CF Cron scheduled ハンドラ（Phase A）
- OpenNext/Cloudflare Workers での `scheduled` イベントハンドラの統合方法
- `WORKER_SELF_REFERENCE` バインディングを使った self-fetch 方式の具体的実装
- `wrangler.toml` への cron triggers 設定
- GitHub Actions `bot-scheduler.yml` の変更（AI API使用BOTフィルタ追加）
- 荒らし役BOTの既存テストへの影響分析

### 2. 初回書き込み検出 + ウェルカムシーケンス同期部分（Phase B）
- PostService への初回書き込み検出ロジック追加（「ユーザーの書き込み件数 == 0」判定）
- ① 初回書き込みボーナス +50 のレス内マージ表示（CurrencyService連携）
- ② ウェルカムメッセージの独立システムレス投稿
- 仮ユーザー→本登録昇格時に非発動とする制御
- currency.feature v5 対応（登録時の初期通貨を50→0に変更）

### 3. チュートリアルBOT（Phase C）
- pending_tutorials の仕組み（DB設計: テーブル or ユーザーフラグ）
- `bot_profiles.yaml` への `tutorial` プロファイル追加
- チュートリアルBOT Strategy 設計（BotStrategy インターフェース準拠）
- スポーン→書き込み→`!w`コマンド実行フロー
- `isBotWrite=true` でのコマンドパイプライン動作確認ポイント
- 撃破報酬の固定+20（elimination-reward.ts）
- daily-maintenance での撃破済みBOTクリーンアップ
- 日次リセットでの復活除外

### 4. DB変更
- 必要なマイグレーション（テーブル追加 or カラム追加）を一覧化
- Supabase マイグレーションファイルの設計

### 5. ドキュメント更新
- D-08 `bot.md` への追記内容（チュートリアルBOTライフサイクル、CF Cron実行パス）

### 6. 実装タスク分解案
- 後続スプリント用のタスク分解案（TASK_ID仮番、依存関係、locked_files案）
- Phase A → B → C の依存関係に基づく実施順序

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-236/design.md` — 上記全項目を含むコンポーネント設計書

## 完了条件
- [ ] welcome.feature 全シナリオの実装パスが設計されている
- [ ] CF Cron scheduled ハンドラの統合方式が具体的に記述されている
- [ ] DB変更（マイグレーション）が一覧化されている
- [ ] 実装タスク分解案が依存関係付きで提示されている
- [ ] 既存テストへの影響が分析されている

## スコープ外
- コードの実装（本タスクは設計のみ）
- マイページ拡張（TASK-237で別途設計）
- BDDシナリオの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全項目
- 次にすべきこと: なし（レビュー待ち）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-21 設計完了

**読み込んだドキュメント:**
- welcome.feature, currency.feature (v5), tmp/migration_cf_cron.md
- D-07 architecture.md (§12.2, TDR-010, TDR-013)
- D-08 posting.md, bot.md, currency.md, command.md
- 既存実装: post-service.ts, bot-service.ts, currency-service.ts, command-service.ts, bot-strategies/types.ts, strategy-resolver.ts, elimination-reward.ts, bot_profiles.yaml
- wrangler.toml, bot-scheduler.yml, daily-maintenance.yml, route.ts (/api/internal/bot/execute)

**出力:** `tmp/workers/bdd-architect_TASK-236/design.md`

**完了条件チェック:**
- [x] welcome.feature 全シナリオの実装パスが設計されている（§7 マッピング表）
- [x] CF Cron scheduled ハンドラの統合方式が具体的に記述されている（§1.2 self-fetch 方式）
- [x] DB変更（マイグレーション）が一覧化されている（§4）
- [x] 実装タスク分解案が依存関係付きで提示されている（§6、locked_files 付き）
- [x] 既存テストへの影響が分析されている（§1.5）

**主要な設計判断:**
1. scheduled ハンドラは self-fetch 方式（TDR-013 準拠）
2. 初回書き込み検出は PostRepository.countByAuthorId による COUNT クエリ（users テーブルにフラグ追加しない）
3. pending_tutorials は独立テーブル（users フラグではなく）
4. チュートリアルBOT Strategy は BotStrategy インターフェース準拠（TutorialContentStrategy / TutorialBehaviorStrategy / ImmediateSchedulingStrategy）
5. 撃破報酬の固定 +20 は bot_profiles.yaml の base_reward=20, daily_bonus=0, attack_bonus=0 で実現（elimination-reward.ts 修正不要）
6. BOT の !w コマンド実行は PostInput.botUserId 追加で対応（BDD シナリオがコマンドパイプライン経由を要求するため）

### テスト結果サマリー
<!-- 設計タスクのため該当なし -->
