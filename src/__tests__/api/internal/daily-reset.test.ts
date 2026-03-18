/**
 * 単体テスト: POST /api/internal/daily-reset
 *
 * 日次リセット Internal API のルートハンドラをテストする。
 * BotService と認証ミドルウェアをモック化し、正常系・異常系を検証する。
 *
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
 * See: src/app/api/internal/daily-reset/route.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

const mockPerformDailyReset = vi.fn();
const mockVerifyInternalApiKey = vi.fn();

vi.mock("@/lib/services/bot-service", () => ({
	createBotService: vi.fn(() => ({
		performDailyReset: mockPerformDailyReset,
	})),
}));

vi.mock("@/lib/middleware/internal-api-auth", () => ({
	verifyInternalApiKey: (...args: unknown[]) =>
		mockVerifyInternalApiKey(...args),
}));

import { POST } from "../../../app/api/internal/daily-reset/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function createAuthenticatedRequest(): Request {
	return new Request("http://localhost/api/internal/daily-reset", {
		method: "POST",
		headers: { Authorization: "Bearer test-key" },
	});
}

function createUnauthenticatedRequest(): Request {
	return new Request("http://localhost/api/internal/daily-reset", {
		method: "POST",
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/internal/daily-reset", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 認証
	// =========================================================================

	it("認証失敗時は 401 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(false);
		const request = createUnauthenticatedRequest();

		const response = await POST(request);

		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error).toBe("Unauthorized");
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("日次リセット成功時、結果をJSONで返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockPerformDailyReset.mockResolvedValue({
			botsRevealed: 2,
			botsRevived: 1,
			idsRegenerated: 10,
		});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.botsRevealed).toBe(2);
		expect(body.botsRevived).toBe(1);
		expect(body.idsRegenerated).toBe(10);
	});

	it("リセット対象が0件の場合も正常レスポンスを返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockPerformDailyReset.mockResolvedValue({
			botsRevealed: 0,
			botsRevived: 0,
			idsRegenerated: 0,
		});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.botsRevealed).toBe(0);
	});

	// =========================================================================
	// 異常系
	// =========================================================================

	it("performDailyReset がエラーをスローした場合、500 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockPerformDailyReset.mockRejectedValue(new Error("DB 接続エラー"));

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("INTERNAL_ERROR");

		consoleSpy.mockRestore();
	});
});
