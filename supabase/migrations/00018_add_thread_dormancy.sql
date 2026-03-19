-- migration: スレッド休眠（is_dormant）フラグ追加
-- See: docs/specs/thread_state_transitions.yaml #states.unlisted
-- See: docs/architecture/architecture.md TDR-012
-- See: docs/architecture/components/posting.md §5 休眠管理の責務

-- is_dormant カラム追加（既存行はすべて DEFAULT false = アクティブ）
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS is_dormant BOOLEAN NOT NULL DEFAULT false;

-- インデックス追加: subject.txt / スレッド一覧クエリの最適化
-- (board_id, is_deleted, is_dormant, last_post_at DESC) の複合インデックス
-- See: docs/specs/thread_state_transitions.yaml #listing_rules filter
CREATE INDEX IF NOT EXISTS idx_threads_board_active_bump
  ON threads (board_id, is_deleted, is_dormant, last_post_at DESC);
