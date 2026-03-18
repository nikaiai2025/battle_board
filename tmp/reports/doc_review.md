# ドキュメントレビューレポート (TASK-175)

> 対象: Sprint-59~63 UI構造改善後のドキュメント整合性
> レビュー日: 2026-03-19
> レビュアー: bdd-doc-reviewer

---

## 指摘事項

### [HIGH-001] web-ui.md section 3.2 コンポーネントツリーに AnchorPopupProvider / AnchorPopup が記載されているが page.tsx に実装されていない

**重要度:** HIGH
**対象:** `docs/architecture/components/web-ui.md` section 3.2 vs `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

web-ui.md section 3.2 のコンポーネントツリーには以下の記載がある:

```
└── AnchorPopupProvider [Client Component]  // ポップアップスタック管理 Context
      └── AnchorPopup [Client Component]    // ポップアップカード表示
```

しかし実際の `page.tsx` では `AnchorPopupProvider` も `AnchorPopup` もインポート・使用されていない。import文は PaginationNav, PostForm, PostFormContextProvider, PostItem(型のみ), PostList, PostListLiveWrapper の6つのみ。

`AnchorPopupContext.tsx` にはProviderの実装が存在し、`AnchorLink.tsx` は `useAnchorPopupContext()` を呼び出している。Providerがない状態では AnchorLink のクリック時にデフォルトの no-op コンテキスト (`openPopup: () => {}`, `allPosts: new Map()`) が使われ、ポップアップ機能が動作しない。

**影響:** BDDシナリオ `@anchor_popup` の4シナリオ全てがブラウザ上で機能しない可能性がある。ドキュメントは正しい設計を記述しているが、実装が追いついていない。

**修正方針:** `page.tsx` に `AnchorPopupProvider` と `AnchorPopup` を追加し、web-ui.md のツリーと一致させる。具体的には:
1. `AnchorPopupProvider` で既存ツリーをラップ（`initialPosts={posts}` を渡す）
2. `AnchorPopup` をツリーの末尾に配置

---

### [HIGH-002] web-ui.md section 3.2 のポーリングURL記述が実装と乖離

**重要度:** HIGH
**対象:** `docs/architecture/components/web-ui.md` section 3.2 ポーリング方式

web-ui.md の記述:
> 定期的な `GET /api/threads/{threadId}/posts?since={lastPostNumber}` で新着レスを取得。

実装 (`PostListLiveWrapper.tsx` L89):
```typescript
const res = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
```

2点の乖離:
1. **エンドポイント:** ドキュメントは `/api/threads/{threadId}/posts` だが、実装は `/api/threads/{threadId}`
2. **sinceパラメータ:** ドキュメントは `?since={lastPostNumber}` を記述しているが、実装ではクエリパラメータを使わず全レスを取得してクライアント側でフィルタリング

OpenAPI仕様書(D-04)にも `/api/threads/{threadId}/posts` はPOST（書き込み）のみ定義されており、GETは存在しない。実装は `/api/threads/{threadId}` の GET を使用しており、こちらはOpenAPIに定義済み。

**影響:** 開発者が web-ui.md の記述を信じて `/posts?since=` エンドポイントを呼ぶコードを書くと動作しない。

**修正方針:** web-ui.md のポーリング方式の記述を実装に合わせて修正:
> 定期的な `GET /api/threads/{threadId}` で全レスを取得し、`lastPostNumber` より大きいレスのみを新着として表示。

---

### [MEDIUM-001] web-ui.md section 3.1 のコンポーネントツリーに ThreadCreateForm が欠落

**重要度:** MEDIUM
**対象:** `docs/architecture/components/web-ui.md` section 3.1

web-ui.md section 3.1 のスレッド一覧ページのツリー:
```
app/(web)/[boardId]/page.tsx  [Server Component]
  └── ThreadList [Server Component]
        └── ThreadCard [Server Component]
```

実装 (`[boardId]/page.tsx`) では `ThreadCreateForm` (Client Component) が `ThreadList` より前に配置されている:
```tsx
<ThreadCreateForm />
<p id="auth-prompt" ...>...</p>
<ThreadList threads={threads} />
```

`ThreadCreateForm` はスレッド作成フォームであり、認証連携 (`AuthModal`) も内蔵する。コンポーネントツリーからの欠落によりUIの全体構造を正確に把握できない。

**修正方針:** section 3.1 のツリーに追加:
```
app/(web)/[boardId]/page.tsx  [Server Component]
  └── ThreadCreateForm [Client Component]  // スレッド作成フォーム
        └── AuthModal [Client Component]   // 認証コード入力（未認証時）
  └── ThreadList [Server Component]
        └── ThreadCard [Server Component]
```

---

### [MEDIUM-002] web-ui.md section 3.2 のリダイレクトステータスコード記述が不正確

**重要度:** MEDIUM
**対象:** `docs/architecture/components/web-ui.md` L106

web-ui.md の記述:
> 旧 `threads/[threadId]/page.tsx` はリダイレクト専用に変更済み（UUID→新URLへの**302**リダイレクト）

実装 (`src/app/(web)/threads/[threadId]/page.tsx`) では Next.js の `redirect()` を使用。Next.js の `redirect()` は Server Component でデフォルトで **307** を返す。

同じファイル内の section 3.1 では `/` → `/battleboard/` を「307リダイレクト」と正しく記載しており、同一の `redirect()` 関数使用にもかかわらず記述が不一致。

**修正方針:** 「302リダイレクト」を「307リダイレクト」に修正。

---

### [MEDIUM-003] web-ui.md section 3.2 の PostItem Client Component化の理由が不正確

**重要度:** MEDIUM
**対象:** `docs/architecture/components/web-ui.md` L102

web-ui.md の記述:
> `PostList` / `PostItem` が Client Component に変更（`PostFormContext` と `AnchorPopupContext` を消費するため）

実装では PostItem は `AnchorPopupContext` を直接消費していない:
- PostItem → `usePostFormContext()` (PostFormContext を直接消費)
- PostItem → `AnchorLink` を描画 → AnchorLink が `useAnchorPopupContext()` を消費

Client Component化の直接の理由は `PostFormContext` の消費と `AnchorLink` (Client Component) の描画。AnchorPopupContext は間接依存。

**修正方針:** 記述を「PostFormContext を消費し、AnchorLink (AnchorPopupContext 消費) を描画するため」等に修正。実質的な誤解は生じにくいが正確性の観点で修正推奨。

---

### [LOW-001] ポーリング方式のパフォーマンス懸念（情報提供）

**重要度:** LOW
**対象:** 実装 `PostListLiveWrapper.tsx`

現在のポーリング実装は `GET /api/threads/{threadId}` で全レスを取得しクライアント側でフィルタリングしている。レス数が増加した場合（数百〜1000件）にはレスポンスサイズが大きくなるが、これは設計判断の範囲内であり、現時点では問題ない。将来的に `since` パラメータによる差分取得を導入する場合はOpenAPIとweb-ui.mdを同時に更新すること。

---

## ドキュメント間整合性チェック結果

### 用語使用の一貫性

レビュー対象ドキュメント内でユビキタス言語辞書(D-02)と矛盾する用語使用は検出されなかった。「レス」「スレッド」「書き込み」「アンカー」「日次リセットID」等の用語は辞書に準拠して使用されている。

### BDDテスト戦略書(D-10)との整合性

テスト構成は D-10 section 4 のディレクトリ構成・ファイル分割方針と一致:
- `features/step_definitions/thread.steps.ts` に thread.feature 固有のステップが集約
- `features/support/` に world.ts, hooks.ts, mock-installer.ts が存在
- `features/support/in-memory/` にリポジトリごとのインメモリ実装が存在
- Sprint-59~63 で追加されたテストファイル (`PaginationNav.test.ts`, `AnchorLink.test.tsx`, `AnchorPopup.test.tsx`, `AnchorPopupContext.test.tsx`) は `src/__tests__/app/(web)/_components/` に正しく配置

### OpenAPI仕様書(D-04)との整合性

- スレッド一覧・閲覧の内部URLルーティング変更 (`/threads/{UUID}` → `/{boardId}/{threadKey}/`) はWeb UIルーティングの変更であり、APIエンドポイント自体 (`/api/threads/{threadId}`) は変更されていない。APIレベルでの不整合はない
- ポーリングURLの不一致は HIGH-002 で指摘済み

### アーキテクチャ設計書(D-07)との整合性

- TDR-006 (認証不要のSSRページでサービス層を直接インポート) の記述と実装が一致: `[boardId]/page.tsx` と `[[...range]]/page.tsx` の両方で `PostService` を直接インポートし `export const dynamic = 'force-dynamic'` を設定
- Server Component / Client Component の分類は web-ui.md section 2 の方針と実装が一致 (HIGH-001 の AnchorPopupProvider 欠落を除く)

### 問題なしの確認事項

1. **新コンポーネントの Server/Client 分類**: PaginationNav (Server), AnchorLink (Client), AnchorPopup (Client), AnchorPopupContext (Client), PostFormContext (Client) -- 全て web-ui.md の記載通り `"use client"` ディレクティブの有無で正しく分類
2. **リダイレクト実装**: `page.tsx` (`/` → `/battleboard/`) と `threads/[threadId]/page.tsx` (旧URL → 新URL) は共に `redirect()` で正しく実装
3. **専ブラread.cgiリダイレクト**: `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` が新URL形式 `/{boardId}/{key}/` へリダイレクトしており、URL構造変更に追従済み
4. **dangerouslySetInnerHTML禁止**: PostItem.tsx は `white-space: pre-wrap` と `parseAnchorLinks()` による React標準エスケープを使用。web-ui.md section 6 の制約に準拠

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 3     | info      |
| LOW      | 1     | note      |

判定: WARNING -- マージ前に2件のHIGH（重要）な問題を解決してください。

### HIGH指摘の要旨

1. **HIGH-001**: `page.tsx` に `AnchorPopupProvider` / `AnchorPopup` が組み込まれておらず、ドキュメントに記載された設計が実装されていない。アンカーポップアップ機能 (`@anchor_popup` シナリオ 4件) がブラウザ上で動作しない可能性がある
2. **HIGH-002**: ポーリングURLの記述が実装と乖離 (エンドポイント名・クエリパラメータの両方が不一致)。開発者が誤った前提でコードを修正するリスクがある
