-- =============================================================================
-- 00019_seed_arashi_bot_remaining9.sql
-- 荒らし役ボットの残り9体を INSERT する（合計10体にする）。
--
-- 参照ドキュメント: docs/architecture/architecture.md §13 TDR-010
--                  docs/architecture/components/bot.md §5.1 bots テーブル
--                  config/bot-profiles.ts（hp=10, max_hp=10, bot_profile_key='荒らし役'）
--
-- 背景: 00016_seed_arashi_bot.sql で1体を INSERT 済み。
--       features/bot_system.feature では荒らし役ボットは10体の並行稼働を定義している。
--       本マイグレーションで残り9体を追加し、合計10体を確保する。
--
-- 冪等性: name = '荒らし役' のレコードが既に10体以上ある場合はスキップ
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 荒らし役ボット 残り9体 INSERT
--
-- 各カラムの設定根拠:
--   - name, persona: 荒らし役ボットのプロフィール
--   - hp, max_hp: config/bot-profiles.ts の荒らし役設定値（10）
--   - daily_id: 英数字8文字のランダム生成（gen_random_uuid() の先頭8文字で代替）
--   - daily_id_date: CURRENT_DATE（当日の偽装IDとして即利用可能）
--   - is_active: true（稼働中）
--   - is_revealed: false（潜伏状態）
--   - bot_profile_key: '荒らし役'（config/bot_profiles.yaml のキー）
--   - next_post_at: NOW()（次のcronで即投稿対象になる）
--
-- See: features/bot_system.feature @荒らし役ボットは10体が並行して活動する
-- See: docs/architecture/components/bot.md §5.1 bots テーブル
-- See: docs/architecture/architecture.md §13 TDR-010
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_current_count INTEGER;
    v_insert_count  INTEGER;
    i               INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_current_count
    FROM bots
    WHERE name = '荒らし役';

    -- 既に10体以上存在する場合はスキップ
    IF v_current_count >= 10 THEN
        RAISE NOTICE '荒らし役ボットが既に % 体存在するためスキップします。', v_current_count;
        RETURN;
    END IF;

    v_insert_count := 10 - v_current_count;
    RAISE NOTICE '荒らし役ボットを % 体追加します（現在 % 体）。', v_insert_count, v_current_count;

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
            '荒らし役',
            'なんJ風の短文投稿者。感情的で短いレスを繰り返す荒らし役BOT。',
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
            '荒らし役',
            NOW()
        );
    END LOOP;

    RAISE NOTICE '荒らし役ボットの追加が完了しました（合計 10 体）。';
END $$;
