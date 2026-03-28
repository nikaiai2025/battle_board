---
task_id: TASK-306
sprint_id: Sprint-112
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T17:00:00+09:00
updated_at: 2026-03-24T17:00:00+09:00
locked_files:
  - "[NEW] supabase/seed.sql"
---

## タスク概要

ローカル開発用のシードデータ（管理者アカウント）を `supabase/seed.sql` に作成する。
`npx supabase db reset` 実行時にマイグレーション後に自動実行され、開発用の管理者アカウントが使える状態になる。

## 必読ドキュメント

1. [必須] `docs/operations/runbooks/create-admin-account.md` — 管理者アカウント作成手順（この手順をSQL化する）
2. [必須] `supabase/config.toml` — L60-65: seed設定（`sql_paths = ["./seed.sql"]`）
3. [参考] `supabase/migrations/00001_create_tables.sql` — admin_usersテーブル定義

## 出力

- `supabase/seed.sql` — ローカル開発用シードデータ

## 要件

以下のアカウントをシードする:

### 管理者アカウント
- Email: `admin@local.test`
- Password: `admin1234`
- 用途: `/admin/login` でログイン

### 実装方針

1. `auth.users` テーブルに直接INSERT（パスワードは `crypt('admin1234', gen_salt('bf'))` でハッシュ）
2. `auth.identities` テーブルにもINSERT（Supabase Authのemail/password認証に必要）
3. `admin_users` テーブルにINSERT
4. 全INSERTに `ON CONFLICT DO NOTHING` を付与（冪等性確保）
5. UUIDは固定値を使用（`00000000-0000-0000-0000-000000000001`）

### ファイル先頭のコメントに以下を記載

```
-- ローカル開発用シードデータ（本番では使用しない）
-- npx supabase db reset で自動実行される
--
-- 管理者ログイン:
--   URL: http://localhost:3000/admin/login
--   Email: admin@local.test
--   Password: admin1234
```

## 完了条件

- [ ] `supabase/seed.sql` が存在する
- [ ] `npx supabase db reset` が正常完了する
- [ ] `http://localhost:3000/admin/login` で admin@local.test / admin1234 でログインできる
- [ ] テストコマンド: `npx supabase db reset`

## スコープ外

- 一般ユーザーのシード（Turnstile認証のため email/password ログインは存在しない）
- 本番環境のシード
- テストデータ（スレッド・投稿等）のシード

## 補足

- Supabase ローカルが起動していない場合は `npx supabase start` で起動してからテストする
- Docker Desktop が必要。起動コマンド: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: supabase/seed.sql 作成、npx supabase db reset での動作確認
- 次にすべきこと: なし
- 未解決の問題: `npx supabase db reset` 完了後に502エラーが発生するが、seed.sql 追加前から存在する既存問題（ストレージコンテナのヘルスチェックタイムアウト）。シードSQL自体は正常完了している

### 進捗ログ

- supabase/seed.sql を新規作成（auth.users → auth.identities → admin_users の3テーブルにINSERT）
- `npx supabase db reset` を実行し、デバッグログで全INSERT成功（INSERT 0 1 × 4）を確認
- `npx supabase db query "SELECT ..."` で admin_users テーブルにレコードが正常挿入されていることを確認
- 502エラーは git stash で seed.sql を除外した状態でも発生することを確認 → 既存問題

### テスト結果サマリー

- `npx supabase db reset` 実行結果: シードSQL正常完了
  - auth.users INSERT: 成功（email_confirmed_at 設定済み）
  - auth.identities INSERT: 成功（provider=email）
  - admin_users INSERT: 成功（role=admin）
- admin_users クエリ結果: id=00000000-0000-0000-0000-000000000001、email=admin@local.test、role=admin
- 502エラーはストレージコンテナのヘルスチェックに関するもので、seed.sql追加前から存在する既存問題
