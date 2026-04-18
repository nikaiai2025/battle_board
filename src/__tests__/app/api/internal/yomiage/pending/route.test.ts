/**
 * 単体テスト: GET /api/internal/yomiage/pending
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: docs/architecture/components/yomiage.md §2.3
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindByCommandType = vi.fn();
const mockVerifyInternalApiKey = vi.fn();

vi.mock("@/lib/infrastructure/repositories/pending-async-command-repository", () => ({
	findByCommandType: (...args: unknown[]) => mockFindByCommandType(...args),
}));

vi.mock("@/lib/middleware/internal-api-auth", () => ({
	verifyInternalApiKey: (...args: unknown[]) =>
		mockVerifyInternalApiKey(...args),
}));

import { GET } from "@/app/api/internal/yomiage/pending/route";

function createRequest(authenticated: boolean): Request {
	return new Request("http://localhost/api/internal/yomiage/pending", {
		method: "GET",
		headers: authenticated ? { Authorization: "Bearer test-key" } : {},
	});
}

describe("GET /api/internal/yomiage/pending", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("認証失敗時は 401 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(false);

		const response = await GET(createRequest(false));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
	});

	it("commandType='yomiage' の pending 一覧を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockFindByCommandType.mockResolvedValue([
			{
				id: "pending-001",
				commandType: "yomiage",
				threadId: "thread-001",
				targetPostNumber: 5,
				invokerUserId: "user-001",
				payload: { model_id: "gemini-3.1-flash-tts-preview", targetPostNumber: 5 },
				createdAt: new Date("2026-04-18T00:00:00.000Z"),
			},
		]);

		const response = await GET(createRequest(true));

		expect(response.status).toBe(200);
		expect(mockFindByCommandType).toHaveBeenCalledWith("yomiage");
		await expect(response.json()).resolves.toEqual({
			pendingList: [
				{
					id: "pending-001",
					commandType: "yomiage",
					threadId: "thread-001",
					targetPostNumber: 5,
					invokerUserId: "user-001",
					payload: {
						model_id: "gemini-3.1-flash-tts-preview",
						targetPostNumber: 5,
					},
					createdAt: "2026-04-18T00:00:00.000Z",
				},
			],
		});
	});

	it("リポジトリエラー時は 500 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockFindByCommandType.mockRejectedValue(new Error("db failed"));
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await GET(createRequest(true));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "INTERNAL_ERROR",
			message: "pending取得中にエラーが発生しました",
		});

		consoleSpy.mockRestore();
	});
});
