# !newspaper GH Actions 移行設計書

> 作成: 2026-03-23 (TASK-275)
> 目的: newspaper 非同期処理を D-07 S12.2「非同期処理の実行トポロジ」に準拠させる
> 現状: AI API 呼び出しが Vercel API Route 内で実行されている（タイムアウトリスクあり）
> 目標: AI API 呼び出しを GH Actions 内に移動し、Vercel は結果書き込みのみ行う

---

## 1. GH Actions スクリプト設計

### 1.1 実装方式

**決定: Node.js スクリプト（TypeScript を tsx で実行）**

| 方式 | メリット | デメリット |
|---|---|---|
| シェル + curl | 依存少ない、シンプル | AI SDK 再実装が必要、リトライ/パース処理が煩雑 |
| **Node.js (tsx)** | `google-ai-adapter.ts` をそのまま再利用可能 | Node.js セットアップ + npm install が必要 |

`google-ai-adapter.ts` は純粋な API クライアントであり、Vercel/Next.js への依存がない。tsx で直接実行すれば既存コードを変更なしで再利用できる。

### 1.2 ファイル配置

```
scripts/
  newspaper-worker.ts    # GH Actions から実行されるエントリポイント（新規作成）
```

エントリポイントは `scripts/` に配置する。`src/` 配下のモジュールを import して使用する。

### 1.3 依存管理

GH Actions ワークフロー内で以下を実行:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
- run: npm ci
```

`@google/genai` は既に `package.json` の dependencies に含まれているため、`npm ci` で全依存がインストールされる。tsx は devDependencies に追加する（未導入の場合）。

### 1.4 newspaper-worker.ts の責務

```
1. GET /api/internal/newspaper/pending → pending リスト取得
2. 各 pending に対して:
   a. GoogleAiAdapter.generateWithSearch() で AI テキスト生成
   b. POST /api/internal/newspaper/complete → 生成済みテキスト + メタ情報を送信
3. エラー時:
   a. POST /api/internal/newspaper/complete → エラー情報を送信（Vercel 側で通貨返却・通知）
```

### 1.5 newspaper-worker.ts 擬似コード

```typescript
import { GoogleAiAdapter } from "../src/lib/infrastructure/adapters/google-ai-adapter";
import { NEWSPAPER_SYSTEM_PROMPT } from "../config/newspaper-prompt";

const DEPLOY_URL = process.env.DEPLOY_URL!;
const BOT_API_KEY = process.env.BOT_API_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

async function main() {
  // Step 1: pending 取得
  const res = await fetch(`${DEPLOY_URL}/api/internal/newspaper/pending`, {
    headers: { Authorization: `Bearer ${BOT_API_KEY}` },
  });
  const { pendingList } = await res.json();

  if (pendingList.length === 0) {
    console.log("No pending newspaper commands.");
    return;
  }

  const adapter = new GoogleAiAdapter(GEMINI_API_KEY);

  // Step 2: 各 pending を処理（MAX_PROCESS_PER_EXECUTION は GH Actions 側では不要、全件処理可能）
  for (const pending of pendingList) {
    const payload = pending.payload as { category: string; model_id: string } | null;
    const category = payload?.category ?? "IT";
    const modelId = payload?.model_id ?? "gemini-3-flash-preview";

    let body: Record<string, unknown>;
    try {
      const aiResult = await adapter.generateWithSearch({
        systemPrompt: NEWSPAPER_SYSTEM_PROMPT,
        userPrompt: `${category}カテゴリの最新ニュースを1件紹介してください。`,
        modelId,
      });
      body = {
        pendingId: pending.id,
        threadId: pending.threadId,
        invokerUserId: pending.invokerUserId,
        success: true,
        generatedText: aiResult.text,
      };
    } catch (err) {
      body = {
        pendingId: pending.id,
        threadId: pending.threadId,
        invokerUserId: pending.invokerUserId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Step 3: 結果を Vercel に送信
    await fetch(`${DEPLOY_URL}/api/internal/newspaper/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

### 1.6 MAX_PROCESS_PER_EXECUTION の扱い

現在の `MAX_PROCESS_PER_EXECUTION = 1` は Vercel Hobby 10 秒タイムアウト対策である。GH Actions に移行後はタイムアウト制約がなくなるため、**全件処理に変更する**。ただし安全のため、worker スクリプト側で上限 10 件程度のガードを設ける。

---

## 2. Vercel API Route 改修設計

### 2.1 エンドポイント設計

**決定: 案A（専用エンドポイント分離）を採用**

| エンドポイント | メソッド | 責務 | 新規/改修 |
|---|---|---|---|
| `/api/internal/newspaper/pending` | GET | pending リスト取得 | **新規** |
| `/api/internal/newspaper/complete` | POST | 結果書き込み（成功: 投稿 / 失敗: 通貨返却+通知） | **新規** |
| `/api/internal/newspaper/process` | POST | ~~AI呼び出し+DB書き込み~~ | **削除** |

案B（既存 POST の動作分岐）は SRP 違反であり、将来の保守性を損なうため不採用。

### 2.2 GET /api/internal/newspaper/pending

**リクエスト:**
```
GET /api/internal/newspaper/pending
Authorization: Bearer {BOT_API_KEY}
```

**レスポンス (200):**
```json
{
  "pendingList": [
    {
      "id": "uuid",
      "threadId": "uuid",
      "invokerUserId": "uuid",
      "payload": { "category": "IT", "model_id": "gemini-3-flash-preview" },
      "createdAt": "2026-03-23T00:00:00Z"
    }
  ]
}
```

**実装:** `PendingAsyncCommandRepo.findByCommandType("newspaper")` を呼ぶだけ。

### 2.3 POST /api/internal/newspaper/complete

**リクエスト (成功時):**
```json
{
  "pendingId": "uuid",
  "threadId": "uuid",
  "invokerUserId": "uuid",
  "success": true,
  "generatedText": "【ITニュース速報】..."
}
```

**リクエスト (失敗時):**
```json
{
  "pendingId": "uuid",
  "threadId": "uuid",
  "invokerUserId": "uuid",
  "success": false,
  "error": "API rate limit exceeded"
}
```

**レスポンス (200):**
```json
{
  "result": {
    "pendingId": "uuid",
    "success": true,
    "postId": "uuid"
  }
}
```

**実装:**
- 成功時: createPost (★システム名義) → pending 削除
- 失敗時: credit (通貨返却) → createPost (エラー通知) → pending 削除

### 2.4 認証

全エンドポイントで `verifyInternalApiKey` (Bearer BOT_API_KEY) を使用する。既存パターンを踏襲。

---

## 3. newspaper-service.ts 改修方針

### 3.1 責務の再分割

| 責務 | 移行前 | 移行後 |
|---|---|---|
| pending 取得 | newspaper-service.ts | Vercel GET endpoint (repository 直接呼び出し) |
| AI API 呼び出し | newspaper-service.ts | **scripts/newspaper-worker.ts** |
| 投稿 (createPost) | newspaper-service.ts | Vercel POST endpoint |
| 通貨返却 (credit) | newspaper-service.ts | Vercel POST endpoint |
| エラー通知投稿 | newspaper-service.ts | Vercel POST endpoint |
| pending 削除 | newspaper-service.ts | Vercel POST endpoint |

### 3.2 newspaper-service.ts の改修

現在の `processNewspaperCommands` は AI 呼び出しから投稿まで一貫して行う関数である。移行後は以下のように分割する:

**新関数: `completeNewspaperCommand`**

```typescript
export async function completeNewspaperCommand(
  deps: INewspaperCompleteDeps,
  params: {
    pendingId: string;
    threadId: string;
    invokerUserId: string;
    success: boolean;
    generatedText?: string;
    error?: string;
  },
): Promise<NewspaperResult> {
  // 成功時: createPost → pending 削除
  // 失敗時: credit → エラー通知投稿 → pending 削除
}
```

`INewspaperCompleteDeps` は `IGoogleAiAdapter` を除いた DI インターフェース:
```typescript
export interface INewspaperCompleteDeps {
  pendingAsyncCommandRepository: {
    deletePendingAsyncCommand(id: string): Promise<void>;
  };
  createPostFn: (params: { ... }) => Promise<{ success: boolean; postId: string }>;
  creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}
```

**旧関数 `processNewspaperCommands` の扱い:**

BDD テストが直接 `processNewspaperCommands` を呼んでいるため、**テスト互換性のために残す**。ただし内部実装を `completeNewspaperCommand` に委譲するようリファクタリングする（AI 呼び出し → complete の流れを関数内で実行）。

---

## 4. ワークフロー改修設計 (newspaper-scheduler.yml)

### 4.1 改修後のワークフロー

```yaml
name: Newspaper Scheduler

on:
  schedule:
    - cron: '5,35 * * * *'
  workflow_dispatch: {}

jobs:
  process-newspaper:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Process newspaper commands
        env:
          DEPLOY_URL: ${{ secrets.DEPLOY_URL }}
          BOT_API_KEY: ${{ secrets.BOT_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: npx tsx scripts/newspaper-worker.ts
```

### 4.2 変更点のまとめ

| 項目 | 変更前 | 変更後 |
|---|---|---|
| steps | curl 1行のみ | checkout → setup-node → npm ci → tsx 実行 |
| AI API 呼び出し | Vercel 内 | GH Actions 内 |
| Vercel への送信内容 | トリガーのみ（空 POST） | 生成済みテキスト + メタ情報 |
| 必要な Secrets | BOT_API_KEY, DEPLOY_URL | BOT_API_KEY, DEPLOY_URL, **GEMINI_API_KEY** |

### 4.3 実行時間の見積もり

- checkout + setup-node + npm ci (cached): ~30s
- AI API 呼び出し (1件): 5-15s (リトライ込み最大 ~25s)
- Vercel API 呼び出し (2回/件): ~2s
- **合計 (1件):** ~40-60s（GH Actions の制限時間 6h に対して余裕あり）

---

## 5. 秘密情報の配置変更

| Secret | 変更前 | 変更後 | 理由 |
|---|---|---|---|
| GEMINI_API_KEY | Vercel 環境変数 | **GH Secrets** | AI API は GH Actions 内で呼ぶため |
| BOT_API_KEY | GH Secrets + Vercel 環境変数 | 変更なし | Vercel 側の認証検証に必要 |
| DEPLOY_URL | GH Secrets | 変更なし | |

**注意:** Vercel 側の GEMINI_API_KEY は削除してよい（newspaper 以外で使用していないことを確認の上）。現時点では newspaper のみが使用しているため、削除可能。

---

## 6. BDD テスト影響分析

### 6.1 結論: BDD シナリオ変更は不要

BDD テスト (`command_newspaper.steps.ts`) は `processNewspaperCommands` を DI 付きで直接呼び出している。HTTP 層（API Route）を経由していない。

移行で変わるのは:
- API Route の構造（process → pending + complete）
- ワークフロー（curl → tsx スクリプト）

BDD テストが検証しているのは:
- `processNewspaperCommands` のビジネスロジック（AI 呼び出し → 投稿 → pending 削除）
- エラー時の通貨返却・エラー通知

これらは **newspaper-service.ts の関数レベル** で検証されており、API Route の構造変更に影響されない。

### 6.2 ステップ定義への影響

`processNewspaperCommands` を BDD テスト互換のために残すため（S3.2 参照）、ステップ定義の変更は不要。

### 6.3 単体テストへの影響

`src/__tests__/` に newspaper 関連のテストがある場合は、`completeNewspaperCommand` の追加に合わせて新規テストを追加する。

---

## 7. 実装タスクの分解と対象ファイル一覧

### 7.1 タスク分解（TASK-276 実装順序）

| # | 作業内容 | 対象ファイル |
|---|---|---|
| 1 | `completeNewspaperCommand` を newspaper-service.ts に追加 | `src/lib/services/newspaper-service.ts` |
| 2 | GET /api/internal/newspaper/pending ルート新規作成 | `src/app/api/internal/newspaper/pending/route.ts` (新規) |
| 3 | POST /api/internal/newspaper/complete ルート新規作成 | `src/app/api/internal/newspaper/complete/route.ts` (新規) |
| 4 | scripts/newspaper-worker.ts 新規作成 | `scripts/newspaper-worker.ts` (新規) |
| 5 | newspaper-scheduler.yml 改修 | `.github/workflows/newspaper-scheduler.yml` |
| 6 | 旧 process ルート削除 | `src/app/api/internal/newspaper/process/route.ts` (削除) |
| 7 | _(tsx は導入済み。追加作業なし)_ | — |
| 8 | 単体テスト追加（completeNewspaperCommand） | `src/__tests__/lib/services/newspaper-service.test.ts` (新規 or 追記) |

### 7.2 locked_files（TASK-276 用）

```yaml
locked_files:
  - src/lib/services/newspaper-service.ts
  - src/app/api/internal/newspaper/process/route.ts
  - src/app/api/internal/newspaper/pending/route.ts    # 新規
  - src/app/api/internal/newspaper/complete/route.ts   # 新規
  - .github/workflows/newspaper-scheduler.yml
  - scripts/newspaper-worker.ts                         # 新規
```

### 7.3 変更しないファイル

| ファイル | 理由 |
|---|---|
| `features/command_newspaper.feature` | BDD シナリオ変更不要 |
| `features/step_definitions/command_newspaper.steps.ts` | processNewspaperCommands の DI テストパターンを維持 |
| `src/lib/infrastructure/adapters/google-ai-adapter.ts` | GH Actions から直接 import して再利用。変更不要 |
| `config/newspaper-prompt.ts` | 変更不要 |
| `config/newspaper-categories.ts` | 変更不要 |
