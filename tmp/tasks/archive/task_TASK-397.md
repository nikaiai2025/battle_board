---
task_id: TASK-397
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
created_at: 2026-04-19
updated_at: 2026-04-19
locked_files:
  - "cucumber.js"
---

## タスク概要

TASK-395 で `features/command_yomiage.feature` と `features/step_definitions/command_yomiage.steps.ts` が実装されたが、
`cucumber.js` の `default.paths` および `default.require` への登録が漏れていた。
`npx cucumber-js` の通常実行で yomiage の9シナリオが実行されないため、設定を同期する。

## 対象BDDシナリオ

- `features/command_yomiage.feature` — 全9シナリオが `npx cucumber-js` 通常実行で検出されること

## 出力

`cucumber.js` の `default` プロファイルに以下を追加する:

### paths への追加（`features/dev_board.feature` / `user_bot_vocabulary.feature` の直後）

```js
			// TASK-392: !yomiage コマンド（指定レス音声化） BDD シナリオ追加
			// See: features/command_yomiage.feature
			"features/command_yomiage.feature",
```

### require への追加（`user_bot_vocabulary.steps.ts` の直後）

```js
			// TASK-395: !yomiage コマンド BDD ステップ定義
			// See: features/command_yomiage.feature
			"features/step_definitions/command_yomiage.steps.ts",
```

## 完了条件

- [ ] `npx cucumber-js` 通常実行で yomiage の9シナリオが含まれること（433 → 442 シナリオ以上）
- [ ] `npx cucumber-js` 全体で FAIL が 0 件であること
- [ ] 既存シナリオ（411 PASS）に回帰がないこと

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: cucumber.js の paths・require に command_yomiage.feature / command_yomiage.steps.ts を追加
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `cucumber.js` の `default.paths` 末尾（user_bot_vocabulary.feature の直後）に `features/command_yomiage.feature` を追加
- `cucumber.js` の `default.require` 末尾（user_bot_vocabulary.steps.ts の直後）に `features/step_definitions/command_yomiage.steps.ts` を追加

### テスト結果サマリー

```
442 scenarios (4 undefined, 18 pending, 420 passed)
2426 steps (7 undefined, 21 pending, 43 skipped, 2355 passed)
0m05.060s
```

- 完了条件チェック:
  - [x] yomiage の9シナリオが含まれること（433 → 442 scenarios）
  - [x] FAIL 0 件
  - [x] 既存シナリオへの回帰なし（420 passed、回帰なし）
