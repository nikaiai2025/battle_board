"use client";

/**
 * 新パスワード設定ページ /auth/reset-password
 *
 * パスワード再設定メール内のリンクから遷移するページ。
 * /api/auth/confirm?type=recovery でトークン検証・edge-token 発行後に
 * このページにリダイレクトされる（edge-token Cookie は既に発行済み）。
 *
 * フロー:
 * 1. ユーザーが新パスワードと確認パスワードを入力
 * 2. クライアントサイドでパスワード一致を確認
 * 3. POST /api/auth/update-password に password のみ送信（確認フィールドは送らない）
 * 4. 成功: フォームを非表示にし完了メッセージ + ログインリンク表示
 * 5. 失敗: エラーメッセージ表示
 *
 * See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
 * See: docs/specs/screens/auth-reset-password.yaml SCR-007
 */

import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** POST /api/auth/update-password のレスポンス型 */
interface UpdatePasswordResponse {
	success: boolean;
	error?: string;
}

// ---------------------------------------------------------------------------
// 新パスワード設定ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * 新パスワード設定ページ（Client Component）
 *
 * See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
 * See: docs/specs/screens/auth-reset-password.yaml SCR-007
 */
export default function ResetPasswordPage() {
	// フォームの状態
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	// クライアントサイドのパスワード不一致エラー
	const [mismatchError, setMismatchError] = useState<string | null>(null);
	// APIエラー
	const [error, setError] = useState<string | null>(null);
	// 送信成功フラグ（true になるとフォームを非表示にし成功メッセージ+ログインリンクを表示）
	const [updated, setUpdated] = useState(false);

	// ---------------------------------------------------------------------------
	// フォーム送信ハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * 新パスワードを POST /api/auth/update-password に送信する。
	 * パスワード不一致はクライアントサイドで検証し、APIには送信しない。
	 * 確認フィールドの値はAPIに送信しない。
	 *
	 * See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
	 * See: docs/specs/screens/auth-reset-password.yaml SCR-007 reset-password-form
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setMismatchError(null);
		setError(null);

		// クライアントサイドバリデーション: パスワード一致確認
		if (password !== confirmPassword) {
			setMismatchError("パスワードが一致しません。");
			return;
		}

		setIsSubmitting(true);
		try {
			// APIには password のみ送信（確認フィールドは送らない）
			const res = await fetch("/api/auth/update-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password }),
			});

			const data = (await res.json()) as UpdatePasswordResponse;

			if (res.ok && data.success) {
				// パスワード更新成功: フォームを非表示にし完了メッセージを表示
				setUpdated(true);
				return;
			}

			// API エラー: エラーメッセージを表示
			setError("パスワードの変更に失敗しました。もう一度お試しください。");
		} catch {
			// 通信エラー
			setError("パスワードの変更に失敗しました。もう一度お試しください。");
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
				{/* reset-password-header: ページタイトル
				    See: docs/specs/screens/auth-reset-password.yaml SCR-007 */}
				<h1
					id="reset-password-header"
					className="text-lg font-bold text-foreground mb-6 text-center"
				>
					新しいパスワードを設定
				</h1>

				{/* 送信成功後: 完了メッセージ + ログインリンク表示
				    See: docs/specs/screens/auth-reset-password.yaml SCR-007 reset-password-success */}
				{updated ? (
					<div>
						<p
							id="reset-password-success"
							className="text-green-700 text-sm mb-4"
							role="status"
						>
							パスワードを変更しました。
						</p>

						{/* reset-password-login-link: ログインページへのリンク（成功後のみ表示）
						    See: docs/specs/screens/auth-reset-password.yaml SCR-007 */}
						<div className="text-center">
							<Link
								id="reset-password-login-link"
								href="/login"
								className="text-sm text-blue-600 hover:underline"
							>
								ログインページへ
							</Link>
						</div>
					</div>
				) : (
					/* reset-password-form: 新パスワード入力フォーム
					   See: docs/specs/screens/auth-reset-password.yaml SCR-007 */
					<form onSubmit={handleSubmit} id="reset-password-form">
						{/* 新パスワード入力欄 */}
						<div className="mb-3">
							<label
								htmlFor="reset-password-input"
								className="block text-sm font-medium text-foreground mb-1"
							>
								新しいパスワード
							</label>
							<input
								id="reset-password-input"
								type="password"
								placeholder="8文字以上"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
								required
								minLength={8}
								autoComplete="new-password"
							/>
						</div>

						{/* 新パスワード確認入力欄（クライアントサイドで一致確認。APIには送信しない）*/}
						<div className="mb-4">
							<label
								htmlFor="reset-password-confirm-input"
								className="block text-sm font-medium text-foreground mb-1"
							>
								新しいパスワード（確認）
							</label>
							<input
								id="reset-password-confirm-input"
								type="password"
								placeholder="もう一度入力してください"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
								required
								autoComplete="new-password"
							/>
						</div>

						{/* reset-password-mismatch-error: パスワード不一致エラー（クライアントサイド）
						    See: docs/specs/screens/auth-reset-password.yaml SCR-007 */}
						{mismatchError && (
							<p
								id="reset-password-mismatch-error"
								className="text-red-600 text-xs mb-3"
								role="alert"
							>
								{mismatchError}
							</p>
						)}

						{/* reset-password-error: APIエラーメッセージ
						    See: docs/specs/screens/auth-reset-password.yaml SCR-007 */}
						{error && (
							<p
								id="reset-password-error"
								className="text-red-600 text-xs mb-3"
								role="alert"
							>
								{error}
							</p>
						)}

						{/* reset-password-submit-btn: パスワード変更ボタン
						    See: docs/specs/screens/auth-reset-password.yaml SCR-007 */}
						<button
							id="reset-password-submit-btn"
							type="submit"
							disabled={isSubmitting}
							className="w-full bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isSubmitting ? "変更中..." : "パスワードを変更"}
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
