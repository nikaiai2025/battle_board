-- =============================================================================
-- 00051_human_mimic_bot.sql
-- 人間模倣ボット用 reply_candidates テーブル作成 + bot seed
-- =============================================================================

CREATE TABLE IF NOT EXISTS reply_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_profile_key VARCHAR NOT NULL,
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    generated_from_post_count INTEGER NOT NULL DEFAULT 0,
    posted_post_id UUID NULL REFERENCES posts(id) ON DELETE SET NULL,
    posted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reply_candidates_thread_posted_created
    ON reply_candidates(thread_id, posted_at, created_at);

CREATE INDEX IF NOT EXISTS idx_reply_candidates_profile_thread_posted
    ON reply_candidates(bot_profile_key, thread_id, posted_at);

ALTER TABLE reply_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'reply_candidates'
          AND policyname = 'reply_candidates_service_role_all'
    ) THEN
        CREATE POLICY reply_candidates_service_role_all
            ON reply_candidates
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

DO $$
DECLARE
    v_current_count INTEGER;
    v_insert_count  INTEGER;
    i               INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_current_count
    FROM bots
    WHERE bot_profile_key = 'human_mimic'
      AND is_active = true;

    IF v_current_count >= 10 THEN
        RAISE NOTICE 'human_mimic bot が既に % 体存在するため seed をスキップします。', v_current_count;
        RETURN;
    END IF;

    v_insert_count := 10 - v_current_count;

    FOR i IN 1..v_insert_count LOOP
        INSERT INTO bots (
            id,
            name,
            persona,
            hp,
            max_hp,
            daily_id,
            daily_id_date,
            is_active,
            is_revealed,
            survival_days,
            total_posts,
            accused_count,
            times_attacked,
            bot_profile_key,
            next_post_at
        ) VALUES (
            gen_random_uuid(),
            '名無しさん',
            '人間模倣',
            10,
            10,
            substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
            CURRENT_DATE,
            true,
            false,
            0,
            0,
            0,
            0,
            'human_mimic',
            NOW()
        );
    END LOOP;
END $$;
