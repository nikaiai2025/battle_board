/**
 * TurnstileClient — Cloudflare Turnstile CAPTCHA 検証クライアント
 *
 * See: features/authentication.feature @Turnstile通過で認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: docs/architecture/components/authentication.md §3.1 依存先 > TurnstileClient
 *
 * 責務:
 *   - Cloudflare Turnstile siteverify API への HTTP リクエスト
 *   - 環境変数 TURNSTILE_SECRET_KEY 未設定時は常に true を返す（開発環境用フォールバック）
 */

/** Cloudflare Turnstile siteverify エンドポイント */
const TURNSTILE_VERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile siteverify API のレスポンス型
 */
interface TurnstileVerifyResponse {
	success: boolean;
	"error-codes"?: string[];
	challenge_ts?: string;
	hostname?: string;
}

/**
 * Turnstile トークンを Cloudflare の siteverify API で検証する。
 *
 * TURNSTILE_SECRET_KEY 環境変数が未設定の場合は開発環境用フォールバックとして
 * 常に true を返す（本番環境では必ず設定すること）。
 *
 * @param token - クライアントから受け取った Turnstile チャレンジトークン
 * @param remoteIp - クライアントの IP アドレス（省略可能。設定するとより厳密な検証が行われる）
 * @returns 検証成功時 true、失敗時 false
 *
 * @example
 * const isValid = await verifyTurnstileToken("cf-turnstile-response-xxxx", "203.0.113.1")
 */
export async function verifyTurnstileToken(
	token: string,
	remoteIp?: string,
): Promise<boolean> {
	const secretKey = process.env.TURNSTILE_SECRET_KEY;

	// 開発環境フォールバック: 環境変数未設定時は常に true を返す
	// See: TASK-006 タスク指示書 > 補足・制約
	if (!secretKey) {
		console.warn(
			"[TurnstileClient] TURNSTILE_SECRET_KEY が未設定です。開発環境フォールバックとして常に true を返します。",
		);
		return true;
	}

	// See: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
	const formData = new FormData();
	formData.append("secret", secretKey);
	formData.append("response", token);
	if (remoteIp) {
		formData.append("remoteip", remoteIp);
	}

	let response: Response;
	try {
		response = await fetch(TURNSTILE_VERIFY_URL, {
			method: "POST",
			body: formData,
		});
	} catch (error) {
		// ネットワーク障害時は安全側に倒して false を返す
		console.error(
			"[TurnstileClient] Turnstile API への接続に失敗しました:",
			error,
		);
		return false;
	}

	if (!response.ok) {
		console.error(
			`[TurnstileClient] Turnstile API が HTTP ${response.status} を返しました`,
		);
		return false;
	}

	const result = (await response.json()) as TurnstileVerifyResponse;

	if (!result.success) {
		console.warn(
			"[TurnstileClient] Turnstile 検証失敗:",
			result["error-codes"] ?? "(エラーコードなし)",
		);
	}

	return result.success;
}
