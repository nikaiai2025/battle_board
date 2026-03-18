"use client";

/**
 * メール本登録ページ /register/email
 *
 * 仮ユーザーがメールアドレスとパスワードを入力して本登録を申請するフォーム。
 * 送信時に POST /api/auth/register を fetch で呼び出す。
 *
 * 認証フロー:
 * 1. 仮ユーザーがマイページから「メールアドレスで本登録」ボタンを押す
 * 2. このページでメールアドレスとパスワードを入力・送信する
 * 3. API が確認メールを送信する
 * 4. ユーザーがメール内リンクをクリックして本登録完了（/api/auth/callback が処理）
 *
 * エラーハンドリング:
 * - edge-token Cookie なし（未認証）: マイページへの誘導メッセージを表示
 * - バリデーションエラー（400）: エラーメッセージ表示
 * - 重複エラー（409）: 具体的な理由を表示
 * - その他エラー: 汎用エラーメッセージを表示
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 * See: src/app/api/auth/register/route.ts
 * See: docs/architecture/components/user-registration.md §7.1 メール認証フロー
 */

import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** POST /api/auth/register のレスポンス型 */
interface RegisterResponse {
	success: boolean;
	message?: string;
	error?: string;
	reason?: "already_registered" | "email_taken";
}

// ---------------------------------------------------------------------------
// メール本登録フォームコンポーネント
// ---------------------------------------------------------------------------

/**
 * メール本登録フォーム（Client Component）
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 */
export default function RegisterEmailPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isSuccess, setIsSuccess] = useState(false);
	const [isUnauthenticated, setIsUnauthenticated] = useState(false);

	// ---------------------------------------------------------------------------
	// フォーム送信ハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * フォーム送信処理
	 *
	 * POST /api/auth/register にメールアドレスとパスワードを送信する。
	 * 成功時は確認メール送信済みメッセージを表示する。
	 * 失敗時はエラーメッセージを表示する。
	 *
	 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
	 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		// クライアントサイドバリデーション
		if (!email.trim()) {
			setError("メールアドレスを入力してください");
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setError("有効なメールアドレスを入力してください");
			return;
		}
		if (!password) {
			setError("パスワードを入力してください");
			return;
		}
		if (password.length < 8) {
			setError("パスワードは8文字以上で入力してください");
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), password }),
			});

			const data = (await res.json()) as RegisterResponse;

			if (res.status === 401) {
				// edge-token Cookie なし（未認証）: マイページへの誘導
				setIsUnauthenticated(true);
				return;
			}

			if (res.ok && data.success) {
				// 成功: 確認メール送信済みメッセージを表示
				setIsSuccess(true);
				return;
			}

			// エラー: 理由に応じたメッセージを表示
			if (data.reason === "already_registered") {
				setError("このアカウントは既に本登録済みです");
			} else if (data.reason === "email_taken") {
				setError(
					"このメールアドレスは既に使用されています。別のメールアドレスをご利用ください",
				);
			} else {
				setError(data.error ?? "エラーが発生しました。もう一度お試しください");
			}
		} catch {
			setError("通信エラーが発生しました。再試行してください");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング: 未認証状態（マイページへ誘導）
	// ---------------------------------------------------------------------------

	if (isUnauthenticated) {
		return (
			<main className="max-w-lg mx-auto px-4 py-8">
				{/* register-email-unauthenticated: 未認証エラー表示 */}
				<div
					id="register-email-unauthenticated"
					className="border border-yellow-400 bg-yellow-50 rounded p-6"
				>
					<h1 className="text-lg font-bold text-yellow-800 mb-2">
						認証が必要です
					</h1>
					<p className="text-sm text-yellow-700 mb-4">
						本登録を行うには、事前に書き込み認証を完了している必要があります。
						まずマイページからログインしてください。
					</p>
					<Link
						href="/mypage"
						className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
					>
						マイページへ戻る
					</Link>
				</div>
			</main>
		);
	}

	// ---------------------------------------------------------------------------
	// レンダリング: 送信成功後（確認メール送信済みメッセージ）
	// ---------------------------------------------------------------------------

	if (isSuccess) {
		return (
			<main className="max-w-lg mx-auto px-4 py-8">
				{/* register-email-success: 確認メール送信済みメッセージ */}
				<div
					id="register-email-success"
					className="border border-green-400 bg-green-50 rounded p-6"
				>
					<h1 className="text-lg font-bold text-green-800 mb-2">
						確認メールを送信しました
					</h1>
					<p className="text-sm text-green-700 mb-4">
						入力したメールアドレス宛に確認リンクを送信しました。
						メール内のリンクをクリックして本登録を完了してください。
					</p>
					<p className="text-xs text-green-600 mb-4">
						メールが届かない場合は、迷惑メールフォルダをご確認ください。
					</p>
					<Link
						href="/mypage"
						className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
					>
						マイページへ戻る
					</Link>
				</div>
			</main>
		);
	}

	// ---------------------------------------------------------------------------
	// レンダリング: フォーム表示
	// ---------------------------------------------------------------------------

	return (
		<main className="max-w-lg mx-auto px-4 py-8">
			{/* register-email-form: メール本登録フォームコンテナ */}
			<div
				id="register-email-form"
				className="border border-gray-400 bg-white rounded p-6"
			>
				{/* ページタイトル */}
				<h1 className="text-lg font-bold text-gray-800 mb-2">
					メールアドレスで本登録
				</h1>

				{/* 説明文 */}
				<p className="text-sm text-gray-600 mb-4">
					メールアドレスとパスワードを登録することで、Cookie
					喪失・端末変更時でも同一ユーザーとして復帰できます。
				</p>

				<form onSubmit={handleSubmit} id="register-email-submit-form">
					{/* メールアドレス入力欄 */}
					<div className="mb-3">
						<label
							htmlFor="register-email-input"
							className="block text-sm font-medium text-gray-700 mb-1"
						>
							メールアドレス
						</label>
						<input
							id="register-email-input"
							type="email"
							placeholder="example@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
							required
							autoComplete="email"
						/>
					</div>

					{/* パスワード入力欄 */}
					<div className="mb-4">
						<label
							htmlFor="register-password-input"
							className="block text-sm font-medium text-gray-700 mb-1"
						>
							パスワード（8文字以上）
						</label>
						<input
							id="register-password-input"
							type="password"
							placeholder="8文字以上のパスワード"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
							required
							minLength={8}
							autoComplete="new-password"
						/>
					</div>

					{/* エラーメッセージ */}
					{error && (
						<p
							id="register-email-error"
							className="text-red-600 text-xs mb-3"
							role="alert"
						>
							{error}
						</p>
					)}

					{/* 送信ボタン */}
					<button
						id="register-email-submit-btn"
						type="submit"
						disabled={isSubmitting}
						className="w-full bg-blue-600 text-white text-sm py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSubmitting ? "送信中..." : "確認メールを送信する"}
					</button>
				</form>

				{/* マイページへの戻りリンク */}
				<div className="mt-4 pt-4 border-t border-gray-200">
					<Link
						href="/mypage"
						className="text-sm text-blue-600 hover:underline"
					>
						← マイページへ戻る
					</Link>
				</div>
			</div>
		</main>
	);
}
