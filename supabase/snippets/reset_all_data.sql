-- =============================================================================
-- reset_all_data.sql
-- コンテンツリセット（ユーザー保全方式）
--
-- スレッド・投稿・ゲーム活動データを全削除し、ユーザーとシードデータを保全する。
-- テーブル構造・RLS・関数・マイグレーション履歴は保持される。
--
-- ■ 実行前に runbook の事前確認手順を必ず実施すること
--   See: docs/operations/runbooks/reset-remote-db.md
--
-- ■ 保全対象
--   ユーザー関連: users / edge_tokens / currencies / admin_users（全行）
--   シード: 固定スレッド（案内板）+ 1レス目 / 荒らし役ボットのみ（状態リセット）
--
-- ■ 破棄対象（復元しない）
--   チュートリアルBOT・煽りBOT — ユーザー操作時に動的生成されるため復元不要。
--   復元すると tutorialThreadId 等のコンテキスト消失で cron が全件エラーになる。
--
-- ■ 対象外（リセットしない）
--   dev_posts — 開発連絡板。本番システムと独立した運用のため
-- =============================================================================

BEGIN;

-- =========================================================================
-- Phase 1: シードデータを一時テーブルに退避
--
-- ユーザー関連テーブル (users, edge_tokens, currencies, admin_users) は
-- TRUNCATE 対象外のため退避不要。
-- =========================================================================

-- 固定スレッド
CREATE TEMP TABLE _seed_threads AS
SELECT * FROM threads WHERE is_pinned = true;
UPDATE _seed_threads SET post_count = 1;

-- 固定スレッドの1レス目
CREATE TEMP TABLE _seed_posts AS
SELECT p.* FROM posts p
JOIN _seed_threads st ON st.id = p.thread_id
WHERE p.post_number = 1;

-- 荒らし役ボットのみ保全（チュートリアル・煽りBOTは動的生成のため破棄）
-- チュートリアルBOTを復元すると tutorialThreadId コンテキスト消失で
-- cron の処理枠を占有し荒らし役BOTが投稿できなくなる（INCIDENT-BOTSILENT）
CREATE TEMP TABLE _seed_bots AS
SELECT * FROM bots WHERE bot_profile_key = '荒らし役';
UPDATE _seed_bots SET
  hp = max_hp, is_revealed = false, revealed_at = NULL,
  is_active = true, survival_days = 0, total_posts = 0,
  accused_count = 0, times_attacked = 0,
  eliminated_at = NULL, eliminated_by = NULL,
  daily_id = substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  daily_id_date = CURRENT_DATE, next_post_at = NOW();

-- =========================================================================
-- Phase 2: コンテンツテーブル TRUNCATE
--
-- !! 実行前確認: 対象リスト + 対象外リスト + 保全リスト = public 全テーブル であること
--    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- =========================================================================

TRUNCATE TABLE
  -- コンテンツ
  threads, posts, bots, bot_posts,
  -- ゲーム活動
  accusations, attacks, grass_reactions,
  incentive_logs, daily_events, daily_stats,
  -- 一時キュー
  pending_tutorials, pending_async_commands, auth_codes,
  -- 管理アクション
  ip_bans
RESTART IDENTITY CASCADE;

-- =========================================================================
-- Phase 3: ユーザーのキャッシュカラムをリセット
--
-- 削除されたコンテンツから集計されていた非正規化値を初期化する。
-- =========================================================================

UPDATE users SET streak_days = 0, last_post_date = NULL, grass_count = 0;

-- =========================================================================
-- Phase 4: シードデータ復元
-- =========================================================================

INSERT INTO bots    SELECT * FROM _seed_bots;
INSERT INTO threads SELECT * FROM _seed_threads;
INSERT INTO posts   SELECT * FROM _seed_posts;

-- =========================================================================
-- Phase 5: 検証
-- =========================================================================

DO $$
DECLARE
  v_users   BIGINT;
  v_bots    BIGINT;
  v_threads BIGINT;
BEGIN
  SELECT count(*) INTO v_users   FROM users;
  SELECT count(*) INTO v_bots    FROM bots;
  SELECT count(*) INTO v_threads FROM threads;

  RAISE NOTICE 'users=% (保全), bots=% (荒らし役のみ復元), threads=% (復元)',
    v_users, v_bots, v_threads;

  IF v_users < 1 THEN
    RAISE EXCEPTION 'FAIL: ユーザーが保全されていません';
  END IF;
  IF v_bots < 1 THEN
    RAISE EXCEPTION 'FAIL: 荒らし役ボットが復元されていません';
  END IF;
  IF v_bots > 15 THEN
    RAISE WARNING 'WARN: ボット数が多すぎます (%)。チュートリアル/煽りBOTが混入していないか確認してください', v_bots;
  END IF;

  RAISE NOTICE 'OK: コンテンツリセット完了';
END $$;

COMMIT;
