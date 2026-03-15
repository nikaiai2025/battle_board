# Cloudflare Pages移行 フィージビリティ調査結果

> TASK-ID: TASK-036
> 調査日: 2026-03-14
> 調査対象: Next.js 16.1.6 (App Router) アプリのVercel → Cloudflare Pages移行

---

## Go/No-Go 判定

### **判定: Conditional Go（条件付きGo）**

移行は技術的に実現可能だが、複数のコード修正が必須であり、リスクの高い箇所が存在する。移行前にローカルでの動作検証（`wrangler pages dev`）を必ず実施すること。

**移行の動機（recap）**: ChMateの5chプロトコルHTTPクライアントがHTTP:80で接続するが、VercelはHTTP:80を308リダイレクトで強制HTTPS化するため、ChMateからの接続が不可能。Cloudflare Pagesではカスタムドメイン + 「Always Use HTTPS」OFF設定でHTTP:80リクエストを直接受け付けることが可能。

---

## 調査結果サマリ

| # | 調査項目 | 結果 | リスク |
|---|---|---|---|
| 1 | Next.js 16.x App Router互換性 | **要確認** | High |
| 2 | iconv-lite Workers互換性 | **非互換 — 代替手段あり** | High |
| 3 | HTTP:80 制御 | **対応可能** | Low |
| 4 | next.config.ts rewrites | **対応可能（制約あり）** | Medium |
| 5 | Supabase JS Client Workers互換性 | **互換** | Low |
| 6 | Node.js `crypto` モジュール | **要修正** | High |
| 7 | `Buffer` API | **要修正** | Medium |
| 8 | `process.env` | **互換** | Low |

---

## 1. Next.js App Router互換性

### 現状

Cloudflare Pagesで Next.js を動かすためのアダプターは以下の2系統がある:

| パッケージ | 状態 | Next.js 16.x対応 |
|---|---|---|
| `@cloudflare/next-on-pages` | 安定版。Next.js 14/15で実績多数 | 16.x対応は公式未明言。GitHub Issuesで要確認 |
| `@opennextjs/cloudflare` (OpenNext) | 後継。Cloudflare公式推奨へ移行中 | より積極的に最新Next.jsを追跡 |

### 技術的判断

Next.js 16.1.6は2026年リリースのため、`@cloudflare/next-on-pages` の対応状況は流動的。以下の点で互換性問題が発生する可能性がある:

- **App Router の `route.ts`**: 基本的に対応済み（Edge Runtime互換のRoute Handlerとして動作）
- **動的ルート `[boardId]`, `[threadKey]`**: 対応済み
- **`export const dynamic = 'force-dynamic'`**: 対応済み（明示的にEdge Runtimeとして扱われる）
- **`headers()` によるリクエストヘッダ読み取り**: 対応済み
- **`NextRequest` / `NextResponse`**: 対応済み（Web標準APIベース）
- **`params` の `Promise` 化（Next.js 15+）**: アダプターが追従していれば問題なし

### リスク: **High**

Next.js 16.x がリリースから日が浅い場合、アダプターが未対応のbreaking changeがある可能性がある。`@opennextjs/cloudflare` の方が追従が早い傾向にあるため、こちらを第一候補とする。

### 検証方法

移行作業の最初のステップとして `npx wrangler pages dev` でローカル動作確認を行い、互換性を実証する。

---

## 2. iconv-lite Workers環境互換性

### 現状

`iconv-lite` v0.7.2 は Node.js の `Buffer` API に深く依存している。Cloudflare Workers環境は `Buffer` を **部分的にしか提供しない**（Node.js互換フラグ `nodejs_compat` で一部利用可能だが完全互換ではない）。

### 問題の詳細

`iconv-lite` の内部実装:
- `Buffer.alloc()`, `Buffer.from()` を多用
- `Buffer.isBuffer()` による型チェック
- `Buffer` のプロトタイプメソッド（`slice`, `toString` 等）に依存
- ストリーム系API（`iconv.decodeStream`）はNode.js Streamに依存

### Workers環境での動作可否

`nodejs_compat` フラグを有効にした場合:
- `Buffer` の基本操作は利用可能になる
- **しかし**、iconv-liteが内部で使う `Buffer` の全APIが完全互換であるかは保証されない
- 特にエンコーディングテーブル（CP932のマッピングテーブル）のロードに問題が出る可能性がある

### 代替手段

| 代替案 | 実現性 | 備考 |
|---|---|---|
| A. `nodejs_compat` + `nodejs_compat_v2` フラグで iconv-lite をそのまま使う | 中 | Workers Runtimeの Node.js 互換層が `Buffer` を十分サポートしていれば動作する。要実機検証 |
| B. Web標準 `TextDecoder` / `TextEncoder` で Shift_JIS 対応 | 高 | `TextDecoder('shift_jis')` はブラウザ/Workers環境で標準サポート。**ただしエンコード（UTF-8→Shift_JIS）は `TextEncoder` では不可**（UTF-8のみ） |
| C. 自前のShift_JIS エンコーダーを実装 | 中 | CP932マッピングテーブルをJSオブジェクトとして持ち、`Uint8Array` で出力。iconv-liteの巨大な依存を避けられる |
| D. `encoding-japanese` パッケージを使用 | 高 | 純粋JSで実装されたエンコーダー。`Buffer` 非依存で `Uint8Array` ベース。Workers環境で動作する可能性が高い |

### 推奨

**案A（`nodejs_compat` でiconv-liteをそのまま使う）を最初に検証し、失敗した場合は案D（`encoding-japanese`）へフォールバック。**

案Bは**デコード（Shift_JIS→UTF-8）のみ**で使えるが、エンコード（UTF-8→Shift_JIS）に対応しないため、本プロジェクトでは不十分。専ブラへのレスポンスは全てUTF-8→Shift_JISエンコードが必要なため。

### リスク: **High**

iconv-liteが動作しない場合、専ブラ互換APIの全エンドポイント（subject.txt, .dat, SETTING.TXT, bbsmenu.html, bbs.cgi）が影響を受ける。移行の成否を左右するクリティカルパス。

---

## 3. HTTP:80 制御

### Cloudflare Pagesでの制御方法

1. **カスタムドメインを設定する**（Cloudflare DNS管理下に置く）
2. **SSL/TLS設定を「Flexible」にする**
   - ブラウザ/クライアント → Cloudflare: HTTP/HTTPS 両方受付
   - Cloudflare → Origin（Pages）: HTTPS
3. **「Always Use HTTPS」をOFFにする**
   - デフォルトでON（HTTP→HTTPSリダイレクト）
   - OFFにするとHTTP:80リクエストがリダイレクトされずにアプリケーションに到達する
4. **「Automatic HTTPS Rewrites」をOFFにする**（念のため）

### 経路図

```
ChMate → HTTP:80 → Cloudflare Edge → Pages Function (Workers Runtime)
                    (リダイレクトなし)
```

Cloudflare Edge がHTTP:80を受け付け、内部的にPages Function（Workers上で動作するNext.jsアプリ）に転送する。アプリケーション側のコードには影響なし。

### 注意点

- **ゾーン単位の設定**: 「Always Use HTTPS」はCloudflareのゾーン（ドメイン）単位の設定。Pages固有の設定ではない
- **Page Rules / Configuration Rules で細かく制御可能**: 特定パス（例: `/battleboard/`）だけHTTP許可し、他はHTTPSリダイレクトという構成も可能
- **SSL証明書**: Cloudflareが自動発行するため追加作業不要

### リスク: **Low**

Cloudflareの標準機能であり、設定変更のみで対応可能。

---

## 4. next.config.ts rewrites の動作可否

### 現在のrewrites設定

```typescript
rewrites: async () => [
  // /{boardId}/dat/{threadKey}.dat → /{boardId}/dat/{threadKey}
  { source: "/:boardId/dat/:threadKey.dat", destination: "/:boardId/dat/:threadKey" },
  // /{boardId}/kako/{x}/{y}/{threadKey}.dat → /{boardId}/dat/{threadKey}
  { source: "/:boardId/kako/:x/:y/:threadKey.dat", destination: "/:boardId/dat/:threadKey" },
],
```

### Workers環境での動作

- `@cloudflare/next-on-pages` / `@opennextjs/cloudflare` は `next.config` の `rewrites` を **ビルド時に解析してWorkers側のルーティングルールに変換する**
- 基本的なパスパラメータ付きrewrites（`:param` 形式）は対応している
- **ただし**、一部の複雑なrewrites（正規表現パターン、`has` 条件付き等）は未対応の場合がある

### 現在のrewritesの複雑度

現在の2つのrewritesルールはシンプルなパスパラメータ置換のみであり、正規表現や条件分岐を使っていないため、問題なく動作する可能性が高い。

### リスク: **Medium**

動作はほぼ確実だが、アダプターのバージョンによってはエッジケースがありうる。ローカル検証で確認可能。

---

## 5. Supabase JS Client Workers互換性

### 現状

`@supabase/supabase-js` v2.98.0 は内部的に `fetch` API を使用してSupabase HTTP APIと通信する。

### Workers環境での互換性

- Cloudflare Workers は `fetch` API をネイティブサポート
- `@supabase/supabase-js` は Web標準APIのみに依存しており、Node.js固有のAPIには依存しない
- Supabase公式ドキュメントでもCloudflare Workers環境での使用を明示的にサポートしている

### 環境変数設定

Cloudflare Pages の環境変数設定:
- Cloudflare ダッシュボード > Pages > Settings > Environment variables
- または `wrangler.toml` の `[vars]` セクション（シークレットは `wrangler secret put` コマンド）

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  (secret)
```

### リスク: **Low**

実績多数。問題は発生しない見込み。

---

## 6. Node.js `crypto` モジュール — 要修正箇所

### 問題箇所

以下の2ファイルが `import { createHash } from 'crypto'` を使用している:

| ファイル | 使用箇所 | 用途 |
|---|---|---|
| `src/lib/domain/rules/daily-id.ts` | `createHash('sha256')` | 日次リセットID生成 |
| `src/lib/services/auth-service.ts` | `createHash('sha512')` | IPハッシュ生成 |
| `src/lib/services/auth-service.ts` | `require('crypto').randomInt` | 認証コード6桁生成 |

### Workers環境での互換性

- `nodejs_compat` フラグを有効にすれば `crypto` モジュールの大部分が利用可能
- **しかし**、`nodejs_compat` なしの場合は完全に動作しない
- Web標準の `crypto.subtle` API（Web Crypto API）は Workers でネイティブサポートされている

### 修正案

`nodejs_compat` フラグを有効にして Node.js `crypto` をそのまま使う（推奨）。
フラグが不十分な場合は Web Crypto API への書き換えが必要:

```typescript
// 修正例: createHash → Web Crypto API
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**注意**: Web Crypto API は**非同期**（`async/await`）であるため、現在の同期関数 `generateDailyId` のシグネチャ変更が必要になる。呼び出し元のService層にも影響が波及する。

### リスク: **High**

`nodejs_compat` で解決できない場合、domain層・service層の複数ファイルに修正が必要。

---

## 7. `Buffer` API — 要修正箇所

### 問題箇所

| ファイル | 使用箇所 |
|---|---|
| `src/app/(senbra)/test/bbs.cgi/route.ts` | `Buffer.from(arrayBuffer)` |
| `src/lib/infrastructure/encoding/shift-jis.ts` | iconv-lite の `encode()` / `decode()` が `Buffer` を返す/受ける |

### Workers環境での互換性

- `nodejs_compat` フラグで `Buffer` が利用可能になる
- iconv-lite問題（調査項目2）と連動

### 修正案

`nodejs_compat` で解決できない場合:
- `Buffer.from(arrayBuffer)` → `new Uint8Array(arrayBuffer)` に置換
- `ShiftJisEncoder` の入出力を `Uint8Array` ベースに変更

### リスク: **Medium**

iconv-lite問題と一体で解決される。

---

## 8. ビルド・デプロイ

### ビルドサイズ制限

| 制約 | 値 | 影響 |
|---|---|---|
| Workers スクリプトサイズ | Free: 1MB / Paid: 10MB | Next.js App Routerのバンドルサイズに注意 |
| Pages デプロイサイズ | 25,000ファイル / 合計500MB | 静的アセット含む |
| Workers KV / R2 | 利用しない | 影響なし |

`@cloudflare/next-on-pages` はNext.jsのビルド出力を個別のWorkers関数に分割するため、1つのRoute Handlerが1MBを超えることは通常ない。ただし、iconv-lite のCP932マッピングテーブルが含まれる場合、サイズが増加する可能性がある。

### GitHub連携

- Cloudflare Pages はGitHubリポジトリと直接連携してビルド・デプロイが可能
- Vercelと同様のGit-driven deploymentワークフロー
- 現在のVercelとの同時接続は可能（DNSの向き先で切り替え）

### リスク: **Low**

---

## リスク一覧（まとめ）

| # | リスク | 影響度 | 発生確率 | 対策 |
|---|---|---|---|---|
| R-1 | Next.js 16.x アダプター未対応 | High | 中 | `@opennextjs/cloudflare` を使用。ローカル検証で事前確認 |
| R-2 | iconv-lite Workers非互換 | High | 高 | `nodejs_compat` で検証 → 失敗時は `encoding-japanese` へ切替 |
| R-3 | Node.js `crypto` Workers非互換 | High | 低 | `nodejs_compat` で解決（高確率で動作） |
| R-4 | `Buffer` API 非互換 | Medium | 低 | `nodejs_compat` で解決 |
| R-5 | rewrites 非互換 | Medium | 低 | ローカル検証で確認。非互換時はWorkers側でルーティング実装 |
| R-6 | ビルドサイズ超過 | Low | 低 | Paidプラン（10MB上限）で対応 |
| R-7 | DNS切替時のダウンタイム | Low | 低 | TTL短縮 + 段階的切替で対応 |

---

## 移行不可の場合の代替案

### 代替案B: Cloudflare Proxy（CDN） + Vercel Origin

Vercelをオリジンとして維持しつつ、Cloudflare CDNを前段に配置する構成。

```
ChMate → HTTP:80 → Cloudflare CDN → HTTPS:443 → Vercel
                    (HTTP受付)         (Origin へ転送)
```

- **メリット**: コード変更不要。Vercelの設定をそのまま維持
- **デメリット**: Vercel非推奨構成。SSL証明書の衝突リスク。Vercelの`x-vercel-protection-bypass` 問題
- **実現性**: 中（動作するが不安定になりうる）

### 代替案C: 専用HTTP:80受付リバースプロキシ

軽量なリバースプロキシ（Cloudflare Worker単体）をHTTP:80で動かし、Vercelにプロキシする。

- **メリット**: Vercelのコードに一切変更不要
- **デメリット**: 運用コンポーネントが増える。レイテンシ増加
- **実現性**: 高（Workers単体なら確実に動作する）

---

## カスタムドメイン要否と設定方針

### 要否: **必須**

Cloudflare PagesでHTTP:80制御を行うには、カスタムドメインが必要。Cloudflare DNSでドメインを管理し、ゾーン設定で「Always Use HTTPS」をOFFにする必要がある。

### 推奨構成

| 項目 | 設定値 |
|---|---|
| ドメイン | 任意の独自ドメイン（例: `battleboard.example.com`） |
| DNS | Cloudflare DNS（ネームサーバーをCloudflareに向ける） |
| SSL/TLS | Flexible |
| Always Use HTTPS | OFF |
| Automatic HTTPS Rewrites | OFF |
| HSTS | OFF（HTTP:80を維持するため） |

### ドメイン取得

ドメインの取得と登録は人間が実施する（TASK-036のスコープ外）。Cloudflare Registrarで直接取得するか、既存のレジストラからネームサーバーをCloudflareに変更する。

---

## 結論

Cloudflare Pages移行は技術的に実現可能だが、`nodejs_compat` フラグの有効化が前提条件となる。最大のリスクは iconv-lite の Workers 互換性であり、移行作業の最初のマイルストーンとして、ローカルでの `wrangler pages dev` による動作検証を実施し、以下の3点を確認する:

1. iconv-lite によるShift_JIS エンコード/デコードが動作するか
2. Node.js `crypto` モジュール（`createHash`）が動作するか
3. `next.config.ts` の rewrites が正しく機能するか

上記3点がクリアできれば、移行作業を進行してよい。1つでも失敗した場合は、代替手段（`encoding-japanese` / Web Crypto API等）の実装を先行する。
