-- =============================================================================
-- 00001_create_tables.sql
-- 全テーブルの CREATE TABLE 定義
-- 参照ドキュメント: docs/architecture/architecture.md §4.2, §7.2
--
-- テーブル作成順序（外部キー参照の依存関係に従う）:
--   1. users        — 依存なし
--   2. threads      — users に依存
--   3. posts        — threads, users に依存
--   4. currencies   — users に依存
--   5. bots         — users に依存
--   6. bot_posts    — posts, bots に依存
--   7. accusations  — users, posts, threads に依存
--   8. incentive_logs — users に依存
--   9. auth_codes   — 依存なし
--  10. admin_users  — 依存なし
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users テーブル
-- 一般ユーザーの認証情報と属性を管理する。
-- auth_token は現在有効な edge-token。author_id_seed は日次リセットID生成に使用 (§5.2)。
-- Supabase Auth は管理者のみに使用し、一般ユーザーは edge-token 方式で認証する (§5.1)。
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_token      VARCHAR      NOT NULL,
    author_id_seed  VARCHAR      NOT NULL,
    is_premium      BOOLEAN      NOT NULL DEFAULT false,
    username        VARCHAR(20),
    streak_days     INTEGER      NOT NULL DEFAULT 0,
    last_post_date  DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- threads テーブル
-- スレッドの基本情報を管理する。thread_key は専ブラ互換用の10桁UNIXタイムスタンプ。
-- dat_byte_size はShift_JIS換算累積バイト数（Range差分応答用キャッシュ: §11.3）。
-- post_count は posts の実数と同期するキャッシュ値。
-- -----------------------------------------------------------------------------
CREATE TABLE threads (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_key     VARCHAR      NOT NULL,
    board_id       VARCHAR      NOT NULL,
    title          VARCHAR(96)  NOT NULL,
    post_count     INTEGER      NOT NULL DEFAULT 0,
    dat_byte_size  INTEGER      NOT NULL DEFAULT 0,
    created_by     UUID         NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_post_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_deleted     BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT threads_thread_key_unique UNIQUE (thread_key)
);

-- -----------------------------------------------------------------------------
-- posts テーブル
-- 書き込みレコード。人間・ボット・システムメッセージを統合管理する。
-- author_id は人間の書き込み時のみ設定。ボットは NULL + bot_posts に記録される。
-- システムメッセージは author_id = NULL かつ is_system_message = true。
-- (thread_id, post_number) UNIQUE制約でレス番号の排他制御を実現する (§7.2)。
-- -----------------------------------------------------------------------------
CREATE TABLE posts (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id         UUID         NOT NULL REFERENCES threads(id),
    post_number       INTEGER      NOT NULL,
    author_id         UUID         REFERENCES users(id),
    display_name      VARCHAR      NOT NULL,
    daily_id          VARCHAR(8)   NOT NULL,
    body              TEXT         NOT NULL,
    is_system_message BOOLEAN      NOT NULL DEFAULT false,
    is_deleted        BOOLEAN      NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- レス番号の排他制御: SERIALIZABLEトランザクションと組み合わせて一意性を保証 (§7.2)
    CONSTRAINT posts_thread_id_post_number_unique UNIQUE (thread_id, post_number)
);

-- -----------------------------------------------------------------------------
-- currencies テーブル
-- ユーザーごとの通貨残高を管理する (1:1)。
-- balance には CHECK制約でマイナス残高を禁止する。
-- 二重消費防止は楽観的ロック (WHERE balance >= :cost) で実装する (§7.2, TDR-003)。
-- -----------------------------------------------------------------------------
CREATE TABLE currencies (
    user_id     UUID         PRIMARY KEY REFERENCES users(id),
    balance     INTEGER      NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- bots テーブル
-- 運営ボットの内部管理情報。HP・ペルソナ・偽装ID・戦績等を保持する。
-- RLSで anon/authenticated は全操作を拒否し、service_role のみアクセス可能 (§10.1.1)。
-- eliminated_by は撃破した人間ユーザーの user_id。
-- -----------------------------------------------------------------------------
CREATE TABLE bots (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR      NOT NULL,
    persona        TEXT         NOT NULL,
    hp             INTEGER      NOT NULL,
    max_hp         INTEGER      NOT NULL,
    daily_id       VARCHAR(8)   NOT NULL,
    daily_id_date  DATE         NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    is_revealed    BOOLEAN      NOT NULL DEFAULT false,
    revealed_at    TIMESTAMPTZ,
    survival_days  INTEGER      NOT NULL DEFAULT 0,
    total_posts    INTEGER      NOT NULL DEFAULT 0,
    accused_count  INTEGER      NOT NULL DEFAULT 0,
    eliminated_at  TIMESTAMPTZ,
    eliminated_by  UUID         REFERENCES users(id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- bot_posts テーブル
-- ボットの書き込みと bots テーブルを紐付ける。
-- このテーブルの存在がゲームの根幹「AIか人間か分からない」を保護する。
-- RLSで anon/authenticated は全操作を拒否し、service_role のみアクセス可能 (§10.1.1)。
-- !tell 判定: SELECT bot_id FROM bot_posts WHERE post_id = :targetPostId (§4.2)
-- -----------------------------------------------------------------------------
CREATE TABLE bot_posts (
    post_id  UUID  PRIMARY KEY REFERENCES posts(id),
    bot_id   UUID  NOT NULL REFERENCES bots(id)
);

-- -----------------------------------------------------------------------------
-- accusations テーブル
-- AI告発 (!tell コマンド) の結果を記録する。
-- (accuser_id, target_post_id) UNIQUE制約で重複告発を防止する (§4.2, §11.2)。
-- result は 'hit' (ボット的中) / 'miss' (人間への冤罪) の2値。
-- -----------------------------------------------------------------------------
CREATE TABLE accusations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    accuser_id      UUID         NOT NULL REFERENCES users(id),
    target_post_id  UUID         NOT NULL REFERENCES posts(id),
    thread_id       UUID         NOT NULL REFERENCES threads(id),
    result          VARCHAR      NOT NULL,
    bonus_amount    INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 重複告発防止: 同一ユーザーが同一投稿を複数回告発することを禁止 (§4.2)
    CONSTRAINT accusations_accuser_target_unique UNIQUE (accuser_id, target_post_id)
);

-- -----------------------------------------------------------------------------
-- incentive_logs テーブル
-- ボーナスイベントの付与履歴を記録する。
-- event_type の値: daily_login / thread_growth / reply / hot_post /
--                  new_thread_join / thread_revival / streak / milestone_post
-- (user_id, event_type, context_date) UNIQUE制約で日次重複付与を防止する (§7.2)。
-- ON CONFLICT DO NOTHING による冪等性担保が可能 (§7.2)。
-- -----------------------------------------------------------------------------
CREATE TABLE incentive_logs (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL REFERENCES users(id),
    event_type    VARCHAR      NOT NULL,
    amount        INTEGER      NOT NULL,
    context_id    UUID,
    context_date  DATE         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 日次ボーナス重複防止: 同一ユーザー・同一イベント・同一日の重複付与を禁止 (§4.2)
    CONSTRAINT incentive_logs_user_event_date_unique UNIQUE (user_id, event_type, context_date)
);

-- -----------------------------------------------------------------------------
-- auth_codes テーブル
-- 6桁の認証コードを管理する (§5.1)。
-- RLSで anon/authenticated は全操作を拒否し、service_role のみアクセス可能 (§10.1.1)。
-- 期限切れレコードは日次クリーンアップで削除する (§8)。
-- token_id は対応する edge-token の識別子。
-- -----------------------------------------------------------------------------
CREATE TABLE auth_codes (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(6)   NOT NULL,
    token_id    VARCHAR      NOT NULL,
    ip_hash     VARCHAR      NOT NULL,
    verified    BOOLEAN      NOT NULL DEFAULT false,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- admin_users テーブル
-- 管理者情報。Supabase Auth の uid と紐づく (§5.3)。
-- RLSで anon/authenticated は全操作を拒否し、service_role のみアクセス可能 (§10.1.1)。
-- id は Supabase Auth の uid を直接使用する（gen_random_uuid() を使わない）。
-- -----------------------------------------------------------------------------
CREATE TABLE admin_users (
    id          UUID         PRIMARY KEY,
    email       VARCHAR      NOT NULL,
    role        VARCHAR      NOT NULL DEFAULT 'admin',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
