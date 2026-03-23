# !newspaper コマンド 詳細設計書

> 作成: 2026-03-22 (TASK-271)
> 入力: `features/command_newspaper.feature` (5 scenarios)
> 前提: 非同期キュー基盤（TASK-269 設計 / TASK-270 実装済み）

---

## 1. AI API クライアント設計

### 1.1 ファイル配置

```
src/lib/infrastructure/adapters/google-ai-adapter.ts
```

TDR-015 準拠。`adapters/` に配置し、将来のマルチプロバイダ対応時にアダプター追加で拡張する。

### 1.2 パッケージ依存

```
npm install @google/genai
```

`@google/genai` は Google 公式の Gemini API クライアント。Google Search Grounding がビルトインツールとして利用でき、検索 + 生成を 1 API call で完結する。

### 1.3 公開インターフェース

```typescript
// src/lib/infrastructure/adapters/google-ai-adapter.ts

/**
 * Gemini API の呼び出し結果。
 */
export interface GoogleAiResult {
  text: string;              // 生成されたテキスト
  searchQueries: string[];   // 実行された検索クエリ（デバッグ・ログ用）
}

/**
 * Google AI Adapter の DI インターフェース。
 * BDD テストではモック実装に差し替える。
 */
export interface IGoogleAiAdapter {
  generateWithSearch(params: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
  }): Promise<GoogleAiResult>;
}

/**
 * Gemini API + Google Search Grounding を使用する本番実装。
 */
export class GoogleAiAdapter implements IGoogleAiAdapter {
  constructor(private readonly apiKey: string) {}

  async generateWithSearch(params: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
  }): Promise<GoogleAiResult> {
    // 実装は §1.4 参照
  }
}
```

### 1.4 API 呼び出し実装

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: this.apiKey });

const response = await ai.models.generateContent({
  model: params.modelId,  // "gemini-3-flash-preview"
  contents: params.userPrompt,
  config: {
    systemInstruction: params.systemPrompt,
    tools: [{ googleSearch: {} }],
  },
});

return {
  text: response.text ?? "",
  searchQueries:
    response.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [],
};
```

**設計判断:**
- `GoogleGenAI` の初期化は `GoogleAiAdapter` コンストラクタで行い、API Key を注入する
- `systemInstruction` に新聞配達員の人格プロンプトを、`contents` にカテゴリ指示を渡す
- `tools: [{ googleSearch: {} }]` で Google Search Grounding を有効化。Gemini が自動的に検索クエリを生成・実行する
- `groundingMetadata.webSearchQueries` はデバッグ・監視用にログ出力する（レスポンスには含めない）

### 1.5 システムプロンプト設計

```typescript
// config/newspaper-prompt.ts

export const NEWSPAPER_SYSTEM_PROMPT = `あなたは「新聞配達員」です。
匿名掲示板に最新ニュースを届けるのが仕事です。

ルール:
- 指定されたカテゴリから最新のニュース1件を選んで紹介してください
- 掲示板の書き込みらしいカジュアルな文体で書いてください
- 以下のフォーマットで出力してください:

【<カテゴリ名>ニュース速報】
<ニュースの要約（3〜5行）>

ソース: <ニュースの出典元>

- 200文字以内に収めてください
- ニュースが見つからない場合は「今日は<カテゴリ名>の目立ったニュースはないぜ」と返してください`;
```

**ファイル配置: `config/newspaper-prompt.ts`**

プロンプトを `config/` に分離する理由:
- ハンドラやアダプターのコードからプロンプト文面を分離し、調整を容易にする
- `commands.yaml` と同じ方針（設定とロジックの分離）

### 1.6 リトライ戦略

| パラメータ | 値 | 根拠 |
|---|---|---|
| 最大試行回数 | 3 | API の一時的な障害（429 / 503）に対応。3回で十分な信頼性 |
| バックオフ | 指数バックオフ（1s, 2s, 4s） | Google API の推奨パターン。合計待ち時間 7 秒以内 |
| リトライ対象 | HTTP 429, 500, 503 およびネットワークエラー | 400（不正リクエスト）や 403（認証エラー）はリトライ不可 |

```typescript
// google-ai-adapter.ts 内に実装

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

async generateWithSearch(params): Promise<GoogleAiResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await this._callGeminiApi(params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!this._isRetryable(err) || attempt === MAX_RETRIES - 1) {
        throw lastError;
      }
      await this._sleep(INITIAL_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw lastError!; // TypeScript 用（到達しない）
}
```

リトライロジックはアダプター内に閉じる。呼び出し側（processNewspaperCommands）はリトライ済みの最終結果のみを受け取り、全試行失敗時にエラーハンドリング（通貨返却）を行う。

---

## 2. NewspaperHandler の実装仕様

### 2.1 概要

NewspaperHandler は同期フェーズの処理のみを担当する。AI API 呼び出し・結果投稿は Cron フェーズで実行する。AoriHandler と同パターンだが、ステルスではない点が異なる。

```
同期フェーズ（PostService 内）:
  CommandService -> NewspaperHandler.execute()
    -> カテゴリをランダム選択
    -> pending_async_commands に INSERT（payload に category と model_id）
    -> success: true, systemMessage: null を返す

非同期フェーズ（Cron / GitHub Actions）:
  processNewspaperCommands()
    -> pending 読取 -> AI API 呼出 -> ★システムレス投稿 -> pending 削除
    -> 全失敗時: 通貨返却 + ★システムエラー通知
```

### 2.2 ファイル配置

```
src/lib/services/handlers/newspaper-handler.ts
```

### 2.3 カテゴリランダム選択のタイミング

**決定: ハンドラ内（pending INSERT 時）で選択する。**

理由:
- BDD シナリオ「ニュースのカテゴリが実行のたびにランダムに選ばれる」の「実行のたび」は、ユーザーがコマンドを実行した時点を指す
- payload に category を保存することで、Cron 処理はどのカテゴリを要求されたかを確実に知れる
- テスト時に乱数シードまたは DI で決定論的にできる（ランダム選択関数を注入可能にする）

### 2.4 カテゴリセット

```typescript
// config/newspaper-categories.ts

export const NEWSPAPER_CATEGORIES = [
  "芸能",
  "World",
  "IT",
  "スポーツ",
  "経済",
  "科学",
  "エンタメ",
] as const;

export type NewspaperCategory = (typeof NEWSPAPER_CATEGORIES)[number];
```

feature で定義された 7 カテゴリをそのまま使用する。`config/` に配置し、ハンドラは import して使用する。

### 2.5 NewspaperHandler の型とインターフェース

```typescript
// src/lib/services/handlers/newspaper-handler.ts

import type {
  CommandContext,
  CommandHandler,
  CommandHandlerResult,
} from "../command-service";
import { NEWSPAPER_CATEGORIES } from "../../../config/newspaper-categories";

/**
 * NewspaperHandler が使用する PendingAsyncCommandRepository の DI インターフェース。
 * AoriHandler の IAoriPendingRepository と同一シグネチャを共有する。
 */
export interface INewspaperPendingRepository {
  create(params: {
    commandType: string;
    threadId: string;
    targetPostNumber: number;
    invokerUserId: string;
    payload?: Record<string, unknown> | null;
  }): Promise<void>;
}

/**
 * カテゴリ選択関数の型（DI 用）。
 * テスト時に決定論的な選択関数を注入する。
 */
export type CategorySelector = () => string;

/** デフォルトのランダム選択関数 */
export const defaultCategorySelector: CategorySelector = () => {
  const idx = Math.floor(Math.random() * NEWSPAPER_CATEGORIES.length);
  return NEWSPAPER_CATEGORIES[idx];
};

export class NewspaperHandler implements CommandHandler {
  readonly commandName = "newspaper";

  constructor(
    private readonly pendingRepository: INewspaperPendingRepository,
    private readonly selectCategory: CategorySelector = defaultCategorySelector,
  ) {}

  async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
    // Step 1: カテゴリをランダム選択
    const category = this.selectCategory();

    // Step 2: pending_async_commands に INSERT
    // target_post_number はコマンド実行元レスの番号。
    // !newspaper は >>N 引数を取らないため、ctx.postNumber を使用する。
    // 結果表示先スレッドの特定と、エラー時のシステム通知先として必要。
    await this.pendingRepository.create({
      commandType: "newspaper",
      threadId: ctx.threadId,
      targetPostNumber: ctx.postNumber,
      invokerUserId: ctx.userId,
      payload: {
        category,
        model_id: "gemini-3-flash-preview",
      },
    });

    // Step 3: 成功を返す（systemMessage: null で同期出力なし）
    // ステルスではないため、コマンド文字列はそのまま本文に残る。
    return {
      success: true,
      systemMessage: null,
    };
  }
}
```

**設計判断:**
- `systemMessage: null` を返す。非同期コマンドの結果は Cron フェーズで★システムレスとして投稿される。同期フェーズでは何も表示しない
- `payload.model_id` に `"gemini-3-flash-preview"` を保存する。TDR-015 で将来のマルチモデル対応を見据えてプロバイダ識別子を格納する方針
- `CategorySelector` を DI 可能にすることで、BDD テストで決定論的なカテゴリ選択が可能
- `targetPostNumber` は `ctx.postNumber`（コマンド実行元レスの番号）を使用する。!newspaper は `>>N` 引数を取らないため、!aori とは異なる。エラー通知の紐付けに使用する

### 2.6 commands.yaml エントリ

```yaml
# config/commands.yaml に追加
  newspaper:
    description: "最新ニュースを取得する"
    cost: 10
    targetFormat: null
    responseType: independent
    enabled: true
    stealth: false
```

- `stealth: false` -- コマンド文字列は本文に残る（feature で明示: 「書き込み本文は "ニュースくれ !newspaper" がそのまま表示される」）
- `responseType: independent` -- 結果は★システム名義の独立レス
- `targetFormat: null` -- 引数なし

### 2.7 CommandService コンストラクタへの登録

```typescript
// command-service.ts コンストラクタ内の handlers 配列に追加
import { NewspaperHandler } from "./handlers/newspaper-handler";

const handlers: CommandHandler[] = [
  // ... 既存ハンドラ ...
  new AoriHandler(resolvedPendingAsyncCommandRepository),
  new NewspaperHandler(resolvedPendingAsyncCommandRepository), // 追加
];
```

AoriHandler と同一の `pendingAsyncCommandRepository` インスタンスを共有する。`command_type` カラムで区別するため、リポジトリの分離は不要。

### 2.8 ctx.postNumber の伝播

`CommandContext` に `postNumber` が存在しない場合は追加が必要。

```typescript
// command-service.ts の CommandContext
export interface CommandContext {
  threadId: string;
  userId: string;
  postId: string;
  args: string[];
  rawArgs?: string[];
  postNumber: number;  // ← 追加が必要な場合
}
```

既存実装で `ctx.postNumber` が未定義の場合、CommandService の `executeCommand` で PostService から受け取った postNumber を CommandContext に含める必要がある。postNumber は PostService が Step 6（レス番号採番）で確定するが、コマンド実行は Step 5 であり、この時点では postNumber が未確定。

**代替案: pending INSERT 時の target_post_number に 0 を入れ、Cron 処理側で不要とする。**

!newspaper の pending レコードにおける `target_post_number` の用途:
- !aori: 煽り先レスの特定に必須（`>>${target_post_number} 煽り文句`）
- !newspaper: 結果投稿先スレッドの特定には `thread_id` があれば十分。`target_post_number` は直接使用しない

**決定: target_post_number には 0 を設定する。**

理由:
- pending_async_commands の `target_post_number` は NOT NULL 制約があるため NULL は不可
- !newspaper は特定レスへの返信ではなくスレッドへの独立投稿なので、レス番号の参照は不要
- Cron 処理では `thread_id` と `invoker_user_id` のみ使用する

```typescript
// NewspaperHandler.execute() の修正
await this.pendingRepository.create({
  commandType: "newspaper",
  threadId: ctx.threadId,
  targetPostNumber: 0,  // !newspaper は特定レスを参照しない
  invokerUserId: ctx.userId,
  payload: {
    category,
    model_id: "gemini-3-flash-preview",
  },
});
```

---

## 3. Cron 処理設計（GitHub Actions）

### 3.1 配置方針

**決定: 新規エンドポイント `/api/internal/newspaper/process` を作成し、新規 GitHub Actions ワークフローで呼び出す。**

理由:
- TDR-013 準拠: AI API 使用 -> GitHub Actions。既存の `/api/internal/bot/execute` は Cloudflare Cron Triggers から呼ばれる（短時間処理）。AI API 呼び出しを含む長時間処理を混在させるとタイムアウトリスクがある
- 既存の `bot-scheduler.yml` は現在 schedule が無効化されており（CF Cron 移行済み）、復活させる場合は newspaper 専用ジョブを追加する形が適切
- エンドポイント分離により、newspaper 処理の失敗が BOT 投稿処理に影響しない

### 3.2 処理サービス

`processNewspaperCommands` は BotService ではなく、独立した関数として配置する。

**決定: `src/lib/services/newspaper-service.ts` に配置する。**

理由:
- !newspaper は BOT エンティティを生成しない。BotService の責務（BOT ライフサイクル管理）とは無関係
- BotService に processAoriCommands が既に存在するのは、!aori が BOT スポーンを伴うため。!newspaper は BOT スポーンがなく、AI API 呼び出し + ★システムレス投稿のみ
- 将来 !hiroyuki（AI API + BOT 召喚）が追加される際にも、AI API 呼び出し部分は newspaper-service のパターンを参考にできる

```typescript
// src/lib/services/newspaper-service.ts

import type { IGoogleAiAdapter } from "../infrastructure/adapters/google-ai-adapter";
import { NEWSPAPER_SYSTEM_PROMPT } from "../../config/newspaper-prompt";

/**
 * processNewspaperCommands の DI インターフェース
 */
export interface INewspaperServiceDeps {
  pendingAsyncCommandRepository: {
    findByCommandType(commandType: string): Promise<PendingAsyncCommand[]>;
    deletePendingAsyncCommand(id: string): Promise<void>;
  };
  googleAiAdapter: IGoogleAiAdapter;
  createPostFn: (params: {
    threadId: string;
    body: string;
    edgeToken: null;
    ipHash: string;
    displayName: string;
    isBotWrite: true;
    isSystemMessage: true;
  }) => Promise<{ success: boolean; postId: string }>;
  creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}

export interface NewspaperResult {
  pendingId: string;
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * pending_async_commands から "newspaper" エントリを読み取り、
 * AI API でニュースを取得して★システムレスとして投稿する。
 *
 * See: features/command_newspaper.feature
 * See: docs/architecture/components/command.md S5 非同期副作用のキューイングパターン
 */
export async function processNewspaperCommands(
  deps: INewspaperServiceDeps,
): Promise<{ processed: number; results: NewspaperResult[] }> {
  const pendingList =
    await deps.pendingAsyncCommandRepository.findByCommandType("newspaper");

  if (pendingList.length === 0) {
    return { processed: 0, results: [] };
  }

  const results: NewspaperResult[] = [];

  for (const pending of pendingList) {
    try {
      const payload = pending.payload as {
        category: string;
        model_id: string;
      } | null;
      const category = payload?.category ?? "IT";
      const modelId = payload?.model_id ?? "gemini-3-flash-preview";

      // Step 1: AI API 呼び出し（Google Search Grounding）
      const aiResult = await deps.googleAiAdapter.generateWithSearch({
        systemPrompt: NEWSPAPER_SYSTEM_PROMPT,
        userPrompt: `${category}カテゴリの最新ニュースを1件紹介してください。`,
        modelId,
      });

      // Step 2: ★システム名義の独立レスとして投稿
      const postResult = await deps.createPostFn({
        threadId: pending.threadId,
        body: aiResult.text,
        edgeToken: null,
        ipHash: "system-newspaper",
        displayName: "★システム",
        isBotWrite: true,
        isSystemMessage: true,
      });

      // Step 3: pending 削除
      await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
        pending.id,
      );

      results.push({
        pendingId: pending.id,
        success: true,
        postId: postResult.postId,
      });
    } catch (err) {
      // AI API 全試行失敗 or 投稿失敗
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      console.error(
        `NewspaperService.processNewspaperCommands: pending=${pending.id} failed`,
        err,
      );

      // Step 4: 通貨返却
      try {
        const commandCost = 10; // commands.yaml の newspaper.cost
        await deps.creditFn(
          pending.invokerUserId,
          commandCost,
          "newspaper_api_failure",
        );
      } catch (creditErr) {
        console.error(
          `NewspaperService: 通貨返却失敗 user=${pending.invokerUserId}`,
          creditErr,
        );
      }

      // Step 5: ★システムエラー通知
      try {
        await deps.createPostFn({
          threadId: pending.threadId,
          body: "ニュースの取得に失敗しました。通貨は返却されました。",
          edgeToken: null,
          ipHash: "system-newspaper",
          displayName: "★システム",
          isBotWrite: true,
          isSystemMessage: true,
        });
      } catch (notifyErr) {
        console.error(
          `NewspaperService: エラー通知投稿失敗 thread=${pending.threadId}`,
          notifyErr,
        );
      }

      // Step 6: pending 削除（エラー時も削除して無限リトライを防ぐ）
      try {
        await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
          pending.id,
        );
      } catch (deleteErr) {
        console.error(
          `NewspaperService: pending削除失敗 id=${pending.id}`,
          deleteErr,
        );
      }

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

### 3.3 API ルート

```
src/app/api/internal/newspaper/process/route.ts
```

```typescript
// POST /api/internal/newspaper/process
import { NextResponse } from "next/server";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { processNewspaperCommands } from "@/lib/services/newspaper-service";
import { GoogleAiAdapter } from "@/lib/infrastructure/adapters/google-ai-adapter";
import * as PendingAsyncCommandRepo
  from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { createPost } from "@/lib/services/post-service";
import { credit } from "@/lib/services/currency-service";

export async function POST(request: Request): Promise<NextResponse> {
  // Step 1: Bearer 認証チェック
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Step 2: newspaper pending 処理
    const googleAiAdapter = new GoogleAiAdapter(
      process.env.GEMINI_API_KEY ?? "",
    );

    const result = await processNewspaperCommands({
      pendingAsyncCommandRepository: PendingAsyncCommandRepo,
      googleAiAdapter,
      createPostFn: createPost,
      creditFn: credit,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[POST /api/internal/newspaper/process] Unhandled error:",
      err,
    );
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "newspaper処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
```

### 3.4 GitHub Actions ワークフロー

```yaml
# .github/workflows/newspaper-scheduler.yml

name: Newspaper Scheduler

on:
  schedule:
    - cron: '5,35 * * * *'  # 毎時 :05, :35（bot-scheduler と 5 分ずらす）
  workflow_dispatch: {}      # 手動実行（デバッグ用）

jobs:
  process-newspaper:
    runs-on: ubuntu-latest
    steps:
      - name: Process newspaper commands
        run: |
          echo "=== Newspaper Scheduler triggered at $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
          RESPONSE=$(curl -fsS \
            -X POST \
            -H "Authorization: Bearer ${{ secrets.BOT_API_KEY }}" \
            -H "Content-Type: application/json" \
            "${{ secrets.DEPLOY_URL }}/api/internal/newspaper/process")
          echo "Response: ${RESPONSE}"
```

**設計判断:**
- 既存の `bot-scheduler.yml` と同じ認証方式（`BOT_API_KEY`）を使用する。新規 secret の追加は不要
- 実行間隔は 30 分間隔（毎時 :05, :35）。bot-scheduler の :00, :30 と 5 分ずらして負荷分散する
- GitHub Actions 無料枠への影響: +1,440分/月。bot-scheduler が CF Cron 移行済みのため枠に余裕がある
- `DEPLOY_URL` は Vercel を指す（TDR-010 と同一方針。Vercel の 10 秒タイムアウトは AI API 応答時間 + リトライで超過する可能性があるため、§3.5 で対策）

### 3.5 Vercel タイムアウト対策

Vercel Hobby プランのタイムアウトは 10 秒。AI API 呼び出し（リトライ含む最大 7 秒）+ DB 操作 + レス投稿で 10 秒を超過する可能性がある。

**対策案:**
1. Vercel Pro プラン（60 秒タイムアウト）へのアップグレード -- 最も確実だがコスト増
2. `maxDuration` 設定 -- Vercel の route segment config で延長（Pro 以上で有効）
3. 1 回の Cron 実行で処理する pending 数を 1 件に制限 -- 30 分間隔のため溜まる可能性は低い

**決定: 1 回の処理を 1 件に制限する。**

理由:
- !newspaper は 30 分間隔の Cron で処理される。10 コスト（高め）のコマンドが 30 分間に大量に実行される可能性は低い
- 万が一溜まった場合は次回の Cron 実行で順次処理される
- Vercel のプランに依存しない安全な方式

```typescript
// processNewspaperCommands 内の修正
const MAX_PROCESS_PER_EXECUTION = 1;
const pendingToProcess = pendingList.slice(0, MAX_PROCESS_PER_EXECUTION);

for (const pending of pendingToProcess) {
  // ...
}
```

---

## 4. エラーハンドリング

### 4.1 エラーフロー

```
AI API 呼び出し失敗（リトライ 3 回全失敗）
  |
  v
通貨返却: CurrencyService.credit(userId, 10, "newspaper_api_failure")
  |
  v
★システムエラー通知: createPost({ body: "ニュースの取得に失敗しました。通貨は返却されました。" })
  |
  v
pending 削除（無限リトライ防止）
```

### 4.2 通貨返却の実装

CurrencyService の `credit` 関数を使用する。`credit` は加算操作であり、コマンド実行時に `deduct` で消費された 10 を戻す。

```typescript
await deps.creditFn(pending.invokerUserId, commandCost, "newspaper_api_failure");
```

**reason パラメータ**: `"newspaper_api_failure"` を指定する。将来の incentive_log 記録で API 失敗による返却を識別可能にする。

### 4.3 エラー通知の内容

BDD シナリオ: 「「★システム」名義の独立レスでエラーが通知される」

固定メッセージ: `"ニュースの取得に失敗しました。通貨は返却されました。"`

API エラーの詳細（ステータスコード等）はユーザーに露出しない。サーバーログにのみ出力する。

### 4.4 pending 削除のタイミング

成功時・失敗時ともに pending を削除する。失敗した pending を残すと次回の Cron で再処理され、課金済み通貨の二重返却やエラー通知の重複が発生する。

---

## 5. InMemory テスト対応

### 5.1 AI API モック戦略

BDD テストでは AI API を呼ばない。`IGoogleAiAdapter` インターフェースのモック実装を使用する。

```typescript
// features/support/in-memory/google-ai-adapter.ts

import type { GoogleAiResult, IGoogleAiAdapter } from
  "../../../src/lib/infrastructure/adapters/google-ai-adapter";

/**
 * BDD テスト用の Google AI Adapter モック。
 * AI API を呼ばずに固定レスポンスを返す。
 */
export class InMemoryGoogleAiAdapter implements IGoogleAiAdapter {
  /** 次回の generateWithSearch で返す結果（テストから設定可能） */
  nextResult: GoogleAiResult = {
    text: "【ITニュース速報】\nテスト用のニュース記事です。\n\nソース: テスト",
    searchQueries: ["テスト検索クエリ"],
  };

  /** true に設定すると generateWithSearch が例外をスローする */
  shouldFail = false;

  /** 呼び出し履歴（アサーション用） */
  calls: Array<{
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
  }> = [];

  async generateWithSearch(params: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
  }): Promise<GoogleAiResult> {
    this.calls.push(params);

    if (this.shouldFail) {
      throw new Error("AI API is unavailable (mock)");
    }

    return this.nextResult;
  }

  /** テストのリセット用 */
  reset(): void {
    this.nextResult = {
      text: "【ITニュース速報】\nテスト用のニュース記事です。\n\nソース: テスト",
      searchQueries: ["テスト検索クエリ"],
    };
    this.shouldFail = false;
    this.calls = [];
  }
}
```

### 5.2 モック差し替え方式

`processNewspaperCommands` は DI パラメータで依存を受け取る設計のため、BDD テストのステップ定義で直接モック実装を注入する。`mock-installer.ts` によるモジュール差し替えは `google-ai-adapter.ts` には不要。

```typescript
// features/step_definitions/command_newspaper.steps.ts

const mockAiAdapter = new InMemoryGoogleAiAdapter();

When("コマンドの非同期処理が実行される", async function () {
  const result = await processNewspaperCommands({
    pendingAsyncCommandRepository: InMemoryPendingAsyncCommandRepo,
    googleAiAdapter: mockAiAdapter,
    createPostFn: createPost,  // InMemory 版（mock-installer 経由）
    creditFn: credit,          // InMemory 版（mock-installer 経由）
  });
  this.newspaperResult = result;
});
```

### 5.3 カテゴリランダム選択の決定論的テスト

NewspaperHandler の `CategorySelector` を DI で差し替える。

```typescript
// テスト用: 常に "IT" を返す選択関数
const fixedCategorySelector = () => "IT";

const handler = new NewspaperHandler(
  pendingRepository,
  fixedCategorySelector,
);
```

BDD シナリオ「ニュースのカテゴリが実行のたびにランダムに選ばれる」の検証:
- pending_async_commands の payload.category が 7 カテゴリのいずれかであることをアサートする
- 全 7 カテゴリが選択可能であることの厳密な検証は、defaultCategorySelector の単体テスト（Vitest）で行う

### 5.4 AI API プロンプト検証

BDD シナリオ「AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される」の検証:
- `InMemoryGoogleAiAdapter.calls` からシステムプロンプトとユーザープロンプトを取得
- システムプロンプトに「新聞配達員」が含まれることをアサート
- ユーザープロンプトに選択されたカテゴリが含まれることをアサート
- Web 検索結果の注入は `tools: [{ googleSearch: {} }]` の設定で実現されるが、モック内では検証不要（本番の Google API の責務）

### 5.5 pending_async_commands InMemory Repository

既存の `features/support/in-memory/pending-async-command-repository.ts` をそのまま再利用する。`commandType: "newspaper"` で `findByCommandType("newspaper")` が正しくフィルタリングすることは、既存の InMemory 実装で保証済み。

---

## 6. 環境変数

### 6.1 GEMINI_API_KEY の配置先

| 環境 | 配置先 | API 呼び出し元 |
|---|---|---|
| **本番（Vercel）** | Vercel ダッシュボード > Environment Variables | Vercel サーバー（`/api/internal/newspaper/process`） |
| **GitHub Actions** | 不要 | GitHub Actions は curl で Vercel を呼ぶだけ。API Key は Vercel 側で保持 |
| **ローカル開発** | `.env.local` | `npm run dev` のローカルサーバー |
| **Cloudflare Workers** | 不要 | newspaper 処理は Vercel 経由のみ |
| **BDD テスト** | 不要 | InMemory モックを使用。API Key は参照されない |

**重要**: GitHub Actions は API 呼び出し元ではない。GitHub Actions は Vercel のエンドポイントを HTTP 呼び出しするトリガーに過ぎない。AI API 呼び出しは Vercel サーバー上で実行される。したがって `GEMINI_API_KEY` は Vercel の環境変数にのみ設定すればよい。

### 6.2 必要な GitHub Secrets

newspaper 処理に新規の GitHub Secrets は不要。既存の `BOT_API_KEY` と `DEPLOY_URL` を再利用する。

---

## 7. 実装チェックリスト（TASK-272 向け）

### 新規作成ファイル

| # | ファイル | 内容 |
|---|---|---|
| 1 | `src/lib/infrastructure/adapters/google-ai-adapter.ts` | Gemini API クライアント（§1 準拠） |
| 2 | `config/newspaper-prompt.ts` | システムプロンプト定義（§1.5 準拠） |
| 3 | `config/newspaper-categories.ts` | 7 カテゴリ定数（§2.4 準拠） |
| 4 | `src/lib/services/handlers/newspaper-handler.ts` | NewspaperHandler（§2 準拠） |
| 5 | `src/lib/services/newspaper-service.ts` | processNewspaperCommands（§3.2 準拠） |
| 6 | `src/app/api/internal/newspaper/process/route.ts` | API ルート（§3.3 準拠） |
| 7 | `.github/workflows/newspaper-scheduler.yml` | GitHub Actions（§3.4 準拠） |
| 8 | `features/support/in-memory/google-ai-adapter.ts` | AI API モック（§5.1 準拠） |
| 9 | `features/step_definitions/command_newspaper.steps.ts` | BDD ステップ定義 |

### 既存変更ファイル

| # | ファイル | 変更内容 |
|---|---|---|
| 1 | `config/commands.yaml` | newspaper エントリ追加（§2.6） |
| 2 | `config/commands.ts` | newspaper エントリ追加 |
| 3 | `src/lib/services/command-service.ts` | NewspaperHandler の登録（§2.7） |

### npm パッケージ追加

```
npm install @google/genai
```
