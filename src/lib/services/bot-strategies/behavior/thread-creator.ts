/**
 * ThreadCreatorBehaviorStrategy — キュレーションBOT用 BehaviorStrategy 実装（Phase 3）
 *
 * collected_topics から未投稿のアイテムをランダムに1件選択し、
 * { type: 'create_thread', title, body, _selectedTopicId } を返す。
 * 候補がなければ { type: 'skip' } を返す。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { getJstDateString } from "../../../domain/rules/jst-date";
import type {
	BehaviorContext,
	BehaviorStrategy,
	BotAction,
	CollectedTopic,
	ICollectedTopicRepository,
} from "../types";

/**
 * >>1 の本文をフォーマットする。
 * - 投稿内容あり: `{content}\n\n元ネタ: {source_url}`
 * - 投稿内容なし: `{source_url}`
 *
 * See: docs/architecture/components/bot.md §2.13.5 >>1 の本文フォーマット
 */
export function formatBody(topic: CollectedTopic): string {
	if (topic.content) {
		return `${topic.content}\n\n元ネタ: ${topic.sourceUrl}`;
	}
	return topic.sourceUrl;
}

/**
 * ThreadCreatorBehaviorStrategy クラス。
 *
 * 処理フロー:
 *   1. 今日の JST 日付を算出
 *   2. collectedTopicRepo から当日の未投稿アイテムを取得
 *   3. 当日候補が 0件 → 前日の未投稿アイテムを取得（フォールバック）
 *   4. それでも 0件 → { type: 'skip' } を返す
 *   5. ランダムに1件選択 → { type: 'create_thread', title, body, _selectedTopicId } を返す
 *
 * 注意: markAsPosted は decideAction 内では呼ばない。
 * createThread 成功後に executeBotPost() 側で呼び出す。
 * これにより createThread 失敗時の「投稿していないのに投稿済み」の不整合を防ぐ。
 *
 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
 * See: features/curation_bot.feature @蓄積データが存在しない場合は投稿をスキップする
 * See: docs/architecture/components/bot.md §2.13.5
 */
export class ThreadCreatorBehaviorStrategy implements BehaviorStrategy {
	/**
	 * @param collectedTopicRepo - 収集トピックリポジトリ（DI）
	 */
	constructor(private readonly collectedTopicRepo: ICollectedTopicRepository) {}

	/**
	 * 収集トピックから投稿先を決定して BotAction を返す。
	 *
	 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
	 * See: features/curation_bot.feature @当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする
	 * See: features/curation_bot.feature @蓄積データが存在しない場合は投稿をスキップする
	 *
	 * @param context - 行動コンテキスト（botId を含む）
	 * @returns create_thread アクション（候補あり）または skip アクション（候補なし）
	 */
	async decideAction(context: BehaviorContext): Promise<BotAction> {
		const now = new Date(Date.now());
		const todayJst = getJstDateString(now);
		const yesterdayJst = getJstDateString(
			new Date(Date.now() - 24 * 60 * 60 * 1000),
		);

		// 1. 当日の未投稿アイテムを検索
		let candidates = await this.collectedTopicRepo.findUnpostedByBotId(
			context.botId,
			todayJst,
		);

		// 2. 当日に候補がなければ前日にフォールバック
		// See: features/curation_bot.feature @当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする
		if (candidates.length === 0) {
			candidates = await this.collectedTopicRepo.findUnpostedByBotId(
				context.botId,
				yesterdayJst,
			);
		}

		// 3. それでもなければ skip
		// See: features/curation_bot.feature @蓄積データが存在しない場合は投稿をスキップする
		if (candidates.length === 0) {
			return { type: "skip" };
		}

		// 4. ランダムに1件選択
		const selected = candidates[Math.floor(Math.random() * candidates.length)];

		// 5. body フォーマット
		const body = formatBody(selected);

		// _selectedTopicId を BotAction に含めて返す。
		// executeBotPost() の createThread 成功後に markAsPosted を呼び出すために使用する。
		// See: docs/architecture/components/bot.md §2.13.5 markAsPosted の遅延呼び出し
		return {
			type: "create_thread",
			title: selected.articleTitle,
			body,
			_selectedTopicId: selected.id,
		};
	}
}
