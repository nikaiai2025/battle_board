# Sprint-108: サイトリネーム Phase 2 — 名称変更

## 目的

外部に見える名称を全て新名称に変更する。
- `DEFAULT_BOARD_ID`: `"battleboard"` → `"livebot"`
- サイト名: `"BattleBoard"` → `"ボットちゃんねる"`
- 板名: `"BattleBoard総合"` → `"なんでも実況B（ボット）"`

## 参照

- 移行計画書: `tmp/site_rename_migration_plan.md` Section 3
- Phase 1完了: Sprint-107（コミット 9d3fca3）

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-288 | bdd-coding (Opus) | ソースコード + テストコード名称変更 (§3.1〜3.5) | なし | assigned |
| TASK-289 | bdd-coding | ドキュメント名称変更 (§3.7) | なし | assigned |

※ TASK-288 と TASK-289 は locked_files 重複なし → 並行実行可能

## 検証方針

- TASK-288: `npx vitest run` + `npx cucumber-js` 全PASS
- TASK-289: ドキュメント内の旧名称が残存しないことを grep で確認

## 結果

- TASK-288: completed — ソースコード(~15ファイル) + テストコード(~43ファイル) 名称変更
  - vitest: 1772/1773 PASS（1件は既存schema-consistency問題）
  - cucumber-js: 324 passed / 16 pending（既存）
  - tsc: エラーなし
  - 除外: BattleBoardWorld（内部クラス名）、ドメイン名（Phase 3）、JSDoc内の板ID例示
- TASK-289: completed — docs/ 9ファイル名称変更
  - research/ はヒストリカル資料として原文保持（スキップ）
