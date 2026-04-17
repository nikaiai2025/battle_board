-- =============================================================================
-- 00047_add_revived_at_for_idempotency.sql
-- bulkReviveEliminated 冪等化のため bots.revived_at を追加
--
-- 背景:
--   Sprint-152 の17日障害解消時に日次リセットが複数回走行し、同一の撃破済み
--   レコードから新世代 BOT が N 回 INSERT されて荒らし役 active=107 体まで増殖。
--   SELECT 条件に「既に新世代を生成済みか」を示す述語がなく冪等性が欠如していた。
--
-- 修正:
--   1. bots.revived_at TIMESTAMPTZ NULL を追加
--      - NULL = 未復活（次回 bulkReviveEliminated の対象）
--      - NON-NULL = 復活済み（次回以降は除外）
--   2. 部分 INDEX idx_bots_pending_revival を作成
--      - 未復活レコードだけを高速 SELECT できる（現状 107/1000+ のカバー範囲）
--
-- See: tmp/workers/bdd-architect_TASK-386/design.md §2.3
-- See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
-- See: docs/specs/bot_state_transitions.yaml #daily_reset
-- =============================================================================

ALTER TABLE bots
  ADD COLUMN IF NOT EXISTS revived_at TIMESTAMPTZ NULL;

-- 部分 INDEX: 未復活の撃破済みレコードを高速 SELECT するため。
-- bulkReviveEliminated() は is_active=false AND revived_at IS NULL を検索するが、
-- 将来のゲームデータ量増加に備えて bot_profile_key も含めて複合キー化する。
CREATE INDEX IF NOT EXISTS idx_bots_pending_revival
  ON bots (bot_profile_key, is_active)
  WHERE revived_at IS NULL;

COMMENT ON COLUMN bots.revived_at IS
  '撃破されたボットが bulkReviveEliminated で次世代を生成済みであることを示すタイムスタンプ。NULL は未復活（復活対象）、NON-NULL は復活済み（SELECT 対象外）。Sprint-154 TASK-387 で追加（冪等化）。';
