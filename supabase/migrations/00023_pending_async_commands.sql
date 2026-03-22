-- Migration: 00023_pending_async_commands
-- 非同期コマンド副作用のキューイングテーブル。
-- コマンド種別ごとにテーブルを作らず、command_type で区別する汎用設計。
--
-- See: docs/architecture/components/command.md SS5 非同期副作用のキューイングパターン
-- See: features/command_aori.feature
-- See: features/command_newspaper.feature

CREATE TABLE pending_async_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type TEXT NOT NULL,
  thread_id UUID NOT NULL REFERENCES threads(id),
  target_post_number INTEGER NOT NULL,
  invoker_user_id UUID NOT NULL REFERENCES users(id),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_async_commands ENABLE ROW LEVEL SECURITY;

-- service_role（サーバーサイド）のみ全操作を許可する
CREATE POLICY "service_role_all" ON pending_async_commands
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 匿名ユーザーからのアクセスを禁止する
CREATE POLICY "deny_anon" ON pending_async_commands
  FOR ALL TO anon USING (false);

-- 認証済みユーザーからのアクセスを禁止する（サービス層経由のみ許可）
CREATE POLICY "deny_authenticated" ON pending_async_commands
  FOR ALL TO authenticated USING (false);

-- Cron 処理で command_type ごとに古い順から取得するためのインデックス
CREATE INDEX idx_pending_async_commands_type_created
  ON pending_async_commands(command_type, created_at);
