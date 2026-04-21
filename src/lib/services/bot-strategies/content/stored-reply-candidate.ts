/**
 * StoredReplyCandidateContentStrategy — 保存済み reply_candidates を返す ContentStrategy。
 *
 * 人間模倣ボットは投稿時に AI API を呼ばず、BehaviorStrategy が選択した候補IDを
 * もとに保存済み本文を返す。
 */

import type {
	ContentGenerationContext,
	ContentStrategy,
	IReplyCandidateRepository,
} from "../types";

export class StoredReplyCandidateContentStrategy implements ContentStrategy {
	constructor(
		private readonly replyCandidateRepository: IReplyCandidateRepository,
	) {}

	async generateContent(context: ContentGenerationContext): Promise<string> {
		if (!context.selectedReplyCandidateId) {
			throw new Error(
				"StoredReplyCandidateContentStrategy: selectedReplyCandidateId が未設定です",
			);
		}

		const candidate = await this.replyCandidateRepository.findById(
			context.selectedReplyCandidateId,
		);

		if (!candidate) {
			throw new Error(
				`StoredReplyCandidateContentStrategy: 候補が見つかりません (candidateId=${context.selectedReplyCandidateId})`,
			);
		}

		return candidate.body;
	}
}
