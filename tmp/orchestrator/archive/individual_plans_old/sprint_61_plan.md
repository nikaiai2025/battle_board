# Sprint-61: UI構造改善 実装フェーズ2 — URL構造変更(T2) + アンカーポップアップ(T7)

> 開始: 2026-03-19
> ステータス: completed

## 背景

Sprint-60でT1(基盤) + T6(レス番号表示)が完了。依存関係に従い次の2タスクを並行実装する。
- T2: URL構造変更（T1完了が前提 → 充足）
- T7: アンカーポップアップ（T6完了が前提 → 充足）

設計書: `tmp/workers/bdd-architect_TASK-162/design.md`

## タスク一覧

| TASK_ID | 設計ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|---|
| TASK-165 | T2 | URL構造変更: 新ルーティング | bdd-coding | TASK-163(T1) | completed |
| TASK-166 | T7 | アンカーポップアップ | bdd-coding | TASK-164(T6) | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-165 | [NEW] src/app/(web)/[boardId]/page.tsx, [NEW] src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx |
| TASK-166 | [NEW] src/app/(web)/_components/AnchorPopupContext.tsx, [NEW] src/app/(web)/_components/AnchorPopup.tsx, [NEW] src/app/(web)/_components/AnchorLink.tsx, src/app/(web)/_components/PostItem.tsx |

> 重複なし。**並行起動可能**

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-165 | 板トップ `[boardId]/page.tsx` + スレッド閲覧 `[boardId]/[threadKey]/[[...range]]/page.tsx` 新設。PostListLiveWrapper pollingEnabled追加。全1350件PASS（既存schema-consistency除く） |
| TASK-166 | AnchorPopupContext/AnchorPopup/AnchorLink 新設 + PostItem AnchorLink置換。新規テスト32件追加、全1350件PASS（既存schema-consistency除く） |
