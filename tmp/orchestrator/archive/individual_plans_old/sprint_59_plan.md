# Sprint-59: UI構造改善 — アーキテクト設計（URL構造・ページネーション・アンカーポップアップ・レス番号）

> 開始: 2026-03-19
> ステータス: completed

## 背景

`features/thread.feature` に4グループ19シナリオ、`features/constraints/specialist_browser_compat.feature` に2シナリオ変更が追加された。URL構造の全面変更を伴う大規模UI改善のため、実装前にアーキテクト設計が必要。

## 新規BDDシナリオ

| タグ | 件数 | 依存 |
|---|---|---|
| @url_structure | 5件 | なし（基盤） |
| @pagination | 7件 | @url_structure |
| @anchor_popup | 4件 | なし |
| @post_number_display | 3件 | なし |
| specialist_browser_compat変更 | 2件 | @url_structure |

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-162 | UI構造改善 全体設計（4機能グループ） | bdd-architect | - | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-162 | [NEW] tmp/workers/bdd-architect_TASK-162/ |

## 結果

TASK-162 completed。設計書 + タスク分解（T1〜T9の9タスク）を生成。
- `tmp/workers/bdd-architect_TASK-162/design.md` — 全体設計（7章）
- `tmp/workers/bdd-architect_TASK-162/task_breakdown.md` — 実装タスク9分割（依存関係・locked_files・見積もり付き）

### 実装計画（後続スプリント）
| 順序 | タスク | 並列可否 |
|---|---|---|
| 1 | T1(基盤) + T6(レス番号表示) | 並列可 |
| 2 | T2(URL構造) + T7(ポップアップ) | T1完了後/T6完了後 |
| 3 | T3(リダイレクト) + T4(リンク生成) + T5(ページネーション) | T2完了後 |
| 4 | T8(ドキュメント) + T9(BDDステップ) | 全完了後 |
