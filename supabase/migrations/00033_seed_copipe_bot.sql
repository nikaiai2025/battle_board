-- =============================================================================
-- 00033_seed_copipe_bot.sql
-- コピペボット（!copipe コマンド実行型・HP:100）の初期レコードを INSERT する。
--
-- 参照ドキュメント: features/bot_system.feature @コピペボット
--                  config/bot_profiles.yaml > コピペ
--                  docs/architecture/components/bot.md §2.1
--
-- 冪等性: bot_profile_key = 'コピペ' のレコードが既に存在する場合はスキップ
-- =============================================================================

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
)
SELECT
    gen_random_uuid(),
    'コピペ',
    'コピペ・AAを投稿する運営ボット。!copipeコマンドを実行してランダムなコピペを披露する。',
    100,
    100,
    substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    CURRENT_DATE,
    true,
    false,
    0,
    0,
    0,
    0,
    'コピペ',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'コピペ'
);
