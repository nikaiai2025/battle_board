-- Migration: 固定スレッド（案内板）対応
-- threads テーブルに is_pinned カラムを追加する
-- See: features/thread.feature @pinned_thread
-- See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-e

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- インデックス: 固定スレッドの高速検索用
CREATE INDEX IF NOT EXISTS idx_threads_is_pinned ON threads (is_pinned)
  WHERE is_pinned = true;

COMMENT ON COLUMN threads.is_pinned IS '固定スレッドフラグ。true の場合は一般ユーザーの書き込みを禁止し、last_post_at を未来日に設定して先頭表示を実現する';
