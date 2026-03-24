/**
 * 管理画面共通レイアウト — admin_session ガード付き
 *
 * See: features/admin.feature @管理者がログイン済みである
 * See: tmp/feature_plan_admin_expansion.md §6-b 管理画面レイアウト
 *
 * 責務:
 *   - サーバーサイドで admin_session Cookie を検証する
 *   - 未認証時は /admin/login へリダイレクトする
 *   - サイドナビゲーション（ダッシュボード / ユーザー / IP BAN）を表示する
 *
 * 設計方針:
 *   - Server Component として実装し、admin_session を Next.js cookies() API で読む
 *   - ナビゲーションは Server Component 内に直接記述する（軽量なため別コンポーネント化しない）
 *   - /admin/login は (admin-public) ルートグループに配置し、本レイアウトの認証ガードを回避する
 *     （無限リダイレクト防止。See: tmp/escalations/escalation_ESC-TASK-284-1.md 案A）
 *
 * See: docs/architecture/components/web-ui.md §3 コンポーネント境界
 */

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { verifyAdminSession } from "@/lib/services/auth-service";

// リクエストごとにSSRを実行する（管理者セッション検証のため）
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// ナビゲーションリンク定義
// ---------------------------------------------------------------------------

const NAV_LINKS = [
	{ href: "/admin", label: "ダッシュボード" },
	{ href: "/admin/users", label: "ユーザー" },
	{ href: "/admin/threads", label: "スレッド管理" },
	{ href: "/admin/ip-bans", label: "IP BAN" },
] as const;

// ---------------------------------------------------------------------------
// レイアウトコンポーネント（Server Component）
// ---------------------------------------------------------------------------

/**
 * 管理画面共通レイアウト（Server Component）
 *
 * /admin/login は (admin-public) ルートグループに配置されているため、
 * 本レイアウトの認証ガードは適用されない（無限リダイレクト防止）。
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 */
export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// ---------------------------------------------------------------------------
	// admin_session Cookie のサーバーサイド検証
	// See: src/lib/services/auth-service.ts > verifyAdminSession
	// ---------------------------------------------------------------------------
	const cookieStore = await cookies();
	const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

	if (!sessionToken) {
		redirect("/admin/login");
	}

	const admin = await verifyAdminSession(sessionToken);
	if (!admin) {
		redirect("/admin/login");
	}

	// ---------------------------------------------------------------------------
	// レイアウトレンダリング
	// See: tmp/feature_plan_admin_expansion.md §6-b 管理画面レイアウト図
	// ---------------------------------------------------------------------------
	return (
		<div className="min-h-screen bg-background">
			{/* ヘッダー */}
			<header className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
				<h1 className="text-base font-bold">ボットちゃんねる 管理</h1>
				<span className="text-xs text-gray-300">管理者パネル</span>
			</header>

			<div className="flex">
				{/* サイドナビゲーション */}
				<nav
					id="admin-nav"
					className="w-40 min-h-screen bg-gray-700 text-white py-4"
				>
					<ul className="space-y-1">
						{NAV_LINKS.map(({ href, label }) => (
							<li key={href}>
								<Link
									href={href}
									className="block px-4 py-2 text-sm hover:bg-gray-600 transition-colors"
								>
									{label}
								</Link>
							</li>
						))}
					</ul>
				</nav>

				{/* コンテンツ領域 */}
				<main className="flex-1 p-6">{children}</main>
			</div>
		</div>
	);
}
