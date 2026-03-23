---
task_id: TASK-292
sprint_id: Sprint-109
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_292
depends_on: []
created_at: 2026-03-24T16:00:00+09:00
updated_at: 2026-03-24T16:00:00+09:00
locked_files: []
---

## タスク概要

認証フロー簡素化（6桁認証コード廃止 → Turnstileのみ）に伴うドキュメント変更の整合性レビュー。
人間がドキュメントを編集済み。コード変更はまだ未着手。ドキュメントレベルで不整合がないかをレビューする。

**本タスクの対象: 外部仕様 + 用語辞書（5ファイル）**

## レビュー観点

1. **計画書との整合性**: 各ドキュメントの変更が `tmp/auth_simplification_analysis.md` の方針（案B: 6桁コード廃止）に合致しているか
2. **ドキュメント間の整合性**: 外部仕様（OpenAPI、状態遷移、画面定義）と用語辞書の間で矛盾がないか
3. **変更漏れ**: 認証コード関連の旧記述が残っていないか
4. **BDDシナリオとの整合性**: `features/authentication.feature`, `features/specialist_browser_compat.feature` との整合（※featureファイルはまだ未変更の可能性あり。その場合は「featureも要変更」と指摘）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_simplification_analysis.md` — 変更の方針・根拠
2. [必須] 以下のレビュー対象ファイル（変更後の状態）

## レビュー対象ファイル

| ファイル | 変更概要 |
|---|---|
| `docs/specs/screens/auth-code.yaml` | 全面書き換え — コード入力フィールド・表示を削除、Turnstileのみに |
| `docs/specs/user_state_transitions.yaml` | 状態名 code_issued → token_issued、遷移条件から認証コードを削除 |
| `docs/specs/user_registration_state_transitions.yaml` | 仮ユーザー定義・edge-token生成トリガーの用語更新 |
| `docs/specs/openapi.yaml` | リクエスト/レスポンススキーマ更新、エンドポイント説明更新 |
| `docs/requirements/ubiquitous_language.yaml` | 「認証コード」用語削除、関連用語の定義更新 |

## 出力

`tmp/workers/bdd-architect_292/review_report.md` にレビュー結果を出力する。

フォーマット:
```markdown
# レビュー結果: 外部仕様 + 用語辞書

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
- 完了済み: 5ファイル全レビュー + レポート出力
- 次にすべきこと: なし（人間による確認待ち）
- 未解決の問題: なし

### 進捗ログ

**2026-03-24 レビュー完了**

- 計画書 `tmp/auth_simplification_analysis.md` を読み、案Bの方針を把握
- レビュー対象5ファイルを全て精査
- BDDシナリオ3ファイル（authentication, specialist_browser_compat, admin）との整合性を確認
- 認証コード関連の旧記述をgrep検索で網羅的にチェック
- 判定: WARNING（HIGH: 0 / MEDIUM: 3 / LOW: 2）
- M1: OpenAPIエンドポイントパス `/api/auth/auth-code` に旧名称残存（機能的不整合なし、コード改修フェーズで判断）
- M2: 画面定義ファイル名 `auth-code.yaml` に旧名称残存（M1とセットで対応すべき）
- M3: ステップ定義(.steps.ts)とin-memoryリポジトリに認証コード前提の旧コードが大量残存（コード実装フェーズで改修必要）
- L1: user_registration.featureコメントに「認証コード」残存
- L2: specialist_browser_compat.feature L121は既に修正済み（情報共有）
- レポート出力先: `tmp/workers/bdd-architect_292/review_report.md`
