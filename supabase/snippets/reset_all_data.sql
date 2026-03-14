-- =============================================================================
-- reset_all_data.sql
-- 全テーブルのデータを削除する運用スクリプト（テーブル構造・RLS・関数は保持）
--
-- 用途:
--   - リリース前のテストデータ全削除
--   - E2Eテスト前の本番DB初期化
--
-- 実行方法:
--   Supabase ダッシュボード > SQL Editor にペーストして実行
--
-- 冪等性: 何度実行しても同じ結果（空テーブル）になる
-- 安全性: DDL（DROP/ALTER）を含まない。データ削除のみ
--
-- 参照: supabase/migrations/00001_create_tables.sql（テーブル定義・外部キー依存順）
-- =============================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- TRUNCATE: 外部キー制約を CASCADE で一括解決
--
-- 削除順序の考慮が不要な TRUNCATE ... CASCADE を使用する。
-- RESTART IDENTITY により、SERIAL/SEQUENCE がある場合はリセットされる。
-- -------------------------------------------------------------------------
TRUNCATE TABLE
    bot_posts,
    accusations,
    incentive_logs,
    posts,
    currencies,
    bots,
    threads,
    auth_codes,
    admin_users,
    users
RESTART IDENTITY CASCADE;

-- -------------------------------------------------------------------------
-- 検証: 全テーブルが空であることを確認
-- -------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
    cnt BIGINT;
    tables TEXT[] := ARRAY[
        'users', 'threads', 'posts', 'currencies',
        'bots', 'bot_posts', 'accusations',
        'incentive_logs', 'auth_codes', 'admin_users'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('SELECT count(*) FROM %I', tbl) INTO cnt;
        IF cnt <> 0 THEN
            RAISE EXCEPTION 'Table % still has % rows after TRUNCATE', tbl, cnt;
        END IF;
    END LOOP;
    RAISE NOTICE 'OK: All 10 tables are empty.';
END $$;

COMMIT;
