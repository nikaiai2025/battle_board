-- =============================================================================
-- 00035_bulk_daily_reset_functions.sql
-- 日次リセット処理のバッチ化に必要な PostgreSQL RPC 関数の定義
--
-- 背景:
--   旧実装では BOT 数 N に対して N 回の RPC 呼び出しが発生し、
--   Vercel Hobby プランの 10 秒タイムアウト制限を超過する問題があった（TASK-355）。
--   本マイグレーションにより 2 つのバッチ RPC を追加し、日次リセットを 1 回の
--   DB ラウンドトリップで完結させる。
--
-- See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
-- See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる
-- See: docs/architecture/components/bot.md §2.10 日次リセット処理
--
-- 定義する RPC 関数:
--   1. bulk_update_daily_ids(p_bot_ids uuid[], p_daily_ids text[], p_daily_id_date text)
--   2. bulk_increment_survival_days()
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bulk_update_daily_ids
--
-- 全アクティブBOT の daily_id と daily_id_date を一括更新する。
-- unnest(uuid[], text[]) で (bot_id, daily_id) ペアをテーブル化し、
-- UPDATE ... FROM で 1 回の SQL に集約する。
--
-- 呼び出し元: bot-repository.ts > bulkUpdateDailyIds
--   supabaseAdmin.rpc('bulk_update_daily_ids', {
--     p_bot_ids: botIds,
--     p_daily_ids: dailyIds,
--     p_daily_id_date: dailyIdDate,
--   })
--
-- See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text
) RETURNS void AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION bulk_update_daily_ids(uuid[], text[], text) IS
  '全アクティブBOTの daily_id / daily_id_date を 1 回の UPDATE で一括更新する。'
  'See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する';

-- -----------------------------------------------------------------------------
-- 2. bulk_increment_survival_days
--
-- is_active = true の全 BOT の survival_days を一括 +1 する。
-- 旧実装の N 回個別 RPC 呼び出しを廃止し、単一 UPDATE に置き換える。
--
-- 呼び出し元: bot-repository.ts > bulkIncrementSurvivalDays
--   supabaseAdmin.rpc('bulk_increment_survival_days')
--
-- See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる
-- See: docs/specs/bot_state_transitions.yaml #daily_reset
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_increment_survival_days()
RETURNS void AS $$
BEGIN
  UPDATE bots
  SET survival_days = survival_days + 1
  WHERE is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION bulk_increment_survival_days() IS
  'is_active=true の全BOTの survival_days を 1 回の UPDATE で +1 する。'
  'See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる';
