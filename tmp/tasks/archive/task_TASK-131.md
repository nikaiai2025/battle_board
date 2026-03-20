---
task_id: TASK-131
sprint_id: Sprint-44
status: assigned
assigned_to: bdd-test-auditor
artifacts_dir: tmp/workers/bdd-test-auditor_TASK-131
depends_on: []
created_at: 2026-03-17T22:30:00+09:00
updated_at: 2026-03-17T22:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-40〜43の変更に対するテスト健全性監査。pendingシナリオの管理状況、テストピラミッドのバランス、BDDシナリオとテストのトレーサビリティを全件チェックする。

## 現在のテスト状況（ベースライン）

- vitest: 43ファイル / 1094テスト / 全PASS
- cucumber-js: 228シナリオ (221 passed, 7 pending) / 0 failed
- pending 7件の内訳: インフラ制約3件 + bot_system UI 2件 + Discord OAuth 2件

## Sprint-40〜43で追加されたテスト

### 新規テストファイル
- `src/__tests__/lib/services/bot-strategies/fixed-interval.test.ts`
- `src/__tests__/lib/services/bot-strategies/fixed-message.test.ts`
- `src/__tests__/lib/services/bot-strategies/random-thread.test.ts`
- `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts`

### 変更されたテストファイル
- `src/__tests__/lib/services/bot-service.test.ts` — 大幅変更
- `features/step_definitions/bot_system.steps.ts` — BDDステップ変更
- その他: auth系・repository系テスト10ファイル以上

## 必読ドキュメント（優先度順）
1. [必須] `tmp/orchestrator/sprint_44_plan.md` — 検証計画
2. [必須] `docs/architecture/bdd_test_strategy.md` — テスト戦略
3. [参考] `features/*.feature` — BDDシナリオ全件

## 出力（生成すべきファイル）
- `tmp/workers/bdd-test-auditor_TASK-131/test_audit_report.md` — 監査レポート

## 完了条件
- [ ] pending 7件が全て意図的であることを確認
- [ ] テストピラミッド（単体 > 結合 > E2E）のバランス確認
- [ ] BDDシナリオとステップ定義のトレーサビリティ確認
- [ ] 監査レポートを出力

## スコープ外
- テストコードの修正（監査のみ）
- 新規テストの作成

## 作業ログ

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: テストファイルの読み取りと監査開始
- 未解決の問題: なし

### 進捗ログ

### テスト結果サマリー
