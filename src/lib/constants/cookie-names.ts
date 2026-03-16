/**
 * Cookie名定数
 *
 * プロジェクト全体で使用するCookie名を一元定義する。
 * 名称の不一致（edge_token vs edge-token など）による認証フローの破綻を防ぐ。
 *
 * See: features/authentication.feature
 * See: features/constraints/specialist_browser_compat.feature
 * See: docs/architecture/components/authentication.md §5 Cookie命名規則
 */

/**
 * 一般ユーザー認証トークンのCookie名。
 * ハイフン区切りで統一する。
 * 使用箇所: Route Handlers (api/threads, api/mypage等) / 専ブラRoute (bbs.cgi) / BbsCgiParser
 */
export const EDGE_TOKEN_COOKIE = 'edge-token'

/**
 * 管理者セッションのCookie名。
 * 使用箇所: api/admin/* Route Handlers
 */
export const ADMIN_SESSION_COOKIE = 'admin_session'
