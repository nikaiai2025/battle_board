---
task_id: TASK-135
sprint_id: Sprint-46
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:45:00+09:00
updated_at: 2026-03-17T23:45:00+09:00
locked_files:
  - "[NEW] src/__tests__/integration/schema-consistency.test.ts"
  - package.json
---

## タスク概要

TypeScript Row型（DBレコード型）のフィールドが実DBスキーマに存在することを自動検証するスキーマ整合性テストを作成する。本番障害（inline_system_infoカラムのマイグレーション未作成）の再発防止策。

## 背景

- `post-repository.ts` の `PostRow` に `inline_system_info` フィールドが定義されていたが、対応するマイグレーションSQLが存在しなかった
- BDDテストはInMemoryリポジトリを使用するため検知不可（D-10 §2の設計通り）
- この種の不整合を自動検知する仕組みがなかった
- 詳細: `docs/operations/incidents/2026-03-17_post_500_missing_migrations.md`

## 必読ドキュメント（優先度順）

1. [必須] `docs/operations/incidents/2026-03-17_post_500_missing_migrations.md` — 障害記録
2. [必須] `docs/architecture/bdd_test_strategy.md` §7-8 — テストピラミッド・統合テスト方針
3. [必須] `features/support/integration-hooks.ts` — 統合テスト用Supabase接続パターン
4. [参考] `src/lib/infrastructure/repositories/*-repository.ts` — Row型定義の実例

## 実装要件

### テストファイル

`src/__tests__/integration/schema-consistency.test.ts` を新規作成する。

### テストの動作

1. `src/lib/infrastructure/repositories/` 配下の全 `*-repository.ts` をファイルシステムから自動スキャンする
2. 各ファイルから以下を正規表現で抽出する:
   - テーブル名: `.from("table_name")` パターンから取得
   - Row型フィールド: `interface *Row { ... }` ブロックからフィールド名（snake_case）を取得
3. Supabase Localに接続し、`information_schema.columns` から実DBのカラム一覧を取得する
4. 各テーブルについて、Row型の全フィールドがDBカラムに存在することをアサートする

### 自己メンテナンス性（最重要）

- テスト内にテーブル名やカラム名をハードコードしない
- リポジトリファイルを自動スキャンすることで、新しいRow型やフィールドが追加されたとき、テスト側の修正なしに自動検知する
- Row interface のフィールド名抽出は正規表現で十分（全Row型は `フィールド名: 型;` の単純な形式）

### Supabase接続

`features/support/integration-hooks.ts` と同じパターンで接続する:
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 環境変数を使用
- 未設定時は `describe.skip` でスキップ（通常の `npx vitest run` を壊さない）

### npmスクリプト

`package.json` の `scripts` に追加:
```json
"test:schema": "vitest run src/__tests__/integration/schema-consistency.test.ts"
```

## 現在のRow型一覧（参考 — テストにハードコードしないこと）

| Row型 | テーブル名 | ファイル |
|---|---|---|
| PostRow | posts | post-repository.ts |
| ThreadRow | threads | thread-repository.ts |
| UserRow | users | user-repository.ts |
| CurrencyRow | currencies | currency-repository.ts |
| AuthCodeRow | auth_codes | auth-code-repository.ts |
| EdgeTokenRow | edge_tokens | edge-token-repository.ts |
| AdminUserRow | admin_users | admin-user-repository.ts |
| AccusationRow | accusations | accusation-repository.ts |
| AttackRow | attacks | attack-repository.ts |
| BotRow | bots | bot-repository.ts |
| BotPostRow | bot_posts | bot-post-repository.ts |
| DailyStatRow | daily_stats | daily-stats-repository.ts |
| GrassReactionRow | grass_reactions | grass-repository.ts |
| IpBanRow | ip_bans | ip-ban-repository.ts |
| IncentiveLogRow | incentive_logs | incentive-log-repository.ts |

## 完了条件

- [ ] テストファイルが作成されている
- [ ] Supabase Local起動状態で `npm run test:schema` が PASS する
- [ ] 意図的にRow型にダミーフィールドを追加し、テストがFAILすることを確認する（確認後ダミーを削除）
- [ ] 通常の `npx vitest run` がスキーマテストをスキップし、既存テストに影響しない
- [ ] テストコマンド: `npm run test:schema`

## スコープ外

- 既存コードの修正
- D-10の更新（別途対応）
- DBからTypeScript方向の逆検証（DBにあるがRow型にないカラムの検出 — 現時点では不要）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 必読ドキュメント読み込み完了
- リポジトリファイル15件のRow型定義・テーブル名パターンを確認
- integration-hooks.ts の Supabase 接続パターンを確認
- テストファイル作成（1回目）: information_schema.columns を使用 → PostgRESTがpublicスキーマのみ公開するため使用不可と判明
- テストファイル修正: PostgREST OpenAPI エンドポイント（GET /rest/v1/）を活用するよう変更
- 接続失敗時のスキップ処理を実装（通常のvitest runに影響しない）
- package.json に test:schema スクリプト追加
- ダミーフィールドでFAIL確認・削除後にPASS確認

### テスト結果サマリー

#### npm run test:schema（Supabase Local起動状態）
- PASS: 3/3
  - リポジトリファイルが1件以上スキャンできること
  - スキャン結果の各エントリにテーブル名とフィールドが含まれること
  - 全 Row 型フィールドが対応する DB テーブルのカラムとして存在すること

#### npx vitest run（全テスト）
- PASS: 1141/1141（45ファイル）
- スキーマ整合性テストも含まれ（Supabase Local起動中のため実行）、既存テストに影響なし

#### ダミーフィールドによるFAIL確認
- PostRow に dummy_nonexistent_column を追加 → テストが1件FAIL（期待通り）
- エラーメッセージ: "PostRow.dummy_nonexistent_column は テーブル "posts" に存在しないカラムです"
- ダミーフィールド削除後 → 再びPASS
