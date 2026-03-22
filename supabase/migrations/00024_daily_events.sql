-- 00024_daily_events.sql
-- daily_events テーブル: 1日1回制限のイベント管理（ラストボットボーナス等）
--
-- See: features/command_livingbot.feature
-- See: tmp/workers/bdd-architect_277/livingbot_design.md §3.2

CREATE TABLE daily_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,        -- 'last_bot_bonus' 等
  event_date DATE NOT NULL,        -- JST日付（YYYY-MM-DD）
  triggered_by UUID NOT NULL,      -- 発火者のuser_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 当日の重複チェック用ユニーク制約
CREATE UNIQUE INDEX idx_daily_events_type_date
  ON daily_events (event_type, event_date);
