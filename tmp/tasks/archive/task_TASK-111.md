---
task_id: TASK-111
sprint_id: Sprint-38
status: assigned
assigned_to: bdd-doc-reviewer
artifacts_dir: tmp/workers/bdd-doc-reviewer_TASK-111
depends_on: []
created_at: 2026-03-17T15:40:00+09:00
updated_at: 2026-03-17T15:40:00+09:00
locked_files: []
---

## タスク概要
Phase 5ドキュメント整合性レビュー。Sprint-34〜37で追加・変更された機能に対応するドキュメントの整合性を検査する。

## 対象スプリントで変更されたファイル一覧

### ドキュメント（直接レビュー対象）
- `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略書（変更あり）
- `features/admin.feature` — 管理機能BDDシナリオ（追加）

### ソースコード（ドキュメントとの整合性確認対象）
- src/app/api/admin/ — 管理API全般
- src/lib/services/admin-service.ts — 管理サービス
- supabase/migrations/00010_ban_system.sql, 00011_daily_stats.sql

### 確認すべきドキュメント
- `docs/specs/openapi.yaml` — API仕様（admin系APIが定義されているか）
- `docs/architecture/architecture.md` — アーキテクチャ設計
- `docs/architecture/components/` — コンポーネント設計
- `docs/requirements/requirements.md` — 要件定義
- `docs/requirements/ubiquitous_language.yaml` — ユビキタス言語

## スプリント計画参照
- `tmp/orchestrator/sprint_34_plan.md` 〜 `tmp/orchestrator/sprint_37_plan.md`
- `tmp/orchestrator/sprint_38_plan.md`

## 出力（生成すべきファイル）
- `tmp/workers/bdd-doc-reviewer_TASK-111/doc_review_report.md` — ドキュメントレビューレポート

## 完了条件
- [ ] BDDシナリオとソースコードの整合性確認
- [ ] OpenAPI仕様とAPIルートの整合性確認
- [ ] アーキテクチャ設計書とコンポーネント設計書の整合性確認
- [ ] ユビキタス言語辞書の用語使用確認
- [ ] レビューレポート作成

## スコープ外
- ドキュメント修正（指摘のみ）

## 作業ログ

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: ドキュメントレビュー開始
- 未解決の問題: なし

### 進捗ログ
