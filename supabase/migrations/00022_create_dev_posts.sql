-- 開発連絡板専用テーブル
--
-- 本番の posts / threads テーブルとは完全に独立した専用テーブル。
-- 認証不要・RLS不要・スレッド構造なしのフラット型掲示板。
--
-- See: features/dev_board.feature
-- See: docs/architecture/architecture.md §13 TDR-014

CREATE TABLE IF NOT EXISTS dev_posts (
  id         SERIAL      PRIMARY KEY,
  name       TEXT        NOT NULL DEFAULT '名無しさん',
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
