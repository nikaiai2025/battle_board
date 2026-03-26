-- 00032_copipe_entries.sql
-- !copipe コマンド用のコピペ(AA)エントリテーブルを作成する
--
-- See: features/command_copipe.feature
-- See: tmp/orchestrator/memo_copipe_command.md §1. データストレージ: DB

CREATE TABLE copipe_entries (
  -- 連番の主キー（seed スクリプトが upsert で管理するため SERIAL を使用）
  id SERIAL PRIMARY KEY,
  -- コピペの名称（一意制約: 同名エントリの重複登録を防ぐ）
  name TEXT UNIQUE NOT NULL,
  -- AA本文（あらゆる特殊文字を含むためTEXTカラムに格納。エスケープ不要）
  content TEXT NOT NULL,
  -- 作成日時
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 名前での検索（完全一致・部分一致）に使用するインデックス
-- !copipe <名前> の検索でフルスキャンを回避する
CREATE INDEX idx_copipe_entries_name ON copipe_entries (name);

COMMENT ON TABLE copipe_entries IS
  'コピペ(AA)エントリ。!copipe コマンドで参照する。See: features/command_copipe.feature';
COMMENT ON COLUMN copipe_entries.name IS 'コピペの名称（一意）';
COMMENT ON COLUMN copipe_entries.content IS 'AA本文（特殊文字を含むためTEXTで格納）';
