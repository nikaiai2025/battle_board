-- =============================================================================
-- 00003_rls_policies.sql
-- Row Level Security (RLS) ポリシー定義
-- 参照ドキュメント: docs/architecture/architecture.md §10.1.1
--
-- 設計方針:
--   - ゲームの根幹「AIか人間か分からない」を保護するため、ボット関連テーブルは厳格に保護する
--   - Supabase の anon key はクライアント JS に露出するため、RLS が唯一の防壁となる
--   - service_role は RLS をバイパスするが、API レイヤ（サーバーサイド）からのみ使用する
-- =============================================================================

-- =============================================================================
-- RLS を有効化
-- =============================================================================

ALTER TABLE threads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE accusations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users    ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- bot_posts — DENY ALL (anon / authenticated)
-- ボットの正体記録。漏洩するとゲーム崩壊。service_role のみアクセス可能 (§10.1.1)
-- =============================================================================

-- ポリシーを設定しないことで暗黙的に全アクセスを拒否する（RLS有効化 + ポリシー未設定 = 全拒否）
-- 明示的にコメントで意図を記載する
-- bot_posts: anon / authenticated からの全操作を拒否 (ポリシー未設定 = 全拒否)

-- =============================================================================
-- bots — DENY ALL (anon / authenticated)
-- ボットの内部管理情報（HP・ペルソナ等）。service_role のみアクセス可能 (§10.1.1)
-- =============================================================================

-- bots: anon / authenticated からの全操作を拒否 (ポリシー未設定 = 全拒否)

-- =============================================================================
-- auth_codes — DENY ALL (anon / authenticated)
-- 認証コードの漏洩防止。service_role のみアクセス可能 (§10.1.1)
-- =============================================================================

-- auth_codes: anon / authenticated からの全操作を拒否 (ポリシー未設定 = 全拒否)

-- =============================================================================
-- admin_users — DENY ALL (anon / authenticated)
-- 管理者情報の保護。service_role のみアクセス可能 (§10.1.1)
-- =============================================================================

-- admin_users: anon / authenticated からの全操作を拒否 (ポリシー未設定 = 全拒否)

-- =============================================================================
-- threads — SELECT: is_deleted = false のレコードのみ (§10.1.1)
-- 削除済みスレッドは非表示。INSERT/UPDATE/DELETE は service_role 経由のみ。
-- =============================================================================

-- 非削除スレッドの閲覧を anon / authenticated に許可する
CREATE POLICY threads_select_not_deleted
    ON threads
    FOR SELECT
    TO anon, authenticated
    USING (is_deleted = false);

-- =============================================================================
-- posts — SELECT: 所属スレッドが非削除の場合のみ (§10.1.1)
-- 削除済みスレッドに属するレスは非表示。閲覧は全員可能。
-- INSERT/UPDATE/DELETE は service_role 経由のみ。
-- =============================================================================

-- 所属スレッドが非削除のレスを anon / authenticated に閲覧許可する
CREATE POLICY posts_select_thread_not_deleted
    ON posts
    FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM threads
            WHERE threads.id = posts.thread_id
              AND threads.is_deleted = false
        )
    );

-- =============================================================================
-- users — SELECT: 自分のレコードのみ (§10.1.1)
-- 他ユーザーの情報は非公開。INSERT/UPDATE は service_role 経由のみ。
-- =============================================================================

-- auth.uid() を使用して自分のレコードのみ閲覧許可する
-- 注: 一般ユーザーは Supabase Auth を使用しないため、この SELECT ポリシーは
--     主にサーバーサイドの authenticated セッション経由でのアクセスを想定する
CREATE POLICY users_select_own
    ON users
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- =============================================================================
-- currencies — SELECT: 自分のレコードのみ (§10.1.1)
-- 自分の残高のみ参照可能。UPDATE は service_role 経由のみ（楽観的ロック）。
-- =============================================================================

-- 自分の通貨残高のみ閲覧許可する
CREATE POLICY currencies_select_own
    ON currencies
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- =============================================================================
-- incentive_logs — SELECT: 自分のレコードのみ (§10.1.1)
-- 自分のボーナス履歴のみ参照可能。INSERT は service_role 経由のみ。
-- =============================================================================

-- 自分のインセンティブ履歴のみ閲覧許可する
CREATE POLICY incentive_logs_select_own
    ON incentive_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- =============================================================================
-- accusations — SELECT: スレッド内の告発結果を全公開 (§10.1.1)
-- 告発結果は全員が閲覧可能（ゲームの透明性確保）。
-- INSERT は service_role 経由のみ（AccusationService 経由で処理する）。
-- =============================================================================

-- 告発結果を anon / authenticated に全公開する
CREATE POLICY accusations_select_all
    ON accusations
    FOR SELECT
    TO anon, authenticated
    USING (true);
