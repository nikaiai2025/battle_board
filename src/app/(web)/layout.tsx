/**
 * Web UI 共通レイアウト — (web) ルートグループのレイアウト
 *
 * BattleBoard の Web UI 全ページに共通するレイアウトを定義。
 * - Header コンポーネントを全ページに表示
 * - edge-token Cookie の存在を Server Component から読み取り、
 *   isAuthenticated を動的に設定する（DB呼び出しなし・Cookie存在チェックのみ）
 *
 * NOTE: Cookie 存在チェックは認証の簡易判定であり、トークンの有効性検証は
 *       API 境界（Route Handler）で行う。
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: features/authentication.feature
 * See: docs/architecture/components/web-ui.md §3.1 スレッド一覧ページ
 */

import { cookies } from "next/headers";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import { resolveFont, resolveTheme } from "@/lib/domain/rules/theme-rules";
import Header from "./_components/Header";

interface WebLayoutProps {
	children: React.ReactNode;
}

/**
 * Web UI 共通レイアウト（Server Component）
 *
 * リクエストごとに実行され（dynamic rendering）、Cookie を読み取る。
 * edge-token Cookie が存在する場合は isAuthenticated=true を Header に渡し、
 * マイページへのリンクを表示する。
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: docs/architecture/components/web-ui.md §3 コンポーネント境界
 */
export default async function WebLayout({ children }: WebLayoutProps) {
	// edge-token Cookie の存在をチェックして認証状態を判定する。
	// DB呼び出しは行わない（トークン有効性の検証は API 境界で実施）。
	const cookieStore = await cookies();
	const isAuthenticated = cookieStore.has(EDGE_TOKEN_COOKIE);

	// テーマ/フォントをCookieから取得し解決する
	// 未設定や不正値はデフォルトにフォールバック
	// NOTE: isPremium の判定はCookieからはできないため、ここでは
	//       有料テーマのCSSクラスも素通りさせる（isPremium=true として解決）。
	//       有料→無料のダウングレード時は GET /api/mypage が解決済みIDを返し、
	//       フロントが Cookie を更新するフローで整合性を保つ。
	// See: features/theme.feature
	// See: tmp/workers/bdd-architect_283/theme_design.md §6
	const themeId = cookieStore.get("bb-theme")?.value ?? null;
	const fontId = cookieStore.get("bb-font")?.value ?? null;
	const theme = resolveTheme(themeId, true);
	const font = resolveFont(fontId, true);

	return (
		<div
			className={`min-h-screen ${theme.cssClass}`}
			style={{ fontFamily: font.cssFontFamily }}
		>
			{/* ヘッダー: 全 Web ページに表示
          isAuthenticated は edge-token Cookie の存在で判定（動的）。
          See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
      */}
			<Header isAuthenticated={isAuthenticated} />

			{/* ページコンテンツ */}
			{children}
		</div>
	);
}
