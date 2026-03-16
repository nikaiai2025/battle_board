# 草コマンド(!w) システム設計書

> TASK-098 成果物
> 作成日: 2026-03-17
> 対象BDD: `features/reactions.feature` (22シナリオ), `features/mypage.feature` (草カウント2シナリオ)

---

## 1. DBスキーマ設計

### 1.1 新規テーブル: `grass_reactions`

草の付与記録を管理するテーブル。重複制限(同日・同一付与先ユーザーに1回)のDB強制と、将来の履歴参照に使用する。

```sql
CREATE TABLE IF NOT EXISTS grass_reactions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    giver_id        UUID         NOT NULL REFERENCES users(id),
    receiver_id     UUID         NOT NULL REFERENCES users(id),
    target_post_id  UUID         NOT NULL REFERENCES posts(id),
    thread_id       UUID         NOT NULL REFERENCES threads(id),
    given_date      DATE         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 同日・同一付与者・同一受領者の重複を DB レベルで禁止
    CONSTRAINT grass_reactions_giver_receiver_date_unique
        UNIQUE (giver_id, receiver_id, given_date)
);
```

**設計判断**:

- **重複制限の粒度**: BDDシナリオ「同一ユーザーの別レスに草を生やしても重複として扱われる」により、制限は `(giver_id, receiver_id, given_date)` の組み合わせ。`target_post_id` は制約に含めない(記録のみ)。
- **`target_post_id` を記録する理由**: 最初にどのレス経由で草を生やしたかの履歴保持。将来の分析・通知用。
- **`thread_id` を記録する理由**: 将来のスレッド単位の統計機能への拡張パス確保。

### 1.2 `users` テーブルへの `grass_count` カラム追加

```sql
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS grass_count INTEGER NOT NULL DEFAULT 0;
```

**判断根拠**:

- BDDシナリオで草カウントはユーザーの通算値として頻繁に参照される(コマンド実行時のアイコン決定、マイページ表示)。
- `grass_reactions` テーブルの `COUNT(*)` で毎回集計するのはパフォーマンス上不利。
- `users.grass_count` をキャッシュカラムとして持ち、草付与時に `+1` する方式が最適。
- attacks テーブルの `bots.times_attacked` と同様のキャッシュパターン。

**代替案(不採用)**:
- `grass_reactions` からの都度集計: 正規化としては正しいが、アイコン決定とマイページ表示の両方で毎回 `COUNT(*)` が必要になりパフォーマンス劣化。
- 独立した `grass_counts` テーブル: `currencies` テーブルのパターン。1:1テーブルを増やす利点が薄い。`users` に直接追加する方が単純。

### 1.3 インデックス

```sql
-- 受領者のカウント取得・重複チェック用
CREATE INDEX IF NOT EXISTS grass_reactions_receiver_id_idx
    ON grass_reactions (receiver_id);

-- 付与者の日次重複チェック用(UNIQUE制約がカバーするため追加インデックスは不要)
-- UNIQUE (giver_id, receiver_id, given_date) が giver_id 先頭のため、
-- giver_id 単体の検索にも利用可能
```

### 1.4 RLSポリシー

```sql
ALTER TABLE grass_reactions ENABLE ROW LEVEL SECURITY;
-- anon / authenticated からの全操作を拒否(ポリシー未設定 = 全拒否)
-- service_role のみアクセス可能(他テーブルと同じパターン)
```

**理由**: 草の付与はコマンド実行(server-side)でのみ行われる。クライアントからの直接操作は不要。

---

## 2. Repository設計

### 2.1 GrassRepository (新規)

配置: `src/lib/infrastructure/repositories/grass-repository.ts`

```typescript
// --- 型定義 ---

/** grass_reactions テーブルの DB レコード(snake_case) */
interface GrassReactionRow {
  id: string;
  giver_id: string;
  receiver_id: string;
  target_post_id: string;
  thread_id: string;
  given_date: string;
  created_at: string;
}

/** ドメインモデル(camelCase) */
export interface GrassReaction {
  id: string;
  giverId: string;
  receiverId: string;
  targetPostId: string;
  threadId: string;
  givenDate: string;
  createdAt: Date;
}

// --- リポジトリ関数 ---

/**
 * 草リアクションを記録する。
 * UNIQUE制約違反(重複)の場合は null を返す(INSERTしない)。
 *
 * @param params.giverId     - 草を生やすユーザーのUUID
 * @param params.receiverId  - 草を受け取るユーザーのUUID
 * @param params.targetPostId - 対象レスのUUID
 * @param params.threadId    - スレッドのUUID
 * @param params.givenDate   - 付与日(YYYY-MM-DD)
 * @returns 作成された GrassReaction、重複時は null
 */
export async function create(params: {
  giverId: string;
  receiverId: string;
  targetPostId: string;
  threadId: string;
  givenDate: string;
}): Promise<GrassReaction | null>;

/**
 * 同日・同一付与者・同一受領者の草記録が存在するか判定する。
 *
 * @param giverId    - 付与者のUUID
 * @param receiverId - 受領者のUUID
 * @param date       - 判定日(YYYY-MM-DD)
 * @returns 存在する場合 true
 */
export async function existsForToday(
  giverId: string,
  receiverId: string,
  date: string
): Promise<boolean>;

/**
 * ユーザーの草カウント(通算)を取得する。
 * users.grass_count カラムから取得する。
 *
 * @param userId - 対象ユーザーのUUID
 * @returns 草カウント(存在しないユーザーは 0)
 */
export async function getGrassCount(userId: string): Promise<number>;

/**
 * ユーザーの草カウントを +1 する。
 * users.grass_count をアトミックに INCREMENT する。
 * (Supabase: .rpc() またはインライン SQL)
 *
 * @param userId - 対象ユーザーのUUID
 * @returns 更新後の草カウント
 */
export async function incrementGrassCount(userId: string): Promise<number>;
```

**設計判断**:

- `create` は ON CONFLICT DO NOTHING パターンで重複を安全にハンドリングする。アプリ層での事前チェック(`existsForToday`)に加え、DB制約が最終防衛線。
- `incrementGrassCount` は `UPDATE users SET grass_count = grass_count + 1 WHERE id = $1 RETURNING grass_count` のアトミック更新。Supabase の `.rpc()` を使用するか、`update` + `select` の2ステップで実装する。

### 2.2 PostRepository 拡張 (既存ファイルへの追加)

GrassHandler が対象レスの author_id を解決するために、既存の PostRepository を使用する。追加メソッドは不要(`findById` で十分)。

ただし、現在の PostRepository には `findByThreadIdAndPostNumber` が存在しない。GrassHandler はコマンド引数として `>>N` (レス番号)を受け取るが、CommandContext は UUID ベースの `postId` ではなくレス番号を受け取る。レス番号 -> UUID の解決は GrassHandler の責務として、以下のメソッドを PostRepository に追加する必要がある:

```typescript
/**
 * スレッドID + レス番号でレスを取得する。
 *
 * @param threadId   - スレッドのUUID
 * @param postNumber - レス番号
 * @returns 見つかった Post、存在しない場合は null
 */
export async function findByThreadIdAndPostNumber(
  threadId: string,
  postNumber: number
): Promise<Post | null>;
```

**注記**: AttackHandler は `ctx.args[0]` を直接 `postRepository.findById(targetArg)` に渡している。これは CommandService/PostService 上流で UUID 解決済みの前提。GrassHandler も同じパターンを踏襲する場合、上流側が `>>N` を UUID に変換してから `ctx.args[0]` に渡す設計が望ましい。

**推奨**: 既存の tell-handler/attack-handler と同じ方式を踏襲し、`ctx.args[0]` には UUID 解決済みの `postId` が渡される前提とする。UUID 解決は CommandService 上流または BDD ステップ定義で行う。GrassHandler 自体は PostRepository を DI で受け取り、`findById` で対象レスを取得する。

---

## 3. ドメインルール設計

### 3.1 アイコン決定関数

配置: `src/lib/domain/rules/grass-icon.ts`

```typescript
/** 草アイコンの定義 */
const GRASS_ICONS = ['🌱', '🌿', '🌳', '🍎', '🫘'] as const;

/** 1サイクルの本数(50本でループ) */
const CYCLE_LENGTH = 50;

/** 1段階あたりの本数 */
const STEP_SIZE = 10;

/**
 * 草カウントに応じたアイコンを返す。
 * 50本で1周するループ構造(0-9: 🌱, 10-19: 🌿, 20-29: 🌳, 30-39: 🍎, 40-49: 🫘)。
 *
 * See: features/reactions.feature §成長ビジュアル
 *
 * @param grassCount - 草の通算本数(0以上の整数)
 * @returns 対応するアイコン文字列
 */
export function getGrassIcon(grassCount: number): string {
  const remainder = grassCount % CYCLE_LENGTH;
  const index = Math.floor(remainder / STEP_SIZE);
  return GRASS_ICONS[index];
}

/**
 * 草システムメッセージを生成する。
 *
 * フォーマット: ">>N (ID:xxxxxxxx) に草 ICON(計M本)"
 *
 * See: features/reactions.feature §草を生やした結果がレス末尾にマージ表示される
 *
 * @param targetPostNumber - 対象レスのレス番号
 * @param targetDailyId    - 対象レスの書き込み主のdailyId
 * @param newGrassCount    - 付与後の草カウント(通算)
 * @returns システムメッセージ文字列
 */
export function formatGrassMessage(
  targetPostNumber: number,
  targetDailyId: string,
  newGrassCount: number,
): string {
  const icon = getGrassIcon(newGrassCount);
  return `>>${targetPostNumber} (ID:${targetDailyId}) に草 ${icon}(計${newGrassCount}本)`;
}
```

**テスト方針**: `getGrassIcon` は純粋関数であり、BDDシナリオの全アイコンパターン(1-9, 10, 20, 30, 40, 50)を単体テストでカバーする。

### 3.2 重複判定ルール

| ルール | BDDシナリオ |
|---|---|
| 同日・同一付与先ユーザー -> 拒否 | 「同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される」 |
| 同一ユーザーの別レス -> 重複(付与先ユーザー単位) | 「同一ユーザーの別レスに草を生やしても重複として扱われる」 |
| 日付変更後 -> 再付与可能 | 「日付が変われば同じユーザーに再度草を生やせる」 |
| 異なる付与先 -> それぞれ可能 | 「異なる付与先ユーザーにはそれぞれ草を生やせる」 |

判定ロジックの実装場所: **GrassHandler 内**(Service層)。
DB制約 `UNIQUE (giver_id, receiver_id, given_date)` が最終防衛線。

### 3.3 バリデーションルール

| チェック項目 | エラーメッセージ | BDDシナリオ |
|---|---|---|
| 対象レス番号未指定 | "対象レスを指定してください(例: !w >>3)" | 「対象レス番号を指定せずに !w を実行するとエラーになる」 |
| 対象レスが存在しない | (汎用エラー) | 「存在しないレスに草を生やそうとするとエラーになる」 |
| 自分のレスへの草 | "自分のレスには草を生やせません" | 「自分が書いたレスには草を生やせない」 |
| システムメッセージ | "システムメッセージには草を生やせません" | 「システムメッセージには草を生やせない」 |
| 削除済みレス | "削除されたレスには草を生やせません" | 「削除済みレスには草を生やせない」 |
| 同日重複 | "今日は既にこのユーザーに草を生やしています" | 「同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される」 |

---

## 4. GrassHandler 契約

### 4.1 クラス設計

配置: `src/lib/services/handlers/grass-handler.ts` (既存ファイルの置き換え)

```typescript
import type { CommandHandler, CommandContext, CommandHandlerResult } from '../command-service';
import type { Post } from '../../domain/models/post';

// ---------------------------------------------------------------------------
// 依存インターフェース(DI用)
// ---------------------------------------------------------------------------

/** GrassHandler が使用する PostRepository のインターフェース */
export interface IGrassPostRepository {
  findById(id: string): Promise<Post | null>;
}

/** GrassHandler が使用する GrassRepository のインターフェース */
export interface IGrassRepository {
  existsForToday(giverId: string, receiverId: string, date: string): Promise<boolean>;
  create(params: {
    giverId: string;
    receiverId: string;
    targetPostId: string;
    threadId: string;
    givenDate: string;
  }): Promise<{ id: string } | null>;
  incrementGrassCount(userId: string): Promise<number>;
}

/**
 * !w(草)ハンドラ。
 *
 * 処理フロー:
 *   1. 引数チェック(>>N 形式)
 *   2. 対象レス取得(PostRepository.findById)
 *   3. バリデーション(存在・削除・システムメッセージ・自己草)
 *   4. 受領者(対象レスの authorId)の特定
 *   5. 重複チェック(GrassRepository.existsForToday)
 *   6. 草記録作成(GrassRepository.create)
 *   7. 草カウント加算(GrassRepository.incrementGrassCount)
 *   8. システムメッセージ生成(formatGrassMessage)
 *
 * See: features/reactions.feature
 * See: docs/architecture/components/command.md §2.2
 */
export class GrassHandler implements CommandHandler {
  readonly commandName = 'w';

  constructor(
    private readonly postRepository: IGrassPostRepository,
    private readonly grassRepository: IGrassRepository,
  ) {}

  async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
    // ... 上記の処理フローを実装
  }
}
```

### 4.2 CommandService への統合

現在の CommandService コンストラクタで `new GrassHandler()` を引数なしで生成している箇所を変更し、DI で PostRepository と GrassRepository を注入する。

**変更箇所**: `src/lib/services/command-service.ts`

```typescript
// 変更前:
const handlers: CommandHandler[] = [
  new GrassHandler(),
  new TellHandler(resolvedAccusationService),
  ...
];

// 変更後:
const handlers: CommandHandler[] = [
  new GrassHandler(postRepository, grassRepository),  // DI注入
  new TellHandler(resolvedAccusationService),
  ...
];
```

CommandService コンストラクタのシグネチャに `grassHandler?: GrassHandler | null` パラメータを追加する方式(AttackHandler と同じパターン)を推奨する。本番環境ではデフォルト生成、テスト時はモック注入。

### 4.3 ボットへの草対応

BDDシナリオ:
- 「ボットの書き込みに草を生やせる」: ボットの書き込みは `posts.author_id = NULL` かつ `bot_posts` テーブルに紐付く。
- 「ボットの正体は暴露されない」: GrassHandler は BotService に一切依存しない(ボット判定をしない)。

**設計方針**:

ボットの書き込みの `author_id` は NULL であるが、草はユーザーに紐づく。ボットへの草付与には以下の解決策が必要:

1. **BotRepository からボットの仮ユーザーIDを取得する**: `bot_posts` テーブル経由で `bots.id` を取得し、それを `receiver_id` として使用する。
2. **ボットにも `users` テーブルのレコードを持たせる**: これは現状の設計と矛盾する(ボットは `users` テーブルに存在しない)。

**推奨案**: ボットへの草は `receiver_id` に `bots.id` を格納する。`grass_reactions.receiver_id` の FK制約は `users(id)` だが、ボットの場合は FK を外すか、ボット用の仮ユーザーを作るかの選択が必要。

**最もシンプルな案(推奨)**:
- GrassHandler は `authorId` が NULL の場合、`bot_posts` テーブルを参照してボットか判定する。
- ボットの場合: 草記録の `receiver_id` にボットの `id` を使用するため、`grass_reactions.receiver_id` の FK を `users(id)` から外す(または `REFERENCES` を省略する)。
- ボットの `grass_count` は `bots` テーブルに `grass_count` カラムを追加する。

**代替案(より保守的)**:
- `grass_reactions.receiver_id` を nullable にし、代わりに `receiver_bot_id UUID REFERENCES bots(id)` カラムを追加する。`receiver_id` か `receiver_bot_id` のいずれかが NOT NULL (CHECK制約)。

**最終推奨**: ボットへの草対応は将来のPhase 4(HP回復)で本格設計する旨がfeatureコメントに記載されている。MVPでは以下の最小限対応とする:

1. GrassHandler は `authorId` が NULL のレスに対して `bot_posts` テーブルを参照する。
2. ボットの書き込みであれば、草カウントの永続化は**行わず**、成功メッセージのみ返す。
3. `grass_reactions` テーブルには `receiver_id = NULL` で記録し、`receiver_bot_id` カラムを追加する(FK: `bots(id)`)。
4. ボットの草カウント集計はPhase 4で実装する。

この方針であればBDDシナリオ「ボットの書き込みに草を生やせる」(コマンドが正常に実行される)を満たしつつ、DB設計の複雑化を最小限に抑えられる。

**スキーマ修正(ボット対応版)**:

```sql
CREATE TABLE IF NOT EXISTS grass_reactions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    giver_id        UUID         NOT NULL REFERENCES users(id),
    receiver_id     UUID         REFERENCES users(id),          -- 人間の場合
    receiver_bot_id UUID         REFERENCES bots(id),           -- ボットの場合
    target_post_id  UUID         NOT NULL REFERENCES posts(id),
    thread_id       UUID         NOT NULL REFERENCES threads(id),
    given_date      DATE         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 受領者は人間かボットのいずれか一方が必須
    CONSTRAINT grass_reactions_receiver_check
        CHECK (
            (receiver_id IS NOT NULL AND receiver_bot_id IS NULL)
            OR (receiver_id IS NULL AND receiver_bot_id IS NOT NULL)
        ),

    -- 同日・同一付与者・同一受領者(人間)の重複を禁止
    CONSTRAINT grass_reactions_giver_receiver_date_unique
        UNIQUE (giver_id, receiver_id, given_date),

    -- 同日・同一付与者・同一受領者(ボット)の重複を禁止
    CONSTRAINT grass_reactions_giver_bot_date_unique
        UNIQUE (giver_id, receiver_bot_id, given_date)
);
```

**注意**: PostgreSQLの UNIQUE 制約は NULL を distinct value として扱うため、`receiver_id` が NULL のレコードは `giver_receiver_date_unique` に引っかからない。そのためボット用の別制約が必要。

### 4.4 GrassHandler 依存注入の追加

ボットの書き込み判定に `bot_posts` テーブルを参照する必要があるため、以下のインターフェースを追加する:

```typescript
/** GrassHandler が使用する BotPostRepository のインターフェース(読み取り専用) */
export interface IGrassBotPostRepository {
  findByPostId(postId: string): Promise<{ botId: string } | null>;
}
```

GrassHandler のコンストラクタシグネチャ:

```typescript
constructor(
  private readonly postRepository: IGrassPostRepository,
  private readonly grassRepository: IGrassRepository,
  private readonly botPostRepository: IGrassBotPostRepository,
)
```

---

## 5. mypage連携

### 5.1 MypageInfo への草カウント追加

`MypageInfo` インターフェースに以下を追加:

```typescript
export interface MypageInfo {
  // ... 既存フィールド
  /** 草カウント(通算) */
  grassCount: number;
  /** 草アイコン(カウントに応じて変化) */
  grassIcon: string;
}
```

### 5.2 getMypage の修正

```typescript
export async function getMypage(userId: string): Promise<MypageInfo | null> {
  const [user, balance] = await Promise.all([
    UserRepository.findById(userId),
    CurrencyService.getBalance(userId),
  ]);

  if (!user) return null;

  // 草カウントは users.grass_count から取得(追加クエリ不要)
  const grassCount = user.grassCount;  // User モデルに追加
  const grassIcon = getGrassIcon(grassCount);

  return {
    // ... 既存フィールド
    grassCount,
    grassIcon,
  };
}
```

### 5.3 User モデルへの草カウント追加

`src/lib/domain/models/user.ts`:

```typescript
export interface User {
  // ... 既存フィールド
  /** 草カウント(通算) */
  grassCount: number;
}
```

`src/lib/infrastructure/repositories/user-repository.ts` の `UserRow` と `rowToUser`:

```typescript
interface UserRow {
  // ... 既存フィールド
  grass_count: number;
}

function rowToUser(row: UserRow): User {
  return {
    // ... 既存フィールド
    grassCount: row.grass_count,
  };
}
```

---

## 6. SQLマイグレーション案

ファイル: `supabase/migrations/00008_grass_system.sql`

```sql
-- =============================================================================
-- 00008_grass_system.sql
-- 草コマンド(!w)システム: grass_reactions テーブル新規作成 + users.grass_count 追加
-- 参照ドキュメント: features/reactions.feature
--                  tmp/workers/bdd-architect_TASK-098/grass_system_design.md
--
-- 変更内容:
--   1. users テーブルに grass_count カラムを追加
--   2. grass_reactions テーブルを新規作成
--   3. grass_reactions テーブルの RLS 設定
--   4. grass_reactions テーブルのインデックス作成
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. users テーブルに grass_count カラムを追加
-- 草の通算受領回数をキャッシュする非正規化カラム。
-- 草付与時に +1 するアトミック更新で使用する。
-- マイページ表示(mypage.feature)とアイコン決定(reactions.feature)で参照される。
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS grass_count INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. grass_reactions テーブルを新規作成
-- 草の付与記録。同日・同一付与者・同一受領者の重複を DB レベルで禁止する。
-- receiver_id(人間)と receiver_bot_id(ボット)の排他的OR構造。
-- See: features/reactions.feature §重複制限
-- See: features/reactions.feature §ボットへの草
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grass_reactions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    giver_id        UUID         NOT NULL REFERENCES users(id),
    receiver_id     UUID         REFERENCES users(id),
    receiver_bot_id UUID         REFERENCES bots(id),
    target_post_id  UUID         NOT NULL REFERENCES posts(id),
    thread_id       UUID         NOT NULL REFERENCES threads(id),
    given_date      DATE         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 受領者は人間かボットのいずれか一方が必須
    CONSTRAINT grass_reactions_receiver_check
        CHECK (
            (receiver_id IS NOT NULL AND receiver_bot_id IS NULL)
            OR (receiver_id IS NULL AND receiver_bot_id IS NOT NULL)
        ),

    -- 同日・同一付与者・同一人間受領者の重複を禁止
    CONSTRAINT grass_reactions_giver_receiver_date_unique
        UNIQUE (giver_id, receiver_id, given_date),

    -- 同日・同一付与者・同一ボット受領者の重複を禁止
    CONSTRAINT grass_reactions_giver_bot_date_unique
        UNIQUE (giver_id, receiver_bot_id, given_date)
);

-- -----------------------------------------------------------------------------
-- 3. RLS を有効化
-- service_role のみアクセス可能(他のゲーム系テーブルと同じパターン)。
-- -----------------------------------------------------------------------------
ALTER TABLE grass_reactions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. インデックス作成
-- receiver_id での集計クエリ用(将来の一括集計・検証用)
-- UNIQUE 制約が giver_id 先頭のインデックスを自動作成するため、giver_id 用は不要
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS grass_reactions_receiver_id_idx
    ON grass_reactions (receiver_id)
    WHERE receiver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS grass_reactions_receiver_bot_id_idx
    ON grass_reactions (receiver_bot_id)
    WHERE receiver_bot_id IS NOT NULL;
```

---

## 7. 処理フロー図

```
ユーザーB が "!w >>3" を実行
  │
  ▼
CommandService.executeCommand()
  │  parseCommand("!w >>3") → { name: "w", args: [">>3"] }
  │  cost = 0 → 通貨チェック/消費スキップ
  │
  ▼
GrassHandler.execute(ctx)
  │
  ├─ 1. 引数チェック: args[0] が存在するか
  │
  ├─ 2. 対象レス取得: postRepository.findById(args[0])
  │     ├─ null → エラー "指定されたレスが見つかりません"
  │     ├─ isDeleted → エラー "削除されたレスには草を生やせません"
  │     └─ isSystemMessage → エラー "システムメッセージには草を生やせません"
  │
  ├─ 3. 自己草チェック: post.authorId === ctx.userId
  │     └─ true → エラー "自分のレスには草を生やせません"
  │
  ├─ 4. 受領者(receiverId)の特定:
  │     ├─ post.authorId != null → receiverId = post.authorId (人間)
  │     └─ post.authorId == null → botPostRepository.findByPostId()
  │           ├─ ボット → receiverBotId = botPost.botId
  │           └─ 非ボット・非システム → エラー
  │
  ├─ 5. 重複チェック: grassRepository.existsForToday(ctx.userId, receiverId, today)
  │     └─ true → エラー "今日は既にこのユーザーに草を生やしています"
  │
  ├─ 6. 草記録作成: grassRepository.create(...)
  │
  ├─ 7. 草カウント加算: grassRepository.incrementGrassCount(receiverId)
  │     (ボットの場合はスキップ — Phase 4 で実装)
  │
  └─ 8. メッセージ生成: formatGrassMessage(postNumber, dailyId, newCount)
        └─ return { success: true, systemMessage: ">>3 (ID:Ax8kP2) に草 🌱(計5本)" }
```

---

## 8. 設計上の判断サマリー

| # | 判断 | 根拠 |
|---|---|---|
| D-1 | `users.grass_count` キャッシュカラムを採用 | 頻繁な参照(コマンド実行時+マイページ)に対する都度集計のコスト回避。`bots.times_attacked` と同パターン |
| D-2 | 重複制限は `(giver_id, receiver_id, given_date)` のDB制約 | アプリ層チェック + DB制約の二重防御。`attacks` テーブルと同パターン |
| D-3 | ボットへの草はMVPでは記録のみ(草カウント非加算) | Phase 4 HP回復機能と合わせて設計すべき。BDDシナリオは「コマンドが正常に実行される」のみ要求 |
| D-4 | GrassHandler はDIパターンを採用 | tell-handler/attack-handler と同一のアーキテクチャパターン踏襲 |
| D-5 | アイコン決定関数は `domain/rules/` に配置 | 外部依存なしの純粋関数。テスト容易性の確保 |
| D-6 | `grass_reactions` の `receiver_id/receiver_bot_id` 排他構造 | 人間とボットのFK先が異なるため、CHECK制約で排他性を保証 |

---

## 9. 実装ファイル一覧(TASK-099以降向け)

| ファイル | 種別 | 内容 |
|---|---|---|
| `supabase/migrations/00008_grass_system.sql` | 新規 | マイグレーション |
| `src/lib/domain/rules/grass-icon.ts` | 新規 | アイコン決定・メッセージ生成(純粋関数) |
| `src/lib/domain/models/user.ts` | 修正 | `grassCount` フィールド追加 |
| `src/lib/infrastructure/repositories/grass-repository.ts` | 新規 | 草記録のCRUD |
| `src/lib/infrastructure/repositories/user-repository.ts` | 修正 | `rowToUser` に `grass_count` マッピング追加 |
| `src/lib/infrastructure/repositories/post-repository.ts` | 修正 | `findByThreadIdAndPostNumber` 追加(必要に応じて) |
| `src/lib/services/handlers/grass-handler.ts` | 修正(全面書き換え) | MVPスタブ → 本格実装 |
| `src/lib/services/command-service.ts` | 修正 | GrassHandler のDI注入対応 |
| `src/lib/services/mypage-service.ts` | 修正 | `MypageInfo` に草フィールド追加 |
| `src/__tests__/lib/domain/rules/grass-icon.test.ts` | 新規 | アイコン決定の単体テスト |
| `features/step_definitions/reactions.steps.ts` | 新規 | BDDステップ定義 |
