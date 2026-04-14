-- =============================================================================
-- 00043_fix_bulk_update_daily_ids_cast.sql
-- bulk_update_daily_ids RPC の text → date 暗黙キャストエラー修正
--
-- 症状: Daily Maintenance ワークフロー（POST /api/internal/daily-reset）が
--       17日連続 HTTP 500（2026-03-27 〜 2026-04-14）
-- 根本原因: p_daily_id_date (text) を bots.daily_id_date (DATE) 列にキャスト
--           なしで代入し、PostgreSQL の暗黙キャスト禁止により型エラー
-- 修正: daily_id_date = p_daily_id_date::date で明示キャスト
--
-- See: tmp/reports/daily_maintenance_500_investigation.md §4.1
-- =============================================================================

CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date::date  -- 明示キャスト（text → date）
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$;
