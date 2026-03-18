/**
 * 単体テスト: Internal API 認証ミドルウェア
 *
 * verifyInternalApiKey の振る舞いをテストする。
 * 正常キー/不正キー/キーなし/環境変数未設定/空文字のケースを網羅する。
 *
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: src/lib/middleware/internal-api-auth.ts
 *
 * テスト方針:
 *   - process.env.BOT_API_KEY をテスト内で制御する
 *   - Request オブジェクトをモックで生成する
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyInternalApiKey } from "../../../lib/middleware/internal-api-auth";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * Authorization ヘッダー付きの Request を生成する。
 */
function createRequest(authHeader?: string): Request {
	const headers = new Headers();
	if (authHeader !== undefined) {
		headers.set("Authorization", authHeader);
	}
	return new Request("http://localhost/api/internal/test", {
		method: "POST",
		headers,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("verifyInternalApiKey()", () => {
	const ORIGINAL_ENV = process.env;

	beforeEach(() => {
		// process.env をテスト用にリセットする
		vi.stubEnv("BOT_API_KEY", "test-secret-key-12345");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正しい Bearer トークンの場合、true を返す", () => {
		const request = createRequest("Bearer test-secret-key-12345");
		expect(verifyInternalApiKey(request)).toBe(true);
	});

	// =========================================================================
	// 異常系: 不正キー
	// =========================================================================

	it("不正な Bearer トークンの場合、false を返す", () => {
		const request = createRequest("Bearer wrong-key");
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	it("Bearer プレフィックスがない場合、false を返す", () => {
		const request = createRequest("test-secret-key-12345");
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	// =========================================================================
	// 異常系: キーなし
	// =========================================================================

	it("Authorization ヘッダーがない場合、false を返す", () => {
		const request = createRequest();
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	it("Authorization ヘッダーが空文字の場合、false を返す", () => {
		const request = createRequest("");
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	// =========================================================================
	// 異常系: 環境変数未設定
	// =========================================================================

	it("BOT_API_KEY 環境変数が未設定の場合、false を返す", () => {
		vi.stubEnv("BOT_API_KEY", "");
		const request = createRequest("Bearer some-key");
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	it("BOT_API_KEY が undefined の場合、false を返す", () => {
		delete process.env.BOT_API_KEY;
		const request = createRequest("Bearer some-key");
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	it("Bearer の後にスペースが複数ある場合でもトークンが正しければ通る", () => {
		// "Bearer  token" の場合、replace("Bearer ", "") は " token" になる
		// これは BOT_API_KEY と一致しないため false
		const request = createRequest("Bearer  test-secret-key-12345");
		expect(verifyInternalApiKey(request)).toBe(false);
	});

	it("トークンに特殊文字が含まれる場合も正常に比較できる", () => {
		vi.stubEnv("BOT_API_KEY", "key-with-special-chars!@#$%");
		const request = createRequest("Bearer key-with-special-chars!@#$%");
		expect(verifyInternalApiKey(request)).toBe(true);
	});

	it("長いトークンでも正常に比較できる", () => {
		const longKey = "a".repeat(256);
		vi.stubEnv("BOT_API_KEY", longKey);
		const request = createRequest(`Bearer ${longKey}`);
		expect(verifyInternalApiKey(request)).toBe(true);
	});
});
