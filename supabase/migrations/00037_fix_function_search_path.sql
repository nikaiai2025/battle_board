-- =============================================================================
-- 00037_fix_function_search_path.sql
-- 全 RPC 関数に SET search_path = 'public' を追加する
--
-- Supabase Security Advisor の "Function Search Path Mutable" 警告を解消する。
-- search_path が未設定の関数は、呼び出し時のスキーマ検索パスに依存するため、
-- 意図しないスキーマのテーブルを参照するリスクがある。
-- 特に SECURITY DEFINER の関数では権限昇格の理論的リスクがある。
--
-- 変更内容: 各関数に SET search_path = 'public' を1行追加するのみ。
-- 関数の本体（ロジック）は一切変更しない。
--
-- See: docs/operations/runbooks/supabase-security-advisor.md
-- =============================================================================

-- 1. increment_thread_post_count (from 00004)
CREATE OR REPLACE FUNCTION increment_thread_post_count(p_thread_id UUID)
RETURNS void
LANGUAGE sql
SET search_path = 'public'
AS $$
  UPDATE threads
  SET post_count = post_count + 1
  WHERE id = p_thread_id;
$$;

-- 2. credit_currency (from 00004)
CREATE OR REPLACE FUNCTION credit_currency(p_user_id UUID, p_amount INTEGER)
RETURNS void
LANGUAGE sql
SET search_path = 'public'
AS $$
  UPDATE currencies
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
$$;

-- 3. deduct_currency (from 00004)
CREATE OR REPLACE FUNCTION deduct_currency(p_user_id UUID, p_amount INTEGER)
RETURNS TABLE(affected_rows INTEGER, new_balance INTEGER)
LANGUAGE sql
SET search_path = 'public'
AS $$
  WITH updated AS (
    UPDATE currencies
    SET balance = balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
      AND balance >= p_amount
    RETURNING balance
  )
  SELECT
    COUNT(*)::INTEGER AS affected_rows,
    COALESCE((SELECT balance FROM updated), -1) AS new_balance
  FROM updated;
$$;

-- 4. increment_bot_column (from 00014)
CREATE OR REPLACE FUNCTION increment_bot_column(
  p_bot_id UUID,
  p_column  TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_result INTEGER;
BEGIN
  IF p_column NOT IN ('total_posts', 'accused_count', 'survival_days', 'times_attacked') THEN
    RAISE EXCEPTION 'increment_bot_column: invalid column name: %', p_column;
  END IF;

  EXECUTE format(
    'UPDATE bots SET %I = %I + 1 WHERE id = $1 RETURNING %I',
    p_column, p_column, p_column
  )
  INTO v_result
  USING p_bot_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'increment_bot_column: bot not found: %', p_bot_id;
  END IF;

  RETURN v_result;
END;
$$;

-- 5. insert_post_with_next_number (from 00031)
CREATE OR REPLACE FUNCTION insert_post_with_next_number(
    p_thread_id UUID,
    p_author_id UUID,
    p_display_name VARCHAR,
    p_daily_id VARCHAR,
    p_body TEXT,
    p_inline_system_info TEXT,
    p_is_system_message BOOLEAN
) RETURNS posts
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
    v_next_number INTEGER;
    v_result posts%ROWTYPE;
BEGIN
    PERFORM 1 FROM threads WHERE id = p_thread_id FOR UPDATE;

    SELECT COALESCE(MAX(post_number), 0) + 1 INTO v_next_number
    FROM posts WHERE thread_id = p_thread_id;

    INSERT INTO posts (thread_id, post_number, author_id, display_name, daily_id, body, inline_system_info, is_system_message)
    VALUES (p_thread_id, v_next_number, p_author_id, p_display_name, p_daily_id, p_body, p_inline_system_info, p_is_system_message)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- 6. bulk_update_daily_ids (from 00035, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$;

-- 7. bulk_increment_survival_days (from 00035, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION bulk_increment_survival_days()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE bots
  SET survival_days = survival_days + 1
  WHERE is_active = true;
END;
$$;
