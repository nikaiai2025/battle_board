---
task_id: TASK-319
sprint_id: Sprint-121
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T17:00:00+09:00
updated_at: 2026-03-26T17:00:00+09:00
locked_files:
  - docs/specs/openapi.yaml
---

## タスク概要

OpenAPI仕様書 (D-04) に、実装済みだが未記載のAPIエンドポイントとフィールドを追記する。Sprint-56のPhase 5検証で検出されたDOC-003/004/005を一括解消する。

## 追記対象

### DOC-004: Internal API（Bearer認証: BOT_API_KEY）

| パス | メソッド | 用途 |
|---|---|---|
| `/api/internal/bot/execute` | POST | BOT定期実行（cron） |
| `/api/internal/daily-reset` | POST | 日次リセット（ID・BOTマーク・生存日数） |
| `/api/internal/daily-stats` | POST | 日次統計集計 |
| `/api/internal/newspaper` | POST | 新聞コマンド非同期処理 |

### DOC-005: 認証ルート

実装パスを確認し、`docs/specs/openapi.yaml` に未記載の全認証ルートを追加すること。
現在の実装ディレクトリ: `src/app/api/auth/` 配下（auth-code, callback, confirm, login, logout, pat, register, reset-password, update-password, verify）

### DOC-003: inlineSystemInfoフィールド

投稿レスポンスに含まれる `inlineSystemInfo` フィールド（コマンド効果のレス内マージ表示）をスキーマに追加する。
実装箇所: `src/lib/services/post-service.ts` の `createPost` 戻り値を参照。

## 必読ドキュメント

1. [必須] `docs/specs/openapi.yaml` — 現在のOpenAPI仕様書
2. [必須] `tmp/workers/archive/bdd-doc-reviewer_TASK-157/doc_review_report.md` — 元の検出レポート
3. [参考] `src/app/api/internal/` — Internal APIルート実装
4. [参考] `src/app/api/auth/` — 認証ルート実装
5. [参考] `docs/architecture/components/user-registration.md` — 認証API一覧（section 12）

## 出力（生成すべきファイル）

- `docs/specs/openapi.yaml` — 更新

## 完了条件

- [ ] Internal API 4本がOpenAPIに記載されている
- [ ] 認証関連ルートがOpenAPIに記載されている
- [ ] inlineSystemInfoフィールドが投稿スキーマに追加されている
- [ ] OpenAPI構文が有効（YAMLとして正しい）
- [ ] `npx vitest run` 全PASS（回帰確認）

## スコープ外

- OpenAPI以外のドキュメント更新
- APIの実装変更

## 補足・制約

- 既存のOpenAPIのスタイル・構成に合わせること（セクション構成、命名規則等）
- Internal APIはサーバー間通信のみ（外部公開しない）のため、適切にタグ付けすること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [x] 必読ドキュメント確認
- [x] 実装コード確認（internal API 5本、auth API 10本）
- [x] DOC-003: inlineSystemInfoがPost schemaに既記載であることを確認（追記不要）
- [x] DOC-005: 認証ルート9本をopenapi.yamlに追記（auth-codeは廃止済みのため除外）
- [x] DOC-004: Internal API 5本をopenapi.yamlに追記（newspaper/pending, newspaper/completeの2本に分割）
- [x] internalBearerAuthセキュリティスキームをcomponentsに追加
- [x] YAML構文検証: PASS
- [x] vitest回帰テスト: 98ファイル・1896件 PASS

### テスト結果サマリー

- npx vitest run: 98 passed / 1896 tests PASS（回帰確認済み）
- npx js-yaml docs/specs/openapi.yaml: YAML valid
