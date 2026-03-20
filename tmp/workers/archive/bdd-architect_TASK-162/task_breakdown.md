# TASK-162 実装タスク分解

> 作成日: 2026-03-19
> 設計書: `tmp/workers/bdd-architect_TASK-162/design.md`

---

## タスク依存関係図

```
T1 (基盤: pagination-parser + PostService改修)
 │
 ├─→ T2 (URL構造変更: ルーティング)  ←─── T1
 │     │
 │     ├─→ T3 (リダイレクト: 旧URL + ルート + read.cgi)  ←─── T2
 │     │
 │     └─→ T4 (リンク生成: ThreadCard + ThreadList)  ←─── T2
 │
 ├─→ T5 (ページネーション: UI + ポーリング条件分岐)  ←─── T1, T2
 │
 ├─→ T6 (レス番号表示 + PostFormテキスト挿入)  ←─── (独立だがT2完了後の統合テストを推奨)
 │
 └─→ T7 (アンカーポップアップ)  ←─── T6 (PostItemのClient化が前提)

T8 (ドキュメント更新: web-ui.md)  ←─── T2〜T7 全完了後

T9 (BDDステップ定義)  ←─── T2〜T7 全完了後
```

---

## T1: 基盤 — pagination-parser + PostService改修

### 概要
ページネーション範囲パーサー（純粋関数）の新設と、PostServiceのレス取得メソッド改修。URL構造変更・ページネーションの両方の前提となる基盤タスク。

### 作業内容
1. `src/lib/domain/rules/pagination-parser.ts` 新設
   - `parsePaginationRange(segment?: string): PaginationRange`
   - デフォルト / 範囲指定 / 最新N件の3パターン
2. `src/__tests__/lib/domain/rules/pagination-parser.test.ts` 単体テスト新設
3. `src/lib/services/post-service.ts` 改修
   - `getThreadByThreadKey(threadKey: string): Promise<Thread | null>` 新設
   - `getPostList()` に `range` / `latestCount` オプション追加
4. `src/lib/infrastructure/repositories/post-repository.ts` 改修
   - `findByThreadId()` に `toPostNumber` / `latestCount` オプション追加

### locked_files 候補
```
- src/lib/domain/rules/pagination-parser.ts  [NEW]
- src/__tests__/lib/domain/rules/pagination-parser.test.ts  [NEW]
- src/lib/services/post-service.ts
- src/lib/infrastructure/repositories/post-repository.ts
```

### 見積もり
小〜中（純粋関数 + クエリ拡張。ビジネスロジック変更は少ない）

---

## T2: URL構造変更 — 新ルーティング

### 概要
`/[boardId]/[threadKey]/` 形式の新ルート作成。スレッド一覧ページとスレッド閲覧ページを新パスに配置する。

### 作業内容
1. `src/app/(web)/[boardId]/page.tsx` 新設
   - 現行 `src/app/(web)/page.tsx` のスレッド一覧ロジックをここに移動
   - `boardId` パラメータで板を切り替え（当面は battleboard のみ）
2. `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` 新設
   - 現行 `src/app/(web)/threads/[threadId]/page.tsx` のロジックをベースに、threadKey指定 + ページネーション対応版を新設
   - `PostService.getThreadByThreadKey(threadKey)` でスレッド取得
   - `parsePaginationRange(range?.[0])` でレス範囲決定
   - `PostService.getPostList(thread.id, rangeOptions)` でレス取得
   - PostListLiveWrapper に `pollingEnabled` を渡す

### 依存
- T1 (PostService改修が必要)

### locked_files 候補
```
- src/app/(web)/[boardId]/page.tsx  [NEW]
- src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx  [NEW]
```

### 見積もり
中（新ルート2つ。既存ロジックのベース流用あり）

---

## T3: リダイレクト — 旧URL互換 + ルート + read.cgi

### 概要
旧URL `/threads/{UUID}` → 新URL `/{boardId}/{threadKey}/` のリダイレクト、`/` → `/battleboard/` のリダイレクト、read.cgiのリダイレクト先変更。

### 作業内容
1. `src/app/(web)/page.tsx` 書き換え
   - スレッド一覧ロジックを除去し、`redirect('/battleboard/')` のみに変更
2. `src/app/(web)/threads/[threadId]/page.tsx` 書き換え
   - スレッド閲覧ロジックを除去し、UUID→threadKey逆引き後に `redirect(/${boardId}/${threadKey}/)` に変更
3. `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` 修正
   - リダイレクト先を `/threads/${thread.id}` → `/${thread.boardId}/${thread.threadKey}/` に変更

### 依存
- T2 (リダイレクト先の新ルートが存在している必要がある)

### locked_files 候補
```
- src/app/(web)/page.tsx
- src/app/(web)/threads/[threadId]/page.tsx
- src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts
```

### 見積もり
小（既存ファイルの書き換え。ロジックはシンプル）

---

## T4: リンク生成 — ThreadCard + ThreadList 修正

### 概要
スレッド一覧のリンク先を `/threads/{UUID}` → `/{boardId}/{threadKey}/` に変更する。

### 作業内容
1. `src/app/(web)/_components/ThreadCard.tsx` 修正
   - `boardId`, `threadKey` propsを追加
   - `<Link href={/${boardId}/${threadKey}/}>` に変更
2. `src/app/(web)/_components/ThreadList.tsx` 修正
   - Thread型に `boardId`, `threadKey` を追加
   - ThreadCardへ伝播
3. 板ページ（`[boardId]/page.tsx`）の `fetchThreads()` を修正
   - 返り値に `boardId`, `threadKey` を含める
4. `src/app/(web)/dev/page.tsx` 修正（dev板のThreadList呼び出しも対応）

### 依存
- T2 (新ルートが存在している必要がある)

### locked_files 候補
```
- src/app/(web)/_components/ThreadCard.tsx
- src/app/(web)/_components/ThreadList.tsx
- src/app/(web)/dev/page.tsx
```

### 見積もり
小（props追加とリンク先変更のみ）

---

## T5: ページネーション — UI + ポーリング条件分岐

### 概要
ページナビゲーションUI（PaginationNav）の新設と、PostListLiveWrapperへのポーリング有効/無効制御の追加。

### 作業内容
1. `src/app/(web)/_components/PaginationNav.tsx` 新設
   - 100件ごとのレンジリンク生成
   - 「最新100」リンク
   - `postCount <= 100` で非表示
2. `src/app/(web)/_components/PostListLiveWrapper.tsx` 修正
   - `pollingEnabled: boolean` propsを追加
   - falseの場合はsetIntervalを設定しない
3. スレッドページ（T2で作成済み）にPaginationNavを配置

### 依存
- T1 (pagination-parser)
- T2 (スレッドページの新ルート)

### locked_files 候補
```
- src/app/(web)/_components/PaginationNav.tsx  [NEW]
- src/app/(web)/_components/PostListLiveWrapper.tsx
```

### 見積もり
小〜中（UIコンポーネント新設 + 既存コンポーネントの小改修）

---

## T6: レス番号表示 + PostFormテキスト挿入

### 概要
レス番号の `>>` 除去、クリック時のPostFormテキスト挿入を実装する。PostItem のClient Component化もここで行う。

### 作業内容
1. `src/app/(web)/_components/PostFormContext.tsx` 新設
   - `insertText: (text: string) => void` のみを提供するContext
2. `src/app/(web)/_components/PostForm.tsx` 修正
   - `PostFormContext.Provider` で値を提供
   - `insertText` コールバック実装: 空なら挿入、非空なら改行+挿入
3. `src/app/(web)/_components/PostItem.tsx` 修正
   - `"use client"` ディレクティブ追加
   - レス番号表示から `>>` を除去
   - レス番号をクリック可能なボタンに変更
   - PostFormContext の `insertText` を呼び出す
4. `src/app/(web)/_components/PostList.tsx` 修正
   - PostItem のClient Component化に伴い、PostList もClient Componentに変更

### 依存
- なし（独立して着手可能）

### locked_files 候補
```
- src/app/(web)/_components/PostFormContext.tsx  [NEW]
- src/app/(web)/_components/PostForm.tsx
- src/app/(web)/_components/PostItem.tsx
- src/app/(web)/_components/PostList.tsx
```

### 見積もり
中（PostItem/PostListのClient Component化、Context新設）

---

## T7: アンカーポップアップ

### 概要
`>>N` クリック時のポップアップ表示。ネストポップアップ対応、外側クリックで最前面のみ閉じる。

### 作業内容
1. `src/app/(web)/_components/AnchorPopupContext.tsx` 新設
   - ポップアップスタック管理 (PopupEntry[])
   - `openPopup()`, `closeTopPopup()`, `closeAllPopups()`
2. `src/app/(web)/_components/AnchorPopup.tsx` 新設
   - ポップアップカード表示（PostItem再利用）
   - z-index スタック管理
   - 外側クリック検知
3. `src/app/(web)/_components/AnchorLink.tsx` 新設
   - `>>N` テキスト表示
   - クリック時に `openPopup(postNumber, position)` を呼び出す
4. `src/app/(web)/_components/PostItem.tsx` 修正
   - `parseAnchorLinks()` のリンク生成部分を `AnchorLink` に置換
5. スレッドページにAnchorPopupProvider + AnchorPopupを配置

### 依存
- T6 (PostItem が Client Component になっていること)

### locked_files 候補
```
- src/app/(web)/_components/AnchorPopupContext.tsx  [NEW]
- src/app/(web)/_components/AnchorPopup.tsx  [NEW]
- src/app/(web)/_components/AnchorLink.tsx  [NEW]
- src/app/(web)/_components/PostItem.tsx
```

### 注意
- PostItem.tsx は T6 でも変更される。T6 完了後に着手すること。

### 見積もり
中〜大（ポップアップスタック管理、ネスト対応、イベントハンドリング）

---

## T8: ドキュメント更新

### 概要
web-ui.md（D-08）のコンポーネント境界、URL構造をコード変更に合わせて更新する。

### 作業内容
1. `docs/architecture/components/web-ui.md` 更新
   - §3.1 スレッド一覧ページ: パス変更 (`page.tsx` → `[boardId]/page.tsx`)
   - §3.2 スレッドページ: パス変更、コンポーネント構成図更新
   - §3.2 に PaginationNav, AnchorPopupProvider, PostFormContext を追記

### 依存
- T2〜T7 全完了後

### locked_files 候補
```
- docs/architecture/components/web-ui.md
```

### 見積もり
小

---

## T9: BDDステップ定義

### 概要
新規19シナリオ + 専ブラ互換変更2件のステップ定義を実装する。

### 作業内容
1. `features/step_definitions/thread.steps.ts` にステップ追加
   - @url_structure (5シナリオ)
   - @pagination (7シナリオ)
   - @anchor_popup (4シナリオ)
   - @post_number_display (3シナリオ)
2. `features/step_definitions/specialist_browser_compat.steps.ts` にステップ修正
   - read.cgiリダイレクト先変更
   - 板トップ直接表示

### 依存
- T2〜T7 全完了後（テスト対象のコードが存在していること）

### locked_files 候補
```
- features/step_definitions/thread.steps.ts
- features/step_definitions/specialist_browser_compat.steps.ts
```

### 見積もり
大（19シナリオ分のステップ定義。UI操作のシミュレーション含む）

---

## 推奨実行順序

| 順序 | タスク | 並列可否 |
|---|---|---|
| 1 | T1 (基盤) | 単独 |
| 2 | T6 (レス番号表示) | T1と並列可 |
| 3 | T2 (URL構造) | T1完了後 |
| 4 | T3 (リダイレクト) + T4 (リンク生成) | T2完了後、互いに並列可 |
| 5 | T5 (ページネーション) | T2完了後 |
| 6 | T7 (アンカーポップアップ) | T6完了後 |
| 7 | T8 (ドキュメント) + T9 (BDDステップ) | T2〜T7全完了後 |

### クリティカルパス

```
T1 → T2 → T5 (ページネーション完了)
T6 → T7 (アンカーポップアップ完了)
全完了 → T8, T9
```

最短完了のためには T1 と T6 を並列で開始し、T2完了後に T3/T4/T5 を並列で進めるのが効率的。
