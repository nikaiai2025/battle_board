# BOT情報漏洩修正 設計書

> 作成: 2026-03-24
> ステータス: 承認済み（方針）→ BDDシナリオ追記待ち → 実装待ち

## 1. 概要

BOTが意図せず正体を特定されるパターンが3件見つかった。
ゲーム設計上、BOT判定には `!tell`(10コイン) / `!attack`(5コイン+賠償リスク) のコストが必要だが、
以下の手段でコスト0〜20で確定的にBOTを識別できてしまう。

| ID | 手段 | コスト | BDD仕様 | 修正方針 |
|---|---|---|---|---|
| LEAK-1 | `!w` → 「計0本」表示 | 0 | reactions.feature 違反 | BOTにも草カウントを持たせる |
| LEAK-2 | `!hissi` → 「このレスは対象にできません」 | 20 | investigation.feature 未定義 | BOTにも書き込み履歴を返す |
| LEAK-3 | `!kinou` → 「このレスは対象にできません」 | 20 | investigation.feature 未定義 | BOTにも昨日のID情報を返す |

## 2. LEAK-1: `!w` — BOTの草カウントが常に0

### 2.1 原因

`grass-handler.ts` L237-241: BOTへの草は `incrementGrassCount` をスキップし `newGrassCount=0` のままメッセージ生成に渡す。

```
人間: ">>3 (ID:xxx) に草 🌱(計1本)"  ← incrementの戻り値(最低1)
BOT:  ">>5 (ID:xxx) に草 🌱(計0本)"  ← 固定値0
```

### 2.2 修正設計

#### 2.2.1 DBマイグレーション (`supabase/migrations/00029_bot_grass_count.sql`)

```sql
-- bots テーブルに grass_count カラムを追加
ALTER TABLE bots ADD COLUMN IF NOT EXISTS grass_count INTEGER NOT NULL DEFAULT 0;

-- increment_bot_column の許可リストに 'grass_count' を追加
CREATE OR REPLACE FUNCTION increment_bot_column(p_bot_id UUID, p_column TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_result INTEGER;
BEGIN
  IF p_column NOT IN (
    'total_posts', 'accused_count', 'survival_days', 'times_attacked',
    'grass_count'  -- 追加
  ) THEN
    RAISE EXCEPTION 'increment_bot_column: invalid column name: %', p_column;
  END IF;
  EXECUTE format('UPDATE bots SET %I = %I + 1 WHERE id = $1 RETURNING %I', p_column, p_column, p_column)
  INTO v_result USING p_bot_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'increment_bot_column: bot not found: %', p_bot_id; END IF;
  RETURN v_result;
END; $$;
```

#### 2.2.2 ドメインモデル (`src/lib/domain/models/bot.ts`)

`Bot` インターフェースに `grassCount: number` を追加。

#### 2.2.3 GrassRepository (`src/lib/infrastructure/repositories/grass-repository.ts`)

`incrementBotGrassCount(botId)` を追加。既存の `increment_bot_column` RPC を使用:

```typescript
export async function incrementBotGrassCount(botId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("increment_bot_column", {
    p_bot_id: botId,
    p_column: "grass_count",
  });
  if (error) throw new Error(`incrementBotGrassCount failed: ${error.message}`);
  return data as number;
}
```

#### 2.2.4 GrassHandler (`src/lib/services/handlers/grass-handler.ts`)

IGrassRepository に `incrementBotGrassCount` を追加し、ステップ8を修正:

```typescript
// Before:
let newGrassCount = 0;
if (!isBot && receiverId !== null) {
    newGrassCount = await this.grassRepository.incrementGrassCount(receiverId);
}

// After:
let newGrassCount = 0;
if (!isBot && receiverId !== null) {
    newGrassCount = await this.grassRepository.incrementGrassCount(receiverId);
} else if (isBot && receiverBotId !== null) {
    newGrassCount = await this.grassRepository.incrementBotGrassCount(receiverBotId);
}
```

### 2.3 BDDシナリオ追加提案 (reactions.feature §ボットへの草)

```gherkin
Scenario: ボットの書き込みに草を生やすと正しい草カウントが表示される
  Given 運営ボットがスレッドで潜伏中である
  And レス >>5 はボットの書き込みである
  And ボットの草カウントが 0 である
  When ユーザーが "!w >>5" を実行する
  Then レス末尾のシステム情報に "🌱(計1本)" が含まれる
  And ボットの正体は暴露されない
```

## 3. LEAK-2 / LEAK-3: `!hissi` / `!kinou` — エラーメッセージでBOT識別

### 3.1 原因

両ハンドラの `authorId === null` チェックで「このレスは対象にできません」を返す。
通常表示・非削除のレスでこのエラーが出るのは authorId=null（=BOT）のみ。

### 3.2 修正方針

BOTの書き込みにも人間と同じフォーマットで応答する。
検索キーを `authorId` から `dailyId` にフォールバックする。

dailyId の性質:
- 同一ユーザー/BOTの同日書き込みは同一 dailyId（`generateDailyId(seed, boardId, dateJst)` の決定的出力）
- 日付が変わると dailyId も変わる（dateJst がハッシュ入力に含まれる）
- よって dailyId で検索すれば日付フィルタ不要で当日分が取得できる

### 3.3 共通: PostRepository に `findByDailyId` を追加

```typescript
// src/lib/infrastructure/repositories/post-repository.ts
export async function findByDailyId(
  dailyId: string,
  options: { limit?: number } = {},
): Promise<Post[]> {
  let query = supabaseAdmin
    .from("posts").select("*")
    .eq("daily_id", dailyId)
    .eq("is_system_message", false)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (options.limit !== undefined) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error(`findByDailyId failed: ${error.message}`);
  return (data as PostRow[]).map(rowToPost);
}
```

マイグレーションでインデックスを追加:
```sql
CREATE INDEX IF NOT EXISTS idx_posts_daily_id ON posts (daily_id);
```

### 3.4 HissiHandler の修正

#### 依存追加

```typescript
export interface IHissiBotPostRepository {
  findByPostId(postId: string): Promise<{ botId: string } | null>;
}
```

コンストラクタに `botPostRepository` を追加（DI）。

#### ステップ3c の分岐変更

```typescript
// Before:
if (targetPost.authorId === null) {
  return { success: false, systemMessage: "このレスは対象にできません" };
}

// After:
if (targetPost.authorId === null) {
  // BOT判定: BOTなら dailyId で書き込み検索、それ以外はエラー
  const botPost = await this.botPostRepository.findByPostId(targetArg);
  if (!botPost) {
    return { success: false, systemMessage: "このレスは対象にできません" };
  }
  // BOTの書き込みを dailyId ベースで検索（人間と同じフォーマットで応答）
  const dailyId = targetPost.dailyId;
  const allPosts = await this.postRepository.findByDailyId(dailyId);
  const totalCount = allPosts.length;
  const displayPosts = [...allPosts.slice(0, 3)].reverse();
  // 以降は人間パスと同じメッセージ生成ロジック
  // ... (既存の header/postLines 生成処理を共通化)
}
```

### 3.5 KinouHandler の修正

#### 依存追加

```typescript
export interface IKinouBotPostRepository {
  findByPostId(postId: string): Promise<{ botId: string } | null>;
}
```

加えて、`generateDailyId` と `DEFAULT_BOARD_ID` をインポート。

#### ステップ3c の分岐変更

```typescript
if (targetPost.authorId === null) {
  const botPost = await this.botPostRepository.findByPostId(targetArg);
  if (!botPost) {
    return { success: false, systemMessage: "このレスは対象にできません" };
  }
  const todayDailyId = targetPost.dailyId;

  // BOTの昨日のdailyIdを計算
  // post-service は authorIdSeed = ipHash = "bot-{botId}" で dailyId を生成する
  const botAuthorIdSeed = `bot-${botPost.botId}`;
  const yesterdayJst = getYesterdayJst();  // JST基準（generateDailyIdの入力と同基準）
  const yesterdayDailyId = generateDailyId(botAuthorIdSeed, DEFAULT_BOARD_ID, yesterdayJst);

  // 昨日のdailyIdで書き込みを検索
  const yesterdayPosts = await this.postRepository.findByDailyId(yesterdayDailyId, { limit: 1 });
  if (yesterdayPosts.length === 0) {
    return {
      success: true, systemMessage: null,
      independentMessage: `ID:${todayDailyId} は昨日の書き込みがありません`,
    };
  }
  return {
    success: true, systemMessage: null,
    independentMessage: `ID:${todayDailyId} の昨日のID → ID:${yesterdayDailyId}`,
  };
}
```

ヘルパー関数 `getYesterdayJst()` を追加:
```typescript
function getYesterdayJst(): string {
  const now = new Date(Date.now());
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstDate = new Date(now.getTime() + jstOffset);
  jstDate.setUTCDate(jstDate.getUTCDate() - 1);
  return jstDate.toISOString().slice(0, 10);
}
```

### 3.6 BDDシナリオ追加提案 (investigation.feature)

```gherkin
# !hissi — BOT対応
Scenario: ボットの書き込みに !hissi を実行すると書き込み履歴が表示される
  Given 運営ボット（ID:Fk9mP3）がスレッド「今日の雑談」で潜伏中である
  And ボットが本日2件の書き込みを行っている
  And レス >>5 はボットの書き込みである
  When ユーザーが "!hissi >>5" を実行する
  Then 独立システムレスでボットの書き込み履歴が表示される
  And ボットの正体は暴露されない

# !kinou — BOT対応
Scenario: ボットの書き込みに !kinou を実行すると昨日のID情報が表示される
  Given 運営ボットが昨日も書き込みを行っている
  And レス >>5 はボットの書き込みである
  When ユーザーが "!kinou >>5" を実行する
  Then 独立システムレスで昨日のID情報が表示される
  And ボットの正体は暴露されない
```

## 4. 変更ファイル一覧

| 分類 | ファイル | 変更内容 |
|---|---|---|
| DB | `supabase/migrations/00029_bot_grass_count.sql` | bots.grass_count追加 + RPC許可リスト拡張 + idx_posts_daily_id |
| Model | `src/lib/domain/models/bot.ts` | `grassCount: number` 追加 |
| Repo | `src/lib/infrastructure/repositories/grass-repository.ts` | `incrementBotGrassCount` 追加 |
| Repo | `src/lib/infrastructure/repositories/post-repository.ts` | `findByDailyId` 追加 |
| Repo | `src/lib/infrastructure/repositories/bot-repository.ts` | rowToBot に grassCount マッピング追加 |
| Handler | `src/lib/services/handlers/grass-handler.ts` | BOT草カウント加算 |
| Handler | `src/lib/services/handlers/hissi-handler.ts` | BOT書き込みに応答 |
| Handler | `src/lib/services/handlers/kinou-handler.ts` | BOT書き込みに応答 |
| Service | `src/lib/services/command-service.ts` | hissi/kinouハンドラへのDI追加 |
| Test | 対応する各テストファイル | BOTパスの単体テスト追加 |
| BDD | `features/reactions.feature` | BOT草カウント表示シナリオ追加 |
| BDD | `features/investigation.feature` | BOT対応シナリオ追加 |

## 5. 設計上の注意点

### 5.1 KinouHandler の BOT authorIdSeed 依存

`!kinou` の BOT対応で、昨日の dailyId を `generateDailyId("bot-{botId}", boardId, yesterdayJst)` で計算する。
この `"bot-{botId}"` という形式は post-service の `resolveAuth` 実装に由来する暗黙知:

```typescript
// post-service.ts > resolveAuth
if (isBotWrite) {
    return { authenticated: true, userId: null, authorIdSeed: ipHash }; // ipHash = "bot-{botId}"
}
```

```typescript
// bot-service.ts > executeBotPost
const result = await this.createPostFn({
    ipHash: `bot-${botId}`,  // ← ここで定義
    ...
});
```

将来 post-service の BOT 認証ロジックが変更された場合、kinou-handler も同時に更新が必要。
定数化（例: `getBotAuthorIdSeed(botId)` ヘルパー関数）で共有するのが望ましい。

## 6. 実装順序

1. **DBマイグレーション** — bots.grass_count + idx_posts_daily_id + RPC拡張
2. **LEAK-1修正** — GrassHandler + GrassRepository（最優先: 無料BOT検出の封じ込め）
3. **PostRepository.findByDailyId** — LEAK-2/3の共通基盤
4. **LEAK-2修正** — HissiHandler
5. **LEAK-3修正** — KinouHandler
6. **テスト** — 各ステップで単体テストを追加
