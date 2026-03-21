# コンポーネント設計書: ウェルカムシーケンス + CF Cron移行 + Currency v5

> TASK-236 / Sprint-83
> 対象BDDシナリオ: `features/welcome.feature` 全シナリオ, `features/currency.feature` @初期通貨

---

## 1. CF Cron scheduled ハンドラ（Phase A）

### 1.1 wrangler.toml 変更

既存の `wrangler.toml` に cron triggers を追加する。

```toml
# 追加: Cron Triggers（5分間隔）
# See: docs/architecture/architecture.md §12.2 bot-scheduler-fast
# See: TDR-013
[triggers]
crons = ["*/5 * * * *"]
```

`WORKER_SELF_REFERENCE` バインディングは設定済み（OpenNext キャッシュ用に既存）。追加設定不要。

### 1.2 scheduled ハンドラ実装（self-fetch 方式）

`@opennextjs/cloudflare` のビルド出力 `.open-next/worker.js` は `fetch` ハンドラのみをエクスポートする。`scheduled` ハンドラを追加するには、ビルド出力をラップするカスタムエントリポイントが必要。

**ファイル:** `src/cf-scheduled.ts`（新規）

```typescript
/**
 * Cloudflare Workers scheduled イベントハンドラ
 *
 * @opennextjs/cloudflare のビルド出力をラップし、scheduled イベントを追加する。
 * self-fetch 方式で既存の /api/internal/bot/execute を呼び出す。
 *
 * See: docs/architecture/architecture.md §12.2, TDR-013
 * See: tmp/migration_cf_cron.md §5 SRV-1
 */
export default {
  async fetch(request, env, ctx) {
    // OpenNext のメインハンドラに委譲（動的 import）
    const { default: handler } = await import("./.open-next/worker.js");
    return handler.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    // WORKER_SELF_REFERENCE バインディングで自身の /api/internal/bot/execute を呼び出す
    const response = await env.WORKER_SELF_REFERENCE.fetch(
      "https://dummy-host/api/internal/bot/execute",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.BOT_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(`[scheduled] bot/execute failed: ${response.status}`);
    } else {
      const body = await response.json();
      console.log(`[scheduled] bot/execute result:`, JSON.stringify(body));
    }
  },
} satisfies ExportedHandler<Env>;

interface Env {
  WORKER_SELF_REFERENCE: Fetcher;
  BOT_API_KEY: string;
  ASSETS: Fetcher;
}
```

**判断根拠:**
- self-fetch を使うことで、既存の `route.ts`（認証・エラーハンドリング・ログ出力）をそのまま活用できる
- BotService を直接インスタンス化する方式は、OpenNext のビルド出力に内包された Next.js ランタイムの初期化順序と干渉するリスクがある
- `WORKER_SELF_REFERENCE.fetch()` のホスト名は無視される（同一 Worker 内通信のため `dummy-host` で問題ない）

**wrangler.toml の main 変更:**

```toml
# 変更前
main = ".open-next/worker.js"

# 変更後
main = "src/cf-scheduled.ts"
```

ただし、`@opennextjs/cloudflare` のビルドプロセスが `main` フィールドを上書きする場合がある。この場合は以下の代替策を検討する:

**代替策: opennext.config.ts での統合**

`@opennextjs/cloudflare` が提供する設定拡張ポイントを使い、ビルド出力に scheduled ハンドラを注入する。具体的な設定方法は実装時に `@opennextjs/cloudflare` のドキュメントを参照して確定する。

### 1.3 CF Workers secrets

```bash
wrangler secret put BOT_API_KEY
# 値: GitHub Secrets の BOT_API_KEY と同値
```

### 1.4 GitHub Actions bot-scheduler.yml 変更

荒らし役BOTは CF Cron に移行するため、GitHub Actions の bot-scheduler は AI API 使用BOTのみを対象にする。現在 AI API 使用BOTは存在しないため、実質的にジョブは空振りする。

変更方針: **フィルタ追加ではなく、ワークフローを無効化する**

```yaml
# 変更: on.schedule をコメントアウト
on:
  # schedule:
  #   - cron: '0,30 * * * *'
  workflow_dispatch: {}  # 手動実行のみ残す（緊急時用）
```

**判断根拠:** Phase 2 では AI API 使用BOTが存在しない。フィルタロジックを追加しても空振りするだけであり、フィルタの実装・テストコストが不要な無効化のほうが合理的。Phase 3（ネタ師）実装時に AI API BOT フィルタ付きで復活させる。

### 1.5 既存テスト影響分析

| テスト | 影響 | 対応 |
|---|---|---|
| `bot_system.feature` 全シナリオ | **影響なし** | BDD は BotService の振る舞いをテストしており、cron の実行基盤には依存しない |
| `src/__tests__/lib/services/bot-service.test.ts` | **影響なし** | DI でモック化済み。scheduled ハンドラは無関係 |
| `src/app/api/internal/bot/execute/route.ts` のテスト | **影響なし** | route.ts 自体は変更しない。CF Cron からも同じエンドポイントを呼ぶ |
| 荒らし役BOTのE2E | **要確認** | `wrangler dev --test-scheduled` でのローカル動作確認が必要 |

---

## 2. 初回書き込み検出 + ウェルカムシーケンス同期部分（Phase B）

### 2.1 初回書き込み検出ロジック

**配置:** `PostService.createPost()` 内、Step 7（IncentiveService 呼び出し）の直前

**検出条件:** `PostRepository.countByAuthorId(userId) === 0`

```
PostRepository に新規メソッドを追加:
  countByAuthorId(authorId: string): Promise<number>
    // SELECT count(*) FROM posts WHERE author_id = :authorId
```

**判断根拠:**
- ユーザーテーブルにフラグ（`has_posted` 等）を追加する方式も検討したが、posts テーブルの count で判定する方式は追加カラムが不要でシンプル
- 仮ユーザー → 本登録昇格時の `author_id` 引き継ぎは既存実装で保証されている（`users.id` が変わらない）ため、フラグ不整合のリスクがない
- パフォーマンス: `author_id` にはインデックスが存在する。初回書き込み時のみ COUNT クエリが走るため、2回目以降はスキップされる

**処理フロー（createPost 内）:**

```
既存 Step 6 (レス番号採番) 完了後:

Step 6.5: 初回書き込み検出（ウェルカムシーケンス）
  条件: !isSystemMessage && !isBotWrite && resolvedAuthorId != null
  a) count = PostRepository.countByAuthorId(resolvedAuthorId)
  b) if (count === 0):
     // ① 初回書き込みボーナス +50
     CurrencyService.credit(resolvedAuthorId, 50, "welcome_bonus")
     welcomeBonusText = "🎉 初回書き込みボーナス！ +50"
     // → inlineSystemInfo に追加（レス内マージ）

     // ② ウェルカムメッセージ（独立システムレス）
     // レス INSERT 後に別途 createPost で投稿
     welcomeMessagePending = true
     welcomeTargetPostNumber = postNumber

既存 Step 7 (IncentiveService) 以降を続行

Step 11.5: ウェルカムメッセージ投稿（welcomeMessagePending の場合）
  PostService.createPost({
    threadId: input.threadId,
    body: `>>${welcomeTargetPostNumber} Welcome to Underground...\nここはBOTと人間が入り混じる対戦型掲示板です`,
    edgeToken: null,
    ipHash: "system",
    displayName: "★システム",
    isBotWrite: true,   // 認証スキップ（※注記参照）
    isSystemMessage: true,  // コマンド解析・インセンティブスキップ
  })
  // 注記: isBotWrite=true はここでは「認証スキップ」の意味で使用している。
  // 意味的にはシステム投稿用の専用フラグ（isInternalWrite 等）が望ましいが、
  // 現在の PostService では isBotWrite=true の効果が「認証スキップ」に限定されるため
  // 実質的に問題は生じない。isSystemMessage=true との組み合わせで
  // コマンド解析・インセンティブもスキップされる。
  // 将来リファクタリングする場合は isBotWrite を isInternalWrite にリネームすることを推奨。

  // ③ チュートリアルBOT pending 登録
  PendingTutorialRepository.create({
    userId: resolvedAuthorId,
    threadId: input.threadId,
    triggerPostNumber: postNumber,
  })
```

### 2.2 仮ユーザー → 本登録昇格時の非発動制御

仮ユーザー時代に書き込み済みの場合、`posts.author_id` にはその仮ユーザーの `users.id` が記録されている。本登録昇格では `users.id` は変わらない（同一レコードに `supabase_auth_id` を追加するのみ）。したがって:

- 仮ユーザー時代に書き込み済み → `countByAuthorId` が 0 でない → ウェルカムシーケンス非発動
- **追加の制御ロジックは不要。** 既存のデータモデルで自然に満たされる。

### 2.3 CreditReason 追加

`src/lib/domain/models/currency.ts` の `CreditReason` 型に `"welcome_bonus"` を追加する。

```typescript
export type CreditReason =
  | "daily_login"
  | "streak_bonus"
  | /* ...既存値... */
  | "welcome_bonus";    // 新規追加
```

### 2.4 currency.feature v5 対応（INITIAL_BALANCE: 50 → 0）

**変更箇所一覧:**

| ファイル | 変更内容 |
|---|---|
| `src/lib/services/currency-service.ts` | `INITIAL_BALANCE = 50` → `INITIAL_BALANCE = 0` |
| `src/lib/services/__tests__/currency-service.test.ts` | `expect(INITIAL_BALANCE).toBe(50)` → `toBe(0)`, `initializeBalance` テストの期待値を 0 に |
| `src/lib/services/__tests__/auth-service.test.ts` | `initializeBalance` 呼び出しの期待値を 0 に（影響は軽微、モック化済み） |
| BDD step definitions (currency) | 「新規ユーザー登録時の通貨残高は 0 である」のステップ実装を確認 |

**判断根拠:**
- `initializeBalance` 自体は残す（通貨レコードの初期作成は必要。残高 0 で作成）
- `CurrencyRepository.create(userId, 0)` は問題なく動作する（既存実装は amount パラメータを受け取る）

### 2.5 inlineSystemInfo へのボーナス表示統合

既存の PostService は Step 8 で `inlineSystemInfo` を構築し、コマンド結果とインセンティブ結果を結合してレス本文末尾に付加する。ウェルカムボーナスも同じパスに載せる:

```
inlineSystemInfo 構築順序:
  1. コマンド実行結果（既存）
  2. インセンティブ結果（既存）
  3. ウェルカムボーナス（新規: "🎉 初回書き込みボーナス！ +50"）
```

ウェルカムボーナスとインセンティブの書き込みログインボーナスは **両方付与される**（初回書き込みはログインボーナスの条件も満たすため）。表示順序は上記の通りで、レス末尾にマージされる。

---

## 3. チュートリアルBOT（Phase C）

### 3.1 DB設計: pending_tutorials テーブル

`users` テーブルにフラグを追加する案と、独立テーブル案を比較する。

| 方式 | メリット | デメリット |
|---|---|---|
| `users.pending_tutorial_post_id` | テーブル追加不要 | NULL カラム増加。users テーブルの責務がぼやける |
| `pending_tutorials` テーブル | 責務分離が明確。複数 pending 対応可能 | テーブル追加 |

**決定: `pending_tutorials` テーブルを新設する**

理由:
- pending は一時的な状態であり、users テーブルの定常的なカラムとして残すのは不適切
- 処理完了後に DELETE するクリーンなライフサイクル（INSERT → CF Cron で処理 → DELETE）
- 将来的に他の非同期処理キューに拡張する際のパターンとなる

```sql
CREATE TABLE pending_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  thread_id UUID NOT NULL REFERENCES threads(id),
  trigger_post_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role のみアクセス可能
ALTER TABLE pending_tutorials ENABLE ROW LEVEL SECURITY;

-- 処理対象の検索用
CREATE INDEX idx_pending_tutorials_created_at ON pending_tutorials(created_at);
```

### 3.2 bot_profiles.yaml: tutorial プロファイル

```yaml
tutorial:
  hp: 10
  max_hp: 10
  reward:
    base_reward: 20
    daily_bonus: 0
    attack_bonus: 0
  fixed_messages: []    # チュートリアルBOTは固定文を使わない（本文はスポーン時に動的生成）
```

**撃破報酬の固定 +20 の実現方法:**

`daily_bonus: 0` かつ `attack_bonus: 0` と設定することで、既存の `calculateEliminationReward` 関数で `base_reward = 20` が常に返る。**`elimination-reward.ts` のコード修正は不要。**

計算式: `20 + (0 * 0) + (0 * 0) = 20`（survival_days と times_attacked に関わらず常に 20）

ただし、チュートリアルBOT は生存日数 0 で即座に撃破されることが想定されるため、times_attacked=1 の場合でも `attack_bonus=0` により報酬は固定 20 のまま。

### 3.3 チュートリアルBOT Strategy 設計

既存の BotStrategy インターフェースに準拠し、チュートリアルBOT 専用の Strategy 実装を追加する。

#### ContentStrategy: TutorialContentStrategy

```typescript
// src/lib/services/bot-strategies/content/tutorial.ts

export class TutorialContentStrategy implements ContentStrategy {
  async generateContent(context: ContentGenerationContext): Promise<string> {
    // context からターゲットのレス番号を取得
    // pending_tutorials.trigger_post_number を ContentGenerationContext に渡す
    const targetPostNumber = context.tutorialTargetPostNumber;
    return `>>${targetPostNumber} !w  新参おるやん🤣`;
  }
}
```

#### BehaviorStrategy: TutorialBehaviorStrategy

```typescript
// src/lib/services/bot-strategies/behavior/tutorial.ts

export class TutorialBehaviorStrategy implements BehaviorStrategy {
  async decideAction(context: BehaviorContext): Promise<BotAction> {
    // threadId は TutorialBotSpawner から直接渡される
    return { type: "post_to_existing", threadId: context.tutorialThreadId };
  }
}
```

#### SchedulingStrategy: ImmediateSchedulingStrategy

```typescript
// src/lib/services/bot-strategies/scheduling/immediate.ts

export class ImmediateSchedulingStrategy implements SchedulingStrategy {
  getNextPostDelay(_context: SchedulingContext): number {
    return 0; // 即時投稿。チュートリアルBOTは1回のみ書き込むため delay 不要
  }
}
```

#### ContentGenerationContext 拡張

```typescript
// types.ts に追加
export interface ContentGenerationContext {
  // ...既存フィールド...
  /** チュートリアルBOT用: ターゲットレス番号 */
  tutorialTargetPostNumber?: number;
}

export interface BehaviorContext {
  // ...既存フィールド...
  /** チュートリアルBOT用: ターゲットスレッドID */
  tutorialThreadId?: string;
}
```

#### resolveStrategies の拡張

```typescript
// strategy-resolver.ts に分岐を追加
export function resolveStrategies(
  bot: Bot,
  profile: BotProfile | null,
  options: ResolveStrategiesOptions,
): BotStrategies {
  // チュートリアルBOT判定
  if (bot.botProfileKey === "tutorial") {
    return {
      content: new TutorialContentStrategy(),
      behavior: new TutorialBehaviorStrategy(),
      scheduling: new ImmediateSchedulingStrategy(),
    };
  }

  // 既存のデフォルト解決（荒らし役）
  // ...
}
```

### 3.4 チュートリアルBOTスポーンフロー

CF Cron の scheduled ハンドラが `/api/internal/bot/execute` を呼び出す。この既存エンドポイント内で、通常のBOT投稿処理に加えてチュートリアルBOT の pending 処理を行う。

**新規 API エンドポイントは不要。** 既存の `/api/internal/bot/execute` を拡張する。

**拡張箇所:** `route.ts` の処理フロー末尾に pending_tutorials 処理を追加

```
POST /api/internal/bot/execute 処理フロー:
  1. [既存] Bearer 認証チェック
  2. [既存] getActiveBotsDueForPost() で投稿対象BOTを取得・実行
  3. [新規] processPendingTutorials():
     a. PendingTutorialRepository.findAll() で未処理の pending を取得
     b. 各 pending に対して:
        i.   BotRepository.create() でチュートリアルBOTを新規作成
             - name: "チュートリアルBOT"
             - bot_profile_key: "tutorial"
             - hp: 10, max_hp: 10
             - is_active: true
             - daily_id: generateFakeDailyId()
             - next_post_at: NOW()（即時投稿）
        ii.  BotService.executeBotPost(newBotId) で書き込み実行
             - TutorialContentStrategy が `>>N !w  新参おるやん🤣` を生成
             - PostService.createPost(isBotWrite=true) で投稿
        iii. PendingTutorialRepository.delete(pendingId)
  4. [既存] 結果をJSONで返す
```

**判断根拠:**
- チュートリアルBOTのスポーンと書き込みを1回の cron 実行で完結させる
- 専用エンドポイントを設けるとエンドポイント数が増え、scheduled ハンドラも複数の fetch が必要になる
- 既存エンドポイントの拡張であれば認証・エラーハンドリングを共用できる

### 3.5 コマンドパイプラインの isBotWrite=true 対応

チュートリアルBOTの書き込み本文 `>>N !w  新参おるやん🤣` には `!w` コマンドが含まれる。既存のコマンドパイプラインが `isBotWrite=true` でも動作するか確認する。

**確認ポイントと分析結果:**

| 確認項目 | 現状 | 対応要否 |
|---|---|---|
| command-parser がBOT書き込みでも動作するか | **動作する。** `parseCommand` は本文テキストのみを受け取る純粋関数であり、isBotWrite を意識しない | 不要 |
| CommandService.executeCommand が BOT userId で動作するか | **要確認。** `resolvedAuthorId` が null（BOT書き込み時）の場合、`userId: ""` が渡される。!w ハンドラは通貨消費なし（cost: 0）なので残高チェックをスキップするが、userId="" で草レコードを INSERT できるか確認が必要 | 要調査 |
| !w コマンドの cost: 0 が BOT（通貨残高なし）でも通過するか | **通過する。** CommandService は `cost > 0` の場合のみ `CurrencyService.deduct()` を呼ぶ。cost: 0 のコマンドは通貨チェックをスキップする | 不要 |

**対応が必要な箇所:**

PostService の `resolvedAuthorId` は BOT 書き込み時に `null` になる。コマンド実行時に `userId: resolvedAuthorId ?? ""` が渡されるが、!w ハンドラ（GrassHandler）は `userId` を草レコードの `voter_id` として使用する。BOT の userId が空文字だと不整合が発生する可能性がある。

**解決策:** BotService.executeBotPost 内で `createPost` を呼ぶ際に、BOT 自身の `botId` を `userId` 代わりに使うことはできない（PostService は BOT 固有のロジックを知らないため）。代わりに、PostService 内のコマンド実行パスで `isBotWrite=true` かつ `userId=""` の場合はコマンド実行をスキップする。

ただし、これではBOTの `!w` が実行されない。そこで別のアプローチを取る:

**修正方針:** チュートリアルBOTの書き込みでは `!w` コマンドの実行を **PostService のコマンドパイプラインで行う（既存パスを活用）** のではなく、**BOT 書き込み後に BotService 側で直接 GrassHandler を呼び出す** 方式にする。

......と複雑になるため、よりシンプルな方式を採用する:

**最終方針: PostService に BOT 用 userId を渡す**

BotService.executeBotPost から PostService.createPost を呼ぶ際に、新たに `botUserId` フィールドを PostInput に追加する。これにより、BOT 書き込み時でもコマンドが正常に実行される。

```
PostInput に追加:
  botUserId?: string  // BOT書き込み時のコマンド実行用仮ユーザーID
```

PostService 内の処理:
```
if (isBotWrite && input.botUserId) {
  resolvedAuthorId = input.botUserId;
}
```

BotService.executeBotPost から PostService.createPost を呼ぶ際に `botUserId: botId` を渡す。GrassHandler は `botId` を `voter_id` として使用する。BOT にはユーザーアカウントがないが、草レコードの voter_id は FK 制約がないため問題ない。

**ただし、この方式は PostService の責務を拡大する。** より望ましいのは以下:

**採用方針（最終）: チュートリアルBOTの !w はコマンドとして実行しない**

チュートリアルBOTの書き込み本文から `!w` を除去し、`!w` の効果（草を付ける）は BotService 側で直接 GrassRepository に INSERT する。これにより PostService への変更が不要になる。

......しかし、これは BDD シナリオ「`!w コマンドが実行されユーザーのレス >>5 に草が付く`」と矛盾する。BDD では `!w` が **コマンドとして** 実行されることが期待されている。

**最終決定: PostInput.botUserId 方式を採用する**

理由:
1. BDD シナリオが「!w コマンドが実行され」と明記しており、コマンドパイプライン経由で実行する必要がある
2. PostInput への 1 フィールド追加は最小限の変更で済む
3. GrassHandler は voter_id に FK 制約がないため、botId を渡しても問題ない

```typescript
// PostInput 追加フィールド
export interface PostInput {
  // ...既存...
  /** BOT書き込み時のコマンド実行用ユーザーID（botId をそのまま使用） */
  botUserId?: string;
}
```

PostService の resolvedAuthorId 解決ロジック修正:
```typescript
// Step 3 直後に追加
if (input.isBotWrite && input.botUserId) {
  resolvedAuthorId = input.botUserId;
}
```

### 3.6 撃破報酬: 固定 +20

§3.2 で述べた通り、`bot_profiles.yaml` の tutorial プロファイルで `base_reward: 20, daily_bonus: 0, attack_bonus: 0` と設定することで、既存の `calculateEliminationReward` で常に 20 が返る。`elimination-reward.ts` のコード修正は不要。

### 3.7 日次リセットでの復活除外

チュートリアルBOTは日次リセットで復活しない（`welcome.feature` シナリオ「チュートリアルBOTは日次リセットで復活しない」）。

**実装方針:** `BotService.performDailyReset()` の Step 4（eliminated → lurking 復活）で、tutorial プロファイルのBOTを除外する。

`BotRepository.bulkReviveEliminated()` のクエリに条件を追加:

```sql
-- 変更前
UPDATE bots SET is_active = true, ... WHERE is_active = false

-- 変更後
UPDATE bots SET is_active = true, ...
WHERE is_active = false
  AND (bot_profile_key IS NULL OR bot_profile_key != 'tutorial')
```

### 3.8 daily-maintenance での撃破済みチュートリアルBOTクリーンアップ

撃破済みのチュートリアルBOTレコードは daily-maintenance で削除する。

**配置:** `BotService.performDailyReset()` の末尾に追加

```typescript
// Step 6: 撃破済みチュートリアルBOTのクリーンアップ
await this.botRepository.deleteEliminatedTutorialBots();
```

```sql
-- BotRepository.deleteEliminatedTutorialBots()
DELETE FROM bots
WHERE bot_profile_key = 'tutorial'
  AND is_active = false;
-- 関連する bot_posts レコードは CASCADE で削除される（FK設定が必要）
-- CASCADE が未設定の場合は bot_posts も明示的に DELETE する
```

**未撃破のチュートリアルBOT:** 撃破されないまま残存するチュートリアルBOTも、一定日数（例: 7日）経過後にクリーンアップする。

```sql
DELETE FROM bots
WHERE bot_profile_key = 'tutorial'
  AND created_at < NOW() - INTERVAL '7 days';
```

### 3.9 GitHub Actions cron でのチュートリアルBOT除外

`welcome.feature`「チュートリアルBOTはGitHub Actions cronの定期書き込みを行わない」への対応。

Phase A で bot-scheduler.yml を無効化するため、この要件は自動的に満たされる。将来 bot-scheduler.yml を復活させる際は、`bot_profile_key = 'tutorial'` のBOTを除外するフィルタを API 側に追加する。

具体的には、`/api/internal/bot/execute` の `getActiveBotsDueForPost()` クエリにオプショナルなフィルタパラメータを追加する:

```
GET /api/internal/bot/execute?exclude_profiles=tutorial
```

ただし、CF Cron からの呼び出しではフィルタなし（全BOT対象）、GitHub Actions からの呼び出しではフィルタあり（AI API BOT のみ）という使い分けが必要になる。この詳細は Phase 3 実装時に設計する。

---

## 4. DB変更一覧

### 4.1 マイグレーション: ウェルカムシーケンス + チュートリアルBOT

ファイル名: `supabase/migrations/{timestamp}_welcome_sequence.sql`

```sql
-- 1. pending_tutorials テーブル新規作成
CREATE TABLE pending_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  thread_id UUID NOT NULL REFERENCES threads(id),
  trigger_post_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_tutorials ENABLE ROW LEVEL SECURITY;

-- service_role のみアクセス可能
CREATE POLICY "service_role_all" ON pending_tutorials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon / authenticated はアクセス不可
CREATE POLICY "deny_anon" ON pending_tutorials
  FOR ALL TO anon USING (false);
CREATE POLICY "deny_authenticated" ON pending_tutorials
  FOR ALL TO authenticated USING (false);

CREATE INDEX idx_pending_tutorials_created_at
  ON pending_tutorials(created_at);

-- 2. bot_posts に CASCADE 設定（チュートリアルBOTクリーンアップ用）
-- 既存の FK 制約を確認し、CASCADE が未設定なら追加
-- ALTER TABLE bot_posts DROP CONSTRAINT bot_posts_bot_id_fkey;
-- ALTER TABLE bot_posts ADD CONSTRAINT bot_posts_bot_id_fkey
--   FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;
```

### 4.2 CurrencyService: INITIAL_BALANCE 変更（コード変更のみ、マイグレーション不要）

`INITIAL_BALANCE = 50` → `INITIAL_BALANCE = 0`

既存ユーザーの残高には影響しない（initializeBalance は新規ユーザー作成時のみ呼ばれる）。

---

## 5. ドキュメント更新

### 5.1 D-08 bot.md 追記内容

以下のセクションを bot.md に追加する:

**§2.1 書き込み実行** に追記:
- CF Cron からの実行パス（scheduled → self-fetch → /api/internal/bot/execute → BotService.executeBotPost）

**§2.12.3 Strategy 実装一覧** に追記:

| Strategy インターフェース | 実装クラス | Phase | 対応BOT種別 |
|---|---|---|---|
| ContentStrategy | `TutorialContentStrategy` | 2 | チュートリアルBOT |
| BehaviorStrategy | `TutorialBehaviorStrategy` | 2 | チュートリアルBOT |
| SchedulingStrategy | `ImmediateSchedulingStrategy` | 2 | チュートリアルBOT |

**§2.10 日次リセット処理** に追記:
- チュートリアルBOTの復活除外（`bot_profile_key = 'tutorial'` は bulkReviveEliminated の対象外）
- 撃破済みチュートリアルBOTのクリーンアップ

**新規セクション: チュートリアルBOTライフサイクル:**
```
初回書き込み検出（PostService）
  → pending_tutorials INSERT
    → CF Cron (5分間隔)
      → processPendingTutorials
        → BotRepository.create (tutorial プロファイル)
          → executeBotPost (TutorialContentStrategy)
            → PostService.createPost (isBotWrite=true, ">>N !w  新参おるやん🤣")
              → !w コマンド実行（コスト0、コマンドパイプライン経由）
  → ユーザーが !attack で撃破
    → 固定報酬 +20
  → daily-maintenance
    → 撃破済みは DELETE
    → 7日経過の未撃破も DELETE
    → 日次リセットでの復活なし
```

**§5 データモデル変更** に追記:
- `pending_tutorials` テーブル定義
- `bot_profiles.yaml` に `tutorial` プロファイル追加

### 5.2 D-08 posting.md 追記内容

**§3.1 依存先** に追記:
- CurrencyService: 初回書き込みボーナス +50 の付与

**§5 設計上の判断** に追記:
- ウェルカムシーケンスの処理位置（Step 6.5）
- 初回書き込み検出方式の選定根拠

### 5.3 D-08 currency.md 追記内容

**§2 公開インターフェース** に追記:
- `INITIAL_BALANCE = 0`（v5変更）
- `CreditReason` に `welcome_bonus` 追加

---

## 6. 実装タスク分解案

### Phase A: CF Cron インフラ構築（1タスク）

| タスクID(仮) | タイトル | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-A1 | CF Cron scheduled ハンドラ + wrangler.toml | `src/cf-scheduled.ts` 新規作成、`wrangler.toml` 変更、bot-scheduler.yml 無効化、ローカル動作確認 | なし | `wrangler.toml`, `src/cf-scheduled.ts`, `.github/workflows/bot-scheduler.yml` |

### Phase B: ウェルカムシーケンス同期部分（1タスク）

| タスクID(仮) | タイトル | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-B1 | 初回書き込み検出 + ボーナス + ウェルカムメッセージ + Currency v5 | PostService に Step 6.5 追加、PostRepository.countByAuthorId 新規、CurrencyService.INITIAL_BALANCE=0、CreditReason 追加、単体テスト | なし | `src/lib/services/post-service.ts`, `src/lib/services/currency-service.ts`, `src/lib/infrastructure/repositories/post-repository.ts`, `src/lib/domain/models/currency.ts` |

### Phase C: チュートリアルBOT（2タスク）

| タスクID(仮) | タイトル | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-C1 | チュートリアルBOT DB + Strategy + プロファイル | マイグレーション（pending_tutorials）、bot_profiles.yaml に tutorial 追加、TutorialContentStrategy/BehaviorStrategy/ImmediateSchedulingStrategy 新規、resolveStrategies 拡張、PostInput.botUserId 追加、単体テスト | TASK-B1 | `config/bot_profiles.yaml`, `config/bot-profiles.ts`, `src/lib/services/bot-strategies/`, `src/lib/services/bot-service.ts`, `src/lib/services/post-service.ts`(PostInput型のみ) |
| TASK-C2 | チュートリアルBOT スポーン処理 + 日次リセット除外 + BDD | route.ts に processPendingTutorials 追加、PendingTutorialRepository 新規、BotRepository 拡張（deleteEliminatedTutorialBots, bulkReviveEliminated 除外条件）、BDD step definitions、単体テスト | TASK-A1, TASK-C1 | `src/app/api/internal/bot/execute/route.ts`, `src/lib/infrastructure/repositories/bot-repository.ts`, `features/step_definitions/welcome.steps.ts` |

### Phase E: ドキュメント整備（1タスク）

| タスクID(仮) | タイトル | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-E1 | D-08 bot.md / posting.md / currency.md 更新 | §5.1-5.3 の追記内容を反映 | TASK-C2 | `docs/architecture/components/bot.md`, `docs/architecture/components/posting.md`, `docs/architecture/components/currency.md` |

### 依存関係図

```
TASK-A1 (CF Cron) ─────────────────────┐
                                        │
TASK-B1 (ウェルカム同期) ──→ TASK-C1 ──→ TASK-C2 ──→ TASK-E1
                            (BOT Strategy)  (スポーン)    (ドキュメント)
```

- TASK-A1 と TASK-B1 は独立して並行作業可能
- TASK-C1 は TASK-B1 完了後（PostInput.botUserId の追加が前提）
- TASK-C2 は TASK-A1（CF Cron 基盤）と TASK-C1（Strategy 実装）の両方が前提
- TASK-E1 は全実装完了後

---

## 7. welcome.feature シナリオ → 実装パス マッピング

| シナリオ | 実装パス |
|---|---|
| 仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する | PostService Step 6.5: countByAuthorId==0 → ボーナス+ウェルカムメッセージ+pending |
| 本登録ユーザーが初めて書き込むとウェルカムシーケンスが発動する | 同上（仮/本登録の区別なく users.id ベースで判定） |
| 仮ユーザー時代に書き込み済みの場合は本登録後に発動しない | countByAuthorId > 0 のため Step 6.5 をスキップ（追加ロジック不要） |
| 2回目以降の書き込みではウェルカムシーケンスは発動しない | countByAuthorId > 0 のため Step 6.5 をスキップ |
| 初回書き込みボーナスとして +50 が付与されレス末尾にマージ表示される | CurrencyService.credit + inlineSystemInfo にマージ |
| 初回書き込みの直後にウェルカムメッセージが独立システムレスで表示される | PostService.createPost(isSystemMessage=true, displayName="★システム") |
| チュートリアルBOTがスポーンしてユーザーの初回書き込みに !w で反応する | pending_tutorials → CF Cron → processPendingTutorials → executeBotPost(TutorialContentStrategy) |
| ユーザーがチュートリアルBOTを1回の !attack で撃破できる | HP:10, !attack ダメージ:10 → 即撃破 → calculateEliminationReward(base_reward=20) |
| チュートリアルBOTは毎回新規スポーンなので必ず生存状態である | processPendingTutorials で毎回 BotRepository.create() |
| チュートリアルBOTは日次リセットで復活しない | bulkReviveEliminated で tutorial を除外 |
| チュートリアルBOTはGitHub Actions cronの定期書き込みを行わない | bot-scheduler.yml 無効化（Phase A）。将来復活時は exclude_profiles フィルタ |
