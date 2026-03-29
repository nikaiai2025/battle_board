/**
 * Header — ヘッダーナビゲーションコンポーネント
 *
 * ボットちゃんねる のサイト全体で共用するヘッダー。
 * - サイトタイトル「ボットちゃんねる」表示
 * - 「ログイン」リンク: 本登録ユーザー以外に表示（未認証 + 仮ユーザー向け）
 * - 「マイページ」リンク: 認証済み（仮ユーザー含む）の場合に表示
 *
 * 設計判断:
 *   仮ユーザー（edge-token あり）も isAuthenticated=true となるため、
 *   ログインリンクの出し分けには isRegistered（本登録済み）を別途参照する。
 *   - 未認証・仮ユーザー → ログイン表示（本登録アカウントへの復帰手段）
 *   - 本登録ユーザー → ログイン非表示（既にログイン済み。切替はマイページからログアウト）
 *
 * See: features/thread.feature
 * See: features/authentication.feature
 * See: features/user_registration.feature
 * See: docs/specs/screens/thread-list.yaml > elements > header
 */

import Link from "next/link";

interface HeaderProps {
	/** 認証済みかどうか（マイページリンクの表示制御に使用） */
	isAuthenticated?: boolean;
	/** 本登録済みかどうか（ログインリンクの非表示制御に使用） */
	isRegistered?: boolean;
}

/**
 * ヘッダーコンポーネント（Server Component）
 *
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > header
 */
export default function Header({
	isAuthenticated = false,
	isRegistered = false,
}: HeaderProps) {
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
					{/* nav-login: 本登録ユーザー以外に表示
					    未認証・仮ユーザーが本登録アカウントに復帰するための導線 */}
					{!isRegistered && (
						<Link
							href="/login"
							className="text-gray-300 hover:text-white"
							id="nav-login"
						>
							ログイン
						</Link>
					)}
					{/* nav-register: 未認証ユーザーのみ表示
					    Turnstile認証 → マイページで本登録、の直通導線 */}
					{!isAuthenticated && (
						<Link
							href="/auth/verify?redirect=/mypage"
							className="text-gray-300 hover:text-white"
							id="nav-register"
						>
							新規登録
						</Link>
					)}
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
