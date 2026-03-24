-- TASK-308: LEAK-2/3 修正 — !hissi / !kinou コマンドの BOT 対応
-- posts テーブルの daily_id カラムに検索インデックスを追加する。
-- findByDailyId クエリのパフォーマンス改善に使用する。
--
-- See: features/investigation.feature §ボットの書き込みへの調査
-- See: tmp/design_bot_leak_fix.md §3.3

CREATE INDEX IF NOT EXISTS idx_posts_daily_id ON posts (daily_id);
