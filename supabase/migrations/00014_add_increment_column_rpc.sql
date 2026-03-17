-- =============================================================================
-- 00014_add_increment_column_rpc.sql
-- bots テーブルの数値カラムをアトミックにインクリメントする RPC 関数
--
-- 参照ドキュメント:
--   docs/architecture/architecture.md §7.2 同時実行制御（楽観的ロック）TDR-003
--   docs/architecture/components/bot.md §2.2 HP更新・ダメージ処理
--   src/lib/infrastructure/repositories/bot-repository.ts — incrementColumn
--
-- 背景:
--   Supabase JS v2 では UPDATE SET column = column + 1 のような式評価を
--   直接記述できないため、RPC を経由してアトミック UPDATE を実行する。
--   同一ボットへの同時攻撃（複数ユーザーが同時に !attack を実行）時の
--   レースコンディション（HIGH-004）を防ぐ。
--
-- 定義する RPC 関数:
--   1. increment_bot_column(p_bot_id UUID, p_column TEXT) RETURNS INTEGER
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. increment_bot_column
--
-- bots テーブルの指定カラムを atomic に +1 インクリメントし、更新後の値を返す。
-- UPDATE bots SET {column} = {column} + 1 WHERE id = p_bot_id RETURNING {column}
-- により、SELECT + UPDATE の2ステップによるレースコンディションを排除する。
--
-- 戻り値: インクリメント後のカラム値（INTEGER）
--
-- 許可されるカラム名（p_column）:
--   - 'total_posts'    : 総書き込み数
--   - 'accused_count'  : 被告発回数
--   - 'survival_days'  : 生存日数
--   - 'times_attacked' : 被攻撃回数（主要ユースケース）
--
-- 呼び出し元: bot-repository.ts > incrementColumn
--   supabaseAdmin.rpc('increment_bot_column', { p_bot_id: botId, p_column: column })
--
-- 参照: docs/architecture/architecture.md §7.2 同時実行制御（楽観的ロック）TDR-003
-- 参照: docs/architecture/components/bot.md §2.2 HP更新・ダメージ処理
-- 参照: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_bot_column(
  p_bot_id UUID,
  p_column  TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_result INTEGER;
BEGIN
  -- カラム名の許可リスト検証（SQLインジェクション対策）
  IF p_column NOT IN ('total_posts', 'accused_count', 'survival_days', 'times_attacked') THEN
    RAISE EXCEPTION 'increment_bot_column: invalid column name: %', p_column;
  END IF;

  -- アトミックインクリメント: 式評価により SELECT + UPDATE の競合を排除する
  EXECUTE format(
    'UPDATE bots SET %I = %I + 1 WHERE id = $1 RETURNING %I',
    p_column, p_column, p_column
  )
  INTO v_result
  USING p_bot_id;

  -- ボットが存在しない場合（v_result が NULL）はエラーをスロー
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'increment_bot_column: bot not found: %', p_bot_id;
  END IF;

  RETURN v_result;
END;
$$;
