const LOCAL_FALLBACK_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

/**
 * Turnstile の site key を解決する。
 * 未設定だけでなく空文字・空白のみもローカル用テストキーへフォールバックする。
 */
export function resolveTurnstileSiteKey(siteKey?: string): string {
	return siteKey?.trim() || LOCAL_FALLBACK_TURNSTILE_SITE_KEY;
}

export { LOCAL_FALLBACK_TURNSTILE_SITE_KEY };
