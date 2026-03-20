---
task_id: TASK-165
sprint_id: Sprint-61
status: completed
assigned_to: bdd-coding
depends_on: [TASK-163]
created_at: 2026-03-19T21:00:00+09:00
updated_at: 2026-03-19T21:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/[boardId]/page.tsx"
  - "[NEW] src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx"
---

## タスク概要

URL構造を `/threads/{UUID}` から `/{boardId}/{threadKey}/` に変更する新ルーティングを作成する。スレッド一覧ページ（板トップ）とスレッド閲覧ページ（ページネーション対応）の2つの新ルートを追加する。既存ルートの改修（リダイレクト化等）は後続タスク。

## 対象BDDシナリオ
- `features/thread.feature` @url_structure @pagination

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §1（URL構造変更）, §2（ページネーション）, §6（コンポーネント境界図）, §7（データフロー）
2. [必須] `src/app/(web)/page.tsx` — 現行トップページ（スレッド一覧ロジック。このロジックを新ルートに移動）
3. [必須] `src/app/(web)/threads/[threadId]/page.tsx` — 現行スレッドページ（ベースロジック参考）
4. [必須] `src/lib/services/post-service.ts` — TASK-163で追加した `getThreadByThreadKey`, `getPostList(options)`
5. [必須] `src/lib/domain/rules/pagination-parser.ts` — TASK-163で追加した `parsePaginationRange`
6. [参考] `src/app/(web)/_components/PostFormContext.tsx` — TASK-164で追加（PostFormContextProviderのラップが必要）
7. [参考] `src/app/(web)/_components/PostListLiveWrapper.tsx` — pollingEnabled props追加が必要

## 修正内容

### A. 板トップページ（スレッド一覧）

`[NEW] src/app/(web)/[boardId]/page.tsx`

- 現行 `src/app/(web)/page.tsx` のスレッド一覧取得ロジックをここに移動
- `boardId` パラメータを受け取る（当面は battleboard のみだが将来拡張可能）
- Server Component + `export const dynamic = 'force-dynamic'`
- PostService.getThreadList() を直接呼び出し（TDR-006: Cloudflare Workers制約）
- ThreadList/ThreadCard に `boardId` と各スレッドの `threadKey` を渡す
  - ThreadCard のリンク先: `/{boardId}/{threadKey}/`

### B. スレッド閲覧ページ（ページネーション対応）

`[NEW] src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

- 現行 `src/app/(web)/threads/[threadId]/page.tsx` をベースに新設
- threadKey で `PostService.getThreadByThreadKey(threadKey)` を呼び出し
- `parsePaginationRange(range?.[0])` でレス範囲を決定
- `PostService.getPostList(thread.id, rangeOptions)` でレス取得
- ページネーション判定:
  - `postCount <= 50` でデフォルトの場合: 全レス表示
  - `postCount > 50` でデフォルトの場合: `{ latestCount: 50 }` で最新50件
- PostListLiveWrapper に `pollingEnabled` を渡す:
  - デフォルト / latest → true
  - range指定で末尾 < postCount → false
- PostFormContextProvider でラップ（設計書 §6.2）
- 「一覧に戻る」リンク: `/${boardId}/`

### C. PostListLiveWrapper 小改修

`src/app/(web)/_components/PostListLiveWrapper.tsx`

- `pollingEnabled?: boolean` props追加（デフォルト: true）
- false の場合は setInterval を設定しない

注意: このファイルは locked_files に含めていないが、小さな props 追加のみで競合リスクは低い。もし競合が生じる場合はエスカレーションすること。

## 完了条件
- [ ] `/{boardId}/` でスレッド一覧が表示される
- [ ] `/{boardId}/{threadKey}/` でスレッドが表示される
- [ ] `/{boardId}/{threadKey}/1-100` で範囲指定表示される
- [ ] `/{boardId}/{threadKey}/l50` で最新50件表示される
- [ ] デフォルト表示で最新50件が表示される（postCount > 50の場合）
- [ ] PostListLiveWrapper の pollingEnabled が機能する
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- 旧URL `/threads/{UUID}` のリダイレクト化（T3）
- `/` → `/battleboard/` リダイレクト（T3）
- ThreadCard/ThreadList のリンク先変更（T4）
- PaginationNav UIコンポーネント（T5）
- read.cgiリダイレクト先変更（T3）
- BDDステップ定義（T9）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: A（板トップページ）、B（スレッド閲覧ページ）、C（PostListLiveWrapper pollingEnabled追加）すべて完了
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ

- `src/app/(web)/_components/PostListLiveWrapper.tsx` — `pollingEnabled?: boolean` props追加（デフォルトtrue）。false時はsetIntervalを設定しない
- `src/app/(web)/[boardId]/page.tsx` — 板トップページ（スレッド一覧）を新規作成。PostService.getThreadList()でSSR
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — スレッド閲覧ページ（ページネーション対応）を新規作成。
  - parsePaginationRange()でURL範囲解析
  - PostService.getThreadByThreadKey()でthreadKey→Thread
  - PostService.getPostList()で範囲指定レス取得
  - デフォルト表示: postCount>50なら最新50件、以下なら全件
  - pollingEnabled判定: default/latest→true、range末尾<postCount→false
  - PostFormContextProviderでラップ

### テスト結果サマリー

- 単体テスト: 62 passed / 1 failed（schema-consistency.test.ts — BotRow.next_post_at スキーマ不整合。このタスクとは無関係な既存問題）
- このタスクで作成したファイルに関するテストエラーなし
- 変更前の失敗件数（2件）と比較して増加なし（むしろ1件減少: AnchorPopup.test.tsxが同時解消）
- pagination-parser.test.ts: 32 tests PASS（TASK-163で作成済みのテスト）
