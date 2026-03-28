-- 00038_user_bot_vocabularies.sql
-- ユーザー語録テーブルを作成する
--
-- ユーザーがマイページから登録する荒らしBOTの語録。
-- 登録から24時間で自動失効する（expires_at で管理）。
-- 管理者固定文（bot_profiles.yaml）とマージされ、
-- 荒らしBOTの書き込み時にランダム選択される。
--
-- user_copipe と同パターン（管理者マスタ + ユーザーマスタの別テーブル方式）で構築。
-- 管理者の固定文は config/bot_profiles.yaml で管理（DB外）。
-- ユーザー語録は本テーブルでDB管理する。
--
-- See: features/user_bot_vocabulary.feature

CREATE TABLE user_bot_vocabularies (
    id            SERIAL       PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES users(id),
    content       VARCHAR(30)  NOT NULL,
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ  NOT NULL  -- registered_at + 24h（アプリ側で設定）
);

-- ユーザー別の語録一覧取得用（マイページ）
CREATE INDEX idx_ubv_user_id ON user_bot_vocabularies (user_id);

-- 有効期限フィルタリング用（全ユーザーの有効語録取得）
CREATE INDEX idx_ubv_expires_at ON user_bot_vocabularies (expires_at);

-- RLS 有効化（ポリシー未設定 = anon/authenticated からの全操作を拒否）
-- 本プロジェクトは全DB操作を supabaseAdmin（service_role）経由で行うため、
-- service_role は RLS をバイパスする。
-- See: supabase/migrations/00003_rls_policies.sql の設計方針
ALTER TABLE user_bot_vocabularies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_bot_vocabularies IS
  'ユーザー登録語録。マイページから登録し、荒らしBOTの書き込みにランダム使用される。24時間で自動失効。See: features/user_bot_vocabulary.feature';
COMMENT ON COLUMN user_bot_vocabularies.user_id IS '登録したユーザーのID';
COMMENT ON COLUMN user_bot_vocabularies.content IS '語録本文（最大30文字、! 禁止）';
COMMENT ON COLUMN user_bot_vocabularies.registered_at IS '登録日時';
COMMENT ON COLUMN user_bot_vocabularies.expires_at IS '有効期限（registered_at + 24時間）';
