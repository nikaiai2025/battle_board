-- Migration: 00021_welcome_sequence
-- ウェルカムシーケンス実装のための pending_tutorials テーブルを作成する。
-- チュートリアルBOTのスポーン待ちキューとして使用する。
--
-- See: features/welcome.feature
-- See: tmp/workers/bdd-architect_TASK-236/design.md §3.1 DB設計: pending_tutorials テーブル

CREATE TABLE pending_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  thread_id UUID NOT NULL REFERENCES threads(id),
  trigger_post_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_tutorials ENABLE ROW LEVEL SECURITY;

-- service_role（サーバーサイド）のみ全操作を許可する
CREATE POLICY "service_role_all" ON pending_tutorials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 匿名ユーザーからのアクセスを禁止する
CREATE POLICY "deny_anon" ON pending_tutorials
  FOR ALL TO anon USING (false);

-- 認証済みユーザーからのアクセスを禁止する（サービス層経由のみ許可）
CREATE POLICY "deny_authenticated" ON pending_tutorials
  FOR ALL TO authenticated USING (false);

-- Cloudflare Cron のスポーン処理で古いものから順に取得するためのインデックス
CREATE INDEX idx_pending_tutorials_created_at ON pending_tutorials(created_at);
