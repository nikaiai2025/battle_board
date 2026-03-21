# TASK-162 全体設計書 — URL構造変更・ページネーション・アンカーポップアップ・レス番号表示

> 作成日: 2026-03-19
> 対象BDD: `features/thread.feature` @url_structure @pagination @anchor_popup @post_number_display
> 対象BDD: `features/constraints/specialist_browser_compat.feature` — read.cgiリダイレクト先変更、板トップ直接表示

---

## 1. @url_structure: ルーティング構造変更

### 1.1 新旧URL対応表

| 用途 | 旧URL | 新URL |
|---|---|---|
| トップ（ルート） | `/` → スレッド一覧を直接表示 | `/` → `/battleboard/` にリダイレクト |
| スレッド一覧 | `/` (page.tsx) | `/battleboard/` (page.tsx) |
| スレッド閲覧 | `/threads/{UUID}` | `/battleboard/{threadKey}/` |
| 旧URLリダイレクト | - | `/threads/{UUID}` → `/battleboard/{threadKey}/` (302) |
| 専ブラ read.cgi | `/test/read.cgi/{boardId}/{key}/` → `/threads/{UUID}` | `/test/read.cgi/{boardId}/{key}/` → `/{boardId}/{threadKey}/` |
| 板トップ（専ブラ互換） | 404 or 未対応 | `/{boardId}/` → スレッド一覧ページそのもの |

### 1.2 Next.js ディレクトリ構成

```
src/app/(web)/
  [boardId]/                        # [NEW] 板ルートグループ
    page.tsx                        # [NEW] スレッド一覧ページ（旧 page.tsx を移動）
    [threadKey]/                    # [NEW] スレッド閲覧ページ
      page.tsx                      # [NEW] 旧 threads/[threadId]/page.tsx を threadKey 指定に変更
      [...range]/                   # [NEW] ページネーション用 catch-all
        page.tsx                    # [NEW] 範囲指定あり版スレッドページ
  threads/
    [threadId]/
      page.tsx                      # [MODIFY] リダイレクト専用に変更（旧URL互換）
  page.tsx                          # [MODIFY] `/` → `/battleboard/` リダイレクト専用に変更
  _components/                      # 既存コンポーネント群（変更なし or 微修正）
  dev/
    page.tsx                        # 既存（変更なし。dev板は別パス構造を維持）
```

### 1.3 設計判断

#### 1.3.1 `/` → `/battleboard/` リダイレクト方式

**決定: page.tsx 内 `redirect()`**

| 方式 | メリット | デメリット |
|---|---|---|
| middleware.ts | リクエスト処理前にリダイレクト | Cloudflare Workers環境でEdge Middlewareの制約がある。新規ファイル追加が必要 |
| next.config.ts rewrites/redirects | 設定のみで完結 | next.config.ts のredirectsはレスポンスコード制御が限定的。既にrewritesで拡張子リライトを使用中 |
| **page.tsx内redirect()** | Next.js標準API。Server Component内で即座に302を返す。既存パターンと一貫性がある | 一度ページコンポーネントが評価される（ただし redirect() はレンダリング前に例外で中断するため実質オーバーヘッドなし） |

理由: 既存プロジェクトにmiddleware.tsが存在しない。新規にミドルウェアを導入するよりも、page.tsx内のredirect()で対応する方がシンプルで影響範囲が小さい。

#### 1.3.2 `[boardId]` の動的セグメント vs 固定パス

**決定: 動的セグメント `[boardId]` を使用する**

理由:
- 既に `dev` 板が存在し、将来的に板追加が想定される
- 専ブラの `/{boardId}/` パスパターンとWeb UIのパスを統一することで、URLコピーによる相互運用が自然に成立する
- ただし、dev板は現在独自ページ (`/dev/page.tsx`) を持つ。dev板を `[boardId]` に統合するかは今回のスコープ外とし、`[boardId]` は battleboard のみを対象とする

**注意: ルート競合の回避**
- `(web)/dev/page.tsx`（開発連絡板）と `(web)/[boardId]/page.tsx` が競合する可能性がある
- Next.js App Router はリテラルセグメント (`dev`) を動的セグメント (`[boardId]`) より優先するため、`/dev/` は `dev/page.tsx` にマッチし競合しない
- `admin`, `mypage`, `auth`, `threads` も同様にリテラルセグメントとして優先される

#### 1.3.3 旧URL `/threads/{UUID}` のリダイレクト実装

**決定: 既存の `threads/[threadId]/page.tsx` をリダイレクト専用に書き換える**

処理フロー:
1. UUID で `ThreadRepository.findById()` → Thread取得
2. Thread が存在しない場合 → `notFound()`
3. `redirect(`/${thread.boardId}/${thread.threadKey}/`)` で302リダイレクト

#### 1.3.4 スレッドデータ取得: threadKey → Thread

**決定: `PostService.getThreadByThreadKey()` を新設する**

現行:
- `PostService.getThread(threadId)` — UUID指定
- `ThreadRepository.findByThreadKey(threadKey)` — threadKey指定（専ブラルートで使用中）

新設:
- `PostService.getThreadByThreadKey(threadKey)` — threadKeyでThreadを返す

理由: 依存方向の原則に従い、page.tsx → PostService → ThreadRepository の流れを維持する。page.tsx が直接 ThreadRepository を呼ぶことは避ける（web-ui.md §2 の例外規定「認証不要のGET系Server Componentはサービス層を直接インポート」に準拠）。

#### 1.3.5 専ブラread.cgiリダイレクト先の変更

現行: `redirect → /threads/${thread.id}`
新規: `redirect → /${thread.boardId}/${thread.threadKey}/`

変更箇所: `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` のリダイレクト先URLを書き換える。

#### 1.3.6 スレッド一覧リンクの変更

現行: `ThreadCard` の `<Link href={/threads/${id}}>` — UUID指定
新規: `<Link href={/${boardId}/${threadKey}/}>` — boardId+threadKey指定

影響:
- `ThreadCard` に `boardId` と `threadKey` のpropsを追加する
- `ThreadList` に `boardId` と `threadKey` を伝播する
- `fetchThreads()` の返り値に `boardId` と `threadKey` を含める
- `ThreadCreateForm` 経由のスレッド作成後のリダイレクト先も変更が必要

#### 1.3.7 スレッドページの「一覧に戻る」リンク

現行: `thread.boardId === "dev" ? "/dev/" : "/"`
新規: `/${thread.boardId}/` に統一

理由: URL構造の統一に伴い、戻るリンクも板パス形式に統一する。

---

## 2. @pagination: ページネーション

### 2.1 URL設計

| URL | 意味 |
|---|---|
| `/{boardId}/{threadKey}/` | デフォルト表示（最新50件） |
| `/{boardId}/{threadKey}/1-100` | レス1〜100 |
| `/{boardId}/{threadKey}/l100` | 最新100件 |

### 2.2 動的ルート設計

**決定: Optional Catch-All `[[...range]]` を使用する**

| 方式 | メリット | デメリット |
|---|---|---|
| 別ルート `[threadKey]/[range]/page.tsx` | ルート定義が明確 | デフォルト表示（範囲なし）とページ分割が重複する。2ファイル間でデータ取得ロジックが重複 |
| **Optional Catch-All `[threadKey]/[[...range]]/page.tsx`** | 1つのpage.tsxでデフォルト/範囲指定の両方を処理。DRY | URLの複雑なパース（"1-100", "l100"等）をpage.tsx内で行う必要がある |

ディレクトリ構成:
```
src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx
```

- `range` が `undefined` → デフォルト表示（最新50件）
- `range[0]` が `"1-100"` → 範囲指定
- `range[0]` が `"l100"` → 最新N件

### 2.3 範囲パーサー（純粋関数）

新設: `src/lib/domain/rules/pagination-parser.ts`

```typescript
interface PaginationRange {
  type: 'default' | 'range' | 'latest';
  start?: number;   // range時のみ: 開始レス番号
  end?: number;     // range時のみ: 終了レス番号
  count?: number;   // latest時のみ: 最新N件
}

function parsePaginationRange(segment?: string): PaginationRange;
```

- `undefined` → `{ type: 'default' }` （最新50件）
- `"1-100"` → `{ type: 'range', start: 1, end: 100 }`
- `"l100"` → `{ type: 'latest', count: 100 }`
- 不正な値 → `{ type: 'default' }` にフォールバック

### 2.4 PostService改修: 範囲指定付きレス取得

**決定: `PostService.getPostList()` に範囲指定オプションを追加する**

現行シグネチャ:
```typescript
getPostList(threadId: string, fromPostNumber?: number): Promise<Post[]>
```

新シグネチャ:
```typescript
interface PostListOptions {
  fromPostNumber?: number;  // 既存: ポーリング用の差分取得
  range?: { start: number; end: number };  // NEW: 範囲指定
  latestCount?: number;  // NEW: 最新N件
}
getPostList(threadId: string, options?: PostListOptions): Promise<Post[]>
```

PostRepository側も対応するクエリを追加:
- `range` 指定時: `.gte("post_number", start).lte("post_number", end)`
- `latestCount` 指定時: `.order("post_number", { ascending: false }).limit(count)` してから反転

### 2.5 デフォルト表示のロジック

BDDシナリオ: 「デフォルト表示が最新50件」

- `postCount <= 50` の場合: 全レスを表示（ナビゲーション不要）
- `postCount > 50` の場合: `latestCount: 50` で最新50件を取得

### 2.6 ナビゲーションUIコンポーネント

新設: `src/app/(web)/_components/PaginationNav.tsx` (Server Component)

BDDシナリオ: 「"1-100" "101-200" "201-250" "最新100" のナビゲーションリンクが表示される」

- `postCount <= 100` → ナビゲーション非表示
- `postCount > 100` → 100件ごとのレンジリンク + 「最新100」リンクを生成
- リンクは `/{boardId}/{threadKey}/{range}` 形式

```typescript
interface PaginationNavProps {
  boardId: string;
  threadKey: string;
  totalPostCount: number;
  currentRange?: string; // 現在表示中の範囲（ハイライト用）
}
```

### 2.7 ポーリングとの共存

BDDシナリオ:
- 「最新ページ表示時のみポーリングで新着レスを検知する」
- 「過去ページ表示時はポーリングが無効である」

**決定: ポーリング有効/無効フラグを page.tsx から PostListLiveWrapper に渡す**

判定ロジック:
- デフォルト表示（`range === undefined`）→ ポーリング有効
- `latest` 指定（`l50`, `l100`等）→ ポーリング有効
- `range` 指定（`1-100`等で、かつ末尾がpostCount以上）→ ポーリング有効
- `range` 指定（末尾がpostCount未満）→ ポーリング無効

実装: PostListLiveWrapper に `pollingEnabled: boolean` propsを追加。falseの場合はsetIntervalを設定しない。

---

## 3. @anchor_popup: アンカーポップアップ

### 3.1 現行のアンカー処理

現行の `PostItem.tsx` の `parseAnchorLinks()` は `>>N` を `<Link href="#post-N">` に変換している（ページ内スクロール）。これをポップアップ表示に変更する。

### 3.2 コンポーネント設計

```
ThreadPage (Server Component)
  └── PostListWithPopup (Client Component)  [NEW]
        ├── PostList (posts) — 初期レス一覧の表示
        ├── PostListLiveWrapper — ポーリング新着
        └── AnchorPopup (Client Component) [NEW] — ポップアップ表示
              └── PostItem (ポップアップ内のレス表示)
                    └── AnchorLink (再帰的にポップアップ可能)
```

**重要な設計判断: PostListWithPopup の導入**

現行では PostList (Server Component) と PostListLiveWrapper (Client Component) が並列に配置されている。ポップアップのステート管理（表示中のポップアップスタック）はクライアントサイドで行う必要があるため、これらを包括するClient Componentラッパーが必要。

しかし、PostList を Client Component に変更すると SSR のメリットを失う。代わりに以下のアプローチを取る。

**決定: ポップアップ管理をContext + Client Componentで実装し、PostList はServer Componentのまま維持する**

- `AnchorPopupProvider` (Client Component) — ポップアップスタックのContext
- PostItem内のアンカーリンクを `AnchorLink` (Client Component) に変更
- PostList自体はServer Componentのまま

ただし、PostItem内にClient Componentのアンカーリンクを埋め込むことで、PostItemは事実上Client Componentに変換される。これは既存のPostFormやPostListLiveWrapperと同様のパターンであり許容範囲。

### 3.3 ポップアップスタック管理

```typescript
// src/app/(web)/_components/AnchorPopupContext.tsx

interface PopupEntry {
  postNumber: number;
  post: Post | null;  // null = ロード中 or 存在しない
  position: { x: number; y: number };
}

interface AnchorPopupContextType {
  popupStack: PopupEntry[];
  openPopup: (postNumber: number, position: { x: number; y: number }) => void;
  closeTopPopup: () => void;
  closeAllPopups: () => void;
}
```

BDDシナリオ:
- 「ポップアップ内のアンカーをクリックするとポップアップが重なる」→ スタック（配列）で管理
- 「ポップアップの外側をクリックすると最前面のポップアップが閉じる」→ `closeTopPopup()` でスタック末尾を除去
- 「存在しないレスへのアンカーではポップアップが表示されない」→ レス検索でnullの場合はopenしない

### 3.4 データ取得戦略

アンカークリック時のレス取得方法:

**決定: ローカルキャッシュ優先 + 必要時のみAPIフェッチ**

1. まずクライアント側で保持しているレスデータ（SSR初期レス + ポーリング新着）から検索
2. 見つからない場合（ページネーションで表示範囲外のレス）→ APIフェッチ

実装:
- `AnchorPopupProvider` に `allPosts: Map<number, Post>` を保持
- SSR初期レス + PostListLiveWrapperの新着レスをMapに登録
- 検索ヒットしない場合、`GET /api/threads/{threadId}/posts/{postNumber}` を呼び出す
  - ただし、このAPIエンドポイントは現在存在しない。新設が必要

代替案（APIエンドポイント新設を避ける場合）:
- 表示中のレスにない場合はポップアップを表示しない
- ただし、ページネーション導入後は表示範囲外のレスが存在するため、将来的にはAPI呼び出しが必要

**暫定決定: 表示中のレスのみをポップアップ対象とする**

理由: BDDシナリオは「スレッドにレス1 "こんにちは" とレス2 ">>1 よろしく" が存在する」という前提であり、表示範囲外のレスへのアンカーポップアップは明示的に要求されていない。ページネーション範囲外のレスへのポップアップはフェーズ2として別タスク化が妥当。

### 3.5 z-indexスタック管理

```css
/* ポップアップの z-index はスタック順序に基づいて動的に設定 */
/* base: 50, 各ポップアップ: 50 + stackIndex */
```

### 3.6 閉じる動作

BDDシナリオ: 「ポップアップの外側をクリックすると最前面のポップアップが閉じる」

実装:
- ドキュメントレベルの `click` イベントリスナーを設定
- クリックターゲットがポップアップ内部でない場合、`closeTopPopup()` を呼び出す
- ポップアップ内部のクリックは `event.stopPropagation()` で伝播を停止

---

## 4. @post_number_display: レス番号表示

### 4.1 現行の表示

```tsx
<span className="font-bold text-gray-700">
  &gt;&gt;{post.postNumber}
</span>
```

表示結果: `>>5` （">>" 付き）

### 4.2 変更内容

BDDシナリオ:
- 「レス番号が "5" と表示される」→ ">>" を除去
- 「レス番号に ">>" は付与されない」
- 「レス番号をクリックすると返信テキストがフォームに挿入される」

```tsx
<button
  className="font-bold text-gray-700 hover:text-blue-600 cursor-pointer"
  onClick={() => onPostNumberClick(post.postNumber)}
>
  {post.postNumber}
</button>
```

### 4.3 PostForm へのテキスト挿入連携

BDDシナリオ:
- 「書き込みフォームに ">>5" が挿入される」
- 「書き込みフォームの内容が "こんにちは\n>>3" になる」

**決定: Ref（コールバック）方式**

| 方式 | メリット | デメリット |
|---|---|---|
| React Context | 子→親の通知が自然 | PostFormの状態をContextに載せるとProvider範囲全体が再レンダリングされる |
| **Ref（コールバック）方式** | PostForm が `insertText` 関数を公開。PostItem がそれを呼ぶ | Ref の受け渡しがやや冗長 |
| カスタムイベント (CustomEvent) | コンポーネント間の疎結合 | React外のイベントシステムで型安全性が低い |

**実装方針:**

1. PostForm に `useImperativeHandle` で `insertText(text: string)` メソッドを公開
2. 親コンポーネント（スレッドページ）が `postFormRef` を保持
3. PostItem の `onPostNumberClick` コールバック経由で `postFormRef.current.insertText(">>N")` を呼び出す

ただし、PostFormはClient Component、PostListはServer Componentであるため、refを直接渡せない。

**修正方針: Context（軽量版）を使用する**

- `PostFormContext` を新設。値は `insertText: (text: string) => void` のみ
- PostForm が Provider の値を設定する（useEffect内で）
- PostItem（のレス番号ボタン部分）が Consumer として `insertText` を呼び出す
- PostItem をClient Componentに変更する（アンカーポップアップ対応で既にClient化が必要）

```typescript
// src/app/(web)/_components/PostFormContext.tsx
interface PostFormContextType {
  insertText: (text: string) => void;
}
```

insertText の実装（PostForm内）:
```typescript
const insertText = useCallback((text: string) => {
  setBody((prev) => {
    if (prev.trim() === '') return text;
    return prev + '\n' + text;
  });
}, []);
```

---

## 5. 既存コードへの影響一覧

### 5.1 変更が必要なファイル

| ファイル | 変更内容 | 理由 |
|---|---|---|
| `src/app/(web)/page.tsx` | リダイレクト専用に書き換え | `/` → `/battleboard/` |
| `src/app/(web)/threads/[threadId]/page.tsx` | リダイレクト専用に書き換え | 旧URL互換 |
| `src/app/(web)/_components/ThreadCard.tsx` | リンク先変更、boardId/threadKey props追加 | URL構造変更 |
| `src/app/(web)/_components/ThreadList.tsx` | Thread型にboardId/threadKey追加 | ThreadCardへの伝播 |
| `src/app/(web)/_components/PostItem.tsx` | レス番号表示変更、アンカーリンク変更、Client Component化 | @post_number_display, @anchor_popup |
| `src/app/(web)/_components/PostForm.tsx` | insertText公開、PostFormContext連携 | @post_number_display |
| `src/app/(web)/_components/PostListLiveWrapper.tsx` | pollingEnabled props追加 | @pagination |
| `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` | リダイレクト先変更 | @url_structure |
| `src/lib/services/post-service.ts` | getThreadByThreadKey新設、getPostList改修 | @url_structure, @pagination |
| `src/lib/infrastructure/repositories/post-repository.ts` | findByThreadId のrange/latest対応 | @pagination |
| `docs/architecture/components/web-ui.md` | §3コンポーネント境界の更新 | ドキュメント連動 |

### 5.2 新規作成ファイル

| ファイル | 説明 |
|---|---|
| `src/app/(web)/[boardId]/page.tsx` | 板トップ（スレッド一覧）ページ |
| `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | スレッド閲覧ページ（ページネーション対応） |
| `src/lib/domain/rules/pagination-parser.ts` | ページネーション範囲パーサー（純粋関数） |
| `src/app/(web)/_components/PaginationNav.tsx` | ページナビゲーションUI |
| `src/app/(web)/_components/AnchorPopupContext.tsx` | ポップアップ管理Context |
| `src/app/(web)/_components/AnchorPopup.tsx` | ポップアップ表示コンポーネント |
| `src/app/(web)/_components/AnchorLink.tsx` | アンカーリンク（クリックでポップアップ） |
| `src/app/(web)/_components/PostFormContext.tsx` | PostFormテキスト挿入Context |
| `src/__tests__/lib/domain/rules/pagination-parser.test.ts` | パーサー単体テスト |

### 5.3 BDDステップ定義への影響

`features/step_definitions/thread.steps.ts` に新規シナリオ（@url_structure, @pagination, @anchor_popup, @post_number_display）のステップ定義を追加する必要がある。ただし、ステップ定義の実装はコーディングタスクのスコープ。

---

## 6. コンポーネント境界図（変更後）

### 6.1 スレッド一覧ページ

```
app/(web)/[boardId]/page.tsx  [Server Component]
  └── ThreadList [Server Component]
        └── ThreadCard [Server Component]
              // href: /{boardId}/{threadKey}/ に変更
```

### 6.2 スレッドページ

```
app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx  [Server Component]
  ├── PaginationNav [Server Component]      // NEW: ページナビゲーション
  ├── PostFormContextProvider [Client]       // NEW: テキスト挿入Context
  │     ├── PostForm [Client Component]     // 既存 + insertText公開
  │     └── AnchorPopupProvider [Client]    // NEW: ポップアップContext
  │           ├── PostList [Server→Client]  // PostItemのClient化に伴い変更
  │           │     └── PostItem [Client]   // レス番号クリック + アンカーポップアップ
  │           │           └── AnchorLink [Client] // NEW
  │           ├── PostListLiveWrapper [Client]  // 既存 + pollingEnabled
  │           │     └── PostItem [Client]
  │           └── AnchorPopup [Client]      // NEW: ポップアップ表示
  │                 └── PostItem [Client]   // ポップアップ内レス表示（再帰可）
  └── PaginationNav [Server Component]      // ページ下部にも配置
```

**注意: PostListのServer Component維持について**

PostItem がClient Componentに変更される場合、PostListから `<PostItem>` を呼び出す際にPostList自体もClient Componentになる必要があると考えがちだが、Next.js App Routerでは Server Component から Client Component をレンダリングすることは許容される（children として渡す場合）。しかし、PostList が PostItem を直接 import してレンダリングしている現行の実装では、PostItem が "use client" ディレクティブを持つ場合、PostList から直接 import しても問題ない（Server Component は Client Component を import してレンダリングできる）。

ただし、PostItem が Context (PostFormContext, AnchorPopupContext) を使用する場合、PostItem がレンダリングされる時点でこれらの Provider の子孫にいる必要がある。そのため、PostList を Provider の内部に配置するか、PostList を Client Componentにする必要がある。

**最終決定: PostList を Client Component に変更する**

理由: PostItem がContextを消費する以上、PostList もClient Componentである方が自然。SSRの初期レス一覧はServer Component（page.tsx）でデータ取得し、PostList Client Componentにpropsとして渡すため、SSRメリットは維持される。

---

## 7. データフロー

### 7.1 スレッド閲覧（新URL）

```
[ブラウザ] → GET /{boardId}/{threadKey}/{range?}
  → [page.tsx Server Component]
    → PostService.getThreadByThreadKey(threadKey)
    → PostService.getPostList(thread.id, rangeOptions)
    → SSR render: PaginationNav + PostList + PostForm + PostListLiveWrapper
  → [クライアント]
    → PostListLiveWrapper: pollingEnabled ? setInterval(fetchNewPosts) : noop
    → PostItem アンカークリック → AnchorPopupContext.openPopup()
    → PostItem レス番号クリック → PostFormContext.insertText(">>N")
```

### 7.2 旧URLリダイレクト

```
[ブラウザ] → GET /threads/{UUID}
  → [page.tsx Server Component]
    → PostService.getThread(UUID)
    → redirect(/${thread.boardId}/${thread.threadKey}/)
```
