# !aori コマンド 詳細設計書

> 作成: 2026-03-22 (TASK-269)
> 入力: `features/command_aori.feature` (7 scenarios)
> 前提: ステルス基盤（TASK-265 設計 / Sprint-94 実装済み）

---

## 1. pending_async_commands テーブルスキーマ

### 1.1 設計方針

D-08 command.md SS5「非同期副作用のキューイングパターン」準拠の汎用テーブルとして設計する。`command_type` カラムで種別を区別し、コマンド固有のデータは `payload` (JSONB) に格納する。

**pending_tutorials との分離を維持する理由（D-08 command.md SS5 より）:**
- pending_tutorials は BOT スポーン前の初回書き込み検出キューであり、コマンド起因ではない
- 処理量・処理内容が異なるため、テーブルを分離した方が運用上安全

### 1.2 カラム定義

| カラム | 型 | NOT NULL | デフォルト | 説明 |
|---|---|---|---|---|
| `id` | UUID | YES | `gen_random_uuid()` | PK |
| `command_type` | TEXT | YES | - | コマンド種別（`'aori'`, `'newspaper'` 等） |
| `thread_id` | UUID | YES | - | 対象スレッドID（FK: threads.id） |
| `target_post_number` | INTEGER | YES | - | 対象レス番号（`>>N` の N） |
| `invoker_user_id` | UUID | YES | - | コマンド実行者の user_id（FK: users.id） |
| `payload` | JSONB | NO | `NULL` | コマンド固有データ（!aori は NULL、!newspaper は `{"category": "IT"}` 等） |
| `created_at` | TIMESTAMPTZ | YES | `now()` | キューイング日時 |

**payload カラムの用途:**
- !aori: NULL（追加データ不要）
- !newspaper: `{"category": "IT", "model_id": "gemini-3-flash-preview"}` 等

### 1.3 マイグレーション SQL (`supabase/migrations/00023_pending_async_commands.sql`)

```sql
-- Migration: 00023_pending_async_commands
-- 非同期コマンド副作用のキューイングテーブル。
-- コマンド種別ごとにテーブルを作らず、command_type で区別する汎用設計。
--
-- See: docs/architecture/components/command.md SS5 非同期副作用のキューイングパターン
-- See: features/command_aori.feature
-- See: features/command_newspaper.feature

CREATE TABLE pending_async_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type TEXT NOT NULL,
  thread_id UUID NOT NULL REFERENCES threads(id),
  target_post_number INTEGER NOT NULL,
  invoker_user_id UUID NOT NULL REFERENCES users(id),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_async_commands ENABLE ROW LEVEL SECURITY;

-- service_role（サーバーサイド）のみ全操作を許可する
CREATE POLICY "service_role_all" ON pending_async_commands
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 匿名ユーザーからのアクセスを禁止する
CREATE POLICY "deny_anon" ON pending_async_commands
  FOR ALL TO anon USING (false);

-- 認証済みユーザーからのアクセスを禁止する（サービス層経由のみ許可）
CREATE POLICY "deny_authenticated" ON pending_async_commands
  FOR ALL TO authenticated USING (false);

-- Cron 処理で command_type ごとに古い順から取得するためのインデックス
CREATE INDEX idx_pending_async_commands_type_created
  ON pending_async_commands(command_type, created_at);
```

---

## 2. AoriHandler の実装仕様

### 2.1 概要

AoriHandler は同期フェーズの処理のみを担当する。煽り BOT のスポーン・書き込みは Cron フェーズで実行する。

```
同期フェーズ（PostService 内）:
  CommandService → AoriHandler.execute()
    → pending_async_commands に INSERT
    → success: true を返す（systemMessage: null）

非同期フェーズ（Cron）:
  BotService.processAoriCommands()
    → pending 読取 → BOT スポーン → 煽り文句投稿 → pending 削除
```

### 2.2 ファイル配置

```
src/lib/services/handlers/aori-handler.ts
```

### 2.3 設計: pending INSERT の責務配置

**決定: AoriHandler 内で PendingAsyncCommandRepository を直接呼び出す。**

理由:
- pending INSERT は !aori のコマンドロジックそのもの（副作用のキューイングがコマンドの仕事）
- CommandService は通貨消費とハンドラディスパッチに専念し、pending の存在を知る必要がない
- !newspaper も同じパターンを使うため、各ハンドラが自身の pending INSERT を行う方が拡張しやすい
- 既存の TellHandler が AccusationService を、AttackHandler が BotService を直接呼び出す設計と一貫する

### 2.4 AoriHandler の型とインターフェース

```typescript
/**
 * AoriHandler が使用する PendingAsyncCommandRepository の DI インターフェース。
 */
export interface IAoriPendingRepository {
  create(params: {
    commandType: string;
    threadId: string;
    targetPostNumber: number;
    invokerUserId: string;
    payload?: Record<string, unknown> | null;
  }): Promise<void>;
}

export class AoriHandler implements CommandHandler {
  readonly commandName = "aori";

  constructor(
    private readonly pendingRepository: IAoriPendingRepository,
  ) {}

  async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
    // Step 1: 引数から target_post_number を取得
    const targetArg = ctx.args[0]; // ">>5" 形式
    if (!targetArg) {
      return {
        success: false,
        systemMessage: "対象レスを指定してください（例: !aori >>5）",
      };
    }

    const postNumber = parseInt(targetArg.replace(">>", ""), 10);
    if (isNaN(postNumber) || postNumber <= 0) {
      return {
        success: false,
        systemMessage: "無効なレス番号です",
      };
    }

    // Step 2: pending_async_commands に INSERT
    await this.pendingRepository.create({
      commandType: "aori",
      threadId: ctx.threadId,
      targetPostNumber: postNumber,
      invokerUserId: ctx.userId,
    });

    // Step 3: ステルス成功を返す（systemMessage: null でインライン出力なし）
    return {
      success: true,
      systemMessage: null,
    };
  }
}
```

**設計判断:**
- `systemMessage: null` を返す。ステルスコマンドの成功はユーザーに通知しない（IamsystemHandler と同パターン）
- `postFieldOverrides` は不要。!aori はステルス（本文除去）のみを使用し、表示名・ID の上書きは行わない
- 引数バリデーションはハンドラ内で行う。`targetFormat: ">>postNumber"` だが、パーサーは強制バリデーションを行わない設計（D-08 command.md SS5「ターゲット任意パターン」）

### 2.5 commands.yaml / commands.ts エントリ

```yaml
# config/commands.yaml に追加
  aori:
    description: "煽りBOTを召喚する"
    cost: 10
    targetFormat: ">>postNumber"
    enabled: true
    stealth: true
```

```typescript
// config/commands.ts の commands オブジェクトに追加
aori: {
  description: "煽りBOTを召喚する",
  cost: 10,
  targetFormat: ">>postNumber",
  enabled: true,
  stealth: true,
},
```

### 2.6 CommandService コンストラクタへの登録

```typescript
// command-service.ts コンストラクタ内の handlers 配列に追加
import { AoriHandler } from "./handlers/aori-handler";

// コンストラクタの引数に pendingAsyncCommandRepository を追加（DI）
const handlers: CommandHandler[] = [
  ...(resolvedGrassHandler ? [resolvedGrassHandler] : []),
  new TellHandler(resolvedAccusationService),
  ...(resolvedAttackHandler ? [resolvedAttackHandler] : []),
  new AbeshinzoHandler(),
  ...(resolvedHissiHandler ? [resolvedHissiHandler] : []),
  ...(resolvedKinouHandler ? [resolvedKinouHandler] : []),
  new OmikujiHandler(),
  new IamsystemHandler(),
  new AoriHandler(resolvedPendingAsyncCommandRepository),  // 追加
];
```

CommandService のコンストラクタに `pendingAsyncCommandRepository` の DI パラメータを追加する。AbeshinzoHandler / IamsystemHandler 等と異なり外部依存（Repository）があるため、DI 経由で注入する。パターンは AttackHandler（BotService の DI）と同様。

---

## 3. Cron 処理の統合設計

### 3.1 配置方針

**決定: 既存の `/api/internal/bot/execute` route.ts に Step 5 として追加する。**

理由:
- TDR-013 準拠: !aori は AI API 不使用 → Cloudflare Cron Triggers（5分間隔）で実行
- 現行の Cloudflare Cron は scheduled イベント → `/api/internal/bot/execute` を呼び出す構造
- 新規エンドポイントを作ると Cloudflare Worker の scheduled ハンドラも変更が必要になり、影響範囲が拡大する
- processPendingTutorials と同じ「Step N として既存ルートに追加」パターンを踏襲する

### 3.2 route.ts の変更

```
既存:
  Step 1: Bearer 認証チェック
  Step 2: 投稿対象BOT取得
  Step 3: 各BOTに executeBotPost()
  Step 4: processPendingTutorials()
  Step 5: 結果をJSON返却

変更後:
  Step 1: Bearer 認証チェック
  Step 2: 投稿対象BOT取得
  Step 3: 各BOTに executeBotPost()
  Step 4: processPendingTutorials()
  Step 5: processAoriCommands()          ← 新規追加
  Step 6: 結果をJSON返却                  ← 旧 Step 5
```

Step 5 は Step 4 と同じ個別 try-catch パターン（INCIDENT-CRON500 対応）を使用する。

```typescript
// Step 5: 煽りBOT pending 処理
let aoriResult: Awaited<
  ReturnType<typeof botService.processAoriCommands>
> | null = null;
try {
  aoriResult = await botService.processAoriCommands();
} catch (aoriErr) {
  console.error(
    "[POST /api/internal/bot/execute] processAoriCommands failed:",
    aoriErr,
  );
}

// Step 6: 結果をJSONで返す（aoriResult を含む）
return NextResponse.json({
  totalDue: dueBots.length,
  processed: botsToProcess.length,
  successCount,
  failureCount,
  skippedCount,
  results,
  tutorials: tutorialResult,
  aori: aoriResult,      // 追加
});
```

### 3.3 BotService.processAoriCommands() の設計

BotService に `processAoriCommands()` メソッドを追加する。processPendingTutorials() と同パターン。

#### DI インターフェース追加

```typescript
// bot-service.ts に追加

/**
 * PendingAsyncCommandRepository の依存インターフェース。
 * processAoriCommands で使用する。
 * See: features/command_aori.feature
 */
export interface IPendingAsyncCommandRepository {
  findByCommandType(commandType: string): Promise<PendingAsyncCommand[]>;
  deletePendingAsyncCommand(id: string): Promise<void>;
}
```

#### コンストラクタ拡張

```typescript
constructor(
  // ... 既存パラメータ ...
  private readonly pendingTutorialRepository?: IPendingTutorialRepository,
  private readonly pendingAsyncCommandRepository?: IPendingAsyncCommandRepository,  // 追加
) { ... }
```

#### processAoriCommands() の処理フロー

```typescript
/**
 * pending_async_commands テーブルから command_type='aori' のエントリを処理する。
 *
 * 処理フロー（エントリごと）:
 *   1. 煽り BOT を新規作成（使い切り設定）
 *   2. 煽り文句セットからランダム選択
 *   3. BOT として書き込み（">>{target} {煽り文句}" 形式）
 *   4. pending エントリを削除
 *
 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
 */
async processAoriCommands(): Promise<{
  processed: number;
  results: AoriResult[];
}> {
  if (!this.pendingAsyncCommandRepository) {
    return { processed: 0, results: [] };
  }

  const pendingList = await this.pendingAsyncCommandRepository
    .findByCommandType("aori");

  if (pendingList.length === 0) {
    return { processed: 0, results: [] };
  }

  const results: AoriResult[] = [];

  for (const pending of pendingList) {
    try {
      // Step 1: 煽り BOT 新規作成（使い切り設定）
      const today = this.getTodayJst();
      const newBot = await this.botRepository.create({
        name: "名無しさん",
        persona: "煽り",
        hp: 10,
        maxHp: 10,
        dailyId: this.generateFakeDailyId(),
        dailyIdDate: today,
        isActive: false,    // ★ 使い切り: 定期書き込み対象にしない
        isRevealed: false,
        revealedAt: null,
        botProfileKey: "aori",
        nextPostAt: null,   // ★ 使い切り: 定期スケジュールなし
      });

      // Step 2: 煽り文句をランダム選択
      const taunt = selectRandomTaunt();

      // Step 3: BOT として書き込み
      const body = `>>${pending.targetPostNumber} ${taunt}`;
      const postResult = await this.createPostFn!({
        threadId: pending.threadId,
        body: body,
        edgeToken: null,
        ipHash: "bot-aori",
        displayName: "名無しさん",
        isBotWrite: true,
        botUserId: newBot.id,
      });

      if (postResult && "success" in postResult && postResult.success) {
        // bot_posts 紐付け + total_posts インクリメント
        await this.botPostRepository.create(postResult.postId, newBot.id);
        await this.botRepository.incrementTotalPosts(newBot.id);
      }

      // Step 4: pending 削除
      await this.pendingAsyncCommandRepository
        .deletePendingAsyncCommand(pending.id);

      results.push({
        pendingId: pending.id,
        success: true,
        botId: newBot.id,
        postId: postResult && "success" in postResult && postResult.success
          ? postResult.postId : undefined,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `BotService.processAoriCommands: pending=${pending.id} failed`,
        err,
      );
      results.push({
        pendingId: pending.id,
        success: false,
        error: errorMessage,
      });
    }
  }

  return { processed: pendingList.length, results };
}
```

#### AoriResult 型

```typescript
interface AoriResult {
  pendingId: string;
  success: boolean;
  botId?: string;
  postId?: string;
  error?: string;
}
```

---

## 4. 使い切り BOT のライフサイクル

### 4.1 設計方針

煽り BOT は「1回書き込み、定期書き込みなし、日次リセットで復活しない」使い切り BOT として設計する。

### 4.2 定期書き込みの抑止

**方法: `is_active = false` かつ `next_post_at = null` で作成する。**

- 既存の Cron 処理（`getActiveBotsDueForPost`）は `WHERE is_active = true AND next_post_at <= NOW()` で投稿対象を絞り込む
- `is_active = false` の BOT はこのクエリに一切ヒットしない
- `next_post_at = null` は念のための二重防御（`<= NOW()` 比較で NULL は false を返す）

**注意:** 煽り BOT の書き込みは `processAoriCommands()` 内で `createPostFn` を直接呼び出す。`executeBotPost()` 経由ではない。executeBotPost は `is_active = true` の BOT 向けであり、next_post_at の更新等の定期書き込みのためのロジックを含む。煽り BOT のように1回限りの書き込みには不適切。

### 4.3 日次リセットでの復活除外

**方法: `bot_profile_key = 'aori'` を `bulkReviveEliminated` の除外条件に追加する。**

現行の除外条件は `bot_profile_key = 'tutorial'` のみ。煽り BOT も同じパターンで除外する。

#### bot-repository.ts の変更

```typescript
// 現行:
.or("bot_profile_key.is.null,bot_profile_key.neq.tutorial");

// 変更後:
.or("bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori)");
```

#### InMemory bot-repository.ts の変更

```typescript
// 現行:
if (!bot.isActive && bot.botProfileKey !== "tutorial") {

// 変更後:
const NON_REVIVABLE_PROFILE_KEYS = ["tutorial", "aori"];
if (!bot.isActive && !NON_REVIVABLE_PROFILE_KEYS.includes(bot.botProfileKey ?? "")) {
```

**将来の拡張性:** 使い切り BOT の種類が増えた場合、この除外リストに追加するだけで対応できる。リストが肥大化する場合は `bots` テーブルに `is_disposable` フラグを追加する案が考えられるが、MVP では現行パターンで十分。

### 4.4 bot_profiles.yaml / bot-profiles.ts へのエントリ追加

```yaml
# config/bot_profiles.yaml に追加
aori:
  hp: 10
  max_hp: 10
  reward:
    base_reward: 10
    daily_bonus: 0
    attack_bonus: 0
  fixed_messages: []  # 煽り文句は aori-taunts.ts で管理（BOT プロファイルと分離）
```

```typescript
// config/bot-profiles.ts に追加
aori: {
  hp: 10,
  max_hp: 10,
  reward: {
    base_reward: 10,
    daily_bonus: 0,
    attack_bonus: 0,
  },
  fixed_messages: [],
},
```

**撃破報酬の設計:**
- `base_reward: 10` — feature の `煽りBOTの撃破報酬は 10 である` に一致
- `daily_bonus: 0` / `attack_bonus: 0` — 使い切り BOT のため生存日数・被攻撃ボーナスは無意味。常に固定 10
- 計算式: `base_reward + (survivalDays * daily_bonus) + (timesAttacked * attack_bonus)` = `10 + 0 + 0` = 10

**ファーミング防止の検証:**
- 召喚コスト: -10（!aori）
- 攻撃コスト: -5（!attack）
- 撃破報酬: +10
- 収支: -10 - 5 + 10 = **-5**（自作自演は赤字）

---

## 5. 煽り文句セット

### 5.1 ファイル配置

```
config/aori-taunts.ts
```

BOT プロファイルの `fixed_messages` ではなく専用ファイルに分離する理由:
- 100件という大量の文言を bot-profiles.ts に混在させると可読性が低下する
- 煽り文句はBOTの挙動定義（HP、報酬等）とは性質が異なるデータ
- !omikuji の結果セット（`config/omikuji-fortunes.ts`）と同じ配置パターン

### 5.2 型定義とランダム選択ロジック

```typescript
// config/aori-taunts.ts

/**
 * 煽り文句セット（100件）。
 * !aori コマンドで召喚された煽り BOT が使用する。
 *
 * See: features/command_aori.feature @BOTが煽り文句セット（100件）から1つを選択して投稿する
 */
export const aoriTaunts: readonly string[] = [
  "効いてて草",
  "お前それ本気で言ってんの？w",
  "ROMってた方がいいぞおまえ",
  "誰が読んでると思ってんだこれ",
  // ... 残り96件はコーディングタスクで作成
];

/**
 * 煽り文句をランダムに1つ選択する。
 * BotService.processAoriCommands() から呼び出される。
 *
 * See: features/command_aori.feature @BOTが煽り文句セット（100件）から1つを選択して投稿する
 */
export function selectRandomTaunt(): string {
  const index = Math.floor(Math.random() * aoriTaunts.length);
  return aoriTaunts[index];
}
```

### 5.3 書き込みフォーマット

```
>>{target_post_number} {煽り文句}
```

例: `>>5 効いてて草`

- アンカー（`>>{N}`）と煽り文句の間は半角スペース1つ
- 改行なし（1行テキスト）

---

## 6. PendingAsyncCommandRepository

### 6.1 本番実装 (`src/lib/infrastructure/repositories/pending-async-command-repository.ts`)

pending-tutorial-repository.ts と同パターン。

```typescript
/**
 * PendingAsyncCommandRepository
 * -- pending_async_commands テーブルの CRUD
 *
 * See: features/command_aori.feature
 * See: docs/architecture/components/command.md SS5
 */

// --- 型定義 ---

interface PendingAsyncCommandRow {
  id: string;
  command_type: string;
  thread_id: string;
  target_post_number: number;
  invoker_user_id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface PendingAsyncCommand {
  id: string;
  commandType: string;
  threadId: string;
  targetPostNumber: number;
  invokerUserId: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

// --- 変換ヘルパー ---

function rowToModel(row: PendingAsyncCommandRow): PendingAsyncCommand {
  return {
    id: row.id,
    commandType: row.command_type,
    threadId: row.thread_id,
    targetPostNumber: row.target_post_number,
    invokerUserId: row.invoker_user_id,
    payload: row.payload,
    createdAt: new Date(row.created_at),
  };
}

// --- リポジトリ関数 ---

/** エントリを追加する。AoriHandler から呼び出される。 */
export async function create(params: {
  commandType: string;
  threadId: string;
  targetPostNumber: number;
  invokerUserId: string;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pending_async_commands")
    .insert({
      command_type: params.commandType,
      thread_id: params.threadId,
      target_post_number: params.targetPostNumber,
      invoker_user_id: params.invokerUserId,
      payload: params.payload ?? null,
    });
  if (error) {
    throw new Error(
      `PendingAsyncCommandRepository.create failed: ${error.message}`,
    );
  }
}

/** 指定 command_type のエントリを全件取得する（created_at ASC）。 */
export async function findByCommandType(
  commandType: string,
): Promise<PendingAsyncCommand[]> {
  const { data, error } = await supabaseAdmin
    .from("pending_async_commands")
    .select("*")
    .eq("command_type", commandType)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(
      `PendingAsyncCommandRepository.findByCommandType failed: ${error.message}`,
    );
  }
  return (data as PendingAsyncCommandRow[]).map(rowToModel);
}

/** 指定 ID のエントリを削除する。Cron 処理完了後に呼び出す。 */
export async function deletePendingAsyncCommand(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pending_async_commands")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(
      `PendingAsyncCommandRepository.delete failed: ${error.message}`,
    );
  }
}
```

### 6.2 createBotService ファクトリの拡張

```typescript
// bot-service.ts の createBotService() に追加
const PendingAsyncCommandRepository = require(
  "../infrastructure/repositories/pending-async-command-repository"
);

const pendingAsyncCommandRepository: IPendingAsyncCommandRepository = {
  findByCommandType: (commandType: string) =>
    PendingAsyncCommandRepository.findByCommandType(commandType),
  deletePendingAsyncCommand: (id: string) =>
    PendingAsyncCommandRepository.deletePendingAsyncCommand(id),
};

return new BotService(
  BotRepository,
  BotPostRepository,
  AttackRepository,
  undefined,
  threadRepository,
  createPost,
  undefined,
  pendingTutorialRepository,
  pendingAsyncCommandRepository,  // 追加
);
```

---

## 7. InMemory テスト対応

### 7.1 InMemory PendingAsyncCommandRepository

`features/support/in-memory/pending-async-command-repository.ts` を新規作成する。pending-tutorial-repository.ts と同パターン。

```typescript
/**
 * インメモリ PendingAsyncCommandRepository
 * BDD テスト用の Supabase 非依存実装。
 *
 * See: features/command_aori.feature
 * See: src/lib/infrastructure/repositories/pending-async-command-repository.ts
 */

import type { PendingAsyncCommand } from
  "../../../src/lib/infrastructure/repositories/pending-async-command-repository";

const store: PendingAsyncCommand[] = [];

export function reset(): void {
  store.length = 0;
}

/** テスト用ヘルパー: ストアの全エントリを返す。 */
export function _getAll(): PendingAsyncCommand[] {
  return [...store];
}

export async function create(params: {
  commandType: string;
  threadId: string;
  targetPostNumber: number;
  invokerUserId: string;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  store.push({
    id: crypto.randomUUID(),
    commandType: params.commandType,
    threadId: params.threadId,
    targetPostNumber: params.targetPostNumber,
    invokerUserId: params.invokerUserId,
    payload: params.payload ?? null,
    createdAt: new Date(Date.now()),
  });
}

export async function findByCommandType(
  commandType: string,
): Promise<PendingAsyncCommand[]> {
  return store
    .filter((e) => e.commandType === commandType)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function deletePendingAsyncCommand(id: string): Promise<void> {
  const idx = store.findIndex((e) => e.id === id);
  if (idx !== -1) {
    store.splice(idx, 1);
  }
}
```

### 7.2 BDD ステップでの Cron 処理モック戦略

BDD テストでは Cron 処理（HTTP リクエスト）を実行するのではなく、BotService.processAoriCommands() を直接呼び出す。

**ステップ定義の戦略:**

```gherkin
When BOT召喚の定期処理が実行される
```

このステップで BotService のインスタンスを生成し、processAoriCommands() を直接呼び出す。テスト用の World から InMemory リポジトリを注入する。

```typescript
// features/step_definitions/command_aori.steps.ts（方針）

When("BOT召喚の定期処理が実行される", async function (this: BattleBoardWorld) {
  const botService = new BotService(
    this.inMemoryBotRepository,
    this.inMemoryBotPostRepository,
    this.inMemoryAttackRepository,
    undefined, // botProfilesData
    undefined, // threadRepository
    this.createPostFn, // InMemory PostService の createPost
    undefined, // resolveStrategiesFn
    undefined, // pendingTutorialRepository
    this.inMemoryPendingAsyncCommandRepository, // InMemory 版を注入
  );
  this.aoriResult = await botService.processAoriCommands();
});
```

**煽り文句のランダム性のテスト:**
- `selectRandomTaunt()` が返す値が `aoriTaunts` 配列に含まれることを検証する
- 特定の文句を期待するのではなく、100件セットの中のいずれかであることを検証する

```gherkin
Then BOTが煽り文句セット（100件）から1つを選択して >>5 宛に投稿する
```

このステップでは:
1. 煽り BOT の書き込みが存在すること
2. 書き込み本文が `>>{N} ` で始まること
3. アンカーを除いた残り部分が `aoriTaunts` 配列に含まれること

### 7.3 hooks.ts への reset 追加

```typescript
// features/support/hooks.ts の Before フック内に追加
import { reset as resetPendingAsyncCommands }
  from "./in-memory/pending-async-command-repository";

Before(async function () {
  // ... 既存の reset 呼び出し ...
  resetPendingAsyncCommands();
});
```

---

## 8. 変更ファイル一覧

| ファイル | 変更内容 | 新規/変更 |
|---|---|---|
| `supabase/migrations/00023_pending_async_commands.sql` | テーブル作成 | 新規 |
| `config/commands.yaml` | `aori` エントリ追加 | 変更 |
| `config/commands.ts` | `aori` エントリ追加 | 変更 |
| `config/bot_profiles.yaml` | `aori` プロファイル追加 | 変更 |
| `config/bot-profiles.ts` | `aori` プロファイル追加 | 変更 |
| `config/aori-taunts.ts` | 煽り文句セット（100件） | 新規 |
| `src/lib/services/handlers/aori-handler.ts` | AoriHandler 実装 | 新規 |
| `src/lib/infrastructure/repositories/pending-async-command-repository.ts` | Repository 実装 | 新規 |
| `src/lib/services/bot-service.ts` | (1) `IPendingAsyncCommandRepository` インターフェース追加 (2) コンストラクタに DI パラメータ追加 (3) `processAoriCommands()` メソッド追加 (4) `createBotService()` ファクトリ拡張 | 変更 |
| `src/lib/services/command-service.ts` | (1) AoriHandler の import + handlers 登録 (2) コンストラクタに `pendingAsyncCommandRepository` DI 追加 | 変更 |
| `src/app/api/internal/bot/execute/route.ts` | Step 5 として `processAoriCommands()` 呼び出し追加 | 変更 |
| `src/lib/infrastructure/repositories/bot-repository.ts` | `bulkReviveEliminated` の除外条件に `aori` 追加 | 変更 |
| `features/support/in-memory/pending-async-command-repository.ts` | InMemory 版 | 新規 |
| `features/support/in-memory/bot-repository.ts` | `bulkReviveEliminated` の除外条件に `aori` 追加 | 変更 |
| `features/support/hooks.ts` | InMemory リセットに `resetPendingAsyncCommands` 追加 | 変更 |
| `features/step_definitions/command_aori.steps.ts` | BDD ステップ定義 | 新規 |
| `e2e/flows/basic-flow.spec.ts` | !aori のベーシックフローテスト追加 | 変更 |

---

## 9. BDD シナリオとの対応表

| シナリオ | 対応する設計箇所 |
|---|---|
| コマンド文字列と引数が投稿本文から除去される | SS2.5 `stealth: true` + 既存ステルス基盤（Step 5.5） |
| 通貨不足でステルスコマンドが失敗すると本文にコマンド文字列が残る | CommandService の通貨チェック → `success: false` → Step 5.5 スキップ |
| Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する | SS3.3 `processAoriCommands()` → BOT create → createPostFn |
| 煽りBOTを !attack で撃破すると報酬を得る | SS4.4 `bot_profiles.aori.reward.base_reward = 10` |
| 自分で召喚したBOTを自分で撃破してもファーミングできない | SS4.4 収支検証: -10 -5 +10 = -5 |
| 煽りBOTは1回だけ書き込み、定期書き込みを行わない | SS4.2 `is_active = false`, `next_post_at = null` |
| 煽りBOTは日次リセットで復活しない | SS4.3 `bulkReviveEliminated` の `aori` 除外 |
