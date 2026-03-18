# Code Review Report: TASK-174

> Reviewer: bdd-code-reviewer
> Task: TASK-174
> Date: 2026-03-19
> Scope: Sprint-59~63 UI構造改善 (22ファイル変更)

---

## 指摘事項

---

### [HIGH-001] AnchorPopupProvider / AnchorPopup がスレッドページに配置されていない

ファイル: `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

**問題点:**
設計書 `docs/architecture/components/web-ui.md` section 3.2 では、スレッドページのコンポーネントツリーに `AnchorPopupProvider` と `AnchorPopup` が含まれると明記されている。しかし、実際の `page.tsx` にはこの2つのインポートも配置もない。

`AnchorLink`（PostItem 経由で使用）は `useAnchorPopupContext()` を呼び出すが、Provider が存在しないためデフォルトの no-op コンテキストにフォールバックする。結果として:
- `allPosts` は常に空の Map になる
- `openPopup` は何もしない
- アンカー(`>>N`)クリックしてもポップアップが表示されない

BDD シナリオ `@anchor_popup`（features/thread.feature）で定義された振る舞い全体が実質的に無効化されている。

**修正案:**
`page.tsx` に `AnchorPopupProvider` と `AnchorPopup` を追加する。設計書のコンポーネントツリーに従い、`PostFormContextProvider` の外側に `AnchorPopupProvider` でラップし、ツリー末尾に `<AnchorPopup />` を配置する。`initialPosts` に SSR で取得した `posts` を渡す。

```tsx
import { AnchorPopupProvider } from "../../../_components/AnchorPopupContext";
import AnchorPopup from "../../../_components/AnchorPopup";

// return 部分:
<AnchorPopupProvider initialPosts={posts}>
  <PostFormContextProvider>
    <PostForm threadId={thread.id} />
    <PostList posts={posts} />
    <PostListLiveWrapper ... />
  </PostFormContextProvider>
  <AnchorPopup />
</AnchorPopupProvider>
```

---

### [HIGH-002] PostListLiveWrapper が AnchorPopupContext.registerPosts を呼んでいない

ファイル: `src/app/(web)/_components/PostListLiveWrapper.tsx`

**問題点:**
設計書 (`AnchorPopupContext.tsx` のドキュメントコメント section 3.4) では、`PostListLiveWrapper` がポーリングで取得した新着レスを `registerPosts()` で `allPosts` キャッシュに追加する設計になっている。しかし、実際の `PostListLiveWrapper.tsx` には `registerPosts` のインポートも呼び出しもない。

結果として、HIGH-001 が修正されたとしても、ポーリングで取得した新着レスに対するアンカー (`>>N`) ポップアップが動作しない。SSR時点で取得したレスのみがポップアップ対象となり、その後に追加されたレスは `allPosts` に存在しないため参照できない。

**修正案:**
`PostListLiveWrapper` 内で `useAnchorPopupContext()` から `registerPosts` を取得し、新着レスのフェッチ成功時に呼び出す。

```tsx
import { useAnchorPopupContext } from "./AnchorPopupContext";

// コンポーネント内
const { registerPosts } = useAnchorPopupContext();

// fetchNewPosts 内、freshPosts 追加時
if (freshPosts.length > 0) {
  registerPosts(freshPosts);
  // ... 既存の setNewPosts / setLastPostNumber 処理
}
```

---

### [MEDIUM-001] PaginationNav の id="pagination-nav" がページ内で重複する

ファイル: `src/app/(web)/_components/PaginationNav.tsx:152`
関連: `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx:289,326`

**問題点:**
`PaginationNav` は `id="pagination-nav"` を持つ `<nav>` 要素を返す。スレッドページでは上部と下部の2箇所に配置されるため、同一ページに同じ `id` を持つ要素が2つ存在する。これはHTML仕様違反であり、`document.getElementById()` や自動テストでの要素特定時に予期せぬ動作を引き起こす可能性がある。

**修正案:**
PaginationNav に `position` props ("top" | "bottom") を追加し、`id="pagination-nav-top"` / `id="pagination-nav-bottom"` のように一意な id を生成する。あるいは `id` を除去して `data-testid` に切り替える。

---

### [MEDIUM-002] ThreadCard の id 属性がリスト内で重複する

ファイル: `src/app/(web)/_components/ThreadCard.tsx:100,108,116`

**問題点:**
`ThreadCard` 内の `id="thread-title"` / `id="thread-post-count"` / `id="thread-last-post-at"` は静的な値である。`ThreadList` では複数の `ThreadCard` がレンダリングされるため、同一ページに同じ `id` を持つ要素が複数存在する。MEDIUM-001 と同種のHTML仕様違反。

**修正案:**
`id` を `data-testid` に変更するか、スレッドキーを含めた一意な `id` (例: `id={`thread-title-${threadKey}`}`) に変更する。BDDステップ定義がこれらの `id` に依存している場合は、セレクタも併せて修正する。

---

### [MEDIUM-003] ThreadView / ThreadDetailResponse / Thread の型定義が複数ファイルに重複している

ファイル:
- `src/app/(web)/[boardId]/page.tsx:33` (ThreadView)
- `src/app/(web)/dev/page.tsx:19` (ThreadView)
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx:45,55` (Thread, ThreadDetailResponse)
- `src/app/(web)/_components/PostListLiveWrapper.tsx:44` (ThreadDetailResponse)
- `src/app/(web)/_components/ThreadList.tsx:15` (Thread)

**問題点:**
同一または類似構造の型が5ファイルにローカル定義されている。フィールドの追加・変更時に全箇所を手動で同期する必要があり、変更漏れのリスクがある。DRY原則に反する。

**修正案:**
`src/types/` に `thread-view.ts` を作成し、UI表示用の共通型を一元管理する。各ファイルからインポートして使用する。同様に、Date -> string 変換ロジック（`instanceof Date ? toISOString() : String(...)` パターン）が3箇所に散在しているため、ユーティリティ関数化も併せて検討する。

---

### [LOW-001] Date -> string 変換コードの重複（3箇所）

ファイル:
- `src/app/(web)/[boardId]/page.tsx:75-78`
- `src/app/(web)/dev/page.tsx:43-46`
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx:143-151`

**問題点:**
`instanceof Date ? toISOString() : String(...)` の同一パターンが3箇所に散在している。修正時の同期漏れリスクがある。

**修正案:**
ユーティリティ関数 `toISOStringOrString(value: Date | string): string` を `src/lib/domain/rules/` に作成し、各箇所から呼び出す。MEDIUM-003 の型定義統合と同時に対応するのが効率的。

---

### [LOW-002] parsePaginationRange がスレッドページ内で2回呼ばれる

ファイル: `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx:103,201`

**問題点:**
`fetchThreadDetail` (line 103) と `resolvePollingEnabled` (line 201) の両方で同じ `rangeSegment` に対して `parsePaginationRange()` を呼び出している。純粋関数であるため実害は無視できるが、冗長な計算である。

**修正案:**
`ThreadPage` コンポーネントの冒頭で1回だけパースし、結果を `fetchThreadDetail` と `resolvePollingEnabled` の両方に渡す。あるいは現状のまま許容する（純粋関数のため副作用なし、パフォーマンス影響は無視できる）。

---

## セキュリティチェック結果

| チェック項目 | 結果 |
|---|---|
| ハードコードされた認証情報 | 問題なし |
| XSS脆弱性 | 問題なし -- `dangerouslySetInnerHTML` 未使用。Reactの標準エスケープを使用。設計書の禁止規約 (web-ui.md section 6) に準拠 |
| 環境変数のクライアント露出 | 問題なし -- Server Component から PostService を直接呼び出し、環境変数はサーバーサイドに閉じている |
| パス・トラバーサル | 問題なし -- boardId / threadKey は PostService / ThreadRepository 経由でDBクエリに使用され、ファイルシステムには触れない |
| 認証バイパス | 問題なし -- 閲覧系ページは認証不要の設計。書き込み系は既存の PostForm / AuthModal 経由で認証必須 |
| SQLインジェクション | 問題なし -- Supabase SDK経由のパラメータ化クエリを使用 |

## コーディング規約チェック結果

| チェック項目 | 結果 |
|---|---|
| ユビキタス言語辞書準拠 | 問題なし -- 「レス」「スレッド」「板」「書き込み」「日次リセットID」「アンカー」等の用語が正しく使用されている |
| Server/Client Component 境界 | 適切 -- SSRページは Server Component、インタラクション (Context消費) を持つコンポーネントは Client Component |
| 依存方向 (app -> services -> domain/infra) | 適切 -- ページから PostService を直接呼び出す形式（TDR-006 の例外パターンに該当） |
| domain/rules の純粋性 | 適切 -- pagination-parser.ts は外部依存なしの純粋関数 |
| console.error の使用 | 許容 -- サーバーサイドのエラーログとして適切な用途（デバッグ用 console.log ではない） |

## 良い点

1. **設計書との整合性が高い**: TDR-006 (Cloudflare Workers制約) に基づく `export const dynamic = "force-dynamic"` + サービス層直接呼び出しのパターンが全ページで一貫して適用されている
2. **ページネーションパーサーの設計**: 純粋関数として `src/lib/domain/rules/` に配置し、不正入力のフォールバック処理が堅牢。単体テストのカバレッジも十分（エッジケース含む）
3. **ポーリング二重表示バグの対処**: `PostListLiveWrapper` の `useEffect` による `initialLastPostNumber` 同期処理が的確。stale closure 問題を関数型更新で正しく回避している
4. **コメントの質**: BDD シナリオへの See 参照が各関数・コンポーネントに付与されており、仕様とコードのトレーサビリティが良好
5. **AnchorPopupContext の設計**: Provider 外でのデフォルト no-op 値の提供、`useCallback` / `useMemo` による不要な再レンダリング防止が適切
6. **旧URLリダイレクト**: `/` -> `/battleboard/` と `/threads/[threadId]` -> `/{boardId}/{threadKey}/` のリダイレクトが適切に実装されており、既存URLの破壊を防止している
7. **専ブラ互換**: read.cgi リダイレクト先が新URL形式に正しく変更されており、ThreadRepository による存在確認付き

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 3     | info      |
| LOW      | 2     | note      |

**判定: WARNING** -- マージ前に HIGH 2件の対応を推奨する。

- **HIGH-001**: `AnchorPopupProvider` / `AnchorPopup` をスレッドページに配置する（アンカーポップアップ機能が完全に無効化されている）
- **HIGH-002**: `PostListLiveWrapper` で `registerPosts` を呼び出す（ポーリング新着レスのポップアップ対応）

いずれも `@anchor_popup` BDD シナリオの実行時動作に影響する。修正は局所的であり、推定作業量は合計30分程度。MEDIUM 以下は技術的負債として後続スプリントでの対応でも可。
