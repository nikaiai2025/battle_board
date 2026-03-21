# Sprint-28 計画書

> 作成日: 2026-03-16

## 目的

ai_accusation.feature のクオリティ改善 + 告発経済パラメータの集約。featureに具体的数値を入れ、DocStringを要素レベルに変更し、ボーナス値をcommands.yamlに集約する。

## 変更方針（人間承認済み）

- 告発コスト: 10, 成功ボーナス: 20, 冤罪ボーナス: 10
- DocString形式のシステムメッセージ → 要素レベルの部分一致検証
- ボーナス値を commands.yaml に集約（accusation-rules.ts のハードコード定数を削除）

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-080 | bdd-coding | feature書き換え + commands.yaml集約 + コード修正 + ステップ定義更新 + テスト全PASS | なし | assigned |

## 結果

全タスク completed。

### TASK-080: feature改訂 + パラメータ集約
- ai_accusation.feature v3 に書き換え（具体的数値、DocString削除、要素レベル記載）
- command_system.feature の cost 50→10 整合性修正（人間承認済み）
- commands.yaml に hitBonus: 20, falseAccusationBonus: 10 追加、cost: 50→10
- accusation-rules.ts のハードコード定数削除、calculateBonus() 3引数化
- YAML設定値がAccusationServiceまで伝播する経路を確保
- エスカレーション1件（ESC-TASK-080-1: command_system.feature 整合性修正）→ 人間承認で解決

### テスト結果
- vitest: 22ファイル / 746テスト / 全PASS
- cucumber-js: 131シナリオ（128 passed, 3 pending）/ 0 failed
- tsc: エラーなし
