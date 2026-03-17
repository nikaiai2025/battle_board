-- Migration: 00011_daily_stats
-- daily_stats テーブル（日次統計スナップショット）の作成
--
-- See: tmp/feature_plan_admin_expansion.md §5-a DB: daily_stats テーブル
-- See: features/admin.feature @管理者が統計情報の日次推移を確認できる

-- ---------------------------------------------------------------------------
-- daily_stats テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_stats (
    stat_date               DATE         PRIMARY KEY,
    total_users             INTEGER      NOT NULL DEFAULT 0,  -- 全ユーザー数（仮+本登録）
    new_users               INTEGER      NOT NULL DEFAULT 0,  -- 当日の新規登録ユーザー数
    active_users            INTEGER      NOT NULL DEFAULT 0,  -- 当日書き込みしたユーザー数
    total_posts             INTEGER      NOT NULL DEFAULT 0,  -- 当日の書き込み数（非システムメッセージ）
    total_threads           INTEGER      NOT NULL DEFAULT 0,  -- 当日の新規スレッド数
    active_threads          INTEGER      NOT NULL DEFAULT 0,  -- 当日書き込みがあったスレッド数
    currency_in_circulation INTEGER      NOT NULL DEFAULT 0,  -- 全ユーザーの残高合計
    currency_granted        INTEGER      NOT NULL DEFAULT 0,  -- 当日の通貨付与総額
    currency_consumed       INTEGER      NOT NULL DEFAULT 0,  -- 当日の通貨消費総額
    total_accusations       INTEGER      NOT NULL DEFAULT 0,  -- 当日の告発件数
    total_attacks           INTEGER      NOT NULL DEFAULT 0,  -- 当日の攻撃件数
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS: DENY ALL（service_role のみアクセス可能）
-- admin_users, auth_codes, ip_bans と同じパターン
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
-- ポリシー未設定 = anon/authenticated からの全操作を拒否

COMMENT ON TABLE daily_stats IS '日次統計スナップショット。日次バッチで集計結果を保存する。時系列推移表示に使用する。';
COMMENT ON COLUMN daily_stats.stat_date IS '統計対象日付（PRIMARY KEY）';
COMMENT ON COLUMN daily_stats.total_users IS '全ユーザー数（仮+本登録の合計）';
COMMENT ON COLUMN daily_stats.new_users IS '当日の新規登録ユーザー数';
COMMENT ON COLUMN daily_stats.active_users IS '当日1件以上書き込みしたユーザー数';
COMMENT ON COLUMN daily_stats.total_posts IS '当日の書き込み数（is_system_message=false のみ）';
COMMENT ON COLUMN daily_stats.total_threads IS '当日の新規スレッド数';
COMMENT ON COLUMN daily_stats.active_threads IS '当日書き込みがあったスレッド数（DISTINCT thread_id）';
COMMENT ON COLUMN daily_stats.currency_in_circulation IS '全ユーザーの残高合計（currencies.balance の SUM）';
COMMENT ON COLUMN daily_stats.currency_granted IS '当日の通貨付与総額（admin_grant + ボーナス）';
COMMENT ON COLUMN daily_stats.currency_consumed IS '当日の通貨消費総額（コマンド実行等）';
COMMENT ON COLUMN daily_stats.total_accusations IS '当日の告発件数';
COMMENT ON COLUMN daily_stats.total_attacks IS '当日の攻撃件数';
