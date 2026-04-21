/**
 * インメモリ ReplyCandidateRepository
 */

import type {
	IReplyCandidateRepository,
	ReplyCandidate,
} from "../../../src/lib/services/bot-strategies/types";
import { assertUUID } from "./assert-uuid";

const store: ReplyCandidate[] = [];

export function reset(): void {
	store.length = 0;
}

export function _getAll(): ReplyCandidate[] {
	return [...store];
}

export function _seed(
	record: Omit<ReplyCandidate, "id" | "createdAt"> & {
		id?: string;
		createdAt?: Date;
	},
): ReplyCandidate {
	const item: ReplyCandidate = {
		id: record.id ?? crypto.randomUUID(),
		createdAt: record.createdAt ?? new Date(),
		...record,
	};
	store.push(item);
	return item;
}

export const InMemoryReplyCandidateRepo: IReplyCandidateRepository = {
	async countUnpostedByThread(
		botProfileKey: string,
		threadId: string,
	): Promise<number> {
		return store.filter(
			(item) =>
				item.botProfileKey === botProfileKey &&
				item.threadId === threadId &&
				item.postedAt === null,
		).length;
	},

	async saveMany(
		botProfileKey: string,
		threadId: string,
		bodies: string[],
		generatedFromPostCount: number,
	): Promise<void> {
		for (const body of bodies) {
			store.push({
				id: crypto.randomUUID(),
				botProfileKey,
				threadId,
				body,
				generatedFromPostCount,
				postedPostId: null,
				postedAt: null,
				createdAt: new Date(),
			});
		}
	},

	async findThreadIdsWithUnpostedCandidates(
		botProfileKey: string,
		threadIds: string[],
	): Promise<string[]> {
		return [
			...new Set(
				store
					.filter(
						(item) =>
							item.botProfileKey === botProfileKey &&
							threadIds.includes(item.threadId) &&
							item.postedAt === null,
					)
					.map((item) => item.threadId),
			),
		];
	},

	async findOldestUnpostedByThread(
		botProfileKey: string,
		threadId: string,
	): Promise<{ id: string; threadId: string; body: string } | null> {
		const item = [...store]
			.filter(
				(candidate) =>
					candidate.botProfileKey === botProfileKey &&
					candidate.threadId === threadId &&
					candidate.postedAt === null,
			)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

		if (!item) return null;
		return { id: item.id, threadId: item.threadId, body: item.body };
	},

	async findById(
		candidateId: string,
	): Promise<{ id: string; threadId: string; body: string } | null> {
		assertUUID(candidateId, "InMemoryReplyCandidateRepo.findById.candidateId");
		const item = store.find((candidate) => candidate.id === candidateId);
		return item
			? { id: item.id, threadId: item.threadId, body: item.body }
			: null;
	},

	async markAsPosted(
		candidateId: string,
		postId: string,
		postedAt: Date,
	): Promise<boolean> {
		assertUUID(
			candidateId,
			"InMemoryReplyCandidateRepo.markAsPosted.candidateId",
		);
		const item = store.find((candidate) => candidate.id === candidateId);
		if (!item || item.postedAt !== null) {
			return false;
		}

		item.postedAt = postedAt;
		item.postedPostId = postId;
		return true;
	},
};
