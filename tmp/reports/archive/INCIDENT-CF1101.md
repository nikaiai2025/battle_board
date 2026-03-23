# INCIDENT-CF1101: Cloudflare Workers Error 1101

## 概要

| 項目 | 内容 |
|---|---|
| 発生日時 | 2026-03-19 (最新CFデプロイ 2026-03-18T21:21:31Z 以降) |
| 影響範囲 | 全ページ・全APIエンドポイント (Workers起動時に即座に例外) |
| HTTP応答 | 500 (Cloudflare Error 1101: Worker threw a JavaScript exception) |
| 原因コミット | `4cffffb` (Next.js 16.1.6 -> 16.2.0 アップグレード) |

## 症状

battle-board.shika.workers.dev への全リクエストが Error 1101 を返す。

## 原因

### 直接原因

Next.js 16.2.0 で新たに導入された `prefetch-hints.json` マニフェストファイルを、
@opennextjs/cloudflare 1.17.1 の `loadManifest` パッチが認識できず、
Worker起動時（`NextNodeServer` コンストラクタ内）に未捕捉例外がスローされる。

### 例外メッセージ (wrangler tail で取得)

```
Error: Unexpected loadManifest(/.next/server/prefetch-hints.json) call!
    at loadManifest (worker.js:13724:15)
    at NextNodeServer.getPrefetchHints (worker.js:87177:142)
    at new NextNodeServer (worker.js:86921:114)
```

### 技術的詳細

1. **Next.js 16.2.0 の変更:**
   `NextNodeServer` のコンストラクタに `getPrefetchHints()` の呼び出しが追加された。
   この関数は `loadManifest("/.next/server/prefetch-hints.json", true, undefined, false, true)` を呼ぶ。
   第5引数 `handleMissing=true` により、通常の Node.js 環境ではファイルが無くてもクラッシュしない設計。

2. **@opennextjs/cloudflare 1.17.1 の `loadManifest` パッチ:**
   - Cloudflare Workers では `readFileSync` が使えないため、`loadManifest` をビルド時にインライン化するパッチが適用される
   - パッチは `.open-next/server-functions/default/.next/` 配下の JSON を glob で収集し、`if ($PATH.endsWith("...")) return {...};` の連鎖で置き換える
   - **glob パターンが `**/{*-manifest,required-server-files}.json` のため、`prefetch-hints.json` がマッチしない**
   - 結果、インライン化された `loadManifest` は `prefetch-hints.json` に対して `throw new Error(...)` に到達する
   - Next.js側の `handleMissing` 引数は、パッチによって完全に無視される

3. **該当ファイル:**
   `node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js` (32行目)

## 対応方針の提案

### 方針A: Next.js を 16.1.6 にダウングレード (推奨・即効性あり)

```json
"next": "16.1.6"
```

- 最も確実で低リスク
- @opennextjs/cloudflare 側の対応を待ってから再度アップグレードすればよい
- npm install -> build -> deploy で即座に復旧可能

### 方針B: @opennextjs/cloudflare の loadManifest パッチを build-cf.mjs 内で修正

`build-cf.mjs` にポストビルドフックを追加し、
`.open-next` 内のバンドル済み `worker.js` で `loadManifest` のフォールバックを
`throw new Error(...)` から `return {}` に書き換える。

- Next.js 16.2.0 を維持できる
- ただし @opennextjs/cloudflare の内部実装に依存するハックであり、保守性が低い
- 今後のバージョンアップで再び壊れるリスクがある

### 方針C: @opennextjs/cloudflare のアップデートを待つ

- npm 上の最新は 1.17.1 (2026-03-20 時点)
- GitHub issue / PR で対応状況を確認する必要がある
- 本番障害が継続するため待つ選択肢は実質的にない

### 推奨

**方針A (ダウングレード)** を即座に実行し、本番を復旧させる。
その後、@opennextjs/cloudflare の対応状況を監視し、対応版がリリースされた時点で再アップグレードする。

## 収集ログ

### wrangler tail 出力 (抜粋)

```json
{
  "outcome": "exception",
  "exceptions": [
    {
      "name": "Error",
      "message": "Unexpected loadManifest(/.next/server/prefetch-hints.json) call!",
      "stack": "at loadManifest (worker.js:13724:15)\nat NextNodeServer.getPrefetchHints (worker.js:87177:142)\nat new NextNodeServer (worker.js:86921:114)"
    }
  ],
  "event": {
    "request": { "url": "https://battle-board.shika.workers.dev/api/threads/..." },
    "response": { "status": 500 }
  }
}
```
