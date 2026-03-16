---
task_id: TASK-095
sprint_id: Sprint-33
status: completed
assigned_to: bdd-coding
depends_on: [TASK-094]
created_at: 2026-03-16T13:00:00+09:00
updated_at: 2026-03-16T13:00:00+09:00
locked_files:
  - "src/lib/services/command-service.ts"
  - "[NEW] src/lib/services/bot-service.ts"
  - "[NEW] src/lib/services/handlers/attack-handler.ts"
  - "[NEW] src/lib/domain/rules/elimination-reward.ts"
  - "[NEW] src/lib/domain/rules/__tests__/elimination-reward.test.ts"
  - "[NEW] src/__tests__/lib/services/bot-service.test.ts"
  - "[NEW] src/__tests__/lib/services/handlers/attack-handler.test.ts"
  - "src/__tests__/lib/services/command-service.test.ts"
  - "config/commands.yaml"
  - "src/lib/domain/models/currency.ts"
---

## タスク概要
Bot system v5 のサービス層を実装する。BotService の拡張（applyDamage, calculateEliminationReward, canAttackToday, recordAttack, performDailyReset等）、AttackHandler（CommandHandler実装）の新規作成、CommandServiceへの !attack コマンド登録、commands.yaml への attack エントリ追加を行う。

## 対象BDDシナリオ
- `features/未実装/bot_system.feature` — 全シナリオ（本タスクはサービス層実装。BDDステップ定義は後続TASK-096）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/bot.md` — D-08 v5（§2 公開インターフェース全体）
2. [必須] `docs/architecture/components/attack.md` — D-08 v1（§3 処理フロー、§6 設計判断）
3. [必須] `docs/specs/bot_state_transitions.yaml` — D-05 v5（状態遷移・撃破報酬計算式）
4. [必須] `features/未実装/bot_system.feature` — BDDシナリオ（振る舞いの正本）
5. [参考] `src/lib/services/command-service.ts` — 既存CommandService（ハンドラ登録パターン）
6. [参考] `src/lib/services/handlers/tell-handler.ts` — 既存TellHandler（CommandHandler実装パターン）
7. [参考] `src/lib/services/accusation-service.ts` — 既存AccusationService（サービスパターン参照）
8. [参考] `src/lib/services/currency-service.ts` — 通貨操作API

## 入力（前工程の成果物）
- `src/lib/domain/models/bot.ts` — TASK-094で更新済み（timesAttacked, botProfileKey追加）
- `src/lib/infrastructure/repositories/bot-repository.ts` — TASK-094で拡張済み
- `src/lib/infrastructure/repositories/attack-repository.ts` — TASK-094で新規作成済み
- `config/bot_profiles.yaml` — TASK-094で作成済み
- `features/support/in-memory/attack-repository.ts` — TASK-094で作成済み

## 出力（生成すべきファイル）
- `src/lib/domain/rules/elimination-reward.ts` — 撃破報酬計算の純粋関数
- `src/lib/services/bot-service.ts` — BotService（applyDamage, isBot, getBotByPostId, revealBot, canAttackToday, recordAttack, calculateEliminationReward, performDailyReset等）
- `src/lib/services/handlers/attack-handler.ts` — AttackHandler（CommandHandler実装）
- `src/lib/services/command-service.ts` — !attack ハンドラ登録追加
- `config/commands.yaml` — attack エントリ追加
- `src/lib/domain/models/currency.ts` — DeductReason に 'command_attack' 追加（必要な場合）
- 単体テスト（elimination-reward, bot-service, attack-handler）

## 完了条件
- [ ] BotService が D-08 bot.md §2 の公開インターフェース（§2.1〜§2.11）を実装している
- [ ] AttackHandler が D-08 attack.md §3 の処理フロー（共通前処理・フローB・フローC）を実装している
- [ ] commands.yaml に attack エントリ（cost:5, damage:10, compensation_multiplier:3）が追加されている
- [ ] CommandService が !attack ハンドラを登録し、ディスパッチできる
- [ ] 撃破報酬計算が `base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus)` で正しく計算される
- [ ] エラーケース: 通貨不足、撃破済み攻撃、同日2回目、存在しないレス、自己攻撃、システムメッセージ攻撃が全て処理される
- [ ] 賠償金: 人間攻撃時に cost(5) + compensation(15) が正しく処理される。残高不足時は全額支払い
- [ ] 不意打ち攻撃: lurking状態ボットへの攻撃で revealBot → applyDamage の連鎖が正しく動作する
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] 既存テスト全件PASS（回帰なし）

## スコープ外
- BDDステップ定義の作成（TASK-096）
- bot_system.feature ファイルの移動（TASK-096）
- executeBotPost, selectTargetThread の完全実装（GitHub Actions連携はPhase 3。スタブ的な実装で可）
- performDailyReset の GitHub Actions cron 統合（スケジューラ設定はPhase 3）

## 補足・制約
- AttackHandler は TellHandler と同様のパターンで実装する（CommandHandler インターフェース準拠）
- CommandService のコンストラクタで AttackHandler をインスタンス化し Registry に登録する
- AttackHandler は BotService, CurrencyService, PostRepository（レス存在確認）に依存する。DIパターンで注入可能にする
- D-08 attack.md §3.1: CommandService の共通前処理（通貨チェック）は既存の仕組みを使う。ただし !attack は「対象がBOTの場合のみコスト消費」「人間の場合もコスト消費」と両方コスト消費するため、CommandService側で先にコスト消費するのではなく、AttackHandler内でコスト消費タイミングを制御する必要がある点に注意。
  - 具体的には: CommandService の通貨チェック（残高 >= cost）は行うが、実際のdebitはAttackHandler内で行う。エラーケース（撃破済み、同日2回目等）ではdebitしない
  - この設計を実現するため、CommandServiceの既存フローを調整する必要がある場合はコメントで方針を記載すること
- D-08 attack.md §6.6: BOTマーク付きレスへの攻撃でも「同一ボットへの攻撃」として1日1回制限。制限の単位はレスではなくボット
- 撃破報酬パラメータは bot_profiles.yaml から読み込む（TASK-094で作成済み）
- bot_profiles.yaml の読み込みは fs.readFileSync + yaml parse（commands.yaml と同じパターン）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [完了] ドキュメント読み込み（bot.md, attack.md, bot_state_transitions.yaml, bot_system.feature）
- [完了] elimination-reward.ts 実装（純粋関数・テスト12件）
- [完了] BotService 実装（isBot, getBotByPostId, revealBot, applyDamage, calculateEliminationReward, canAttackToday, recordAttack, performDailyReset, getDailyId, executeBotPost(stub), selectTargetThread(stub)）テスト26件
- [完了] AttackHandler 実装（フローB・フローC・エラーケース全対応）テスト23件
- [完了] CommandService 更新（attack ハンドラ登録・skipDebit 機構・attack用DI引数追加）
- [完了] config/commands.yaml に attack エントリ追加（cost:5, damage:10, compensation_multiplier:3）
- [完了] DeductReason に 'command_attack' は既に存在していることを確認（変更不要）
- [完了] 全テスト PASS（950件、回帰なし）

### テスト結果サマリー
- 実行: `npx vitest run`
- 結果: 34テストファイル / 950テスト全件 PASS
- 新規追加:
  - `src/lib/domain/rules/__tests__/elimination-reward.test.ts`: 12件 PASS
  - `src/__tests__/lib/services/bot-service.test.ts`: 26件 PASS
  - `src/__tests__/lib/services/handlers/attack-handler.test.ts`: 23件 PASS
- 回帰: 0件（既存890件は変更なしですべて PASS）
