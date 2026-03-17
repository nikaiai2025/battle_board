---
task_id: TASK-089
sprint_id: Sprint-31
status: completed
assigned_to: bdd-coding
depends_on:
  - TASK-087
created_at: 2026-03-16T21:30:00+09:00
updated_at: 2026-03-16T21:30:00+09:00
locked_files:
  - features/step_definitions/ai_accusation.steps.ts
---

## タスク概要

ai_accusation.feature v4 で追加された2つの新BDDステップの定義を追加する。
TASK-087（ボーナス廃止コード対応）完了後に残った2 undefinedステップを解消する小タスク。

## 対象BDDシナリオ
- `features/ai_accusation.feature` — 「AI告発に成功すると〜」「AI告発に失敗すると〜」の2シナリオ

## 追加すべきステップ定義

### 1. `告発者に通貨報酬は付与されない`
- 告発後の通貨残高がコスト消費分のみであることを検証
- 既存の通貨残高チェックと同様のロジック（AccusationServiceが credit を呼ばないことの確認）

### 2. `被告発者に通貨は付与されない`
- 被告発者の通貨残高が変化していないことを検証

## 完了条件
- [ ] `npx cucumber-js` の undefined が 0 になる（130 scenarios: 127 passed, 3 pending）
- [ ] `npx vitest run` 全テストPASS（825件）

## スコープ外
- feature ファイルの変更
- 既存ステップ定義の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 2ステップ定義追加（告発者に通貨報酬は付与されない、被告発者に通貨は付与されない）
- 未解決の問題: なし

### 進捗ログ
- `features/step_definitions/ai_accusation.steps.ts` に2ステップ定義を追加
  - `告発者に通貨報酬は付与されない`: 告発後残高 = 告発前残高 - TELL_COST を検証
  - `被告発者に通貨は付与されない`: 被告発者残高 = 0 のまま変化なしを検証

### テスト結果サマリー
- Cucumber: 130 scenarios (3 pending, 127 passed) — undefined 0 達成
- Vitest: 825 tests passed (28 files)
