/**
 * 単体テスト: POST /api/internal/daily-stats
 *
 * 日次統計集計 Internal API のルートハンドラをテストする。
 * DailyStatsService と認証ミドルウェアをモック化し、正常系・異常系を検証する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: src/app/api/internal/daily-stats/route.ts
 * See: src/lib/services/daily-stats-service.ts
 *
 * テスト方針:
 *   - DailyStatsService をモック化してルートハンドラの責務のみ検証する
 *   - verifyInternalApiKey もモック化する
 *   - 日付の指定あり/なし/不正形式のケースを検証する
 *   - ルートは「認証 -> Service委譲 -> レスポンス返却」の薄いラッパーであること
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyStat } from "../../../lib/services/daily-stats-service";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

const mockVerifyInternalApiKey = vi.fn();
const mockAggregateAndUpsert = vi.fn();
const mockGetYesterdayJst = vi.fn();

vi.mock("@/lib/middleware/internal-api-auth", () => ({
	verifyInternalApiKey: (...args: unknown[]) =>
		mockVerifyInternalApiKey(...args),
}));

vi.mock("@/lib/services/daily-stats-service", () => ({
	aggregateAndUpsert: (...args: unknown[]) => mockAggregateAndUpsert(...args),
	getYesterdayJst: () => mockGetYesterdayJst(),
}));

import { POST } from "../../../app/api/internal/daily-stats/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function createAuthenticatedRequest(body?: object): Request {
	return new Request("http://localhost/api/internal/daily-stats", {
		method: "POST",
		headers: {
			Authorization: "Bearer test-key",
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : JSON.stringify({}),
	});
}

function createUnauthenticatedRequest(): Request {
	return new Request("http://localhost/api/internal/daily-stats", {
		method: "POST",
	});
}

/** テスト用の DailyStat データ */
function createMockStat(targetDate: string): DailyStat {
	return {
		stat_date: targetDate,
		total_users: 100,
		new_users: 5,
		active_users: 30,
		total_posts: 200,
		total_threads: 10,
		active_threads: 8,
		currency_in_circulation: 50000,
		currency_granted: 1000,
		currency_consumed: 500,
		total_accusations: 3,
		total_attacks: 2,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/internal/daily-stats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetYesterdayJst.mockReturnValue("2026-03-18");
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

	it("日付指定ありの場合、指定日の統計を集計する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		const mockStat = createMockStat("2026-03-15");
		mockAggregateAndUpsert.mockResolvedValue(mockStat);

		const request = createAuthenticatedRequest({ date: "2026-03-15" });
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.targetDate).toBe("2026-03-15");
		expect(body.stats).toEqual(mockStat);
		// Service層に正しい日付が渡されたことを検証
		expect(mockAggregateAndUpsert).toHaveBeenCalledWith("2026-03-15");
	});

	it("日付指定なしの場合、昨日の統計を集計する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		const mockStat = createMockStat("2026-03-18");
		mockAggregateAndUpsert.mockResolvedValue(mockStat);

		const request = createAuthenticatedRequest({});
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		// targetDate が YYYY-MM-DD 形式であること
		expect(body.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("Service層にルートから正しく委譲されている（supabaseAdmin直接参照なし）", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		const mockStat = createMockStat("2026-03-15");
		mockAggregateAndUpsert.mockResolvedValue(mockStat);

		const request = createAuthenticatedRequest({ date: "2026-03-15" });
		await POST(request);

		// aggregateAndUpsert が呼ばれたことを検証（委譲の証明）
		expect(mockAggregateAndUpsert).toHaveBeenCalledTimes(1);
		expect(mockAggregateAndUpsert).toHaveBeenCalledWith("2026-03-15");
	});

	// =========================================================================
	// 異常系
	// =========================================================================

	it("不正な日付形式の場合、400 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);

		const request = createAuthenticatedRequest({
			date: "2026/03/15",
		});
		const response = await POST(request);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe("INVALID_DATE");
	});

	it("Service層が例外をスローした場合、500 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockAggregateAndUpsert.mockRejectedValue(
			new Error("UPSERT 失敗: DB error"),
		);

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const request = createAuthenticatedRequest({ date: "2026-03-15" });
		const response = await POST(request);

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("INTERNAL_ERROR");

		consoleSpy.mockRestore();
	});
});
