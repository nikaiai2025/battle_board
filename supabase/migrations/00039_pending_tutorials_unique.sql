-- 同一ユーザーに対する重複pendingを防止する安全装置
-- アプリケーション層のバグがあっても、同一ユーザーの重複pendingはDB側で防止する
ALTER TABLE pending_tutorials
ADD CONSTRAINT unique_pending_per_user UNIQUE (user_id);
