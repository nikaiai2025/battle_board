# TASK-349 詳細実装設計書: キュレーションBOT Phase A

> 対象: `features/curation_bot.feature` v2 全13シナリオ
> ステータス: ドラフト
> 作成日: 2026-03-28
> 正本参照: D-08 bot.md v7 / features/curation_bot.feature v2

---

## 1. BDDステップ設計 (curation_bot.steps.ts)

### 1.1 ファイル配置

`features/step_definitions/curation_bot.steps.ts`

### 1.2 ステップ一覧

13シナリオを構成する Given/When/Then の全ステップと実装方針を以下に示す。

#### 収集バッチ (5シナリオ)

**S1: 日次バッチでバズデータを収集・蓄積する**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `日次収集バッチが実行される` | InMemory CollectionAdapter (subject_txt) をモック登録。BOTプロファイル `curation_newsplus` をセットアップ。InMemoryCollectedTopicRepo を初期化 |
| When | `外部ソースからバズスコア上位6件を取得する` | `runCollectionJob()` を呼び出す。InMemory adapter は事前セットした 6件の CollectedItem を返す |
| Then | `記事タイトル・投稿内容・元ネタURL・バズスコアをDBに保存する` | InMemoryCollectedTopicRepo の保存データを検証。4フィールドが全件存在することを assert |

**S2: Wikipedia定番記事を月次バッチで収集する**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `Wikipedia月次収集バッチが実行される` | Wikipedia用のモック adapter をセットアップ（`monthly: true`）|
| When | `月次閲覧数トップ6件と冒頭段落を取得する` | `runCollectionJob()` 呼び出し |
| Then | `記事タイトル・冒頭段落・元ネタURL・月次閲覧数をDBに保存する` | InMemoryCollectedTopicRepo を検証 |

**S3: 投稿内容の取得に失敗した場合は元ネタURLのみ保存する**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `日次収集バッチが実行される` | S1と同一 Given を再利用 |
| When | `外部記事の投稿内容取得が失敗する` | モック adapter が `content: null` のアイテムを返す |
| Then | `投稿内容なし・元ネタURLありの状態でDBに保存する` | 保存データの `content === null` かつ `sourceUrl` が存在することを assert |

**S4: ソースごとの蓄積上限は6件である**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `日次収集バッチが実行される` | S1と同一 |
| When | `あるソースのバズアイテムが6件を超える` | モック adapter が 10件を返す |
| Then | `バズスコアの高い順に6件のみ保存し残りは破棄する` | 保存件数 === 6 かつ buzzScore 降順であることを assert |

**S5: データ取得失敗時は前回の蓄積データを保持する**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `あるソースの前回蓄積データが存在する` | InMemoryCollectedTopicRepo に前回日付の 6件を直接セットアップ |
| When | `日次収集バッチでそのソースのデータ取得が失敗する` | モック adapter が例外をスローするように設定し、`runCollectionJob()` を実行 |
| Then | `前回の蓄積データは上書きされずに保持される` | 前回データが InMemoryCollectedTopicRepo にそのまま残存していることを assert |

#### BOT投稿 (7シナリオ)

**S6: キュレーションBOTが蓄積データから新規スレッドを立てる**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTの投稿タイミングが来た` | curation_newsplus BOT を InMemoryBotRepo に作成（`next_post_at <= NOW()`）|
| Given | `最新の蓄積データに未投稿のアイテムが存在する` | InMemoryCollectedTopicRepo に当日の未投稿アイテムを 3件セット |
| When | `未投稿のアイテムからランダムに1件を選択する` | `executeBotPost(botId)` を呼び出す（内部で ThreadCreatorBehaviorStrategy が走る）|
| Then | `記事タイトルをスレッドタイトルとして新規スレッドを作成する` | InMemoryThreadRepo に新スレッドが作成され、タイトルが一致することを assert |
| Then | `>>1 に投稿内容と末尾の元ネタURLを書き込む` | 作成されたレスの body が `{content}\n\n元ネタ: {source_url}` 形式であることを assert |

**S7: 投稿内容がない場合は元ネタURLのみ>>1に書き込む**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTの投稿タイミングが来た` | S6と同一 |
| Given | `選択されたバズアイテムの投稿内容が存在しない` | 未投稿アイテム 1件（`content: null`）をセット |
| When | `新規スレッドを作成する` | `executeBotPost(botId)` |
| Then | `>>1 に元ネタURLのみを書き込む` | body が `{source_url}` のみであることを assert |

**S8: BOTの投稿間隔は240分〜360分のランダム間隔である**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTが前回投稿を完了した` | 投稿実行済み状態のBOTをセットアップ |
| When | `次回投稿タイミングを決定する` | TopicDrivenSchedulingStrategy.getNextPostDelay() を直接呼び出す |
| Then | `240分以上360分以内のランダムな間隔が設定される` | 返り値が 240 <= delay <= 360 であることを assert（100回ループで範囲外がないことを検証）|

**S9: 投稿済みアイテムは選択候補から除外される**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTの蓄積データが6件存在する` | 6件セット |
| Given | `そのうち3件が投稿済みである` | 3件の `is_posted = true` に更新 |
| When | `投稿タイミングが来る` | `executeBotPost(botId)` |
| Then | `未投稿の3件からランダムに1件が選択される` | 投稿されたアイテムが is_posted=false の3件のいずれかであることを assert |

**S10: 当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTの当日蓄積データが全て投稿済みである` | 当日 6件すべて `is_posted = true` |
| Given | `前日の蓄積データに未投稿のアイテムが存在する` | 前日分に未投稿 3件をセット |
| When | `投稿タイミングが来る` | `executeBotPost(botId)` |
| Then | `前日の未投稿アイテムからランダムに1件が選択される` | 投稿されたアイテムの `collected_date` が前日であることを assert |

**S11: 蓄積データが存在しない場合は投稿をスキップする**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTの蓄積データが0件である` | InMemoryCollectedTopicRepo を空にする |
| When | `投稿タイミングが来る` | `executeBotPost(botId)` |
| Then | `投稿はスキップされ次回タイミングまで待機する` | 戻り値が null であること、`next_post_at` が更新されていることを assert |

#### BOTスペック (1シナリオ)

**S12: キュレーションBOTの初期HPは100である**

| Step | 正規表現 | 実装方針 |
|------|----------|----------|
| Given | `キュレーションBOTが生成される` | `curation_newsplus` プロファイルでBOTを作成 |
| Then | `BOTの初期HPは {int} である` | `bot.hp === 100` かつ `bot.maxHp === 100` を assert |

### 1.3 既存ステップとの重複チェック

| 既存ステップ (bot_system.steps.ts) | 再利用可否 |
|------|------|
| `BOTの初期HPは {int} である` | 汎用ステップとして再利用可能。S12 の Then に使用。ただし bot_system.steps.ts の実装が特定プロファイルに依存していないか確認が必要。依存している場合は curation_bot.steps.ts 側で独立定義する |

上記以外に重複するステップはない。curation_bot.feature のステップ文言は全て独自であり、新規定義が必要。

### 1.4 World への追加フィールド

`BattleBoardWorld` に以下を追加する。

```typescript
// -------------------------------------------------------------------------
// キュレーションBOTコンテキスト
// See: features/curation_bot.feature
// -------------------------------------------------------------------------

/** InMemory CollectedTopicRepository（シナリオ内で共有）*/
collectedTopicRepo: InMemoryCollectedTopicRepository | null = null;

/** 最後に収集ジョブで保存されたトピック群（Then 検証用）*/
lastCollectedTopics: CollectedTopic[] = [];

/** 収集ジョブのエラー情報（Then 検証用）*/
lastCollectionError: Error | null = null;
```

`reset()` メソッドに以下を追加。

```typescript
this.collectedTopicRepo = null;
this.lastCollectedTopics = [];
this.lastCollectionError = null;
```

---

## 2. DB設計 (migration 00034)

### 2.1 ファイル名

`supabase/migrations/00034_curation_bot.sql`

### 2.2 collected_topics テーブル DDL

正本: D-08 bot.md §5.5

```sql
-- =============================================================================
-- 00034_curation_bot.sql
-- キュレーションBOTの収集バズ情報バッファ + BOT初期レコード
--
-- See: features/curation_bot.feature
-- See: docs/architecture/components/bot.md §5.5, §5.6
-- =============================================================================

-- 1. collected_topics テーブル
CREATE TABLE collected_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_bot_id UUID NOT NULL REFERENCES bots(id),
    article_title TEXT NOT NULL,
    content TEXT,
    source_url TEXT NOT NULL,
    buzz_score NUMERIC NOT NULL,
    is_posted BOOLEAN DEFAULT false,
    posted_at TIMESTAMPTZ,
    collected_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE collected_topics IS
    'キュレーションBOTが収集したバズ情報バッファ。See: features/curation_bot.feature';
COMMENT ON COLUMN collected_topics.source_bot_id IS '収集元キュレーションBOTのID';
COMMENT ON COLUMN collected_topics.article_title IS '記事タイトル（スレタイとして使用）';
COMMENT ON COLUMN collected_topics.content IS '投稿内容（ベストエフォート。取得失敗時はNULL）';
COMMENT ON COLUMN collected_topics.source_url IS '元ネタURL';
COMMENT ON COLUMN collected_topics.buzz_score IS '収集時のバズスコア';
COMMENT ON COLUMN collected_topics.is_posted IS '投稿済みフラグ';
COMMENT ON COLUMN collected_topics.posted_at IS '投稿日時（is_posted=true時に設定）';
COMMENT ON COLUMN collected_topics.collected_date IS '収集日（JST基準）';
```

### 2.3 インデックス

```sql
-- 投稿候補検索の高速化（source_bot_id + collected_date + is_posted の複合）
CREATE INDEX idx_collected_topics_unposted
    ON collected_topics (source_bot_id, collected_date, is_posted)
    WHERE is_posted = false;
```

部分インデックス（`WHERE is_posted = false`）を使用する。理由: 投稿済みレコードは検索対象にならないため、インデックスサイズを抑制しつつ未投稿候補の検索を高速化する。

### 2.4 RLSポリシー

```sql
-- RLS有効化
ALTER TABLE collected_topics ENABLE ROW LEVEL SECURITY;

-- anon / authenticated からの全操作をDENY（ポリシー未定義 = 暗黙DENY）
-- service_role はRLSをバイパスするため明示的なALLOWポリシーは不要
```

`service_role` のみが GitHub Actions / Cron 経由でアクセスする。RLS有効化のみでポリシーは定義しない（ポリシー未定義 = 暗黙 DENY で anon / authenticated を遮断）。

### 2.5 ON CONFLICT 方針

`save()` のリトライ時に同日データが重複しないよう、ユニーク制約を追加する。

```sql
-- 同一BOT・同日・同URLの重複INSERTを防止
CREATE UNIQUE INDEX idx_collected_topics_unique_entry
    ON collected_topics (source_bot_id, collected_date, source_url);
```

INSERT 時は `ON CONFLICT (source_bot_id, collected_date, source_url) DO NOTHING` を使用する。

### 2.6 curation_newsplus ボットの seed INSERT

```sql
-- 2. 速報+速報ボット初期レコード
INSERT INTO bots (
    id,
    name,
    persona,
    hp,
    max_hp,
    daily_id,
    daily_id_date,
    is_active,
    is_revealed,
    survival_days,
    total_posts,
    accused_count,
    times_attacked,
    bot_profile_key,
    next_post_at
)
SELECT
    gen_random_uuid(),
    '速報+速報ボット',
    '5chニュース速報+のバズスレッドをキュレーションして転載する運営ボット。',
    100,
    100,
    substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    CURRENT_DATE,
    true,
    false,
    0,
    0,
    0,
    0,
    'curation_newsplus',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_newsplus'
);
```

---

## 3. CollectedTopicRepository 設計

### 3.1 インターフェース

ファイル: `src/lib/services/bot-strategies/types.ts` に追加

```typescript
/**
 * CollectedTopicRepository の依存インターフェース。
 * ThreadCreatorBehaviorStrategy が投稿候補を検索するために使用する。
 * collection-job.ts が収集結果を保存するために使用する。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §5.5
 */
export interface ICollectedTopicRepository {
    /**
     * 収集結果を保存する。
     * 同一 (source_bot_id, collected_date, source_url) のデータが既に存在する場合は
     * INSERT をスキップする（ON CONFLICT DO NOTHING）。
     * これにより、取得失敗時のリトライで前回データが上書きされない。
     *
     * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
     */
    save(items: CollectedItem[], botId: string, collectedDate: string): Promise<void>;

    /**
     * 指定BOT・指定日の未投稿候補を取得する。
     * is_posted = false のレコードを返す。
     *
     * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
     */
    findUnpostedByBotId(botId: string, date: string): Promise<CollectedTopic[]>;

    /**
     * 指定トピックを投稿済みにマークする。
     * is_posted = true, posted_at = postedAt に更新する。
     *
     * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
     */
    markAsPosted(topicId: string, postedAt: Date): Promise<void>;
}
```

`CollectedItem` は既に D-08 bot.md §2.13.5 で定義済み。types.ts の `CollectedTopic` を既存のまま使用する。

`CollectedItem` 型（収集アダプターの出力型。id なし）:

```typescript
/** 収集アダプターが返すバズ情報。DBに保存前の中間型。 */
export interface CollectedItem {
    articleTitle: string;
    content: string | null;
    sourceUrl: string;
    buzzScore: number;
}
```

この型は `types.ts` に追加する。

### 3.2 Supabase 実装

ファイル: `src/lib/infrastructure/repositories/collected-topic-repository.ts`

```typescript
// メソッド一覧と実装方針

async function save(
    items: CollectedItem[],
    botId: string,
    collectedDate: string
): Promise<void> {
    // Supabase service_role client を使用
    // items を collected_topics テーブルに一括 INSERT
    // ON CONFLICT (source_bot_id, collected_date, source_url) DO NOTHING
    // 空配列の場合は何もしない
}

async function findUnpostedByBotId(
    botId: string,
    date: string
): Promise<CollectedTopic[]> {
    // SELECT * FROM collected_topics
    // WHERE source_bot_id = botId
    //   AND collected_date = date
    //   AND is_posted = false
    // ORDER BY buzz_score DESC
}

async function markAsPosted(
    topicId: string,
    postedAt: Date
): Promise<void> {
    // UPDATE collected_topics
    // SET is_posted = true, posted_at = postedAt
    // WHERE id = topicId
}
```

### 3.3 InMemory 実装

ファイル: `features/support/in-memory/collected-topic-repository.ts`

```typescript
import type { CollectedTopic, CollectedItem } from "../../../src/lib/services/bot-strategies/types";
import type { ICollectedTopicRepository } from "../../../src/lib/services/bot-strategies/types";

/** InMemory ストア */
const store: (CollectedTopic & { sourceBotId: string })[] = [];

/** ストア全件クリア（Before フックで呼び出す） */
export function reset(): void { store.length = 0; }

/** テスト用: ストアの全データを返す */
export function _getAll(): (CollectedTopic & { sourceBotId: string })[] {
    return [...store];
}

/** テスト用: 任意のデータを直接追加する */
export function _seed(
    topic: CollectedTopic & { sourceBotId: string }
): void {
    store.push(topic);
}

export const InMemoryCollectedTopicRepo: ICollectedTopicRepository = {
    async save(items, botId, collectedDate) {
        for (const item of items) {
            // 同一 (botId, collectedDate, sourceUrl) が既に存在する場合はスキップ
            const exists = store.some(
                t => t.sourceBotId === botId
                  && t.collectedDate === collectedDate
                  && t.sourceUrl === item.sourceUrl
            );
            if (exists) continue;

            store.push({
                id: crypto.randomUUID(),
                articleTitle: item.articleTitle,
                content: item.content,
                sourceUrl: item.sourceUrl,
                buzzScore: item.buzzScore,
                collectedDate,
                sourceBotId: botId,
                // InMemory 固有: is_posted 等のフラグ管理
            });
        }
    },

    async findUnpostedByBotId(botId, date) {
        return store
            .filter(t => t.sourceBotId === botId
                      && t.collectedDate === date
                      && !t.isPosted)
            .sort((a, b) => b.buzzScore - a.buzzScore);
    },

    async markAsPosted(topicId, postedAt) {
        const topic = store.find(t => t.id === topicId);
        if (topic) {
            (topic as any).isPosted = true;
            (topic as any).postedAt = postedAt;
        }
    },
};
```

InMemory 用に `CollectedTopic` を拡張し、`isPosted`, `postedAt` フィールドを内部管理フィールドとして追加する必要がある。`CollectedTopic` の型定義自体は変更しない（BehaviorStrategy が受け取る型に投稿管理フィールドは不要）。InMemory ストアの内部型は以下のように定義する。

```typescript
interface InMemoryCollectedTopicRecord extends CollectedTopic {
    sourceBotId: string;
    isPosted: boolean;
    postedAt: Date | null;
}
```

---

## 4. ThreadCreatorBehaviorStrategy 設計

### 4.1 ファイル配置

`src/lib/services/bot-strategies/behavior/thread-creator.ts`

### 4.2 クラス設計

```typescript
import type {
    BehaviorContext,
    BehaviorStrategy,
    BotAction,
    CollectedTopic,
    ICollectedTopicRepository,
} from "../types";

/**
 * ThreadCreatorBehaviorStrategy -- キュレーションBOT用 BehaviorStrategy
 *
 * collected_topics から未投稿のアイテムをランダムに1件選択し、
 * { type: 'create_thread', title, body } を返す。
 * 候補がなければ { type: 'skip' } を返す。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.5
 */
export class ThreadCreatorBehaviorStrategy implements BehaviorStrategy {
    constructor(
        private readonly collectedTopicRepo: ICollectedTopicRepository,
    ) {}

    async decideAction(context: BehaviorContext): Promise<BotAction> {
        const todayJst = getJstDateString(new Date(Date.now()));
        const yesterdayJst = getJstDateString(
            new Date(Date.now() - 24 * 60 * 60 * 1000)
        );

        // 1. 当日の未投稿アイテムを検索
        let candidates = await this.collectedTopicRepo.findUnpostedByBotId(
            context.botId,
            todayJst,
        );

        // 2. 当日に候補がなければ前日にフォールバック
        if (candidates.length === 0) {
            candidates = await this.collectedTopicRepo.findUnpostedByBotId(
                context.botId,
                yesterdayJst,
            );
        }

        // 3. それでもなければ skip
        if (candidates.length === 0) {
            return { type: "skip" };
        }

        // 4. ランダムに1件選択
        const selected = candidates[
            Math.floor(Math.random() * candidates.length)
        ];

        // 5. body フォーマット
        const body = formatBody(selected);

        // 注意: markAsPosted は decideAction 内では呼ばない。
        // PostService.createThread が失敗した場合に「投稿していないのに投稿済み」の
        // 不整合を防ぐため、executeBotPost() の createThread 成功後に呼び出す。
        // selectedTopicId を BotAction に含めて返し、呼び出し側で markAsPosted する。

        return {
            type: "create_thread",
            title: selected.articleTitle,
            body,
            _selectedTopicId: selected.id,  // executeBotPost 用の内部フィールド
        };
    }
}
```

### 4.3 body フォーマット関数

```typescript
/**
 * >>1 の本文をフォーマットする。
 * - 投稿内容あり: `{content}\n\n元ネタ: {source_url}`
 * - 投稿内容なし: `{source_url}`
 *
 * See: docs/architecture/components/bot.md §2.13.5 >>1 の本文フォーマット
 */
function formatBody(topic: CollectedTopic): string {
    if (topic.content) {
        return `${topic.content}\n\n元ネタ: ${topic.sourceUrl}`;
    }
    return topic.sourceUrl;
}
```

この関数は export して単体テストの対象にする。

### 4.4 JST日付変換

```typescript
/**
 * Date オブジェクトから JST の日付文字列 (YYYY-MM-DD) を返す。
 * タイムゾーンオフセット +9時間 を適用する。
 *
 * See: docs/architecture/components/bot.md §2.13.5 日付境界はJST 0:00
 */
function getJstDateString(date: Date): string {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}
```

この関数も export して単体テスト対象にする。`src/lib/domain/rules/jst-date.ts` として独立ファイルに配置し、collection-job.ts と共有する。

---

## 5. TopicDrivenSchedulingStrategy 設計

### 5.1 ファイル配置

`src/lib/services/bot-strategies/scheduling/topic-driven.ts`

### 5.2 クラス設計

```typescript
import type { SchedulingContext, SchedulingStrategy } from "../types";

/** デフォルトの最小投稿間隔（分）*/
const DEFAULT_MIN_MINUTES = 240;

/** デフォルトの最大投稿間隔（分）*/
const DEFAULT_MAX_MINUTES = 360;

/**
 * TopicDrivenSchedulingStrategy -- キュレーションBOT用 SchedulingStrategy
 *
 * 240~360分のランダムな整数（分単位）を返す。
 * FixedIntervalSchedulingStrategy と同一のアルゴリズム（範囲のみ異なる）。
 *
 * See: features/curation_bot.feature @BOTの投稿間隔は240分〜360分のランダム間隔である
 * See: docs/architecture/components/bot.md §2.13.3 TopicDrivenSchedulingStrategy
 */
export class TopicDrivenSchedulingStrategy implements SchedulingStrategy {
    constructor(
        private readonly minMinutes: number = DEFAULT_MIN_MINUTES,
        private readonly maxMinutes: number = DEFAULT_MAX_MINUTES,
    ) {}

    getNextPostDelay(_context: SchedulingContext): number {
        return (
            this.minMinutes +
            Math.floor(Math.random() * (this.maxMinutes - this.minMinutes + 1))
        );
    }
}
```

### 5.3 bot_profiles.yaml からの min/max 参照

`resolveStrategies()` 内で `profile.scheduling.min_interval_minutes` と `profile.scheduling.max_interval_minutes` を読み取り、コンストラクタに渡す（後述の §6 参照）。

---

## 6. strategy-resolver.ts 更新設計

### 6.1 変更箇所

既存の TODO コメント（L70-73）を実装に置き換える。

```typescript
// 変更前:
// TODO: Phase 3 対応: _profile?.behavior_type === 'create_thread' の場合
//   ThreadCreatorBehaviorStrategy + TopicDrivenSchedulingStrategy を返す
//   ContentStrategy は create_thread 時は不使用（NoOp を設定）

// 変更後:
if (_profile?.behavior_type === "create_thread") {
    const collectedTopicRepo = options.collectedTopicRepository;
    if (!collectedTopicRepo) {
        throw new Error(
            "resolveStrategies: behavior_type='create_thread' には collectedTopicRepository が必要です"
        );
    }

    const minMinutes = _profile.scheduling?.min_interval_minutes ?? 240;
    const maxMinutes = _profile.scheduling?.max_interval_minutes ?? 360;

    return {
        content: new NoOpContentStrategy(),
        behavior: new ThreadCreatorBehaviorStrategy(collectedTopicRepo),
        scheduling: new TopicDrivenSchedulingStrategy(minMinutes, maxMinutes),
    };
}
```

### 6.2 ResolveStrategiesOptions 拡張

```typescript
export interface ResolveStrategiesOptions {
    threadRepository: IThreadRepository;
    botProfiles?: BotProfilesYaml;
    /** Phase 3: ThreadCreatorBehaviorStrategy が必要とする ICollectedTopicRepository */
    collectedTopicRepository?: ICollectedTopicRepository;
}
```

### 6.3 NoOpContentStrategy

`create_thread` 時は ContentStrategy が不使用であるため、呼び出された場合にエラーをスローする安全策を設ける。

ファイル: `src/lib/services/bot-strategies/content/noop.ts`

```typescript
import type { ContentGenerationContext, ContentStrategy } from "../types";

/**
 * NoOpContentStrategy -- create_thread 時の ContentStrategy プレースホルダ。
 * create_thread アクションでは BehaviorStrategy が body を包括するため、
 * ContentStrategy.generateContent() は呼び出されないはずである。
 * 万一呼び出された場合はエラーをスローする。
 *
 * See: docs/architecture/components/bot.md §2.13.3
 */
export class NoOpContentStrategy implements ContentStrategy {
    async generateContent(_context: ContentGenerationContext): Promise<string> {
        throw new Error(
            "NoOpContentStrategy.generateContent: create_thread では ContentStrategy は使用されません"
        );
    }
}
```

### 6.4 import 追加

strategy-resolver.ts に以下の import を追加する。

```typescript
import { ThreadCreatorBehaviorStrategy } from "./behavior/thread-creator";
import { NoOpContentStrategy } from "./content/noop";
import { TopicDrivenSchedulingStrategy } from "./scheduling/topic-driven";
import type { ICollectedTopicRepository } from "./types";
```

### 6.5 BotProfile 型への scheduling フィールド拡張

現在の `BotProfile.scheduling` 型:

```typescript
scheduling?: {
    type: string;
    min?: number;
    max?: number;
};
```

`min_interval_minutes` / `max_interval_minutes` のフィールド名で参照する設計だが、既存の型定義では `min` / `max` となっている。YAML のキー名に合わせて型を拡張する。

```typescript
scheduling?: {
    type: string;
    min?: number;           // 既存（後方互換）
    max?: number;           // 既存（後方互換）
    min_interval_minutes?: number;  // Phase 3 追加
    max_interval_minutes?: number;  // Phase 3 追加
};
```

resolveStrategies 内では以下の優先順位で読み取る:
1. `scheduling.min_interval_minutes` (Phase 3 明示指定)
2. `scheduling.min` (後方互換)
3. デフォルト値 (240)

ただし、YAML 側のキーを `min_interval_minutes` に統一し、既存の `min`/`max` は荒らし役が使っていないため実質的に影響はない。タスク指示書に従い `min_interval_minutes` / `max_interval_minutes` を使用する。

### 6.6 BotProfile 型への collection フィールド追加

タスク指示書の留意事項に記載あり。types.ts の `BotProfile` に追加する。

```typescript
/** Phase 3: 収集設定（キュレーションBOT用）*/
collection?: {
    adapter: string;
    source_url: string;
    monthly?: boolean;
};
```

---

## 7. bot-service.ts 更新設計

### 7.1 BotAction 型の拡張

`create_thread` バリアントに `_selectedTopicId` を追加する。これは ThreadCreatorBehaviorStrategy が markAsPosted の遅延呼び出しのために返す内部フィールド。

```typescript
// types.ts の BotAction を拡張
export type BotAction =
    | { type: "post_to_existing"; threadId: string }
    | { type: "create_thread"; title: string; body: string; _selectedTopicId?: string }
    | { type: "skip" };
```

### 7.2 create_thread アクションの処理追加

現在の `executeBotPost()` 内 (L886-891) で `create_thread` 時にエラーをスローしている箇所を実装に置き換える。

```typescript
// 変更前 (L886-891):
if (action.type === "create_thread") {
    throw new Error(
        "BotService.executeBotPost: create_thread アクションは Phase 3 以降に対応予定です",
    );
}

// 変更後:
if (action.type === "create_thread") {
    if (!this.createThreadFn) {
        throw new Error(
            "executeBotPost: createThreadFn が未注入です"
        );
    }
    const threadResult = await this.createThreadFn({
        boardId: DEFAULT_BOARD_ID,
        title: action.title,
        firstPostBody: action.body,
    }, null, `bot-${botId}`);

    if (!threadResult.success || !threadResult.firstPost) {
        throw new Error(
            `BotService.executeBotPost: createThread が失敗しました: ${threadResult.error ?? "不明"}`
        );
    }

    // createThread 成功後に投稿済みマークを付ける
    // decideAction 内ではなくここで呼ぶことで、createThread 失敗時の不整合を防ぐ
    if (action._selectedTopicId && this.collectedTopicRepository) {
        await this.collectedTopicRepository.markAsPosted(
            action._selectedTopicId,
            new Date(Date.now()),
        );
    }

    // bot_posts に紐付け
    try {
        await this.botPostRepository.create(threadResult.firstPost.id, botId);
        await this.botRepository.incrementTotalPosts(botId);
    } catch (err) {
        console.error(
            `BotService.executeBotPost: bot_posts INSERT に失敗（postId=${threadResult.firstPost.id}, botId=${botId}）`,
            err,
        );
    }

    // next_post_at を更新
    try {
        const delayMinutes = strategies.scheduling.getNextPostDelay({
            botId,
            botProfileKey: bot.botProfileKey,
        });
        const nextPostAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        await this.botRepository.updateNextPostAt(botId, nextPostAt);
    } catch (err) {
        console.error(
            `BotService.executeBotPost: next_post_at 更新に失敗（botId=${botId}）`,
            err,
        );
    }

    return {
        postId: threadResult.firstPost.id,
        postNumber: threadResult.firstPost.postNumber,
        dailyId: await this.getDailyId(botId),
    };
}
```

### 7.3 skip アクションの処理

現在の `executeBotPost()` では skip アクションへの分岐がない（`action.threadId` を参照しようとしてエラーになる）。`create_thread` 分岐の前に skip 分岐を追加する。

```typescript
if (action.type === "skip") {
    // 投稿候補なし: next_post_at のみ更新して終了
    try {
        const delayMinutes = strategies.scheduling.getNextPostDelay({
            botId,
            botProfileKey: bot.botProfileKey,
        });
        const nextPostAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        await this.botRepository.updateNextPostAt(botId, nextPostAt);
    } catch (err) {
        console.error(
            `BotService.executeBotPost: skip 時の next_post_at 更新に失敗（botId=${botId}）`,
            err,
        );
    }
    return null;
}
```

### 7.4 CreateThreadFn の DI

コンストラクタに `createThreadFn` を追加する。

```typescript
export type CreateThreadFn = (
    input: { boardId: string; title: string; firstPostBody: string },
    edgeToken: string | null,
    ipHash: string,
) => Promise<CreateThreadResult>;
```

`CreateThreadResult` は post-service.ts から import する。

コンストラクタのパラメータ順序: 既存パラメータの後に追加する。

```typescript
constructor(
    // ... 既存の10個のパラメータ ...
    private readonly createThreadFn?: CreateThreadFn,
) {
```

### 7.5 ICollectedTopicRepository の DI

`resolveStrategiesForBot()` 内で options に渡すために、コンストラクタパラメータとして受け取る。

```typescript
constructor(
    // ... 既存の10個 + createThreadFn ...
    private readonly collectedTopicRepository?: ICollectedTopicRepository,
) {
```

`resolveStrategiesForBot()` 内で options に追加:

```typescript
private resolveStrategiesForBot(bot: Bot, profile: BotProfile | null): BotStrategies {
    const resolveFn = this.resolveStrategiesFn ?? defaultResolveStrategies;
    return resolveFn(bot, profile, {
        threadRepository: this.threadRepository!,
        botProfiles: this.botProfiles,
        collectedTopicRepository: this.collectedTopicRepository, // Phase 3 追加
    });
}
```

---

## 8. bot_profiles.yaml 拡張設計

### 8.1 追加プロファイル

`config/bot_profiles.yaml` に以下を追加する。

```yaml
# Phase 3: 速報+速報ボット（キュレーションBOT Phase A）
# 5chニュース速報+のバズスレッドをキュレーションして転載する。
# 報酬パラメータはコピペBOT（同HP:100）と同等。
# See: features/curation_bot.feature
# See: docs/architecture/components/bot.md §2.13.5, §2.13.7
curation_newsplus:
  hp: 100
  max_hp: 100
  reward:
    base_reward: 50
    daily_bonus: 20
    attack_bonus: 3
  behavior_type: create_thread
  scheduling:
    type: topic_driven
    min_interval_minutes: 240
    max_interval_minutes: 360
  collection:
    adapter: subject_txt
    source_url: "https://asahi.5ch.io/newsplus/subject.txt"
  fixed_messages: []
```

### 8.2 config/bot-profiles.ts への反映

`config/bot-profiles.ts` は YAML をパースして TypeScript 定数にしたファイル。`curation_newsplus` のエントリを追加する。

---

## 9. collection-job.ts 設計

### 9.1 ファイル配置

`src/lib/collection/collection-job.ts`

### 9.2 エントリポイントの構造

```typescript
/**
 * 収集バッチジョブのエントリポイント。
 * GitHub Actions の daily cron から `npx tsx src/lib/collection/collection-job.ts` で実行する。
 *
 * 処理フロー:
 *   1. bot_profiles.yaml から behavior_type === 'create_thread' のプロファイルを列挙
 *   2. bots テーブルから対応する active BOT を取得
 *   3. 各BOTのプロファイルから collection.adapter を読み取り、CollectionAdapter を解決
 *   4. adapter.collect() でバズ情報を取得
 *   5. buzzScore 降順でソートし上位6件を切り出し
 *   6. CollectedTopicRepository.save() で保存
 *
 * エラーハンドリング:
 *   - ソース単位でのtry/catchでエラーを隔離
 *   - 1ソースの失敗が他のソースに影響しない
 *   - 前回データは上書きされない（save の ON CONFLICT DO NOTHING による）
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { botProfilesConfig, type BotProfilesYaml } from "../../config/bot-profiles";
import { getJstDateString } from "../domain/rules/jst-date";
import type { CollectedItem } from "../services/bot-strategies/types";
import { resolveCollectionAdapter } from "./adapters/adapter-resolver";

// Supabase service_role client
import { createServiceRoleClient } from "../infrastructure/supabase/service-role-client";

const MAX_ITEMS_PER_SOURCE = 6;

export async function runCollectionJob(
    overrides?: {
        botProfiles?: BotProfilesYaml;
        adapterOverrides?: Record<string, { collect: () => Promise<CollectedItem[]> }>;
        collectedTopicRepo?: ICollectedTopicRepository;
    },
): Promise<void> {
    const profiles = overrides?.botProfiles ?? botProfilesConfig;
    const todayJst = getJstDateString(new Date());

    // 1. behavior_type === 'create_thread' のプロファイルキーを列挙
    const curationProfileKeys = Object.entries(profiles)
        .filter(([_, p]) => p.behavior_type === "create_thread")
        .map(([key]) => key);

    // 2. 各プロファイルに対応するBOTをDBから取得
    const supabase = createServiceRoleClient();
    for (const profileKey of curationProfileKeys) {
        try {
            // BOT取得
            const { data: bots } = await supabase
                .from("bots")
                .select("id")
                .eq("bot_profile_key", profileKey)
                .eq("is_active", true);

            if (!bots || bots.length === 0) continue;

            const bot = bots[0];
            const profile = profiles[profileKey];

            // 3. CollectionAdapter を解決
            const adapter = overrides?.adapterOverrides?.[profileKey]
                ?? resolveCollectionAdapter(profile.collection!.adapter);

            // 4. collect()
            const items = await adapter.collect({
                sourceUrl: profile.collection!.source_url,
                monthly: profile.collection?.monthly ?? false,
            });

            // 5. 上位6件に絞る
            const topItems = items
                .sort((a, b) => b.buzzScore - a.buzzScore)
                .slice(0, MAX_ITEMS_PER_SOURCE);

            // 6. 保存
            const repo = overrides?.collectedTopicRepo ?? getSupabaseCollectedTopicRepo();
            await repo.save(topItems, bot.id, todayJst);

            console.log(
                `[collection-job] ${profileKey}: ${topItems.length}件を保存`
            );
        } catch (err) {
            // ソース単位でエラーを隔離
            console.error(`[collection-job] ${profileKey}: 収集失敗`, err);
            // 前回データは save の ON CONFLICT DO NOTHING により保持される
        }
    }
}

// CLI 直接実行時のみ実行する
if (require.main === module) {
    runCollectionJob()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("[collection-job] Fatal error:", err);
            process.exit(1);
        });
}
```

### 9.3 adapter-resolver

ファイル: `src/lib/collection/adapters/adapter-resolver.ts`

```typescript
import type { CollectionAdapter } from "./types";
import { SubjectTxtAdapter } from "./subject-txt";

/**
 * collection.adapter フィールド値から CollectionAdapter を解決する。
 * Phase A では subject_txt のみ実装。他は Phase B/C で追加する。
 */
export function resolveCollectionAdapter(adapterType: string): CollectionAdapter {
    switch (adapterType) {
        case "subject_txt":
            return new SubjectTxtAdapter();
        default:
            throw new Error(`未実装の収集アダプター: ${adapterType}`);
    }
}
```

### 9.4 CollectionAdapter インターフェース

ファイル: `src/lib/collection/adapters/types.ts`

```typescript
/**
 * 収集アダプターの設定情報。
 * bot_profiles.yaml の collection セクションから渡される。
 */
export interface SourceConfig {
    sourceUrl: string;
    monthly: boolean;
}

/**
 * 収集アダプターインターフェース。
 * See: docs/architecture/components/bot.md §2.13.5
 */
export interface CollectionAdapter {
    collect(config: SourceConfig): Promise<CollectedItem[]>;
}
```

`CollectedItem` は `src/lib/services/bot-strategies/types.ts` から import する。

---

## 10. SubjectTxtAdapter 設計 (Phase A)

### 10.1 ファイル配置

`src/lib/collection/adapters/subject-txt.ts`

### 10.2 subject.txt パース

subject.txt の1行のフォーマット:

```
{スレ番号}.dat<>{スレタイ} ({レス数})\n
```

例:

```
1711612345.dat<>【速報】テスト記事 (150)\n
```

パース関数:

```typescript
interface SubjectEntry {
    threadNumber: string;     // "1711612345"
    title: string;            // "【速報】テスト記事"
    resCount: number;         // 150
    createdUnixTime: number;  // 1711612345
}

function parseSubjectTxt(text: string): SubjectEntry[] {
    return text
        .split("\n")
        .filter(line => line.trim() !== "")
        .map(line => {
            // {threadNumber}.dat<>{title} ({resCount})
            const match = line.match(/^(\d+)\.dat<>(.+)\s+\((\d+)\)$/);
            if (!match) return null;
            return {
                threadNumber: match[1],
                title: match[2].trim(),
                resCount: parseInt(match[3], 10),
                createdUnixTime: parseInt(match[1], 10),
            };
        })
        .filter((e): e is SubjectEntry => e !== null);
}
```

### 10.3 バズスコア算出

```
buzzScore = resCount / (elapsedHours + 2) ^ 1.5
```

- `elapsedHours`: スレ番号（Unix タイムスタンプ）から現在時刻までの経過時間（時間単位）
- `+2` はゼロ除算防止と新規スレッドのスコア調整

```typescript
/**
 * バズスコアを算出する。
 * See: docs/architecture/components/bot.md §2.13.5 バズスコア算出式
 * See: features/curation_bot.feature ヘッダコメント
 */
export function calculateBuzzScore(
    resCount: number,
    createdUnixTime: number,
    nowMs: number = Date.now(),
): number {
    const elapsedHours = (nowMs / 1000 - createdUnixTime) / 3600;
    return resCount / Math.pow(elapsedHours + 2, 1.5);
}
```

この関数は純粋関数として export し、単体テスト対象にする。配置: `src/lib/domain/rules/buzz-score.ts`

### 10.4 DAT ファイル取得と >>1 本文抽出

DAT ファイルの1行目フォーマット（Shift_JIS をデコード後）:

```
名前<>メール<>日付 ID<> 本文 <>スレタイ
```

`<>` 区切りの5番目のフィールドが本文。

```typescript
/**
 * DAT ファイルの1行目から >>1 の本文を抽出する。
 * See: docs/architecture/components/bot.md §2.13.5
 */
function extractFirstPostBody(datFirstLine: string): string | null {
    const fields = datFirstLine.split("<>");
    if (fields.length < 4) return null;
    // 4番目（0-indexed: 3）が本文
    // HTML タグを除去
    return fields[3]?.replace(/<[^>]+>/g, "").trim() || null;
}
```

### 10.5 collect() の全体フロー

```typescript
export class SubjectTxtAdapter implements CollectionAdapter {
    async collect(config: SourceConfig): Promise<CollectedItem[]> {
        // 1. subject.txt を fetch
        const subjectText = await fetchText(config.sourceUrl);
        const entries = parseSubjectTxt(subjectText);

        // 2. バズスコア算出・ソート
        const scored = entries.map(e => ({
            ...e,
            buzzScore: calculateBuzzScore(e.resCount, e.createdUnixTime),
        }));
        scored.sort((a, b) => b.buzzScore - a.buzzScore);

        // 3. 上位6件の DAT >>1 を取得
        const top6 = scored.slice(0, 6);
        const baseUrl = config.sourceUrl.replace(/\/subject\.txt$/, "");

        const results: CollectedItem[] = [];
        for (const entry of top6) {
            let content: string | null = null;
            try {
                const datUrl = `${baseUrl}/dat/${entry.threadNumber}.dat`;
                const datText = await fetchText(datUrl);
                const firstLine = datText.split("\n")[0];
                content = extractFirstPostBody(firstLine);
            } catch {
                // ベストエフォート: DAT取得失敗時は content=null
            }

            results.push({
                articleTitle: entry.title,
                content,
                sourceUrl: `${baseUrl}/${entry.threadNumber}`,
                buzzScore: entry.buzzScore,
            });
        }

        return results;
    }
}
```

### 10.6 fetch ヘルパー

```typescript
async function fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`fetch failed: ${url} (${response.status})`);
    }
    // subject.txt / DAT は Shift_JIS
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("shift_jis");
    return decoder.decode(buffer);
}
```

### 10.7 エラーハンドリング

- `fetch(subject.txt)` の失敗: 例外をスローし、collection-job.ts の try/catch で捕捉される。前回データは保持される。
- `fetch(DAT)` の失敗: 個別 DAT の try/catch で `content = null` にフォールバック。他のアイテムには影響しない。

### 10.8 Shift_JIS デコードの実行環境制約

`TextDecoder("shift_jis")` は Node.js の ICU (International Components for Unicode) full データが必要。GitHub Actions の `ubuntu-latest` (Node.js 20) ではデフォルトで利用可能。ローカル開発環境で ICU が不足している場合は `NODE_ICU_DATA` 環境変数の設定または `--icu-data-dir` フラグが必要になる可能性がある。BDDテストでは InMemory モックが UTF-8 文字列を直接返すため影響なし。

---

## 11. GitHub Actions ワークフロー設計

### 11.1 ファイル配置

`.github/workflows/collect-topics.yml`

### 11.2 ワークフロー定義

```yaml
name: Collect Buzz Topics (Daily Cron)

on:
  schedule:
    # JST 06:00 (UTC 21:00 前日) に実行
    - cron: "0 21 * * *"
  workflow_dispatch: {}  # 手動実行も可能

jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run collection job
        run: npx tsx src/lib/collection/collection-job.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### 11.3 必要な Secrets

| Secret 名 | 説明 | 既存/新規 |
|---|---|---|
| `SUPABASE_URL` | Supabase プロジェクト URL | 既存 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role キー | 既存 |

新規 Secrets は不要。収集バッチは外部 API キーを必要としない（subject.txt は公開エンドポイント）。

### 11.4 cron スケジュールの根拠

JST 06:00（UTC 21:00 前日）: ニュース速報板のバズは深夜に落ち着くため、早朝に収集することで当日分の鮮度の高いデータが蓄積される。投稿は 240~360分間隔で日中に分散する。

---

## 12. 単体テスト計画

### 12.1 テストファイル一覧

| テストファイル | テスト対象 | テスト内容 |
|---|---|---|
| `src/__tests__/lib/services/bot-strategies/scheduling/topic-driven.test.ts` | TopicDrivenSchedulingStrategy | 240-360分の範囲チェック（100回ループで範囲外がないことを検証）|
| `src/__tests__/lib/domain/rules/buzz-score.test.ts` | calculateBuzzScore | 純粋関数テスト: 既知の入力に対する出力検証、ゼロ除算防止、経過時間0のケース |
| `src/__tests__/lib/services/bot-strategies/behavior/thread-creator.test.ts` | ThreadCreatorBehaviorStrategy | InMemory リポジトリを使用した統合テスト: 当日候補選択、前日フォールバック、skip、bodyフォーマット |
| `src/__tests__/lib/domain/rules/jst-date.test.ts` | getJstDateString | JST日付変換の境界テスト: UTC 14:59 (JST 23:59) と UTC 15:00 (JST 翌00:00) |
| `src/__tests__/lib/collection/adapters/subject-txt.test.ts` | parseSubjectTxt, extractFirstPostBody | subject.txt パースの正常系・異常行・空行スキップ |

### 12.2 TopicDrivenSchedulingStrategy のテスト

```typescript
describe("TopicDrivenSchedulingStrategy", () => {
    it("getNextPostDelay は 240~360 の範囲の整数を返す", () => {
        const strategy = new TopicDrivenSchedulingStrategy();
        const context = { botId: "test-bot", botProfileKey: "curation_newsplus" };

        for (let i = 0; i < 100; i++) {
            const delay = strategy.getNextPostDelay(context);
            expect(delay).toBeGreaterThanOrEqual(240);
            expect(delay).toBeLessThanOrEqual(360);
            expect(Number.isInteger(delay)).toBe(true);
        }
    });

    it("コンストラクタで min/max を指定できる", () => {
        const strategy = new TopicDrivenSchedulingStrategy(100, 200);
        const context = { botId: "test-bot", botProfileKey: null };

        for (let i = 0; i < 100; i++) {
            const delay = strategy.getNextPostDelay(context);
            expect(delay).toBeGreaterThanOrEqual(100);
            expect(delay).toBeLessThanOrEqual(200);
        }
    });
});
```

### 12.3 バズスコア計算のテスト

```typescript
describe("calculateBuzzScore", () => {
    it("レス数100、経過2時間のスコアを正しく計算する", () => {
        // buzzScore = 100 / (2 + 2)^1.5 = 100 / 8 = 12.5
        const now = Date.now();
        const created = now / 1000 - 2 * 3600; // 2時間前
        const score = calculateBuzzScore(100, created, now);
        expect(score).toBeCloseTo(12.5, 1);
    });

    it("経過0時間でもゼロ除算にならない", () => {
        const now = Date.now();
        const created = now / 1000; // 今
        const score = calculateBuzzScore(100, created, now);
        // buzzScore = 100 / (0 + 2)^1.5 = 100 / 2.828... ≈ 35.36
        expect(score).toBeGreaterThan(0);
        expect(Number.isFinite(score)).toBe(true);
    });

    it("レス数0の場合はスコア0", () => {
        const now = Date.now();
        const created = now / 1000 - 3600;
        expect(calculateBuzzScore(0, created, now)).toBe(0);
    });
});
```

### 12.4 ThreadCreatorBehaviorStrategy のテスト

```typescript
describe("ThreadCreatorBehaviorStrategy", () => {
    it("当日の未投稿アイテムから create_thread を返す", async () => {
        // InMemoryCollectedTopicRepo に当日の未投稿3件をセット
        // decideAction() を呼び出し
        // type === 'create_thread' であること
        // title が3件のいずれかの articleTitle であること
    });

    it("当日が全投稿済みの場合、前日にフォールバックする", async () => {
        // 当日: 全て is_posted = true
        // 前日: 未投稿あり
        // decideAction() の結果が前日のデータであること
    });

    it("データなしの場合 skip を返す", async () => {
        // 空リポジトリ
        // decideAction() の結果が { type: 'skip' } であること
    });

    it("content ありの場合のbody フォーマットが正しい", async () => {
        // content = "テスト内容", sourceUrl = "https://example.com"
        // body === "テスト内容\n\n元ネタ: https://example.com"
    });

    it("content null の場合は URL のみ", async () => {
        // content = null, sourceUrl = "https://example.com"
        // body === "https://example.com"
    });
});
```

---

## 付録A: 新規ファイル一覧

| ファイルパス | 種別 | 説明 |
|---|---|---|
| `supabase/migrations/00034_curation_bot.sql` | DDL | collected_topics テーブル + 速報BOT seed |
| `src/lib/services/bot-strategies/behavior/thread-creator.ts` | Strategy | ThreadCreatorBehaviorStrategy |
| `src/lib/services/bot-strategies/scheduling/topic-driven.ts` | Strategy | TopicDrivenSchedulingStrategy |
| `src/lib/services/bot-strategies/content/noop.ts` | Strategy | NoOpContentStrategy |
| `src/lib/domain/rules/buzz-score.ts` | 純粋関数 | バズスコア計算 |
| `src/lib/domain/rules/jst-date.ts` | 純粋関数 | JST日付文字列変換 |
| `src/lib/collection/collection-job.ts` | バッチ | 収集ジョブエントリポイント |
| `src/lib/collection/adapters/types.ts` | 型定義 | CollectionAdapter, SourceConfig |
| `src/lib/collection/adapters/adapter-resolver.ts` | リゾルバ | adapter 名から実装を解決 |
| `src/lib/collection/adapters/subject-txt.ts` | アダプター | 5ch subject.txt + DAT パーサー |
| `src/lib/infrastructure/repositories/collected-topic-repository.ts` | リポジトリ | Supabase 実装 |
| `features/step_definitions/curation_bot.steps.ts` | BDDステップ | 13シナリオのステップ定義 |
| `features/support/in-memory/collected-topic-repository.ts` | モック | InMemory 実装 |
| `.github/workflows/collect-topics.yml` | CI/CD | 日次収集 cron ワークフロー |

## 付録B: 既存ファイル変更一覧

| ファイルパス | 変更内容 |
|---|---|
| `src/lib/services/bot-strategies/types.ts` | `ICollectedTopicRepository`, `CollectedItem` 追加。`BotProfile` に `collection`, `scheduling.min_interval_minutes`/`max_interval_minutes` 追加 |
| `src/lib/services/bot-strategies/strategy-resolver.ts` | Phase 3 解決ルール実装、`ResolveStrategiesOptions.collectedTopicRepository` 追加 |
| `src/lib/services/bot-service.ts` | `create_thread`/`skip` アクション処理追加、`CreateThreadFn` DI、`ICollectedTopicRepository` DI |
| `config/bot_profiles.yaml` | `curation_newsplus` プロファイル追加 |
| `config/bot-profiles.ts` | YAML 変更の反映 |
| `features/support/world.ts` | キュレーションBOTコンテキスト追加 |
| `features/support/mock-installer.ts` | `InMemoryCollectedTopicRepo` の登録 |

## 付録C: 依存方向図

```
GitHub Actions cron
  |
  v
collection-job.ts
  |
  +---> adapters/subject-txt.ts  (外部 fetch)
  +---> domain/rules/buzz-score.ts  (純粋関数)
  +---> domain/rules/jst-date.ts  (純粋関数)
  +---> infrastructure/repositories/collected-topic-repository.ts  (Supabase)
  |
  (独立)
  |
CF Cron (5 min polling)
  |
  v
bot-service.ts
  |
  +---> strategy-resolver.ts
  |       |
  |       +---> behavior/thread-creator.ts ---> ICollectedTopicRepository (DI)
  |       +---> scheduling/topic-driven.ts
  |       +---> content/noop.ts
  |
  +---> post-service.ts (createThread)
  +---> infrastructure/repositories/collected-topic-repository.ts (DI)
```

依存方向は CLAUDE.md の制約（app -> services -> domain / infrastructure）に準拠している。
