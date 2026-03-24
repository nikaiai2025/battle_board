-- ローカル開発用シードデータ（本番では使用しない）
-- npx supabase db reset で自動実行される
--
-- 管理者ログイン:
--   URL: http://localhost:3000/admin/login
--   Email: admin@local.test
--   Password: admin1234
--
-- 一般ユーザー（無料・本登録済み）:
--   Email: user@local.test
--   Password: user1234
--
-- 一般ユーザー（有料・本登録済み）:
--   Email: premium@local.test
--   Password: premium1234

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

-- -----------------------------------------------------------------------------
-- 一般ユーザー（本登録済み）
-- UUID: 00000000-0000-0000-0000-000000000002（auth.users と users で共通）
--
-- Supabase Auth アカウント + users テーブル + edge_tokens を紐付けた状態で作成。
-- Email: user@local.test / Password: user1234 でログインできる。
-- -----------------------------------------------------------------------------

-- ステップ1: Supabase Auth ユーザーを作成
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
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'user@local.test',
    crypt('user1234', gen_salt('bf')),
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

-- ステップ2: auth.identities にINSERT
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
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'user@local.test',
    jsonb_build_object(
        'sub', '00000000-0000-0000-0000-000000000002',
        'email', 'user@local.test',
        'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
)
ON CONFLICT DO NOTHING;

-- ステップ3: users テーブルに本登録済みユーザーを作成
INSERT INTO users (
    id,
    auth_token,
    author_id_seed,
    is_verified,
    is_premium,
    username,
    supabase_auth_id,
    registration_type,
    registered_at
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'local-dev-user-token',
    'LOCAL_DEV',
    true,
    false,
    'devuser',
    '00000000-0000-0000-0000-000000000002',
    'email',
    now()
)
ON CONFLICT DO NOTHING;

-- ステップ4: edge_tokens テーブルにトークンを登録
INSERT INTO edge_tokens (user_id, token)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'local-dev-user-token'
)
ON CONFLICT DO NOTHING;

-- ステップ5: currencies テーブルに初期残高を付与（コマンド動作確認用）
INSERT INTO currencies (user_id, balance)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    10000
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 有料ユーザー（本登録済み）
-- UUID: 00000000-0000-0000-0000-000000000003（auth.users と users で共通）
--
-- Email: premium@local.test / Password: premium1234 でログインできる。
-- is_premium = true、有料テーマ・フォントの動作確認用。
-- -----------------------------------------------------------------------------

-- ステップ1: Supabase Auth ユーザーを作成
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
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'premium@local.test',
    crypt('premium1234', gen_salt('bf')),
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

-- ステップ2: auth.identities にINSERT
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
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    'premium@local.test',
    jsonb_build_object(
        'sub', '00000000-0000-0000-0000-000000000003',
        'email', 'premium@local.test',
        'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
)
ON CONFLICT DO NOTHING;

-- ステップ3: users テーブルに有料ユーザーを作成
INSERT INTO users (
    id,
    auth_token,
    author_id_seed,
    is_verified,
    is_premium,
    username,
    supabase_auth_id,
    registration_type,
    registered_at
)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'local-dev-premium-token',
    'LOCAL_DEV_PREMIUM',
    true,
    true,
    'premiumuser',
    '00000000-0000-0000-0000-000000000003',
    'email',
    now()
)
ON CONFLICT DO NOTHING;

-- ステップ4: edge_tokens テーブルにトークンを登録
INSERT INTO edge_tokens (user_id, token)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'local-dev-premium-token'
)
ON CONFLICT DO NOTHING;

-- ステップ5: currencies テーブルに初期残高を付与
INSERT INTO currencies (user_id, balance)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    10000
)
ON CONFLICT DO NOTHING;
