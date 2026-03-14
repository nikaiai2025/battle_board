-- =============================================================================
-- 00005_auth_verification.sql
-- 認証フロー是正（G1〜G4）に伴うスキーマ変更
--
-- 変更内容:
--   users テーブルに is_verified カラムを追加する。
--   auth_codes テーブルに write_token, write_token_expires_at カラムを追加する。
--
-- 参照ドキュメント:
--   tmp/auth_spec_review_report.md §3.3 DB スキーマ変更
--   features/phase1/authentication.feature
--   features/constraints/specialist_browser_compat.feature
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users テーブル: is_verified カラム追加
--
-- edge-token の認証完了状態を保持する。
-- G1 修正: resolveAuth が認証コード検証の完了（auth_codes.verified）をチェックできるよう
-- users 側にもフラグを持たせる。
-- 既存データは DEFAULT false で初期化される（未認証状態として扱う）。
-- See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
-- -----------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- auth_codes テーブル: write_token カラム追加
--
-- 専ブラ向け認証橋渡しトークン。
-- 認証完了時に crypto.randomBytes(16).toString('hex') で生成される 32 文字 hex を保存する。
-- 認証完了前は NULL。ワンタイム使用・有効期限 10 分。
-- See: tmp/auth_spec_review_report.md §3.2 write_token 方式
-- -----------------------------------------------------------------------------
ALTER TABLE auth_codes
  ADD COLUMN write_token TEXT;

-- -----------------------------------------------------------------------------
-- auth_codes テーブル: write_token_expires_at カラム追加
--
-- write_token の有効期限（TIMESTAMPTZ）。
-- 認証完了前は NULL。有効期限は発行から 10 分。
-- See: tmp/auth_spec_review_report.md §3.2 write_token 方式
-- -----------------------------------------------------------------------------
ALTER TABLE auth_codes
  ADD COLUMN write_token_expires_at TIMESTAMPTZ;
