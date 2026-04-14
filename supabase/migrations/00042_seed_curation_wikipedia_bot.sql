-- =============================================================================
-- 00042_seed_curation_wikipedia_bot.sql
-- キュレーションBOT Phase B（Wikipedia 日次急上昇）の初期BOTレコード
--
-- Wikipedia速報ボット: 日本語Wikipedia の日次急上昇記事を収集・投稿する運営ボット。
-- プロファイル: curation_wikipedia
-- 参照: config/bot_profiles.yaml > curation_wikipedia
--
-- 冪等性: bot_profile_key = 'curation_wikipedia' のレコードが既に存在する場合はスキップ
--
-- See: features/curation_bot.feature
-- See: docs/architecture/components/bot.md §2.13.5
-- See: tmp/workers/bdd-architect_TASK-379/design.md §10.1
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
    'Wikipedia速報ボット',
    '日本語Wikipediaの日次急上昇記事をキュレーションして転載する運営ボット。',
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
    'curation_wikipedia',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_wikipedia'
);
