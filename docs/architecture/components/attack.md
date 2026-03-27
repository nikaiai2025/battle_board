# D-08 コンポーネント境界設計書: Attack（攻撃システム）

> ステータス: ドラフト v2 / 2026-03-28
> 関連D-07: SS 3.2 CommandService
> 関連D-05: bot_state_transitions.yaml v5
> 関連D-08: bot.md v5, command.md, accusation.md

---

## 1. 分割方針

!attack コマンドは「BOTマーク有無に関わらず任意レスに攻撃可能」「対象がBOTならHP減少、人間なら賠償金」という分岐ロジックを持ち、BotService / CurrencyService / PostRepository の3つのコンポーネントを横断的に連携させる。この複雑さを CommandService のコア処理に持ち込まないため、CommandHandler インターフェースに準拠した独立ハンドラとして設計する。

AccusationService（!tell ハンドラ）と同様の位置づけであり、CommandService は !attack を受け取ったら AttackHandler に丸ごと委譲し、実行詳細を持たない。

---

## 2. 公開インターフェース

### 2.1 AttackHandler（CommandHandler実装）

```
AttackHandler implements CommandHandler {
  commandName: "attack"
  execute(ctx: CommandContext): Promise<CommandHandlerResult>
}
```

CommandService の Handler Registry に登録される。CommandService から `executeCommand()` 経由で呼び出される。

### 2.2 コマンド設定（config/commands.yaml へのエントリ追加）

```yaml
commands:
  attack:
    description: "指定レスに攻撃する"
    cost: 5
    damage: 10
    compensation_multiplier: 3
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
```

| フィールド | 値 | 説明 |
|---|---|---|
| cost | 5 | 攻撃コスト（通貨消費） |
| damage | 10 | 1回の攻撃で与えるダメージ |
| compensation_multiplier | 3 | 人間攻撃時の賠償金倍率（cost * multiplier = 15） |

---

## 3. 処理フロー

### 3.1 共通前処理

```
1. CommandService が本文から "!attack >>N" を検出
2. CommandService が commands.yaml から attack のコスト(5)を取得
3. CurrencyService でコスト(5)の残高チェック
   -> 不足: エラー応答（"通貨が不足しています"）、攻撃中止
4. 対象レス(>>N)の存在チェック
   -> 不存在: エラー応答、攻撃中止
5. CommandService が AttackHandler.execute() に委譲
```

### 3.2 AttackHandler 内部フロー

```
A. BotService.isBot(targetPostId) で対象判定
   |
   ├── true (対象がBOT) ──────────────────────────► フローB
   │
   └── false (対象が人間) ─────────────────────────► フローC
```

### 3.3 フローB: 対象がBOTの場合

```
B1. BotService.getBotByPostId(targetPostId) でボット情報取得
B2. ボットが eliminated 状態なら:
    -> エラー応答（"このボットは既に撃破されています"）、コスト消費なし、攻撃中止
B3. BotService.canAttackToday(attackerId, botId) で1日1回チェック
    -> 既に攻撃済み: エラー応答（"同じボットには1日1回しか攻撃できません"）、コスト消費なし、攻撃中止
B4. CurrencyService.debit(attackerId, cost=5) でコスト消費
B5. ボットが lurking 状態（BOTマークなし = 不意打ち）なら:
    -> BotService.revealBot(botId) でBOTマーク付与
B6. BotService.applyDamage(botId, damage=10, attackerId) でHP減少
B7. BotService.recordAttack(attackerId, botId) で攻撃記録
B8. DamageResult.eliminated == true なら:
    -> CurrencyService.credit(attackerId, reward) で撃破報酬付与
    -> 撃破通知の独立システムメッセージを生成（★システム名義）
B9. インライン・システム情報を生成:
    "⚔ 名無しさん(ID:{attackerDailyId}) → 🤖{botName} に攻撃！ HP:{prev}→{remaining}"
```

### 3.4 フローC: 対象が人間の場合

```
C1. CurrencyService.debit(attackerId, cost=5) でコスト消費
C2. 賠償金額を計算: min(compensation=15, attackerRemainingBalance)
C3. CurrencyService.debit(attackerId, compensation) で賠償金差し引き
C4. CurrencyService.credit(targetUserId, compensation) で被攻撃者に賠償金付与
C5. インライン・システム情報を生成:
    - 残高十分な場合: 通常の攻撃失敗メッセージ
    - 残高不足（全額支払い）の場合: "チッ、これで勘弁してやるよ🤞😏"
```

### 3.5 エラーケース一覧

| エラー条件 | コスト消費 | レスポンス |
|---|---|---|
| 通貨不足（コスト未満） | なし | "通貨が不足しています" |
| 対象レスが存在しない | なし | エラーメッセージ |
| 撃破済みボットへの攻撃 | なし | "このボットは既に撃破されています" |
| 同一ボットに同日2回目 | なし | "同じボットには1日1回しか攻撃できません" |

全エラーケースでコストは消費されない（攻撃自体が実行されないため）。

### 3.6 フローD: 複数ターゲット攻撃（>>N-M 形式）

See: features/bot_system.feature @複数ターゲット攻撃
See: src/lib/domain/rules/attack-range-parser.ts

```
D1. 引数が >>N-M 形式かを判定（isRangeFormat）
    -> 非該当: 単体攻撃（§3.2 へ）
D2. parseAttackRange(arg) で範囲パース
    -> エラー（不正形式・上限10超過）: エラー応答
D3. 各レス番号を事前検証（preValidateTarget）
    スキップ条件: 存在しない / 自分 / システムメッセージ /
    撃破済み / 同日攻撃済み / 範囲内で同一ボット重複
D4. 有効ターゲット数 == 0: エラー応答
D5. 残高チェック: balance >= 有効ターゲット数 × cost
    -> 不足: エラー応答、コスト消費なし
D6. 有効ターゲットを昇順に順次攻撃:
    各ターゲットで残高 < cost なら中断
    - BOT → executeSingleBotAttack（フローB の B4〜B9 相当）
    - 人間 → executeSingleHumanAttack（フローC の C1〜C5 相当）
D7. 全結果を集約した表示文を生成:
    "⚔ 名無しさん(ID:{dailyId}) の連続攻撃！"
    "  >>N: {結果}"
    スキップ対象は "（{理由} — スキップ）" 表記
```

---

## 4. 依存関係

### 4.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| BotService | isBot(), getBotByPostId(), applyDamage(), revealBot(), canAttackToday(), recordAttack() |
| CurrencyService | debit()（コスト消費・賠償金差し引き）、credit()（賠償金付与・撃破報酬付与） |
| PostRepository | 対象レスの存在確認、対象レスのauthor_id取得（賠償金支払い先の特定） |
| UserRepository | 攻撃者の日次リセットID取得（システム情報表示用） |

### 4.2 被依存

```
CommandService  ->  AttackHandler.execute()
```

CommandService の Handler Registry 経由でのみ呼び出される。直接の外部呼び出しはない。

---

## 5. 隠蔽する実装詳細

- 賠償金の残高不足時の端数処理（全額払い）の具体的な実装
- システム情報テキストのフォーマット詳細
- コスト消費と賠償金消費の2段階debitのトランザクション管理

---

## 6. 設計上の判断

### 6.1 AttackHandler を独立コンポーネントとした理由

!attack は !tell と異なり、「BOT判定 + BOTマーク付与 + HP減少 + 撃破報酬」と「人間判定 + 賠償金」の2つの大きな分岐を持つ。AccusationService（!tell）と同程度の複雑さがあるため、CommandService 内にインラインで実装せず独立ハンドラとした。

検討した代替案:
- **BotService に統合**: BotService の責務が膨張する。賠償金（人間への支払い）はボットのライフサイクル管理と無関係。
- **AccusationService に統合**: !tell と !attack は別コマンドであり、混在させると責務が不明確になる。
- **CommandService にインライン実装**: Phase 4 で 20+ コマンドに拡張予定のため、個別ハンドラ分離の方針と一致しない。

### 6.2 エラーケースでのコスト不消費

v5の BDD シナリオでは、全エラーケース（撃破済み、同日2回目、レス不存在）でコストが消費されないことが明示されている。これは !tell（エラー時コスト不消費）と一貫した設計。

ただし、フローB/C の正常系では「対象が人間だった場合」もコスト(5)は消費される。「対象が人間 = エラー」ではなく「攻撃は成功したが、結果として人間だった」という位置づけ。

### 6.3 賠償金の残高不足時の処理

BDD シナリオ「人間への攻撃時に賠償金の残高が不足している場合は全額支払い」に基づき、攻撃コスト(5)消費後の残高が賠償金(15)に満たない場合は残高全額を支払う。残高0でも攻撃自体は成立する（コスト5の支払いが完了していれば）。

実装上は以下の2段階で処理する:
1. `CurrencyService.debit(attackerId, 5)` -- コスト消費（残高不足ならここで中止）
2. `compensation = min(15, attackerBalance)` -- 支払可能な賠償金を計算
3. `CurrencyService.debit(attackerId, compensation)` + `CurrencyService.credit(targetUserId, compensation)`

### 6.4 自分自身への攻撃

BDD シナリオでは明示されていないが、!tell と同様に自分の書き込みへの攻撃は拒否するのが自然。ただしこの判断は実装スプリントで BDD シナリオを確認の上で決定する（設計判断メモに記載）。

### 6.5 システムメッセージへの攻撃

BDD シナリオで明示されていないが、!tell と同様にシステムメッセージ（is_system_message=true）への攻撃は拒否する。対象レスの author_id が NULL かつ bot_posts にも存在しない場合がこれに該当する。

### 6.6 BOTマーク付きレスへの攻撃と別レスへの攻撃

!attack >>N は特定のレスに対して実行されるが、同一ボットの別のレスへの攻撃でも「同一ボットへの攻撃」として1日1回制限に該当する。制限の単位はレスではなくボット。

---

## 7. トランザクション設計

!attack の全処理は、PostService が管理する書き込みトランザクション内で実行される（D-07 SS 7.1 参照）。

```
BEGIN TRANSACTION
  1. posts にユーザーの書き込みレコード INSERT（!attack >>N を含む本文）
  2. threads.post_count INCREMENT, last_post_at UPDATE
  3. CommandService がコマンド解析 -> AttackHandler に委譲
  4. AttackHandler が フローB or フローC を実行
     - currencies UPDATE (コスト消費)
     - bots UPDATE (HP減少, is_revealed 等)
     - attacks INSERT (攻撃記録)
     - currencies UPDATE (賠償金 or 撃破報酬)
  5. 書き込みレスの inline_system_info を UPDATE（攻撃結果の表示）
  6. 撃破時: 独立システムメッセージレスを posts に INSERT
  7. インセンティブ判定（通常の書き込みボーナス等）
COMMIT
```

攻撃処理の失敗（残高不足等）は書き込み自体を巻き戻さない（D-07 SS 7.4 の方針に準拠）。
