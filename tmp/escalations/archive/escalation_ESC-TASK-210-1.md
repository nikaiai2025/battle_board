---
escalation_id: ESC-TASK-210-1
task_id: TASK-210
status: open
created_at: 2026-03-20T20:30:00+09:00
---

## 問題

`cucumber.js` 設定ファイルに `features/investigation.feature` と `features/step_definitions/investigation.steps.ts` が登録されていない。

タスク TASK-210 の完了条件 `npx cucumber-js` で investigation.feature の11シナリオが全てPASS を満たすには、`cucumber.js` の `paths` と `require` 配列に以下を追加する必要がある:

```js
// paths に追加:
"features/investigation.feature",

// require に追加:
"features/step_definitions/investigation.steps.ts",
```

## 現状

- `investigation.steps.ts` と `post-repository.ts` の実装は完了済み
- 明示的にファイルを指定して実行すると全11シナリオがPASSする:
  ```
  npx cucumber-js --require "features/support/register-mocks.js" --require "features/support/world.ts" --require "features/support/mock-installer.ts" --require "features/support/hooks.ts" --require "features/step_definitions/*.ts" --require-module ts-node/register --require-module tsconfig-paths/register features/investigation.feature
  ```
- しかし `npx cucumber-js` （デフォルトプロファイル）では `cucumber.js` の `paths` / `require` に未登録のため実行されない

## 選択肢

### A: TASK-210 の locked_files に cucumber.js を追加する
- 影響: TASK-210 で cucumber.js を直接編集して完了できる
- リスク: 低い（paths と require への追記のみ）

### B: 別タスクとして cucumber.js の更新を切り出す
- 影響: TASK-210 はステップ定義とインメモリ実装の完了のみとし、cucumber.js への登録は別タスクで対応
- リスク: 低い。ただし TASK-210 の完了条件 1 を満たせない（`npx cucumber-js` でのPASS）

## 推奨

選択肢 A を推奨する。cucumber.js への追記は2行の追加のみで、他の機能に影響しない。

## 関連

- features/investigation.feature（11シナリオ）
- features/step_definitions/investigation.steps.ts（新規作成済み）
- cucumber.js（設定ファイル、locked_files 外）
