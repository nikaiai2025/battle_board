/**
 * RandomThreadBehaviorStrategy — 既存スレッドランダム選択 BehaviorStrategy 実装（Phase 2）
 *
 * 板（boardId）内の既存スレッドからランダムに1件を選択し、
 * { type: 'post_to_existing', threadId } を返す。
 * 荒らし役ボットに適用される BehaviorStrategy の Phase 2 実装。
 *
 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
 * See: docs/architecture/components/bot.md §2.12.3 RandomThreadBehaviorStrategy
 */

import type {
	BehaviorContext,
	BehaviorStrategy,
	BotAction,
	IThreadRepository,
} from "../types";

/**
 * RandomThreadBehaviorStrategy クラス。
 *
 * IThreadRepository から boardId に属するスレッドを取得し、
 * 均等分布でランダムに1件を選択して `post_to_existing` アクションを返す。
 *
 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
 * See: docs/architecture/components/bot.md §2.12.3 RandomThreadBehaviorStrategy
 * See: docs/architecture/components/bot.md §4 > 書き込み先スレッド選択のランダムアルゴリズム
 */
export class RandomThreadBehaviorStrategy implements BehaviorStrategy {
	/**
	 * @param threadRepository - スレッド一覧取得リポジトリ（DI）
	 */
	constructor(private readonly threadRepository: IThreadRepository) {}

	/**
	 * 書き込み先スレッドをランダムに選択して BotAction を返す。
	 *
	 * スレッドが0件の場合はエラーをスローする。
	 *
	 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
	 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
	 *
	 * @param context - 行動コンテキスト（boardId を含む）
	 * @returns { type: 'post_to_existing', threadId } 形式の BotAction
	 * @throws スレッドが0件の場合
	 */
	async decideAction(context: BehaviorContext): Promise<BotAction> {
		const allThreads = await this.threadRepository.findByBoardId(
			context.boardId,
		);

		// 固定スレッドを除外する。BOTが固定スレッドに書き込むとガードで拒否されるため
		// See: features/thread.feature @pinned_thread
		const threads = allThreads.filter((t) => !t.isPinned);

		if (threads.length === 0) {
			// 投稿可能なスレッドなし（全て固定スレッド or スレッド0件）
			return { type: "skip" };
		}

		// 均等分布でランダムに1件選択
		// See: docs/architecture/components/bot.md §4 > 書き込み先スレッド選択のランダムアルゴリズム
		const selected = threads[Math.floor(Math.random() * threads.length)];
		return { type: "post_to_existing", threadId: selected.id };
	}
}
