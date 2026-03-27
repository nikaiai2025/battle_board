# Sprint-132 計画書

## 目的

スマホビューでコピペAA（アスキーアート）が折り返して崩れる問題を修正する。

## 背景

`!copipe` コマンドで表示されるAAはモノスペースフォント + 列揃えが必要。
スマホの狭い画面幅でコンテナ幅を超える行が折り返されAAが崩れていた。
`PostItem.tsx` にはすでにAA判定ロジック（`/【.+】\n/`）が実装済みであり、
そのロジックを活用してAA時のみ横スクロールを有効にする。

## タスク

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-340 | PostItem.tsx AA横スクロール修正 | bdd-coding | **completed** |

## 変更内容

- `src/app/(web)/_components/PostItem.tsx`
  - `isAA` 変数で判定結果を一元化
  - AA時: `<div className="overflow-x-auto">` ラッパー + `whitespace-pre`（折り返し禁止）
  - 非AA時: 従来通り `text-xs whitespace-pre-wrap` を維持

## テスト結果

- vitest: 2003 tests 全 PASS
- tsc --noEmit: エラーなし
