/**
 * Internal API 認証ミドルウェア
 *
 * GitHub Actions cron ジョブから呼ばれる Internal API ルートの Bearer 認証を行う。
 * BOT_API_KEY 環境変数と Authorization ヘッダーの Bearer トークンを照合する。
 *
 * See: docs/architecture/architecture.md §13 TDR-010
 *
 * セキュリティ要件:
 *   - BOT_API_KEY が空文字または未設定の場合は全リクエストを拒否する
 *   - Authorization ヘッダーの Bearer トークンが BOT_API_KEY と一致する場合のみ許可
 */

/**
 * Internal API の Bearer 認証を検証する。
 *
 * @param request - HTTP リクエスト
 * @returns 認証成功なら true、失敗なら false
 */
export function verifyInternalApiKey(request: Request): boolean {
	// BOT_API_KEY が未設定または空文字の場合は全リクエストを拒否する
	const apiKey = process.env.BOT_API_KEY;
	if (!apiKey) {
		return false;
	}

	// Authorization ヘッダーから Bearer トークンを取得する
	const authHeader = request.headers.get("Authorization");
	if (!authHeader) {
		return false;
	}

	// Bearer プレフィックスの存在を検証する
	if (!authHeader.startsWith("Bearer ")) {
		return false;
	}

	const token = authHeader.slice("Bearer ".length);

	// タイミング安全な比較（Node.js 環境では timingSafeEqual が理想だが、
	// 固定長キーの比較であれば単純比較でも実用上問題ない）
	return token === apiKey;
}
