/**
 * TopicDrivenSchedulingStrategy — キュレーションBOT用 SchedulingStrategy 実装（Phase 3）
 *
 * 720〜1440分（12〜24時間）のランダムな整数（分単位）を返す。
 * FixedIntervalSchedulingStrategy と同一のアルゴリズム（範囲のみ異なる）。
 *
 * See: features/curation_bot.feature @BOTの投稿間隔は12時間〜24時間のランダム間隔である
 * See: docs/architecture/components/bot.md §2.13.3 TopicDrivenSchedulingStrategy
 */

import type { SchedulingContext, SchedulingStrategy } from "../types";

/** デフォルトの最小投稿間隔（分）*/
const DEFAULT_MIN_MINUTES = 720;

/** デフォルトの最大投稿間隔（分）*/
const DEFAULT_MAX_MINUTES = 1440;

/**
 * TopicDrivenSchedulingStrategy クラス。
 *
 * コンストラクタで min/max を指定可能（デフォルト: 720〜1440分、12〜24時間）。
 * getNextPostDelay() は [min, max] の範囲内の整数をランダムで返す。
 *
 * See: features/curation_bot.feature @BOTの投稿間隔は12時間〜24時間のランダム間隔である
 * See: docs/architecture/components/bot.md §2.13.3 TopicDrivenSchedulingStrategy
 */
export class TopicDrivenSchedulingStrategy implements SchedulingStrategy {
	/**
	 * @param minMinutes - 最小投稿間隔（分、デフォルト: 720）
	 * @param maxMinutes - 最大投稿間隔（分、デフォルト: 1440）
	 */
	constructor(
		private readonly minMinutes: number = DEFAULT_MIN_MINUTES,
		private readonly maxMinutes: number = DEFAULT_MAX_MINUTES,
	) {}

	/**
	 * 次回投稿までの遅延時間を分単位で返す。
	 *
	 * [minMinutes, maxMinutes] の範囲内の整数をランダムで返す。
	 * Math.random() は [0, 1) のため、`min + floor(random * (max - min + 1))` で
	 * [min, max] を網羅する。
	 *
	 * See: features/curation_bot.feature @BOTの投稿間隔は12時間〜24時間のランダム間隔である
	 *
	 * @param _context - スケジューリングコンテキスト（固定範囲では未使用）
	 * @returns 次回投稿までの遅延時間（分単位）
	 */
	getNextPostDelay(_context: SchedulingContext): number {
		return (
			this.minMinutes +
			Math.floor(Math.random() * (this.maxMinutes - this.minMinutes + 1))
		);
	}
}
