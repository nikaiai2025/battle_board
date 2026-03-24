"use client";

/**
 * ログインページ /login
 *
 * 本登録ユーザーがメールアドレス+パスワード または Discord アカウントで
 * ログインするためのページ。Cookie 喪失・新デバイス利用時の復帰手段。
 *
 * Sign in / Sign up の区別:
 *   - Sign in (ここ): 既存の本登録ユーザーがログインする
 *   - Sign up: マイページの本登録セクションから /register/email or /register/discord へ
 *
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 * See: features/user_registration.feature @誤ったパスワードではログインできない
 * See: docs/specs/user_registration_state_transitions.yaml #login_transitions
 */

import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** POST /api/auth/login のレスポンス型 */
interface LoginResponse {
	success: boolean;
	error?: string;
}

/** POST /api/auth/login/discord のレスポンス型 */
interface DiscordLoginResponse {
	success: boolean;
	redirectUrl?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// ログインページコンポーネント
// ---------------------------------------------------------------------------

/**
 * ログインページ（Client Component）
 *
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 */
export default function LoginPage() {
	// メールログインフォームの状態
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Discord ログインの状態
	const [isDiscordLoading, setIsDiscordLoading] = useState(false);

	// ---------------------------------------------------------------------------
	// メールログイン送信ハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * メールアドレス + パスワードでログインする。
	 *
	 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
	 * See: features/user_registration.feature @誤ったパスワードではログインできない
	 */
	const handleEmailLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		// クライアントサイドバリデーション
		if (!email.trim()) {
			setError("メールアドレスを入力してください");
			return;
		}
		if (!password) {
			setError("パスワードを入力してください");
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), password }),
			});

			const data = (await res.json()) as LoginResponse;

			if (res.ok && data.success) {
				// ログイン成功: トップページへリダイレクト
				window.location.href = "/";
				return;
			}

			// エラー表示
			setError(data.error ?? "ログインに失敗しました。もう一度お試しください");
		} catch {
			setError("通信エラーが発生しました。再試行してください");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ---------------------------------------------------------------------------
	// Discord ログイン ハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * Discord アカウントでログインを開始する。
	 *
	 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
	 */
	const handleDiscordLogin = async () => {
		setError(null);
		setIsDiscordLoading(true);

		try {
			const res = await fetch("/api/auth/login/discord", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			const data = (await res.json()) as DiscordLoginResponse;

			if (res.ok && data.success && data.redirectUrl) {
				// Discord 認可画面へリダイレクト
				window.location.href = data.redirectUrl;
				return;
			}

			setError(
				data.error ??
					"Discord ログインの開始に失敗しました。もう一度お試しください",
			);
		} catch {
			setError("通信エラーが発生しました。再試行してください");
		} finally {
			setIsDiscordLoading(false);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<main className="max-w-sm mx-auto px-4 py-12">
			<div id="login-page" className="border border-border bg-card rounded p-6">
				{/* ページタイトル */}
				<h1 className="text-lg font-bold text-foreground mb-6 text-center">
					ログイン
				</h1>

				{/* =============================
				    メールアドレス + パスワード フォーム
				    ============================= */}
				<form onSubmit={handleEmailLogin} id="login-email-form">
					{/* メールアドレス入力欄 */}
					<div className="mb-3">
						<label
							htmlFor="login-email-input"
							className="block text-sm font-medium text-foreground mb-1"
						>
							メールアドレス
						</label>
						<input
							id="login-email-input"
							type="email"
							placeholder="example@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
							required
							autoComplete="email"
						/>
					</div>

					{/* パスワード入力欄 */}
					<div className="mb-4">
						<label
							htmlFor="login-password-input"
							className="block text-sm font-medium text-foreground mb-1"
						>
							パスワード
						</label>
						<input
							id="login-password-input"
							type="password"
							placeholder="パスワード"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
							required
							autoComplete="current-password"
						/>
					</div>

					{/* login-forgot-password-link: パスワードを忘れた方への導線
				    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 ログインページへの追加要素 */}
					<div className="mb-4 text-right">
						<Link
							id="login-forgot-password-link"
							href="/auth/forgot-password"
							className="text-xs text-blue-600 hover:underline"
						>
							パスワードを忘れた方はこちら
						</Link>
					</div>

					{/* エラーメッセージ */}
					{error && (
						<p
							id="login-error"
							className="text-red-600 text-xs mb-3"
							role="alert"
						>
							{error}
						</p>
					)}

					{/* ログインボタン */}
					<button
						id="login-submit-btn"
						type="submit"
						disabled={isSubmitting}
						className="w-full bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSubmitting ? "ログイン中..." : "ログイン"}
					</button>
				</form>

				{/* =============================
				    区切り線
				    ============================= */}
				<div className="flex items-center my-5">
					<div className="flex-1 border-t border-border" />
					<span className="px-3 text-xs text-muted-foreground">または</span>
					<div className="flex-1 border-t border-border" />
				</div>

				{/* =============================
				    Discord ログインボタン
				    ============================= */}
				<button
					id="login-discord-btn"
					type="button"
					onClick={() => {
						void handleDiscordLogin();
					}}
					disabled={isDiscordLoading}
					className="w-full bg-indigo-600 text-white text-sm py-2 px-4 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isDiscordLoading ? "Discord に接続中..." : "Discord でログイン"}
				</button>

				{/* =============================
				    本登録への案内
				    ============================= */}
				<div className="mt-6 pt-4 border-t border-border text-center">
					<p className="text-xs text-muted-foreground mb-2">
						本登録がまだの方は、掲示板に書き込み後
						<br />
						マイページから本登録できます。
					</p>
					<Link
						href="/mypage"
						className="text-sm text-blue-600 hover:underline"
					>
						マイページへ
					</Link>
				</div>
			</div>
		</main>
	);
}
