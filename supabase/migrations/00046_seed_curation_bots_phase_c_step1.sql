-- =============================================================================
-- 00046_seed_curation_bots_phase_c_step1.sql
-- キュレーションBOT Phase C Step 1（subject_txt 流用 × 4）の初期BOTレコード
--
-- 対象BOT:
--   - 嫌儲速報ボット (curation_poverty)
--   - 芸スポ速報ボット (curation_mnewsplus)
--   - VIP速報ボット (curation_news4vip)
--   - liveedge速報ボット (curation_liveedge)
--
-- いずれも既存 SubjectTxtAdapter (subject_txt方式) を再利用する運営BOT。
-- 冪等性: 各 bot_profile_key のレコードが既に存在する場合はスキップ
--
-- See: features/curation_bot.feature
-- See: config/bot-profiles.ts
-- See: docs/architecture/components/bot.md §2.13.5
-- =============================================================================

-- 1. 嫌儲速報ボット
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
    '嫌儲速報ボット',
    '5ch嫌儲（poverty）のバズスレッドをキュレーションして転載する運営ボット。',
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
    'curation_poverty',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_poverty'
);

-- 2. 芸スポ速報ボット
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
    '芸スポ速報ボット',
    '5ch芸スポ速報+（mnewsplus）のバズスレッドをキュレーションして転載する運営ボット。',
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
    'curation_mnewsplus',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_mnewsplus'
);

-- 3. VIP速報ボット
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
    'VIP速報ボット',
    '5ch VIP（news4vip）のバズスレッドをキュレーションして転載する運営ボット。',
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
    'curation_news4vip',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_news4vip'
);

-- 4. liveedge速報ボット
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
    'liveedge速報ボット',
    'liveedge（eddibb.cc/liveedge）のバズスレッドをキュレーションして転載する運営ボット。',
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
    'curation_liveedge',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_liveedge'
);
