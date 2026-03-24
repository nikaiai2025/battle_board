"use client";

/**
 * パスワード再設定申請ページ /auth/forgot-password
 *
 * パスワードを忘れたユーザーがメールアドレスを入力し、
 * 再設定リンクの送信を依頼するページ。
 * ログインページの「パスワードを忘れた方はこちら」から遷移する。
 *
 * フロー:
 * 1. ユーザーがメールアドレスを入力して送信
 * 2. POST /api/auth/reset-password にリクエスト
 * 3. 成功: フォームを非表示にし成功メッセージ表示（画面遷移しない）
 * 4. 失敗: エラーメッセージ表示
 *
 * セキュリティ:
 * - 未登録メールでも成功と同じ応答を返す（ユーザー列挙攻撃防止）
 *
 * See: features/user_registration.feature @本登録ユーザーがパスワード再設定を申請する
 * See: features/user_registration.feature @未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない
 * See: docs/specs/screens/auth-forgot-password.yaml SCR-006
 */

import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** POST /api/auth/reset-password のレスポンス型 */
interface ResetPasswordResponse {
	success: boolean;
	message?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// パスワード再設定申請ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * パスワード再設定申請ページ（Client Component）
 *
 * See: features/user_registration.feature @本登録ユーザーがパスワード再設定を申請する
 * See: features/user_registration.feature @未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない
 * See: docs/specs/screens/auth-forgot-password.yaml SCR-006
 */
export default function ForgotPasswordPage() {
	// フォームの状態
	const [email, setEmail] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// 送信成功フラグ（true になるとフォームを非表示にし成功メッセージを表示）
	const [submitted, setSubmitted] = useState(false);

	// ---------------------------------------------------------------------------
	// フォーム送信ハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * メールアドレスを POST /api/auth/reset-password に送信する。
	 *
	 * See: features/user_registration.feature @本登録ユーザーがパスワード再設定を申請する
	 * See: docs/specs/screens/auth-forgot-password.yaml SCR-006 forgot-password-form
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim() }),
			});

			const data = (await res.json()) as ResetPasswordResponse;

			if (res.ok && data.success) {
				// 送信成功: フォームを非表示にし成功メッセージを表示
				setSubmitted(true);
				return;
			}

			// 送信失敗: エラーメッセージを表示
			setError("送信に失敗しました。もう一度お試しください。");
		} catch {
			// 通信エラー
			setError("送信に失敗しました。もう一度お試しください。");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<main className="max-w-sm mx-auto px-4 py-12">
			<div className="border border-border bg-card rounded p-6">
				{/* forgot-password-header: ページタイトル
				    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 */}
				<h1
					id="forgot-password-header"
					className="text-lg font-bold text-foreground mb-4 text-center"
				>
					パスワード再設定
				</h1>

				{/* forgot-password-success: 送信成功メッセージ（送信後にフォームと入れ替え表示）
				    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 forgot-password-success */}
				{submitted ? (
					<p
						id="forgot-password-success"
						className="text-green-700 text-sm mb-4"
						role="status"
					>
						メールアドレスが登録済みの場合、パスワード再設定リンクを送信しました。
						メールをご確認ください。
					</p>
				) : (
					<>
						{/* forgot-password-description: 説明文
						    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 */}
						<p
							id="forgot-password-description"
							className="text-sm text-muted-foreground mb-4"
						>
							登録済みのメールアドレスを入力してください。
							パスワード再設定リンクをメールで送信します。
						</p>

						{/* forgot-password-form: メールアドレス入力フォーム
						    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 */}
						<form onSubmit={handleSubmit} id="forgot-password-form">
							{/* メールアドレス入力欄 */}
							<div className="mb-4">
								<label
									htmlFor="forgot-password-email-input"
									className="block text-sm font-medium text-foreground mb-1"
								>
									メールアドレス
								</label>
								<input
									id="forgot-password-email-input"
									type="email"
									placeholder="example@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
									required
									autoComplete="email"
								/>
							</div>

							{/* forgot-password-error: 送信失敗エラーメッセージ
							    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 */}
							{error && (
								<p
									id="forgot-password-error"
									className="text-red-600 text-xs mb-3"
									role="alert"
								>
									{error}
								</p>
							)}

							{/* forgot-password-submit-btn: 再設定メール送信ボタン
							    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 */}
							<button
								id="forgot-password-submit-btn"
								type="submit"
								disabled={isSubmitting}
								className="w-full bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isSubmitting ? "送信中..." : "再設定メールを送信"}
							</button>
						</form>
					</>
				)}

				{/* forgot-password-back-link: ログインページに戻るリンク
				    See: docs/specs/screens/auth-forgot-password.yaml SCR-006 */}
				<div className="mt-4 text-center">
					<Link
						id="forgot-password-back-link"
						href="/login"
						className="text-sm text-blue-600 hover:underline"
					>
						ログインページに戻る
					</Link>
				</div>
			</div>
		</main>
	);
}
