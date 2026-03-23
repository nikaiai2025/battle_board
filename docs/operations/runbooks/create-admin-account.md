# 管理者アカウント作成

## 概要

管理者画面 (`/admin`) にログインするためのアカウントを作成する。
Supabase Auth ユーザー作成 + `admin_users` テーブル登録の2段階で構成される。

## 前提知識

管理者認証は以下の2層で成立する:

1. **Supabase Auth**: メール/パスワードの認証基盤（ユーザーID = UUID を発行）
2. **`admin_users` テーブル**: 管理者ロールの登録（Auth の UUID で紐付け）

片方のみでは管理者ログインできない。両方のレコードが必要。

**メールアドレスについて:** 架空アドレス（例: `admin@livebot.local`）を使用する。アプリケーションから管理者へメールを送信する機能はなく、メールアドレスはログインIDとしてのみ使用される。実在アドレスを使うとSupabase Authのパスワードリセット等で意図しないメール送信が発生しうるため、架空アドレスが望ましい。パスワードを忘れた場合はSupabase Dashboardから直接リセットする。

## Local環境

### ステップ1: Supabase Auth ユーザー作成

```bash
# Service Role Key を取得
npx supabase status
# → 出力内の "service_role key" をコピー

# Auth ユーザー作成
curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@livebot.local","password":"admin1234","email_confirm":true}'
```

レスポンスの `"id"` フィールド（UUID）をコピーする。

### ステップ2: admin_users テーブルに登録

```bash
npx supabase db query "
  INSERT INTO admin_users (id, email, role)
  VALUES ('<ステップ1のUUID>', 'admin@livebot.local', 'admin');
"
```

### ステップ3: 動作確認

ブラウザで `http://localhost:3000/admin/login` を開き、ステップ1のメール/パスワードでログインできることを確認する。

### 補足: Local環境リセット時

`npx supabase db reset` を実行すると Auth ユーザーも `admin_users` も消える。リセット後はステップ1から再実行が必要。

## 本番環境

### ステップ1: Supabase Auth ユーザー作成

Supabase Dashboard > Authentication > Users > **Add user** で作成する。

- Email: 架空アドレス（例: `admin@livebot.local`）
- Password: 十分に強固なパスワード
- Auto Confirm User: ON

作成後、一覧に表示される **UUID** をコピーする。

### ステップ2: admin_users テーブルに登録

```bash
npx supabase db query "
  INSERT INTO admin_users (id, email, role)
  VALUES ('<ステップ1のUUID>', 'admin@livebot.local', 'admin');
" --linked
```

### ステップ3: 動作確認

ブラウザで本番の `/admin/login` を開き、ステップ1のメール/パスワードでログインできることを確認する。

## 登録確認

```bash
# Local
npx supabase db query "SELECT id, email, role, created_at FROM admin_users;"

# 本番
npx supabase db query "SELECT id, email, role, created_at FROM admin_users;" --linked
```

## 注意事項

- パスワードはSupabase Auth内部でハッシュ管理される。`.env` 等への保存は不要
- `admin_users` テーブルはRLSで `anon` / `authenticated` 全操作拒否。変更は `service_role` 経由のみ
- DBリセット (`reset-remote-db.md`) を実行すると `admin_users` も削除される。再作成が必要
