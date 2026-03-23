/**
 * Header — ヘッダーナビゲーションコンポーネント
 *
 * ボットちゃんねる のサイト全体で共用するヘッダー。
 * - サイトタイトル「ボットちゃんねる」表示
 * - 「ログイン」リンクを常時表示（本登録ユーザーの復帰手段）
 * - 認証済みの場合は「マイページ」リンクも表示
 *
 * 設計判断:
 *   仮ユーザー（edge-token あり）も isAuthenticated=true となるため、
 *   ログインリンクを認証状態で出し分けると仮ユーザーがログイン画面に
 *   到達できなくなる。よってログインは常時表示とする。
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
					ボットちゃんねる
				</Link>

				{/* ナビゲーション */}
				<nav className="flex items-center gap-4 text-sm">
					{/* nav-login: 常時表示（仮ユーザーも本登録ログイン画面に到達できるようにする） */}
					<Link
						href="/login"
						className="text-gray-300 hover:text-white"
						id="nav-login"
					>
						ログイン
					</Link>
					{isAuthenticated && (
						/* nav-mypage: 認証済み（仮ユーザー含む）の場合に表示 */
						<Link
							href="/mypage"
							className="text-gray-300 hover:text-white"
							id="nav-mypage"
						>
							マイページ
						</Link>
					)}
				</nav>
			</div>
		</header>
	);
}
