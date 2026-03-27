/**
 * Cookie名定数
 *
 * プロジェクト全体で使用するCookie名を一元定義する。
 * 名称の不一致（edge_token vs edge-token など）による認証フローの破綻を防ぐ。
 *
 * See: features/authentication.feature
 * See: features/specialist_browser_compat.feature
 * See: docs/architecture/components/authentication.md §5 Cookie命名規則
 */

/**
 * 一般ユーザー認証トークンのCookie名。
 * ハイフン区切りで統一する。
 * 使用箇所: Route Handlers (api/threads, api/mypage等) / 専ブラRoute (bbs.cgi) / BbsCgiParser
 */
export const EDGE_TOKEN_COOKIE = "edge-token";

/**
 * 管理者セッションのCookie名。
 * 使用箇所: api/admin/* Route Handlers
 */
export const ADMIN_SESSION_COOKIE = "admin_session";

/**
 * テーマID Cookie。SSRでのテーマクラス付与に使用。
 * See: features/theme.feature
 */
export const THEME_COOKIE = "bb-theme";

/**
 * フォントID Cookie。SSRでのフォント適用に使用。
 * See: features/theme.feature
 */
export const FONT_COOKIE = "bb-font";

/**
 * Discord OAuth PKCE ストレージ Cookie。
 * OAuth フロー開始時に code_verifier を保存し、コールバック時に読み取る。
 * HttpOnly; 10分間有効。
 * See: src/lib/infrastructure/supabase/client.ts createPkceOAuthClient()
 */
export const PKCE_STATE_COOKIE = "bb-pkce-state";
