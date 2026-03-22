---
task_id: TASK-277
sprint_id: Sprint-101
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_277
depends_on: []
created_at: 2026-03-23T01:30:00+09:00
updated_at: 2026-03-23T01:30:00+09:00
locked_files: []
---

## タスク概要

`features/command_livingbot.feature` の14シナリオを実装するための設計書を作成する。
!livingbot コマンド（生存BOT数表示）とラストボットボーナス（最後のBOT撃破時の特別イベント）の2機能。

## 対象BDDシナリオ
- `features/command_livingbot.feature` — 14シナリオ全て

## 設計で決めるべきこと

### 1. 生存BOTカウントロジック
featureファイルのカウントルール:
- A. is_active=true かつ定期活動BOT（荒らし役等）→ 常時カウント
- B. is_active=true かつスレッド固定BOT（tutorial/aori）のうち、書き込み先スレッドがアクティブ（is_dormant=false）なもの
- 「スレッド固定BOT」の判別: bot_profile_key in ('tutorial', 'aori')

設計課題:
- SQLクエリ設計（bots LEFT JOIN threads で is_dormant を判定？ BOTのスレッド情報はどこに持つ？）
- 既存の `bot-repository.ts` に追加するメソッドのインターフェース
- InMemory実装（BDDテスト用）

### 2. !livingbot ハンドラ設計
- 新規ハンドラ: `livingbot-handler.ts`
- コスト: 5、引数なし、レス内マージ表示
- 出力: "🤖 掲示板全体の生存BOT: N体"
- commands.yaml への追加

### 3. ラストボットボーナス設計
- !attack による撃破後、生存BOTが0体になったら発火
- +100ボーナス付与 + ★システム祝福メッセージ
- **1日1回制限の状態管理**: テーブル設計 or 既存テーブル拡張
  - 案A: `daily_events` テーブル新設（event_type, triggered_date, triggered_by）
  - 案B: 既存テーブルにフラグカラム追加
  - 案C: KVS/Cache（Supabaseの場合は不適）
- 翌日リセット（日次リセットで制限解除）
- 統合先: attack-handler.ts? bot-service.ts? 別の場所?

### 4. BDDステップ定義の設計
- 14シナリオ分の Given/When/Then ステップ
- InMemory BOT Repository の拡張（カウントメソッド対応）
- InMemory スレッド状態管理（is_dormant のテスト用制御）

## 必読ドキュメント（優先度順）
1. [必須] `features/command_livingbot.feature` — 全14シナリオ
2. [必須] `features/bot_system.feature` — 攻撃・撃破・日次リセットの既存シナリオ
3. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — 既存BOTリポジトリ
4. [必須] `src/lib/services/handlers/attack-handler.ts` — 攻撃ハンドラ（ラストボットボーナス統合先候補）
5. [必須] `src/lib/services/bot-service.ts` — BOTサービス
6. [必須] `docs/architecture/components/bot.md` — BOTコンポーネント設計
7. [参考] `config/commands.yaml` — コマンドレジストリ
8. [参考] `src/lib/domain/models/bot.ts` — BOTモデル型定義
9. [参考] `features/support/in-memory/` — InMemory実装群
10. [参考] `src/lib/infrastructure/repositories/thread-repository.ts` — スレッド休眠判定
11. [参考] `docs/specs/bot_state_transitions.yaml` — BOT状態遷移

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_277/livingbot_design.md` — 設計書
  - §1: 生存BOTカウントロジック（SQLクエリ設計、Repository メソッド設計）
  - §2: !livingbot ハンドラ設計（DI、commands.yaml追加、出力フォーマット）
  - §3: ラストボットボーナス設計（状態管理、統合方法、DB設計）
  - §4: BDDステップ定義設計（ステップ一覧、InMemory拡張）
  - §5: 実装タスク分解（TASK-278用のlocked_files確定含む）

## 完了条件
- [ ] 設計書が `artifacts_dir` に出力されている
- [ ] TASK-278（実装タスク）に必要な情報が全て含まれている

## スコープ外
- 実装作業（TASK-278で実施）
- BDDシナリオの変更（人間承認済み。変更不要のはず）
- bot_system.feature の既存シナリオの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 設計書出力、自己反省による修正
- 次にすべきこと: なし（TASK-278 実装待ち）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-23 設計実施
1. 必読ドキュメント全件読了（feature 14シナリオ、bot_system.feature、bot-repository.ts、attack-handler.ts、bot-service.ts、bot.md、commands.yaml、bot.ts モデル、InMemory実装群、thread-repository.ts）
2. 設計書 `tmp/workers/bdd-architect_277/livingbot_design.md` を出力（5セクション）
3. 自己反省を実施。以下の修正を反映:
   - InMemory `countLivingBots` のデフォルト動作を明確化（ストアベースのカウントをデフォルトとし、ラストボットボーナスの撃破→count=0 が自然に動作するよう設計）
   - `IDailyEventRepository` インターフェース定義と BotService コンストラクタへの DI 追加を明記

#### 主要な設計判断
- **countLivingBots**: 区分A（定期活動BOT）と区分B（スレッド固定BOT）を分離した2クエリ方式。区分Bは bot_posts→posts→threads の3テーブルJOIN
- **1日1回制限**: `daily_events` テーブル新設。event_type+event_date のユニーク制約で保証。日次リセット処理不要
- **InMemory**: デフォルトはストアベースカウント、オーバーライドはスレッド休眠テスト用。SQLの正確性は単体テストで保証
- **AttackHandler統合**: 撃破成功時にBotService.checkLastBotBonusを呼び出し、trueならcredit+祝福メッセージ。既存のeliminationNoticeパターンを踏襲
