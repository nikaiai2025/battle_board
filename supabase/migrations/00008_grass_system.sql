-- =============================================================================
-- 00008_grass_system.sql
-- 草コマンド(!w)システム: grass_reactions テーブル新規作成 + users.grass_count 追加
-- 参照ドキュメント: features/reactions.feature
--                  tmp/workers/bdd-architect_TASK-098/grass_system_design.md
--
-- 変更内容:
--   1. users テーブルに grass_count カラムを追加
--   2. grass_reactions テーブルを新規作成
--   3. grass_reactions テーブルの RLS 設定
--   4. grass_reactions テーブルのインデックス作成
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. users テーブルに grass_count カラムを追加
-- 草の通算受領回数をキャッシュする非正規化カラム。
-- 草付与時に +1 するアトミック更新で使用する。
-- マイページ表示(mypage.feature)とアイコン決定(reactions.feature)で参照される。
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS grass_count INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. grass_reactions テーブルを新規作成
-- 草の付与記録。同日・同一付与者・同一受領者の重複を DB レベルで禁止する。
-- receiver_id(人間)と receiver_bot_id(ボット)の排他的OR構造。
-- See: features/reactions.feature §重複制限
-- See: features/reactions.feature §ボットへの草
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grass_reactions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    giver_id        UUID         NOT NULL REFERENCES users(id),
    receiver_id     UUID         REFERENCES users(id),          -- 人間の場合
    receiver_bot_id UUID         REFERENCES bots(id),           -- ボットの場合
    target_post_id  UUID         NOT NULL REFERENCES posts(id),
    thread_id       UUID         NOT NULL REFERENCES threads(id),
    given_date      DATE         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 受領者は人間かボットのいずれか一方が必須
    CONSTRAINT grass_reactions_receiver_check
        CHECK (
            (receiver_id IS NOT NULL AND receiver_bot_id IS NULL)
            OR (receiver_id IS NULL AND receiver_bot_id IS NOT NULL)
        ),

    -- 同日・同一付与者・同一人間受領者の重複を禁止
    -- NOTE: PostgreSQL の UNIQUE 制約は NULL を distinct 値として扱うため、
    --       receiver_id が NULL のレコードはこの制約にかからない
    CONSTRAINT grass_reactions_giver_receiver_date_unique
        UNIQUE (giver_id, receiver_id, given_date),

    -- 同日・同一付与者・同一ボット受領者の重複を禁止
    CONSTRAINT grass_reactions_giver_bot_date_unique
        UNIQUE (giver_id, receiver_bot_id, given_date)
);

-- -----------------------------------------------------------------------------
-- 3. RLS を有効化
-- service_role のみアクセス可能(他のゲーム系テーブルと同じパターン)。
-- anon / authenticated からの全操作を拒否(ポリシー未設定 = 全拒否)
-- -----------------------------------------------------------------------------
ALTER TABLE grass_reactions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. インデックス作成
-- receiver_id での集計クエリ用(将来の一括集計・検証用)
-- UNIQUE 制約が giver_id 先頭のインデックスを自動作成するため、giver_id 用は不要
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS grass_reactions_receiver_id_idx
    ON grass_reactions (receiver_id)
    WHERE receiver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS grass_reactions_receiver_bot_id_idx
    ON grass_reactions (receiver_bot_id)
    WHERE receiver_bot_id IS NOT NULL;
