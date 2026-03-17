---
task_id: TASK-073
sprint_id: Sprint-25
status: completed
assigned_to: bdd-coding
depends_on: [TASK-070]
created_at: 2026-03-16T18:00:00+09:00
updated_at: 2026-03-16T18:00:00+09:00
locked_files:
  - src/lib/services/post-service.ts
  - src/lib/services/incentive-service.ts
  - src/lib/services/__tests__/post-service.test.ts
  - src/lib/services/__tests__/incentive-service.test.ts
  - features/step_definitions/incentive.steps.ts
---

## タスク概要

incentive.feature の BDD テスト7件の失敗を修正する。根本原因はSprint-24でPostService.createPost内のevaluateOnPost呼び出しがINSERT前に移動されたことにより、遅延評価ボーナス（thread_growth, hot_post, thread_revival）の判定時にデータが不足すること。

## 修正方針（TASK-070アーキテクト分析に基づく — 方針A: 二段階評価）

evaluateOnPostを2段階に分割する:

### Phase 1: 同期ボーナス（INSERT前）
- 対象: daily_login, thread_creation, reply, new_thread_join, streak, milestone_post
- これらは「当該書き込み者のコンテキスト」のみで判定可能
- 結果をinlineSystemInfoに含める

### Phase 2: 遅延評価ボーナス（INSERT後）
- 対象: thread_growth, hot_post, thread_revival
- これらは「スレッド全体のレス一覧」「postCount」を参照する必要がある
- INSERT + incrementPostCount後に評価する
- inlineSystemInfoには含めない（他者への付与であり当該書き込みに表示不要）

### 付随対応: ステップ定義の_insert修正
- incentive.steps.ts内の `_insert` 呼び出し約15箇所に `inlineSystemInfo: null` を追加
- Sprint-24でPost型にinlineSystemInfoが追加されたがステップ定義が未更新

## 必読ドキュメント

1. [必須] `tmp/workers/bdd-architect_TASK-070/analysis.md` — 根本原因分析（全セクション必読）
2. [必須] `features/incentive.feature` — 対象シナリオ
3. [必須] `src/lib/services/post-service.ts` — PostService.createPost のフロー
4. [必須] `src/lib/services/incentive-service.ts` — IncentiveService
5. [必須] `features/step_definitions/incentive.steps.ts` — ステップ定義

## 対象BDDシナリオ

- `features/incentive.feature` の以下7シナリオ:
  1. スレッドにレスが10個付き、ユニークID 3個以上で +50 ボーナス (L80)
  2. スレッドにレスが100個付き、ユニークID 10個以上で +100 ボーナス (L98)
  3. 60分以内に3人以上から返信が付くと +15 ボーナスが付与される (L156)
  4-6. 残高50のまま変化しない（3件: L163, L216, L224）
  7. 低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 (L208)

## 完了条件

- [ ] incentive.feature の全シナリオがPASS（現在7件失敗 → 0件失敗）
- [ ] `npx vitest run` 全PASS
- [ ] 既存のBDDシナリオ（incentive以外）が壊れないこと
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外

- incentive.feature以外のBDDシナリオ修正
- locked_files以外のファイル変更（必要な場合はエスカレーション）
- BDDシナリオの変更（features/配下は読み取り専用）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: admin-service.test.ts に既存の2件失敗あり（locked_files外、本タスクの変更とは無関係）

### 進捗ログ

1. analysis.md、post-service.ts、incentive-service.ts、incentive.steps.ts の現状を確認
2. incentive-service.ts に `EvaluatePhase` 型と `phase` オプションを追加し、二段階評価（sync/deferred）を実装
3. post-service.ts の createPost を二段階評価に対応:
   - Phase 1 (sync): INSERT前に同期ボーナス評価（daily_login, thread_creation, reply, new_thread_join, streak, milestone_post）
   - Phase 2 (deferred): INSERT + incrementPostCount後に遅延評価ボーナス（thread_growth, hot_post, thread_revival）
4. incentive.steps.ts の全12箇所の `_insert` 呼び出しに `inlineSystemInfo: null` を追加
5. incentive.steps.ts の `getTodayJst()` を `Date.now()` ベースに修正（時刻凍結互換）
6. incentive.steps.ts の書き込みステップに daily_login ガードを追加（frozen time との日付不整合を防止）
7. post-service.test.ts の6件のテストを二段階評価に対応:
   - 第1テスト: `toHaveBeenCalledTimes(2)` + `toHaveBeenNthCalledWith` で Phase 1/2 を検証
   - 第2-6テスト（アンカー系）: `toHaveBeenCalledWith` を `toHaveBeenNthCalledWith(1, ..., { phase: "sync" })` に変更

### テスト結果サマリー

**Vitest (単体テスト):**
- テストファイル: 19 passed, 1 failed (admin-service.test.ts: 既存の2件失敗、locked_files外)
- テストケース: 670 passed, 2 failed
- post-service.test.ts: 54/54 PASS
- incentive-service.test.ts: PASS

**Cucumber (BDDテスト):**
- 108 scenarios: 105 passed, 3 pending (既存)
- 502 steps: 494 passed, 3 pending, 5 skipped
- incentive.feature の全シナリオ: PASS（7件の失敗 → 0件）
