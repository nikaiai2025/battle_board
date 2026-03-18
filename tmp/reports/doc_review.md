# ドキュメントレビューレポート (TASK-182)

> 対象: Sprint-65 差し戻し修正 -- web-ui.md (Sprint-64 HIGH 1件 + MEDIUM 3件の修正確認)
> レビュー日: 2026-03-20
> レビュアー: bdd-doc-reviewer

---

## Sprint-64 指摘の修正確認

### [HIGH-001] AnchorPopupProvider / AnchorPopup の記述 -- 修正済み (部分的に不正確)

**Sprint-64 指摘:** web-ui.md section 3.2 のコンポーネントツリーに記載されているが page.tsx に実装されていない
**Sprint-65 対応:** TASK-177 で page.tsx に配置、TASK-178 で web-ui.md を更新

**確認結果:** page.tsx への配置は正しく行われている (L302-335)。AnchorPopupProvider が PostFormContextProvider の外側にラップし、AnchorPopup がその内部末尾に配置されている。PostListLiveWrapper も registerPosts を呼び出している (L85, L115)。

ただし、web-ui.md のコンポーネントツリーと実装の間にネスト構造の差異が残存している (後述 MEDIUM-NEW-001)。

---

### [HIGH-002] ポーリングURL記述 -- 修正済み

**Sprint-64 指摘:** ドキュメントは `/api/threads/{threadId}/posts?since={lastPostNumber}` だが実装は `/api/threads/{threadId}`
**Sprint-65 対応:** TASK-178 で web-ui.md のポーリング方式記述を修正

**確認結果:** web-ui.md L99 の記述:
> 定期的な `GET /api/threads/{threadId}` で全レスを取得し、`lastPostNumber` より大きいレスのみを新着として表示。

PostListLiveWrapper.tsx L96 の実装:
```typescript
const res = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
```

エンドポイント・フィルタリング方式ともに一致。修正完了。

---

### [MEDIUM-001] ThreadCreateForm 欠落 -- 修正済み

**Sprint-64 指摘:** section 3.1 のコンポーネントツリーに ThreadCreateForm がない
**Sprint-65 対応:** TASK-178 で section 3.1 に追加

**確認結果:** web-ui.md L64-65:
```
└── ThreadCreateForm [Client Component]  // スレッド作成フォーム
      └── AuthModal [Client Component]   // 認証コード入力（未認証時）
```

実装 (`[boardId]/page.tsx` L118-119) では `<ThreadCreateForm />` が `<ThreadList>` の前に配置されており、ThreadCreateForm.tsx (L24) で AuthModal をインポートしている。記述と実装が一致。修正完了。

---

### [MEDIUM-002] リダイレクトステータスコード -- 修正済み

**Sprint-64 指摘:** 「302リダイレクト」と記載されているが Next.js の redirect() は 307 を返す
**Sprint-65 対応:** TASK-178 で 307 に修正

**確認結果:** web-ui.md L108:
> 旧 `threads/[threadId]/page.tsx` はリダイレクト専用に変更済み（UUID→新URLへの**307**リダイレクト）

実装 (`threads/[threadId]/page.tsx` L46) では `redirect()` を使用しており、Next.js Server Component のデフォルト 307 と一致。section 3.1 の `/` -> `/battleboard/` (L77) も同様に 307 と記載されており、ファイル内の一貫性も確保されている。修正完了。

---

### [MEDIUM-003] PostItem 依存記述 -- 修正済み

**Sprint-64 指摘:** 「PostFormContext と AnchorPopupContext を消費するため」は不正確。PostItem は AnchorPopupContext を直接消費していない
**Sprint-65 対応:** TASK-178 で記述を修正

**確認結果:** web-ui.md L104:
> `PostList` / `PostItem` が Client Component に変更（`PostFormContext` を消費し、`AnchorLink`（`AnchorPopupContext` 消費）を描画するため）

実装:
- PostItem.tsx L24: `usePostFormContext()` を直接消費
- PostItem.tsx L23: `AnchorLink` をインポートし、parseAnchorLinks() (L106) で AnchorLink を生成
- AnchorLink.tsx L17: `useAnchorPopupContext()` を消費

依存の直接/間接関係が正確に記述されている。修正完了。

---

## 新規指摘事項

### [MEDIUM-NEW-001] section 3.2 コンポーネントツリーのネスト構造が実装と不一致

**重要度:** MEDIUM
**対象:** `docs/architecture/components/web-ui.md` L82-94 vs `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` L262-348

web-ui.md のツリー表記 (L82-94):
```
page.tsx [Server Component]
  └── PaginationNav [Server]              // 上部
  └── PostFormContextProvider [Client]     // ---- (A)
        └── PostForm
        └── PostList
        └── PostListLiveWrapper
  └── PaginationNav [Server]              // 下部
  └── AnchorPopupProvider [Client]        // ---- (B) PostFormContextProvider と兄弟
        └── AnchorPopup
```

実装の JSX ツリー (L291-345):
```
page.tsx [Server Component]
  └── PaginationNav [Server]              // 上部
  └── AnchorPopupProvider [Client]        // ---- (B) PostFormContextProvider の *親*
        └── PostFormContextProvider [Client]  // ---- (A) AnchorPopupProvider の *子*
              └── PostForm
              └── PostList
              └── PostListLiveWrapper
        └── AnchorPopup
  └── PaginationNav [Server]              // 下部
```

2点の相違:
1. **親子関係の逆転:** ドキュメントでは `AnchorPopupProvider` が `PostFormContextProvider` と同列の兄弟要素だが、実装では `AnchorPopupProvider` が `PostFormContextProvider` を包含する親要素になっている
2. **下部 PaginationNav の位置:** ドキュメントでは `AnchorPopupProvider` の前 (L92) に配置されているが、実装では `AnchorPopupProvider` の後 (L341-345) に配置されている

**影響:** 実装のネスト構造は正しい。`PostItem` -> `AnchorLink` -> `useAnchorPopupContext()` というコンテキスト消費チェーンが成立するためには、`AnchorPopupProvider` が `PostList` (および `PostListLiveWrapper`) の祖先要素である必要がある。ドキュメントのフラット構造では React の Context が届かず、アンカーポップアップ機能が動作しない。

つまり実装が設計意図に対して正しく、ドキュメントのツリー表記が不正確である。開発者がこのツリー図を参照してコンポーネントを再配置した場合、Context の Provider/Consumer 関係が壊れるリスクがある。

**修正方針:** section 3.2 のツリーを以下に修正:
```
app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx  [Server Component]
  └── PaginationNav [Server Component]      // ページナビゲーション（上部）
  └── AnchorPopupProvider [Client Component]  // ポップアップスタック管理 Context
        └── PostFormContextProvider [Client Component]  // レス番号クリック → PostForm テキスト挿入 Context
              └── PostForm [Client Component]
                    └── AuthModal [Client Component]
              └── PostList [Client Component]
                    └── PostItem [Client Component]
                          └── AnchorLink [Client Component]
              └── PostListLiveWrapper [Client Component]
                    └── PostItem [Client Component]
        └── AnchorPopup [Client Component]    // ポップアップカード表示
  └── PaginationNav [Server Component]      // ページナビゲーション（下部）
```

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 1     | info      |
| LOW      | 0     | pass      |

判定: APPROVE -- Sprint-64 で検出された HIGH 2件 + MEDIUM 3件の修正は全て正しく行われている。新規 MEDIUM 1件 (コンポーネントツリーのネスト構造表記) はマージを妨げない。

### Sprint-64 指摘の修正状況

| 指摘ID | 重要度 | 修正状況 |
|--------|--------|----------|
| HIGH-001 | HIGH | 修正済み (AnchorPopupProvider/AnchorPopup 配置完了) |
| HIGH-002 | HIGH | 修正済み (ポーリングURL記述を実装に一致) |
| MEDIUM-001 | MEDIUM | 修正済み (ThreadCreateForm 追加) |
| MEDIUM-002 | MEDIUM | 修正済み (302 -> 307 修正) |
| MEDIUM-003 | MEDIUM | 修正済み (PostItem 依存記述の正確化) |

### 新規指摘

| 指摘ID | 重要度 | 概要 |
|--------|--------|------|
| MEDIUM-NEW-001 | MEDIUM | section 3.2 コンポーネントツリーのネスト構造 (AnchorPopupProvider の親子関係・PaginationNav の位置) が実装と不一致 |
