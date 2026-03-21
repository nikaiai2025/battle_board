# マイページ書き込み履歴 ページネーション・検索 コンポーネント設計書

> TASK-237 | Sprint-83
> 作成日: 2026-03-21
> ステータス: 完了

---

## 1. 対象BDDシナリオと実装パス

### 1.1 ページネーション（3シナリオ）

| # | シナリオ | 実装パス |
|---|---|---|
| P-1 | 書き込み履歴が50件以下の場合は全件表示される | API: page=1 → total <= 50 のため totalPages=1。UI: ページネーション非表示 |
| P-2 | 書き込み履歴が50件を超える場合はページネーションで表示される | API: page=1, limit=50 → total=120, totalPages=3。UI: ページネーション表示 |
| P-3 | 2ページ目を表示すると51件目以降が表示される | API: page=2, limit=50 → offset=50。51件目〜100件目を返す |

### 1.2 検索（5シナリオ）

| # | シナリオ | 実装パス |
|---|---|---|
| S-1 | キーワードで書き込み履歴を検索する | API: keyword="BattleBoard" → body ILIKE '%BattleBoard%' でフィルタ |
| S-2 | 日付範囲で書き込み履歴を絞り込む | API: startDate, endDate → created_at >= start AND created_at < end+1day |
| S-3 | キーワードと日付範囲を組み合わせて検索する | API: keyword + startDate + endDate → 両条件の AND |
| S-4 | 検索結果が50件を超える場合はページネーションが適用される | API: keyword 付き + page=1 → 検索結果にもページネーション適用 |
| S-5 | 検索結果が0件の場合はメッセージが表示される | API: keyword="存在しない..." → posts=[], total=0。UI: 「該当する書き込みはありません」 |

---

## 2. API設計

### 2.1 エンドポイント変更

既存の `GET /api/mypage/history` を拡張する（エンドポイント追加ではなく後方互換のパラメータ追加）。

**変更前:**

```
GET /api/mypage/history?limit=50
→ { posts: PostHistoryItem[] }
```

**変更後:**

```
GET /api/mypage/history?page=1&keyword=xxx&start_date=2026-03-10&end_date=2026-03-15
→ { posts: PostHistoryItem[], total: number, totalPages: number, page: number }
```

### 2.2 クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `page` | integer | 1 | ページ番号（1始まり） |
| `keyword` | string | (なし) | 本文部分一致検索。省略時はフィルタなし |
| `start_date` | string (YYYY-MM-DD) | (なし) | 日付範囲の開始日（inclusive） |
| `end_date` | string (YYYY-MM-DD) | (なし) | 日付範囲の終了日（inclusive） |

- `limit` は固定値50とし、クエリパラメータとしては廃止する（BDDシナリオで「50件ずつ」と明示されているため）
- `page` から `offset` を算出する: `offset = (page - 1) * 50`

### 2.3 レスポンス型

```typescript
interface PostHistoryResponse {
  posts: PostHistoryItem[];
  total: number;      // 条件に合致する総件数
  totalPages: number; // ceil(total / 50)
  page: number;       // 現在のページ番号
}
```

### 2.4 バリデーションルール

| パラメータ | バリデーション |
|---|---|
| `page` | 1以上の整数。不正値は1にフォールバック |
| `keyword` | 空文字列は無視（フィルタなし扱い）。最大200文字（過剰な長さ防止） |
| `start_date` | YYYY-MM-DD形式。不正値は無視 |
| `end_date` | YYYY-MM-DD形式。不正値は無視。start_date より前の場合は無視 |

---

## 3. PostRepository変更

### 3.1 ページネーション方式の選定

#### トレードオフ分析: OFFSET/LIMIT vs カーソル方式

| 観点 | OFFSET/LIMIT | カーソル（created_at ベース） |
|---|---|---|
| ページ番号指定 | 自然に対応 | ページ番号の直接指定が困難 |
| 総件数・総ページ数の算出 | 別途 COUNT クエリが必要だが実装は単純 | 総件数算出に別途クエリが必要で利点がない |
| UIパターン | 番号付きページネーション | 「次へ」のみ（無限スクロール向き） |
| 大量データ時のパフォーマンス | offset が大きいと遅い（数万件超で顕著） | 常に高速 |
| 既存実装との親和性 | `findByAuthorId` が既に offset 対応済み | 新規実装が必要 |
| BDDシナリオとの整合性 | 「2ページ目に遷移する」「全3ページ」と完全一致 | ページ番号概念がないためシナリオと不整合 |

**決定: OFFSET/LIMIT方式を採用する。**

**根拠:**
1. BDDシナリオが「ページ番号」「全Nページ」という概念を使っているため、カーソル方式はシナリオとの不整合が生じる
2. 既存の `findByAuthorId` が既に Supabase の `.range()` で offset/limit を実装しており、変更が最小
3. 個人の書き込み履歴は現実的に数千件程度が上限であり、OFFSET のパフォーマンス問題は発生しない
4. D-06 mypage.yaml が既に `pagination.offset: query.offset` を定義しており整合する

### 3.2 新規関数: `searchByAuthorId`

キーワード検索・日付範囲フィルタ付きの検索関数を新設する。既存の `findByAuthorId` との責務分離理由は、検索条件の有無でクエリ構築の分岐が増えすぎると可読性が低下するため。

```typescript
/**
 * 著者の書き込みを条件付きで検索する（threads JOIN 付き）。
 * ページネーション・キーワード・日付範囲に対応する。
 *
 * @returns { posts: PostWithThread[], total: number }
 */

/** Post + スレッドタイトル（JOIN結果） */
interface PostWithThread extends Post {
  threadTitle: string;
}

export async function searchByAuthorId(
  authorId: string,
  options: {
    limit: number;
    offset: number;
    keyword?: string;
    startDate?: string;  // YYYY-MM-DD
    endDate?: string;    // YYYY-MM-DD
  }
): Promise<{ posts: PostWithThread[]; total: number }>
```

**実装方針:**

```typescript
// PostgREST の resource embedding で threads を JOIN し、
// 1クエリで posts + thread title を取得する

// 1. ベースクエリ構築（threads を INNER JOIN）
let query = supabaseAdmin
  .from("posts")
  .select("*, threads!inner(title)", { count: "exact" })  // COUNT + JOIN
  .eq("author_id", authorId)
  .eq("is_deleted", false)            // 論理削除除外
  .eq("is_system_message", false)     // システムメッセージ除外
  .order("created_at", { ascending: false });

// 2. キーワード検索（ILIKE）
if (options.keyword) {
  query = query.ilike("body", `%${options.keyword}%`);
}

// 3. 日付範囲フィルタ
if (options.startDate) {
  query = query.gte("created_at", `${options.startDate}T00:00:00.000Z`);
}
if (options.endDate) {
  // endDate は inclusive なので翌日 00:00:00 未満とする
  query = query.lt("created_at", `${options.endDate}T23:59:59.999Z`);
}

// 4. ページネーション
query = query.range(options.offset, options.offset + options.limit - 1);

const { data, count, error } = await query;

// 5. JOIN結果を展開してドメインモデルに変換
const posts = (data as (PostRow & { threads: { title: string } })[]).map(row => ({
  ...rowToPost(row),
  threadTitle: row.threads.title,
}));

return { posts, total: count ?? 0 };
```

**threads JOIN の根拠:**
- D-04 (OpenAPI) の `PostHistory` スキーマは `threadTitle` を required フィールドとして定義している
- D-06 の `history-thread-title` 要素が `postHistory.threadTitle` を source としている
- BDDシナリオ「各書き込みのスレッド名、本文、書き込み日時が含まれる」が明確に要求している
- PostgREST の resource embedding は追加インデックス不要で、posts.thread_id の FK が利用される

**設計判断: `findByAuthorId` の改修ではなく `searchByAuthorId` を新設する理由**

- `findByAuthorId` は既に管理画面の admin-service や BDDテストの user_registration.steps など複数箇所から呼ばれている
- 既存呼び出し元はキーワード・日付範囲・total 返却を必要としない
- 戻り値の型が異なる（`Post[]` vs `{ posts: Post[], total: number }`）
- 責務を明確に分離し、既存コードへの影響をゼロにする

### 3.3 `findByAuthorId` の変更

現行の `findByAuthorId` は `is_deleted` や `is_system_message` のフィルタをかけていない。この除外は呼び出し元の `MypageService.getPostHistory` で `filter(post => !post.isDeleted)` として行っている。

今回の `searchByAuthorId` ではDB側でフィルタする（COUNT の正確性のため）。`findByAuthorId` 自体は変更しない。

### 3.4 インデックス設計

**既存インデックス:**

```sql
-- 00002_create_indexes.sql で定義済み
CREATE INDEX idx_posts_author_id_created_at
    ON posts (author_id, created_at);
```

**分析:**

| クエリパターン | 既存インデックスの利用 | 追加の要否 |
|---|---|---|
| author_id + ORDER BY created_at DESC | idx_posts_author_id_created_at で対応 | 不要 |
| author_id + created_at 範囲 | 同上 | 不要 |
| author_id + body ILIKE '%keyword%' | ILIKE の前方一致でない `%keyword%` はインデックスが効かない | 下記参照 |

**キーワード検索のインデックス考慮:**

`ILIKE '%keyword%'` は B-tree インデックスでは最適化できない（前方一致でないため）。選択肢は以下の通り。

| 方式 | 特徴 |
|---|---|
| 全文検索インデックス (GIN + pg_trgm) | `%keyword%` に対応可能。ただしマイグレーション追加が必要 |
| インデックスなし（シーケンシャルスキャン） | `author_id` のインデックスで行数が十分に絞り込まれれば実用的 |

**決定: MVPフェーズではインデックス追加なし。**

**根拠:**
- `author_id` のインデックスで対象行は1ユーザーの書き込みに限定される（通常 数十〜数百件、多くても数千件）
- この件数でのシーケンシャルスキャンは十分高速（<10ms）
- GIN + pg_trgm の導入はインフラ変更（`CREATE EXTENSION pg_trgm`）を伴い、過剰
- 将来的に全ユーザー横断検索（管理画面等）が必要になった際に再検討する

---

## 4. MypageService変更

### 4.1 `getPostHistory` 関数の拡張

```typescript
/**
 * 書き込み履歴の検索オプション
 */
export interface PostHistoryOptions {
  page?: number;        // ページ番号（1始まり、デフォルト1）
  keyword?: string;     // 本文部分一致
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
}

/**
 * ページネーション付き書き込み履歴レスポンス
 */
export interface PaginatedPostHistory {
  posts: PostHistoryItem[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * ユーザーの書き込み履歴を取得する（ページネーション・検索対応）。
 */
export async function getPostHistory(
  userId: string,
  options: PostHistoryOptions = {},
): Promise<PaginatedPostHistory>
```

**PostHistoryItem の拡張:**

既存の `PostHistoryItem` に `threadTitle` を追加する。D-04 (OpenAPI) の `PostHistory` スキーマに合わせる。

```typescript
// 変更前
export interface PostHistoryItem {
  id: string;
  threadId: string;
  postNumber: number;
  body: string;
  createdAt: Date;
}

// 変更後
export interface PostHistoryItem {
  id: string;
  threadId: string;
  threadTitle: string;   // 追加: D-04 PostHistory.threadTitle
  postNumber: number;
  body: string;
  createdAt: Date;
}
```

**実装方針:**

```typescript
const PAGE_SIZE = 50;
const page = options.page ?? 1;
const offset = (page - 1) * PAGE_SIZE;

const { posts, total } = await PostRepository.searchByAuthorId(userId, {
  limit: PAGE_SIZE,
  offset,
  keyword: options.keyword,
  startDate: options.startDate,
  endDate: options.endDate,
});

return {
  posts: posts.map(post => ({
    id: post.id,
    threadId: post.threadId,
    threadTitle: post.threadTitle,
    postNumber: post.postNumber,
    body: post.body,
    createdAt: post.createdAt,
  })),
  total,
  totalPages: Math.ceil(total / PAGE_SIZE),
  page,
};
```

### 4.2 既存呼び出し元への後方互換性

**問題:** 現在の `getPostHistory` は `PostHistoryItem[]` を返している。戻り値型が `PaginatedPostHistory` に変わる。

**影響範囲:**

| 呼び出し元 | 影響 |
|---|---|
| `src/app/api/mypage/history/route.ts` | 戻り値の展開方法を変更。`{ posts }` → `{ posts, total, totalPages, page }` |
| `features/step_definitions/mypage.steps.ts` | `postHistoryResult` の型を変更。アサーション対象を調整 |
| `features/step_definitions/user_registration.steps.ts` | `getPostHistory` の戻り値から `.posts` を取得するように変更 |
| `features/support/world.ts` | `postHistoryResult` の型を `PaginatedPostHistory` に変更 |

これらは後続の実装タスクで対応する。

---

## 5. APIルート変更

### 5.1 `GET /api/mypage/history` の変更

```typescript
// src/app/api/mypage/history/route.ts

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ... 認証処理（変更なし）...

  // --- クエリパラメータの取得・バリデーション ---
  const page = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
  const keyword = req.nextUrl.searchParams.get("keyword")?.slice(0, 200) || undefined;
  const startDate = parseDate(req.nextUrl.searchParams.get("start_date"));
  const endDate = parseDate(req.nextUrl.searchParams.get("end_date"));

  // --- MypageService への委譲 ---
  const result = await MypageService.getPostHistory(authResult.userId, {
    page,
    keyword,
    startDate,
    endDate,
  });

  return NextResponse.json(result, { status: 200 });
}
```

バリデーションヘルパー (`parsePositiveInt`, `parseDate`) はルートハンドラ内のプライベート関数として定義する（他で再利用される可能性が低いため）。

---

## 6. UIコンポーネント設計

### 6.1 変更方針

現在のマイページは単一の `page.tsx`（約760行）に全機能が集約されている。今回の追加で更にコンポーネントが増えるため、書き込み履歴セクションの状態管理を分離する。

### 6.2 コンポーネント分割

```
src/app/(web)/mypage/
  page.tsx                          ← 既存（書き込み履歴セクションを子コンポーネントに委譲）
  _components/
    PostHistorySection.tsx          ← 新規: 書き込み履歴セクション全体
```

**`PostHistorySection` の責務:**
- 検索フォームの状態管理（keyword, startDate, endDate）
- ページネーションの状態管理（currentPage）
- `GET /api/mypage/history` の呼び出しとレスポンス管理
- 検索結果の表示、0件メッセージの表示
- ページネーションコントロールの表示

**`page.tsx` からの分離理由:**
- 検索フォームの状態（keyword, startDate, endDate）と既存状態（mypageInfo, usernameInput 等）は独立しており、単一コンポーネントに置く理由がない
- ページネーションの状態変更で page.tsx 全体の再レンダリングが発生することを防ぐ
- テスト容易性の向上

### 6.3 PostHistorySection 内部設計

```typescript
// src/app/(web)/mypage/_components/PostHistorySection.tsx
"use client";

interface PostHistoryItem {
  id: string;
  threadId: string;
  postNumber: number;
  body: string;
  createdAt: string;
}

interface PostHistoryState {
  posts: PostHistoryItem[];
  total: number;
  totalPages: number;
  page: number;
  isLoading: boolean;
}

interface SearchParams {
  keyword: string;
  startDate: string;
  endDate: string;
}
```

**状態遷移:**

```
初期表示 → fetchHistory(page=1, 検索条件なし)
検索ボタン押下 → fetchHistory(page=1, 入力された検索条件)
ページ遷移 → fetchHistory(選択ページ, 現在の検索条件を維持)
```

### 6.4 ページネーションUI

BDDシナリオの記述: 「ページネーションが表示される（全3ページ）」「2ページ目に遷移する」

ページ番号リンク方式を採用する（「前へ/次へ」のみではシナリオの「全Nページ」表示を満たせない）。

```
表示パターン:
  totalPages <= 1  → ページネーション非表示（P-1シナリオ）
  totalPages >= 2  → ページ番号リンクを表示

  例: 全3ページ、現在2ページ目
  [前へ] 1 [2] 3 [次へ]
```

要素ID設計:
- `history-pagination`: ページネーションコンテナ
- `history-page-{n}`: 各ページ番号リンク
- `history-page-prev`: 前へボタン
- `history-page-next`: 次へボタン
- `history-page-info`: 「全Nページ」表示テキスト

### 6.5 検索フォームUI

```
[キーワード入力____________________]
[開始日________]  〜  [終了日________]
[検索ボタン]
```

要素ID設計:
- `history-search-form`: 検索フォームコンテナ
- `history-keyword-input`: キーワード入力テキストボックス
- `history-start-date`: 開始日 input[type="date"]
- `history-end-date`: 終了日 input[type="date"]
- `history-search-btn`: 検索実行ボタン

### 6.6 検索結果メッセージ

| 条件 | 表示 | 要素ID |
|---|---|---|
| 検索条件なし + 0件 | 「まだ書き込みがありません」 | `no-posts-message`（既存） |
| 検索条件あり + 0件 | 「該当する書き込みはありません」 | `no-search-results-message` |

この2つのメッセージの使い分けは、検索条件の有無で判定する（BDDシナリオで明確に区別されている）。

---

## 7. D-06 画面要素定義更新

`docs/specs/screens/mypage.yaml` の `history-section` 配下に以下を追加する。

```yaml
  # --- 書き込み履歴 ---
  - id: history-section
    type: section
    label: 書き込み履歴
    children:
      # --- 検索フォーム（新規追加）---
      - id: history-search-form
        type: form
        children:
          - id: history-keyword-input
            type: text-input
            label: キーワード
            placeholder: 本文を検索
            maxLength: 200
          - id: history-start-date
            type: date-input
            label: 開始日
          - id: history-end-date
            type: date-input
            label: 終了日
          - id: history-search-btn
            type: button
            label: 検索

      # --- 検索結果0件メッセージ（新規追加）---
      - id: no-search-results-message
        type: text
        condition: searchActive == true AND postHistory.length == 0
        content: 該当する書き込みはありません

      # --- 書き込み一覧（既存を拡張）---
      - id: history-list
        type: list
        source: postHistory
        emptyMessage: まだ書き込みがありません
        pagination:
          limit: 50
          page: query.page
          totalPages: response.totalPages
        itemTemplate:
          - id: history-thread-title
            type: link
            source: postHistory.threadTitle
            href: "/threads/{postHistory.threadId}"
          - id: history-body
            type: text
            source: postHistory.body
            truncate: 100
          - id: history-datetime
            type: datetime
            source: postHistory.createdAt
            format: "YYYY/MM/DD HH:mm"

      # --- ページネーション（新規追加）---
      - id: history-pagination
        type: pagination
        condition: totalPages > 1
        children:
          - id: history-page-prev
            type: button
            label: 前へ
            condition: page > 1
          - id: history-page-info
            type: text
            format: "全{totalPages}ページ"
          - id: history-page-next
            type: button
            label: 次へ
            condition: page < totalPages
```

**変更差分のまとめ:**

| 追加/変更 | 要素ID | 説明 |
|---|---|---|
| 新規追加 | `history-search-form` | 検索フォームコンテナ |
| 新規追加 | `history-keyword-input` | キーワード入力 |
| 新規追加 | `history-start-date` | 開始日入力 |
| 新規追加 | `history-end-date` | 終了日入力 |
| 新規追加 | `history-search-btn` | 検索ボタン |
| 新規追加 | `no-search-results-message` | 検索結果0件メッセージ |
| 変更 | `history-list.pagination` | `offset` → `page` + `totalPages` に変更 |
| 新規追加 | `history-pagination` | ページネーションコントロール |
| 新規追加 | `history-page-prev` | 前へボタン |
| 新規追加 | `history-page-info` | ページ情報テキスト |
| 新規追加 | `history-page-next` | 次へボタン |

---

## 8. OpenAPI仕様更新

`docs/specs/openapi.yaml` の `/api/mypage/history` セクションを以下のように更新する。

```yaml
  /api/mypage/history:
    get:
      operationId: getPostHistory
      summary: 書き込み履歴取得（ページネーション・検索対応）
      tags: [マイページ]
      security:
        - edgeTokenCookie: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
            minimum: 1
        - name: keyword
          in: query
          schema:
            type: string
            maxLength: 200
        - name: start_date
          in: query
          schema:
            type: string
            format: date
        - name: end_date
          in: query
          schema:
            type: string
            format: date
      responses:
        "200":
          description: 書き込み履歴
          content:
            application/json:
              schema:
                type: object
                properties:
                  posts:
                    type: array
                    items:
                      $ref: "#/components/schemas/PostHistory"
                  total:
                    type: integer
                  totalPages:
                    type: integer
                  page:
                    type: integer
                required: [posts, total, totalPages, page]
```

**変更点:**
- `limit` / `offset` パラメータを `page` に一本化
- `keyword`, `start_date`, `end_date` パラメータを追加
- レスポンスに `totalPages`, `page` を追加
- `total` に `required` 制約を追加

---

## 9. 既存テストへの影響分析

### 9.1 BDDステップ定義の変更

| ファイル | 変更内容 |
|---|---|
| `features/support/world.ts` | `postHistoryResult` の型を `PaginatedPostHistory` に変更 |
| `features/step_definitions/mypage.steps.ts` | 既存の `getPostHistory` 呼び出し箇所で `.posts` を経由するように変更。新シナリオ8件分のステップ定義を新規追加 |
| `features/step_definitions/user_registration.steps.ts` | L1561: `getPostHistory` の戻り値から `.posts` を取得するように変更 |
| `features/step_definitions/thread.steps.ts` | L667: `postHistoryResult.length` → `postHistoryResult.posts.length` に変更 |

### 9.2 インメモリリポジトリの変更

| ファイル | 変更内容 |
|---|---|
| `features/support/in-memory/post-repository.ts` | `searchByAuthorId` 関数を新規追加。`findByAuthorId` と同等のフィルタ + keyword/dateRange + COUNT 返却 |

### 9.3 単体テストの追加箇所

| 対象 | テストファイル | テスト内容 |
|---|---|---|
| `PostRepository.searchByAuthorId` | `src/__tests__/lib/infrastructure/repositories/post-repository-search.test.ts`（新規） | keyword/日付範囲/ページネーションの組み合わせ |
| `MypageService.getPostHistory` | `src/lib/services/__tests__/mypage-service.test.ts`（既存拡張） | ページネーション計算（totalPages）、検索パラメータの伝播 |
| APIルート パラメータバリデーション | `src/__tests__/app/api/mypage/history.test.ts`（新規） | page/keyword/date のバリデーション |

---

## 10. 実装タスク分解案

### タスク A: PostRepository + MypageService 拡張（バックエンド）

**スコープ:**
- `PostRepository.searchByAuthorId` 新規実装
- `MypageService.getPostHistory` の引数・戻り値型変更と実装更新
- `PostHistoryOptions`, `PaginatedPostHistory` 型定義追加
- 単体テスト追加

**locked_files:**
- `src/lib/infrastructure/repositories/post-repository.ts`
- `src/lib/services/mypage-service.ts`

**推定工数:** 小〜中

---

### タスク B: APIルート + OpenAPI更新

**スコープ:**
- `GET /api/mypage/history` のクエリパラメータ拡張
- バリデーションヘルパー実装
- `docs/specs/openapi.yaml` の `/api/mypage/history` 更新
- APIルート単体テスト追加

**locked_files:**
- `src/app/api/mypage/history/route.ts`
- `docs/specs/openapi.yaml`

**依存:** タスクA（MypageService の型が確定している必要あり）

**推定工数:** 小

---

### タスク C: UIコンポーネント実装

**スコープ:**
- `PostHistorySection.tsx` 新規作成
- `page.tsx` から書き込み履歴セクションの分離
- 検索フォーム・ページネーションコントロール実装
- `docs/specs/screens/mypage.yaml` 更新

**locked_files:**
- `src/app/(web)/mypage/page.tsx`
- `docs/specs/screens/mypage.yaml`

**依存:** タスクB（APIレスポンス形式が確定している必要あり）

**推定工数:** 中

---

### タスク D: BDDステップ定義 + インメモリリポジトリ

**スコープ:**
- 新規8シナリオ（ページネーション3 + 検索5）のステップ定義実装
- `features/support/in-memory/post-repository.ts` に `searchByAuthorId` 追加
- `features/support/world.ts` の `postHistoryResult` 型変更
- 既存ステップ定義の後方互換修正（user_registration.steps.ts, thread.steps.ts）

**locked_files:**
- `features/step_definitions/mypage.steps.ts`
- `features/support/in-memory/post-repository.ts`
- `features/support/world.ts`
- `features/step_definitions/user_registration.steps.ts`
- `features/step_definitions/thread.steps.ts`

**依存:** タスクA（MypageService の型が確定している必要あり）

**推定工数:** 中

---

### 推奨実行順序

```
タスクA → タスクB → タスクC
              ↘
               タスクD
```

タスクBとタスクDは、タスクA完了後に並行実行可能（locked_files が重複しない）。
タスクCはタスクBのAPI仕様確定後に実行する。
