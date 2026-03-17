-- =============================================================================
-- posts テーブルに inline_system_info カラムを追加
-- コード（post-repository.ts）が使用する nullable TEXT カラム。
-- コマンド実行結果などのシステム情報をレス本文とは別に保持する。
-- =============================================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS inline_system_info TEXT;
