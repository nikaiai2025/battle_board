# D-08 コンポーネント境界設計書: Bot（AIボットシステム）

> ステータス: ドラフト v7 / 2026-03-28
> 関連D-07: SS 3.2 BotService / SS 5.4 ボット認証 / TDR-008
> 関連D-05: bot_state_transitions.yaml v5.1

---

## 1. 分割方針

「ボットのライフサイクル管理（配置・書き込み実行・HP管理・状態遷移・日次リセット・撃破報酬計算）」をPostServiceから独立させる。ボット固有のデータ（HP・ペルソナ・偽装ID・戦歴・固定文リスト等）は `bots` / `bot_posts` テーブルでRLS保護されており、これらへのアクセスを本コンポーネントに集約することでRLSポリシーの管理範囲を明確にする。

ボットの書き込み実行はPostServiceを経由させる（CLAUDE.md横断的制約）。BotServiceはPostServiceの呼び出し元に徹し、DB直書きを行わない。

v5で新設された !attack コマンドの処理フローは AttackHandler（D-08 attack.md）に記載する。BotServiceは AttackHandler から呼び出される「ボット側の操作API」を提供する立場に位置づける。

v6 では Phase 3（キュレーションBOT）・Phase 4（ユーザー作成ボット）に向け、BOT種別ごとに異なる「コンテンツ生成」「行動パターン」「スケジュール」の3つの関心事を Strategy パターンで分離する（TDR-008参照）。BotService は各 Strategy インターフェースを通じて処理を委譲し、BOT種別固有の振る舞いを知らない。既存の §2.2〜§2.10（HP管理・正体判定・撃破報酬等）は全BOT種別で共通のまま変更しない。

---

## 2. 公開インターフェース

### 2.1 書き込み実行（GitHub Actionsから呼び出し）

```
executeBotPost(botId: UUID): BotPostResult
```
```
BotPostResult {
  postId:     UUID
  postNumber: number
  dailyId:    string   // 偽装日次リセットID（当日分を使用）
}
```

内部フロー（Strategy 委譲版 -- v6）：
1. `next_post_at <= NOW()` を判定し、投稿予定時刻に達していなければスキップして終了（TDR-010: cron駆動時の投稿対象フィルタリング）
2. `resolveStrategies(bot, profile)` で3つの Strategy を解決
3. `behavior.decideAction(context)` で投稿先を決定（`BotAction` を取得）
4. `BotAction.type` に応じて分岐:
   - `post_to_existing`: `content.generateContent(context)` で本文生成 -> `PostService.createPost(isBotWrite=true)`
   - `create_thread`: BehaviorStrategy が返した title/body を使用 -> `PostService.createThread(isBotWrite=true)`
5. 成功したら `bot_posts` に { postId, botId } を INSERT
6. `next_post_at = NOW() + scheduling.getNextPostDelay()` でDBを更新（TDR-010: 次回投稿予定時刻の設定）

`bot_posts` へのINSERTはこのコンポーネントのみが行う。PostServiceは `bot_posts` を意識しない。

荒らし役は `FixedMessageContentStrategy` + `RandomThreadBehaviorStrategy` + `FixedIntervalSchedulingStrategy` が解決され、従来と同一の動作を行う。キュレーションBOT以降のBOT種別は対応する Strategy 実装に差し替わる（§2.12 参照）。

> **外部インターフェースの互換性**: GitHub Actions からの呼び出しシグネチャは `executeBotPost(botId)` に簡略化される（投稿先は BehaviorStrategy が内部で決定するため、`threadId` 引数は不要になる）。既存の呼び出し元は移行ステップ中に順次更新する。

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
4. eliminated → 新レコード INSERT（インカーネーションモデル — §6.11 参照）
   - 旧レコード: `is_active = false` のまま凍結保持（`bot_posts` 紐付けも維持）
   - 新レコード: 同一 `bot_profile_key`・`name` で INSERT。HP=max_hp, is_active=true, is_revealed=false, survival_days=0, times_attacked=0, `next_post_at` を再設定（TDR-010）
   - `BotRepository.bulkReviveEliminated()` は UPDATE → INSERT に変更する
   - **チュートリアルBOT（`bot_profile_key = 'tutorial'`）は復活対象から除外する。** チュートリアルBOTは1回限りの消耗品であり、日次リセットで復活しない設計。
   - See: features/welcome.feature @チュートリアルBOTは日次リセットで復活しない
5. attacks テーブルの前日分レコードをクリーンアップ
6. 撃破済みチュートリアルBOTのクリーンアップ（`BotRepository.deleteEliminatedTutorialBots()`）
   - 削除対象1: `bot_profile_key = 'tutorial' AND is_active = false`（撃破済み）
   - 削除対象2: `bot_profile_key = 'tutorial' AND created_at < NOW() - 7日`（7日経過の未撃破）
   - See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる

### 2.11 チュートリアルBOTスポーン（processPendingTutorials — Sprint-84新設）

```
processPendingTutorials(): ProcessTutorialsResult
```
```
ProcessTutorialsResult {
  spawned: number  // スポーンしたチュートリアルBOT数
}
```

POST /api/internal/bot/execute の末尾で呼び出す。pending_tutorials テーブルに未処理レコードがある場合にチュートリアルBOTをスポーンし、即時書き込みを実行する。

処理フロー:
1. `PendingTutorialRepository.findAll()` で未処理の pending を取得
2. 各 pending に対して:
   a. `BotRepository.create()` でチュートリアルBOTを新規作成（`bot_profile_key = 'tutorial'`, `next_post_at = NOW()`）
   b. `BotService.executeBotPost(newBotId)` で書き込み実行
      - `TutorialContentStrategy` が `>>N !w\n新参おるやん🤣` を生成
      - `PostService.createPost(isBotWrite=true, botUserId=botId)` で投稿
   c. `PendingTutorialRepository.delete(pendingId)` でクリーンアップ

チュートリアルBOTの特性:
- `bot_profile_key = 'tutorial'`（resolveStrategies がチュートリアル専用 Strategy 組を解決）
- 書き込みは1回のみ（`ImmediateSchedulingStrategy` で delay=0、以降は再投稿しない）
- 日次リセットで復活しない（§2.10 処理内容 Step 4 を参照）
- 撃破後は翌日の daily-maintenance でクリーンアップされる（§2.10 処理内容 Step 6 を参照）
- 撃破報酬は固定 +20（`bot_profiles.yaml`: `base_reward=20, daily_bonus=0, attack_bonus=0`）

See: features/welcome.feature
See: tmp/workers/bdd-architect_TASK-236/design.md §3 チュートリアルBOT（Phase C）

### 2.12 書き込み先決定（BehaviorStrategy に委譲）

```
selectTargetThread(botId: UUID): UUID       // 後方互換用ラッパー
```

v6 以降、投稿先の決定は `BehaviorStrategy.decideAction()` に委譲される。`selectTargetThread()` は後方互換のためラッパーとして残し、内部で `RandomThreadBehaviorStrategy.decideAction()` を呼び出す。

BehaviorStrategy は以下の判別共用体 `BotAction` を返す:

```typescript
type BotAction =
  | { type: 'post_to_existing'; threadId: string }
  | { type: 'create_thread'; title: string; body: string };
```

`executeBotPost()` は `BotAction.type` に応じて `PostService.createPost()` または `PostService.createThread()` を呼び分ける。

### 2.13 Strategy パターン設計（v6 新設）

#### 2.13.1 Strategy インターフェース

```typescript
/** コンテンツ生成戦略 -- 「何を書くか」を決定する */
interface ContentStrategy {
  generateContent(context: ContentGenerationContext): Promise<string>;
}

interface ContentGenerationContext {
  botId: string;
  botProfileKey: string | null;
  threadId: string;
  /** キュレーションBOT用: 収集済みのネタ情報 */
  collectedTopic?: CollectedTopic;
  /** AI対話用: スレッドの直近レス（文脈理解に使用） */
  recentPosts?: RecentPostSummary[];
  /** ユーザー作成ボット用: サニタイズ済みプロンプト */
  sanitizedUserPrompt?: string;
}

/** 行動パターン戦略 -- 「どこに書くか」を決定する */
interface BehaviorStrategy {
  decideAction(context: BehaviorContext): Promise<BotAction>;
}

interface BehaviorContext {
  botId: string;
  botProfileKey: string | null;
  boardId: string;
}

type BotAction =
  | { type: 'post_to_existing'; threadId: string }
  | { type: 'create_thread'; title: string; body: string };

/** スケジュール戦略 -- 「いつ書くか」を決定する */
interface SchedulingStrategy {
  getNextPostDelay(context: SchedulingContext): number; // 分単位
}

interface SchedulingContext {
  botId: string;
  botProfileKey: string | null;
}
```

#### 2.13.2 Strategy 解決ルール（resolveStrategies）

```typescript
interface BotStrategies {
  content: ContentStrategy;
  behavior: BehaviorStrategy;
  scheduling: SchedulingStrategy;
}

function resolveStrategies(
  bot: Bot,
  profile: BotProfile | null
): BotStrategies;
```

解決の優先順位:
1. `bot_profiles.yaml` の `content_strategy` / `behavior_type` / `scheduling` フィールドで明示指定
2. ユーザー作成ボット判定（`owner_id` が存在）-> 専用 Strategy 組（Phase 4）
3. デフォルト: `FixedMessageContentStrategy` + `RandomThreadBehaviorStrategy` + `FixedIntervalSchedulingStrategy`

#### 2.13.3 Strategy 実装一覧

| Strategy インターフェース | 実装クラス | Phase | 対応BOT種別 |
|---|---|---|---|
| ContentStrategy | `FixedMessageContentStrategy` | 2 (既存) | 荒らし役 |
| ContentStrategy | `TutorialContentStrategy` | 2 (Sprint-84) | チュートリアルBOT |
| ContentStrategy | `AiTopicContentStrategy` | 3 | キュレーションBOT |
| ContentStrategy | `AiConversationContentStrategy` | 4 | 常連・火付け役 |
| ContentStrategy | `UserPromptContentStrategy` | 4 | ユーザー作成ボット |
| BehaviorStrategy | `RandomThreadBehaviorStrategy` | 2 (既存) | 荒らし役 |
| BehaviorStrategy | `TutorialBehaviorStrategy` | 2 (Sprint-84) | チュートリアルBOT |
| BehaviorStrategy | `ThreadCreatorBehaviorStrategy` | 3 | キュレーションBOT |
| BehaviorStrategy | `ReplyBehaviorStrategy` | 4 | 常連・火付け役 |
| BehaviorStrategy | `ConfigurableBehaviorStrategy` | 4 | ユーザー作成ボット |
| SchedulingStrategy | `FixedIntervalSchedulingStrategy` | 2 (既存) | 荒らし役 |
| SchedulingStrategy | `ImmediateSchedulingStrategy` | 2 (Sprint-84) | チュートリアルBOT（即時投稿、delay=0） |
| SchedulingStrategy | `TopicDrivenSchedulingStrategy` | 3 | キュレーションBOT |
| SchedulingStrategy | `GachaSchedulingStrategy` | 4 | ユーザー作成ボット |

#### 2.13.4 プロバイダー抽象化レイヤー（AiApiClient）

AI API を使用する ContentStrategy（`AiTopicContentStrategy`, `AiConversationContentStrategy`, `UserPromptContentStrategy`）は、サードパーティー API の差異を吸収する `AiApiClient` アダプターを通じて LLM を呼び出す。

```typescript
/** AI APIプロバイダーの抽象化インターフェース */
interface AiApiClient {
  generate(params: AiGenerateParams): Promise<string>;
}

interface AiGenerateParams {
  provider: 'google' | 'openai' | 'anthropic';
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}
```

プロバイダーごとのアダプター実装:

| アダプター | プロバイダー | 使用SDK/API |
|---|---|---|
| `GoogleAiAdapter` | google | Gemini API (`@google/generative-ai`) |
| `OpenAiAdapter` | openai | OpenAI API (`openai`) |
| `AnthropicAdapter` | anthropic | Anthropic API (`@anthropic-ai/sdk`) |

**APIキー管理**: 各プロバイダーのAPIキーは環境変数で管理する（`GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`）。GitHub Actions Secrets に格納し、クライアントサイドコードには含めない（CLAUDE.md 横断的制約）。

#### 2.13.5 キュレーションBOTの行動フロー（Phase 3 主要ユースケース）

```
GitHub Actions (cron)
  |
  v
BotService.executeBotPost(botId)
  |
  +-- resolveStrategies(bot, profile)
  |     -> AiTopicContentStrategy
  |     -> ThreadCreatorBehaviorStrategy
  |     -> TopicDrivenSchedulingStrategy
  |
  +-- behavior.decideAction(context)
  |     -> { type: 'create_thread', title: '【悲報】○○...', body: '...' }
  |
  +-- content.generateContent() は create_thread の場合スキップ
  |   （title と body は behavior が決定済み）
  |
  +-- PostService.createThread(title, body, isBotWrite=true)
  |
  +-- botPostRepository.create(postId, botId)
```

設計ポイント:
- キュレーションBOTの `ThreadCreatorBehaviorStrategy` は `{ type: 'create_thread' }` を返す
- スレッド作成も PostService 経由で行い、DB 直書きは禁止（CLAUDE.md 横断的制約）
- ネタ収集（Web スクレイピング + AI 要約）は外部の収集ジョブが事前に行い、結果を `collected_topics` テーブルにバッファする
- 収集と投稿の分離により、外部 API 障害時もバッファ内のネタで投稿を継続可能

#### 2.13.6 ユーザー作成ボットの管理構造（Phase 4）

```
                  +--------------------+
                  |   Bot エンティティ  |  <- 共通テーブル: bots
                  |   (共通フィールド)  |
                  |   id, hp, maxHp,   |
                  |   dailyId, ...     |
                  +--------+-----------+
                           |
               +-----------+-----------+
               |                       |
     +---------+---------+   +---------+--------+
     |   運営ボット       |   | ユーザー作成      |
     |   (YAML定義)       |   | ボット (DB定義)   |
     |                    |   |                   |
     | - bot_profiles.yaml|   | - owner_id        |
     |   から設定読み込み  |   | - user_prompt     |
     | - owner_id = NULL  |   | - template_id     |
     +--------------------+   | - gacha_result    |
                              +-------------------+
```

統合方針:
- `bots` テーブルに `owner_id` (NULLABLE FK -> users.id) を追加
- `owner_id = NULL` は運営ボット、`owner_id != NULL` はユーザー作成ボット
- Strategy 解決時に `owner_id` の有無で分岐する
- **プロンプトサニタイズ**: `UserPromptContentStrategy` 内で管理者プロンプト上書き + サニタイズを実行。ユーザー入力を直接 LLM に渡さない（CLAUDE.md 横断的制約）

#### 2.13.7 bot_profiles.yaml 拡張スキーマ

既存フィールド（`hp`, `max_hp`, `reward`, `fixed_messages`）に加え、以下のフィールドを追加する。全て**オプショナル**であり、未指定時は Phase 2 デフォルト値にフォールバックする。

| フィールド | 型 | 説明 | デフォルト値 |
|---|---|---|---|
| `content_strategy` | enum (`fixed_message` / `ai_topic` / `ai_conversation`) | コンテンツ生成方式 | `fixed_message` |
| `behavior_type` | enum (`random_thread` / `create_thread` / `reply`) | 行動パターン | `random_thread` |
| `scheduling` | object | スケジュール設定 | `{type: fixed_interval, min: 60, max: 120}` |
| `ai_config` | object | AI API 設定 | `null` |
| `topic_sources` | array | ネタ収集元 | `null` |
| `thread_creation` | object | スレッド作成設定 | `null` |
| `conversation` | object | 会話設定 | `null` |

`ai_config` の構造:

```yaml
ai_config:
  provider: google | openai | anthropic   # APIプロバイダー
  model: gemini-2.0-flash                 # 使用するAIモデル名
  system_prompt: "..."                    # システムプロンプト（ペルソナ定義）
  max_tokens: 500                         # 最大トークン数
  temperature: 0.8                        # 生成温度（0.0-1.0）
```

キュレーションBOTプロファイルの例:

```yaml
キュレーションBOT_テクノロジー:
  hp: 500
  max_hp: 500
  reward:
    base_reward: 500
    daily_bonus: 200
    attack_bonus: 50
  content_strategy: ai_topic
  behavior_type: create_thread
  scheduling:
    type: topic_driven
    min_interval_minutes: 120
    max_interval_minutes: 360
    collection_interval_minutes: 60
    post_after_collection_minutes: 10
  ai_config:
    provider: google
    model: gemini-2.0-flash
    system_prompt: |
      あなたはテクノロジーに詳しい掲示板の常連です。
      ネット上で話題になっているテクノロジーニュースを5ch風のスレタイに変換してください。
    max_tokens: 500
    temperature: 0.8
  topic_sources:
    - type: rss
      url: "https://news.ycombinator.com/rss"
      genre: テクノロジー
      priority: 1
  thread_creation:
    title_style: 5ch_news
    max_daily_threads: 5
  fixed_messages:
    - "【速報】テクノロジーの話題があるらしい"  # AI API障害時のフォールバック
```

#### 2.13.8 ファイル配置計画

```
src/lib/
  services/
    bot-service.ts                          # リファクタ（Strategy 委譲に変更）
    bot-strategies/                         # 新規ディレクトリ
      types.ts                              # Strategy インターフェース定義
      strategy-resolver.ts                  # resolveStrategies()
      ai-api-client.ts                      # AiApiClient インターフェース
      content/
        fixed-message.ts                    # Phase 2: 固定文ランダム
        ai-topic.ts                         # Phase 3: キュレーションBOT用
        ai-conversation.ts                  # Phase 4: 常連・火付け役用
        user-prompt.ts                      # Phase 4: ユーザー作成ボット用
      behavior/
        random-thread.ts                    # Phase 2: 既存スレッドランダム
        thread-creator.ts                   # Phase 3: スレッド作成
        reply.ts                            # Phase 4: 返信型
      scheduling/
        fixed-interval.ts                   # Phase 2: 60-120分
        topic-driven.ts                     # Phase 3: ネタ収集サイクル依存
        gacha.ts                            # Phase 4: ガチャ結果依存
  infrastructure/
    external/
      ai-adapters/                          # 新規ディレクトリ
        google-ai-adapter.ts                # Google Gemini
        openai-adapter.ts                   # OpenAI
        anthropic-adapter.ts                # Anthropic
```

依存方向: `bot-service.ts` -> `bot-strategies/types.ts` (インターフェース) <- `bot-strategies/content/*.ts` (実装)

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| PostService | ボット書き込みの実行（isBotWrite=trueで呼び出し。スレッド作成含む） |
| BotRepository | `bots` テーブルのCRUD（service_roleのみアクセス可） |
| BotPostRepository | `bot_posts` テーブルのINSERT・SELECT（service_roleのみ） |
| AttackRepository | `attacks` テーブルのINSERT・SELECT・DELETE（service_roleのみ） |
| ThreadRepository | スレッド一覧取得（書き込み先選択用） |
| BotStrategyResolver | bot_profiles.yaml / owner_id から Strategy 組を解決（v6 新規） |
| ContentStrategy 実装群 | コンテンツ生成の委譲先（v6 新規） |
| BehaviorStrategy 実装群 | 行動パターンの委譲先（v6 新規） |
| SchedulingStrategy 実装群 | スケジュールの委譲先（v6 新規） |
| AiApiClient | AI API 呼び出しの抽象化（ContentStrategy 実装が依存。v6 新規） |

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
CF Cron             ->  POST /api/internal/bot/execute
                          -> BotService.executeBotPost()  （荒らし役BOTの定期書き込み）
                          -> processPendingTutorials()     （チュートリアルBOTスポーン）
                        ※ GitHub Actions bot-scheduler は Sprint-84 で無効化。
                           荒らし役は CF Cron（5分間隔）に移行済み（TDR-013）。
GitHub Actions      ->  BotService.executeBotPost()      （AI API BOT用、Phase 3以降）
                        BotService.selectTargetThread()  // 後方互換ラッパー
daily-maintenance   ->  BotService.performDailyReset()
```

### 3.3 Strategy 実装の依存構造（v6 新規）

```
bot-service.ts
  |
  +-- bot-strategies/types.ts          (インターフェース定義)
  +-- bot-strategies/strategy-resolver.ts
  |     +-- bot_profiles.yaml          (プロファイル読み込み)
  |
  +-- bot-strategies/content/*.ts      (ContentStrategy 実装群)
  |     +-- ai-api-client.ts           (AI API を使用する実装のみ)
  |
  +-- bot-strategies/behavior/*.ts     (BehaviorStrategy 実装群)
  |     +-- ThreadRepository           (スレッド一覧取得)
  |     +-- CollectedTopicRepository   (キュレーションBOT: ネタ取得)
  |
  +-- bot-strategies/scheduling/*.ts   (SchedulingStrategy 実装群)

ai-api-client.ts
  +-- ai-adapters/google-ai-adapter.ts
  +-- ai-adapters/openai-adapter.ts
  +-- ai-adapters/anthropic-adapter.ts
```

---

## 4. 隠蔽する実装詳細

- 固定文リストの管理方法（config/bot_profiles.yaml の読み込み・キャッシュ）
- 偽装daily_idの生成アルゴリズム（一般ユーザーと同一の `daily-id` ドメインルールを使うが、seedが異なる）
- 書き込み先スレッド選択のランダムアルゴリズム（均等分布 or 重み付け）
- 撃破報酬パラメータのconfig読み込みとキャッシュ戦略
- attacks テーブルのクリーンアップ方式（DELETE or パーティション）
- Strategy 解決の内部ロジック（resolveStrategies の分岐条件とフォールバック）
- AI API プロバイダーの切り替えロジック（AiApiClient アダプター選択）
- ネタ収集ジョブの内部処理（収集頻度・バッファ管理・外部 API エラーハンドリング）

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
| next_post_at | 追加 | TIMESTAMPTZ | 次回投稿予定時刻。投稿完了時に `NOW() + SchedulingStrategy.getNextPostDelay()` で設定する。cron起動時は `WHERE is_active = true AND next_post_at <= NOW()` で投稿対象を判定する（TDR-010） |

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

### 5.3 bots テーブル追加カラム（v6 -- Phase 4 用）

| カラム | 変更種別 | 型 | 説明 | 適用Phase |
|---|---|---|---|---|
| `owner_id` | 追加 | UUID (FK -> users.id), NULLABLE | ユーザー作成ボットのオーナー。NULL = 運営ボット | 4 |
| `bot_type` | 追加 | VARCHAR DEFAULT 'system' | `'system'`(運営) / `'user_created'`(ユーザー作成) | 4 |

### 5.4 新規テーブル: bot_user_configs（Phase 4）

ユーザー作成ボット固有の設定を格納する。

| カラム | 型 | 説明 |
|---|---|---|
| `bot_id` | UUID (PK, FK -> bots.id) | 対象ボット |
| `template_id` | VARCHAR | 人格テンプレートID |
| `personality_sliders` | JSONB | 性格スライダー値 |
| `user_prompt` | TEXT | ユーザー記述プロンプト（サニタイズ前の原本） |
| `sanitized_prompt` | TEXT | サニタイズ済みプロンプト（実際にLLMに渡すもの） |
| `gacha_result` | JSONB | ガチャ結果（行動頻度、攻撃力、コマンド枠等） |
| `created_at` | TIMESTAMPTZ | 作成日時 |

RLSポリシー: `anon` / `authenticated` ロールからの全操作を DENY。`service_role` のみアクセス可能。

### 5.5 新規テーブル: collected_topics（Phase 3）

キュレーションBOTが収集したネタ情報のバッファ。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID (PK) | 内部識別子 |
| `source_type` | VARCHAR | 収集元種別（`rss`, `api`, etc.） |
| `source_url` | TEXT | 収集元URL |
| `original_title` | TEXT | 元タイトル |
| `generated_title` | TEXT | AI生成した5ch風スレタイ |
| `generated_body` | TEXT | AI生成した本文 |
| `genre` | VARCHAR | ジャンル |
| `used` | BOOLEAN DEFAULT false | 使用済みフラグ |
| `created_at` | TIMESTAMPTZ | 収集日時 |

RLSポリシー: `anon` / `authenticated` ロールからの全操作を DENY。`service_role` のみアクセス可能。

### 5.6 マイグレーション方針

v5 マイグレーション（実施済み）:
1. `bots` テーブルに `times_attacked` カラムを追加（ALTER TABLE ADD COLUMN ... DEFAULT 0）
2. `bots` テーブルに `bot_profile_key` カラムを追加（ALTER TABLE ADD COLUMN）
3. `attacks` テーブルを新規作成（CREATE TABLE + RLSポリシー + インデックス）
4. 既存の荒らし役ボットの hp/max_hp を 10 に更新（UPDATE）
5. マイグレーションは `supabase migration new bot_v5_attack_system` で作成

v6 マイグレーション（Phase 3 実装時）:
1. `collected_topics` テーブルを新規作成（CREATE TABLE + RLSポリシー）

v6 マイグレーション（Phase 4 実装時）:
1. `bots` テーブルに `owner_id`, `bot_type` カラムを追加
2. `bot_user_configs` テーブルを新規作成（CREATE TABLE + RLSポリシー）

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

### 6.7 Strategy パターンの採用（v6）

Phase 3（キュレーションBOT）・Phase 4（ユーザー作成ボット）でBOT種別が増加する際、`executeBotPost` 内の if/switch 分岐で対応すると、コンテンツ生成 x 行動パターン x スケジュールの3軸の組み合わせ爆発が起きる。Strategy パターンで3軸を独立のインターフェースとして分離することで、BOT種別追加時に新 Strategy を追加するだけで既存コードの変更を最小限に抑える。

検討した代替案:
- **サブクラス継承**: 3軸の組み合わせを継承で表現すると菱形継承に陥る。TypeScript には多重継承がない
- **完全分離（種別ごとに独立 BotService）**: HP管理・BOTマーク・撃破報酬・日次リセットなど共通ロジックの重複が大きい

TDR-008 に正式な意思決定記録を残す。

### 6.8 TASK-122 実装の位置づけ（v6）

現在の固定文ランダム選択ロジックを `FixedMessageContentStrategy`、既存スレッドランダム選択を `RandomThreadBehaviorStrategy`、60-120分間隔を `FixedIntervalSchedulingStrategy` として切り出す。BotService の `executeBotPost()` はこれらの Strategy を呼び出す形にリファクタされるが、外部呼び出しの動作結果は変わらない。

### 6.9 プロバイダー抽象化レイヤーの採用（v6）

Phase 3 以降、複数の AI API プロバイダー（Google Gemini, OpenAI, Anthropic）を使い分ける可能性があるため、`AiApiClient` インターフェースでプロバイダー差異を吸収する。`bot_profiles.yaml` の `ai_config.provider` フィールドでボットごとにプロバイダーを指定可能とする。

採用理由:
- キュレーションBOTは Gemini（低コスト・高速）、常連は Claude/GPT（文脈理解力重視）のように使い分けができる
- 特定プロバイダー障害時に他プロバイダーへの切り替えが容易

### 6.10 チュートリアルBOTの設計方針（Sprint-84）

チュートリアルBOTは「初回書き込みユーザーにゲーム機能を体験させる」ためのウェルカムシーケンスの一部として設計された。通常のBOTとは以下の点で異なる。

- **1回限りの消耗品**: 初回書き込みを検出した時点で `pending_tutorials` テーブルにキューイングし、次の CF Cron 実行時にスポーン・即時書き込み実行する。書き込み後は再投稿しない（`ImmediateSchedulingStrategy`, delay=0）。
- **日次リセット除外**: 撃破されても翌日の `bulkReviveEliminated` で復活させない。チュートリアルBOTが毎日再出現するとゲームバランスが崩れるため。
- **自動クリーンアップ**: 撃破後は翌日の `deleteEliminatedTutorialBots` で DB から削除する。7日経過した未撃破チュートリアルBOTも削除する（チュートリアル放置ユーザーへの配慮）。
- **botUserId の追加**: チュートリアルBOTの書き込み `>>N !w\n新参おるやん🤣` には `!w` コマンドが含まれる。BOT書き込み時の `resolvedAuthorId` は通常 null だが、`PostInput.botUserId` フィールドを追加することでコマンドパイプラインが BOT 自身の ID で実行される。GrassHandler の voter_id に FK 制約がないため、botId をそのまま利用できる。

### 6.11 インカーネーションモデル — ボット復活方式

運営ボットの日次リセット復活時、既存レコードを UPDATE せず **新規レコードを INSERT** する。旧レコードは撃破済み状態のまま凍結し、履歴として永続保持する。

**背景（UPDATE 方式の問題）**:

`bot_posts` は `postId → botId` で紐づく。UPDATE 方式では復活後のボットが過去日の書き込みと同一 botId を共有するため、前日撃破されたレスに翌日攻撃すると「未撃破」扱いになる。偽装 ID リセットの意味が消失し「毎日が新しい推理ゲーム」の設計意図と矛盾する。

**方針**:

| 操作 | 対象 | 内容 |
|---|---|---|
| 凍結 | 旧 bots レコード | `is_active = false` のまま保持。`bot_posts` 紐付けも維持 |
| INSERT | 新 bots レコード | 同一 `bot_profile_key`・`name` で新世代を作成。HP=max_hp, is_active=true, is_revealed=false, survival_days=0 |

**既存ロジックへの影響**:

旧レスへの操作は旧 botId → 旧 bots レコード（凍結済み）を参照するため、以下はすべて変更不要で正しく動作する。

- BOTマーク表示: 旧 bot の `is_revealed` を参照 → 表示維持
- `!attack >>旧レス番号`: 旧 bot の `is_active = false` → 「撃破済み」でスキップ
- `!tell >>旧レス番号`: 旧 bot の `is_revealed = true` → 既に暴露済みとして処理
- 投稿 cron: `WHERE is_active = true` → 新レコードのみ対象
- `canAttackToday`: 新 botId に対する攻撃記録なし → 全員攻撃可能

**適用対象**: 日次リセットで復活する全運営ボット。チュートリアルBOTは復活しないため対象外。

**DB増加量**: 1日最大10レコード（荒らし役10体）。問題にならない規模。

### 6.12 ネタ収集と投稿の分離（v6）

キュレーションBOTの「ネタ収集」と「投稿」を分離し、`collected_topics` テーブルをバッファとする。収集ジョブと投稿ジョブは独立した GitHub Actions ジョブとして実行する。

採用理由:
- 外部 API（RSS等）障害の影響を投稿から隔離
- 収集頻度と投稿頻度を独立に制御可能
- バッファにネタがある限り投稿を継続可能
