---
task_id: TASK-168
sprint_id: Sprint-62
status: completed
assigned_to: bdd-coding
depends_on: [TASK-165]
created_at: 2026-03-19T22:00:00+09:00
updated_at: 2026-03-19T22:00:00+09:00
locked_files:
  - src/app/(web)/_components/ThreadCard.tsx
  - src/app/(web)/_components/ThreadList.tsx
  - src/app/(web)/dev/page.tsx
  - src/app/(web)/[boardId]/page.tsx
---

## タスク概要

スレッド一覧のリンク先を `/threads/{UUID}` → `/{boardId}/{threadKey}/` に変更する。ThreadCard/ThreadList に boardId/threadKey を渡し、リンク生成を新URL形式に統一する。dev板ページも同様に対応する。

## 対象BDDシナリオ
- `features/thread.feature` @url_structure

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §1 — URL構造変更設計
2. [必須] `src/app/(web)/_components/ThreadCard.tsx` — 現行ThreadCard（リンク先 `/threads/${id}`）
3. [必須] `src/app/(web)/_components/ThreadList.tsx` — 現行ThreadList
4. [必須] `src/app/(web)/[boardId]/page.tsx` — TASK-165で作成済み。ThreadView に threadKey/boardId あり
5. [必須] `src/app/(web)/dev/page.tsx` — dev板ページ（同様の対応が必要）

## 修正内容

### A. ThreadCard 修正

`src/app/(web)/_components/ThreadCard.tsx`

1. `ThreadCardProps` に `boardId` と `threadKey` を追加:
   ```typescript
   interface ThreadCardProps {
     id: string;
     title: string;
     postCount: number;
     lastPostAt: string;
     boardId: string;    // 追加
     threadKey: string;   // 追加
   }
   ```
2. リンク先を変更:
   - 変更前: `<Link href={/threads/${id}}>`
   - 変更後: `<Link href={/${boardId}/${threadKey}/}>`
3. `id` props はキーとして残すが、リンク生成には使用しない

### B. ThreadList 修正

`src/app/(web)/_components/ThreadList.tsx`

1. `Thread` インターフェースに `boardId` と `threadKey` を追加:
   ```typescript
   interface Thread {
     id: string;
     title: string;
     postCount: number;
     lastPostAt: string;
     boardId: string;    // 追加
     threadKey: string;   // 追加
   }
   ```
2. ThreadCard へ `boardId` と `threadKey` を伝播:
   ```tsx
   <ThreadCard
     key={thread.id}
     id={thread.id}
     title={thread.title}
     postCount={thread.postCount}
     lastPostAt={thread.lastPostAt}
     boardId={thread.boardId}
     threadKey={thread.threadKey}
   />
   ```

### C. [boardId]/page.tsx 小修正

`src/app/(web)/[boardId]/page.tsx`

- 既に ThreadView に `threadKey` と `boardId` が含まれている（TASK-165で実装済み）
- T4完了の旨のTODOコメントを除去するのみ
- ThreadList に渡す threads データは既に threadKey/boardId を含んでいるため、ThreadList/ThreadCard 側の型変更で自動的に機能する

### D. dev/page.tsx 修正

`src/app/(web)/dev/page.tsx`

1. `ThreadView` インターフェースに `boardId` と `threadKey` を追加:
   ```typescript
   interface ThreadView {
     id: string;
     title: string;
     postCount: number;
     lastPostAt: string;
     boardId: string;    // 追加
     threadKey: string;   // 追加
   }
   ```
2. `fetchDevThreads()` の返り値に `threadKey` と `boardId` を追加:
   ```typescript
   return threads.map((t) => ({
     id: t.id,
     title: t.title,
     postCount: t.postCount,
     lastPostAt: ...,
     threadKey: t.threadKey,
     boardId: t.boardId,
   }));
   ```

## 完了条件
- [ ] ThreadCard のリンク先が `/{boardId}/{threadKey}/` 形式になっている
- [ ] メイン板（`/battleboard/`）のスレッド一覧からスレッドリンクが正しく生成される
- [ ] dev板（`/dev/`）のスレッド一覧からスレッドリンクが正しく生成される
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- リダイレクト処理（T3: TASK-167）
- PaginationNav（T5: TASK-169）
- BDDステップ定義（T9）

## 補足・制約
- PostService.getThreadList() は既に threadKey と boardId を返している（Thread型にフィールドあり）
- ThreadCard の `id` props は React の key として引き続き使用する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: A/B/C/D 全修正完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- A. ThreadCard.tsx: `boardId`/`threadKey` props 追加、リンク先を `/{boardId}/{threadKey}/` に変更
- B. ThreadList.tsx: `Thread` インターフェースに `boardId`/`threadKey` 追加、ThreadCard への伝播追加
- C. [boardId]/page.tsx: 「T4タスクで対応予定」の TODO コメントを完了済みコメントに更新
- D. dev/page.tsx: `ThreadView` に `boardId`/`threadKey` 追加、`fetchDevThreads()` の返り値に両フィールド追加

### テスト結果サマリー

`npx vitest run` 結果:
- PASS: 1374 件（変更前: 1349 件、他タスク追加分を含む）
- FAIL: 1 件（bot-repository.ts の BotRow.next_post_at スキーマ不整合 — 今回の変更と無関係の既存不具合）
- 今回の変更ファイルに起因するテスト失敗: 0 件
- TypeScript 型エラー（変更ファイル）: 0 件
