# 撃破済みBOT表示機能 設計書

> TASK-219 / Sprint-79
> 対象BDDシナリオ: `features/bot_system.feature`
> - 撃破済みボットのレスはWebブラウザで目立たない表示になる
> - 撃破済みボットのレス表示をトグルで切り替えられる

---

## 1. データフロー設計

### 1.1 botMark取得方式の選定

**結論: 2段階クエリ方式を採用する。**

| 評価軸 | LEFT JOIN方式 | 2段階クエリ方式 |
|---|---|---|
| 概要 | posts LEFT JOIN bot_posts LEFT JOIN bots の1クエリ | (1) posts取得 (2) post_id一覧でbot_posts+botsを一括検索 |
| Supabase REST API対応 | `posts(*, bot_posts(bot_id, bots(*)))` でネストセレクト可能。ただし外部キー関係が必要 | 標準的なSELECT + INクエリで実現可能 |
| セキュリティ | PostgRESTの関係クエリはRLSを透過する。`supabaseAdmin`(service_role)で実行するため問題ないが、将来anon用のエンドポイントで誤用されるリスクがある | bot_posts/botsへのアクセスが`supabaseAdmin`経由であることが関数署名レベルで明確 |
| パフォーマンス | 1回のHTTPリクエスト。DBレベルでJOIN | 2回のHTTPリクエスト。ただしbot_postsの行数はレス数に比例し、通常のスレッドでは数百件程度 |
| 保守性 | PostRepositoryがbot_posts/botsの構造に依存する（責務の越境） | PostRepositoryはpostsテーブルのみに責務を持ち、botMark合成はサービス層が担う |

**選定根拠:**
- 保守性: PostRepositoryがbot_posts/botsテーブルの知識を持つのは層の責務に反する。`Source_Layout.md`の依存方向ルール（Repository = 単一テーブルのCRUD）を尊重する
- セキュリティ: RLS保護されたbot_postsへのアクセス経路が明確に分離される
- パフォーマンスは許容範囲: スレッド1本あたりのレスは最大数百件。2回目のクエリはIN句で一括取得するためN+1にならない

### 1.2 データフロー詳細

```
page.tsx (SSR)
  |
  v
PostService.getPostListWithBotMark(threadId, options)   <-- 新設
  |
  +---> PostRepository.findByThreadId(threadId, options) --> Post[]
  |
  +---> BotPostRepository.findByPostIds(postIds)         <-- 新設
  |        --> { postId, botId }[]
  |
  +---> BotRepository.findByIds(botIdSet)                <-- 新設
  |        --> Bot[] (is_active=false のもののみ botMark に含める)
  |
  v
  Post[] に botMark を合成して返却
```

### 1.3 新設・変更するリポジトリ関数

#### BotPostRepository.findByPostIds (新設)

```typescript
/**
 * 複数のpost_idに対応するbot_posts紐付けレコードを一括取得する。
 * 撃破済みBOT表示のbotMark合成に使用する。
 * N+1問題を回避するため、IN句で一括取得する。
 *
 * @param postIds post_idの配列
 * @returns 紐付けレコードの配列
 */
export async function findByPostIds(
  postIds: string[]
): Promise<{ postId: string; botId: string }[]>
```

#### BotRepository.findByIds (新設)

```typescript
/**
 * 複数のbot_idに対応するボット情報を一括取得する。
 *
 * @param botIds bot_idの配列
 * @returns Bot配列
 */
export async function findByIds(botIds: string[]): Promise<Bot[]>
```

### 1.4 PostService.getPostListWithBotMark (新設)

```typescript
/**
 * レス一覧にbotMark情報を合成して返却する。
 * 撃破済み（is_active=false）のBOTの書き込みにのみbotMarkを付与する。
 * 活動中（is_active=true）のBOTの情報は一切含めない。
 *
 * @param threadId スレッドのUUID
 * @param options PostListOptions
 * @returns botMark付きPost配列
 */
export async function getPostListWithBotMark(
  threadId: string,
  options?: PostListOptions
): Promise<PostWithBotMark[]>
```

合成ロジック:

```
1. posts = PostRepository.findByThreadId(threadId, options)
2. postIds = posts.map(p => p.id)
3. botPosts = BotPostRepository.findByPostIds(postIds)
4. botIds = unique(botPosts.map(bp => bp.botId))
5. bots = BotRepository.findByIds(botIds)
6. eliminatedBotIds = Set(bots.filter(b => !b.isActive).map(b => b.id))
7. botPostMap = Map(botPosts postId -> botId)  // 撃破済みのみフィルタ
8. posts.map(p => {
     const botId = botPostMap.get(p.id)
     if (botId && eliminatedBotIds.has(botId)) {
       const bot = bots.find(b => b.id === botId)
       return { ...p, botMark: { hp: bot.hp, maxHp: bot.maxHp } }
     }
     return { ...p, botMark: null }
   })
```

### 1.5 セキュリティ: 活動中BOT情報の非漏洩

**必須制約: `is_active=true` のBOTの書き込みにbotMarkを付与してはならない。**

実装ガード:
- ステップ6で `eliminatedBotIds` に `is_active=false` のBOTのみを格納する
- `is_active=true`（潜伏中・暴露済み）のBOTは `eliminatedBotIds` に含まれないため、botMarkが付与されない
- 暴露済み（`is_revealed=true`）であっても `is_active=true` なら botMark を返さない。暴露済みBOTのBOTマーク表示は別の仕組み（既存のリアルタイム表示）で行う
- 単体テストで「is_active=true のBOTのpostにbotMarkがnullであること」を検証する

### 1.6 ドメインモデルへのbotMark追加の判断

**結論: Postドメインモデル (`src/lib/domain/models/post.ts`) にはbotMarkを追加しない。**

根拠:
- botMarkはPostの本質的な属性ではなく、閲覧時のビュー情報（表示コンテキスト依存）
- Postモデルはpostsテーブルと1:1対応する純粋なデータ型。bot_postsとbotsのJOIN結果を含めると純粋性が失われる
- 代わりにサービス層で合成型 `PostWithBotMark` を定義する

```typescript
// src/types/post-with-bot-mark.ts
import type { Post } from "../lib/domain/models/post";

export interface BotMark {
  hp: number;
  maxHp: number;
}

export interface PostWithBotMark extends Post {
  botMark: BotMark | null;
}
```

---

## 2. フロントエンド表示設計

### 2.1 目立たない表示の実装方法

**結論: article要素全体にopacity 0.5を適用する。**

根拠:
- E2Eテスト (`bot-display.spec.ts`) が `getComputedStyle(el).opacity` で `< 1` をアサートしている。article要素(`#post-${postNumber}`)に対してopacityを取得しているため、article全体に適用が必須
- opacityはヘッダー（レス番号・表示名・日時）と本文の両方に効果があり、レス全体が「薄い」印象になる
- text-gray-400のみでは本文のみに適用され、ヘッダーとの不整合が生じる

### 2.2 PostItem.tsx の変更

```tsx
// PostItem.tsx 内の article 要素
<article
  id={`post-${post.postNumber}`}
  className={`py-2 border-b border-gray-200 text-sm ${
    isSystemMessage ? "bg-yellow-50" : ""
  }`}
  style={post.botMark ? { opacity: 0.5 } : undefined}
>
```

- `style` 属性でinline opacityを適用する。Tailwindのopacityクラス（`opacity-50`）でも等価だが、`botMark` がoption型のためclassName文字列の組み立てよりstyle属性が明瞭
- 既存のPostItem.Post型に `botMark?: { hp: number; maxHp: number } | null` が既に定義済みのため、型変更は不要

### 2.3 E2Eテストとの整合性

| E2Eアサーション | 実装の対応 |
|---|---|
| `botPost.evaluate(el => getComputedStyle(el).opacity)` < 1 | `style={{ opacity: 0.5 }}` |
| `normalPost.evaluate(el => getComputedStyle(el).opacity)` === 1 | botMark未設定のレスはstyle属性なし (opacity: 1) |

---

## 3. トグルUI設計

### 3.1 配置とコンポーネント構成

**結論: トグルはスレッドヘッダ内（`#thread-header`）に配置する。独立の Client Component として実装する。**

```
page.tsx (Server Component)
  |
  +-- EliminatedBotToggleProvider (Context Provider, Client Component) <-- 新設
       |
       +-- thread-header 内に EliminatedBotToggle (Client Component)   <-- 新設
       |
       +-- PostList (posts をフィルタ or 非表示制御)
       |
       +-- PostListLiveWrapper (同上)
```

### 3.2 状態管理方式

**結論: React Context (`EliminatedBotToggleContext`) を使用する。**

根拠:
- PostList と PostListLiveWrapper の両方がトグル状態を参照する必要がある
- 両コンポーネントはpage.tsx内で兄弟関係にあるため、propsバケツリレーでも可能だが、page.tsxがServer Componentであり状態を持てない
- Contextを使えば、page.tsx自体の変更を最小限にしつつ、Client Component間で状態を共有できる

```typescript
// src/app/(web)/_components/EliminatedBotToggleContext.tsx

"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface EliminatedBotToggleContextValue {
  /** true: 撃破済みBOTレスを表示する, false: 非表示にする */
  showEliminatedBotPosts: boolean;
  toggle: () => void;
}

const EliminatedBotToggleContext =
  createContext<EliminatedBotToggleContextValue>({
    showEliminatedBotPosts: true,   // デフォルト: 表示
    toggle: () => {},
  });

export function EliminatedBotToggleProvider({
  children,
}: { children: ReactNode }) {
  const [show, setShow] = useState(true);
  return (
    <EliminatedBotToggleContext.Provider
      value={{ showEliminatedBotPosts: show, toggle: () => setShow((v) => !v) }}
    >
      {children}
    </EliminatedBotToggleContext.Provider>
  );
}

export function useEliminatedBotToggle() {
  return useContext(EliminatedBotToggleContext);
}
```

### 3.3 トグルコンポーネント

```typescript
// src/app/(web)/_components/EliminatedBotToggle.tsx

"use client";

import { useEliminatedBotToggle } from "./EliminatedBotToggleContext";

export default function EliminatedBotToggle() {
  const { showEliminatedBotPosts, toggle } = useEliminatedBotToggle();

  return (
    <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
      <input
        type="checkbox"
        checked={showEliminatedBotPosts}
        onChange={toggle}
        data-testid="eliminated-bot-toggle"
      />
      撃破済みBOTレス表示
    </label>
  );
}
```

- BDDシナリオ「全体メニューの『撃破済みBOTレス表示』トグル」に対応
- E2Eテストが `data-testid="eliminated-bot-toggle"` で要素を取得 → `.click()` する
  - `<input type="checkbox">` のclickで checked が切り替わり、onChange が発火する
  - Playwright の `.click()` は label ではなく data-testid に直接マッチする要素をクリックする

### 3.4 トグルOFF時の挙動

**結論: `display: none` （条件レンダリング）を採用する。**

| 方式 | 長所 | 短所 |
|---|---|---|
| `display: none` (条件レンダリング) | DOMから除去されるため `toBeVisible()` が false になる。E2Eテストと完全に整合 | トグル切替時にDOMの追加/削除が発生する |
| `visibility: hidden` | レイアウトが保持される | `toBeVisible()` が false にならない場合がある |
| `opacity: 0` | スムーズな遷移が可能 | `toBeVisible()` が true のまま |

E2Eテストの `await expect(botPost).not.toBeVisible()` は、対象要素がDOMに存在しないか `display: none` のときにパスする。`visibility: hidden` は一部条件でパスしない可能性がある。条件レンダリング方式が最も安全。

実装: PostItem内でトグル状態を参照し、撃破済みBOTレスかつトグルOFFの場合は `null` を返す。

```tsx
// PostItem.tsx の冒頭
const { showEliminatedBotPosts } = useEliminatedBotToggle();

// 撃破済みBOTのレスかつトグルOFFの場合は非表示
if (post.botMark && !showEliminatedBotPosts) {
  return null;
}
```

**代替案（PostList/PostListLiveWrapper側でフィルタ）の不採用理由:**
PostList側でfilterすると `#post-${botPostNumber}` のidを持つDOM要素自体が消えるため、結果は同じ。PostItem側に条件レンダリングを置く方が表示ロジックの凝集度が高く、PostList/PostListLiveWrapperの変更が不要になる。

---

## 4. SSRデータフロー

### 4.1 page.tsx の変更

`fetchThreadDetail()` 関数で `PostService.getPostList()` の代わりに `PostService.getPostListWithBotMark()` を呼び出す。

```diff
 // レス一覧を取得する
-const posts = await PostService.getPostList(thread.id, postListOptions);
+const posts = await PostService.getPostListWithBotMark(thread.id, postListOptions);
```

postsの型が `PostWithBotMark[]` になるため、マッピング時にbotMarkを含める:

```diff
 posts: posts.map((p) => ({
   ...既存フィールド,
+  botMark: p.botMark ?? null,
   createdAt: ...
 })),
```

### 4.2 page.tsx のContext Provider追加

`EliminatedBotToggleProvider` を `AnchorPopupProvider` の内側（`PostFormContextProvider`の外側）に追加する。

```tsx
<main className="max-w-4xl mx-auto px-4 py-4">
  <EliminatedBotToggleProvider>
    {/* thread-header: トグルを含む */}
    <div id="thread-header" ...>
      <Link ... />
      <h1 ...>{thread.title}</h1>
      <p ...>レス数: {thread.postCount}</p>
      <EliminatedBotToggle />
    </div>

    <PaginationNav ... />

    <AnchorPopupProvider initialPosts={posts}>
      <PostFormContextProvider>
        <PostForm ... />
        <PostList posts={posts} />
        <PostListLiveWrapper ... />
      </PostFormContextProvider>
      <AnchorPopup />
    </AnchorPopupProvider>

    <PaginationNav ... />
  </EliminatedBotToggleProvider>
</main>
```

現在のpage.tsxではthread-headerがAnchorPopupProviderの外にあるため、Provider配置範囲の調整が必要。

**推奨実装:** `EliminatedBotToggleProvider` を最外部に配置し、thread-headerからPostListLiveWrapperまでの全領域をラップする。具体的には `<main>` 直下の先頭に配置し、thread-header + AnchorPopupProvider全体を包含する。EliminatedBotToggle（トグルUI）はthread-header内に配置してBDDシナリオ「全体メニュー」に対応する。

### 4.3 ポーリングAPI（GET /api/threads/{threadId}）の変更

`PostListLiveWrapper` はポーリングで `GET /api/threads/{threadId}` を呼び出す。このAPIレスポンスにもbotMarkを含める必要がある。

```diff
 // src/app/api/threads/[threadId]/route.ts
-const [thread, posts] = await Promise.all([
-  PostService.getThread(threadId),
-  PostService.getPostList(threadId),
-]);
+const [thread, posts] = await Promise.all([
+  PostService.getThread(threadId),
+  PostService.getPostListWithBotMark(threadId),
+]);
```

### 4.4 型の流れまとめ

```
DB (posts + bot_posts + bots)
  ↓ PostService.getPostListWithBotMark()
PostWithBotMark[] (サーバー)
  ↓ page.tsx fetchThreadDetail() / API route
Post[] (PostItem.Post型、botMark含む)
  ↓ props
PostList / PostListLiveWrapper
  ↓ props
PostItem (botMark で表示分岐)
```

PostItem.Postの型定義に `botMark?: { hp: number; maxHp: number } | null` が既に存在するため、フロントエンド側の型変更は不要。

---

## 5. テスト方針

### 5.1 単体テスト

| テスト対象 | テスト内容 | ファイル |
|---|---|---|
| PostService.getPostListWithBotMark | 撃破済みBOT(is_active=false)のpostにbotMarkが含まれる | `src/__tests__/lib/services/post-service.test.ts` |
| PostService.getPostListWithBotMark | 活動中BOT(is_active=true)のpostにbotMarkが含まれない（セキュリティ） | 同上 |
| PostService.getPostListWithBotMark | 人間のpostにbotMarkがnull | 同上 |
| PostService.getPostListWithBotMark | bot_postsにレコードがないpost（人間の書き込み）はbotMark=null | 同上 |

### 5.2 E2Eテスト

`e2e/flows/bot-display.spec.ts` の `test.fixme()` を `test()` に変更する条件:
1. PostService.getPostListWithBotMark が実装済みである
2. page.tsx が botMark を含むデータを返す
3. PostItem.tsx が botMark に応じて opacity を適用する
4. EliminatedBotToggle コンポーネントが実装済みである

**E2Eフィクスチャの修正が必要:**
現在の `seedEliminatedBotThreadLocal()` は `bot_posts` テーブルへのINSERTが欠落している。BOTのレス(post_number: 2)に対応する `bot_posts` レコードがないと、`getPostListWithBotMark()` がBOTの書き込みを識別できない。

修正内容: seedの末尾に以下を追加する。
```typescript
// 6. bot_posts紐付けレコード作成
// posts[1] (post_number: 2) がBOTレスなので、そのIDとbotIdを紐付ける
// ※ posts INSERT後にpost_id(UUID)を取得する必要がある
```

### 5.3 test.fixme 解除の判定

bot-display.spec.ts の fixme は、上記の全条件が満たされた実装完了後に解除する。TASK-220（実装タスク）のスコープに含める。

---

## 6. E2Eフィクスチャ不備の指摘

`seedEliminatedBotThreadLocal()` (`e2e/fixtures/data.fixture.ts`) に以下の不備がある:

1. **bot_posts テーブルへのINSERTが欠落** -- BOTレス(post_number: 2)とbotsレコードの紐付けがないため、getPostListWithBotMark()がBOTの書き込みを識別できない
2. **posts INSERT後のpost_id未取得** -- bot_postsレコードを作成するにはpostsのUUIDが必要だが、現在のコードではpostsのINSERTレスポンスからidを取得していない

TASK-220（実装タスク）でこの修正も含めて対応すること。
