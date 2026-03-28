/**
 * 単体テスト: GET /api/admin/bots — BOT一覧API
 *
 * See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 *
 * テスト方針:
 *   - BotRepository, AuthService はモック化して外部依存を排除する
 *   - status=active / status=eliminated でのフィルタリングを検証する
 *   - 認証ガード（403）、不正パラメータ（400）のエラーケースを検証する
 *
 * カバレッジ対象:
 *   - 正常系: status=active で活動中BOT一覧が返る
 *   - 正常系: status=eliminated で撃破済みBOT一覧が返る
 *   - 認証エラー: admin_session なし → 403
 *   - バリデーションエラー: status パラメータなし/不正値 → 400
 *   - エッジケース: 該当BOTなし → 空配列
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted でモック変数を事前定義
// ---------------------------------------------------------------------------

const { mockVerifyAdminSession, mockFindActive, mockFindEliminated } =
	vi.hoisted(() => ({
		mockVerifyAdminSession: vi.fn(),
		mockFindActive: vi.fn(),
		mockFindEliminated: vi.fn(),
	}));

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/auth-service", () => ({
	verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...args),
}));

vi.mock("@/lib/infrastructure/repositories/bot-repository", () => ({
	findActive: (...args: unknown[]) => mockFindActive(...args),
	findEliminated: (...args: unknown[]) => mockFindEliminated(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { GET } from "../../../../app/api/admin/bots/route";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const ADMIN_SESSION = { userId: "admin-user-id", role: "admin" };

function makeRequest(status?: string, hasSession = true): NextRequest {
	const url = status
		? `http://localhost:3000/api/admin/bots?status=${status}`
		: "http://localhost:3000/api/admin/bots";
	if (hasSession) {
		return new NextRequest(url, {
			headers: { Cookie: "admin_session=valid-token" },
		});
	}
	return new NextRequest(url);
}

function makeActiveBot(overrides: Record<string, unknown> = {}) {
	return {
		id: "bot-1",
		name: "荒らしBOT",
		persona: "荒らし",
		hp: 80,
		maxHp: 100,
		dailyId: "ABCD1234",
		dailyIdDate: "2026-03-29",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 5,
		totalPosts: 30,
		accusedCount: 2,
		timesAttacked: 1,
		grassCount: 0,
		botProfileKey: "arashi",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-20"),
		...overrides,
	};
}

function makeEliminatedBot(overrides: Record<string, unknown> = {}) {
	return {
		...makeActiveBot(),
		id: "bot-2",
		name: "撃破済みBOT",
		isActive: false,
		hp: 0,
		survivalDays: 10,
		eliminatedAt: new Date("2026-03-28"),
		eliminatedBy: "user-killer",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/admin/bots — BOT一覧", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyAdminSession.mockResolvedValue(ADMIN_SESSION);
	});

	// --- 認証ガード ---

	it("admin_session Cookie なしの場合 403 を返す", async () => {
		const req = makeRequest("active", false);
		const res = await GET(req);
		expect(res.status).toBe(403);
	});

	it("admin_session が無効な場合 403 を返す", async () => {
		mockVerifyAdminSession.mockResolvedValue(null);
		const req = makeRequest("active");
		const res = await GET(req);
		expect(res.status).toBe(403);
	});

	// --- バリデーションエラー ---

	it("status パラメータなしの場合 400 を返す", async () => {
		const req = makeRequest(undefined);
		const res = await GET(req);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe("BAD_REQUEST");
	});

	it("status パラメータが不正値の場合 400 を返す", async () => {
		const req = makeRequest("invalid");
		const res = await GET(req);
		expect(res.status).toBe(400);
	});

	// --- 正常系: status=active ---

	it("status=active で活動中BOT一覧を返す", async () => {
		const bot1 = makeActiveBot({ id: "bot-1", name: "荒らしBOT" });
		const bot2 = makeActiveBot({ id: "bot-2", name: "常識人BOT" });
		mockFindActive.mockResolvedValue([bot1, bot2]);

		const req = makeRequest("active");
		const res = await GET(req);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.bots).toHaveLength(2);
		// 活動中BOTのレスポンスフィールドを検証
		expect(body.bots[0]).toHaveProperty("id");
		expect(body.bots[0]).toHaveProperty("name");
		expect(body.bots[0]).toHaveProperty("botProfileKey");
		expect(body.bots[0]).toHaveProperty("hp");
		expect(body.bots[0]).toHaveProperty("maxHp");
		expect(body.bots[0]).toHaveProperty("survivalDays");
		expect(body.bots[0]).toHaveProperty("totalPosts");
		expect(body.bots[0]).toHaveProperty("accusedCount");
	});

	it("status=active で該当BOTなしの場合 空配列を返す", async () => {
		mockFindActive.mockResolvedValue([]);

		const req = makeRequest("active");
		const res = await GET(req);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.bots).toEqual([]);
	});

	// --- 正常系: status=eliminated ---

	it("status=eliminated で撃破済みBOT一覧を返す", async () => {
		const bot = makeEliminatedBot();
		mockFindEliminated.mockResolvedValue([bot]);

		const req = makeRequest("eliminated");
		const res = await GET(req);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.bots).toHaveLength(1);
		// 撃破済みBOTのレスポンスフィールドを検証
		expect(body.bots[0]).toHaveProperty("id");
		expect(body.bots[0]).toHaveProperty("name");
		expect(body.bots[0]).toHaveProperty("botProfileKey");
		expect(body.bots[0]).toHaveProperty("survivalDays");
		expect(body.bots[0]).toHaveProperty("eliminatedAt");
		expect(body.bots[0]).toHaveProperty("eliminatedBy");
	});

	it("status=eliminated で該当BOTなしの場合 空配列を返す", async () => {
		mockFindEliminated.mockResolvedValue([]);

		const req = makeRequest("eliminated");
		const res = await GET(req);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.bots).toEqual([]);
	});
});
