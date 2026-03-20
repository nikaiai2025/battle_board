---
task_id: TASK-150
sprint_id: Sprint-53
status: completed
assigned_to: bdd-coding
depends_on: [TASK-149]
created_at: 2026-03-18T00:00:00+09:00
updated_at: 2026-03-18T00:00:00+09:00
locked_files:
  - "vitest.config.ts"
  - "tsconfig.json"
---

## タスク概要

TASK-149で追加した`vitest.config.ts`の`environmentMatchGlobs`プロパティがNext.jsビルド時の型チェックでエラーになる。
テストファイル側に`// @vitest-environment jsdom`が既に指定されているため、`environmentMatchGlobs`は不要。削除してビルドを通す。

## ビルドエラー内容

```
./vitest.config.ts:12:3
Type error: No overload matches this call.
  Object literal may only specify known properties, and 'environmentMatchGlobs' does not exist in type 'InlineConfig'.
```

## 修正内容

`vitest.config.ts`から`environmentMatchGlobs`プロパティを削除する。
`plugins: [react()]`、`include`への`.test.tsx`追加はそのまま残す。

## 完了条件
- [ ] `environmentMatchGlobs`が削除されている
- [ ] `npm run build` が成功する
- [ ] `npx vitest run` が全テストPASS

## スコープ外
- テストファイルの変更
- PostListLiveWrapper.tsxの変更

## 作業ログ

### チェックポイント
- 状態: 完了

### 進捗ログ

- vitest.config.ts の environmentMatchGlobs プロパティを削除した
- npm run build を実行したところ、ゴミ箱/prod_write_test.ts の型エラーで失敗
- ESC-TASK-150-1 を起票し、tsconfig.json への除外追加を提案
- エスカレーション解決後、tsconfig.json の exclude に "ゴミ箱" を追加
- npm run build 成功確認
- npx vitest run 全テストPASS確認

### escalation_resolution

ESC-TASK-150-1について、オーケストレーターAIが自律判断で解決:
- `ゴミ箱/`はgit未追跡のローカル一時ファイル置き場（スクリーンショット・旧計画書等）
- `tsconfig.json`のexcludeに`"ゴミ箱"`を追加する（選択肢A）で解決してよい
- locked_filesに`tsconfig.json`を追加済み
- BDDシナリオ・API契約・横断的制約への影響なし

### テスト結果サマリー

- npm run build: 成功（全ページ生成完了）
- npx vitest run: 48ファイル / 1201テスト 全PASS (4.32s)
