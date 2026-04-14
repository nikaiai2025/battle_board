# WikipediaAdapter クラス設計書

> 対象ファイル: `src/lib/collection/adapters/wikipedia.ts`（新規作成）
> 関連設計書: `design.md` §2〜§9
> BDD正本: `features/curation_bot.feature` v4

---

## 1. 責務

Wikimedia pageviews top API から ja.wikipedia の日次急上昇記事 Top6（メタページ除外後）を取得し、`CollectedItem[]` に変換して返す。

---

## 2. ファイル冒頭のヘッダコメント（実装時にコピー可能）

```typescript
/**
 * WikipediaAdapter — Wikimedia pageviews top API 収集アダプター
 *
 * ja.wikipedia の日次急上昇記事 Top6（メタページ除外後）を取得する。
 *
 * 処理フロー:
 *   1. UTC 現在時刻から「2日前」の年月日を算出（pageviews の生成遅延対応）
 *   2. Wikimedia pageviews top API を呼び出し、articles 配列を取得
 *   3. 404 の場合は「3日前」で再試行（1段フォールバック）
 *   4. メタページ（メインページ / 特別: / Wikipedia: 等）を除外
 *   5. 先頭から 6件を CollectedItem[] に変換して返す
 *
 * エラーハンドリング:
 *   - 2日前・3日前ともに 404: 例外をスロー
 *   - 429 / 5xx: 即座に例外をスロー（リトライしない）
 *   - タイムアウト: AbortController で 10秒打ち切り
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5
 * See: tmp/workers/bdd-architect_TASK-379/design.md
 */
```

---

## 3. 依存型・依存関数

### 3.1 既存インポート

```typescript
import type { CollectedItem } from "../../services/bot-strategies/types";
import type { CollectionAdapter, SourceConfig } from "./types";
```

### 3.2 新規定義（ファイル内）

```typescript
/** API レスポンスの articles 配列要素 */
interface WikipediaArticle {
  article: string;
  views: number;
  rank: number;
}

/** API レスポンストップレベル */
interface WikipediaTopResponse {
  items: Array<{
    project: string;
    access: string;
    year: string;
    month: string;
    day: string;
    articles: WikipediaArticle[];
  }>;
}

/**
 * fetchJson の型。
 * 本番では default 実装が fetch + タイムアウト + User-Agent 付与を行う。
 * テスト時はコンストラクタ経由でモック注入する（単体テスト戦略は test_strategy.md 参照）。
 *
 * @returns
 *   - ok:    HTTP 2xx のとき true
 *   - status: HTTP ステータスコード
 *   - body:  JSON パース結果（ok=false でもパース可能なら含む。失敗時は null）
 */
export type FetchJsonFn = (url: string) => Promise<{
  ok: boolean;
  status: number;
  body: WikipediaTopResponse | null;
}>;
```

---

## 4. 定数

```typescript
// ---------------------------------------------------------------------------
// メタページ除外定数
// See: design.md §6
// ---------------------------------------------------------------------------

/** 完全一致で除外（メインページ系） */
const EXACT_EXCLUDES: ReadonlySet<string> = new Set([
  "メインページ",
  "Main_Page",
]);

/** プレフィックス一致で除外（名前空間プレフィックス） */
const PREFIX_EXCLUDES: readonly string[] = [
  "特別:",
  "Special:",
  "Wikipedia:",
  "ヘルプ:",
  "Help:",
  "Category:",
  "カテゴリ:",
  "File:",
  "ファイル:",
  "Talk:",
  "ノート:",
  "Template:",
  "Portal:",
  "ポータル:",
  "利用者:",
  "User:",
];

/** 収集件数上限（メタページ除外後の先頭N件） */
const TOP_LIMIT = 6;

/** API タイムアウト（ミリ秒） */
const FETCH_TIMEOUT_MS = 10_000;

/** ja.wikipedia のWeb URL 構築ベース */
const JA_WIKI_BASE = "https://ja.wikipedia.org/wiki/";

/** User-Agent 既定の連絡先（WIKIMEDIA_CONTACT 未設定時のフォールバック）*/
const DEFAULT_CONTACT = "bot-ops@example.com";
```

---

## 5. プライベート純粋関数（すべて export して単体テスト可能にする）

### 5.1 `isMetaPage`

```typescript
/**
 * article 名がメタページ（百科事典記事以外）かどうかを判定する。
 * 完全一致 + プレフィックス一致のハイブリッド。
 *
 * See: design.md §6
 */
export function isMetaPage(article: string): boolean {
  if (EXACT_EXCLUDES.has(article)) return true;
  return PREFIX_EXCLUDES.some((p) => article.startsWith(p));
}
```

**テスト観点:** 代表的なメタページ文字列を each で流し、全て `true`。通常記事は全て `false`。

### 5.2 `buildApiUrl`

```typescript
/**
 * Wikimedia pageviews top API の URL を組み立てる。
 *
 * @param baseUrl - プロファイルの source_url（例: "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access"）
 * @param year    - 4桁年（例: 2026）
 * @param month   - 2桁月（例: "04"）
 * @param day     - 2桁日（例: "12"）
 */
export function buildApiUrl(
  baseUrl: string,
  year: number,
  month: string,
  day: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/${year}/${month}/${day}`;
}
```

**テスト観点:** baseUrl の末尾スラッシュ有無で URL が崩れないこと。

### 5.3 `getTargetDateUtc`

```typescript
/**
 * UTC 現在時刻から N 日前の年月日を返す。
 * Wikimedia の pageviews は UTC 基準で日次集計され、生成遅延があるため
 * N=2（2日前）を標準パス、N=3 をフォールバックに使う。
 *
 * See: design.md §2.2, §5.3
 *
 * @returns { year: number, month: string（MM）, day: string（DD） }
 */
export function getTargetDateUtc(
  nowUtcMs: number,
  daysAgo: number,
): { year: number; month: string; day: string } {
  const target = new Date(nowUtcMs - daysAgo * 24 * 60 * 60 * 1000);
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, "0");
  const day = String(target.getUTCDate()).padStart(2, "0");
  return { year, month, day };
}
```

**テスト観点:** 月境界（3/1 における 2日前 = 2/27 または 2/28 の閏年含む）、年境界、UTC/JST 混同が起きないこと。

### 5.4 `buildUserAgent`

```typescript
/**
 * User-Agent ヘッダ文字列を組み立てる。
 * Wikimedia User-Agent Policy 準拠:
 *   <client name>/<version> (<contact info>) <library name>/<version>
 *
 * See: design.md §7
 *
 * @param contact - 連絡先メールアドレス（process.env.WIKIMEDIA_CONTACT）。
 *                  未指定時は DEFAULT_CONTACT にフォールバック。
 */
export function buildUserAgent(contact?: string | null): string {
  const effectiveContact = contact && contact.trim() !== ""
    ? contact.trim()
    : DEFAULT_CONTACT;
  return `BattleBoard/1.0 (+https://github.com/nikaiai2025/battle_board; ${effectiveContact}) curation-bot/1.0`;
}
```

**テスト観点:** `undefined` / `null` / 空文字 / 実在値の4ケースで適切にフォールバックすること。`"bot"` 文字列が含まれること。

### 5.5 `articleToCollectedItem`

```typescript
/**
 * Wikimedia API の1記事を CollectedItem に変換する。
 *
 * See: design.md §9
 *
 * - article_title: アンダースコアを半角スペースに置換（人間可読化）
 * - source_url:    https://ja.wikipedia.org/wiki/{encodeURIComponent(article)}
 *                  （API の article は既にスペース→アンダースコア変換済み）
 * - buzz_score:    views をそのまま採用（design.md §3）
 */
export function articleToCollectedItem(
  article: WikipediaArticle,
): CollectedItem {
  const normalized = article.article.replace(/ /g, "_"); // 念のため
  return {
    articleTitle: article.article.replace(/_/g, " "),
    sourceUrl: `${JA_WIKI_BASE}${encodeURIComponent(normalized)}`,
    buzzScore: article.views,
  };
}
```

**テスト観点:**
- `田中敦子_(声優)` → title: `田中敦子 (声優)`, url 末尾: `%E7%94%B0%E4%B8%AD%E6%95%A6%E5%AD%90_(%E5%A3%B0%E5%84%AA)`
- buzzScore === views（整数）

### 5.6 `defaultFetchJson`

```typescript
/**
 * デフォルトの fetchJson 実装。
 * User-Agent を付与し、10秒タイムアウト、JSON レスポンスをパース。
 *
 * See: design.md §5.4, §7
 */
export async function defaultFetchJson(
  url: string,
  contact?: string | null,
): Promise<{
  ok: boolean;
  status: number;
  body: WikipediaTopResponse | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": buildUserAgent(contact),
        Accept: "application/json",
      },
    });
    let body: WikipediaTopResponse | null = null;
    try {
      body = (await response.json()) as WikipediaTopResponse;
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}
```

**テスト観点:** 実装本体は単体テストしない（fetch を触るため）。`WikipediaAdapter` のテストでは `fetchJsonFn` を注入し、この実装をバイパスする。

---

## 6. `WikipediaAdapter` クラス

```typescript
export class WikipediaAdapter implements CollectionAdapter {
  private readonly fetchJson: FetchJsonFn;
  private readonly nowUtcMs: () => number;

  /**
   * @param fetchJsonFn - テスト時に注入するフェッチ関数。省略時は defaultFetchJson を process.env.WIKIMEDIA_CONTACT と合わせて呼ぶ実装を使用。
   * @param nowUtcMsFn  - テスト時に注入する現在時刻関数。省略時は Date.now() を使用。
   */
  constructor(
    fetchJsonFn?: FetchJsonFn,
    nowUtcMsFn?: () => number,
  ) {
    this.fetchJson = fetchJsonFn ?? ((url) => defaultFetchJson(url, process.env.WIKIMEDIA_CONTACT));
    this.nowUtcMs = nowUtcMsFn ?? (() => Date.now());
  }

  async collect(config: SourceConfig): Promise<CollectedItem[]> {
    const articles = await this.fetchWithFallback(config.sourceUrl);
    const filtered = articles.filter((a) => !isMetaPage(a.article));
    const top = filtered.slice(0, TOP_LIMIT);
    return top.map(articleToCollectedItem);
  }

  /**
   * UTC 2日前・3日前の順で API を呼び、最初に成功した日付の articles を返す。
   * See: design.md §5.3
   */
  private async fetchWithFallback(
    baseUrl: string,
  ): Promise<WikipediaArticle[]> {
    const attempts: number[] = [2, 3];
    let last404: string | null = null;

    for (const daysAgo of attempts) {
      const { year, month, day } = getTargetDateUtc(this.nowUtcMs(), daysAgo);
      const url = buildApiUrl(baseUrl, year, month, day);
      const res = await this.fetchJson(url);

      if (res.status === 404) {
        last404 = url;
        continue; // フォールバックへ
      }
      if (!res.ok || !res.body) {
        throw new Error(
          `Wikimedia API error: url=${url} status=${res.status}`,
        );
      }
      const articles = res.body.items?.[0]?.articles;
      if (!Array.isArray(articles)) {
        throw new Error(
          `Wikimedia API: 予期しないレスポンス構造 url=${url}`,
        );
      }
      return articles;
    }

    throw new Error(
      `Wikimedia API: 2日前・3日前ともデータ未生成（最終404: ${last404}）`,
    );
  }
}
```

---

## 7. クラス図（テキスト）

```
CollectionAdapter (interface)
    |
    +-- SubjectTxtAdapter   (Phase A 既存)
    |       - fetchText: FetchTextFn
    |       + collect(config)
    |
    +-- WikipediaAdapter    (Phase B 新規)
            - fetchJson: FetchJsonFn
            - nowUtcMs: () => number
            + collect(config)
            - fetchWithFallback(baseUrl)

純粋関数（export + 単体テスト対象）:
    isMetaPage(article: string): boolean
    buildApiUrl(baseUrl, year, month, day): string
    getTargetDateUtc(nowUtcMs, daysAgo): { year, month, day }
    buildUserAgent(contact?): string
    articleToCollectedItem(article): CollectedItem

I/O 依存関数（defaultFetchJson 本体は単体テスト対象外）:
    defaultFetchJson(url, contact?): Promise<{ ok, status, body }>
```

---

## 8. 依存方向（Source_Layout.md 準拠）

```
src/lib/collection/adapters/wikipedia.ts
  ↓ import type
src/lib/services/bot-strategies/types.ts   (CollectedItem)
src/lib/collection/adapters/types.ts        (CollectionAdapter, SourceConfig)

依存なし:
  - src/lib/infrastructure/*  （直接 Supabase 呼ばない）
  - src/lib/domain/*          （buzz-score.ts は使わない — Wikipedia は views を直接採用）
```

`src/lib/collection/adapters/` はインフラ寄り（外部 API 呼び出し）だが、既存 `subject-txt.ts` も同じ層に配置されているため踏襲する。純粋関数（`isMetaPage` 等）は domain/rules に分離することも検討したが、`WikipediaAdapter` 専用ロジックのため同ファイル内に置くほうが凝集度が高い。Phase A も同構造（`parseSubjectTxt` は `subject-txt.ts` 内）。

---

## 9. 実装時の注意点（bdd-coding TASK-381 向け）

### 9.1 TypeScript エラー回避

- `fetch` の戻り値型は `Response` で、`signal` プロパティは型的に問題なし
- `AbortController` は Node 18+ で標準利用可能（`npm` の `package.json` で Node 20 を前提としているため OK）

### 9.2 Vitest のモック注入

以下のように `FetchJsonFn` を直接渡すのが最もシンプル。`vi.fn().mockResolvedValue(...)` でレスポンス固定。

```typescript
const mockFetch = vi.fn<FetchJsonFn>().mockResolvedValue({
  ok: true,
  status: 200,
  body: fixture, // JSON フィクスチャ
});
const adapter = new WikipediaAdapter(mockFetch, () => Date.UTC(2026, 3, 14));
```

### 9.3 フィクスチャの配置

`src/__tests__/lib/collection/adapters/fixtures/wikipedia_top_ja_2026_04_12.json` に実 API 出力の先頭 50 件程度を保存。`import fixture from "./fixtures/..."` で取り込む（`tsconfig.json` の `resolveJsonModule: true` が有効か要確認）。

### 9.4 User-Agent の検証

`defaultFetchJson` を単体テストで直接テストすると実 fetch が走るため NG。代替として:

- `buildUserAgent` 関数の単体テストで文字列構築ロジックを網羅検証
- `WikipediaAdapter` 側は `fetchJsonFn` 注入によりヘッダ送信を迂回

### 9.5 既存 `SubjectTxtAdapter` のパターンとの差分

- `fetchText: FetchTextFn` → `fetchJson: FetchJsonFn` に型名を変更（JSON 専用）
- `calculateBuzzScore` は使わない（views を直接採用）
- Shift_JIS デコードは不要（JSON は UTF-8）

---

## 10. 実装量の目安

- `wikipedia.ts`: 約 200〜250 行（コメント込み）
- `wikipedia.test.ts`: 約 300〜400 行（10〜15 テストケース）
- `fixtures/wikipedia_top_ja_2026_04_12.json`: 約 100 行（top 50 件）

想定実装時間: **3〜4時間**（bdd-coding AI にとって）
