-- =============================================================================
-- 00049_normalize_arashi_active_count.sql
-- 荒らし役BOTの active 件数を 10 体へ再正規化する補正 migration
--
-- 背景:
--   00048 適用後も、bulkReviveEliminated() が eliminated 全件を再生成する実装だったため
--   荒らし役 active が再び 25 体まで増加した。
--
-- 方針:
--   - 最新 created_at の 10 体だけを active のまま残す
--   - 余剰 active は履歴保持のため物理削除せず凍結する
--   - revived_at を埋め、以後の bulkReviveEliminated() 対象から除外する
--
-- 冪等性:
--   荒らし役 active が既に 10 体以下なら 0 rows affected で終了する。
-- =============================================================================

BEGIN;

WITH ranked_arashi AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) AS rn
  FROM bots
  WHERE bot_profile_key = '荒らし役' AND is_active = true
)
UPDATE bots
SET
  is_active = false,
  eliminated_at = COALESCE(eliminated_at, NOW()),
  revived_at = COALESCE(revived_at, NOW())
WHERE id IN (SELECT id FROM ranked_arashi WHERE rn > 10);

COMMIT;
