# Sprint-107: サイトリネーム Phase 1 — 板ID定数化リファクタリング

## 目的

ハードコードされた板ID文字列 `"battleboard"` を定数 `DEFAULT_BOARD_ID` に置換する。
値は現行のまま（`"battleboard"`）。Phase 2（値の変更）の前段階として、安全にリファクタリングが行えることを確認する。

## 参照

- 移行計画書: `tmp/site_rename_migration_plan.md` Section 2

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-287 | bdd-coding | 定数ファイル作成 + ソースコード11ファイルの板ID定数化 | なし | completed |

## 検証方針

- `npx vitest run` 全PASS → Phase 1完了
- `npx cucumber-js` は feature ファイルが既に新名称（livebot等）に変更済みのため、板ID依存のシナリオでFAILが想定される（Phase 2で解消予定）

## 結果

- TASK-287: completed
- `src/lib/domain/constants.ts` 新規作成（`DEFAULT_BOARD_ID = "battleboard"`）
- 11ファイルの板ID文字列を定数参照に置換
- `npx tsc --noEmit`: エラーなし
- `npx vitest run`: 1772/1773 PASS（失敗1件は既存のschema-consistency問題、今回と無関係）
- 純粋なリファクタリング完了。動作変更なし
