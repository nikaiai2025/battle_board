# 設計判断メモ: TASK-086 (bot_system.feature v5 対応設計)

> 作成日: 2026-03-16
> 作成者: bdd-architect

---

## 1. 主要な設計判断の根拠

### 1.1 AttackHandler を独立コンポーネントとして分離

**判断**: BotService に統合せず、CommandHandler インターフェース準拠の独立ハンドラとした。

**根拠**:
- !attack は「BOT判定 + ダメージ」と「人間判定 + 賠償金」の2分岐があり、AccusationService と同等の複雑さ
- BotService は「ボットのライフサイクル管理」が責務であり、賠償金（人間への支払い）を扱うのは責務逸脱
- CommandService の Handler Registry パターン（D-08 command.md）に準拠し、Phase 4 の 20+ コマンド拡張と一貫

### 1.2 撃破報酬の計算と付与の責務分離

**判断**: BotService は報酬額の計算のみ行い、CurrencyService への付与は AttackHandler が行う。

**根拠**: BotService -> CurrencyService の依存は既に存在するが、撃破報酬付与のコンテキスト（誰に・いくら・なぜ）は AttackHandler が保持している。AttackHandler がコスト消費・賠償金・撃破報酬の全通貨操作を一元管理することで、通貨フローの追跡が容易になる。

### 1.3 attacks テーブルの新設（accusations テーブルに統合しない）

**判断**: 攻撃記録用の新テーブルを作成。

**根拠**:
- !tell の制限はレス単位（同一accuser x 同一targetPost）、!attack の制限はボット単位（同一attacker x 同一bot x 同日）で粒度が異なる
- attacks テーブルは日次クリーンアップ対象だが accusations は永続記録

---

## 2. 実装時の注意事項

### 2.1 コスト消費のタイミング

BDD シナリオの精査結果:
- **エラーケース（撃破済み、同日2回、存在しないレス、通貨不足）**: コスト消費なし
- **正常系（対象がBOT）**: コスト消費あり
- **正常系（対象が人間）**: コスト消費あり + 賠償金

実装上は「エラーチェックを全て通過してからコスト消費」のフローとする。通貨引き落とし -> コマンド実行の順序（D-08 command.md の方針）とは異なる点に注意。attack の場合は対象が撃破済みかどうかの判定がコスト消費前に必要なため、この順序変更は妥当。

### 2.2 不意打ち攻撃時の遷移連鎖

荒らし役（HP:10, ダメージ:10）への不意打ち !attack では、lurking -> revealed -> eliminated が1トランザクション内で連鎖する。revealBot() と applyDamage() を別々に呼び出すが、applyDamage() の結果で eliminated になった場合、revealBot() で設定した is_revealed は eliminated 遷移で is_active=false に上書きされるだけで矛盾しない。

### 2.3 専ブラでのBOTマーク表示問題

bot_system.feature v5 の設計懸念に記載あり: 告発成功や不意打ち攻撃成功時、過去レスにBOTマーク🤖が追加されるが、専ブラのDAT差分同期（Rangeヘッダ）では既読行は再取得されない。実装時に以下を検証する必要がある:
- 既読レスのBOTマーク付与が専ブラユーザーに見えるかどうか
- 見えない場合、レス削除と同じパターン（あぼーん）で対応可能か

### 2.4 config/commands.yaml への !attack エントリ追加

commands.yaml に以下のフィールドを追加する必要がある:
- `damage`: 攻撃ダメージ値（既存フィールドにない概念）
- `compensation_multiplier`: 賠償金倍率（同上）

これらは !attack 固有のパラメータであり、汎用の commands.yaml スキーマに追加するか、bot_profiles.yaml 側に持たせるかは実装時に判断。設計上は commands.yaml 側に記載したが、ボット関連パラメータとして bot_profiles.yaml に移す案も合理的。

### 2.5 被攻撃回数（times_attacked）のカウント対象

BDD シナリオの撃破報酬計算例:
- 「被攻撃回数:1回」= 撃破時の攻撃も含むカウント
- applyDamage() 内で times_attacked を +1 した後に報酬計算するため、撃破攻撃自身もカウントに含まれる

### 2.6 同一ボットの複数レスへの攻撃

!attack >>5 と !attack >>10 が同一ボットの異なるレスだった場合、1日1回制限に該当する。制限の単位はレスではなくボット。BotService.canAttackToday() は bot_id ベースで判定する。

---

## 3. 未決事項

### 3.1 !attack コマンドの正式名称

bot_system.feature v5 の未決事項に記載: 「攻撃コマンドの正式名（本ドラフトでは !attack を仮採用）」。設計ドキュメントでは !attack で統一したが、変更時は commands.yaml の commandName と AttackHandler.commandName の修正が必要。

### 3.2 自分自身の書き込みへの攻撃

BDD シナリオに明示なし。!tell は「自分の書き込みに対して告発を試みると拒否される」がある。!attack も同様に拒否すべきだが、BDD シナリオへの追加が必要。実装スプリントでエスカレーションの可能性あり。

### 3.3 システムメッセージへの攻撃

BDD シナリオに明示なし。!tell は「システムメッセージに対して告発を試みると拒否される」がある。!attack も同様に拒否すべき。こちらも BDD シナリオ追加が望ましい。

### 3.4 D-07 architecture.md への反映

以下の更新が必要（本タスクのスコープ外だが申し送り）:
- SS 3.2 サービス一覧に AttackHandler の追加（またはCommandService配下のハンドラとして言及）
- SS 4.1 ER図に attacks テーブルの追加
- SS 4.2 テーブル定義に attacks テーブルの追加
- SS 8 日次リセットに attacks テーブルのクリーンアップを追加
- SS 11.2 インデックスに attacks テーブルのインデックスを追加
- AccusationService の説明から「ボーナス/冤罪ボーナス」の記述を削除（v4で廃止済み）

### 3.5 accusation.md (D-08) の更新

v4 で告発成功ボーナス・冤罪ボーナスが廃止されたため、以下の修正が必要（TASK-087 が担当の可能性）:
- AccusationResult.bonusAmount の削除または常に0
- 依存先から CurrencyService の「hit時のボーナス付与」を削除
- 隠蔽する実装詳細から「ボーナス金額の計算ロジック（miss時の冤罪ボーナス計算を含む）」を削除

### 3.6 D-02 ユビキタス言語辞書の更新

以下の用語追加・更新が望ましい:
- 「攻撃」(!attack) の新規追加
- 「賠償金」(compensation) の新規追加
- 「AI告発」の定義更新（ボーナス・冤罪ボーナス廃止の反映）
- 「BOTマーク」の定義更新（!attack 経由でも付与される旨を追記）

---

## 4. BDDシナリオとのカバレッジ確認

bot_system.feature v5 の全35シナリオに対する設計カバレッジ:

| カテゴリ | シナリオ数 | カバー先D-08 |
|---|---|---|
| 偽装書き込み (US-018) | 6 | bot.md SS2.1, 2.5, 2.11 |
| 荒らし役 (US-019) | 7 | bot.md SS2.1, Phase2構成 |
| 攻撃 (US-020) | 5 | attack.md フローB/C |
| 撃破 (US-021) | 5 | bot.md SS2.2, 2.7 / attack.md フローB |
| 攻撃エラー | 4 | attack.md SS3.5 |
| 日次リセット (US-022) | 5 | bot.md SS2.10 |
| チュートリアルE2E | 1 | attack.md + bot.md 横断 |

ai_accusation.feature v4 のシナリオに対する整合性:
- !tell のコスト消費のみ・報酬なし: D-05 の lurking->revealed 遷移に反映済み
- BOTマーク付与後の書き込み継続: bot.md の revealed 状態の説明に含まれる
