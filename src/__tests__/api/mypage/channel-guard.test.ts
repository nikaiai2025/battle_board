/**
 * 単体テスト: mypage 系 API + auth/pat -- channel guard
 *
 * Sprint-150: senbra channel token should be rejected with 403 on mypage APIs.
 *
 * See: tmp/edge_token_channel_separation_plan.md §3.4
 *
 * テスト方針:
 *   - AuthService.verifyEdgeToken をモック化し、channel='senbra' の認証結果を返す
 *   - 各ルートハンドラが 403 FORBIDDEN を返すことを検証する
 *   - web チャネルの場合は 403 にならないことを対照テストで検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言（vi.hoisted でファクトリ内から参照可能にする）
// ---------------------------------------------------------------------------

const { mockVerifyEdgeToken, mockGetMypage, mockGetPostHistory } = vi.hoisted(
	() => ({
		mockVerifyEdgeToken: vi.fn(),
		mockGetMypage: vi.fn(),
		mockGetPostHistory: vi.fn(),
	}),
);

vi.mock("../../../lib/services/auth-service", () => ({
	verifyEdgeToken: mockVerifyEdgeToken,
	reduceIp: vi.fn((ip: string) => ip),
	hashIp: vi.fn((ip: string) => `hash_${ip}`),
}));

vi.mock("../../../lib/services/mypage-service", () => ({
	getMypage: mockGetMypage,
	getPostHistory: mockGetPostHistory,
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------

import { GET as historyGet } from "../../../app/api/mypage/history/route";
import { GET as mypageGet } from "../../../app/api/mypage/route";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * テスト用の NextRequest を生成する。
 * edge-token Cookie を含む。
 */
function createMockRequest(
	url: string,
	edgeToken = "test-edge-token",
): NextRequest {
	const req = new NextRequest(new URL(url, "http://localhost:3000"), {
		headers: {
			cookie: `edge-token=${edgeToken}`,
		},
	});
	return req;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("mypage API -- channel guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// GET /api/mypage -- senbra channel returns 403
	// =========================================================================

	describe("GET /api/mypage", () => {
		it("senbra channel token returns 403 FORBIDDEN", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.4
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: "user-001",
				authorIdSeed: "seed",
				channel: "senbra",
			});

			const req = createMockRequest("http://localhost:3000/api/mypage");
			const res = await mypageGet(req);

			expect(res.status).toBe(403);
			const body = await res.json();
			expect(body.error).toBe("FORBIDDEN");
			expect(body.message).toContain("Web経由の認証が必要");
		});

		it("web channel token does not return 403", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §2
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: "user-001",
				authorIdSeed: "seed",
				channel: "web",
			});
			mockGetMypage.mockResolvedValue({
				userId: "user-001",
				isPremium: false,
				balance: 50,
				username: null,
				themeId: "default",
				fontId: "default",
			});

			const req = createMockRequest("http://localhost:3000/api/mypage");
			const res = await mypageGet(req);

			expect(res.status).toBe(200);
		});
	});

	// =========================================================================
	// GET /api/mypage/history -- senbra channel returns 403
	// =========================================================================

	describe("GET /api/mypage/history", () => {
		it("senbra channel token returns 403 FORBIDDEN", async () => {
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: "user-001",
				authorIdSeed: "seed",
				channel: "senbra",
			});

			const req = createMockRequest("http://localhost:3000/api/mypage/history");
			const res = await historyGet(req);

			expect(res.status).toBe(403);
			const body = await res.json();
			expect(body.error).toBe("FORBIDDEN");
		});

		it("web channel token passes through to service", async () => {
			mockVerifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: "user-001",
				authorIdSeed: "seed",
				channel: "web",
			});
			mockGetPostHistory.mockResolvedValue({
				posts: [],
				total: 0,
				totalPages: 0,
				page: 1,
			});

			const req = createMockRequest("http://localhost:3000/api/mypage/history");
			const res = await historyGet(req);

			expect(res.status).toBe(200);
		});
	});
});
