"use client";

/**
 * 認証ページ /auth/verify — Turnstile 認証ページ（Client Component）
 *
 * Web UI・専ブラ共用の認証ページ。
 * - Cloudflare Turnstile ウィジェット表示
 * - 認証成功時に write_token を表示（専ブラ向け案内付き）
 * - 認証失敗時にエラーメッセージ表示
 *
 * 認証フロー:
 * 1. ユーザーが書き込みを試みる → 認証案内が表示される
 * 2. /auth/verify にアクセス（Web UI または専ブラの WebView）
 * 3. Turnstile を通過して認証を送信
 * 4. 成功 → write_token が表示される（専ブラユーザーはメール欄に貼り付け）
 *
 * 専ブラ対応:
 * - 専ブラの WebView 内で表示されることを考慮してシンプルな HTML 構造を維持する
 * - 認証成功後に write_token を「#<write_token>」形式で案内する
 *
 * クエリパラメータ `token`:
 * - edge-token を URL 経由で受け取る（専ブラWebView等のCookie非共有環境向け）
 *
 * Turnstile Site Key:
 * - 環境変数 NEXT_PUBLIC_TURNSTILE_SITE_KEY から取得
 * - 未設定の場合はテスト用のダミーキー（1x00000000000000000000AA）を使用
 *
 * See: features/authentication.feature @Turnstile通過で認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: features/specialist_browser_compat.feature @専ブラ認証フロー
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

// Turnstile グローバル型の拡張宣言
// See: src/app/(web)/_components/AuthModal.tsx（同一パターン）
declare global {
	interface Window {
		turnstile?: {
			render: (
				container: string | HTMLElement,
				options: {
					sitekey: string;
					callback: (token: string) => void;
					"error-callback": () => void;
					"expired-callback": () => void;
				},
			) => string;
			reset: (widgetId: string) => void;
		};
	}
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/verify のレスポンス型
 * See: docs/specs/openapi.yaml > /api/auth/verify
 */
interface AuthVerifyResponse {
	success: boolean;
	writeToken?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// 認証ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * 認証ページコンポーネント
 *
 * See: features/authentication.feature @Turnstile通過で認証に成功する
 * See: features/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
 */
export default function VerifyPage() {
	return (
		<Suspense
			fallback={
				<div className="max-w-lg mx-auto px-4 py-8 text-center text-muted-foreground">
					読み込み中...
				</div>
			}
		>
			<VerifyPageContent />
		</Suspense>
	);
}

/**
 * リダイレクト先URLの安全性を検証する。
 * オープンリダイレクト攻撃を防止するため、同一オリジンの相対パスのみ許可する。
 */
function isSafeRedirect(url: string): boolean {
	return url.startsWith("/") && !url.startsWith("//");
}

function VerifyPageContent() {
	const searchParams = useSearchParams();

	// クエリパラメータ `token` から edge-token を取得（専ブラWebView等のCookie非共有環境向け）
	const edgeTokenParam = searchParams.get("token") ?? "";

	// クエリパラメータ `redirect` から認証成功後のリダイレクト先を取得
	// ヘッダー「新規登録」リンク等から遷移した場合に設定される
	const rawRedirect = searchParams.get("redirect");
	const redirectUrl =
		rawRedirect && isSafeRedirect(rawRedirect) ? rawRedirect : null;

	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [writeToken, setWriteToken] = useState<string | null>(null);
	// コピー完了フィードバック用フラグ（2秒後に自動リセット）
	const [copied, setCopied] = useState(false);

	const turnstileContainerRef = useRef<HTMLDivElement>(null);
	const turnstileWidgetIdRef = useRef<string | null>(null);
	const scriptLoadedRef = useRef(false);

	// ---------------------------------------------------------------------------
	// Turnstile 初期化
	// See: src/app/(web)/_components/AuthModal.tsx（同一パターン）
	// ---------------------------------------------------------------------------

	/** Turnstile スクリプトのロード */
	useEffect(() => {
		if (scriptLoadedRef.current) return;

		const existingScript = document.getElementById("turnstile-script");
		if (!existingScript) {
			const script = document.createElement("script");
			script.id = "turnstile-script";
			script.src =
				"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
			script.async = true;
			script.defer = true;
			document.head.appendChild(script);
		}
		scriptLoadedRef.current = true;
	}, []);

	/** Turnstile ウィジェットのレンダリング */
	const renderTurnstile = useCallback(() => {
		if (
			!turnstileContainerRef.current ||
			!window.turnstile ||
			turnstileWidgetIdRef.current
		) {
			return;
		}

		const sitekey =
			process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

		turnstileWidgetIdRef.current = window.turnstile.render(
			turnstileContainerRef.current,
			{
				sitekey,
				callback: (token: string) => {
					setTurnstileToken(token);
				},
				"error-callback": () => {
					setTurnstileToken(null);
					setError("Turnstile 検証に失敗しました。再試行してください");
				},
				"expired-callback": () => {
					setTurnstileToken(null);
				},
			},
		);
	}, []);

	/** ページ読み込み時に Turnstile を初期化 */
	useEffect(() => {
		if (window.turnstile) {
			renderTurnstile();
			return;
		}

		// スクリプトロード待ちのポーリング
		const interval = setInterval(() => {
			if (window.turnstile) {
				clearInterval(interval);
				renderTurnstile();
			}
		}, 100);

		return () => clearInterval(interval);
	}, [renderTurnstile]);

	// ---------------------------------------------------------------------------
	// コピーボタン
	// ---------------------------------------------------------------------------

	/**
	 * write_token をクリップボードにコピーするハンドラ
	 * `#<write_token>` 形式でコピーし、2秒間「コピーしました」フィードバックを表示する。
	 * clipboard API が使えない環境（非 HTTPS 等）では処理を無視する。
	 *
	 * See: tmp/tasks/task_TASK-053.md
	 */
	const handleCopy = async () => {
		if (!writeToken) return;
		try {
			await navigator.clipboard.writeText(`#${writeToken}`);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// フォールバック: clipboard API 非対応環境では何もしない
		}
	};

	// ---------------------------------------------------------------------------
	// フォーム送信
	// ---------------------------------------------------------------------------

	/**
	 * 認証フォームの送信ハンドラ
	 *
	 * POST /api/auth/verify に Turnstile トークンを送信する。
	 * 成功時は write_token を state に保存して画面に表示する。
	 * 失敗時はエラーメッセージを表示する。
	 *
	 * See: features/authentication.feature @Turnstile通過で認証に成功する
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!turnstileToken) {
			setError("Turnstile 検証を完了してください");
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/auth/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					turnstileToken,
					...(edgeTokenParam ? { edgeToken: edgeTokenParam } : {}),
				}),
			});

			const data = (await res.json()) as AuthVerifyResponse;

			if (res.ok && data.success) {
				// リダイレクト先が指定されている場合は即遷移（新規登録フロー等）
				if (redirectUrl) {
					window.location.href = redirectUrl;
					return;
				}
				// 認証成功: write_token を保存して表示
				// See: tmp/auth_spec_review_report.md §3.2 write_token 方式
				setWriteToken(data.writeToken ?? null);
			} else {
				// 認証失敗: エラーメッセージを表示
				// See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
				setError(data.error ?? "認証に失敗しました。もう一度お試しください");

				// Turnstile ウィジェットをリセット（再試行できるようにする）
				if (turnstileWidgetIdRef.current && window.turnstile) {
					window.turnstile.reset(turnstileWidgetIdRef.current);
				}
				turnstileWidgetIdRef.current = null;
				setTurnstileToken(null);
			}
		} catch {
			setError("通信エラーが発生しました。再試行してください");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング: 認証成功後（write_token 表示画面）
	// ---------------------------------------------------------------------------

	/**
	 * 認証成功後の write_token 表示
	 * 専ブラユーザーはこのトークンをメール欄に「#<write_token>」形式で貼り付けて使用する
	 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
	 * See: features/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
	 */
	if (writeToken !== null) {
		return (
			<main className="max-w-lg mx-auto px-4 py-8">
				{/* auth-success: 認証成功メッセージ */}
				<div
					id="auth-success"
					className="border border-green-400 bg-green-50 rounded p-6"
				>
					<h1 className="text-lg font-bold text-green-800 mb-3">
						認証が完了しました
					</h1>

					<p className="text-sm text-green-700 mb-4">
						書き込み認証が完了しました。ブラウザからの書き込みは自動的に有効になります。
					</p>

					{/* write_token 表示（専ブラ向け） */}
					{writeToken && (
						<div
							id="write-token-section"
							className="mt-4 p-4 bg-yellow-50 border border-yellow-400 rounded"
						>
							<p className="text-sm font-bold text-yellow-800 mb-2">
								専用ブラウザをご利用の方へ
							</p>
							<p className="text-xs text-yellow-700 mb-3">
								専ブラに戻って書き込み可能です。書き込めない場合はメール欄に以下のコードを入力してください（有効期限:
								10分）。
							</p>
							<p className="text-xs text-muted-foreground mb-1">
								メール欄に入力するコード:
							</p>
							{/* write-token-display: write_token の表示 */}
							<code
								id="write-token-display"
								className="block bg-card border border-yellow-300 rounded px-3 py-2 font-mono text-sm text-foreground break-all"
							>
								#{writeToken}
							</code>
							{/* copy-token-btn: ワンタッチコピーボタン */}
							<button
								id="copy-token-btn"
								type="button"
								onClick={handleCopy}
								className="mt-2 px-3 py-1 text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-900 border border-yellow-400 rounded transition-colors"
							>
								{copied ? "コピーしました" : "コピー"}
							</button>
							<p className="text-xs text-muted-foreground mt-2">
								※ このコードは一度だけ使用できます
							</p>
						</div>
					)}
				</div>
			</main>
		);
	}

	// ---------------------------------------------------------------------------
	// レンダリング: 認証フォーム
	// ---------------------------------------------------------------------------

	return (
		<main className="max-w-lg mx-auto px-4 py-8">
			{/* auth-verify-form: 認証フォームコンテナ */}
			<div
				id="auth-verify-form"
				className="border border-border bg-card rounded p-6"
			>
				{/* ページタイトル */}
				<h1 className="text-lg font-bold text-foreground mb-2">書き込み認証</h1>

				{/* auth-description: 説明文
				    redirect パラメータがある場合は新規登録フロー向けの文言を表示 */}
				<p id="auth-description" className="text-sm text-muted-foreground mb-4">
					{redirectUrl
						? "アカウント登録にはボット対策の認証が必要です。以下の認証を完了すると次の画面に進みます。"
						: "書き込みするには認証が必要です。以下のボタンを押して認証を完了してください。"}
				</p>

				<form onSubmit={handleSubmit} id="auth-form">
					{/* turnstile-widget: Cloudflare Turnstile CAPTCHA
              専ブラ向け注記: WebView 内でも Turnstile が表示される
              See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
              min-h-[65px]: Turnstile iframe (300x65) の表示領域を確保し、
              レンダリング前に高さ0で hidden 扱いになることを防止する
          */}
					<div className="mb-4" id="turnstile-widget">
						<div ref={turnstileContainerRef} className="min-h-[65px]" />
					</div>

					{/* auth-error: 認証失敗メッセージ */}
					{error && (
						<p
							id="auth-error"
							className="text-red-600 text-xs mb-3"
							role="alert"
						>
							{error}
						</p>
					)}

					{/* auth-submit-btn: 認証ボタン */}
					<button
						id="auth-submit-btn"
						type="submit"
						disabled={isSubmitting || !turnstileToken}
						className="w-full bg-gray-700 text-white text-sm py-2 px-4 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSubmitting ? "認証中..." : "認証する"}
					</button>
				</form>
			</div>
		</main>
	);
}
