import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findByThreadId: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findByBoardIdWithPreview: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/incentive-log-repository", () => ({
	create: vi.fn(),
}));

vi.mock(
	"@/lib/infrastructure/repositories/pending-tutorial-repository",
	() => ({
		create: vi.fn(),
	}),
);

vi.mock("@/lib/services/auth-service", () => ({
	verifyEdgeToken: vi.fn(),
	issueEdgeToken: vi.fn(),
	issueAuthCode: vi.fn(),
	isIpBanned: vi.fn(),
}));

vi.mock("@/lib/services/currency-service", () => ({
	credit: vi.fn(),
}));

vi.mock("@/lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn(),
}));

import type { ThreadWithPreview } from "@/lib/domain/models/thread";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";
import { getThreadListWithPreview } from "../post-service";

function makeThreadWithPreview(): ThreadWithPreview {
	return {
		id: "thread-001",
		threadKey: "1776578921",
		boardId: "livebot",
		title: "プレビュー付きスレッド",
		postCount: 12,
		datByteSize: 0,
		createdBy: "user-001",
		createdAt: new Date("2026-04-20T00:00:00Z"),
		lastPostAt: new Date("2026-04-20T01:00:00Z"),
		isDeleted: false,
		isPinned: false,
		isDormant: false,
		previewPosts: [
			{
				postNumber: 8,
				displayName: "名無しさん",
				body: "これは最新レスのプレビューです",
				createdAt: new Date("2026-04-20T00:30:00Z"),
				isDeleted: false,
				isSystemMessage: false,
			},
		],
	};
}

describe("PostService getThreadListWithPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ThreadRepository.findByBoardIdWithPreview の結果をそのまま返す", async () => {
		const previewThreads = [makeThreadWithPreview()];
		vi.mocked(ThreadRepository.findByBoardIdWithPreview).mockResolvedValue(
			previewThreads,
		);

		const result = await getThreadListWithPreview("livebot", 5);

		expect(result).toEqual(previewThreads);
		expect(ThreadRepository.findByBoardIdWithPreview).toHaveBeenCalledWith(
			"livebot",
			{
				threadLimit: 50,
				previewCount: 5,
			},
		);
	});

	it("previewCount を省略した場合は 5 件を使用する", async () => {
		vi.mocked(ThreadRepository.findByBoardIdWithPreview).mockResolvedValue([]);

		await getThreadListWithPreview("livebot");

		expect(ThreadRepository.findByBoardIdWithPreview).toHaveBeenCalledWith(
			"livebot",
			{
				threadLimit: 50,
				previewCount: 5,
			},
		);
	});
});
