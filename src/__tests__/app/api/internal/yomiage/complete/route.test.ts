/**
 * 単体テスト: POST /api/internal/yomiage/complete
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyInternalApiKey = vi.fn();
const mockCompleteYomiageCommand = vi.fn();
const mockCreatePost = vi.fn();
const mockCredit = vi.fn();

vi.mock("@/lib/middleware/internal-api-auth", () => ({
	verifyInternalApiKey: (...args: unknown[]) =>
		mockVerifyInternalApiKey(...args),
}));

vi.mock("@/lib/services/yomiage-service", () => ({
	completeYomiageCommand: (...args: unknown[]) =>
		mockCompleteYomiageCommand(...args),
}));

vi.mock("@/lib/services/post-service", () => ({
	createPost: (...args: unknown[]) => mockCreatePost(...args),
}));

vi.mock("@/lib/services/currency-service", () => ({
	credit: (...args: unknown[]) => mockCredit(...args),
}));

vi.mock("@/lib/infrastructure/repositories/pending-async-command-repository", () => ({
	deletePendingAsyncCommand: vi.fn(),
}));

import { POST } from "@/app/api/internal/yomiage/complete/route";

function createRequest(body: Record<string, unknown>, authenticated = true): Request {
	return new Request("http://localhost/api/internal/yomiage/complete", {
		method: "POST",
		headers: authenticated
			? {
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
				}
			: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/internal/yomiage/complete", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCompleteYomiageCommand.mockResolvedValue(undefined);
	});

	it("認証失敗時は 401 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(false);

		const response = await POST(createRequest({}, false));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
	});

	it("成功通知を completeYomiageCommand に委譲して 200 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);

		const response = await POST(
			createRequest({
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				targetPostNumber: 7,
				success: true,
				audioUrl: "https://example.com/audio.wav",
				amount: 30,
			}),
		);

		expect(response.status).toBe(200);
		expect(mockCompleteYomiageCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				pendingAsyncCommandRepository: expect.any(Object),
				createPostFn: expect.any(Function),
				creditFn: expect.any(Function),
			}),
			{
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				targetPostNumber: 7,
				success: true,
				audioUrl: "https://example.com/audio.wav",
				amount: 30,
				error: undefined,
				stage: undefined,
			},
		);
		await expect(response.json()).resolves.toEqual({ success: true });
	});

	it("失敗通知を completeYomiageCommand に委譲する", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);

		await POST(
			createRequest({
				pendingId: "pending-002",
				threadId: "thread-002",
				invokerUserId: "user-002",
				targetPostNumber: 8,
				success: false,
				error: "upload failed",
				stage: "upload",
				amount: 30,
			}),
		);

		expect(mockCompleteYomiageCommand).toHaveBeenCalledWith(
			expect.any(Object),
			{
				pendingId: "pending-002",
				threadId: "thread-002",
				invokerUserId: "user-002",
				targetPostNumber: 8,
				success: false,
				audioUrl: undefined,
				error: "upload failed",
				stage: "upload",
				amount: 30,
			},
		);
	});

	it("completeYomiageCommand が例外を投げた場合は 500 を返す", async () => {
		mockVerifyInternalApiKey.mockReturnValue(true);
		mockCompleteYomiageCommand.mockRejectedValue(new Error("unexpected"));
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await POST(
			createRequest({
				pendingId: "pending-003",
				threadId: "thread-003",
				invokerUserId: "user-003",
				targetPostNumber: 1,
				success: true,
				audioUrl: "https://example.com/audio.wav",
				amount: 30,
			}),
		);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "INTERNAL_ERROR",
			message: "yomiage完了処理中にエラーが発生しました",
		});

		consoleSpy.mockRestore();
	});
});
