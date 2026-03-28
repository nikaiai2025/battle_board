-- 00036_user_copipe_entries.sql
-- ユーザーが登録するコピペ(AA)エントリテーブルを作成する
--
-- 管理者データ（copipe_entries）とは別テーブルとし、
-- seed-copipe.ts の完全同期がユーザーデータを破壊しない構造にする。
-- !copipe コマンドは両テーブルをマージして検索する。
--
-- 名前の重複: 全面的に許可（同一ユーザー内・異ユーザー間・管理者データとの間すべて）
--
-- See: features/user_copipe.feature

CREATE TABLE user_copipe_entries (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- name 検索用（!copipe コマンドの完全一致・部分一致検索）
CREATE INDEX idx_user_copipe_entries_name ON user_copipe_entries (name);

-- マイページ一覧用（自分の登録コピペ取得）
CREATE INDEX idx_user_copipe_entries_user_id ON user_copipe_entries (user_id);

-- RLS 有効化（ポリシー未設定 = anon/authenticated からの全操作を拒否）
-- 本プロジェクトは全DB操作を supabaseAdmin（service_role）経由で行うため、
-- service_role は RLS をバイパスする。認可チェックは UserCopipeService 層で実施。
-- See: supabase/migrations/00003_rls_policies.sql の設計方針
ALTER TABLE user_copipe_entries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_copipe_entries IS
  'ユーザー登録コピペ(AA)エントリ。マイページから登録し、!copipe コマンドで全員が検索可能。See: features/user_copipe.feature';
COMMENT ON COLUMN user_copipe_entries.user_id IS '登録したユーザーのID。編集・削除の認可に使用';
COMMENT ON COLUMN user_copipe_entries.name IS 'コピペの名称（重複許可）';
COMMENT ON COLUMN user_copipe_entries.content IS 'AA本文（特殊文字を含むためTEXTで格納）';
COMMENT ON COLUMN user_copipe_entries.updated_at IS '最終更新日時（編集時に更新）';
