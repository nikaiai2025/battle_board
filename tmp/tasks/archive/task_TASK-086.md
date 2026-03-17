---
task_id: TASK-086
sprint_id: Sprint-31
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-086
depends_on: []
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - docs/architecture/components/bot.md
  - docs/specs/bot_state_transitions.yaml
  - "[NEW] docs/architecture/components/attack.md"
---

## タスク概要

bot_system.feature v5 の大幅改訂に基づき、設計ドキュメント（D-08 bot.md / D-05 bot_state_transitions.yaml）を更新する。
v2→v5で以下の新概念が導入されたため、既存の設計ドキュメントは大幅に古く全面改訂が必要。

### v5で導入された主な変更点
1. **!attack コマンド新設**: BOTマークの有無に関わらず任意レスに攻撃可能
2. **賠償金システム**: 人間への攻撃時に攻撃コスト+賠償金（コスト3倍）が発生
3. **不意打ちによるBOTマーク付与**: !tell 経由だけでなく !attack でも lurking→revealed 遷移
4. **荒らし役HP変更**: 30→10（即死級チュートリアルMob）
5. **10体並行稼働**: 固定文ランダム書き込み、1-2時間間隔
6. **撃破報酬計算式の具体化**: `base_reward + (survival_days × daily_bonus) + (times_attacked × attack_bonus)`
7. **日次リセットで撃破復活**: eliminated→lurking 遷移追加
8. **同一ボット1日1回攻撃制限**
9. **!tell はコスト消費のみ・報酬なし**: 告発成功ボーナス・冤罪ボーナスを廃止

## 対象BDDシナリオ
- `features/未実装/bot_system.feature` @v5 — 全35シナリオ
- `features/ai_accusation.feature` @v4 — 参照のみ（!tell と !attack の関係理解用）

## 必読ドキュメント（優先度順）
1. [必須] `features/未実装/bot_system.feature` — v5全文（正本）
2. [必須] `features/ai_accusation.feature` — v4全文（!tell側の設計意図）
3. [必須] `docs/architecture/components/bot.md` — 現行D-08（v2ベース、要全面改訂）
4. [必須] `docs/specs/bot_state_transitions.yaml` — 現行D-05（v2ベース、要全面改訂）
5. [参考] `docs/architecture/architecture.md` — アーキテクチャ全体
6. [参考] `docs/architecture/components/accusation.md` — AccusationServiceとの連携
7. [参考] `docs/architecture/components/command.md` — CommandService基盤
8. [参考] `docs/requirements/ubiquitous_language.yaml`

## 入力（前工程の成果物）
- `features/未実装/bot_system.feature` v5 — 人間が承認済みのBDDシナリオ
- `features/ai_accusation.feature` v4 — 人間が承認済み

## 出力（生成すべきファイル）
- `docs/architecture/components/bot.md` — D-08 改訂（v5対応）
- `docs/specs/bot_state_transitions.yaml` — D-05 改訂（v5対応）
- `docs/architecture/components/attack.md` — D-08 新規（AttackService/AttackHandler設計）※分離が妥当な場合
- `tmp/workers/bdd-architect_TASK-086/design_notes.md` — 設計判断メモ（実装スプリントへの申し送り事項）

## 完了条件
- [ ] D-08 bot.md が bot_system.feature v5 の全シナリオをカバーする設計になっている
- [ ] D-05 bot_state_transitions.yaml が v5 の状態遷移（lurking/revealed/eliminated + 日次リセット復活）を正確に反映
- [ ] !attack の設計（AttackService or 既存コンポーネント拡張）が明確に定義されている
- [ ] 賠償金システムの設計（CurrencyServiceとの連携）が定義されている
- [ ] 撃破報酬計算式がD-05に具体的数値で記載されている
- [ ] DB変更が必要な場合、マイグレーション方針が記載されている
- [ ] 設計判断メモに実装時の注意事項・未決事項が記載されている

## スコープ外
- コード実装（設計ドキュメントのみ）
- ai_accusation.feature のコード変更（TASK-087が担当）
- OpenAPI仕様の詳細記述（実装スプリントで行う）
- config/bot_profiles.yaml の具体的内容定義

## 補足・制約
- D-05の `lurking→revealed` 遷移に「!attack経由」を追加すること（!tell経由に加えて）
- D-05の状態遷移図を更新すること（eliminated→lurkingの日次リセット復活を追加）
- 荒らし役HP=10, 10体構成を反映すること
- D-08 bot.md の既存インターフェース（executeBotPost, applyDamage, isBot, getDailyId）はv5で変更が必要か検討すること
- 新規にAttackService/AttackHandlerを分離するか、既存BotService/CommandServiceに統合するかはアーキテクト判断に委ねる

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全成果物作成済み
- 次にすべきこと: なし（レビュー待ち）
- 未解決の問題: 設計判断メモ SS3 に記載（5件の未決事項）

### 進捗ログ

#### 2026-03-16 作業開始
1. 必読ドキュメントを全て読了
   - bot_system.feature v5 (35シナリオ)
   - ai_accusation.feature v4 (8シナリオ)
   - 既存 bot.md, bot_state_transitions.yaml (v2ベース)
   - architecture.md, accusation.md, command.md, ubiquitous_language.yaml

2. D-05 bot_state_transitions.yaml を v5 に全面改訂
   - 3状態（lurking/revealed/eliminated）+ 7遷移を定義
   - !attack 経由の lurking->revealed 遷移を追加
   - eliminated->lurking の日次リセット復活遷移を追加
   - 撃破報酬計算式を具体数値で記載
   - 賠償金システム・攻撃制限セクションを新設
   - 荒らし役: HP 30->10, 10体並行稼働を反映

3. D-08 bot.md を v5 に全面改訂
   - 公開インターフェースを 2.1-2.11 に拡張
   - getBotByPostId(), revealBot(), canAttackToday(), recordAttack(), performDailyReset() 等を追加
   - attacks テーブル（新規）のスキーマ定義
   - bots テーブルへの times_attacked, bot_profile_key カラム追加
   - マイグレーション方針を記載

4. D-08 attack.md を新規作成
   - AttackHandler を CommandHandler 準拠の独立ハンドラとして設計
   - フローB（対象がBOT）/ フローC（対象が人間）の詳細フロー
   - エラーケース一覧、トランザクション設計を記載
   - commands.yaml への !attack エントリ定義

5. 設計判断メモを作成
   - 主要判断3件の根拠
   - 実装時注意事項6件
   - 未決事項6件
   - BDDシナリオカバレッジ確認

6. 自己反省を実施
   - D-05 の不意打ち遷移に times_attacked +1 の記載漏れを修正

### 成果物一覧
- `docs/specs/bot_state_transitions.yaml` -- D-05 v5 全面改訂
- `docs/architecture/components/bot.md` -- D-08 v5 全面改訂
- `docs/architecture/components/attack.md` -- D-08 新規（AttackHandler設計）
- `tmp/workers/bdd-architect_TASK-086/design_notes.md` -- 設計判断メモ

### テスト結果サマリー
N/A（設計ドキュメントタスク）
