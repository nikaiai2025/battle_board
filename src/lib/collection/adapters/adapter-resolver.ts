/**
 * adapter-resolver.ts — 収集アダプター解決関数
 *
 * bot_profiles.yaml の collection.adapter フィールドから
 * 対応する CollectionAdapter インスタンスを返す。
 * Phase A: subject_txt（5ch系 subject.txt）
 * Phase B: wikipedia（Wikimedia pageviews top API 日次急上昇）
 * Phase C 以降: 残りのソースを順次追加
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { SubjectTxtAdapter } from "./subject-txt";
import type { CollectionAdapter } from "./types";
import { WikipediaAdapter } from "./wikipedia";

/**
 * collection.adapter フィールド値から CollectionAdapter インスタンスを解決する。
 *
 * @param adapterType - bot_profiles.yaml の collection.adapter の値（例: "subject_txt", "wikipedia"）
 * @throws 未実装のアダプター種別が指定された場合
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 */
export function resolveCollectionAdapter(
	adapterType: string,
): CollectionAdapter {
	switch (adapterType) {
		case "subject_txt":
			return new SubjectTxtAdapter();
		case "wikipedia":
			return new WikipediaAdapter();
		default:
			throw new Error(`未実装の収集アダプター: ${adapterType}`);
	}
}
