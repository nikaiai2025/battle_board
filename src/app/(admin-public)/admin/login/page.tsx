"use client";

/**
 * 管理者ログインページ — /admin/login
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 * See: src/app/api/admin/login/route.ts — POST /api/admin/login
 * See: docs/architecture/components/authentication.md §2.3 管理者認証フロー
 *
 * 責務:
 *   - メールアドレス・パスワード入力フォームの表示
 *   - POST /api/admin/login を呼び出して認証を行う
 *   - 成功時: /admin へリダイレクト
 *   - 失敗時: エラーメッセージを表示
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でログイン APIを呼び出す
 *   - (admin-public) ルートグループに配置することで AdminLayout の認証ガードを回避する
 *     （See: tmp/escalations/escalation_ESC-TASK-284-1.md 案A）
 *   - シンプルな管理者向けUI（装飾は最小限）
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

// ---------------------------------------------------------------------------
// ログインページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * 管理者ログインフォーム（Client Component）
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 */
export default function AdminLoginPage() {
	const router = useRouter();

	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// ---------------------------------------------------------------------------
	// フォーム送信処理
	// See: src/app/api/admin/login/route.ts > POST /api/admin/login
	// ---------------------------------------------------------------------------

	/**
	 * ログインフォームの送信ハンドラ。
	 * POST /api/admin/login を呼び出し、成功時に /admin へリダイレクトする。
	 *
	 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
	 */
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setErrorMessage(null);
		setIsSubmitting(true);

		try {
			const res = await fetch("/api/admin/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});

			if (res.ok) {
				// 認証成功: 管理画面へリダイレクト
				// See: features/authentication.feature @管理画面にアクセスできる
				router.push("/admin");
			} else {
				// 認証失敗: エラーメッセージを表示
				// See: features/authentication.feature @ログインエラーメッセージが表示される
				const data = (await res.json()) as { message?: string };
				setErrorMessage(
					data.message ?? "メールアドレスまたはパスワードが間違っています",
				);
			}
		} catch {
			// ネットワークエラー
			setErrorMessage("通信エラーが発生しました。再試行してください。");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center">
			<div className="bg-white border border-gray-200 rounded p-8 shadow-sm w-full max-w-sm">
				{/* タイトル */}
				<h1 className="text-lg font-bold text-gray-800 mb-6">
					BattleBoard 管理者ログイン
				</h1>

				{/* エラーメッセージ
            See: features/authentication.feature @ログインエラーメッセージが表示される */}
				{errorMessage && (
					<p
						id="login-error"
						role="alert"
						className="text-red-600 text-sm mb-4 p-2 bg-red-50 border border-red-200 rounded"
					>
						{errorMessage}
					</p>
				)}

				{/* ログインフォーム */}
				<form onSubmit={(e) => void handleSubmit(e)} noValidate>
					{/* メールアドレス入力 */}
					<div className="mb-4">
						<label
							htmlFor="email"
							className="block text-xs text-gray-600 mb-1 font-medium"
						>
							メールアドレス
						</label>
						<input
							id="email"
							type="email"
							name="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoComplete="email"
							className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
							placeholder="admin@example.com"
						/>
					</div>

					{/* パスワード入力 */}
					<div className="mb-6">
						<label
							htmlFor="password"
							className="block text-xs text-gray-600 mb-1 font-medium"
						>
							パスワード
						</label>
						<input
							id="password"
							type="password"
							name="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							autoComplete="current-password"
							className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
						/>
					</div>

					{/* ログインボタン */}
					<button
						type="submit"
						disabled={isSubmitting}
						className="w-full bg-gray-800 text-white py-2 px-4 rounded text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{isSubmitting ? "ログイン中..." : "ログイン"}
					</button>
				</form>
			</div>
		</div>
	);
}
