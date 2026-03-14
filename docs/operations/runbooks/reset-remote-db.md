# 本番DBデータリセット

## 概要

リモート Supabase DB の全テーブルのデータを削除する。テーブル構造・RLS・関数は保持される。

## 用途

- リリース前のテストデータ全削除
- E2Eテスト前の本番DB初期化

## 方法1: CLIスクリプト（推奨）

```bash
SUPABASE_URL="https://{ref}.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="ey..." \
node scripts/reset-remote-db.mjs
```

または `.env.production.local` に接続情報を記載しておけば引数不要:

```bash
node scripts/reset-remote-db.mjs
```

### 接続情報の取得方法

```bash
# プロジェクトref確認
npx supabase projects list

# URL: https://{ref}.supabase.co

# Service Role Key 取得
npx supabase projects api-keys --project-ref {ref}
```

### 安全策

- `SUPABASE_URL` が localhost を指している場合は実行拒否される（ローカルは `npx supabase db reset` を使う）
- 削除は外部キー依存順（子→親）で実行される
- 削除後に全10テーブルが空であることを自動検証する

## 方法2: ダッシュボード SQL Editor

`supabase/snippets/reset_all_data.sql` の内容を Supabase ダッシュボード > SQL Editor にペーストして実行する。

## 対象テーブル

削除順（外部キー依存順）:

1. bot_posts
2. accusations
3. incentive_logs
4. posts
5. currencies
6. bots
7. threads
8. auth_codes
9. admin_users
10. users

## 関連ファイル

| ファイル | 説明 |
|---|---|
| `scripts/reset-remote-db.mjs` | CLI実行用スクリプト |
| `supabase/snippets/reset_all_data.sql` | ダッシュボード用SQL |
