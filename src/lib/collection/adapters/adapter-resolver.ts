/**
 * adapter-resolver.ts — 収集アダプター解決関数
 *
 * bot_profiles.yaml の collection.adapter フィールドから
 * 対応する CollectionAdapter インスタンスを返す。
 * Phase A では subject_txt のみ実装。Phase B/C で他のアダプターを追加する。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { SubjectTxtAdapter } from "./subject-txt";
import type { CollectionAdapter } from "./types";

/**
 * collection.adapter フィールド値から CollectionAdapter インスタンスを解決する。
 *
 * @param adapterType - bot_profiles.yaml の collection.adapter の値（例: "subject_txt"）
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
		default:
			throw new Error(`未実装の収集アダプター: ${adapterType}`);
	}
}
