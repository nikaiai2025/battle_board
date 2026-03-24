-- =============================================================================
-- 00029_bot_grass_count.sql
-- bots テーブルに草カウントを追加し、RPC 許可リストを拡張する
--
-- 背景（LEAK-1修正）:
--   !w コマンドでボットの書き込みに草を生やすと「計0本」と表示され、
--   BOTであることが無コストで判別できてしまうバグを修正する。
--   ボットにも草カウントを保持し、人間と同じフォーマット（「計N本」）で表示する。
--
-- 変更内容:
--   1. bots テーブルに grass_count カラムを追加（NOT NULL DEFAULT 0）
--   2. increment_bot_column RPC の許可リストに 'grass_count' を追加
--
-- 参照ドキュメント:
--   tmp/design_bot_leak_fix.md §2.2 修正設計
--   features/reactions.feature §ボットへの草
--   src/lib/infrastructure/repositories/grass-repository.ts — incrementBotGrassCount
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bots テーブルに grass_count カラムを追加
--
-- ボットが受け取った草の通算本数を記録する。
-- 既存レコードへの影響を避けるため DEFAULT 0 を指定する。
-- IF NOT EXISTS により冪等性を担保する（再実行時にエラーにならない）。
-- -----------------------------------------------------------------------------
ALTER TABLE bots ADD COLUMN IF NOT EXISTS grass_count INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. increment_bot_column RPC の許可リストに 'grass_count' を追加
--
-- 既存の RPC 関数を CREATE OR REPLACE で再定義し、grass_count を許可リストに追加する。
-- 変更点: p_column の IN 句に 'grass_count' を追加。
--
-- 許可されるカラム名（p_column）:
--   - 'total_posts'    : 総書き込み数
--   - 'accused_count'  : 被告発回数
--   - 'survival_days'  : 生存日数
--   - 'times_attacked' : 被攻撃回数
--   - 'grass_count'    : 草カウント（追加）
--
-- 呼び出し元: grass-repository.ts > incrementBotGrassCount
--   supabaseAdmin.rpc('increment_bot_column', { p_bot_id: botId, p_column: 'grass_count' })
--
-- 参照: supabase/migrations/00014_add_increment_column_rpc.sql（元定義）
-- 参照: features/reactions.feature @ボットへの草でも正しい草カウントが表示される
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
  IF p_column NOT IN (
    'total_posts', 'accused_count', 'survival_days', 'times_attacked',
    'grass_count'  -- TASK-307: ボット草カウント追加
  ) THEN
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
