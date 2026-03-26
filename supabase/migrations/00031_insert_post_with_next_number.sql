-- =============================================================================
-- insert_post_with_next_number RPC: レス番号採番 + INSERT を原子的に実行する
--
-- TOCTOU競合の修正: 従来の getNextPostNumber (SELECT MAX+1) は採番から INSERT
-- までの間に複数のDB呼び出しが挟まり、同時書き込み時に UNIQUE 制約違反が発生していた。
-- threads テーブルの行ロック (FOR UPDATE) で同一スレッドへの同時採番を直列化する。
--
-- See: docs/architecture/architecture.md 7.2 同時実行制御（レス番号採番）
-- See: tmp/workers/bdd-architect_ATK-POST-001/assessment.md
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_post_with_next_number(
    p_thread_id UUID,
    p_author_id UUID,
    p_display_name VARCHAR,
    p_daily_id VARCHAR,
    p_body TEXT,
    p_inline_system_info TEXT,
    p_is_system_message BOOLEAN
) RETURNS posts AS $$
DECLARE
    v_next_number INTEGER;
    v_result posts%ROWTYPE;
BEGIN
    -- 行ロック: threads テーブルの対象行を FOR UPDATE でロックする。
    -- 同一スレッドへの同時書き込みはここで直列化される。
    -- スレッドにレスがない場合でも threads テーブルのロックで保護できる。
    PERFORM 1 FROM threads WHERE id = p_thread_id FOR UPDATE;

    -- 次のレス番号を計算: MAX(post_number) + 1。レスが存在しない場合は 1。
    SELECT COALESCE(MAX(post_number), 0) + 1 INTO v_next_number
    FROM posts WHERE thread_id = p_thread_id;

    -- レス INSERT: id / is_deleted / created_at は DB デフォルト値を使用する。
    INSERT INTO posts (thread_id, post_number, author_id, display_name, daily_id, body, inline_system_info, is_system_message)
    VALUES (p_thread_id, v_next_number, p_author_id, p_display_name, p_daily_id, p_body, p_inline_system_info, p_is_system_message)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
