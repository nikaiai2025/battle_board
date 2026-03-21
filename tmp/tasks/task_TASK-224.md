---
task_id: TASK-224
sprint_id: Sprint-79
status: assigned
assigned_to: bdd-test-auditor
artifacts_dir: tmp/workers/bdd-test-auditor_TASK-224
depends_on: []
created_at: 2026-03-21T23:40:00+09:00
updated_at: 2026-03-21T23:40:00+09:00
locked_files: []
---

## タスク概要
Sprint 75-79の変更に対するテスト監査。pending管理状況・テストピラミッドバランス・BDDシナリオとテストのトレーサビリティを全件チェックする。

## 対象スプリント
- Sprint-75〜79（計画書: `tmp/orchestrator/sprint_75_plan.md` 〜 `sprint_79_plan.md`）

## 監査対象
### テストファイル（変更分）
- `src/__tests__/lib/services/post-service.test.ts` — getPostListWithBotMark テスト（新規）
- `src/__tests__/lib/domain/rules/url-detector.test.ts` — URL検出テスト
- `src/__tests__/app/(web)/_components/PostItem.test.tsx` — PostItemテスト
- `src/__tests__/lib/services/handlers/*.test.ts` — コマンドハンドラテスト群
- `src/__tests__/lib/infrastructure/repositories/post-repository-find-by-author-date.test.ts`
- `e2e/flows/thread-ui.spec.ts` — アンカー+レス番号E2E（新規）
- `e2e/flows/polling.spec.ts` — ポーリングE2E（新規）
- `e2e/flows/bot-display.spec.ts` — BOT表示E2E（fixme→PASS）
- `features/step_definitions/thread.steps.ts` — BDDステップ定義
- `features/step_definitions/bot_system.steps.ts` — BDDステップ定義
- `features/step_definitions/investigation.steps.ts` — 調査コマンドステップ

### 監査項目
1. pending BDDシナリオ16件の管理状況（理由が明確か、解消計画があるか）
2. テストピラミッドのバランス（単体1535 / BDD 255 passed / E2E 16 / API 26 / smoke 30）
3. BDDシナリオ→テストコードのトレーサビリティ（Seeコメント等）
4. テストの独立性・冪等性

## 完了条件
- [ ] 全件チェック完了
- [ ] 指摘事項をCRITICAL/HIGH/MEDIUM/LOWで分類して報告
- [ ] 監査レポートを `tmp/workers/bdd-test-auditor_TASK-224/audit.md` に出力

## 作業ログ

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: 監査開始
- 未解決の問題: なし
