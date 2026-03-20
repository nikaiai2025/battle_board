# Sprint-62: UI構造改善 実装フェーズ3 — リダイレクト(T3) + リンク生成(T4) + PaginationNav(T5)

> 開始: 2026-03-19
> ステータス: completed

## 背景

Sprint-61でT2(URL構造変更) + T7(アンカーポップアップ)が完了。依存関係に従い次の3タスクを並行実装する。
- T3: リダイレクト（T2完了が前提 → 充足）
- T4: リンク生成（T2完了が前提 → 充足）
- T5: PaginationNav UI（T1+T2完了が前提 → 充足）

設計書: `tmp/workers/bdd-architect_TASK-162/design.md`

## タスク一覧

| TASK_ID | 設計ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|---|
| TASK-167 | T3 | リダイレクト: 旧URL互換 + ルート + read.cgi | bdd-coding | TASK-165(T2) | completed |
| TASK-168 | T4 | リンク生成: ThreadCard + ThreadList リンク先変更 | bdd-coding | TASK-165(T2) | completed |
| TASK-169 | T5 | PaginationNav UI + スレッドページ配置 | bdd-coding | TASK-163(T1), TASK-165(T2) | completed |
| TASK-170 | - | ルート衝突修正: senbra [boardId]/route.ts 削除 | bdd-coding | TASK-165(T2) | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-167 | src/app/(web)/page.tsx, src/app/(web)/threads/[threadId]/page.tsx, src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts |
| TASK-168 | src/app/(web)/_components/ThreadCard.tsx, src/app/(web)/_components/ThreadList.tsx, src/app/(web)/dev/page.tsx, src/app/(web)/[boardId]/page.tsx |
| TASK-169 | [NEW] src/app/(web)/_components/PaginationNav.tsx, src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx |

> 重複なし。**並行起動可能**

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-167 | `/` → `/battleboard/` リダイレクト、`/threads/{UUID}` → `/{boardId}/{threadKey}/` リダイレクト、read.cgi リダイレクト先変更。全1374件PASS |
| TASK-168 | ThreadCard/ThreadList に boardId/threadKey props追加。リンク先 `/{boardId}/{threadKey}/` 形式に統一。dev板も対応。全1374件PASS |
| TASK-169 | PaginationNav新設（100件レンジ+最新50+全件リンク）+ スレッドページ上下配置。テスト追加 |
| TASK-170 | `(senbra)/[boardId]/route.ts` 削除（`(web)/[boardId]/page.tsx` との衝突解消）。`npx next build` 成功確認 |

### ビルドエラー対応
Sprint-61で追加した `(web)/[boardId]/page.tsx` と既存の `(senbra)/[boardId]/route.ts` が同一URL `/{boardId}` で衝突しVercelビルドエラーが発生。
`(senbra)/[boardId]/route.ts` は `/{boardId}/` → `/` リダイレクト用だったが、新ページが直接提供するため不要。TASK-170で削除し解消。
