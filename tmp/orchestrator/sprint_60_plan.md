# Sprint-60: UI構造改善 実装フェーズ1 — 基盤（T1 + T6 並行）

> 開始: 2026-03-19
> ステータス: in_progress

## 背景

Sprint-59（TASK-162）でUI構造改善の全体設計が完了。T1〜T9の9タスクに分解済み。
本スプリントでは依存のない2タスク（T1: 基盤, T6: レス番号表示）を並行実装する。

設計書: `tmp/workers/bdd-architect_TASK-162/design.md`
タスク分解: `tmp/workers/bdd-architect_TASK-162/task_breakdown.md`

## タスク一覧

| TASK_ID | 設計ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|---|
| TASK-163 | T1 | pagination-parser + PostService改修 | bdd-coding | - | assigned |
| TASK-164 | T6 | レス番号表示 + PostFormテキスト挿入 + PostItem Client化 | bdd-coding | - | assigned |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-163 | [NEW] src/lib/domain/rules/pagination-parser.ts, [NEW] src/__tests__/lib/domain/rules/pagination-parser.test.ts, src/lib/services/post-service.ts, src/lib/infrastructure/repositories/post-repository.ts |
| TASK-164 | [NEW] src/app/(web)/_components/PostFormContext.tsx, src/app/(web)/_components/PostForm.tsx, src/app/(web)/_components/PostItem.tsx, src/app/(web)/_components/PostList.tsx |

> 重複なし。**並行起動可能**

## 結果

（完了後に記載）
