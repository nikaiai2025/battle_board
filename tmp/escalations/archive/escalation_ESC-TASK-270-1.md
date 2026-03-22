---
escalation_id: ESC-TASK-270-1
task_id: TASK-270
status: open
created_at: 2026-03-22T18:15:00+09:00
---

## 問題の内容

`cucumber.js` 設定ファイルに `features/command_aori.feature` および `features/step_definitions/command_aori.steps.ts` が登録されていないため、BDD テストを実行できない。

`cucumber.js` は `locked_files` に含まれていないため、ワーカーAI が変更できない。

### 必要な変更

`cucumber.js` の `default` プロファイルに以下の2箇所の追記が必要:

1. `paths` 配列に追加:
```
"features/command_aori.feature",
```

2. `require` 配列に追加:
```
"features/step_definitions/command_aori.steps.ts",
```

## 選択肢と各選択肢の影響

### 選択肢A: cucumber.js を locked_files に追加してワーカーに変更を許可する
- 影響: ワーカーが上記2箇所を追記し、BDDテスト実行を完了できる
- リスク: 低（paths/require への追記のみで既存設定への影響なし）

### 選択肢B: オーケストレーターが直接 cucumber.js を更新する
- 影響: ワーカーは更新後にテスト実行を再開する
- リスク: なし

### 選択肢C: cucumber.js の locked_files 記載漏れとして、ワーカーが変更して続行する
- 影響: タスク完了が最速
- リスク: locked_files 運用ルールの例外適用

## 関連するfeatureファイル・シナリオタグ
- `features/command_aori.feature` -- 全7シナリオ
- `features/step_definitions/command_aori.steps.ts` -- ステップ定義

## 現在の作業状態
- 全11実装項目のソースコード作成完了
- AoriHandler 単体テスト 16件 PASS
- vitest 全テスト PASS（schema-consistency の1件は未適用マイグレーションによる既存失敗）
- BDD テストは cucumber.js 更新待ち
