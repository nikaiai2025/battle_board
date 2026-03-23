# !livingbot コマンド + ラストボットボーナス 設計書

> TASK-277 成果物 / 2026-03-23
> v2 追記: スレッド内カウント拡張 / 2026-03-23
> 対象BDD: `features/command_livingbot.feature` v2（16シナリオ）

---

## 1. 生存BOTカウントロジック

### 1.1 カウントルール（feature準拠）

生存BOTの定義（和集合）:

| 区分 | 条件 | 例 |
|---|---|---|
| A. 定期活動BOT | `is_active=true` AND `bot_profile_key NOT IN ('tutorial','aori')` | 荒らし役 |
| B. スレッド固定BOT | `is_active=true` AND `bot_profile_key IN ('tutorial','aori')` AND 紐づくスレッドが `is_dormant=false` | チュートリアルBOT、煽りBOT |

定期活動BOT（区分A）は特定スレッドに固定されず、アクティブスレッド群にランダムで投稿するため、常時カウント対象。
スレッド固定BOT（区分B）はスポーン先のスレッドが休眠すると「生存しているが到達不能」となるため、カウント対象外。

### 1.2 スレッド固定BOTプロファイルキーの定数化

```typescript
// src/lib/domain/rules/living-bot.ts
const THREAD_FIXED_PROFILE_KEYS = ["tutorial", "aori"] as const;
```

将来プロファイル追加時はこのリストを拡張する。feature ファイルのコメントと一致させる。

### 1.3 SQLクエリ設計（本番 BotRepository）

スレッド固定BOTの「書き込み先スレッド」は `bot_posts -> posts -> threads` の JOIN で特定する。
ただしスレッド固定BOTは少数（数体〜十数体）であるため、パフォーマンスは問題にならない。

新メソッド: `BotRepository.countLivingBots(): Promise<number>`

```sql
-- 区分A: 定期活動BOT（is_active=true, 非スレッド固定）
SELECT COUNT(*) FROM bots
WHERE is_active = true
  AND (bot_profile_key IS NULL OR bot_profile_key NOT IN ('tutorial', 'aori'));

-- 区分B: スレッド固定BOT（is_active=true, スレッドがアクティブ）
SELECT COUNT(DISTINCT b.id) FROM bots b
  JOIN bot_posts bp ON bp.bot_id = b.id
  JOIN posts p ON p.id = bp.post_id
  JOIN threads t ON t.id = p.thread_id
WHERE b.is_active = true
  AND b.bot_profile_key IN ('tutorial', 'aori')
  AND t.is_dormant = false;
```

実装上は2クエリの和を返す。RPC関数化は不要（呼び出し頻度が低い）。

代替案としてアプリケーション層で合算する方法もあるが、区分Bの判定にJOINが必要なためSQLで完結させる方が効率的。

### 1.4 IBotRepository インターフェース拡張

```typescript
// bot-service.ts の IBotRepository に追加
export interface IBotRepository {
  // ... 既存メソッド
  countLivingBots(): Promise<number>;
}
```

### 1.5 InMemory実装（BDDテスト用）

InMemory版はストアとスレッドストアを参照して同等のカウントを実装する。
スレッド固定BOTのスレッド紐づけは `InMemoryBotPostRepo` + `InMemoryPostRepo` + `InMemoryThreadRepo` を経由する。

2つの動作モードを持つ:
- **デフォルト**: ストアから `isActive === true` のBOTを全件カウントする（スレッド休眠の区別は省略）。ラストボットボーナスのシナリオでは、撃破処理によりストアの `isActive` が `false` に変わるため、自然にcount=0が達成される。
- **オーバーライド**: `_setLivingBotCount(n)` で静的値を設定。!livingbot コマンドの休眠スレッド除外テスト等、InMemoryストアだけでは表現しにくいシナリオで使用する。

```typescript
// features/support/in-memory/bot-repository.ts に追加
let _livingBotCountOverride: number | null = null;

export function _setLivingBotCount(count: number): void {
  _livingBotCountOverride = count;
}

export function _clearLivingBotCountOverride(): void {
  _livingBotCountOverride = null;
}

export async function countLivingBots(): Promise<number> {
  if (_livingBotCountOverride !== null) {
    return _livingBotCountOverride;
  }
  // デフォルト: 全アクティブBOTをカウント（スレッド休眠の区別は省略）
  return store.filter(b => b.isActive).length;
}
```

reset() で `_livingBotCountOverride = null` にクリアする。

設計判断: 本番の `countLivingBots` は `bot_posts -> posts -> threads` の3テーブルJOINが必要。InMemoryで同等ロジックを完全に再現するとステップ定義が複雑化する。BDDテストの目的は「ハンドラが正しいカウントをフォーマットして返すこと」と「ラストボットボーナスの発火条件の検証」であり、SQLクエリの正確性は単体テスト（`bot-repository.test.ts`）で保証する。

---

## 2. !livingbot ハンドラ設計

### 2.1 ファイル配置

`src/lib/services/handlers/livingbot-handler.ts`

### 2.2 依存インターフェース（DI）

```typescript
export interface ILivingBotBotRepository {
  countLivingBots(): Promise<number>;
}
```

単一依存。CurrencyService への依存は不要（コスト消費は CommandService が行う）。

### 2.3 クラス設計

```typescript
export class LivingBotHandler implements CommandHandler {
  readonly commandName = "livingbot";

  constructor(
    private readonly botRepository: ILivingBotBotRepository,
  ) {}

  async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
    const count = await this.botRepository.countLivingBots();
    return {
      success: true,
      systemMessage: `🤖 掲示板全体の生存BOT: ${count}体`,
    };
  }
}
```

引数なし、結果はインライン表示（`systemMessage`）。
コスト消費は CommandService の共通処理で行われるため、ハンドラ内での debit は不要。

### 2.4 commands.yaml 追加

```yaml
  livingbot:
    description: "掲示板全体の生存BOT数を表示する"
    cost: 5
    targetFormat: null
    enabled: true
    stealth: false
```

### 2.5 CommandService への登録

`command-service.ts` のハンドラ登録部分に `LivingBotHandler` を追加する。
既存パターン（`AttackHandler`, `OmikujiHandler` 等）と同様に DI で注入する。

---

## 3. ラストボットボーナス設計

### 3.1 発火条件

1. `!attack` によりBOTが撃破される（`DamageResult.eliminated === true`）
2. 撃破後の `countLivingBots() === 0`
3. 当日のラストボットボーナスが未発生（1日1回制限）

### 3.2 1日1回制限の状態管理

**採用案: `daily_events` テーブル新設**

```sql
CREATE TABLE daily_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,        -- 'last_bot_bonus'
  event_date DATE NOT NULL,        -- JST日付（YYYY-MM-DD）
  triggered_by UUID NOT NULL,      -- 発火者のuser_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 当日の重複チェック用ユニーク制約
CREATE UNIQUE INDEX idx_daily_events_type_date
  ON daily_events (event_type, event_date);
```

理由:
- 汎用性: 将来「1日1回」の制約を持つイベントが増えた場合にそのまま拡張できる
- 既存テーブルを汚さない: botsやusersに無関係なフラグを追加しなくて済む
- 日次リセット不要: `event_date` で自然にフィルタリングされる。DELETE/UPDATE の日次バッチ処理が不要

不採用案:
- 案B（既存テーブルにフラグ追加）: どのテーブルに追加するかが不自然。ボード単位のグローバルイベントは専用テーブルが適切
- 案C（KVS/Cache）: Supabase環境ではRedis等がない。永続化が保証されない

### 3.3 DailyEventRepository

新規ファイル: `src/lib/infrastructure/repositories/daily-event-repository.ts`

```typescript
export interface DailyEvent {
  id: string;
  eventType: string;
  eventDate: string;       // YYYY-MM-DD
  triggeredBy: string;
  createdAt: Date;
}

export async function existsForToday(eventType: string, dateJst: string): Promise<boolean>;
export async function create(eventType: string, dateJst: string, triggeredBy: string): Promise<DailyEvent>;
```

InMemory版: `features/support/in-memory/daily-event-repository.ts`

### 3.4 IDailyEventRepository（BotService DI用）

```typescript
// bot-service.ts に追加
export interface IDailyEventRepository {
  existsForToday(eventType: string, dateJst: string): Promise<boolean>;
  create(eventType: string, dateJst: string, triggeredBy: string): Promise<{ id: string }>;
}
```

BotService コンストラクタにオプショナル引数として追加する（既存パターンと同様）:

```typescript
constructor(
  // ... 既存引数
  private readonly dailyEventRepository?: IDailyEventRepository,
) {}
```

### 3.5 BotService.checkLastBotBonus

BotService にラストボットボーナス判定メソッドを追加する。

```typescript
// BotService に追加
async checkLastBotBonus(attackerId: string): Promise<{ triggered: boolean }> {
  const livingCount = await this.botRepository.countLivingBots();
  if (livingCount > 0) return { triggered: false };

  const today = this.getTodayJst();
  const alreadyTriggered = await this.dailyEventRepository.existsForToday('last_bot_bonus', today);
  if (alreadyTriggered) return { triggered: false };

  await this.dailyEventRepository.create('last_bot_bonus', today, attackerId);
  return { triggered: true };
}
```

### 3.5 AttackHandler への統合

撃破成功時（`damageResult.eliminated === true`）の直後にラストボットボーナス判定を挿入する。

```
// attack-handler.ts executeFlowB 内、B8の撃破報酬付与ブロック内に追加

if (damageResult.eliminated && damageResult.reward !== null) {
  // 既存: 撃破報酬付与
  await this.currencyService.credit(ctx.userId, damageResult.reward, "bot_elimination");

  // 新規: ラストボットボーナス判定
  const lastBotCheck = await this.botService.checkLastBotBonus(ctx.userId);
  if (lastBotCheck.triggered) {
    // +100 ボーナス付与
    await this.currencyService.credit(ctx.userId, 100, "last_bot_bonus");
    // 祝福メッセージ（独立レス）
    lastBotBonusNotice = [
      "🎉 本日のBOTが全滅しました！",
      `最終撃破者：名無しさん(ID:${ctx.dailyId}) にラストボットボーナス +100`,
    ].join("\n");
  }

  // eliminationNotice に lastBotBonusNotice を連結 or 別の独立レスとして返す
}
```

### 3.6 CommandHandlerResult の拡張

ラストボットボーナスの祝福メッセージは `eliminationNotice` とは別の独立レスとして投稿する。
`CommandHandlerResult` に新フィールドを追加する。

```typescript
export interface CommandHandlerResult {
  // ... 既存フィールド
  /** ラストボットボーナス祝福メッセージ（★システム名義の独立レス） */
  lastBotBonusNotice?: string | null;
}
```

PostService 側で `lastBotBonusNotice` が存在する場合に独立レスを投稿する。
既存の `eliminationNotice` と同じパターン。

### 3.7 CreditReason への追加

```typescript
export type CreditReason =
  // ... 既存
  | "last_bot_bonus";   // ラストボットボーナス
```

### 3.8 IAttackBotService インターフェース拡張

```typescript
export interface IAttackBotService {
  // ... 既存メソッド
  checkLastBotBonus(attackerId: string): Promise<{ triggered: boolean }>;
}
```

### 3.9 日次リセットとの関係

`daily_events` テーブルは `event_date` カラムでフィルタするため、日次リセットでのレコード削除は不要。
古いレコードの蓄積が気になる場合は、日次メンテナンスで7日以上前のレコードを削除する処理を追加できるが、MVP では不要。

---

## 4. BDDステップ定義設計

### 4.1 ファイル配置

`features/step_definitions/command_livingbot.steps.ts`

### 4.2 ステップ一覧

| # | ステップテキスト | 種別 | 実装概要 |
|---|---|---|---|
| 1 | `コマンドレジストリに以下のコマンドが登録されている` | Given | 既存ステップ（common.steps.ts）を再利用 |
| 2 | `定期活動BOTが{int}体活動中である` | Given | InMemoryBotRepo に荒らし役BOTを N体挿入 |
| 3 | `スレッド固定BOTはアクティブスレッドに{int}体いる` | Given | InMemoryBotRepo にチュートリアルBOTを挿入 + _setLivingBotCount で合算設定 |
| 4 | `アクティブスレッドにチュートリアルBOTが{int}体いる` | Given | 同上 |
| 5 | `チュートリアルBOTが{int}体いるが、いずれも休眠スレッドにいる` | Given | InMemoryBotRepo に挿入 + _setLivingBotCount（休眠分は加算しない） |
| 6 | `チュートリアルBOTが{int}体、休眠中のスレッドにいる` | Given | 同上 |
| 7 | `定期活動BOTが{int}体中{int}体撃破済みである` | Given | N体挿入、M体は is_active=false |
| 8 | `全てのBOTが撃破済みである` | Given | _setLivingBotCount(0) |
| 9 | `ユーザーが "{string}" を含む書き込みを投稿する` | When | 既存ステップ（posting.steps.ts/command_system.steps.ts）を再利用 |
| 10 | `レス末尾に "{string}" がマージ表示される` | Then | lastResult の systemMessage を検証 |
| 11 | `スレッドAから "{string}" を実行する` / `スレッドBから...` | When | スレッドを切り替えてコマンド実行 |
| 12 | `両方のレスに同じ生存BOT数が表示される` | Then | 2つの結果を比較 |
| 13 | `そのスレッドに書き込みがありスレッドが復活する` | When | InMemoryThreadRepo.wakeThread |
| 14 | `通貨が {int} 消費される` / `通貨残高が {int} になる` | Then | 既存ステップ再利用 |
| 15 | `コマンドは実行されない` / `エラー "{string}" がマージ表示される` | Then | 既存ステップ再利用 |
| 16 | `掲示板全体の生存BOTが残り{int}体である` | Given | _setLivingBotCount(N) + BOT/ポスト/スレッドのセットアップ |
| 17 | `レス >>{int} はその最後のBOTの書き込みである` | Given | 既存ステップ再利用 |
| 18 | `BOTが撃破される` | Then | DamageResult.eliminated === true を検証 |
| 19 | `通常の撃破報酬に加えてラストボットボーナス +100 が付与される` | Then | 通貨残高を検証 |
| 20 | `「★システム」名義の独立レスで祝福メッセージが表示される` | Then | lastResult の lastBotBonusNotice を検証 |
| 21 | `本日すでにラストボットボーナスが1回付与されている` | Given | InMemoryDailyEventRepo に当日レコード挿入 |
| 22 | `その後スレッド復活によりスレッド固定BOTが{int}体カウントに復帰した` | Given | _setLivingBotCount 更新 |
| 23 | `昨日ラストボットボーナスが付与されている` | Given | InMemoryDailyEventRepo に昨日日付で挿入 |
| 24 | `日次リセットでBOTが全て復活している` | Given | bulkReviveEliminated 実行 |
| 25 | `ラストボットボーナスは付与されない` / `祝福メッセージも表示されない` | Then | lastBotBonusNotice が null/undefined を検証 |

### 4.3 InMemory拡張サマリ

| ファイル | 追加内容 |
|---|---|
| `in-memory/bot-repository.ts` | `countLivingBots()`, `_setLivingBotCount()`, `reset()` でオーバーライド変数クリア |
| `in-memory/daily-event-repository.ts` | 新規作成: `existsForToday()`, `create()`, `reset()`, `_insert()` |
| `features/support/world.ts` | `livingBotResults: string[]` 等の結果保持フィールド追加（複数スレッド比較用） |

### 4.4 既存ステップとの再利用方針

以下のステップは既存実装を再利用する（新規定義不要）:
- コマンドレジストリ登録（`common.steps.ts`）
- 通貨残高設定・検証（`currency.steps.ts`）
- コマンド実行・コスト消費（`command_system.steps.ts`）
- レス存在設定（`bot_system.steps.ts`）

---

## 5. 実装タスク分解（TASK-278用）

### 5.1 実装手順

| # | 作業 | 対象ファイル |
|---|---|---|
| 1 | `daily_events` テーブル マイグレーション | `supabase/migrations/00024_daily_events.sql` |
| 2 | `CreditReason` に `last_bot_bonus` 追加 | `src/lib/domain/models/currency.ts` |
| 3 | `DailyEventRepository` 新規作成 | `src/lib/infrastructure/repositories/daily-event-repository.ts` |
| 4 | `BotRepository.countLivingBots()` 追加 | `src/lib/infrastructure/repositories/bot-repository.ts` |
| 5 | `IBotRepository` に `countLivingBots` 追加 | `src/lib/services/bot-service.ts`（インターフェース部分） |
| 6 | `BotService.checkLastBotBonus()` 追加 | `src/lib/services/bot-service.ts` |
| 7 | `LivingBotHandler` 新規作成 | `src/lib/services/handlers/livingbot-handler.ts` |
| 8 | `commands.yaml` に livingbot 追加 | `config/commands.yaml` |
| 9 | `CommandService` にハンドラ登録 | `src/lib/services/command-service.ts` |
| 10 | `CommandHandlerResult` に `lastBotBonusNotice` 追加 | `src/lib/services/command-service.ts` |
| 11 | `IAttackBotService` に `checkLastBotBonus` 追加 | `src/lib/services/handlers/attack-handler.ts` |
| 12 | `AttackHandler.executeFlowB` にラストボットボーナス判定追加 | `src/lib/services/handlers/attack-handler.ts` |
| 13 | PostService に `lastBotBonusNotice` 処理追加 | `src/lib/services/post-service.ts` |
| 14 | InMemory `daily-event-repository.ts` 新規作成 | `features/support/in-memory/daily-event-repository.ts` |
| 15 | InMemory `bot-repository.ts` に `countLivingBots` 追加 | `features/support/in-memory/bot-repository.ts` |
| 16 | `world.ts` にラストボットボーナス用フィールド追加 | `features/support/world.ts` |
| 17 | ステップ定義 `command_livingbot.steps.ts` 新規作成 | `features/step_definitions/command_livingbot.steps.ts` |
| 18 | ベーシックフローテスト追加 | `e2e/flows/basic-flow.spec.ts` |
| 19 | 単体テスト（BotRepository.countLivingBots） | `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` |
| 20 | 単体テスト（LivingBotHandler） | `src/__tests__/lib/services/handlers/livingbot-handler.test.ts` |

### 5.2 locked_files（TASK-278）

```yaml
locked_files:
  - src/lib/services/handlers/livingbot-handler.ts          # 新規
  - src/lib/infrastructure/repositories/daily-event-repository.ts  # 新規
  - src/lib/infrastructure/repositories/bot-repository.ts    # countLivingBots追加
  - src/lib/services/bot-service.ts                          # IBotRepository拡張 + checkLastBotBonus
  - src/lib/services/handlers/attack-handler.ts              # ラストボットボーナス統合
  - src/lib/services/command-service.ts                      # ハンドラ登録 + CommandHandlerResult拡張
  - src/lib/services/post-service.ts                         # lastBotBonusNotice 処理
  - src/lib/domain/models/currency.ts                        # CreditReason追加
  - config/commands.yaml                                     # livingbot追加
  - supabase/migrations/00024_daily_events.sql               # 新規
  - features/step_definitions/command_livingbot.steps.ts     # 新規
  - features/support/in-memory/bot-repository.ts             # countLivingBots追加
  - features/support/in-memory/daily-event-repository.ts     # 新規
  - features/support/world.ts                                # フィールド追加
  - e2e/flows/basic-flow.spec.ts                             # ベーシックフロー追加
```

### 5.3 依存順序

```
[1] マイグレーション → [2,3] 型/リポジトリ → [4,5] BotRepo/インターフェース
  → [6] BotService.checkLastBotBonus → [7] LivingBotHandler
  → [8,9] commands.yaml/CommandService登録
  → [10,11,12] AttackHandler統合
  → [13] PostService lastBotBonusNotice
  → [14,15,16] InMemory実装
  → [17] ステップ定義 → [18,19,20] テスト
```

---

## 6. スレッド内カウント拡張設計（v2追記）

> feature v2 で追加された「スレッド内の生存BOT数」表示の設計。
> 既存の掲示板全体カウント（§1〜§5）は変更なし。

### 6.1 出力フォーマット変更

```
v1: 🤖 掲示板全体の生存BOT: {boardCount}体
v2: 🤖 生存BOT — 掲示板全体: {boardCount}体 / このスレッド: {threadCount}体
```

### 6.2 スレッド内カウントの定義

当該スレッドに1件以上の書き込み（`bot_posts` 経由）を持ち、
かつ `is_active=true` のBOTの数（`DISTINCT bot_id`）。

掲示板全体カウントとの違い:

| 観点 | 掲示板全体 | スレッド内 |
|---|---|---|
| 範囲 | 全アクティブスレッド | コマンド実行スレッドのみ |
| 定期活動BOT | 常にカウント | 当該スレッドに書き込みがある場合のみ |
| スレッド固定BOT | スレッド休眠時は除外 | 当該スレッドのBOTなら書き込み有無でカウント |
| 撃破済みBOT | 除外 | 除外 |

### 6.3 SQLクエリ設計（本番 BotRepository）

新メソッド: `BotRepository.countLivingBotsInThread(threadId: string): Promise<number>`

```sql
SELECT COUNT(DISTINCT bp.bot_id)
FROM bot_posts bp
  JOIN posts p ON p.id = bp.post_id
  JOIN bots b ON b.id = bp.bot_id
WHERE p.thread_id = :threadId
  AND b.is_active = true;
```

Supabase SDK 実装:

```typescript
export async function countLivingBotsInThread(threadId: string): Promise<number> {
  // Step 1: 当該スレッドの bot_posts を取得（posts 経由）
  const { data: posts, error: postsError } = await supabaseAdmin
    .from("posts")
    .select("id")
    .eq("thread_id", threadId);

  if (postsError) {
    throw new Error(
      `BotRepository.countLivingBotsInThread (posts) failed: ${postsError.message}`
    );
  }

  const postIds = (posts ?? []).map((p: { id: string }) => p.id);
  if (postIds.length === 0) return 0;

  // Step 2: bot_posts から該当 post_id の bot_id を取得
  const { data: botPosts, error: bpError } = await supabaseAdmin
    .from("bot_posts")
    .select("bot_id")
    .in("post_id", postIds);

  if (bpError) {
    throw new Error(
      `BotRepository.countLivingBotsInThread (bot_posts) failed: ${bpError.message}`
    );
  }

  const uniqueBotIds = [...new Set((botPosts ?? []).map((bp: { bot_id: string }) => bp.bot_id))];
  if (uniqueBotIds.length === 0) return 0;

  // Step 3: is_active=true のBOTをカウント
  const { count, error: countError } = await supabaseAdmin
    .from("bots")
    .select("*", { count: "exact", head: true })
    .in("id", uniqueBotIds)
    .eq("is_active", true);

  if (countError) {
    throw new Error(
      `BotRepository.countLivingBotsInThread (bots) failed: ${countError.message}`
    );
  }

  return count ?? 0;
}
```

パフォーマンス考慮: スレッド内のBOT書き込みは通常少数（0〜10件程度）のため、
3クエリでも問題ない。将来大量のBOT書き込みが発生する場合は RPC 関数化を検討する。

### 6.4 ILivingBotBotRepository 拡張

```typescript
// livingbot-handler.ts
export interface ILivingBotBotRepository {
  countLivingBots(): Promise<number>;
  countLivingBotsInThread(threadId: string): Promise<number>;  // v2追加
}
```

### 6.5 LivingBotHandler 変更

```typescript
export class LivingBotHandler implements CommandHandler {
  readonly commandName = "livingbot";

  constructor(private readonly botRepository: ILivingBotBotRepository) {}

  async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
    const boardCount = await this.botRepository.countLivingBots();
    const threadCount = await this.botRepository.countLivingBotsInThread(ctx.threadId);
    return {
      success: true,
      systemMessage: `🤖 生存BOT — 掲示板全体: ${boardCount}体 / このスレッド: ${threadCount}体`,
    };
  }
}
```

変更点:
- `ctx.threadId` を使用（`CommandContext` に既存のフィールド）
- 2つのリポジトリメソッドを呼び出し、結合した文字列を返す

### 6.6 InMemory 実装（BDDテスト用）

掲示板全体カウントの `_livingBotCountOverride` と同パターンで、
スレッド内カウント用のオーバーライドを追加する。

```typescript
// features/support/in-memory/bot-repository.ts に追加

let _livingBotInThreadCountOverride: number | null = null;

export function _setLivingBotInThreadCount(count: number): void {
  _livingBotInThreadCountOverride = count;
}

export function _clearLivingBotInThreadCountOverride(): void {
  _livingBotInThreadCountOverride = null;
}

export async function countLivingBotsInThread(threadId: string): Promise<number> {
  if (_livingBotInThreadCountOverride !== null) {
    return _livingBotInThreadCountOverride;
  }
  // デフォルト: 0（InMemoryではbot_posts→postsのJOINを省略）
  return 0;
}
```

`reset()` で `_livingBotInThreadCountOverride = null` にクリアする。

設計判断: 本番の `countLivingBotsInThread` は `bot_posts → posts → bots` の
3テーブルJOINが必要。InMemory版で完全再現すると `InMemoryBotPostRepo` +
`InMemoryPostRepo` への依存が発生し、モジュール結合が強まる。
BDDテストの目的は「ハンドラが正しいカウントをフォーマットして返すこと」であり、
JOINの正確性は単体テスト（`bot-repository.test.ts`）で保証する。

### 6.7 BDDステップ定義の追加・変更

| # | ステップテキスト | 種別 | 実装概要 |
|---|---|---|---|
| 26 | `当該スレッドに{int}体の生存BOTが書き込んでいる` | Given | `_setLivingBotInThreadCount(N)` |
| 27 | `当該スレッドにはBOTの書き込みがない` | Given | `_setLivingBotInThreadCount(0)` |
| 28 | `当該スレッドに{int}体のBOTが書き込んでいる` | Given | `_setLivingBotInThreadCount(N)` + World に仮カウント保持 |
| 29 | `そのうち{int}体は撃破済みである` | Given | World の仮カウントから撃破分を引いて `_setLivingBotInThreadCount` 更新 |
| 12' | `両方のレスに同じ掲示板全体の生存BOT数が表示される` | Then | `livingBotResults` から「掲示板全体: N体」部分を抽出して比較 |

既存ステップ #12「両方のレスに同じ生存BOT数が表示される」は
ステップテキストを v2 用に更新する。実装は `livingBotResults` の
掲示板全体部分のみを比較するよう変更する。

### 6.8 実装タスク追加分

§5.1 に以下を追加:

| # | 作業 | 対象ファイル |
|---|---|---|
| 21 | `BotRepository.countLivingBotsInThread()` 追加 | `src/lib/infrastructure/repositories/bot-repository.ts` |
| 22 | `ILivingBotBotRepository` に `countLivingBotsInThread` 追加 | `src/lib/services/handlers/livingbot-handler.ts` |
| 23 | `LivingBotHandler.execute()` を v2 フォーマットに変更 | `src/lib/services/handlers/livingbot-handler.ts` |
| 24 | InMemory `bot-repository.ts` に `countLivingBotsInThread` 追加 | `features/support/in-memory/bot-repository.ts` |
| 25 | ステップ定義にスレッド内カウント用ステップ追加 | `features/step_definitions/command_livingbot.steps.ts` |
| 26 | 単体テスト（BotRepository.countLivingBotsInThread） | `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` |
| 27 | 単体テスト（LivingBotHandler v2フォーマット） | `src/__tests__/lib/services/handlers/livingbot-handler.test.ts` |

### 6.9 locked_files 追加分

§5.2 の既存リストに変更なし（同一ファイルへの追加変更のため）。
