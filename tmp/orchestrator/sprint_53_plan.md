# Sprint-53 計画書

> 作成: 2026-03-18

## 目的

PostListLiveWrapperの二重表示バグ修正。
`router.refresh()` 後にSSR側が新レスを含むが、Client Componentのstateがリセットされず`newPosts`が重複表示される問題。

## 原因分析（人間提供）

- `useState(initialLastPostNumber)` は初回マウント時にしか初期値を使わない
- `router.refresh()` → SSR再実行 → propが変わってもstateは保持される（Next.js App Router仕様）
- 結果、SSRが描画する新レスと、PostListLiveWrapperのnewPostsが重複

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-149 | PostListLiveWrapper useEffect同期修正 + 単体テスト | bdd-coding | なし | `src/app/(web)/_components/PostListLiveWrapper.tsx`, `[NEW] src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-149 | completed | 10テスト追加、全1201テストPASS。依存配列をタスク指示書から改善 |
