/**
 * CollectedTopicRepository — collected_topics テーブルへの CRUD 操作
 *
 * collected_topics テーブルは RLS により anon/authenticated ロールからの
 * 全操作を拒否している。supabaseAdmin（service_role キー）を使用して
 * RLS をバイパスする。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §5.5 collected_topics
 * See: supabase/migrations/00034_curation_bot.sql
 */

import type {
	CollectedItem,
	CollectedTopic,
	ICollectedTopicRepository,
} from "../../services/bot-strategies/types";
import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** collected_topics テーブルの生レコード型 */
interface CollectedTopicRow {
	id: string;
	source_bot_id: string;
	article_title: string;
	content: string | null;
	source_url: string;
	buzz_score: number;
	is_posted: boolean;
	posted_at: string | null;
	collected_date: string;
	created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメインモデル 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToCollectedTopic(row: CollectedTopicRow): CollectedTopic {
	return {
		id: row.id,
		articleTitle: row.article_title,
		content: row.content,
		sourceUrl: row.source_url,
		buzzScore: Number(row.buzz_score),
		collectedDate: row.collected_date,
	};
}

// ---------------------------------------------------------------------------
// ICollectedTopicRepository 実装
// ---------------------------------------------------------------------------

/**
 * Supabase 実装の CollectedTopicRepository。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §5.5
 */
export const collectedTopicRepository: ICollectedTopicRepository = {
	/**
	 * 収集結果を一括 INSERT する。
	 * 同一 (source_bot_id, collected_date, source_url) が既に存在する場合はスキップ。
	 * 空配列の場合は何もしない。
	 *
	 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
	 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
	 */
	async save(
		items: CollectedItem[],
		botId: string,
		collectedDate: string,
	): Promise<void> {
		if (items.length === 0) return;

		const rows = items.map((item) => ({
			source_bot_id: botId,
			article_title: item.articleTitle,
			content: item.content,
			source_url: item.sourceUrl,
			buzz_score: item.buzzScore,
			collected_date: collectedDate,
		}));

		const { error } = await supabaseAdmin
			.from("collected_topics")
			.upsert(rows, {
				onConflict: "source_bot_id,collected_date,source_url",
				ignoreDuplicates: true,
			});

		if (error) {
			throw new Error(
				`CollectedTopicRepository.save: INSERT に失敗しました: ${error.message}`,
			);
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
		const { data, error } = await supabaseAdmin
			.from("collected_topics")
			.select("*")
			.eq("source_bot_id", botId)
			.eq("collected_date", date)
			.eq("is_posted", false)
			.order("buzz_score", { ascending: false });

		if (error) {
			throw new Error(
				`CollectedTopicRepository.findUnpostedByBotId: クエリに失敗しました: ${error.message}`,
			);
		}

		return (data as CollectedTopicRow[]).map(rowToCollectedTopic);
	},

	/**
	 * 指定トピックを投稿済みにマークする。
	 * is_posted = true, posted_at = postedAt に更新する。
	 *
	 * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
	 */
	async markAsPosted(topicId: string, postedAt: Date): Promise<void> {
		const { error } = await supabaseAdmin
			.from("collected_topics")
			.update({
				is_posted: true,
				posted_at: postedAt.toISOString(),
			})
			.eq("id", topicId);

		if (error) {
			throw new Error(
				`CollectedTopicRepository.markAsPosted: UPDATE に失敗しました: ${error.message}`,
			);
		}
	},
};
