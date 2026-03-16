# D-08 コンポーネント境界設計書: Bot（AIボットシステム）

> ステータス: ドラフト v5 / 2026-03-16
> 関連D-07: SS 3.2 BotService / SS 5.4 ボット認証
> 関連D-05: bot_state_transitions.yaml v5

---

## 1. 分割方針

「ボットのライフサイクル管理（配置・書き込み実行・HP管理・状態遷移・日次リセット・撃破報酬計算）」をPostServiceから独立させる。ボット固有のデータ（HP・ペルソナ・偽装ID・戦歴・固定文リスト等）は `bots` / `bot_posts` テーブルでRLS保護されており、これらへのアクセスを本コンポーネントに集約することでRLSポリシーの管理範囲を明確にする。

ボットの書き込み実行はPostServiceを経由させる（CLAUDE.md横断的制約）。BotServiceはPostServiceの呼び出し元に徹し、DB直書きを行わない。

v5で新設された !attack コマンドの処理フローは AttackHandler（D-08 attack.md）に記載する。BotServiceは AttackHandler から呼び出される「ボット側の操作API」を提供する立場に位置づける。

---

## 2. 公開インターフェース

### 2.1 書き込み実行（GitHub Actionsから呼び出し）

```
executeBotPost(botId: UUID, threadId: UUID): BotPostResult
```
```
BotPostResult {
  postId:     UUID
  postNumber: number
  dailyId:    string   // 偽装日次リセットID（当日分を使用）
}
```

内部フロー：
1. bot_profiles.yaml の固定文リストからランダムに1件選択
2. PostService.createPost(isBotWrite=true) を呼び出す
3. 成功したら `bot_posts` に { postId, botId } を INSERT

`bot_posts` へのINSERTはこのコンポーネントのみが行う。PostServiceは `bot_posts` を意識しない。

荒らし役はAI API（LLM）を使用せず、固定文リストから選択する。将来のペルソナボット向けにAI API呼び出しの拡張ポイントは残す。

### 2.2 HP更新・ダメージ処理（AttackHandlerから呼び出し）

```
applyDamage(botId: UUID, damage: number, attackerId: UUID): DamageResult
```
```
DamageResult {
  previousHp:    number
  remainingHp:   number
  eliminated:    boolean
  eliminatedBy:  UUID | null
  reward:        number | null   // 撃破時の報酬額（非撃破時はnull）
}
```

処理：
1. bots.hp を damage 分減少
2. HP <= 0 なら撃破処理を実行
   - is_active = false, eliminated_at = NOW(), eliminated_by = attackerId
   - 撃破報酬を計算して返す（CurrencyServiceへの付与はAttackHandler側で行う）
3. times_attacked を +1

### 2.3 正体判定（AccusationService / AttackHandlerから呼び出し）

```
isBot(postId: UUID): boolean
```

`bot_posts` に `postId` のレコードが存在するかを検索する。AccusationService・AttackHandler はこのメソッドを通じてのみボット判定を行い、`bot_posts` テーブルに直接アクセスしない。

### 2.4 ボットID逆引き（AttackHandlerから呼び出し）

```
getBotByPostId(postId: UUID): BotInfo | null
```
```
BotInfo {
  botId:         UUID
  name:          string
  hp:            number
  maxHp:         number
  isActive:      boolean
  isRevealed:    boolean
  survivalDays:  number
  totalPosts:    number
  accusedCount:  number
  timesAttacked: number
}
```

`bot_posts` -> `bots` を結合して対象ボットの全情報を返す。`isBot()` が true の場合に、攻撃処理で必要なボット情報を取得するために使用する。

### 2.5 偽装ID取得（当日分の再利用）

```
getDailyId(botId: UUID): string
```

`bots.daily_id` / `bots.daily_id_date` を参照し、当日分であればそのまま返す。日付が古ければ再生成してDBを更新してから返す。

### 2.6 BOTマーク付与（AccusationService / AttackHandlerから呼び出し）

```
revealBot(botId: UUID): void
```

`bots.is_revealed = true`, `bots.revealed_at = NOW()` に更新する。既に revealed の場合は何もしない（冪等）。

### 2.7 撃破報酬計算（内部 + DamageResultで公開）

```
calculateEliminationReward(botId: UUID): number
```

計算式: `base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus)`

荒らし役デフォルト: base_reward=10, daily_bonus=50, attack_bonus=5
パラメータは config/bot_profiles.yaml からBOTごとに読み込む。

### 2.8 攻撃制限チェック（AttackHandlerから呼び出し）

```
canAttackToday(attackerId: UUID, botId: UUID): boolean
```

同一ユーザーが同一ボットに対して本日既に攻撃済みかどうかを判定する。`attacks` テーブルを参照。

### 2.9 攻撃記録（AttackHandlerから呼び出し）

```
recordAttack(attackerId: UUID, botId: UUID): void
```

`attacks` テーブルに攻撃記録を INSERT する。日次攻撃制限の管理に使用。

### 2.10 日次リセット処理（daily-maintenanceジョブから呼び出し）

```
performDailyReset(): DailyResetResult
```
```
DailyResetResult {
  botsRevealed:   number  // lurking に戻したボット数
  botsRevived:    number  // eliminated から復活させたボット数
  idsRegenerated: number  // 偽装ID再生成したボット数
}
```

処理内容（D-05 daily_reset セクション参照）：
1. 全ボットの偽装IDを再生成
2. revealed -> lurking（BOTマーク解除）
3. lurking のまま日次リセット: survival_days +1
4. eliminated -> lurking（HP初期値復帰、survival_days=0、times_attacked=0）
5. attacks テーブルの前日分レコードをクリーンアップ

### 2.11 書き込み先スレッド選択（GitHub Actionsから呼び出し）

```
selectTargetThread(botId: UUID): UUID
```

表示中のスレッド一覧からランダムに1件を選択する。荒らし役はスレッドを作成しない。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| PostService | ボット書き込みの実行（isBotWrite=trueで呼び出し） |
| BotRepository | `bots` テーブルのCRUD（service_roleのみアクセス可） |
| BotPostRepository | `bot_posts` テーブルのINSERT・SELECT（service_roleのみ） |
| AttackRepository | `attacks` テーブルのINSERT・SELECT・DELETE（service_roleのみ） |
| ThreadRepository | スレッド一覧取得（書き込み先選択用） |

### 3.2 被依存

```
AttackHandler       ->  BotService.isBot()
                        BotService.getBotByPostId()
                        BotService.applyDamage()
                        BotService.revealBot()
                        BotService.canAttackToday()
                        BotService.recordAttack()
AccusationService   ->  BotService.isBot()
                        BotService.revealBot()
GitHub Actions      ->  BotService.executeBotPost()
                        BotService.selectTargetThread()
daily-maintenance   ->  BotService.performDailyReset()
```

---

## 4. 隠蔽する実装詳細

- 固定文リストの管理方法（config/bot_profiles.yaml の読み込み・キャッシュ）
- 偽装daily_idの生成アルゴリズム（一般ユーザーと同一の `daily-id` ドメインルールを使うが、seedが異なる）
- 書き込み先スレッド選択のランダムアルゴリズム（均等分布 or 重み付け）
- 撃破報酬パラメータのconfig読み込みとキャッシュ戦略
- attacks テーブルのクリーンアップ方式（DELETE or パーティション）

---

## 5. データモデル変更

### 5.1 bots テーブル変更

v5で以下のカラムを追加・変更する。

| カラム | 変更種別 | 型 | 説明 |
|---|---|---|---|
| times_attacked | 追加 | INTEGER DEFAULT 0 | 被攻撃回数（撃破報酬計算に使用） |
| bot_profile_key | 追加 | VARCHAR | bot_profiles.yaml 内のプロファイルキー |
| hp | 変更 | - | 荒らし役の初期値を 30 -> 10 に変更 |
| max_hp | 変更 | - | 荒らし役の初期値を 30 -> 10 に変更 |

### 5.2 attacks テーブル（新規）

同一ユーザー同一ボット1日1回攻撃制限の管理テーブル。

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| attacker_id | UUID (FK -> users.id) | 攻撃者 |
| bot_id | UUID (FK -> bots.id) | 攻撃対象ボット |
| attack_date | DATE | 攻撃実施日（JST） |
| post_id | UUID (FK -> posts.id) | 攻撃が含まれたレス |
| damage | INTEGER | 与ダメージ |
| created_at | TIMESTAMPTZ | 攻撃日時 |

インデックス:
- `(attacker_id, bot_id, attack_date)` UNIQUE -- 1日1回制限の強制
- `(bot_id, attack_date)` -- 被攻撃回数の集計用

RLSポリシー: `anon` / `authenticated` ロールからの全操作を DENY。`service_role` のみアクセス可能。

### 5.3 マイグレーション方針

1. `bots` テーブルに `times_attacked` カラムを追加（ALTER TABLE ADD COLUMN ... DEFAULT 0）
2. `bots` テーブルに `bot_profile_key` カラムを追加（ALTER TABLE ADD COLUMN）
3. `attacks` テーブルを新規作成（CREATE TABLE + RLSポリシー + インデックス）
4. 既存の荒らし役ボットの hp/max_hp を 10 に更新（UPDATE）
5. マイグレーションは `supabase migration new bot_v5_attack_system` で作成

---

## 6. 設計上の判断

### 6.1 bot_posts INSERTのタイミングと失敗時の扱い

PostService.createPost が成功してからでないと有効なpostIdが取得できないため、`bot_posts` のINSERTは必ずPostService完了後に行う。ここで失敗した場合、postレコードは残るがbot_postsレコードが存在しないため、`isBot(postId)` が false を返す状態になる。この不整合はゲーム上「ボットが人間として扱われる」方向に作用するため、ゲームの公平性上はむしろ問題ない。ただし管理上の不整合のためエラーログに記録する。

### 6.2 プロンプトサニタイズはBotService責務外

CLAUDE.md横断的制約により「ユーザー作成ボットのプロンプトは必ずサニタイズし管理者プロンプトで上書きする」が定められているが、MVPスコープではユーザー作成ボットが存在しない。荒らし役は固定文リストからの選択のみのため、本コンポーネントではサニタイズ処理を実装しない（Phase 4への拡張ポイント）。

### 6.3 荒らし役のAI API不使用

荒らし役ボットは固定文リストからランダム選択するため、AI API（LLM）は使用しない。これにより外部APIへの依存・コスト・レイテンシを排除し、10体並行稼働時の信頼性を確保する。将来のペルソナボット向けにAI API呼び出しパスは設計に含めるが、実装は行わない。

### 6.4 CurrencyService への撃破報酬付与の責務配置

BotService.applyDamage() は報酬額を計算して返すが、CurrencyServiceへの実際の付与処理はAttackHandler側で行う。理由：BotService が CurrencyService に依存すると循環依存のリスクが生じるため、報酬計算と付与実行を分離する。

### 6.5 攻撃記録テーブルの新設

v5で追加された「同一ボット1日1回攻撃制限」の管理のため `attacks` テーブルを新設する。`accusations` テーブルに統合する案も検討したが、以下の理由で分離した。

- !tell と !attack は別コマンドであり、制限ルールも異なる（!tell はレス単位、!attack はボット単位）
- attacks テーブルは将来のコマンド拡張（対人攻撃等）でも再利用可能
- 日次リセットでのクリーンアップ対象を明確に分離できる

### 6.6 不意打ち攻撃時の遷移連鎖

lurking 状態のボットへの !attack 成功時は、lurking -> revealed -> eliminated が1トランザクション内で連鎖しうる（荒らし役はHP:10, ダメージ:10のため必ず即死）。実装上は revealBot() -> applyDamage() の順で呼び出す。
