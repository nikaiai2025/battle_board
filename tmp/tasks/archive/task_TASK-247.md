---
task_id: TASK-247
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T19:50:00+09:00
updated_at: 2026-03-21T19:50:00+09:00
locked_files:
  - docs/architecture/components/bot.md
  - docs/architecture/components/posting.md
  - docs/architecture/components/currency.md
---

## タスク概要

Sprint-84/85の実装内容を反映するD-08コンポーネント設計書の更新。
実装コードと設計書の乖離を解消する。

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/bot.md` — 更新対象
2. [必須] `docs/architecture/components/posting.md` — 更新対象
3. [必須] `docs/architecture/components/currency.md` — 更新対象
4. [参考] `tmp/workers/bdd-architect_TASK-236/design.md` — 設計内容
5. [参考] `src/lib/services/bot-service.ts` — 実装済みコード

## 更新内容

### bot.md への追記

- チュートリアルBOT Strategy の説明（TutorialContentStrategy, TutorialBehaviorStrategy, ImmediateSchedulingStrategy）
- bot_profiles.yaml の tutorial プロファイル
- processPendingTutorials: スポーンフロー（pending検出 → BOT生成 → 書き込み → pending削除）
- 日次リセットでのチュートリアルBOT復活除外
- 撃破済みチュートリアルBOT クリーンアップ（deleteEliminatedTutorialBots）
- CF Cron + self-fetch 方式による定期実行

### posting.md への追記

- PostService Step 6.5: 初回書き込み検出 + ウェルカムシーケンス
  - countByAuthorId === 0 による検出
  - welcome_bonus +50 (CurrencyService.credit)
  - inlineSystemInfo へのボーナス表示マージ
  - pending_tutorials INSERT
- PostService Step 11.5: ウェルカムメッセージ投稿（★システム名義）
- PostInput.botUserId: BOT書き込み時の resolvedAuthorId 設定

### currency.md への追記

- Currency v5: INITIAL_BALANCE 50 → 0
- CreditReason に "welcome_bonus" 追加
- 初回書き込みボーナス +50 の付与タイミング説明

## 完了条件
- [ ] bot.md にチュートリアルBOT関連の記述が追加されている
- [ ] posting.md にウェルカムシーケンス関連の記述が追加されている
- [ ] currency.md にCurrency v5の変更が反映されている
- [ ] 実装コードとドキュメントの整合性が取れている

## スコープ外
- D-04 OpenAPI更新（HUMAN-004待ち）
- D-07 architecture.md更新（TDR-013は既に記載済み）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: bot.md / posting.md / currency.md 全更新完了
- 未解決の問題: なし

### 進捗ログ
- [x] タスク指示書・必読ドキュメント読み込み
- [x] bot.md（現行版）読み込み
- [x] posting.md（現行版）読み込み
- [x] currency.md（現行版）読み込み
- [x] tmp/workers/bdd-architect_TASK-236/design.md 読み込み
- [x] bot-service.ts / post-service.ts / route.ts 実装確認
- [x] currency.md 更新（ヘッダー v5、CreditReason "welcome_bonus" 追加、§3.2 PostService 追加、§6 新設）
- [x] posting.md 更新（ヘッダー更新、PostInput.botUserId / isSystemMessage 追加、§3.1 CurrencyService / PendingTutorialRepository 追加、§5 ウェルカムシーケンス Step 6.5 / 11.5 追加）
- [x] bot.md 更新（ヘッダー v7、§2.10 チュートリアルBOT除外/Step6追加、§2.12.2 tutorial優先解決、§2.12.3 Tutorial Strategy 3種追加、§2.12.8 ファイル配置更新、§2.13 新設、§3.1 PendingTutorialRepository 追加、§3.2 CF Cron 追加、§5.6 Sprint-85マイグレーション追加、§6.11-6.13 新設）

### テスト結果サマリー
N/A（ドキュメント更新のみ）

### テスト結果サマリー
<!-- N/A（ドキュメント更新のみ） -->
