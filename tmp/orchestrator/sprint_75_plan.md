# Sprint-75 計画書

> 作成日: 2026-03-20
> ステータス: in_progress

## 目的

1. TSC型エラー74件を解消し、pre-commit hookで再発防止する
2. スレッド休眠(is_dormant)機能を実装し、subject.txtの50件制限をLIMIT方式からフラグ方式に移行する

## 背景

- `npx tsc --noEmit` で74件の型エラー（13テストファイル）が存在。モデル型変更にテストフィクスチャが追従していない
- 専ブラでsubject.txtのLIMIT方式によるスレッド幽霊蓄積問題。is_dormantフラグ方式で解決する
- 設計ドキュメント（D-05, D-07, D-08）は更新済み。実装のみ

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | depends_on | locked_files |
|---|---|---|---|---|---|
| TASK-202 | TSC型エラー74件修正 + pre-commit hook導入 | bdd-coding | assigned | - | 13テストファイル + package.json + .husky/ |
| TASK-203 | スレッド休眠(is_dormant)実装 | bdd-coding | pending | TASK-202 | thread.ts, thread-repository.ts, post-service.ts, subject.txt route等 |

## 依存関係

TASK-202 → TASK-203（直列）
- TASK-202がThread型のテストフィクスチャを修正し、tsc --noEmitをクリーンにする
- TASK-203がThread型にisDormantを追加し、関連テストフィクスチャも更新する
- 重複ファイル（post-service.test.ts等）があるため並行不可

## 結果

<!-- スプリント完了後に記入 -->
