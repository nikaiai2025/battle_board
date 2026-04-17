-- =============================================================================
-- 00048_correct_bot_proliferation_sprint154.sql
-- Sprint-154 フェーズ2: 本番 bots テーブルの異常累積データを訂正
--
-- 対象:
--   1. 荒らし役 active 107 → 10 体（最新 created_at 10 体残し、他を凍結）
--   2. hiroyuki 撃破済み・7日経過未撃破を物理削除
--   3. aori 撃破済み・7日経過未撃破を物理削除
--   4. tutorial 撃破済み・7日経過未撃破を物理削除
--
-- 冪等性: ローカル環境等で該当データがない場合は 0 rows affected でスキップ。
--         2回目以降の適用も idempotent（荒らし役が既に 10 体以下なら UPDATE 対象なし）。
--
-- 前提: migration 00047 で `bots.revived_at` カラムが追加済みであること。
--
-- See: tmp/workers/bdd-architect_TASK-386/design.md §2.1, §2.2
-- =============================================================================

BEGIN;

-- =============================================================================
-- Step 1: 荒らし役 active 上位 10 体（最新 created_at）を残し、他を凍結
-- =============================================================================
-- ソフト削除の理由:
--   - 過去の投稿・撃破履歴のFK参照を保持するため物理削除しない
--   - `revived_at = NOW()` で bulkReviveEliminated の SELECT 対象から永久除外
--   - `eliminated_at = NOW()` で撃破済み相当として履歴に記録
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

-- =============================================================================
-- Step 2: 使い切りBOT（tutorial/aori/hiroyuki）の 7日経過未撃破を物理削除
-- =============================================================================
-- deleteEliminatedSingleUseBots() と同等の条件。migration 適用前の古い未撃破データを
-- 明示的にクリーンアップすることで、現状のオペレーションと日次リセットの挙動を一致させる。
DELETE FROM bots
WHERE bot_profile_key IN ('tutorial','aori','hiroyuki')
  AND created_at < NOW() - INTERVAL '7 days';

-- =============================================================================
-- Step 3: 使い切りBOT（tutorial/aori/hiroyuki）の撃破済みを物理削除
-- =============================================================================
DELETE FROM bots
WHERE bot_profile_key IN ('tutorial','aori','hiroyuki')
  AND is_active = false;

COMMIT;

-- =============================================================================
-- 適用後の期待状態（本番）:
--   - 荒らし役 active: 10 体
--   - 荒らし役 eliminated: 97 + 15 = 112 体（履歴保持）
--   - hiroyuki active: 召喚直後かつ 7 日以内の未撃破のみ
--   - aori active: 0 体
--   - tutorial active: ウェルカム進行中のユーザー用のみ（7日以内）
-- =============================================================================
