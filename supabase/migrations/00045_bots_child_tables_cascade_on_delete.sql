-- =============================================================================
-- 00045_bots_child_tables_cascade_on_delete.sql
-- bots を参照する残り3テーブルの FK に ON DELETE CASCADE を付与する
--
-- 症状: daily-maintenance Step 6（deleteEliminatedTutorialBots）で FK 違反により HTTP 500
-- 根本原因: 00044 で bot_posts のみ対処したが、bots 参照 FK は計4テーブル存在。残り3テーブル
--           （attacks / grass_reactions / collected_topics）も NO ACTION（デフォルト）のため
--           同様の FK 違反が発生する。
-- 修正: 3 FK をいずれも CASCADE に変更し、撃破済みチュートリアルBOT削除時に関連レコードが
--       自動削除されるようにする
--
-- 物理削除対象の範囲:
--   src/lib/ 全体で bots の DELETE は deleteEliminatedTutorialBots() のみ。
--   対象は bot_profile_key = 'tutorial' 限定（撃破済み + 7日経過未撃破）。
--   運営BOTはインカーネーションモデル（§6.11）で INSERT のため DELETE されない。
--   → CASCADE 発動対象はチュートリアルBOTに限定され、他BOT種別への副作用なし。
--
-- See: docs/architecture/components/bot.md §2.10 Step 6 / §6.10 / §6.11
-- See: docs/architecture/lessons_learned.md LL-017
-- See: docs/operations/incidents/2026-04-15_daily_maintenance_500_17day_outage.md
-- =============================================================================

-- attacks.bot_id
ALTER TABLE attacks
  DROP CONSTRAINT attacks_bot_id_fkey;

ALTER TABLE attacks
  ADD CONSTRAINT attacks_bot_id_fkey
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;

-- grass_reactions.receiver_bot_id
ALTER TABLE grass_reactions
  DROP CONSTRAINT grass_reactions_receiver_bot_id_fkey;

ALTER TABLE grass_reactions
  ADD CONSTRAINT grass_reactions_receiver_bot_id_fkey
  FOREIGN KEY (receiver_bot_id) REFERENCES bots(id) ON DELETE CASCADE;

-- collected_topics.source_bot_id
ALTER TABLE collected_topics
  DROP CONSTRAINT collected_topics_source_bot_id_fkey;

ALTER TABLE collected_topics
  ADD CONSTRAINT collected_topics_source_bot_id_fkey
  FOREIGN KEY (source_bot_id) REFERENCES bots(id) ON DELETE CASCADE;
