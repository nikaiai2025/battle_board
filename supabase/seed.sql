-- ローカル開発用シードデータ（本番では使用しない）
-- npx supabase db reset で自動実行される
--
-- 管理者ログイン:
--   URL: http://localhost:3000/admin/login
--   Email: admin@local.test
--   Password: admin1234

-- -----------------------------------------------------------------------------
-- 管理者アカウント (UUID固定: 00000000-0000-0000-0000-000000000001)
-- Supabase Auth の2層構造に合わせて auth.users → auth.identities → admin_users
-- の順でINSERTする。ON CONFLICT DO NOTHING により冪等性を確保する。
-- -----------------------------------------------------------------------------

-- ステップ1: Supabase Auth ユーザーを作成
-- encrypted_password は bcrypt ハッシュ（pgcrypto の crypt 関数を使用）
-- email_confirmed_at を設定することでメール確認済み状態にする
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@local.test',
    crypt('admin1234', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '',
    '',
    '',
    ''
)
ON CONFLICT DO NOTHING;

-- ステップ2: auth.identities にINSERT（email/password認証の紐付けに必要）
-- identity_data は Supabase Auth が参照するユーザー属性のJSONB
INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'admin@local.test',
    jsonb_build_object(
        'sub', '00000000-0000-0000-0000-000000000001',
        'email', 'admin@local.test',
        'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
)
ON CONFLICT DO NOTHING;

-- ステップ3: admin_users テーブルに管理者ロールを登録
-- id は auth.users の UUID と一致させる（Supabase Auth の uid で紐付け）
INSERT INTO admin_users (id, email, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@local.test',
    'admin'
)
ON CONFLICT DO NOTHING;
