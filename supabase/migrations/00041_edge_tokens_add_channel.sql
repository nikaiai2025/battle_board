-- Sprint-150: edge-token チャネル分離
-- 専ブラ経由トークンの権限を投稿のみに限定するための channel カラム追加
-- 既存レコードは全て 'web'（全権限）で初期化
ALTER TABLE edge_tokens ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'web';
