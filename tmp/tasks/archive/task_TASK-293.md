---
task_id: TASK-293
sprint_id: Sprint-109
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_293
depends_on: []
created_at: 2026-03-24T16:00:00+09:00
updated_at: 2026-03-24T16:00:00+09:00
locked_files: []
---

## タスク概要

認証フロー簡素化（6桁認証コード廃止 → Turnstileのみ）に伴うドキュメント変更の整合性レビュー。
人間がドキュメントを編集済み。コード変更はまだ未着手。ドキュメントレベルで不整合がないかをレビューする。

**本タスクの対象: アーキテクチャ・コンポーネント設計 + テスト戦略（5ファイル）**

## レビュー観点

1. **計画書との整合性**: 各ドキュメントの変更が `tmp/auth_simplification_analysis.md` の方針（案B: 6桁コード廃止）に合致しているか
2. **ドキュメント間の整合性**: architecture.md と各コンポーネント設計書の間で矛盾がないか
3. **変更漏れ**: 認証コード関連の旧記述が残っていないか
4. **コンポーネント境界の正確性**: authentication.md の公開インターフェース定義が、openapi.yaml や state_transitions と整合しているか
5. **テスト戦略**: bdd_test_strategy.md の認証テストフロー説明が新フローと整合しているか

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_simplification_analysis.md` — 変更の方針・根拠
2. [必須] 以下のレビュー対象ファイル（変更後の状態）
3. [参考] `docs/specs/openapi.yaml` — 外部仕様との整合確認用（TASK-292でレビュー中）

## レビュー対象ファイル

| ファイル | 変更概要 |
|---|---|
| `docs/architecture/architecture.md` | 認証フロー図・テーブル定義・TDR-001・セキュリティ設計等の更新（12箇所） |
| `docs/architecture/components/authentication.md` | 公開インターフェース更新（verifyAuthに統合）、依存関係・設計判断の更新 |
| `docs/architecture/components/web-ui.md` | AuthModalの説明を「Turnstile認証」に更新 |
| `docs/architecture/components/user-registration.md` | 仮ユーザー定義・認証フロー図・resolveAuth判定フローの更新 |
| `docs/architecture/bdd_test_strategy.md` | 認証テストフローの説明更新 |

## 出力

`tmp/workers/bdd-architect_293/review_report.md` にレビュー結果を出力する。

フォーマット:
```markdown
# レビュー結果: アーキテクチャ・コンポーネント設計

## サマリー
- 判定: {APPROVE | WARNING | REJECT}
- 指摘件数: HIGH: X件 / MEDIUM: Y件 / LOW: Z件

## 指摘事項
### [重要度] 指摘ID: タイトル
- ファイル:
- 箇所:
- 問題:
- 推奨対応:
```

## 完了条件

- [ ] 5ファイル全てのレビューが完了
- [ ] レビューレポートが artifacts_dir に出力されている

## スコープ外

- ファイルの修正（レビューのみ。修正は人間またはコーディングAIが実施）
- ソースコードのレビュー（コード変更は未着手）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 5ファイル全てのレビュー完了、レポート出力済み
- 次にすべきこと: なし（タスク完了）
- 未解決の問題: なし

### 進捗ログ

- 計画書 `tmp/auth_simplification_analysis.md` を読了
- レビュー対象5ファイル + 参照用外部仕様3ファイル（openapi.yaml, user_state_transitions.yaml, auth-code.yaml）を全て読了
- 5観点（計画書整合、ドキュメント間整合、変更漏れ、コンポーネント境界正確性、テスト戦略）でレビュー実施
- 判定: WARNING（HIGH: 2件, MEDIUM: 2件, LOW: 1件）
- レポート出力先: `tmp/workers/bdd-architect_293/review_report.md`
