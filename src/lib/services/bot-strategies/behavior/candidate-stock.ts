/**
 * CandidateStockBehaviorStrategy — 人間模倣ボット用 BehaviorStrategy。
 *
 * 直近アクティブ50スレッドのうち、未投稿候補が存在するスレッドだけを母集団とし、
 * ランダムに1件選択する。選ばれたスレッドでは最古の未投稿候補を返す。
 */

import type {
	BehaviorContext,
	BehaviorStrategy,
	BotAction,
	IReplyCandidateRepository,
	IThreadRepository,
} from "../types";

const DEFAULT_ACTIVE_THREAD_LIMIT = 50;

export class CandidateStockBehaviorStrategy implements BehaviorStrategy {
	constructor(
		private readonly threadRepository: IThreadRepository,
		private readonly replyCandidateRepository: IReplyCandidateRepository,
		private readonly activeThreadLimit = DEFAULT_ACTIVE_THREAD_LIMIT,
	) {}

	async decideAction(context: BehaviorContext): Promise<BotAction> {
		if (!context.botProfileKey) {
			return { type: "skip" };
		}

		const activeThreads = await this.threadRepository.findByBoardId(
			context.boardId,
			{ limit: this.activeThreadLimit },
		);
		const selectableThreadIds = activeThreads
			.filter((thread) => !thread.isPinned)
			.map((thread) => thread.id);

		if (selectableThreadIds.length === 0) {
			return { type: "skip" };
		}

		const threadIdsWithCandidates =
			await this.replyCandidateRepository.findThreadIdsWithUnpostedCandidates(
				context.botProfileKey,
				selectableThreadIds,
			);

		if (threadIdsWithCandidates.length === 0) {
			return { type: "skip" };
		}

		const selectedThreadId =
			threadIdsWithCandidates[
				Math.floor(Math.random() * threadIdsWithCandidates.length)
			];
		const candidate =
			await this.replyCandidateRepository.findOldestUnpostedByThread(
				context.botProfileKey,
				selectedThreadId,
			);

		if (!candidate) {
			return { type: "skip" };
		}

		return {
			type: "post_to_existing",
			threadId: selectedThreadId,
			_selectedReplyCandidateId: candidate.id,
		};
	}
}
