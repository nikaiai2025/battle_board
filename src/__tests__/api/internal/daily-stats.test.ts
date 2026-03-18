/**
 * 単体テスト: POST /api/internal/daily-stats
 *
 * 日次統計集計 Internal API のルートハンドラをテストする。
 * supabaseAdmin と認証ミドルウェアをモック化し、正常系・異常系を検証する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: src/app/api/internal/daily-stats/route.ts
 * See: scripts/aggregate-daily-stats.ts
 *
 * テスト方針:
 *   - supabaseAdmin のクエリをモック化して DB 依存を排除する
 *   - verifyInternalApiKey もモック化する
 *   - 日付の指定あり/なし/不正形式のケースを検証する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

const mockVerifyInternalApiKey = vi.fn();

/**
 * supabaseAdmin のクエリチェーンをモック化する。
 * 各テーブルのクエリ結果を一括で制御する。
 */
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/middleware/internal-api-auth", () => ({
	verifyInternalApiKey: (...args: unknown[]) =>
		mockVerifyInternalApiKey(...args),
}));

vi.mock("@/lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: (...args: unknown[]) => mockFrom(...args),
	},
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

/**
 * supabaseAdmin.from() のクエリチェーンをセットアップする。
 * 全てのクエリが成功する状態にする。
 */
function setupSuccessfulQueries() {
	// from() は各テーブルに対して呼ばれる。
	// 簡易的に全テーブルで同じモックチェーンを返す。
	const countResult = { count: 5, error: null };
	const dataResult = { data: [], error: null };

	const chainMock = {
		select: vi.fn().mockReturnValue({
			gte: vi.fn().mockReturnValue({
				lt: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						not: vi.fn().mockResolvedValue(dataResult),
						...countResult,
					}),
					gt: vi.fn().mockResolvedValue(dataResult),
					lt: vi.fn().mockResolvedValue(dataResult),
					...countResult,
				}),
				eq: vi.fn().mockReturnValue({
					not: vi.fn().mockResolvedValue(dataResult),
					...countResult,
				}),
				...countResult,
			}),
			...countResult,
		}),
		upsert: vi.fn().mockResolvedValue({ error: null }),
	};

	mockFrom.mockReturnValue(chainMock);
	return chainMock;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/internal/daily-stats", () => {
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

	it("日付指定ありの場合、指定日の統計を集計する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		setupSuccessfulQueries();

		const request = createAuthenticatedRequest({ date: "2026-03-15" });
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.targetDate).toBe("2026-03-15");
	});

	it("日付指定なしの場合、昨日の統計を集計する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		setupSuccessfulQueries();

		const request = createAuthenticatedRequest({});
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		// targetDate が YYYY-MM-DD 形式であること
		expect(body.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

	it("UPSERT が失敗した場合、500 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		const chainMock = setupSuccessfulQueries();
		// upsert を失敗させる
		chainMock.upsert.mockResolvedValue({
			error: { message: "UPSERT failed" },
		});

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const request = createAuthenticatedRequest({ date: "2026-03-15" });
		const response = await POST(request);

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("INTERNAL_ERROR");

		consoleSpy.mockRestore();
	});
});
