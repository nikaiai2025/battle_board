---
task_id: TASK-160
sprint_id: Sprint-57
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T15:00:00+09:00
updated_at: 2026-03-19T15:00:00+09:00
locked_files:
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

Phase 5テスト監査で検出されたHIGH指摘（TEST-HIGH-001）を修正する。`bot_system.steps.ts` のpendingステップ定義で「作成予定」と記載されているテストファイル `eliminated-bot-display.test.tsx` が存在しないリンク切れ問題を解消する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-test-auditor_TASK-158/test_audit_report.md` — テスト監査HIGH指摘の詳細
2. [必須] `features/step_definitions/bot_system.steps.ts` — 該当箇所の確認

## 修正内容

### TEST-HIGH-001: ステップ定義コメント修正

`bot_system.steps.ts` 内の2箇所で `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx（作成予定）` と記載されている箇所を確認し、以下いずれかの対応を行う:

1. **UIコンポーネントが未実装の場合（推奨）:**
   コメントを「UI未実装のため代替テスト未作成。UIコンポーネント実装時に作成すること」に修正

2. **UIコンポーネントが実装済みの場合:**
   テストファイルを作成する

**判断方法:** `src/app/(web)/` 配下に撃破済みボット表示関連のコンポーネント（PostItem等でeliminatedボットの表示を切り替える処理）が存在するか確認する。存在しなければ選択肢1。

## 完了条件
- [x] `bot_system.steps.ts` のリンク切れコメントが修正されている
- [x] 既存テスト影響なし（`npx cucumber-js` でpending数に変化なし）
- [x] テストコマンド: `npx cucumber-js`

## スコープ外
- UIコンポーネント自体の実装
- 他のpendingシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/app/(web)/` 配下および `_components/` 配下で `eliminated`, `撃破` 等のキーワードを検索。PostItem.tsx、PostList.tsx 含め全コンポーネントに該当コードなし → UIコンポーネント未実装と判断
- `features/step_definitions/bot_system.steps.ts` の1628行目・1661行目の2箇所のコメントを修正
  - 変更前: `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx（作成予定）`
  - 変更後: `UI未実装のため代替テスト未作成。UIコンポーネント実装時に src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx を作成すること`

### テスト結果サマリー

`npx cucumber-js` 実行結果:
- 234 scenarios (7 pending, 227 passed) — 変化なし
- 1251 steps (7 pending, 18 skipped, 1226 passed) — 変化なし
- pending数に変化なし（修正前後で同一）
