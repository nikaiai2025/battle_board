# Cloudflare Pages移行手順書

> TASK-ID: TASK-036 → 実装は TASK-037 で実施
> 前提: migration_feasibility.md の Conditional Go 判定に基づく
> 対象: Next.js 16.1.6 (App Router) の Vercel → Cloudflare Pages 移行

---

## 0. 事前準備

### 0.1 必要なアカウント・リソース

| 項目 | 状態 | 担当 |
|---|---|---|
| Cloudflare アカウント | 要作成（Freeプランで開始可） | 人間 |
| カスタムドメイン | 要取得 | 人間 |
| GitHub リポジトリ アクセス | 既存（Vercelと同じリポジトリ） | - |
| Supabase 本番プロジェクト | 既存（変更なし） | - |

### 0.2 事前に確認すべき環境変数

Vercel ダッシュボードから以下の環境変数の値を控えておく:

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TURNSTILE_SECRET_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
NEXT_PUBLIC_BASE_URL          ← カスタムドメインに変更する
```

---

## 1. ローカル互換性検証（最優先）

移行作業のコード変更を行う前に、ローカルで互換性を検証する。この検証で問題が出た場合は、コード修正のスコープと方針を決定してから先に進む。

### 1.1 パッケージインストール

```bash
npm install -D @opennextjs/cloudflare wrangler
```

`@opennextjs/cloudflare` を第一候補とする。動作しない場合は `@cloudflare/next-on-pages` にフォールバック:

```bash
# フォールバック
npm install -D @cloudflare/next-on-pages wrangler
```

### 1.2 wrangler.toml 作成

プロジェクトルートに `wrangler.toml` を作成する:

```toml
name = "battle-board"
compatibility_date = "2026-03-14"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vercel/output/static"

# @opennextjs/cloudflare 使用時
# pages_build_output_dir は OpenNext のビルド出力に合わせる

[vars]
NEXT_PUBLIC_BASE_URL = "http://localhost:3000"
```

**注意**: `nodejs_compat` フラグが必須。これにより `Buffer`, `crypto` 等の Node.js API が Workers 環境で利用可能になる。

### 1.3 ローカルビルド・動作検証

```bash
# Step 1: Next.js ビルド
npm run build

# Step 2: @opennextjs/cloudflare でアダプター変換
npx opennextjs-cloudflare build
# （@cloudflare/next-on-pages の場合: npx @cloudflare/next-on-pages）

# Step 3: ローカルWorkers環境で起動
npx wrangler pages dev .open-next/assets --compatibility-flags=nodejs_compat
```

### 1.4 検証チェックリスト

以下をcurlで確認する:

```bash
# 1. subject.txt（Shift_JISレスポンス）
curl -s http://localhost:8788/battleboard/subject.txt | xxd | head -5
# → Shift_JIS バイト列が返ること

# 2. DATファイル
curl -s http://localhost:8788/battleboard/dat/1234567890 -o /dev/null -w '%{http_code}'
# → 200 or 404 が返ること（500でないこと）

# 3. .dat拡張子 rewrite
curl -s http://localhost:8788/battleboard/dat/1234567890.dat -o /dev/null -w '%{http_code}'
# → rewriteされて200 or 404 が返ること

# 4. bbs.cgi（POST）
curl -X POST http://localhost:8788/test/bbs.cgi \
  -d 'bbs=battleboard&key=1234567890&MESSAGE=test' \
  -o /dev/null -w '%{http_code}'
# → 200 が返ること

# 5. bbsmenu.html
curl -s http://localhost:8788/bbsmenu.html | xxd | head -5
# → Shift_JIS HTMLが返ること

# 6. bbsmenu.json
curl -s http://localhost:8788/bbsmenu.json | head -1
# → JSONが返ること

# 7. SETTING.TXT
curl -s http://localhost:8788/battleboard/SETTING.TXT | xxd | head -5
# → Shift_JIS テキストが返ること
```

### 1.5 検証失敗時の対応フロー

```
iconv-lite が動作しない
  → encoding-japanese パッケージに切り替え（§2参照）

crypto.createHash が動作しない
  → Web Crypto API に書き換え（§3参照）

Buffer.from が動作しない
  → Uint8Array に書き換え（§4参照）

rewrites が動作しない
  → Workers側のルーティングで代替（§5参照）

Next.js 16.x アダプター自体が動作しない
  → @cloudflare/next-on-pages にフォールバック
  → それでも動作しない場合は No-Go 判定に変更
```

---

## 2. iconv-lite 代替（必要な場合のみ）

`nodejs_compat` で iconv-lite が動作しない場合に実施する。

### 2.1 encoding-japanese への切り替え

```bash
npm install encoding-japanese
npm uninstall iconv-lite
```

### 2.2 ShiftJisEncoder の書き換え

`src/lib/infrastructure/encoding/shift-jis.ts` を以下のように修正:

```typescript
import Encoding from 'encoding-japanese';

export class ShiftJisEncoder {
  encode(text: string): Uint8Array {
    const unicodeArray = Encoding.stringToCode(text);
    const sjisArray = Encoding.convert(unicodeArray, {
      to: 'SJIS',
      from: 'UNICODE',
    });
    return new Uint8Array(sjisArray);
  }

  decode(buffer: Uint8Array | Buffer): string {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const unicodeArray = Encoding.convert(Array.from(uint8), {
      to: 'UNICODE',
      from: 'SJIS',
    });
    return Encoding.codeToString(unicodeArray);
  }
}
```

### 2.3 呼び出し元の修正

`ShiftJisEncoder.encode()` の戻り値が `Buffer` → `Uint8Array` に変わる。Route Handler側で `new Uint8Array(sjisBuffer)` としている箇所は、既に `Uint8Array` なので `sjisBuffer` をそのまま渡すか、念のためそのまま `new Uint8Array()` で wrap する。

`bbs.cgi/route.ts` の `Buffer.from(arrayBuffer)` は `new Uint8Array(arrayBuffer)` に変更する。

---

## 3. crypto 代替（必要な場合のみ）

`nodejs_compat` で `createHash` が動作しない場合に実施する。

### 3.1 daily-id.ts の修正

```typescript
// src/lib/domain/rules/daily-id.ts
export async function generateDailyId(
  authorIdSeed: string,
  boardId: string,
  dateJst: string
): Promise<string> {
  const input = dateJst + boardId + authorIdSeed;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}
```

**影響範囲**: `generateDailyId` が同期→非同期に変わるため、呼び出し元の Service 層で `await` の追加が必要。

### 3.2 auth-service.ts の修正

`hashIp` と認証コード生成を Web Crypto API に書き換える。`crypto.randomInt` は `crypto.getRandomValues` に置換。

---

## 4. Buffer 代替（必要な場合のみ）

### 4.1 bbs.cgi/route.ts

```typescript
// Before
bodyBuffer = Buffer.from(arrayBuffer);

// After
const uint8Body = new Uint8Array(arrayBuffer);
```

`ShiftJisEncoder.decode()` のシグネチャも `Uint8Array` を受けるように統一する。

---

## 5. rewrites 代替（必要な場合のみ）

rewrites が動作しない場合、Cloudflare Pages の `_routes.json` または `functions` ディレクトリでルーティングを制御する。

### 5.1 _routes.json によるリダイレクト

```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": []
}
```

### 5.2 ミドルウェアによるリライト

Next.js の `middleware.ts` でrewriteを実装する:

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // /{boardId}/dat/{threadKey}.dat → /{boardId}/dat/{threadKey}
  const datMatch = pathname.match(/^\/([^/]+)\/dat\/([^/]+)\.dat$/);
  if (datMatch) {
    return NextResponse.rewrite(new URL(`/${datMatch[1]}/dat/${datMatch[2]}`, req.url));
  }

  // /{boardId}/kako/{x}/{y}/{threadKey}.dat → /{boardId}/dat/{threadKey}
  const kakoMatch = pathname.match(/^\/([^/]+)\/kako\/[^/]+\/[^/]+\/([^/]+)\.dat$/);
  if (kakoMatch) {
    return NextResponse.rewrite(new URL(`/${kakoMatch[1]}/dat/${kakoMatch[2]}`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/:boardId/dat/:path*.dat', '/:boardId/kako/:path*'],
};
```

---

## 6. Cloudflare Pages プロジェクト作成・デプロイ

### 6.1 Cloudflare ダッシュボードでプロジェクト作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. Workers & Pages > Create application > Pages
3. Connect to Git > GitHub リポジトリを選択
4. Build configuration:
   - **Framework preset**: Next.js
   - **Build command**: `npx opennextjs-cloudflare build` (または `npx @cloudflare/next-on-pages`)
   - **Build output directory**: `.open-next/assets` (OpenNextの場合。next-on-pagesの場合は `.vercel/output/static`)
5. Environment variables を設定（§0.2 参照）

### 6.2 環境変数設定

Cloudflare Pages ダッシュボード > Settings > Environment variables:

| 変数名 | 値 | 暗号化 |
|---|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | No |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Yes (Encrypt) |
| `TURNSTILE_SECRET_KEY` | `0x...` | Yes (Encrypt) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0x...` | No |
| `NEXT_PUBLIC_BASE_URL` | `http://battleboard.example.com` | No |
| `NODE_ENV` | `production` | No |

**注意**: `NEXT_PUBLIC_BASE_URL` は **`http://`** にする（HTTPS ではなく）。ChMate がHTTP:80で接続するため、bbsmenu.html 等のベースURLがHTTPである必要がある。ただし、Webブラウザ用途では HTTPS が望ましいため、この点は設計上の検討が必要。

---

## 7. カスタムドメイン設定・HTTP:80 有効化

### 7.1 Cloudflare DNSにドメイン追加

1. Cloudflare ダッシュボード > Add a Site > ドメインを入力
2. DNS Plan: Free を選択
3. レジストラ側でネームサーバーを Cloudflare 指定のものに変更

### 7.2 Pages にカスタムドメインを割り当て

1. Cloudflare ダッシュボード > Workers & Pages > battle-board > Custom domains
2. Set up a custom domain > ドメイン名を入力
3. Cloudflare が自動的に CNAME レコードを作成

### 7.3 HTTP:80 有効化設定

ドメインのゾーン設定で以下を変更:

| 設定項目 | パス | 値 |
|---|---|---|
| SSL/TLS encryption mode | SSL/TLS > Overview | **Flexible** |
| Always Use HTTPS | SSL/TLS > Edge Certificates | **OFF** |
| Automatic HTTPS Rewrites | SSL/TLS > Edge Certificates | **OFF** |
| HSTS | SSL/TLS > Edge Certificates | **Disabled** |

### 7.4 Configuration Rules（推奨: 部分的HTTP許可）

Web ブラウザからのアクセスはHTTPSが望ましいため、専ブラ用パスのみHTTPを許可する構成を検討:

1. Rules > Configuration Rules > Create rule
2. Condition: `User-Agent` contains `Monazilla` OR `2chMate`
3. Action: SSL = Off (HTTP許可)

ただし、ChMateは `bbsmenu.html` 取得時はWebViewを使い、その後のリクエストでは `Monazilla` User-Agentを使うため、User-Agent判定は有効。

**より簡素なアプローチ**: 全体で「Always Use HTTPS」をOFFにして運用する。Webブラウザは自発的にHTTPSで接続するため、実害は少ない。

---

## 8. 動作確認チェックリスト

### 8.1 Cloudflare Pages デプロイ後

- [ ] `https://battle-board.pages.dev/` でWeb UIが表示される
- [ ] `https://battle-board.pages.dev/battleboard/subject.txt` でShift_JISレスポンスが返る
- [ ] `https://battle-board.pages.dev/battleboard/dat/{threadKey}.dat` でDATが返る

### 8.2 カスタムドメイン設定後

- [ ] `https://battleboard.example.com/` でWeb UIが表示される
- [ ] `http://battleboard.example.com/battleboard/subject.txt` でShift_JISレスポンスが返る（HTTP:80）
- [ ] `http://battleboard.example.com/battleboard/dat/{threadKey}.dat` でDATが返る（HTTP:80）
- [ ] HTTP:80リクエストが308リダイレクトされ**ない**ことを確認

### 8.3 専ブラ実機テスト

- [ ] ChMate: bbsmenu登録 → スレッド一覧表示 → スレッド閲覧
- [ ] ChMate: 書き込み（認証フローを含む）
- [ ] Siki: bbsmenu登録 → スレッド一覧表示 → スレッド閲覧 → 書き込み

### 8.4 回帰テスト

- [ ] `npx vitest run` — 単体テスト全パス
- [ ] `npx cucumber-js` — BDDテスト全パス
- [ ] `npx playwright test --project=api` — APIテスト全パス

---

## 9. Vercel → Cloudflare 切り替え手順（ダウンタイム最小化）

### 9.1 並行運用期間

1. **Cloudflare Pages にデプロイ**（`*.pages.dev` ドメインで動作確認）
2. **カスタムドメインを Cloudflare に設定**（この時点では Vercel のデプロイも維持）
3. **DNS レコードの TTL を 60秒に短縮**（切替24時間前）
4. **DNS を Cloudflare Pages に向ける**（CNAME / A レコード変更）
5. **動作確認**（チェックリスト §8 を実施）
6. **Vercel のデプロイを無効化**（問題なければ1週間後）

### 9.2 切り戻し手順

問題が発生した場合:
1. DNS レコードを Vercel に戻す（TTL 60秒なので1分以内に反映）
2. Cloudflare Pages のデプロイは維持（再挑戦用）

### 9.3 GitHub Actions への影響

- `bot-scheduler.yml` と `daily-maintenance.yml` のAPIエンドポイントURLを新ドメインに変更する
- 環境変数 `NEXT_PUBLIC_BASE_URL` も新ドメインに合わせて更新する

---

## 10. package.json スクリプト変更

```json
{
  "scripts": {
    "build:cf": "npx opennextjs-cloudflare build",
    "preview:cf": "npx wrangler pages dev .open-next/assets --compatibility-flags=nodejs_compat",
    "deploy:cf": "npx wrangler pages deploy .open-next/assets"
  }
}
```

既存の `dev`, `build`, `start` はローカル開発用に維持する。

---

## 11. CLAUDE.md / architecture.md への反映（移行完了後）

移行完了後、以下のドキュメントの更新が必要:

| ドキュメント | 変更内容 |
|---|---|
| `CLAUDE.md` | 横断的制約のインフラ記述を「Vercel + Supabase」→「Cloudflare Pages + Supabase」に変更 |
| `docs/architecture/architecture.md` | §2 インフラストラクチャ構成の全体構成図・構成要素表を更新 |
| `docs/architecture/architecture.md` | §2.4 環境戦略の本番欄を更新 |
| `docs/architecture/architecture.md` | §11.1 キャッシュ戦略の「Vercel Edge Cache」を更新 |

**注意**: CLAUDE.mdの変更はエスカレーション対象（横断的制約の変更）。人間の承認を得てから変更する。
