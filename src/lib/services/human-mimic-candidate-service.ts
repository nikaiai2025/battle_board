/**
 * HumanMimicCandidateService — 人間模倣ボット用 AI 候補生成バッチ。
 *
 * 6時間ごとにアクティブ50スレッドを走査し、未投稿候補が0件のスレッドだけ
 * Gemini API を1回呼び出して 10 件の候補を保存する。
 */

import {
	HUMAN_MIMIC_CANDIDATE_COUNT,
	HUMAN_MIMIC_MODEL_ID,
	HUMAN_MIMIC_SYSTEM_PROMPT,
	buildHumanMimicUserPrompt,
} from "../../../config/human-mimic-prompt";
import { DEFAULT_BOARD_ID } from "../domain/constants";
import type { Post } from "../domain/models/post";
import type { IGoogleAiAdapter } from "../infrastructure/adapters/google-ai-adapter";
import type {
	IReplyCandidateRepository,
	IThreadRepository,
} from "./bot-strategies/types";

const HUMAN_MIMIC_PROFILE_KEY = "human_mimic";
const DEFAULT_ACTIVE_THREAD_LIMIT = 50;
const DEFAULT_GENERATION_CONCURRENCY = 3;
const HUMAN_MIMIC_STRUCTURED_OUTPUT = {
	responseMimeType: "application/json",
	responseSchema: {
		type: "array",
		minItems: HUMAN_MIMIC_CANDIDATE_COUNT,
		maxItems: HUMAN_MIMIC_CANDIDATE_COUNT,
		items: {
			type: "string",
		},
	},
} as const;

export { buildHumanMimicUserPrompt };

export interface IHumanMimicPostRepository {
	findByThreadId(threadId: string): Promise<Post[]>;
}

export interface HumanMimicCandidateBatchResult {
	processedThreads: number;
	generatedThreads: number;
	skippedThreads: number;
	failedThreads: number;
}

export interface RunHumanMimicCandidateBatchDeps {
	threadRepository: IThreadRepository;
	postRepository: IHumanMimicPostRepository;
	replyCandidateRepository: IReplyCandidateRepository;
	googleAiAdapter: IGoogleAiAdapter;
}

function escapeControlCharactersInJsonStrings(input: string): string {
	let result = "";
	let inString = false;
	let isEscaped = false;

	for (const char of input) {
		if (!inString) {
			if (char === "\"") {
				inString = true;
			}
			result += char;
			continue;
		}

		if (isEscaped) {
			result += char;
			isEscaped = false;
			continue;
		}

		if (char === "\\") {
			result += char;
			isEscaped = true;
			continue;
		}

		if (char === "\"") {
			result += char;
			inString = false;
			continue;
		}

		if (char === "\n") {
			result += "\\n";
			continue;
		}

		if (char === "\r") {
			result += "\\r";
			continue;
		}

		if (char === "\t") {
			result += "\\t";
			continue;
		}

		if (char < " ") {
			result += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
			continue;
		}

		result += char;
	}

	return result;
}

export function parseHumanMimicCandidates(rawText: string): string[] {
	const trimmed = rawText.trim();
	const withoutFence = trimmed
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "");
	let parsed: unknown;

	try {
		parsed = JSON.parse(withoutFence);
	} catch (error) {
		const normalized = escapeControlCharactersInJsonStrings(withoutFence);

		if (normalized === withoutFence) {
			throw error;
		}

		parsed = JSON.parse(normalized);
	}

	if (!Array.isArray(parsed)) {
		throw new Error("AI応答が配列ではありません");
	}

	const candidates = parsed
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0)
		.slice(0, HUMAN_MIMIC_CANDIDATE_COUNT);

	if (candidates.length !== HUMAN_MIMIC_CANDIDATE_COUNT) {
		throw new Error(
			`AI応答の候補数が不足しています (${candidates.length}/${HUMAN_MIMIC_CANDIDATE_COUNT})`,
		);
	}

	return candidates;
}

export async function runHumanMimicCandidateBatch(
	deps: RunHumanMimicCandidateBatchDeps,
	options: {
		boardId?: string;
		activeThreadLimit?: number;
		concurrency?: number;
	} = {},
): Promise<HumanMimicCandidateBatchResult> {
	const boardId = options.boardId ?? DEFAULT_BOARD_ID;
	const activeThreadLimit =
		options.activeThreadLimit ?? DEFAULT_ACTIVE_THREAD_LIMIT;
	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_GENERATION_CONCURRENCY);
	const threads = await deps.threadRepository.findByBoardId(boardId, {
		limit: activeThreadLimit,
	});
	const targetThreads = threads.filter((thread) => !thread.isPinned);

	const result: HumanMimicCandidateBatchResult = {
		processedThreads: targetThreads.length,
		generatedThreads: 0,
		skippedThreads: 0,
		failedThreads: 0,
	};

	async function processThread(thread: (typeof targetThreads)[number]) {
		try {
			const existingCount =
				await deps.replyCandidateRepository.countUnpostedByThread(
					HUMAN_MIMIC_PROFILE_KEY,
					thread.id,
				);

			if (existingCount > 0) {
				result.skippedThreads++;
				return;
			}

			const posts = await deps.postRepository.findByThreadId(thread.id);
			const userPrompt = buildHumanMimicUserPrompt(
				thread.title ?? `thread:${thread.id}`,
				posts,
			);
			const aiResult = await deps.googleAiAdapter.generate({
				systemPrompt: HUMAN_MIMIC_SYSTEM_PROMPT,
				userPrompt,
				modelId: HUMAN_MIMIC_MODEL_ID,
				structuredOutput: HUMAN_MIMIC_STRUCTURED_OUTPUT,
			});
			const candidates = parseHumanMimicCandidates(aiResult.text);

			await deps.replyCandidateRepository.saveMany(
				HUMAN_MIMIC_PROFILE_KEY,
				thread.id,
				candidates,
				posts.length,
			);
			result.generatedThreads++;
		} catch (err) {
			result.failedThreads++;
			console.error(
				`[HumanMimicCandidateService] 候補生成失敗 threadId=${thread.id}`,
				err,
			);
		}
	}

	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, targetThreads.length) },
		() =>
			(async () => {
				while (cursor < targetThreads.length) {
					const thread = targetThreads[cursor];
					cursor++;
					await processThread(thread);
				}
			})(),
	);

	await Promise.all(workers);

	return result;
}

export function createHumanMimicCandidateBatchRunner(
	deps: RunHumanMimicCandidateBatchDeps,
) {
	return {
		run: (options?: {
			boardId?: string;
			activeThreadLimit?: number;
			concurrency?: number;
		}) =>
			runHumanMimicCandidateBatch(deps, options),
	};
}
