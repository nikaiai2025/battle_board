-- 開発連絡板に「タイトル」「ホームページ」カラムを追加する。
-- CGI掲示板の定番フォームフィールド。いずれも任意入力。
--
-- See: features/dev_board.feature

ALTER TABLE dev_posts
  ADD COLUMN title TEXT NOT NULL DEFAULT '',
  ADD COLUMN url   TEXT NOT NULL DEFAULT '';
