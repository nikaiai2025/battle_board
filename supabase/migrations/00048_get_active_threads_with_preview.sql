-- =============================================================================
-- 00048_get_active_threads_with_preview.sql
-- アクティブスレッド一覧と各スレッドの最新レスプレビューを1回のRPCで取得する
--
-- 目的:
--   - Webトップページの「スレ内容の一部（最新5レス）」表示で N+1 クエリを回避する
--   - スレ一覧の確定とプレビュー対象レスの抽出を単一SQL内で行い、
--     画面表示対象とDB取得対象のスナップショット不整合を防ぐ
--
-- 設計:
--   1. active_threads CTE で表示対象の非休眠スレッドを last_post_at DESC で確定
--   2. ranked_posts CTE で対象スレッドのレスに thread単位の ROW_NUMBER を付与
--   3. 各スレッドごとに最新 N 件を jsonb_agg で返す
-- =============================================================================

CREATE OR REPLACE FUNCTION get_active_threads_with_preview(
    p_board_id VARCHAR,
    p_thread_limit INTEGER DEFAULT 50,
    p_preview_count INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    thread_key VARCHAR,
    board_id VARCHAR,
    title VARCHAR,
    post_count INTEGER,
    dat_byte_size INTEGER,
    created_by UUID,
    created_at TIMESTAMPTZ,
    last_post_at TIMESTAMPTZ,
    is_deleted BOOLEAN,
    is_pinned BOOLEAN,
    is_dormant BOOLEAN,
    preview_posts JSONB
)
LANGUAGE sql
SET search_path = 'public'
AS $$
    WITH active_threads AS (
        SELECT t.*
        FROM threads AS t
        WHERE t.board_id = p_board_id
          AND t.is_deleted = false
          AND t.is_dormant = false
        ORDER BY t.last_post_at DESC
        LIMIT p_thread_limit
    ),
    ranked_posts AS (
        SELECT
            p.thread_id,
            p.post_number,
            p.display_name,
            p.body,
            p.created_at,
            p.is_deleted,
            p.is_system_message,
            ROW_NUMBER() OVER (
                PARTITION BY p.thread_id
                ORDER BY p.post_number DESC
            ) AS preview_rank
        FROM posts AS p
        INNER JOIN active_threads AS t
            ON t.id = p.thread_id
    )
    SELECT
        t.id,
        t.thread_key,
        t.board_id,
        t.title,
        t.post_count,
        t.dat_byte_size,
        t.created_by,
        t.created_at,
        t.last_post_at,
        t.is_deleted,
        t.is_pinned,
        t.is_dormant,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'post_number', rp.post_number,
                    'display_name', rp.display_name,
                    'body', rp.body,
                    'created_at', rp.created_at,
                    'is_deleted', rp.is_deleted,
                    'is_system_message', rp.is_system_message
                )
                ORDER BY rp.post_number ASC
            ) FILTER (WHERE rp.post_number IS NOT NULL),
            '[]'::JSONB
        ) AS preview_posts
    FROM active_threads AS t
    LEFT JOIN ranked_posts AS rp
        ON rp.thread_id = t.id
       AND rp.preview_rank <= p_preview_count
    GROUP BY
        t.id,
        t.thread_key,
        t.board_id,
        t.title,
        t.post_count,
        t.dat_byte_size,
        t.created_by,
        t.created_at,
        t.last_post_at,
        t.is_deleted,
        t.is_pinned,
        t.is_dormant
    ORDER BY t.last_post_at DESC;
$$;
