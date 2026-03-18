---
escalation_id: ESC-TASK-150-1
task_id: TASK-150
status: open
created_at: 2026-03-18T00:00:00+09:00
---

## 問題の内容

TASK-150の完了条件「`npm run build` が成功する」を達成するために、`locked_files` 外のファイル変更が必要と判明した。

`vitest.config.ts` の `environmentMatchGlobs` 削除は完了済み。しかし `npm run build` が引き続き失敗している。

### ビルドエラー

```
./ゴミ箱/prod_write_test.ts:274:11
Type error: Property 'disconnect' does not exist on type 'Browser'. Did you mean 'isConnected'?
```

### 原因

`tsconfig.json` の `include` に `**/*.ts` が含まれており、gitで追跡されていないローカルディレクトリ `ゴミ箱/` 内の `prod_write_test.ts` がビルド対象に含まれている。このファイルはPlaywrightの型エラーを含んでいる。

`ゴミ箱/` はgit履歴になく、ローカルにのみ存在する一時ファイルと推測される。

## 選択肢と影響

### 選択肢A: `tsconfig.json` の `exclude` に `ゴミ箱` を追加

```json
"exclude": ["node_modules", "features", "ゴミ箱"]
```

- 影響: `ゴミ箱/` ディレクトリ全体がTypeScriptコンパイル対象から除外される
- リスク: 最小限。`ゴミ箱/` は一時ファイル置き場と推測され、本番コードとの依存関係はない
- `locked_files` 外のファイル変更が必要

### 選択肢B: `ゴミ箱/prod_write_test.ts` の型エラーを修正

- 影響: ゴミ箱内のファイルを修正する（スコープ外）
- リスク: ゴミ箱は管理対象外ファイルのため、修正しても意味が薄い

### 選択肢C: TASK-150の完了条件から `npm run build` 成功を除外

- `vitest.config.ts` の修正（本来のタスク目的）は完了済み
- このビルドエラーはTASK-149以前から存在していた別件と判断し、TASK-150はスコープを限定して完了とする

## 推奨

選択肢Aを推奨。`tsconfig.json` への1行追加で解決でき、影響範囲が最小限。

## 関連情報

- `vitest.config.ts`: `environmentMatchGlobs` 削除済み（本来のタスク目的は完了）
- `tsconfig.json` exclude: 現在 `["node_modules", "features"]`
- `ゴミ箱/prod_write_test.ts`: gitで未追跡のローカルファイル
