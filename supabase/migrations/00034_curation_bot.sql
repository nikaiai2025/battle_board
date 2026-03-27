-- =============================================================================
-- 00034_curation_bot.sql
-- キュレーションBOTの収集バズ情報バッファ + BOT初期レコード
--
-- See: features/curation_bot.feature
-- See: docs/architecture/components/bot.md §5.5, §5.6
-- =============================================================================

-- 1. collected_topics テーブル
CREATE TABLE collected_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_bot_id UUID NOT NULL REFERENCES bots(id),
    article_title TEXT NOT NULL,
    content TEXT,
    source_url TEXT NOT NULL,
    buzz_score NUMERIC NOT NULL,
    is_posted BOOLEAN DEFAULT false,
    posted_at TIMESTAMPTZ,
    collected_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE collected_topics IS
    'キュレーションBOTが収集したバズ情報バッファ。See: features/curation_bot.feature';
COMMENT ON COLUMN collected_topics.source_bot_id IS '収集元キュレーションBOTのID';
COMMENT ON COLUMN collected_topics.article_title IS '記事タイトル（スレタイとして使用）';
COMMENT ON COLUMN collected_topics.content IS '投稿内容（ベストエフォート。取得失敗時はNULL）';
COMMENT ON COLUMN collected_topics.source_url IS '元ネタURL';
COMMENT ON COLUMN collected_topics.buzz_score IS '収集時のバズスコア';
COMMENT ON COLUMN collected_topics.is_posted IS '投稿済みフラグ';
COMMENT ON COLUMN collected_topics.posted_at IS '投稿日時（is_posted=true時に設定）';
COMMENT ON COLUMN collected_topics.collected_date IS '収集日（JST基準）';

-- 投稿候補検索の高速化（source_bot_id + collected_date + is_posted の複合）
-- 部分インデックス: 投稿済みレコードは検索対象外のためインデックスから除外しサイズを抑制
CREATE INDEX idx_collected_topics_unposted
    ON collected_topics (source_bot_id, collected_date, is_posted)
    WHERE is_posted = false;

-- 同一BOT・同日・同URLの重複INSERTを防止
-- save() の ON CONFLICT (source_bot_id, collected_date, source_url) DO NOTHING に使用
CREATE UNIQUE INDEX idx_collected_topics_unique_entry
    ON collected_topics (source_bot_id, collected_date, source_url);

-- RLS有効化
-- anon / authenticated からの全操作をDENY（ポリシー未定義 = 暗黙DENY）
-- service_role はRLSをバイパスするため明示的なALLOWポリシーは不要
ALTER TABLE collected_topics ENABLE ROW LEVEL SECURITY;

-- 2. 速報+速報ボット初期レコード（curation_newsplus プロファイル）
-- WHERE NOT EXISTS で冪等に実行可能（再実行してもエラーにならない）
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
    '速報+速報ボット',
    '5chニュース速報+のバズスレッドをキュレーションして転載する運営ボット。',
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
    'curation_newsplus',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_newsplus'
);
