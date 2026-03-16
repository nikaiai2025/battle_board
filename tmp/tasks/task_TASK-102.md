---
task_id: TASK-102
sprint_id: Sprint-34
status: completed
assigned_to: bdd-coding
depends_on: [TASK-100]
created_at: 2026-03-17T13:00:00+09:00
updated_at: 2026-03-17T13:00:00+09:00
locked_files:
  - "features/step_definitions/reactions.steps.ts"
  - "features/step_definitions/incentive.steps.ts"
---

## タスク概要

`npx cucumber-js` で incentive.feature の「最終レスが24時間以内のスレッドでは低活性判定にならない」シナリオ（line 224）が失敗している。Sprint-34のreactions.steps.ts追加後に発生。原因を調査し修正する。

## 失敗の症状
```
Scenario: 最終レスが24時間以内のスレッドでは低活性判定にならない # features/incentive.feature:224
  Then スレッド復興ボーナスは付与されない
    AssertionError: スレッド復興ボーナスが付与されていないことを期待しましたが、ユーザーに 1 件のログがあります
```

期待: thread_revival ボーナスが付与されないこと
実際: thread_revival ボーナスが 1 件記録されている

## 対象BDDシナリオ
- `features/incentive.feature` line 224 — 「最終レスが24時間以内のスレッドでは低活性判定にならない」

## 必読ドキュメント（優先度順）
1. [必須] `features/step_definitions/incentive.steps.ts` — 復興ボーナス関連ステップ（line 881〜956, line 1449〜）
2. [必須] `features/step_definitions/reactions.steps.ts` — BeforeStep/AfterStepフック（line 453〜）
3. [必須] `features/support/world.ts` — World定義、setCurrentTime
4. [参考] `src/lib/services/incentive-service.ts` — evaluateThreadRevivalBonus

## 完了条件
- [ ] `npx cucumber-js` で 0 failed
- [ ] reactions.feature 22シナリオ全PASS維持
- [ ] 既存テスト回帰なし

## スコープ外
- featureファイルの変更
- src/lib/ 配下のソースコード変更（ステップ定義のみ修正）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 調査・テスト実行
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 2026-03-17: 調査開始。incentive.steps.ts line 881-956 のセットアップ、reactions.steps.ts の BeforeStep/AfterStep フック、incentive-service.ts の evaluateThreadRevivalBonus を確認
- reactions.steps.ts の BeforeStep フックは `"!w` パターン（草コマンド）のみに反応するため、incentive.feature のスレッド復興シナリオには干渉しない
- `npx cucumber-js` 実行結果: 211 scenarios (9 pending, 202 passed), 0 failed
- 「最終レスが24時間以内のスレッドでは低活性判定にならない」シナリオは正常にPASS

### テスト結果サマリー
- 全体: 211 scenarios, 202 passed, 9 pending, 0 failed
- 対象シナリオ「最終レスが24時間以内のスレッドでは低活性判定にならない」: PASS
- reactions.feature: 全シナリオ PASS（pending含む）
- 回帰なし

### 調査結果
失敗が再現しなかった。TASK-100（depends_on）で行われた reactions.steps.ts の修正により、問題が既に解消されていた可能性がある。ステップ定義の変更は不要だった。
