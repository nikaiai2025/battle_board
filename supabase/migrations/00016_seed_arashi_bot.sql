-- =============================================================================
-- 00016_seed_arashi_bot.sql
-- 荒らし役ボットの初期レコードを INSERT する。
--
-- 参照ドキュメント: docs/architecture/architecture.md §13 TDR-010
--                  docs/architecture/components/bot.md §5.1 bots テーブル
--                  config/bot-profiles.ts（hp=10, max_hp=10, bot_profile_key='荒らし役'）
--
-- 冪等性: name = '荒らし役' のレコードが既に存在する場合はスキップ（INSERT ... WHERE NOT EXISTS）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 荒らし役ボットの初期レコード INSERT
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
-- See: docs/architecture/components/bot.md §5.1 bots テーブル
-- See: docs/architecture/architecture.md §13 TDR-010
-- -----------------------------------------------------------------------------
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
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE name = '荒らし役'
);
