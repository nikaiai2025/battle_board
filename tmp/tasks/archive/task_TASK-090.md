---
task_id: TASK-090
sprint_id: Sprint-32
status: done
assigned_to: bdd-architect
depends_on:
  - TASK-086
  - TASK-087
created_at: 2026-03-16T22:00:00+09:00
updated_at: 2026-03-16T22:00:00+09:00
locked_files:
  - docs/architecture/architecture.md
  - docs/architecture/components/accusation.md
  - docs/requirements/ubiquitous_language.yaml
---

## タスク概要

Sprint-31のTASK-086（Bot v5設計）とTASK-087（告発ボーナス廃止）の申し送り事項として、3つのドキュメントの整合性を更新する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-086/design_notes.md` — 設計判断メモ（§3.4, §3.5, §3.6の申し送り事項）
2. [必須] `docs/architecture/components/bot.md` — Sprint-31で改訂済みのD-08 v5
3. [必須] `docs/architecture/components/attack.md` — Sprint-31で新規作成のD-08
4. [必須] `features/ai_accusation.feature` — v4（ボーナス廃止済み）
5. [必須] `features/未実装/bot_system.feature` — v5（!attack等の新概念）

## 出力（変更すべきファイル）

### 1. `docs/architecture/architecture.md` (D-07)
以下のセクションを更新:
- § 3.2 サービス一覧: AttackHandler の追加（CommandService配下のハンドラとして）
- § 4.1 ER図: attacks テーブルの追加
- § 4.2 テーブル定義: attacks テーブルのスキーマ追加
- § 8 日次リセット: attacks テーブルのクリーンアップを追加
- § 11.2 インデックス: attacks テーブルのインデックスを追加
- AccusationService の説明から「ボーナス/冤罪ボーナス」の記述を削除

### 2. `docs/architecture/components/accusation.md` (D-08)
v4でのボーナス廃止を反映:
- `AccusationResult.bonusAmount` → 「v4以降は常に0。互換性のため残存」と注記
- § 3.1 依存先: CurrencyService の「hit時のボーナス付与」を削除（costはCommandServiceが管理するため依存自体を削除）
- § 4 隠蔽する実装詳細: 「ボーナス金額の計算ロジック（miss時の冤罪ボーナス計算を含む）」を削除

### 3. `docs/requirements/ubiquitous_language.yaml` (D-02)
以下の用語を追加・更新:
- 新規: 「攻撃」(!attack) — BOTマーク有無に関わらず任意レスに実行可能。対象がBOTならBOTマーク付与+HP減少、人間なら賠償金発生
- 新規: 「賠償金」(compensation) — !attack で人間を攻撃した際に攻撃者から被攻撃者に支払われるペナルティ通貨
- 更新: 「AI告発」— ボーナス・冤罪ボーナスの記述を削除。コスト消費のみの偵察コマンドに更新
- 更新: 「BOTマーク」— !attack 経由でも付与される旨を追記
- 更新: 「冤罪ボーナス」→ 廃止済みとして注記（v4で削除）
- 変更履歴ヘッダーの更新

## 完了条件
- [x] D-07にattacksテーブル・AttackHandlerが反映されている
- [x] accusation.mdからボーナス関連の記述が除去されている
- [x] D-02に「攻撃」「賠償金」が追加されている
- [x] 既存の正確な記述が損なわれていないこと

## スコープ外
- コード変更
- BDDシナリオ変更
- bot_system.feature のBDD未記載事項（!attack自己攻撃等）への対応

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: D-07, D-08(accusation), D-02 の全更新
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-16 bdd-architect 実施

**D-07 architecture.md 変更内容:**
- SS 3.2 サービス一覧: AccusationService の説明からボーナス/冤罪ボーナスを削除。AttackHandler を追加
- SS 3.3 サービス間依存: AccusationService → CurrencyService の依存を削除。AttackHandler の依存を追加
- Domain Layer: Accusation のボーナス計算記述を削除
- SS 4.1 ER図: attacks テーブルを追加（RLS注記付き）
- SS 4.2 テーブル定義: attacks テーブルスキーマを追加。accusations.bonus_amount に「v4以降は常に0」注記
- SS 7.1 トランザクション: !tell のボーナス付与を削除、!attack の処理詳細を追加
- SS 8 日次リセット: attacks テーブルのクリーンアップを追加
- SS 10.1.1 RLS: attacks テーブルのポリシーを追加
- SS 11.2 インデックス: attacks テーブルの2インデックスを追加
- SS 9 ディレクトリ構成: attack-handler.ts, attack-rules.ts, attack-repository.ts を追加
- 付録A 用語対応表: Attack を追加

**D-08 accusation.md 変更内容:**
- AccusationResult.bonusAmount に「v4以降は常に0。互換性のため残存」注記
- SS 3.1 依存先: CurrencyService を削除。BotService に revealBot() の記述を追加
- SS 4 隠蔽する実装詳細: ボーナス金額の計算ロジック行を削除

**D-02 ubiquitous_language.yaml 変更内容:**
- 変更履歴ヘッダー: 2026-03-16 エントリを追加
- AI告発: ボーナス・冤罪ボーナスの記述を削除、偵察コマンドとしての位置づけに更新
- BOTマーク: !attack 経由でも付与される旨を追記
- 冤罪ボーナス: v4で廃止済みとして注記、賠償金への移管を記載
- 通貨: 獲得手段からAI告発成功報酬・冤罪ボーナスを削除
- ボット撃破: v5フロー（!tell or !attack）に更新、撃破報酬計算式を追記
- 新規用語「攻撃」(!attack): BOTマーク有無に関わらず実行可能、パラメータ記載
- 新規用語「賠償金」(compensation): 攻撃者→被攻撃者の通貨移転、残高不足時の全額払いルール

### テスト結果サマリー
<!-- 設計タスクのためN/A -->
