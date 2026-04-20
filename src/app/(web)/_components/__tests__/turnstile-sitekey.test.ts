import { describe, expect, it } from "vitest";

import {
	LOCAL_FALLBACK_TURNSTILE_SITE_KEY,
	resolveTurnstileSiteKey,
} from "../turnstile-sitekey";

describe("resolveTurnstileSiteKey", () => {
	it("有効な site key はそのまま返す", () => {
		expect(resolveTurnstileSiteKey("1x-real-site-key")).toBe(
			"1x-real-site-key",
		);
	});

	it("未設定時はローカル用テストキーへフォールバックする", () => {
		expect(resolveTurnstileSiteKey(undefined)).toBe(
			LOCAL_FALLBACK_TURNSTILE_SITE_KEY,
		);
	});

	it("空文字や空白のみもローカル用テストキーへフォールバックする", () => {
		expect(resolveTurnstileSiteKey("")).toBe(
			LOCAL_FALLBACK_TURNSTILE_SITE_KEY,
		);
		expect(resolveTurnstileSiteKey("   ")).toBe(
			LOCAL_FALLBACK_TURNSTILE_SITE_KEY,
		);
	});
});
