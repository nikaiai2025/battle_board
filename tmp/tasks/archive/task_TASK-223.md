---
task_id: TASK-223
sprint_id: Sprint-79
status: assigned
assigned_to: bdd-doc-reviewer
artifacts_dir: tmp/workers/bdd-doc-reviewer_TASK-223
depends_on: []
created_at: 2026-03-21T23:40:00+09:00
updated_at: 2026-03-21T23:40:00+09:00
locked_files: []
---

## タスク概要
Sprint 75-79の変更に対するドキュメント整合性レビュー。仕様ドキュメントとコードの整合性を確認する。

## 対象スプリント
- Sprint-75〜79（計画書: `tmp/orchestrator/sprint_75_plan.md` 〜 `sprint_79_plan.md`）

## レビュー対象ドキュメント
- `docs/architecture/bdd_test_strategy.md` — E2Eテスト追加に伴う更新
- `docs/architecture/components/command.md` — コマンドハンドラ変更
- `docs/architecture/components/posting.md` — PostService変更
- `docs/architecture/components/web-ui.md` — UI変更
- `docs/architecture/lessons_learned.md` — 障害記録
- `docs/specs/openapi.yaml` — botMark定義との整合
- `docs/specs/screens/thread-view.yaml` — UI要素定義との整合
- `features/thread.feature` — @image_preview追加
- `features/investigation.feature` — 調査コマンド
- `features/bot_system.feature` — 撃破済みBOT表示

## レビュー観点
1. BDDシナリオ(D-03)と実装コードの整合性
2. OpenAPI仕様(D-04)と実装のAPI契約一致
3. 画面要素定義(D-06)とUI実装の一致
4. コンポーネント設計書(D-08)と実装の整合
5. 仕様変更の伝播ルール遵守（CLAUDE.md参照）

## 完了条件
- [ ] 全ドキュメントのレビュー完了
- [ ] 指摘事項をCRITICAL/HIGH/MEDIUM/LOWで分類して報告
- [ ] レビューレポートを `tmp/workers/bdd-doc-reviewer_TASK-223/review.md` に出力

## 作業ログ

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: レビュー開始
- 未解決の問題: なし
