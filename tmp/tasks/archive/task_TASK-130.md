---
task_id: TASK-130
sprint_id: Sprint-44
status: assigned
assigned_to: bdd-doc-reviewer
artifacts_dir: tmp/workers/bdd-doc-reviewer_TASK-130
depends_on: []
created_at: 2026-03-17T22:30:00+09:00
updated_at: 2026-03-17T22:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-40〜43で変更されたドキュメントの整合性検査。コードとドキュメントの乖離、仕様書間の矛盾がないことを検証する。

## 対象ドキュメント変更

| ファイル | 変更内容 |
|---|---|
| `docs/architecture/architecture.md` | TDR追加・修正 |
| `docs/architecture/bdd_test_strategy.md` | 新規追加 |
| `docs/architecture/components/bot.md` | Strategy パターン設計追記（大幅変更） |
| `docs/architecture/components/user-registration.md` | 軽微修正 |
| `docs/specs/user_registration_state_transitions.yaml` | 軽微修正 |
| `config/bot_profiles.yaml` | BOTプロフィール修正 |

## 未コミットの新規ドキュメント
| ファイル | 内容 |
|---|---|
| `supabase/migrations/00013_add_inline_system_info.sql` | inline_system_infoカラム追加 |
| `docs/operations/incidents/2026-03-17_post_500_missing_migrations.md` | 障害記録 |

## 必読ドキュメント（優先度順）
1. [必須] `tmp/orchestrator/sprint_44_plan.md` — 検証計画
2. [必須] 上記「対象ドキュメント変更」の全ファイル
3. [参考] `docs/specs/openapi.yaml` — API仕様
4. [参考] `docs/requirements/ubiquitous_language.yaml` — 用語辞書

## 出力（生成すべきファイル）
- `tmp/workers/bdd-doc-reviewer_TASK-130/doc_review_report.md` — レビューレポート

## 完了条件
- [ ] 対象ドキュメント全てを検査
- [ ] コードとドキュメントの乖離を検出・報告
- [ ] 仕様書間の矛盾を検出・報告
- [ ] レビューレポートを出力

## スコープ外
- ドキュメントの修正（レビューのみ）
- ソースコードのレビュー（bdd-code-reviewerが担当）

## 作業ログ

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: 対象ドキュメントの読み取りとレビュー開始
- 未解決の問題: なし

### 進捗ログ

### テスト結果サマリー
