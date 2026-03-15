---
task_id: TASK-064
sprint_id: Sprint-23
status: done
assigned_to: bdd-architect
depends_on: [TASK-063]
created_at: 2026-03-16T11:00:00+09:00
updated_at: 2026-03-16T11:00:00+09:00
locked_files:
  - docs/architecture/components/command.md
---

## タスク概要

D-08 command.md の2箇所を更新する:
1. GAP-6: §4「1レス1コマンド」のメモ書きを仕様確定記述に更新
2. GAP-7: §2.3 としてコマンド解析仕様（command-parser）セクションを追加

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/command.md` — 更新対象
2. [必須] `tmp/workers/bdd-architect_TASK-063/gap_resolution_proposal.md` — GAP-6, GAP-7の提案内容

## 入力（前工程の成果物）

- `tmp/workers/bdd-architect_TASK-063/gap_resolution_proposal.md` — 解消方針提案書

## 出力（生成すべきファイル）

- `docs/architecture/components/command.md` — 更新

## 完了条件

- [x] §4 の「（仕様として確定させること）」メモが削除され、確定記述に更新されている
- [x] §2.3 にcommand-parserの解析仕様セクションが追加されている
- [x] 既存の記述との整合性が保たれている

## スコープ外

- command.md 以外のファイル変更
- コード実装

## 補足・制約

GAP-6の確定記述: 「MVPでは1レス1コマンドのみ有効。本文中に複数のコマンドが含まれる場合は先頭のコマンドのみを実行し、残りは無視する」
GAP-7のパース仕様: TASK-063の提案書に記載のcommand-parser解析ルール（5項目）をそのまま採用する。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: GAP-6 §4更新、GAP-7 §2.3追加
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 2026-03-16: GAP-6 — §4「1レス1コマンド」のメモ書き「（仕様として確定させること）」を削除し、確定記述に更新した
- 2026-03-16: GAP-7 — §2.3「コマンド解析仕様（command-parser）」セクションを §2.2 の直後に追加した（入力・出力・解析ルール5項目）
- 2026-03-16: 整合性確認 — §2.3 解析ルール4番と §4 の記述が一致、§3.1 依存先の command-parser パスと §2.3 の配置パスが一致
