---
task_id: TASK-167
sprint_id: Sprint-62
status: completed
assigned_to: bdd-coding
depends_on: [TASK-165]
created_at: 2026-03-19T22:00:00+09:00
updated_at: 2026-03-19T22:00:00+09:00
locked_files:
  - src/app/(web)/page.tsx
  - src/app/(web)/threads/[threadId]/page.tsx
  - src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts
---

## タスク概要

旧URL `/threads/{UUID}` → 新URL `/{boardId}/{threadKey}/` へのリダイレクト、`/` → `/battleboard/` のリダイレクト、read.cgiリダイレクト先変更の3件を実装する。Sprint-61(TASK-165)で新ルートが作成済みのため、旧ルートをリダイレクト専用に置き換える。

## 対象BDDシナリオ
- `features/thread.feature` @url_structure

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §1 — URL構造変更設計
2. [必須] `src/app/(web)/page.tsx` — 現行トップページ（リダイレクト化する）
3. [必須] `src/app/(web)/threads/[threadId]/page.tsx` — 現行スレッドページ（リダイレクト化する）
4. [必須] `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` — 現行read.cgiリダイレクト
5. [参考] `src/app/(web)/[boardId]/page.tsx` — TASK-165で作成済みの新ルート（リダイレクト先）
6. [参考] `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — TASK-165で作成済み

## 修正内容

### A. トップページリダイレクト

`src/app/(web)/page.tsx`

- 現行のスレッド一覧表示ロジック（fetchThreads, ThreadList等）を全て除去
- `redirect('/battleboard/')` のみに変更（Next.js の `redirect()` 関数使用）
- Server Component のまま（`redirect()` はServer Componentで使用する）
- import は `next/navigation` の `redirect` のみで十分

### B. 旧スレッドURLリダイレクト

`src/app/(web)/threads/[threadId]/page.tsx`

- 現行のスレッド詳細表示ロジック（fetchThreadDetail, PostList等）を全て除去
- UUID (threadId) でスレッドを取得し、`/{boardId}/{threadKey}/` へリダイレクト
- 手順:
  1. `PostService.getThread(threadId)` でスレッドを取得
  2. スレッドが存在しない場合は `notFound()`
  3. `redirect(/${thread.boardId}/${thread.threadKey}/)` でリダイレクト
- 不要になる import を全て除去（PostForm, PostList, PostListLiveWrapper, Link 等）

### C. read.cgi リダイレクト先変更

`src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts`

- リダイレクト先を `/threads/${thread.id}` → `/${thread.boardId}/${thread.threadKey}/` に変更
- 注意: `findByThreadKey()` は `boardId` を返さないため、boardId は URL パラメータから取得する
  - `const { boardId, key } = await params` で boardId を取得
  - リダイレクト先: `/${boardId}/${key}/`（keyがthreadKeyそのもの）
- ThreadRepository の import は不変

## 完了条件
- [ ] `/` アクセスで `/battleboard/` にリダイレクトされる
- [ ] `/threads/{UUID}` アクセスで `/{boardId}/{threadKey}/` にリダイレクトされる
- [ ] 存在しないUUIDでは404が返る
- [ ] `/test/read.cgi/{boardId}/{key}/` で `/{boardId}/{key}/` にリダイレクトされる
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- 新ルートのロジック（TASK-165で実装済み）
- ThreadCard/ThreadList のリンク先変更（T4: TASK-168）
- PaginationNav（T5: TASK-169）
- BDDステップ定義（T9）

## 補足・制約
- `redirect()` は Next.js の `next/navigation` から import する
- リダイレクトは 308 (permanent redirect) ではなく、Next.js のデフォルト挙動（307 temporary）で問題ない。将来的に旧URLを完全廃止する段階で308に変更可能
- read.cgi の変更では `boardId` パラメータをURLから取得できるため、DB追加クエリは不要

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: A（トップページリダイレクト）、B（旧スレッドURLリダイレクト）、C（read.cgiリダイレクト先変更）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/app/(web)/page.tsx`: 旧スレッド一覧ロジックを全除去し、`redirect('/battleboard/')` のみに変更
- `src/app/(web)/threads/[threadId]/page.tsx`: 旧スレッド詳細ロジックを全除去し、UUID → threadKey リダイレクト専用に変更
- `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts`: リダイレクト先を `/threads/${thread.id}` → `/${boardId}/${key}/` に変更。boardId はURLパラメータから取得するため DB 追加クエリなし

### テスト結果サマリー

- `npx vitest run` 実行結果: 1374 PASS / 1 FAIL
- 失敗1件（`schema-consistency.test.ts`: `BotRow.next_post_at` が DB テーブルに存在しない）は今回の変更前から存在する既存の問題（git stash で変更前に確認済み）。このタスクの実装とは無関係
- 今回の実装による新規テスト失敗: 0件
