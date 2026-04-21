import { describe, expect, it, vi } from "vitest";
import type { Post } from "../../../lib/domain/models/post";
import type { IGoogleAiAdapter } from "../../../lib/infrastructure/adapters/google-ai-adapter";
import type {
	IReplyCandidateRepository,
	IThreadRepository,
} from "../../../lib/services/bot-strategies/types";
import {
	buildHumanMimicUserPrompt,
	parseHumanMimicCandidates,
	runHumanMimicCandidateBatch,
} from "../../../lib/services/human-mimic-candidate-service";

function createPost(overrides: Partial<Post> = {}): Post {
	return {
		id: crypto.randomUUID(),
		threadId: "thread-001",
		postNumber: 1,
		authorId: "user-001",
		displayName: "名無しさん",
		dailyId: "AbCd1234",
		body: "今日は平和ですね",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-04-21T00:00:00Z"),
		...overrides,
	};
}

function createThreadRepository(): IThreadRepository {
	return {
		findByBoardId: vi.fn().mockResolvedValue([
			{ id: "thread-001", title: "今日の雑談" },
			{ id: "thread-002", title: "ニュース速報" },
		]),
	};
}

function createReplyCandidateRepository(): IReplyCandidateRepository {
	return {
		countUnpostedByThread: vi.fn().mockResolvedValue(0),
		saveMany: vi.fn().mockResolvedValue(undefined),
		findThreadIdsWithUnpostedCandidates: vi.fn().mockResolvedValue([]),
		findOldestUnpostedByThread: vi.fn().mockResolvedValue(null),
		findById: vi.fn().mockResolvedValue(null),
		markAsPosted: vi.fn().mockResolvedValue(true),
	};
}

function createGoogleAiAdapter(
	text = JSON.stringify(Array.from({ length: 10 }, (_, i) => `候補${i + 1}`)),
): IGoogleAiAdapter {
	return {
		generate: vi.fn().mockResolvedValue({ text }),
		generateWithSearch: vi.fn(),
	};
}

describe("human-mimic-candidate-service", () => {
	it("未投稿候補があるスレッドは生成をスキップする", async () => {
		const threadRepository = createThreadRepository();
		const replyCandidateRepository = createReplyCandidateRepository();
		(
			replyCandidateRepository.countUnpostedByThread as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
		const googleAiAdapter = createGoogleAiAdapter();

		await runHumanMimicCandidateBatch({
			threadRepository,
			postRepository: {
				findByThreadId: vi.fn().mockResolvedValue([createPost()]),
			},
			replyCandidateRepository,
			googleAiAdapter,
		});

		expect(googleAiAdapter.generate).toHaveBeenCalledTimes(1);
		expect(replyCandidateRepository.saveMany).toHaveBeenCalledTimes(1);
	});

	it("未投稿候補が0件のスレッドでは 10 件の候補を保存する", async () => {
		const replyCandidateRepository = createReplyCandidateRepository();
		const posts = [createPost(), createPost({ postNumber: 2, body: "そうですね" })];
		const googleAiAdapter = createGoogleAiAdapter();

		await runHumanMimicCandidateBatch({
			threadRepository: {
				findByBoardId: vi
					.fn()
					.mockResolvedValue([{ id: "thread-001", title: "今日の雑談" }]),
			},
			postRepository: {
				findByThreadId: vi.fn().mockResolvedValue(posts),
			},
			replyCandidateRepository,
			googleAiAdapter,
		});

		expect(replyCandidateRepository.saveMany).toHaveBeenCalledWith(
			"human_mimic",
			"thread-001",
			Array.from({ length: 10 }, (_, i) => `候補${i + 1}`),
			2,
		);
		expect(googleAiAdapter.generate).toHaveBeenCalledWith(
			expect.objectContaining({
				structuredOutput: {
					responseMimeType: "application/json",
					responseSchema: {
						type: "array",
						minItems: 10,
						maxItems: 10,
						items: {
							type: "string",
						},
					},
				},
			}),
		);
	});

	it("あるスレッドで AI 呼び出しが失敗しても他スレッドの処理は継続する", async () => {
		const replyCandidateRepository = createReplyCandidateRepository();
		const googleAiAdapter = {
			generate: vi
				.fn()
				.mockRejectedValueOnce(new Error("Gemini unavailable"))
				.mockResolvedValueOnce({
					text: JSON.stringify(Array.from({ length: 10 }, (_, i) => `候補${i + 1}`)),
				}),
			generateWithSearch: vi.fn(),
		} satisfies IGoogleAiAdapter;

		const result = await runHumanMimicCandidateBatch({
			threadRepository: createThreadRepository(),
			postRepository: {
				findByThreadId: vi.fn().mockResolvedValue([createPost()]),
			},
			replyCandidateRepository,
			googleAiAdapter,
		});

		expect(result.failedThreads).toBe(1);
		expect(result.generatedThreads).toBe(1);
		expect(replyCandidateRepository.saveMany).toHaveBeenCalledTimes(1);
	});

	it("buildHumanMimicUserPrompt はスレッド本文を userPrompt 側に組み立てる", () => {
		const prompt = buildHumanMimicUserPrompt("今日の雑談", [createPost()], {
			random: () => 0,
		});
		expect(prompt).toContain("# Instruction:");
		expect(prompt).toContain("## 1番目のレス");
		expect(prompt).toContain("人格：");
		expect(prompt).not.toContain("[Placeholder]");
		expect(prompt).toContain("スレッドタイトル: 今日の雑談");
		expect(prompt).toContain("[1] 名無しさん ID:AbCd1234");
		expect(prompt).toContain("今日は平和ですね");
	});

	it("parseHumanMimicCandidates は code fence 付き JSON 配列を解釈する", () => {
		const parsed = parseHumanMimicCandidates(
			"```json\n[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\",\"i\",\"j\"]\n```",
		);
		expect(parsed).toHaveLength(10);
		expect(parsed[0]).toBe("a");
	});

	it("parseHumanMimicCandidates は文字列中の生改行を含む JSON 風配列も解釈する", () => {
		const parsed = parseHumanMimicCandidates(
			'["a","1行目\n2行目","c","d","e","f","g","h","i","j"]',
		);
		expect(parsed).toHaveLength(10);
		expect(parsed[1]).toBe("1行目\n2行目");
	});
});
