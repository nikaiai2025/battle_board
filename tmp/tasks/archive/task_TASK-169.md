---
task_id: TASK-169
sprint_id: Sprint-62
status: completed
assigned_to: bdd-coding
depends_on: [TASK-163, TASK-165]
created_at: 2026-03-19T22:00:00+09:00
updated_at: 2026-03-19T22:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/_components/PaginationNav.tsx"
  - src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx
---

## タスク概要

ページナビゲーションUIコンポーネント（PaginationNav）を新設し、スレッド閲覧ページに配置する。100件ごとのレンジリンク・「最新50」リンクを生成し、postCount <= 50 の場合は非表示とする。

## 対象BDDシナリオ
- `features/thread.feature` @pagination

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §2 — ページネーション設計
2. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §6.2 — スレッドページコンポーネント構成
3. [必須] `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — TASK-165で作成済みのスレッドページ
4. [参考] `src/lib/domain/rules/pagination-parser.ts` — TASK-163で追加した `parsePaginationRange`（URL形式の参考）

## 修正内容

### A. PaginationNav 新設

`[NEW] src/app/(web)/_components/PaginationNav.tsx`

Server Component（リンク生成のみでインタラクティブ性不要）

Props:
```typescript
interface PaginationNavProps {
  boardId: string;
  threadKey: string;
  postCount: number;
}
```

表示ロジック:
1. `postCount <= 50` の場合: **何も表示しない**（`return null`）
2. `postCount > 50` の場合: ページネーションリンクを表示

リンク生成:
- **100件ごとのレンジリンク**: `1-100`, `101-200`, `201-300`, ... 最後のレンジは `{start}-{postCount}`
  - リンク先: `/{boardId}/{threadKey}/{range}`（例: `/battleboard/1234567890/1-100`）
- **「最新50」リンク**: `l50`
  - リンク先: `/{boardId}/{threadKey}/l50`
- **「全件」リンク**: `1-{postCount}`
  - リンク先: `/{boardId}/{threadKey}/1-{postCount}`

UI:
- コンパクトな横並びリンク（5ch風のシンプルなスタイル）
- 例: `[1-100] [101-200] [201-300] [最新50] [全件]`
- `text-xs` サイズ、青リンク色

### B. スレッドページにPaginationNav配置

`src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

1. PaginationNav を import
2. スレッドヘッダとPostForm の間にPaginationNavを配置:
   ```tsx
   <PaginationNav
     boardId={boardId}
     threadKey={threadKey}
     postCount={thread.postCount}
   />
   ```
3. レス一覧の下にもPaginationNavを配置（上下両方に表示する5ch慣習に倣う）

## 完了条件
- [ ] postCount > 50 のスレッドでPaginationNavが表示される
- [ ] postCount <= 50 のスレッドではPaginationNavが表示されない
- [ ] 100件ごとのレンジリンクが正しいURLを生成する
- [ ] 「最新50」リンクが正しいURLを生成する
- [ ] 「全件」リンクが正しいURLを生成する
- [ ] PaginationNav がスレッドヘッダ下とレス一覧下の2箇所に表示される
- [ ] 単体テスト作成（PaginationNav のリンク生成ロジック）
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- PostListLiveWrapper の pollingEnabled（TASK-165で実装済み）
- リダイレクト（T3: TASK-167）
- ThreadCard/ThreadList リンク変更（T4: TASK-168）
- BDDステップ定義（T9）

## 補足・制約
- PaginationNav は Server Component で良い（リンク生成のみ、クリックイベント不要）
- 5ch の実際のページネーション表示を参考にしつつ、シンプルに保つ
- レンジの区切りは100件単位（設計書 §2 に準拠）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [完了] 設計書 §2.6 / タスク指示書 / BDDシナリオ読み込み
- [完了] 単体テスト作成（RED確認後）: `src/__tests__/app/(web)/_components/PaginationNav.test.ts`（25件）
- [完了] PaginationNav 実装: `src/app/(web)/_components/PaginationNav.tsx`
  - `shouldShowPagination()` / `generatePaginationLinks()` を純粋関数としてエクスポート
  - postCount <= 50 → null（非表示）
  - 100件ごとのレンジリンク + 「最新100」+ 「全件」リンク生成
- [完了] スレッドページへの PaginationNav 配置: `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`
  - スレッドヘッダ下（上部）と PostFormContextProvider 下（下部）の2箇所に配置

### テスト結果サマリー

- 単体テスト（PaginationNav）: 25件 PASS
- 既存テスト: 1374件 PASS（1件 FAIL は BotRow.next_post_at の既存スキーマ不整合。本タスクとは無関係）
