/**
 * Header — ヘッダーナビゲーションコンポーネント
 *
 * BattleBoard のサイト全体で共用するヘッダー。
 * - サイトタイトル「BattleBoard」表示
 * - 認証済みの場合のみ「マイページ」リンクを表示
 *
 * See: features/thread.feature
 * See: features/authentication.feature
 * See: docs/specs/screens/thread-list.yaml > elements > header
 */

import Link from "next/link";

interface HeaderProps {
	/** 認証済みかどうか（マイページリンクの表示制御に使用） */
	isAuthenticated?: boolean;
}

/**
 * ヘッダーコンポーネント（Server Component）
 *
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > header
 */
export default function Header({ isAuthenticated = false }: HeaderProps) {
	return (
		<header className="bg-gray-800 text-white py-2 px-4 border-b border-gray-600">
			<div className="max-w-4xl mx-auto flex items-center justify-between">
				{/* site-title: サイトタイトル */}
				<Link
					href="/"
					className="text-lg font-bold text-yellow-300 hover:text-yellow-200"
					id="site-title"
				>
					BattleBoard
				</Link>

				{/* ナビゲーション */}
				<nav className="flex items-center gap-4 text-sm">
					{isAuthenticated ? (
						/* nav-mypage: 認証済みの場合のみ表示 */
						<Link
							href="/mypage"
							className="text-gray-300 hover:text-white"
							id="nav-mypage"
						>
							マイページ
						</Link>
					) : (
						/* nav-login: 未認証の場合のみ表示
               See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする */
						<Link
							href="/login"
							className="text-gray-300 hover:text-white"
							id="nav-login"
						>
							ログイン
						</Link>
					)}
				</nav>
			</div>
		</header>
	);
}
