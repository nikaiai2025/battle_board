-- =============================================================================
-- 00006_user_registration.sql
-- 本登録・ログイン・PAT機能のDBマイグレーション
--
-- 変更内容:
--   1. edge_tokens テーブル新設（Phase 1-2 の users.auth_token を多重化）
--   2. users テーブルへの本登録関連カラム追加
--   3. 既存 auth_token データを edge_tokens テーブルへ移行
--   4. edge_tokens への RLS ポリシー追加
--
-- 参照ドキュメント:
--   docs/architecture/components/user-registration.md §3 データモデル変更
--   docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle
--
-- 注意事項:
--   - users.auth_token カラムは段階的廃止のため削除しない（フェーズ3で実施）
--   - PAT は平文保存（設計上の決定事項。user-registration.md §3.1 PAT平文保存の根拠 参照）
-- =============================================================================

-- =============================================================================
-- 1. edge_tokens テーブル新設
--    本登録ユーザーが複数デバイスで同一ユーザーとして書き込むために、
--    edge-token を複数保持できる構造にする。
--    See: docs/architecture/components/user-registration.md §3.2 新テーブル
-- =============================================================================

CREATE TABLE edge_tokens (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id),
  token        VARCHAR      NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- token 検索の高速化（認証チェック時に毎回使用する）
CREATE INDEX idx_edge_tokens_token ON edge_tokens(token);

-- user_id でのフィルタリング（ログアウト時・ユーザー別トークン管理に使用する）
CREATE INDEX idx_edge_tokens_user_id ON edge_tokens(user_id);

-- =============================================================================
-- 2. users テーブル拡張
--    本登録・PAT に関するカラムを追加する。
--    全カラムは NULL 許容（既存レコード＝仮ユーザーはすべて NULL）。
--    See: docs/architecture/components/user-registration.md §3.1 users テーブル拡張
-- =============================================================================

ALTER TABLE users
  -- Supabase Auth ユーザーID（本登録完了後に設定）
  ADD COLUMN supabase_auth_id   UUID         UNIQUE NULL,
  -- 本登録方法: 'email' | 'discord'
  ADD COLUMN registration_type  VARCHAR      NULL,
  -- 本登録完了日時
  ADD COLUMN registered_at      TIMESTAMPTZ  NULL,
  -- PAT（パーソナルアクセストークン）。32文字の hex 文字列（平文保存）
  ADD COLUMN pat_token          VARCHAR(64)  UNIQUE NULL,
  -- PAT 最終使用日時
  ADD COLUMN pat_last_used_at   TIMESTAMPTZ  NULL;

-- =============================================================================
-- 3. 既存データの移行
--    users.auth_token に格納されていた既存の edge-token を
--    edge_tokens テーブルに移行する。
--    See: docs/architecture/components/user-registration.md §3.2 users.auth_tokenからの移行
-- =============================================================================

-- auth_token が設定済みのユーザーの edge-token を移行する
-- created_at は元のユーザー作成日時を使用し、last_used_at は移行時刻（NOW()）を設定する
INSERT INTO edge_tokens (user_id, token, created_at, last_used_at)
SELECT id, auth_token, created_at, NOW()
FROM users
WHERE auth_token IS NOT NULL;

-- =============================================================================
-- 4. RLS ポリシー追加
--    edge_tokens は認証トークンを保持するため、厳格にアクセスを制限する。
--    anon / authenticated からの全操作を拒否し、service_role のみアクセス可能。
--    See: docs/architecture/components/user-registration.md §3.3 RLS ポリシー追加
--    See: docs/architecture/architecture.md §10.1.1
-- =============================================================================

ALTER TABLE edge_tokens ENABLE ROW LEVEL SECURITY;

-- edge_tokens: anon / authenticated からの全操作を拒否 (ポリシー未設定 = 全拒否)
-- service_role は RLS をバイパスするため、アプリケーション（サーバーサイド）から
-- supabaseAdmin クライアント経由のみアクセス可能となる
