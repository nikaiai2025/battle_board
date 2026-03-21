---
task_id: TASK-242
sprint_id: Sprint-84
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T19:30:00+09:00
updated_at: 2026-03-21T19:30:00+09:00
locked_files:
  - wrangler.toml
  - build-cf.mjs
  - src/cf-scheduled.ts
---

## タスク概要

本番障害（CF Workers Error 1101）の修正。`src/cf-scheduled.ts` の `new Function()` が Workers ランタイムで禁止されているため全リクエストが例外をスローしている。wrangler.toml の main を戻し、build-cf.mjs のビルド後処理で scheduled ハンドラを注入する方式（方針C）に変更する。

## 障害原因

`tmp/workers/bdd-architect_TASK-238/analysis.md` に詳細分析あり。要約:
1. `new Function("m", "return import(m)")` が Workers ランタイム (workerd) のセキュリティ制約に違反
2. 動的import内の文字列は esbuild の静的解析対象外でバンドルに含まれない
3. 相対パスも `src/` からの解決になり不正

## 必読ドキュメント
1. [必須] `tmp/workers/bdd-architect_TASK-238/analysis.md` §3 方針C — 修正方針の全詳細
2. [必須] `build-cf.mjs` — ビルド後処理の追加先
3. [必須] `wrangler.toml` — main の復元
4. [参考] `src/cf-scheduled.ts` — 削除対象

## 実装内容

### 1. wrangler.toml の main を復元

```toml
# 変更前（障害原因）
main = "src/cf-scheduled.ts"

# 変更後
main = ".open-next/worker.js"
```

`[triggers]` セクション（`crons = ["*/5 * * * *"]`）はそのまま残す。

### 2. build-cf.mjs にカスタムワーカー生成処理を追加

分析書 §3 方針C の実装案に従い、ファイル末尾（既存のポストプロセス処理の後）に追加:

```javascript
// ── カスタムワーカー生成（scheduled ハンドラ追加）──────────────────────────
// See: docs/architecture/architecture.md §12.2, TDR-013
const workerPath = path.join(projectRoot, '.open-next', 'worker.js');
const originalWorkerPath = path.join(projectRoot, '.open-next', 'original-worker.js');

if (fs.existsSync(workerPath)) {
  fs.renameSync(workerPath, originalWorkerPath);

  const customWorker = `
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

**注意:** `build-cf.mjs` の既存コードを確認し、`path` と `fs` のimportが既にあることを確認すること。なければ追加する。

### 3. src/cf-scheduled.ts を削除

不要になったファイルを削除する。`git rm src/cf-scheduled.ts`

## 完了条件
- [ ] `wrangler.toml` の `main` が `.open-next/worker.js` に戻っている
- [ ] `build-cf.mjs` にカスタムワーカー生成処理が追加されている
- [ ] `src/cf-scheduled.ts` が削除されている
- [ ] TypeScriptコンパイルが通る（`npx tsc --noEmit`）
- [ ] 既存テスト全PASS（`npx vitest run`）

## スコープ外
- ローカルでの `wrangler dev --test-scheduled` 動作確認（デプロイ後に確認）
- scheduled ハンドラの機能テスト（デプロイ後のスモークテストで確認）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全3ステップ
- 次にすべきこと: なし（デプロイ後のスモークテストはスコープ外）
- 未解決の問題: なし

### 進捗ログ

1. `wrangler.toml`: `main = "src/cf-scheduled.ts"` → `main = ".open-next/worker.js"` に復元
2. `scripts/build-cf.mjs`: 末尾にカスタムワーカー生成処理を追加（方針C）
   - `.open-next/worker.js` を `.open-next/original-worker.js` にリネーム
   - `original-worker.js` を static import し scheduled ハンドラを追加した新 `worker.js` を生成
3. `src/cf-scheduled.ts`: `git rm` で削除済み

### テスト結果サマリー

- `npx tsc --noEmit`: PASS（エラーなし）
- `npx vitest run`: PASS 78 test files, 1628 tests 全て通過
