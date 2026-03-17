-- =============================================================================
-- BAN システム マイグレーション
-- See: features/admin.feature @ユーザーBAN / IP BAN シナリオ群
-- See: tmp/feature_plan_admin_expansion.md §2 IP BAN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users テーブルへのカラム追加
-- See: tmp/feature_plan_admin_expansion.md §2-b DB変更
-- -----------------------------------------------------------------------------

-- ユーザーBAN フラグ
-- true のユーザーは書き込み不可
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

-- 最終アクセスIPハッシュ（IP BAN登録時の対象特定に使用）
-- 書き込みのたびに hashIp(reduceIp(現在のIP)) で更新される
-- author_id_seed は登録時固定のため別途必要
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip_hash VARCHAR;

-- -----------------------------------------------------------------------------
-- ip_bans テーブル（新規）
-- See: tmp/feature_plan_admin_expansion.md §2-b ip_bans テーブル
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ip_bans (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_hash     VARCHAR      NOT NULL,       -- hashIp(reduceIp(ip)) 済みの値（不可逆）
    reason      TEXT,                        -- BAN理由（管理者メモ）
    banned_by   UUID         NOT NULL REFERENCES admin_users(id),
    banned_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,                 -- NULL = 無期限
    is_active   BOOLEAN      NOT NULL DEFAULT true,

    CONSTRAINT ip_bans_ip_hash_unique UNIQUE (ip_hash)
);

-- -----------------------------------------------------------------------------
-- RLS: ip_bans は DENY ALL（service_role のみアクセス可能）
-- See: tmp/feature_plan_admin_expansion.md §2-b 設計判断
-- 生 IP（平文）は保存しない。SHA-512 ハッシュ値のみ保存（不可逆）
-- anon / authenticated からの全操作を拒否する
-- -----------------------------------------------------------------------------

ALTER TABLE ip_bans ENABLE ROW LEVEL SECURITY;
-- ポリシー未設定 = anon/authenticated からの全操作を拒否（service_role のみ通過）

-- -----------------------------------------------------------------------------
-- インデックス
-- See: tmp/feature_plan_admin_expansion.md §2-e isBanned 高速判定用
-- -----------------------------------------------------------------------------

-- ip_hash での検索（書き込み時の高速判定用）
CREATE INDEX IF NOT EXISTS ip_bans_ip_hash_idx ON ip_bans (ip_hash) WHERE is_active = true;

-- users.is_banned での検索（管理者一覧用）
CREATE INDEX IF NOT EXISTS users_is_banned_idx ON users (is_banned) WHERE is_banned = true;
