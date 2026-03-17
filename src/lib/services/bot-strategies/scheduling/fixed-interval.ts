/**
 * FixedIntervalSchedulingStrategy — 固定間隔 SchedulingStrategy 実装（Phase 2）
 *
 * 60〜120分のランダムな整数（分単位）を返す。
 * 一斉書き込みによるBOT発覚を防ぐため、同一タイミングでの書き込みを避ける。
 * 荒らし役ボットに適用される SchedulingStrategy の Phase 2 実装。
 *
 * See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
 * See: docs/architecture/components/bot.md §2.1 書き込み実行（GitHub Actionsから呼び出し）
 * See: docs/architecture/components/bot.md §2.12.3 FixedIntervalSchedulingStrategy
 */

import type { SchedulingContext, SchedulingStrategy } from "../types";

/** デフォルトの最小書き込み間隔（分）*/
const DEFAULT_MIN_MINUTES = 60;

/** デフォルトの最大書き込み間隔（分）*/
const DEFAULT_MAX_MINUTES = 120;

/**
 * FixedIntervalSchedulingStrategy クラス。
 *
 * コンストラクタで min/max を指定可能（デフォルト: 60〜120分）。
 * getNextPostDelay() は [min, max] の範囲内の整数をランダムで返す。
 *
 * See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
 * See: docs/architecture/components/bot.md §2.12.3 FixedIntervalSchedulingStrategy
 */
export class FixedIntervalSchedulingStrategy implements SchedulingStrategy {
	/**
	 * @param minMinutes - 最小書き込み間隔（分、デフォルト: 60）
	 * @param maxMinutes - 最大書き込み間隔（分、デフォルト: 120）
	 */
	constructor(
		private readonly minMinutes: number = DEFAULT_MIN_MINUTES,
		private readonly maxMinutes: number = DEFAULT_MAX_MINUTES,
	) {}

	/**
	 * 次回書き込みまでの遅延時間を分単位で返す。
	 *
	 * [minMinutes, maxMinutes] の範囲内の整数をランダムで返す。
	 * Math.random() は [0, 1) のため、`min + floor(random * (max - min + 1))` で
	 * [min, max] を網羅する。
	 *
	 * See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行（GitHub Actionsから呼び出し）
	 *
	 * @param _context - スケジューリングコンテキスト（固定間隔では未使用）
	 * @returns 次回書き込みまでの遅延時間（分単位）
	 */
	getNextPostDelay(_context: SchedulingContext): number {
		return (
			this.minMinutes +
			Math.floor(Math.random() * (this.maxMinutes - this.minMinutes + 1))
		);
	}
}
