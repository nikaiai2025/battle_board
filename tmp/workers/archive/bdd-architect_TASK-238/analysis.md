# TASK-238 本番障害分析: CF Workers Error 1101

> 作成日: 2026-03-21
> 対象: `src/cf-scheduled.ts` によるカスタムエントリポイント導入後の全面ダウン

---

## 1. 原因特定

### 1.1 直接原因: `new Function` によるランタイムエラー

`cf-scheduled.ts` の fetch ハンドラ内（L65-76）で使用している `new Function` がクラッシュの原因である。

```typescript
const importFn = new Function("m", "return import(m)") as (...) => ...;
const { default: handler } = await importFn("./.open-next/worker.js");
```

Cloudflare Workers (workerd) は **リクエスト処理中の `eval()` / `new Function()` を禁止** している。これはセキュリティ上の制約であり、`compatibility_flags` で回避できない。

- 起動時（top-level scope）の `new Function` は `allow_eval_during_startup` フラグで許可可能
- しかし `fetch` ハンドラ内（リクエスト処理中）の `new Function` は **いかなる設定でも禁止**

この結果、全ての HTTP リクエストで例外が発生し、Error 1101 が返される。

### 1.2 副次的原因: 動的 import パスの解決不能

仮に `new Function` が動作したとしても、`"./.open-next/worker.js"` への動的 import は失敗する。理由:

1. **wrangler のバンドル挙動**: wrangler は `main` に指定されたファイルを esbuild でバンドルする。`new Function` 内の文字列リテラル `"./.open-next/worker.js"` は esbuild の静的解析対象外であり、バンドルに含まれない
2. **Workers ランタイムにファイルシステムはない**: バンドルされなかったモジュールは Workers ランタイムに存在せず、`import()` は `No such module` エラーで失敗する
3. **パス基準のずれ**: `src/cf-scheduled.ts` から見た `"./.open-next/worker.js"` は `src/.open-next/worker.js` に解決されるが、実際のビルド成果物は `<project-root>/.open-next/worker.js` にある

### 1.3 根本原因: OpenNext のビルドプロセスとの統合設計の誤り

`@opennextjs/cloudflare` のビルドプロセス（`build-cf.mjs` -> opennextjs CLI -> `bundle-server.js`）は以下の流れで `.open-next/worker.js` を生成する:

```
1. Next.js ビルド (next build --webpack)
2. OpenNext サーバーバンドル生成 (.open-next/server-functions/default/handler.mjs)
3. テンプレート worker.js を .open-next/worker.js にコピー
   - このworker.jsが fetch ハンドラの正本
4. wrangler deploy が .open-next/worker.js をエントリポイントとしてバンドル
```

TASK-238 では `main` を `src/cf-scheduled.ts` に変更したが、このファイルは **手順3の後に wrangler がバンドルする際のエントリポイント** として処理される。つまり:

- wrangler は `src/cf-scheduled.ts` を esbuild でバンドルする
- `src/cf-scheduled.ts` 内の `.open-next/worker.js` への参照は `new Function` 内の文字列であるため、esbuild は認識・バンドルしない
- 結果として、OpenNext の fetch ハンドラは Workers ランタイムに到達しない

---

## 2. OpenNext ビルドプロセスとの統合分析

### 2.1 ビルド出力構造

`@opennextjs/cloudflare` v1.17.1 のビルド出力:

```
.open-next/
  worker.js                          <- wrangler のエントリポイント（テンプレートからコピー）
  assets/                            <- 静的アセット
  cloudflare/                        <- init.js, images.js, skew-protection.js
  cloudflare-templates/              <- shim ファイル群
  middleware/
    handler.mjs                      <- ミドルウェアハンドラ
  server-functions/
    default/
      handler.mjs                    <- esbuild でバンドル済みの Next.js サーバー
      .next/                         <- Next.js ビルド成果物のコピー
  .build/
    durable-objects/                  <- DO ハンドラ（使用時のみ）
```

### 2.2 worker.js テンプレートの内容

`.open-next/worker.js` は以下を行う:
- `./cloudflare/init.js` から `runWithCloudflareRequestContext` をインポート（Workers ランタイム初期化）
- `./middleware/handler.mjs` からミドルウェアハンドラをインポート
- `./server-functions/default/handler.mjs` を動的 import（これは esbuild の静的解析で解決される正規の `import()` 式）
- `fetch` ハンドラをエクスポート

重要: worker.js 内の `import()` は esbuild が認識する正規の動的 import 構文であり、`new Function` ではない。wrangler が `.open-next/worker.js` をエントリポイントとしてバンドルすれば、これらの import は正しく解決される。

### 2.3 カスタムエントリポイントが機能しない構造的理由

`src/cf-scheduled.ts` をエントリポイントにした場合、wrangler の esbuild バンドルは以下のようになる:

```
src/cf-scheduled.ts  (エントリポイント)
  -> new Function("m", "return import(m)")  ← esbuild は静的解析できない
  -> "./.open-next/worker.js"               ← 文字列リテラルとして無視される

結果: .open-next/worker.js およびその依存関係はバンドルに含まれない
```

---

## 3. 修正方針

### 方針A: OpenNext 公式のカスタムワーカー方式（推奨）

OpenNext 公式ドキュメント（[Custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker)）が推奨する方式。

**設計:**
- カスタムワーカーファイルを `.open-next/worker.js` と **同じディレクトリ** に配置するか、ビルド出力からの相対パスで import する
- `new Function` を使わず、通常の `import` で `.open-next/worker.js` の `fetch` ハンドラを取得する
- wrangler.toml の `main` をカスタムワーカーに向ける

**実装案:**

```typescript
// custom-worker.ts（プロジェクトルートに配置）
// @ts-ignore - OpenNext ビルド成果物
import openNextHandler from "./.open-next/worker.js";

// OpenNext が使用する Durable Objects の re-export（本プロジェクトでは不使用）
// export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

interface Env {
  WORKER_SELF_REFERENCE: Fetcher;
  BOT_API_KEY: string;
  ASSETS: Fetcher;
}

export default {
  fetch: openNextHandler.fetch,

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const response = await env.WORKER_SELF_REFERENCE.fetch(
      "https://dummy-host/api/internal/bot/execute",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.BOT_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error(`[scheduled] bot/execute failed: ${response.status}`);
    } else {
      const body = await response.json();
      console.log(`[scheduled] bot/execute result:`, JSON.stringify(body));
    }
  },
} satisfies ExportedHandler<Env>;
```

```toml
# wrangler.toml
main = "custom-worker.ts"
```

**重要な注意点:**

wrangler は `custom-worker.ts` をエントリポイントとして esbuild でバンドルする。`import openNextHandler from "./.open-next/worker.js"` は **静的 import** であるため、esbuild は `.open-next/worker.js` とその全依存関係を解決・バンドルに含める。これにより OpenNext の全機能（init, middleware, server handler）が正しく動作する。

ただし、以下の検証が必要:

1. `.open-next/worker.js` 内の動的 `import("./server-functions/default/handler.mjs")` が、エントリポイント変更後も正しく解決されるか
2. `.open-next/worker.js` 内の他の相対 import（`./cloudflare/init.js` 等）が正しく解決されるか
3. esbuild のバンドルサイズが倍増しないか（二重バンドルの懸念）

| 項目 | 評価 |
|---|---|
| 実現可能性 | 高。OpenNext 公式が推奨する方式 |
| リスク | 中。esbuild のパス解決・二重バンドルの検証が必要 |
| 工数 | 小。ファイル1つ + wrangler.toml 変更 |

### 方針B: ビルド後の worker.js 末尾に scheduled ハンドラを注入（推奨: 最も安全）

**設計:**
- `build-cf.mjs` のビルド後処理として、生成された `.open-next/worker.js` の `default export` に `scheduled` ハンドラを注入する
- `wrangler.toml` の `main` は `.open-next/worker.js` のままにする

**実装案:**

`build-cf.mjs` の末尾に以下を追加:

```javascript
// ── scheduled ハンドラの注入 ────────────────────────────────────────────────
const workerPath = path.join(projectRoot, '.open-next', 'worker.js');
if (fs.existsSync(workerPath)) {
  let workerCode = fs.readFileSync(workerPath, 'utf-8');

  const scheduledHandler = `
// --- Injected scheduled handler (TASK-238) ---
const _originalExport = _dirtyDefaultExport;
const _wrappedExport = {
  fetch: _originalExport.fetch,
  async scheduled(event, env, ctx) {
    const response = await env.WORKER_SELF_REFERENCE.fetch(
      "https://dummy-host/api/internal/bot/execute",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.BOT_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error("[scheduled] bot/execute failed: " + response.status);
    } else {
      const body = await response.json();
      console.log("[scheduled] bot/execute result:", JSON.stringify(body));
    }
  },
};
export default _wrappedExport;
`;

  // 既存の default export を置換
  // worker.js のフォーマットに依存するため脆弱
  // ...
}
```

**問題点:**
- `.open-next/worker.js` のコードフォーマットに強く依存し、OpenNext のバージョンアップで容易に壊れる
- default export の置換は AST 操作なしでは信頼性が低い
- バンドル済みコードの操作は脆弱

| 項目 | 評価 |
|---|---|
| 実現可能性 | 中。worker.js のフォーマット依存が高い |
| リスク | 高。OpenNext バージョンアップで壊れるリスク |
| 工数 | 中。正規表現/AST によるコード変換が必要 |

**結論: 方針B は脆弱性が高く、推奨しない。**

### 方針C: wrangler.toml の main を戻し、カスタムワーカーを .open-next/ 内に生成（最も推奨）

**設計:**
- `wrangler.toml` の `main` は `.open-next/worker.js` のまま変更しない
- `build-cf.mjs` のビルド後処理で、`.open-next/worker.js` を `.open-next/original-worker.js` にリネームし、新しい `.open-next/worker.js` を生成する
- 新しい `worker.js` は `original-worker.js` を import し、`scheduled` ハンドラを追加する

**実装案:**

`build-cf.mjs` の末尾に以下を追加:

```javascript
// ── カスタムワーカー生成（scheduled ハンドラ追加） ──────────────────────────
const workerPath = path.join(projectRoot, '.open-next', 'worker.js');
const originalWorkerPath = path.join(projectRoot, '.open-next', 'original-worker.js');

if (fs.existsSync(workerPath)) {
  // 元の worker.js をリネーム
  fs.renameSync(workerPath, originalWorkerPath);

  // scheduled 付きのカスタム worker.js を生成
  const customWorker = `
// Custom entry point: OpenNext worker + scheduled handler
// Generated by build-cf.mjs (TASK-238)
// See: docs/architecture/architecture.md §12.2, TDR-013
import handler from "./original-worker.js";
export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    const response = await env.WORKER_SELF_REFERENCE.fetch(
      "https://dummy-host/api/internal/bot/execute",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.BOT_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error("[scheduled] bot/execute failed: " + response.status);
    } else {
      const body = await response.json();
      console.log("[scheduled] bot/execute result:", JSON.stringify(body));
    }
  },
};
`;

  fs.writeFileSync(workerPath, customWorker.trim(), 'utf-8');
  console.log('[build-cf.mjs] Custom worker.js generated with scheduled handler.');
}
```

```toml
# wrangler.toml（変更なし）
main = ".open-next/worker.js"
```

**利点:**
1. `wrangler.toml` の `main` を変更しない。OpenNext の標準構成を維持
2. wrangler は `.open-next/worker.js` を起点にバンドルし、`import handler from "./original-worker.js"` を静的に解決する。`original-worker.js` 内の依存関係も再帰的にバンドルされる
3. `new Function` を使わない。全て静的 import
4. `src/cf-scheduled.ts` は不要になり削除できる
5. ビルド後処理として `build-cf.mjs` に閉じており、OpenNext のビルドプロセス自体には干渉しない

**検証ポイント:**
1. `original-worker.js` 内の `export { DOQueueHandler, ... }` 等の named export が新しい `worker.js` で失われないか（本プロジェクトでは DO を使用しないため影響なし）
2. esbuild が `original-worker.js` の相対 import（`./cloudflare/init.js` 等）を正しく解決するか（同一ディレクトリなので問題なし）

| 項目 | 評価 |
|---|---|
| 実現可能性 | 高。静的 import のみで構成、パス解決も問題なし |
| リスク | 低。OpenNext のビルドプロセスに干渉しない |
| 工数 | 小。build-cf.mjs に20行程度の追加 |

---

## 4. 推奨修正手順

**方針C を推奨する。** 理由:
- `wrangler.toml` の `main` を変更しないため、OpenNext の標準構成との乖離が最小
- ビルド後のポストプロセスとして完結し、`build-cf.mjs` に既にある他のポストプロセス（next-env.mjs 重複除去、ssr chunks コピー）と同じパターン
- `new Function` を使わず、Workers ランタイムの制約に完全に適合

### 即時復旧手順

1. `wrangler.toml` の `main` を `.open-next/worker.js` に戻す
2. `[triggers]` セクションは残しても問題ないが、`scheduled` ハンドラが存在しないため cron は空振りする（エラーにはならない）
3. 再デプロイ

### 恒久修正手順

1. `wrangler.toml` の `main` を `.open-next/worker.js` に戻す（即時復旧と同じ）
2. `build-cf.mjs` にカスタムワーカー生成処理を追加（方針C の実装）
3. `src/cf-scheduled.ts` を削除
4. `wrangler dev --test-scheduled` でローカル検証
5. デプロイ後、CF ダッシュボードで cron 実行ログを確認

---

## 5. 原因の技術的まとめ

| 要因 | 詳細 |
|---|---|
| **直接原因** | `new Function("m", "return import(m)")` が Workers ランタイムでリクエスト処理中に禁止されている |
| **二次原因** | `new Function` 内の文字列 `"./.open-next/worker.js"` は esbuild の静的解析対象外であり、バンドルに含まれない |
| **三次原因** | `src/cf-scheduled.ts` から `.open-next/worker.js` への相対パスが不正（`src/` からの相対パスになる） |
| **根本原因** | OpenNext のビルド成果物を動的 import で参照する設計が Workers ランタイムの制約と両立しない |

---

## 参考資料

- [OpenNext - Custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker) -- 公式のカスタムワーカー方式
- [cloudflare/workerd - eval/new Function 制約](https://github.com/cloudflare/workerd/discussions/1432) -- Workers ランタイムの eval 制約
- [wrangler - Dynamic imports issue #2672](https://github.com/cloudflare/workers-sdk/issues/2672) -- wrangler の動的 import 取り扱い
- [Cloudflare Workers - Compatibility Flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) -- allow_eval_during_startup の説明
