-- 開発連絡板の名前欄を必須化する（DEFAULT '名無しさん' を除去）。
--
-- 既存データで name が空の行があれば '名無し' で埋める。
-- See: features/dev_board.feature @名前は必須である

UPDATE dev_posts SET name = '名無し' WHERE name = '' OR name IS NULL;

ALTER TABLE dev_posts ALTER COLUMN name DROP DEFAULT;
