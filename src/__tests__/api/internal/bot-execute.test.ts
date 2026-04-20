/**
 * 単体テスト: POST /api/internal/bot/execute
 *
 * BOT投稿実行 Internal API のルートハンドラをテストする。
 * BotService と認証ミドルウェアをモック化し、正常系・異常系を検証する。
 *
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: src/app/api/internal/bot/execute/route.ts
 *
 * テスト方針:
 *   - BotService はモジュールモックで置き換える
 *   - verifyInternalApiKey もモジュールモックで制御する
 *   - Route Handler を直接呼び出してレスポンスを検証する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義（vi.mock はファイルトップにホイスティングされる）
// ---------------------------------------------------------------------------

const mockGetActiveBotsDueForPost = vi.fn();
const mockExecuteBotPost = vi.fn();
const mockProcessPendingTutorials = vi.fn();
const mockProcessAoriCommands = vi.fn();
const mockVerifyInternalApiKey = vi.fn();

vi.mock("@/lib/services/bot-service", () => ({
	createBotService: vi.fn(() => ({
		getActiveBotsDueForPost: mockGetActiveBotsDueForPost,
		executeBotPost: mockExecuteBotPost,
		processPendingTutorials: mockProcessPendingTutorials,
		processAoriCommands: mockProcessAoriCommands,
	})),
}));

vi.mock("@/lib/middleware/internal-api-auth", () => ({
	verifyInternalApiKey: (...args: unknown[]) =>
		mockVerifyInternalApiKey(...args),
}));

// モック定義後にインポートする
import { POST } from "../../../app/api/internal/bot/execute/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function createAuthenticatedRequest(): Request {
	return new Request("http://localhost/api/internal/bot/execute", {
		method: "POST",
		headers: { Authorization: "Bearer test-key" },
	});
}

function createUnauthenticatedRequest(): Request {
	return new Request("http://localhost/api/internal/bot/execute", {
		method: "POST",
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/internal/bot/execute", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// processPendingTutorials のデフォルト戻り値（既存テストへの影響を避けるため）
		// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
		mockProcessPendingTutorials.mockResolvedValue({
			processed: 0,
			results: [],
		});
		mockProcessAoriCommands.mockResolvedValue({
			processed: 0,
			results: [],
		});
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

	it("投稿対象BOTがいない場合、成功レスポンスを返す（0件処理）", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([]);

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.totalDue).toBe(0);
		expect(body.processed).toBe(0);
		expect(body.successCount).toBe(0);
		expect(body.failureCount).toBe(0);
	});

	it("投稿対象BOTが1体の場合、executeBotPost を呼び出して結果を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([
			{ id: "bot-001", name: "荒らし役" },
		]);
		mockExecuteBotPost.mockResolvedValue({
			postId: "post-001",
			postNumber: 42,
			dailyId: "FkBot01",
		});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.totalDue).toBe(1);
		expect(body.successCount).toBe(1);
		expect(body.results[0].botId).toBe("bot-001");
		expect(body.results[0].success).toBe(true);
		expect(body.results[0].postId).toBe("post-001");
	});

	it("executeBotPost が null を返した場合（スキップ）、skipped として記録する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([
			{ id: "bot-001", name: "荒らし役" },
		]);
		mockExecuteBotPost.mockResolvedValue(null);

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		const body = await response.json();
		expect(body.skippedCount).toBe(1);
		expect(body.results[0].skipped).toBe(true);
	});

	it("投稿対象BOTが2体を超える場合、2体までしか処理しない（負荷制御）", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		const bots = Array.from({ length: 8 }, (_, i) => ({
			id: `bot-${String(i + 1).padStart(3, "0")}`,
			name: `荒らし役${i + 1}`,
		}));
		mockGetActiveBotsDueForPost.mockResolvedValue(bots);
		mockExecuteBotPost.mockResolvedValue({
			postId: "post-x",
			postNumber: 1,
			dailyId: "FkBot01",
		});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		const body = await response.json();
		expect(body.totalDue).toBe(8);
		expect(body.processed).toBe(2);
		expect(body.results.length).toBe(2);
	});

	// =========================================================================
	// 異常系
	// =========================================================================

	it("executeBotPost がエラーをスローした場合、失敗として記録する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([
			{ id: "bot-001", name: "荒らし役" },
		]);
		mockExecuteBotPost.mockRejectedValue(new Error("PostService 失敗"));

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.failureCount).toBe(1);
		expect(body.results[0].success).toBe(false);
		expect(body.results[0].error).toContain("PostService 失敗");
	});

	it("getActiveBotsDueForPost がエラーをスローした場合、500 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockRejectedValue(new Error("DB 接続エラー"));

		// console.error をモック化してノイズを抑制
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("INTERNAL_ERROR");

		consoleSpy.mockRestore();
	});

	// =========================================================================
	// tutorials フィールド（チュートリアルBOT pending 処理）
	// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
	// =========================================================================

	it("レスポンスに tutorials フィールドが含まれる（後方互換）", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([]);
		mockProcessPendingTutorials.mockResolvedValue({
			processed: 0,
			results: [],
		});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		// tutorials フィールドが存在すること
		expect(body).toHaveProperty("tutorials");
		expect(body.tutorials.processed).toBe(0);
		expect(body.tutorials.results).toEqual([]);
	});

	it("processPendingTutorials の結果が tutorials フィールドに反映される", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([]);
		mockProcessPendingTutorials.mockResolvedValue({
			processed: 1,
			results: [
				{
					pendingId: "pending-001",
					success: true,
					botId: "tutorial-bot-001",
					postId: "post-tut-001",
					postNumber: 6,
				},
			],
		});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.tutorials.processed).toBe(1);
		expect(body.tutorials.results).toHaveLength(1);
		expect(body.tutorials.results[0].pendingId).toBe("pending-001");
		expect(body.tutorials.results[0].success).toBe(true);
	});

	it("processPendingTutorials がエラーをスローしても 200 を返し、BOT投稿結果は保持される", async () => {
		// subrequest 上限超過など processPendingTutorials の失敗が
		// BOT投稿成功分を 500 にしないことを検証する
		// See: tmp/reports/INCIDENT-CRON500.md
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockGetActiveBotsDueForPost.mockResolvedValue([
			{ id: "bot-001", name: "荒らし役" },
		]);
		mockExecuteBotPost.mockResolvedValue({
			postId: "post-001",
			postNumber: 42,
			dailyId: "FkBot01",
		});
		mockProcessPendingTutorials.mockRejectedValue(
			new Error("Too many subrequests by single Worker invocation."),
		);

		// console.error をモック化してノイズを抑制
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const request = createAuthenticatedRequest();
		const response = await POST(request);

		// チュートリアル処理が失敗しても 500 にならない
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.successCount).toBe(1);
		expect(body.results[0].botId).toBe("bot-001");
		expect(body.results[0].success).toBe(true);
		// tutorials は null（処理失敗）
		expect(body.tutorials).toBeNull();

		consoleSpy.mockRestore();
	});
});
