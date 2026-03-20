---
task_id: TASK-189
sprint_id: Sprint-68
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T23:30:00+09:00
updated_at: 2026-03-19T23:30:00+09:00
locked_files:
  - features/step_definitions/thread.steps.ts
  - "[NEW] src/lib/domain/rules/__tests__/mypage-display-rules.test.ts"
  - src/lib/domain/rules/mypage-display-rules.ts
---

## タスク概要

test-auditor（TASK-186）で検出されたHIGH指摘2件を解消する:
1. thread.steps.ts の9シナリオ分pendingコメントをD-10 §7.3準拠に整備
2. mypage-display-rules.ts の単体テスト新規作成

## 対象指摘
- HIGH-01/02: thread.steps.ts のpendingステップに §7.3.1 分類キーワードと `代替検証:` パスが欠落
- HIGH-03: mypage-display-rules.ts に対応する単体テストが存在しない

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/bdd_test_strategy.md` §7.3 — pending運用ルール
2. [必須] `features/step_definitions/thread.steps.ts` — 対象ファイル（L1660〜L1964）
3. [必須] `src/lib/domain/rules/mypage-display-rules.ts` — テスト対象のドメインルール
4. [参考] `tmp/reports/test_audit.md` — 監査レポート（指摘詳細）

## 完了条件
- [ ] thread.steps.ts の全pendingステップに以下が記載されている:
  - D-10 §7.3.1 に従った分類（DOM/CSS表示 or ブラウザ固有動作）
  - `代替検証:` コメント行に代替テストファイルパス
- [ ] mypage-display-rules.ts の全エクスポート関数に対する単体テスト作成
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 全シナリオPASS（コメント修正のみのためシナリオ結果に変化なし）

## スコープ外
- thread.steps.ts のpending状態の変更（pendingのまま維持。コメント整備のみ）
- features/*.feature の変更
- mypage-display-rules.ts のロジック変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [完了] タスク指示書・bdd_test_strategy.md §7.3・thread.steps.ts・mypage-display-rules.ts・test_audit.md を読み込み
- [完了] thread.steps.ts の9シナリオ分pendingステップを §7.3準拠に整備（分類キーワード追加 + `代替検証:` コメント行追加）
  - polling系 (2ステップ): `ブラウザ固有動作（setInterval依存）` に分類
  - anchor_popup系 (複数ステップ): `DOM/CSS表示（ポップアップDOM操作）` に分類
  - post_number_display系 (複数ステップ): `DOM/CSS表示（フォームへのテキスト挿入DOM操作）` に分類
- [完了] src/lib/domain/rules/__tests__/mypage-display-rules.test.ts を新規作成（26テスト）

### テスト結果サマリー

- 単体テスト (Vitest): 65 files / 1407 tests — 全件PASS（うち新規: 1 file / 26 tests）
- BDDシナリオ (Cucumber): 254 scenarios (238 passed, 16 pending, 0 failed) — 変化なし（コメント整備のみ）
