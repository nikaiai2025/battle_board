-- Sprint-149: BOTによるスレッド作成を可能にするため created_by を NULLABLE 化
-- BOT書き込み時は posts.author_id と同様に NULL を設定する
-- FK制約は維持（非NULL値は users(id) を参照する）
ALTER TABLE threads ALTER COLUMN created_by DROP NOT NULL;
