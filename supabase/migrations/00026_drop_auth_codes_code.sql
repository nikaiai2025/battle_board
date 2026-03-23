-- Sprint-110: 認証フロー簡素化 -- 6桁認証コード廃止
-- 6桁認証コード（code カラム）を auth_codes テーブルから削除する。
-- Turnstile のみで認証を行うため、code カラムは不要。
-- See: tmp/auth_simplification_analysis.md §5 方針: 案B
-- See: features/authentication.feature @Turnstile通過で認証に成功する

ALTER TABLE auth_codes DROP COLUMN IF EXISTS code;
