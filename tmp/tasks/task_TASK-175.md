---
task_id: TASK-175
sprint_id: Sprint-64
status: assigned
assigned_to: bdd-doc-reviewer
depends_on: []
created_at: 2026-03-19T23:30:00+09:00
updated_at: 2026-03-19T23:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-59〜63のUI構造改善後のドキュメント整合性レビュー。web-ui.md(T8で更新)と実装コードの整合性、BDDシナリオとの対応、仕様ドキュメント間の矛盾がないかを検証。

## 対象ドキュメント
1. `docs/architecture/components/web-ui.md` — T8で更新済み。実装と一致するか検証
2. `docs/specs/openapi.yaml` — ルーティング変更に伴う影響がないか確認
3. `docs/architecture/architecture.md` — TDR記録の整合性
4. `docs/architecture/bdd_test_strategy.md` — テスト戦略との整合性
5. `docs/requirements/ubiquitous_language.yaml` — 用語使用の一貫性

## 必読ドキュメント（優先度順）
1. [必須] `tmp/orchestrator/sprint_64_plan.md` — 対象スプリント計画・変更ファイル一覧
2. [必須] `docs/architecture/components/web-ui.md` — レビュー対象
3. [必須] 実装コード — web-ui.mdに記載のコンポーネント構成が実コードと一致するか

## レビュー観点
- web-ui.md §3.1/§3.2 のコンポーネントツリーが実コードと一致するか
- 新コンポーネント（PaginationNav, AnchorPopup系, PostFormContext）の記載が正確か
- Server/Client Component の分類が正しいか
- リダイレクトの記載が実装と一致するか
- OpenAPI仕様への影響（HUMAN-004で未対応の件を含め状況整理）
- 仕様ドキュメント間の矛盾

## 完了条件
- [ ] HIGH / MEDIUM / LOW の指摘をリスト化
- [ ] 各指摘に修正方針の提案を含める
- [ ] APPROVE / CONDITIONAL APPROVE / FAIL の判定を記載

## 作業ログ

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: タスク概要に従い作業を開始
- 未解決の問題: なし

### 進捗ログ

### レビュー結果サマリー
