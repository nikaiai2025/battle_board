# Code Review Report: TASK-181

> Reviewer: bdd-code-reviewer
> Task: TASK-181
> Date: 2026-03-20
> Scope: Sprint-65 差し戻し修正 (Sprint-64 HIGH 2件 + MEDIUM 2件の修正確認)

---

## Sprint-64 指摘の修正確認

### [HIGH-001] AnchorPopupProvider / AnchorPopup がスレッドページに配置されていない → 修正済み

ファイル: `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

**修正内容の確認:**

1. `AnchorPopupProvider` と `AnchorPopup` のインポートが追加されている (line 27-28)
2. `AnchorPopupProvider` が `PostFormContextProvider` を包含する形で配置されている (line 302-335)
3. `initialPosts={posts}` で SSR 取得済みレスが `allPosts` キャッシュに渡されている (line 302)
4. `AnchorPopup` が `AnchorPopupProvider` 内の末尾に1つだけ配置されている (line 334)

**構造の妥当性:**

設計書 (web-ui.md section 3.2) のツリーでは `AnchorPopupProvider` が `PostFormContextProvider` と兄弟レベルに描かれているが、実装では `AnchorPopupProvider` が `PostFormContextProvider` を包含している。これは `PostListLiveWrapper` が `useAnchorPopupContext()` を呼び出して `registerPosts` を取得するため、`PostListLiveWrapper` が `AnchorPopupProvider` の子孫でなければならず、技術的に正しい。`AnchorLink` (PostItem 内) も `useAnchorPopupContext()` を消費するため同様。この構造により、SSR レスのアンカーもポーリング新着レスのアンカーもポップアップが正しく動作する。

**判定: 修正完了。問題なし。**

---

### [HIGH-002] PostListLiveWrapper が AnchorPopupContext.registerPosts を呼んでいない → 修正済み

ファイル: `src/app/(web)/_components/PostListLiveWrapper.tsx`

**修正内容の確認:**

1. `useAnchorPopupContext` のインポートが追加されている (line 31)
2. コンポーネント内で `const { registerPosts } = useAnchorPopupContext()` を取得している (line 85)
3. `fetchNewPosts` 内で `freshPosts.length > 0` の条件下で `registerPosts(freshPosts)` が呼ばれている (line 115)
4. `registerPosts` が `useCallback` の依存配列に含まれている (line 133)

**動作の妥当性:**

- `registerPosts` は `AnchorPopupContext.tsx` (line 161-170) で `useCallback([], [])` として定義されており、安定した参照を持つ。`fetchNewPosts` の依存配列に含めても不要な再生成は発生しない。
- `registerPosts` は `freshPosts` (新着レスのみ) を受け取るため、重複追加は `Map.set` によって既存エントリを上書きする形で無害に処理される。
- `registerPosts` の呼び出しが `setNewPosts` / `setLastPostNumber` より前に配置されている。これにより、新着レスが UI に表示される前に `allPosts` キャッシュに登録され、即座にアンカーポップアップの参照対象となる。

**判定: 修正完了。問題なし。**

---

### [MEDIUM-001] PaginationNav の id="pagination-nav" がページ内で重複する → 修正済み

ファイル: `src/app/(web)/_components/PaginationNav.tsx`

**修正内容の確認:**

- `<nav>` 要素の `id="pagination-nav"` が `data-testid="pagination-nav"` に変更されている (line 154)
- `aria-label="ページナビゲーション"` が維持されており、アクセシビリティは保持されている (line 155)
- コメント (line 149-152) に変更理由が記載されている

**影響範囲の確認:**

- BDD ステップ定義 (`features/step_definitions/`) に `pagination-nav` セレクタへの依存なし (grep 確認済み)
- E2E テストに `#pagination-nav` セレクタへの依存なし (grep 確認済み)

**判定: 修正完了。問題なし。**

---

### [MEDIUM-002] ThreadCard の id 属性がリスト内で重複する → 修正済み

ファイル: `src/app/(web)/_components/ThreadCard.tsx`

**修正内容の確認:**

- `id="thread-title"` → `data-testid="thread-title"` (line 100)
- `id="thread-post-count"` → `data-testid="thread-post-count"` (line 108)
- `id="thread-last-post-at"` → `data-testid="thread-last-post-at"` (line 116)

**影響範囲の確認:**

- `page.tsx` (スレッドページ) のヘッダーにある `<h1 id="thread-title">` はスレッドページに1つだけ存在する一意な要素であり、今回の変更とは無関係。E2E テスト (`e2e/smoke/navigation.spec.ts`, `e2e/basic-flow.spec.ts`) が参照する `#thread-title` はこのヘッダー要素を指しており、ThreadCard の変更による影響は受けない。
- BDD ステップ定義 (`features/step_definitions/`) に `thread-title`, `thread-post-count`, `thread-last-post-at` セレクタへの依存なし (grep 確認済み)

**判定: 修正完了。問題なし。**

---

## 新規指摘の確認

### セキュリティチェック

Sprint-65 の修正は UI コンポーネントの配置変更と HTML 属性の変更のみであり、新たなセキュリティリスクは発生していない。

| チェック項目 | 結果 |
|---|---|
| ハードコードされた認証情報 | 問題なし |
| XSS脆弱性 | 問題なし -- 新規追加コードに `dangerouslySetInnerHTML` 使用なし |
| 環境変数のクライアント露出 | 問題なし |

### コード品質チェック

| チェック項目 | 結果 |
|---|---|
| エラーハンドリング | 適切 -- PostListLiveWrapper の fetch 失敗はサイレント処理（既存設計） |
| React hooks 依存配列 | 適切 -- `registerPosts` が `fetchNewPosts` の依存配列に含まれている |
| Client/Server 境界 | 適切 -- `AnchorPopupProvider` (Client) が Server Component の子として正しく配置 |
| 不要な再レンダリング | 問題なし -- `registerPosts` は `useCallback([], [])` で安定参照 |
| デッドコード | なし |
| console.log デバッグ | なし |

### 既存の技術的負債 (Sprint-64 で延期済み)

以下は Sprint-64 で既に認識されており、後続スプリントへの延期が決定済み。Sprint-65 の修正スコープ外であり、本レビューでは再指摘しない。

- MEDIUM-003: Thread 型定義が複数ファイルに分散
- LOW-001: Date -> string 変換コードの重複
- LOW-002: parsePaginationRange の二重呼び出し

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 0     | pass      |
| LOW      | 0     | pass      |

**判定: APPROVE** -- Sprint-64 で検出された HIGH 2件 + MEDIUM 2件の全てが正しく修正されている。新たな CRITICAL / HIGH の問題は検出されなかった。

### Sprint-64 指摘の対応状況

| 指摘ID | 内容 | 修正状況 |
|---|---|---|
| HIGH-001 | AnchorPopupProvider/AnchorPopup 未配置 | 修正完了 -- page.tsx に正しく配置、initialPosts 渡し済み |
| HIGH-002 | registerPosts 未呼び出し | 修正完了 -- PostListLiveWrapper 内で正しく呼び出し |
| MEDIUM-001 | PaginationNav id 重複 | 修正完了 -- data-testid に変更 |
| MEDIUM-002 | ThreadCard id 重複 | 修正完了 -- data-testid に変更 |
