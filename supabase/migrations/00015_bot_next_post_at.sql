-- =============================================================================
-- 00015_bot_next_post_at.sql
-- bots テーブルに next_post_at カラムを追加（TDR-010: cron駆動時の投稿判定用）
--
-- 参照ドキュメント: docs/architecture/architecture.md §13 TDR-010
--                  docs/architecture/components/bot.md §5.1 bots テーブル変更
--
-- 変更内容:
--   1. bots.next_post_at カラム追加 (TIMESTAMPTZ, NULLABLE)
--   2. 既存BOTの初期値を NOW() に設定（次のcronで即投稿対象になる）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bots テーブルに next_post_at カラムを追加
-- 次回投稿予定時刻。投稿完了時に NOW() + SchedulingStrategy.getNextPostDelay() で設定する。
-- cron 起動時は WHERE is_active = true AND next_post_at <= NOW() で投稿対象を判定する。
-- See: docs/architecture/architecture.md §13 TDR-010
-- See: docs/architecture/components/bot.md §5.1
-- -----------------------------------------------------------------------------
ALTER TABLE bots
    ADD COLUMN IF NOT EXISTS next_post_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 2. 既存BOTの初期値を NOW() に設定
-- next_post_at が NULL のBOTは次のcronで即投稿対象になる。
-- See: docs/architecture/architecture.md §13 TDR-010 > 撃破との整合性
-- -----------------------------------------------------------------------------
UPDATE bots SET next_post_at = NOW() WHERE next_post_at IS NULL;
