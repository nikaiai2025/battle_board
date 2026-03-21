---
task_id: TASK-177
sprint_id: Sprint-65
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T23:55:00+09:00
updated_at: 2026-03-19T23:55:00+09:00
locked_files:
  - src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx
  - src/app/(web)/_components/PostListLiveWrapper.tsx
  - src/app/(web)/_components/PaginationNav.tsx
  - src/app/(web)/_components/ThreadCard.tsx
---

## タスク概要

Phase 5コードレビュー(TASK-174)で検出されたHIGH 2件 + MEDIUM 2件のコード修正。アンカーポップアップ機能の有効化と、HTML id重複の修正。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/reports/code_review.md` — レビュー指摘の詳細と修正案
2. [必須] `docs/architecture/components/web-ui.md` §3.2 — 設計書のコンポーネントツリー
3. [参考] `src/app/(web)/_components/AnchorPopupContext.tsx` — AnchorPopupProvider実装
4. [参考] `src/app/(web)/_components/AnchorPopup.tsx` — AnchorPopup実装

## 修正内容

### HIGH-001: AnchorPopupProvider / AnchorPopup をpage.tsxに配置

ファイル: `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

web-ui.md §3.2の設計に従い:
1. `AnchorPopupProvider` で既存コンポーネントツリーをラップ（`initialPosts={posts}` を渡す）
2. `AnchorPopup` をツリー末尾に配置

```tsx
import { AnchorPopupProvider } from "../../../_components/AnchorPopupContext";
import AnchorPopup from "../../../_components/AnchorPopup";

// return部分（既存ツリーをラップ）:
<AnchorPopupProvider initialPosts={posts}>
  <PostFormContextProvider>
    ...
  </PostFormContextProvider>
  <AnchorPopup />
</AnchorPopupProvider>
```

### HIGH-002: PostListLiveWrapper に registerPosts 呼び出し追加

ファイル: `src/app/(web)/_components/PostListLiveWrapper.tsx`

1. `useAnchorPopupContext` から `registerPosts` を取得
2. ポーリングで新着レス取得成功時に `registerPosts(freshPosts)` を呼び出す

```tsx
import { useAnchorPopupContext } from "./AnchorPopupContext";

const { registerPosts } = useAnchorPopupContext();

// fetchNewPosts内、freshPosts追加時
if (freshPosts.length > 0) {
  registerPosts(freshPosts);
}
```

### MEDIUM-001: PaginationNav id重複修正

ファイル: `src/app/(web)/_components/PaginationNav.tsx`

`id="pagination-nav"` を除去し `data-testid="pagination-nav"` に変更。
または `position` propsを追加して `id="pagination-nav-top"` / `id="pagination-nav-bottom"` に分離。
BDDステップ定義が `#pagination-nav` セレクタに依存していないか確認し、依存がある場合は `data-testid` に切り替え。

### MEDIUM-002: ThreadCard id重複修正

ファイル: `src/app/(web)/_components/ThreadCard.tsx`

`id="thread-title"` / `id="thread-post-count"` / `id="thread-last-post-at"` を `data-testid` に変更。
BDDステップ定義が `#thread-title` 等に依存していないか確認し、依存がある場合はステップ定義も修正（ただしfeatures/ は変更禁止のためステップ定義の修正に限る）。

## 完了条件
- [ ] AnchorPopupProvider/AnchorPopup がpage.tsxに正しく配置されていること
- [ ] PostListLiveWrapper が registerPosts を呼び出していること
- [ ] ページ内にid重複がないこと
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` failure 0
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外
- Thread型定義の統合（Code MEDIUM-003は後続スプリント）
- features/ の変更（読み取り専用）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: HIGH-001, HIGH-002, MEDIUM-001, MEDIUM-002 の全4件修正完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- HIGH-001: `page.tsx` に `AnchorPopupProvider`（`initialPosts={posts}`）でラップ + `AnchorPopup` をツリー末尾に配置
- HIGH-002: `PostListLiveWrapper.tsx` に `useAnchorPopupContext` から `registerPosts` を取得し、新着レスフェッチ成功時に `registerPosts(freshPosts)` を呼び出す処理を追加。`useCallback` 依存配列にも `registerPosts` を追加
- MEDIUM-001: `PaginationNav.tsx` の `id="pagination-nav"` を `data-testid="pagination-nav"` に変更（ページ内上下2箇所に配置されるためid重複を解消）
- MEDIUM-002: `ThreadCard.tsx` の `id="thread-title"` / `id="thread-post-count"` / `id="thread-last-post-at"` を全て `data-testid` に変更（リスト内でid重複を解消）
- BDDステップ定義・単体テストのいずれもこれらのidセレクタに依存していないことを確認済み

### テスト結果サマリー
- `npx vitest run`: 64ファイル 1375テスト 全PASS
- `npx cucumber-js`: 252シナリオ (236 passed, 16 pending) / 1315ステップ (1262 passed, 16 pending, 37 skipped) / failure: 0
