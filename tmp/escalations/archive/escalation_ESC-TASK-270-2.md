---
escalation_id: ESC-TASK-270-2
task_id: TASK-270
status: open
created_at: 2026-03-22T18:40:00+09:00
---

## 問題

`bot-repository.ts` の `bulkReviveEliminated` に aori 除外条件を追加した変更（前回ワーカーの実装）により、
対応する単体テスト `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` が2件 FAIL している。

テストは Supabase クエリの `.or()` フィルタ文字列を検証しており、実装の変更に追従していない。

### 失敗テスト
1. `正常: eliminated ボットを復活させ復活数を返す` (line 682)
2. `正常: tutorial プロファイルの eliminated ボットは復活対象から除外される` (line 712)

### 原因
期待値が旧フィルタ `"bot_profile_key.is.null,bot_profile_key.neq.tutorial"` のまま。
実装は `"bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori)"` に変更済み。

## 選択肢

### A. `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` を locked_files に追加
- 影響: 2箇所の期待値文字列を更新するだけで修正可能（1分の作業）
- リスク: なし

### B. 現状のままタスク完了とする（テスト失敗を既知問題として記録）
- 影響: タスクの完了条件「npx vitest run 全テストPASS」を満たさない
- リスク: テスト負債が蓄積する

## 推奨

選択肢A。ファイル追加後に当ワーカーが修正する。

## 関連ファイル
- `src/lib/infrastructure/repositories/bot-repository.ts` (実装変更元: locked_files に含まれる)
- `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` (テストファイル: locked_files に含まれない)
- `features/command_aori.feature`
