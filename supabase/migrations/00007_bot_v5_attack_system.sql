-- =============================================================================
-- 00007_bot_v5_attack_system.sql
-- Bot system v5: bots テーブル拡張 + attacks テーブル新規作成
-- 参照ドキュメント: docs/architecture/components/bot.md §5.1〜§5.3
--                  docs/architecture/components/attack.md §2.2
--                  docs/specs/bot_state_transitions.yaml v5
--
-- 変更内容:
--   1. bots.times_attacked カラム追加 (INTEGER DEFAULT 0)
--   2. bots.bot_profile_key カラム追加 (VARCHAR)
--   3. attacks テーブル新規作成
--   4. attacks テーブルの RLS 設定（DENY ALL for anon/authenticated）
--   5. 既存の荒らし役ボットの hp/max_hp を 10 に更新
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bots テーブルに times_attacked カラムを追加
-- 被攻撃回数。撃破報酬計算式 base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus) に使用。
-- 日次リセット（eliminated -> lurking）時に 0 にリセットされる。
-- See: docs/specs/bot_state_transitions.yaml #elimination_reward
-- -----------------------------------------------------------------------------
ALTER TABLE bots
    ADD COLUMN IF NOT EXISTS times_attacked INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. bots テーブルに bot_profile_key カラムを追加
-- config/bot_profiles.yaml 内のプロファイルキーへの参照。
-- 荒らし役の値は '荒らし役'。将来のレイドボス等の拡張に対応する。
-- See: docs/architecture/components/bot.md §5.1
-- -----------------------------------------------------------------------------
ALTER TABLE bots
    ADD COLUMN IF NOT EXISTS bot_profile_key VARCHAR;

-- -----------------------------------------------------------------------------
-- 3. attacks テーブルを新規作成
-- 同一ユーザー同一ボット1日1回攻撃制限の管理テーブル。
-- (attacker_id, bot_id, attack_date) UNIQUE 制約で DB レベルで制限を強制する。
-- See: docs/architecture/components/bot.md §5.2
-- See: docs/specs/bot_state_transitions.yaml #attack_limits
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attacks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attacker_id  UUID        NOT NULL REFERENCES users(id),
    bot_id       UUID        NOT NULL REFERENCES bots(id),
    attack_date  DATE        NOT NULL,
    post_id      UUID        NOT NULL REFERENCES posts(id),
    damage       INTEGER     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 1日1回攻撃制限: 同一ユーザーが同一ボットに同日2回以上攻撃することを DB レベルで禁止する
    CONSTRAINT attacks_attacker_bot_date_unique UNIQUE (attacker_id, bot_id, attack_date)
);

-- 被攻撃回数の集計・日次クリーンアップ用インデックス
-- See: docs/architecture/components/bot.md §5.2 > インデックス
CREATE INDEX IF NOT EXISTS attacks_bot_id_attack_date_idx
    ON attacks (bot_id, attack_date);

-- -----------------------------------------------------------------------------
-- 4. attacks テーブルの RLS を有効化
-- anon / authenticated ロールからの全操作を拒否し、service_role のみアクセス可能。
-- ゲームの公平性確保のため、攻撃記録はクライアントから直接読み書きできない。
-- See: docs/architecture/components/bot.md §5.2 > RLSポリシー
-- -----------------------------------------------------------------------------
ALTER TABLE attacks ENABLE ROW LEVEL SECURITY;
-- attacks: anon / authenticated からの全操作を拒否 (ポリシー未設定 = 全拒否)

-- -----------------------------------------------------------------------------
-- 5. 既存の荒らし役ボットの hp/max_hp を 10 に更新
-- v5 での仕様変更: 荒らし役の HP を 30 -> 10 に変更（即死級チュートリアルMob）。
-- See: docs/specs/bot_state_transitions.yaml #phase2_bots
-- -----------------------------------------------------------------------------
UPDATE bots
    SET hp     = 10,
        max_hp = 10
    WHERE name = '荒らし役'
      AND max_hp = 30;
