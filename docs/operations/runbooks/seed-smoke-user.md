# スモークテスト用ユーザーのシード

## 概要

本番スモークテスト（D-10 §11）の Phase B（書き込み検証）で使用する専用ユーザー。
マイグレーション `00017_seed_smoke_user.sql` で自動作成される。

本 runbook の手作業は **トークン取得と `.env.prod.smoke` への転記のみ**（初回1回限り）。

## 仕組み

マイグレーションが以下を自動実行する:

1. `users` レコード作成（`author_id_seed = 'SMOKE_TEST'`, `is_verified = true`）
2. `edge_tokens` レコード作成（トークンは `gen_random_uuid()` で DB 内部生成）
3. `currencies` レコード作成（残高 10,000）

トークン値は DB 内部で生成されるため git に含まれない。

## 手順（初回のみ）

### ステップ1: マイグレーション適用

```bash
# ローカル
npx supabase db reset    # seed含む全マイグレーションが再適用される

# 本番
npx supabase db push --linked
```

### ステップ2: トークン取得

```bash
# ローカル
npx supabase db query "
  SELECT et.token FROM edge_tokens et
  JOIN users u ON u.id = et.user_id
  WHERE u.author_id_seed = 'SMOKE_TEST';
"

# 本番
npx supabase db query "
  SELECT et.token FROM edge_tokens et
  JOIN users u ON u.id = et.user_id
  WHERE u.author_id_seed = 'SMOKE_TEST';
" --linked
```

### ステップ3: `.env.prod.smoke` に記録

`.env.prod.smoke.example` をコピーし、ステップ2の出力値を転記する。

```bash
cp .env.prod.smoke.example .env.prod.smoke
# PROD_SMOKE_EDGE_TOKEN= にステップ2の値を貼り付け
```

## シード確認

```bash
npx supabase db query "
  SELECT u.id, u.author_id_seed, u.is_verified, c.balance
  FROM users u
  LEFT JOIN currencies c ON c.user_id = u.id
  LEFT JOIN edge_tokens et ON et.user_id = u.id
  WHERE u.author_id_seed = 'SMOKE_TEST';
" --linked
```

## 通貨残高の補充

テスト実行のたびにコマンドコスト（`!tell` 10、`!attack` 5 等）で減少する。書き込み報酬（+5/回）で部分的に回復するが、枯渇した場合は以下で補充する。

```bash
npx supabase db query "
  UPDATE currencies SET balance = 10000
  WHERE user_id = (SELECT id FROM users WHERE author_id_seed = 'SMOKE_TEST');
" --linked
```

## 注意事項

- DBリセット (`reset-remote-db.md`) を実行するとシードも消える。マイグレーション再適用後にステップ2〜3を再実行する（トークン値が変わるため）
- 管理者アカウント（Phase B のクリーンアップで使用）は別途 `create-admin-account.md` で作成する
