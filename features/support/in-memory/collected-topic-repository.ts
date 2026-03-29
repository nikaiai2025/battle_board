/**
 * インメモリ CollectedTopicRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * collected-topic-repository.ts と同一の ICollectedTopicRepository を満たす。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type {
	CollectedItem,
	CollectedTopic,
	ICollectedTopicRepository,
} from "../../../src/lib/services/bot-strategies/types";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/**
 * InMemory ストアの内部型。
 * CollectedTopic を拡張し、投稿管理フィールドを追加する。
 * BehaviorStrategy が受け取る CollectedTopic 型には投稿管理フィールドは不要のため分離する。
 */
interface InMemoryCollectedTopicRecord extends CollectedTopic {
	sourceBotId: string;
	isPosted: boolean;
	postedAt: Date | null;
}

/** シナリオ間でリセットされるストア */
const store: InMemoryCollectedTopicRecord[] = [];

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * ストアを初期化する（Before フックから呼び出す）。
 * See: features/curation_bot.feature
 */
export function reset(): void {
	store.length = 0;
}

/**
 * テスト用: ストアの全データを返す。
 * Then ステップでの検証に使用する。
 */
export function _getAll(): InMemoryCollectedTopicRecord[] {
	return [...store];
}

/**
 * テスト用: 任意のデータをストアに直接追加する。
 * Given ステップでの前提条件セットアップに使用する。
 *
 * @param topic - 追加するトピックレコード（sourceBotId, isPosted, postedAt を含む）
 */
export function _seed(topic: InMemoryCollectedTopicRecord): void {
	store.push(topic);
}

// ---------------------------------------------------------------------------
// ICollectedTopicRepository 実装
// ---------------------------------------------------------------------------

/**
 * ICollectedTopicRepository の InMemory 実装。
 * Supabase に依存しないため BDD テストで使用する。
 *
 * See: features/curation_bot.feature
 */
export const InMemoryCollectedTopicRepo: ICollectedTopicRepository = {
	/**
	 * 収集結果を保存する。
	 * 同一 (botId, collectedDate, sourceUrl) が既に存在する場合はスキップ（ON CONFLICT DO NOTHING 相当）。
	 *
	 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
	 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
	 */
	async save(
		items: CollectedItem[],
		botId: string,
		collectedDate: string,
	): Promise<void> {
		assertUUID(botId, "InMemoryCollectedTopicRepo.save.botId");

		for (const item of items) {
			// 同一 (botId, collectedDate, sourceUrl) が既に存在する場合はスキップ
			const exists = store.some(
				(t) =>
					t.sourceBotId === botId &&
					t.collectedDate === collectedDate &&
					t.sourceUrl === item.sourceUrl,
			);
			if (exists) continue;

			store.push({
				id: crypto.randomUUID(),
				articleTitle: item.articleTitle,
				sourceUrl: item.sourceUrl,
				buzzScore: item.buzzScore,
				collectedDate,
				sourceBotId: botId,
				isPosted: false,
				postedAt: null,
			});
		}
	},

	/**
	 * 指定BOT・指定日の未投稿候補を buzz_score 降順で取得する。
	 *
	 * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
	 */
	async findUnpostedByBotId(
		botId: string,
		date: string,
	): Promise<CollectedTopic[]> {
		assertUUID(botId, "InMemoryCollectedTopicRepo.findUnpostedByBotId.botId");

		return store
			.filter(
				(t) =>
					t.sourceBotId === botId && t.collectedDate === date && !t.isPosted,
			)
			.sort((a, b) => b.buzzScore - a.buzzScore)
			.map(
				({
					sourceBotId: _sourceBotId,
					isPosted: _isPosted,
					postedAt: _postedAt,
					...topic
				}) => topic,
			);
	},

	/**
	 * 指定トピックを投稿済みにマークする。
	 *
	 * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
	 */
	async markAsPosted(topicId: string, postedAt: Date): Promise<void> {
		assertUUID(topicId, "InMemoryCollectedTopicRepo.markAsPosted.topicId");

		const topic = store.find((t) => t.id === topicId);
		if (topic) {
			topic.isPosted = true;
			topic.postedAt = postedAt;
		}
	},
};
