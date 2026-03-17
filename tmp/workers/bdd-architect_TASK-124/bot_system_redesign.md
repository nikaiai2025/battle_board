# Phase 3 BOTシステム再設計書

> タスク: TASK-124
> 作成日: 2026-03-17
> 作成者: bdd-architect
> ステータス: レビュー待ち

---

## 1. 現状分析

### 1.1 TASK-122 で実装された構造

TASK-122 は Phase 2 MVP（荒らし役10体）をターゲットに実装され、以下の構造を持つ。

| 要素 | 現状 | 問題 |
|---|---|---|
| `executeBotPost()` | 固定文リストからランダム選択のみ | AI API 呼び出しパスが存在しない |
| `selectTargetThread()` | 既存スレッドからランダム1件 | スレッド作成（ネタ師の主機能）を扱えない |
| `getNextPostDelay()` | 全BOT共通の 60-120分固定 | 種別ごとの頻度差異を表現できない |
| `bot_profiles.yaml` | `hp`, `max_hp`, `reward`, `fixed_messages` のみ | コンテンツ生成方式・行動パターン・スケジュールの定義が不在 |
| `BotService` クラス | 単一クラスに全ロジック集約 | 種別ごとの分岐が増えるとクラスが肥大化する |

### 1.2 具体的なハードコード箇所

**bot-service.ts L585-649 (`executeBotPost`)**:
- L603: `this.getFixedMessages(bot.botProfileKey)` で固定文を取得 -> ランダム選択
- コンテンツ生成方式が1つしかなく、AI API 経由の文章生成パスが存在しない

**bot-service.ts L667-688 (`selectTargetThread`)**:
- L676-677: `threadRepository.findByBoardId()` -> ランダム選択のみ
- スレッド作成という行動パターンが存在しない

**bot-service.ts L705-709 (`getNextPostDelay`)**:
- 60-120分の固定値を返すのみ
- BOT種別やプロファイルへの参照が一切ない

### 1.3 Phase 3/4 で必要となるBOT行動の差分

| 次元 | 荒らし役 (Phase 2) | ネタ師 (Phase 3) | 常連・火付け役 (Phase 4) | ユーザー作成ボット (Phase 4) |
|---|---|---|---|---|
| コンテンツ生成 | 固定文リスト | AI API + Web収集 | AI対話（文脈理解） | AI対話（ユーザー設定プロンプト） |
| 行動: 投稿先 | 既存スレッドへランダム | **新規スレッド作成** | 既存会話に返信 | 可変 |
| 行動: 頻度 | 60-120分 | ネタ収集サイクル依存 | 文脈依存 | ガチャで決定 |
| HP | 10（即死級） | 超高（レイドボス） | ペルソナ依存 | ガチャで決定 |
| 管理元 | YAML定義 | YAML定義 | YAML定義 | DB定義（ユーザー作成） |
| プロンプト | 不要 | 運営管理 | 運営管理 | ユーザー設定 + サニタイズ |

---

## 2. 設計方針

### 2.1 基本方針: Strategy パターンによるコンテンツ生成・行動パターンの差し替え

BOT種別ごとに異なる3つの関心事を Strategy インターフェースとして抽出する。

1. **ContentStrategy** -- 何を書くか（コンテンツ生成）
2. **BehaviorStrategy** -- どこに書くか（投稿先選択・スレッド作成）
3. **SchedulingStrategy** -- いつ書くか（書き込み間隔）

BotService はこれらのインターフェースを通じて処理を委譲し、具体的なBOT種別の振る舞いを知らない。

### 2.2 方針の根拠

**Strategy パターンを選択した理由:**

- 現在の `executeBotPost` 内のインライン分岐を、BOT種別が増えるたびに拡張するのは Open-Closed 原則に反する
- 荒らし役/ネタ師/常連/ユーザー作成ボットの4種別は、コンテンツ生成・行動パターン・スケジュールの3軸で独立に異なる。この3軸の組み合わせを if/switch で管理すると爆発する
- 各 Strategy は独立にテスト可能（純粋関数 or モック可能なインターフェース）

**検討した代替案:**

| 代替案 | 不採用理由 |
|---|---|
| サブクラス継承（BotService の荒らし役版・ネタ師版...） | 3軸の組み合わせを継承で表現すると菱形継承に陥る。TypeScript には多重継承がない |
| if/switch 分岐の追加 | Phase 4 でペルソナが5種以上、ユーザー作成ボットを含めると条件分岐の組み合わせが爆発する |
| 別クラスとして完全分離（荒らしBotService, ネタ師BotService...） | HP管理・BOTマーク・撃破報酬・日次リセットなど共通ロジックの重複が大きい |

### 2.3 TASK-122 実装の扱い: **方針C（汎用インターフェースの一実装として位置づける）**

**選択: C**

現在の固定文ランダム選択ロジックを `FixedMessageContentStrategy` として切り出し、既存スレッドランダム選択を `RandomThreadBehaviorStrategy` として切り出し、60-120分間隔を `FixedIntervalSchedulingStrategy` として切り出す。

BotService の `executeBotPost()` はこれらの Strategy を呼び出す形にリファクタされるが、外部インターフェース（GitHub Actions からの呼び出しシグネチャ）は変更しない。

**A（リファクタして汎用化）を不採用とした理由:** 汎用化の度合いが曖昧。何をもって「汎用」とするかが定まらず、YAGNI のリスクがある。
**B（荒らし役専用として残す）を不採用とした理由:** 共通ロジック（HP管理、偽装ID、日次リセット、撃破報酬）が全種別で必要であり、並行して2つのBotServiceが存在する設計は保守コストが高い。

---

## 3. 推奨アーキテクチャ

### 3.1 インターフェース定義

```typescript
// ==============================
// Strategy インターフェース
// ==============================

/**
 * コンテンツ生成戦略。
 * BOT種別ごとに「何を書くか」を決定する。
 */
interface ContentStrategy {
  /**
   * 書き込み本文を生成する。
   * @param context - 生成に必要なコンテキスト情報
   * @returns 書き込み本文（単一の文字列）
   */
  generateContent(context: ContentGenerationContext): Promise<string>;
}

/**
 * コンテンツ生成に必要なコンテキスト情報。
 * Strategy ごとに必要な情報が異なるが、共通のスーパーセットとして定義する。
 */
interface ContentGenerationContext {
  botId: string;
  botProfileKey: string | null;
  threadId: string;
  /** ネタ師用: 収集済みのネタ情報 */
  collectedTopic?: CollectedTopic;
  /** AI対話用: スレッドの直近レス（文脈理解に使用） */
  recentPosts?: RecentPostSummary[];
  /** ユーザー作成ボット用: サニタイズ済みプロンプト */
  sanitizedUserPrompt?: string;
}

/**
 * 行動パターン戦略。
 * BOT種別ごとに「どこに書くか」を決定する。
 */
interface BehaviorStrategy {
  /**
   * 書き込み先を決定する。
   * 既存スレッドへの投稿か、新規スレッド作成かを含む。
   * @returns 行動結果（既存スレッドID or 新規スレッド作成指示）
   */
  decideAction(context: BehaviorContext): Promise<BotAction>;
}

/**
 * 行動決定に必要なコンテキスト。
 */
interface BehaviorContext {
  botId: string;
  botProfileKey: string | null;
  boardId: string;
}

/**
 * 行動の結果を表す判別共用体。
 */
type BotAction =
  | { type: 'post_to_existing'; threadId: string }
  | { type: 'create_thread'; title: string; body: string };

/**
 * スケジュール戦略。
 * BOT種別ごとに「いつ書くか」を決定する。
 */
interface SchedulingStrategy {
  /**
   * 次回書き込みまでの遅延を返す（分単位）。
   */
  getNextPostDelay(context: SchedulingContext): number;
}

interface SchedulingContext {
  botId: string;
  botProfileKey: string | null;
}
```

### 3.2 Strategy 実装の一覧

| Strategy インターフェース | 実装クラス | Phase | 対応BOT種別 |
|---|---|---|---|
| ContentStrategy | `FixedMessageContentStrategy` | 2 (既存) | 荒らし役 |
| ContentStrategy | `AiTopicContentStrategy` | 3 | ネタ師 |
| ContentStrategy | `AiConversationContentStrategy` | 4 | 常連・火付け役 |
| ContentStrategy | `UserPromptContentStrategy` | 4 | ユーザー作成ボット |
| BehaviorStrategy | `RandomThreadBehaviorStrategy` | 2 (既存) | 荒らし役 |
| BehaviorStrategy | `ThreadCreatorBehaviorStrategy` | 3 | ネタ師 |
| BehaviorStrategy | `ReplyBehaviorStrategy` | 4 | 常連・火付け役 |
| BehaviorStrategy | `ConfigurableBehaviorStrategy` | 4 | ユーザー作成ボット |
| SchedulingStrategy | `FixedIntervalSchedulingStrategy` | 2 (既存) | 荒らし役 |
| SchedulingStrategy | `TopicDrivenSchedulingStrategy` | 3 | ネタ師 |
| SchedulingStrategy | `GachaSchedulingStrategy` | 4 | ユーザー作成ボット |

### 3.3 BotService のリファクタ後の構造

```
                   ┌─────────────────────────────────┐
                   │           BotService             │
                   │                                  │
                   │  executeBotPost(botId, ...)       │
                   │    1. resolveStrategies(bot)      │
                   │    2. behavior.decideAction()     │
                   │    3. content.generateContent()   │
                   │    4. PostService.createPost()    │
                   │    5. botPostRepository.create()  │
                   │                                  │
                   │  ---- 以下は変更なし ----         │
                   │  applyDamage(...)                 │
                   │  isBot(...)                       │
                   │  getBotByPostId(...)              │
                   │  revealBot(...)                   │
                   │  canAttackToday(...)              │
                   │  recordAttack(...)                │
                   │  performDailyReset(...)           │
                   │  getDailyId(...)                  │
                   │  calculateEliminationReward(...)  │
                   └───────────┬─────────────────────┘
                               │
                   ┌───────────┼───────────────────┐
                   │           │                   │
                   ▼           ▼                   ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │  Content     │ │  Behavior    │ │  Scheduling  │
          │  Strategy    │ │  Strategy    │ │  Strategy    │
          └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                 │                │                │
         ┌───────┼──────┐   ┌────┼────┐      ┌────┼────┐
         │       │      │   │    │    │      │    │    │
         ▼       ▼      ▼   ▼    ▼    ▼      ▼    ▼    ▼
       Fixed   AiTopic AiConv Random Create Reply Fixed Topic Gacha
       Msg     Content  ...  Thread Thread  ...  Intv  Driven ...
```

### 3.4 Strategy の解決方法（resolveStrategies）

BOTのプロファイルキーと管理種別（運営 or ユーザー作成）から適切な Strategy の組を解決する。

```typescript
/**
 * BotStrategyResolver -- ボットのプロファイルから Strategy の組を解決する。
 *
 * 解決ルール:
 *   1. bot_profiles.yaml の content_strategy / behavior_type フィールドで指定
 *   2. ユーザー作成ボット（owner_id が存在）は専用 Strategy を使用
 *   3. フォールバック: FixedMessage + RandomThread + FixedInterval
 */
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
1. `bot_profiles.yaml` の `content_strategy` / `behavior_type` / `scheduling` フィールド
2. ユーザー作成ボット判定（`owner_id` の存在）-> 専用 Strategy
3. デフォルト（荒らし役互換）

### 3.5 ネタ師の行動フロー（Phase 3 の主要ユースケース）

```
GitHub Actions (cron)
  │
  ▼
BotService.executeBotPost(botId)
  │
  ├── resolveStrategies(bot)
  │     -> AiTopicContentStrategy
  │     -> ThreadCreatorBehaviorStrategy
  │     -> TopicDrivenSchedulingStrategy
  │
  ├── behavior.decideAction()
  │     -> { type: 'create_thread', title: '【悲報】○○...', body: '...' }
  │
  ├── content.generateContent() は create_thread の場合スキップ
  │   （title と body は behavior が決定済み）
  │
  ├── PostService.createThread(title, body, isBotWrite=true)  ★新規
  │
  └── botPostRepository.create(postId, botId)
```

**設計上のポイント:**
- ネタ師の `ThreadCreatorBehaviorStrategy` は `{ type: 'create_thread' }` を返す
- この場合 `executeBotPost` は `createPost` ではなく `createThread` を呼ぶ（新規追加が必要）
- ネタ収集（Web スクレイピング + AI 要約）は `AiTopicContentStrategy` 内部、または外部の収集ジョブが事前に行い、結果を `CollectedTopic` として渡す
- **CLAUDE.md 制約遵守**: スレッド作成も PostService 経由で行い、DB 直書きは行わない

### 3.6 ユーザー作成ボットの管理構造（Phase 4）

運営ボットとユーザー作成ボットの管理元が根本的に異なる問題への設計方針。

```
                  ┌───────────────────┐
                  │   Bot エンティティ │  ← 共通テーブル: bots
                  │   (共通フィールド) │
                  │   id, hp, maxHp,  │
                  │   dailyId, ...    │
                  └───────┬───────────┘
                          │
              ┌───────────┼───────────┐
              │                       │
    ┌─────────┴─────────┐   ┌────────┴────────┐
    │   運営ボット       │   │ ユーザー作成     │
    │   (YAML定義)       │   │ ボット (DB定義)  │
    │                    │   │                  │
    │ - bot_profiles.yaml│   │ - owner_id       │
    │   から設定読み込み │   │ - user_prompt    │
    │ - persona は YAML  │   │ - template_id    │
    │ - owner_id = NULL  │   │ - personality    │
    └────────────────────┘   │ - gacha_result   │
                             └─────────────────┘
```

**統合方針:**
- `bots` テーブルに `owner_id` (NULLABLE FK -> users.id) を追加
- `owner_id = NULL` は運営ボット、`owner_id != NULL` はユーザー作成ボット
- 運営ボットの設定は引き続き `bot_profiles.yaml` から読み込む
- ユーザー作成ボットの設定は `bots` テーブルの追加カラム + 新設 `bot_user_configs` テーブルに保持
- Strategy の解決時に `owner_id` の有無で分岐する

**CLAUDE.md 横断的制約との整合:**
- **プロンプトサニタイズ**: `UserPromptContentStrategy` 内で管理者プロンプト上書き + サニタイズを実行。ユーザー入力をそのまま LLM に渡さない
- **同一 API 経由の書き込み**: ユーザー作成ボットも `PostService.createPost(isBotWrite=true)` を通る。直接 DB 書き換えは禁止

### 3.7 ファイル配置計画

```
src/lib/
  services/
    bot-service.ts                          # リファクタ（Strategy 委譲に変更）
    bot-strategies/                         # 新規ディレクトリ
      types.ts                              # Strategy インターフェース定義
      strategy-resolver.ts                  # resolveStrategies()
      content/
        fixed-message.ts                    # Phase 2: 固定文ランダム
        ai-topic.ts                         # Phase 3: ネタ師用
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

config/
  bot_profiles.yaml                         # スキーマ拡張（後述）
```

依存方向: `bot-service.ts` -> `bot-strategies/types.ts` (インターフェース) <- `bot-strategies/content/*.ts` (実装)

---

## 4. bot_profiles.yaml スキーマ拡張

別ファイル `bot_profiles_schema_proposal.yaml` に詳細を記載。ここでは要点のみ。

### 4.1 拡張フィールド

| フィールド | 型 | 説明 | 荒らし役 | ネタ師 |
|---|---|---|---|---|
| `content_strategy` | enum | コンテンツ生成方式 | `fixed_message` | `ai_topic` |
| `behavior_type` | enum | 行動パターン | `random_thread` | `create_thread` |
| `scheduling` | object | スケジュール設定 | `{type: fixed_interval, min: 60, max: 120}` | `{type: topic_driven, ...}` |
| `ai_config` | object | AI API 設定 | null | `{model, system_prompt, ...}` |
| `topic_sources` | array | ネタ収集元 | null | `[{type: rss, url: ...}]` |

### 4.2 下位互換性

既存の荒らし役プロファイルは変更なし。新フィールドはすべてオプショナルとし、未指定時は Phase 2 デフォルト（固定文 + ランダムスレッド + 60-120分）にフォールバックする。

---

## 5. データモデル拡張計画

### 5.1 bots テーブルの追加カラム

| カラム | 型 | 説明 | Phase |
|---|---|---|---|
| `owner_id` | UUID (FK -> users.id), NULLABLE | ユーザー作成ボットのオーナー。NULL = 運営ボット | 4 |
| `bot_type` | VARCHAR DEFAULT 'system' | `'system'`(運営) / `'user_created'`(ユーザー作成) | 4 |

### 5.2 新規テーブル: bot_user_configs

Phase 4 でユーザー作成ボット固有の設定を格納する。

| カラム | 型 | 説明 |
|---|---|---|
| `bot_id` | UUID (PK, FK -> bots.id) | 対象ボット |
| `template_id` | VARCHAR | 人格テンプレートID |
| `personality_sliders` | JSONB | 性格スライダー値 |
| `user_prompt` | TEXT | ユーザー記述プロンプト（サニタイズ前の原本） |
| `sanitized_prompt` | TEXT | サニタイズ済みプロンプト（実際にLLMに渡すもの） |
| `gacha_result` | JSONB | ガチャ結果（行動頻度、攻撃力、コマンド枠等） |
| `created_at` | TIMESTAMPTZ | 作成日時 |

### 5.3 新規テーブル: collected_topics

Phase 3 でネタ師ボットが収集したネタ情報を格納する。

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

---

## 6. 段階的移行計画

### 6.1 Phase 2 -> Phase 3 の移行ステップ

荒らし役の既存動作を一切壊さずに拡張する段階的な手順。

#### Step 1: Strategy インターフェースの導入（コードのみ、動作変更なし）

1. `src/lib/services/bot-strategies/types.ts` に 3つの Strategy インターフェースを定義
2. `FixedMessageContentStrategy` を実装（現在の `getFixedMessages()` + ランダム選択を移植）
3. `RandomThreadBehaviorStrategy` を実装（現在の `selectTargetThread()` ロジックを移植）
4. `FixedIntervalSchedulingStrategy` を実装（現在の `getNextPostDelay()` ロジックを移植）
5. `strategy-resolver.ts` を実装（荒らし役 -> 上記3つの Strategy を返す）

**検証**: 既存の BDD テスト (`npx cucumber-js`) と単体テスト (`npx vitest run`) が全パス

#### Step 2: BotService のリファクタ

1. `executeBotPost()` を Strategy 委譲に書き換え
2. `selectTargetThread()` を BehaviorStrategy に委譲
3. `getNextPostDelay()` を SchedulingStrategy に委譲
4. 外部インターフェース（メソッドシグネチャ、返り値型）は変更しない

**検証**: 既存テストが全パス（動作は同一のため）

#### Step 3: bot_profiles.yaml スキーマ拡張

1. 新フィールド（`content_strategy`, `behavior_type`, `scheduling`）を追加
2. 荒らし役にデフォルト値を明示的に設定
3. `strategy-resolver.ts` を新フィールド対応に更新

**検証**: 荒らし役の動作に変更がないことを確認

#### Step 4: ネタ師の実装（Phase 3 本体）

1. `AiTopicContentStrategy` を実装
2. `ThreadCreatorBehaviorStrategy` を実装
3. `TopicDrivenSchedulingStrategy` を実装
4. `bot_profiles.yaml` にネタ師プロファイルを追加
5. `executeBotPost()` の `BotAction.type === 'create_thread'` 分岐を実装
6. PostService にスレッド作成のBOT用パスを追加（`createThread(isBotWrite=true)`）
7. collected_topics テーブルのマイグレーション
8. ネタ収集ジョブ（GitHub Actions）を追加

**検証**: ネタ師の BDD シナリオ（新規作成が必要）+ 荒らし役の既存テスト全パス

### 6.2 Phase 3 -> Phase 4 の移行ステップ（概要のみ）

1. `bots` テーブルに `owner_id`, `bot_type` カラムを追加
2. `bot_user_configs` テーブルを作成
3. `UserPromptContentStrategy` を実装（プロンプトサニタイズ含む）
4. `ConfigurableBehaviorStrategy`, `GachaSchedulingStrategy` を実装
5. マイページのボット管理 UI を実装
6. ガチャシステムを実装

---

## 7. リスクと制約

### 7.1 CLAUDE.md 横断的制約との整合性確認

| 制約 | 本設計での対応 |
|---|---|
| ユーザー作成ボットのプロンプトサニタイズ | `UserPromptContentStrategy` 内で管理者プロンプト上書き + サニタイズ。ユーザー入力を直接 LLM に渡さない |
| AIボットの書き込みは同一APIを通じて行う | 全BOT種別が `PostService.createPost(isBotWrite=true)` を経由。ネタ師のスレッド作成も PostService 経由 |
| 環境変数をクライアントサイドに含めない | AI API キーは GitHub Actions Secrets に格納。クライアントコードからは参照しない |
| インフラ追加時のエスカレーション | ネタ収集の外部 API（RSS等）は既存インフラ（GitHub Actions）から呼び出す。新インフラは不要 |

### 7.2 設計上のリスク

| リスク | 影響度 | 対策 |
|---|---|---|
| Strategy の過剰抽象化 | 中 | Phase 3 で必要な Strategy のみ実装。Phase 4 の Strategy は Phase 4 開始時に設計する |
| ContentGenerationContext の肥大化 | 低 | オプショナルフィールドとし、各 Strategy は必要なフィールドのみ参照。型安全性は Strategy 実装内でガード。Phase 4 でフィールド数が増えた場合は判別共用体（`type` フィールドでの分岐）またはジェネリクスへの移行を検討する |
| ネタ収集の外部 API 障害 | 中 | 収集と投稿を分離。`collected_topics` テーブルにバッファすることで、収集障害時もバッファ内のネタで投稿を継続 |
| BotAction の `create_thread` パスが PostService に波及 | 低 | PostService の既存 `createPost` は変更しない。`createThread` は既にスレッド作成 API として存在する可能性が高い（Phase 1 実装）ため、BOT用の呼び出しパスを追加するのみ |

---

## 8. トレードオフ分析サマリー

### 判断1: Strategy パターンの採用

- **メリット**: BOT種別追加時に新 Strategy を追加するだけでよい。既存コードの変更が最小限。テスト容易
- **デメリット**: インターフェース定義のオーバーヘッド。Phase 2 の荒らし役だけなら過剰
- **決定**: 採用。Phase 3 のネタ師が確定しており、Phase 4 でさらに増えることが明確なため、投資に見合う

### 判断2: 運営ボットとユーザー作成ボットの統合管理

- **メリット**: HP管理・撃破・日次リセット等の共通ロジックを単一の BotService で処理。データモデルの統一
- **デメリット**: `bots` テーブルに `owner_id` 等のカラムが増え、運営ボットでは NULL になるフィールドが発生
- **決定**: 統合。NULLABLE カラムの増加は許容範囲であり、テーブル分離による JOIN コストの方が問題

### 判断3: ネタ収集と投稿の分離

- **メリット**: 外部 API 障害の影響を投稿から隔離。収集頻度と投稿頻度を独立に制御可能
- **デメリット**: `collected_topics` テーブルの追加。収集ジョブと投稿ジョブの2つの GitHub Actions ジョブが必要
- **決定**: 分離。ネタ師の信頼性確保のため。バッファにネタがある限り投稿を継続できる
