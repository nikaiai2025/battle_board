-- テーマ設定カラム追加
-- See: features/theme.feature
-- See: docs/architecture/architecture.md TDR-016

ALTER TABLE users ADD COLUMN theme_id TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN font_id TEXT DEFAULT NULL;

-- NULL = デフォルトテーマ + ゴシックフォント（既存ユーザーに影響なし）
COMMENT ON COLUMN users.theme_id IS 'テーマID。NULLの場合はデフォルトテーマを適用';
COMMENT ON COLUMN users.font_id IS 'フォントID。NULLの場合はゴシックフォントを適用';
