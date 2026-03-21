/**
 * TutorialBehaviorStrategy — チュートリアルBOT用 BehaviorStrategy 実装（Phase C）
 *
 * チュートリアルBOTの書き込み先スレッドを決定する。
 * context.tutorialThreadId を使用して固定スレッドへの書き込みを返す。
 *
 * 荒らし役の RandomThreadBehaviorStrategy と異なり、スポーン時に指定された
 * スレッド（pending_tutorials.thread_id）に固定で書き込む。
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 TutorialBehaviorStrategy
 */

import type { BehaviorContext, BehaviorStrategy, BotAction } from "../types";

/**
 * TutorialBehaviorStrategy クラス。
 *
 * context.tutorialThreadId を使用して `post_to_existing` アクションを返す。
 * tutorialThreadId が未設定の場合はエラーをスローする。
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 TutorialBehaviorStrategy
 */
export class TutorialBehaviorStrategy implements BehaviorStrategy {
	/**
	 * チュートリアルBOTの書き込み先を決定する。
	 *
	 * @param context - 行動コンテキスト（tutorialThreadId を含む）
	 * @returns { type: 'post_to_existing', threadId } 形式の BotAction
	 * @throws tutorialThreadId が未設定の場合
	 */
	async decideAction(context: BehaviorContext): Promise<BotAction> {
		// tutorialThreadId はスポーン時に BehaviorContext に設定される
		if (!context.tutorialThreadId) {
			throw new Error(
				`TutorialBehaviorStrategy.decideAction: tutorialThreadId が未設定です (botId=${context.botId})`,
			);
		}
		// threadId は TutorialBotSpawner から直接渡される
		return { type: "post_to_existing", threadId: context.tutorialThreadId };
	}
}
