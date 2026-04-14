-- =============================================================================
-- 00044_bot_posts_cascade_on_bot_delete.sql
-- bot_posts.bot_id FK に ON DELETE CASCADE を付与する
--
-- 症状: daily-maintenance Step 6（deleteEliminatedTutorialBots）で FK 違反により HTTP 500
-- 根本原因: bot_posts.bot_id の FK が NO ACTION（デフォルト）で、bot_posts 参照がある
--           限り bots からの DELETE が失敗する
-- 修正: FK を CASCADE に変更し、撃破済みチュートリアルBOT削除時に関連 bot_posts が
--       自動削除されるようにする
--
-- 物理削除対象の範囲:
--   src/lib/ 全体で bots の DELETE は deleteEliminatedTutorialBots() のみ。
--   対象は bot_profile_key = 'tutorial' 限定（撃破済み + 7日経過未撃破）。
--   運営BOTはインカーネーションモデル（§6.11）で INSERT のため DELETE されない。
--   → CASCADE 発動対象はチュートリアルBOTに限定され、他BOT種別への副作用なし。
--
-- See: docs/architecture/components/bot.md §2.10 Step 6 / §6.10 / §6.11
-- See: tmp/reports/daily_maintenance_500_investigation.md
-- =============================================================================

ALTER TABLE bot_posts
  DROP CONSTRAINT bot_posts_bot_id_fkey;

ALTER TABLE bot_posts
  ADD CONSTRAINT bot_posts_bot_id_fkey
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;
