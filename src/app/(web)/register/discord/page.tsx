"use client";

/**
 * Discord本登録ページ /register/discord
 *
 * 仮ユーザーが Discord アカウントで本登録を開始するページ。
 * 「Discord で本登録」ボタンをクリックすると POST /api/auth/register/discord を呼び出し、
 * 返却された redirectUrl に window.location.href でリダイレクトする。
 *
 * 認証フロー:
 * 1. 仮ユーザーがマイページから「Discord で本登録」ボタンを押す
 * 2. このページで「Discord で本登録する」ボタンを押す
 * 3. API が Discord OAuth URL を返す
 * 4. ブラウザが Discord 認可画面にリダイレクトされる
 * 5. ユーザーが Discord で「許可」すると /api/auth/callback が処理して本登録完了
 *
 * エラーハンドリング:
 * - edge-token Cookie なし（未認証 401）: マイページへの誘導メッセージを表示
 * - サービスエラー（500）: エラーメッセージを表示
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 * See: src/app/api/auth/register/discord/route.ts
 * See: docs/architecture/components/user-registration.md §7.2 Discord連携
 */

import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** POST /api/auth/register/discord のレスポンス型 */
interface RegisterDiscordResponse {
	success: boolean;
	redirectUrl?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// Discord本登録ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * Discord本登録開始ページ（Client Component）
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 */
export default function RegisterDiscordPage() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isUnauthenticated, setIsUnauthenticated] = useState(false);

	// ---------------------------------------------------------------------------
	// Discord本登録開始ハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * Discord本登録ボタンのクリックハンドラ
	 *
	 * POST /api/auth/register/discord を呼び出して Discord OAuth URL を取得し、
	 * そのURLにリダイレクトする。
	 *
	 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
	 * See: docs/architecture/components/user-registration.md §7.2 Discord連携
	 */
	const handleDiscordRegister = async () => {
		setError(null);
		setIsLoading(true);

		try {
			const res = await fetch("/api/auth/register/discord", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			const data = (await res.json()) as RegisterDiscordResponse;

			if (res.status === 401) {
				// edge-token Cookie なし（未認証）: マイページへの誘導
				setIsUnauthenticated(true);
				return;
			}

			if (res.ok && data.success && data.redirectUrl) {
				// 成功: Discord 認可画面へリダイレクト
				window.location.href = data.redirectUrl;
				return;
			}

			// エラー: エラーメッセージを表示
			setError(
				data.error ??
					"Discord本登録の開始に失敗しました。もう一度お試しください",
			);
		} catch {
			setError("通信エラーが発生しました。再試行してください");
		} finally {
			// リダイレクト成功時はコンポーネントが破棄されるため、
			// エラー時のみ isLoading を false に戻す
			setIsLoading(false);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング: 未認証状態（マイページへ誘導）
	// ---------------------------------------------------------------------------

	if (isUnauthenticated) {
		return (
			<main className="max-w-lg mx-auto px-4 py-8">
				{/* register-discord-unauthenticated: 未認証エラー表示 */}
				<div
					id="register-discord-unauthenticated"
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
	// レンダリング: Discord本登録開始ページ
	// ---------------------------------------------------------------------------

	return (
		<main className="max-w-lg mx-auto px-4 py-8">
			{/* register-discord-page: Discord本登録ページコンテナ */}
			<div
				id="register-discord-page"
				className="border border-border bg-card rounded p-6"
			>
				{/* ページタイトル */}
				<h1 className="text-lg font-bold text-foreground mb-2">
					Discord で本登録
				</h1>

				{/* 説明文 */}
				<p className="text-sm text-muted-foreground mb-6">
					Discord アカウントと連携することで、Cookie
					喪失・端末変更時でも同一ユーザーとして復帰できます。 ボタンを押すと
					Discord の認可画面に移動します。
				</p>

				{/* エラーメッセージ */}
				{error && (
					<p
						id="register-discord-error"
						className="text-red-600 text-xs mb-4"
						role="alert"
					>
						{error}
					</p>
				)}

				{/* Discord本登録ボタン */}
				<button
					id="register-discord-btn"
					type="button"
					onClick={handleDiscordRegister}
					disabled={isLoading}
					className="w-full bg-indigo-600 text-white text-sm py-3 px-4 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					{isLoading ? (
						<span>Discord に接続中...</span>
					) : (
						<span>Discord で本登録する</span>
					)}
				</button>

				{/* 注意事項 */}
				<p className="text-xs text-muted-foreground mt-3">
					※ 認可画面で「承認」を押すと本登録が完了します。
				</p>

				{/* マイページへの戻りリンク */}
				<div className="mt-4 pt-4 border-t border-border">
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
