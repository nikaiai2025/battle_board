/**
 * ImmediateSchedulingStrategy — 即時投稿 SchedulingStrategy 実装（Phase C）
 *
 * delay = 0（即時投稿）を返す。
 * チュートリアルBOTはスポーン後に1回のみ書き込みを行うため、
 * 次回投稿間隔として 0 を返すことで「次回投稿なし」を表現する。
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 ImmediateSchedulingStrategy
 */

import type { SchedulingContext, SchedulingStrategy } from "../types";

/**
 * ImmediateSchedulingStrategy クラス。
 *
 * getNextPostDelay() は常に 0 を返す。
 * チュートリアルBOTは1回のみ書き込むため、next_post_at は現在時刻 + 0分 = 現在時刻となる。
 * 実際には 1回書き込み後に次の処理は行われないため、delay の値は実質的に意味を持たない。
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 ImmediateSchedulingStrategy
 */
export class ImmediateSchedulingStrategy implements SchedulingStrategy {
	/**
	 * 次回書き込みまでの遅延時間を返す。
	 *
	 * チュートリアルBOTは即時投稿のため、常に 0 を返す。
	 *
	 * @param _context - スケジューリングコンテキスト（即時投稿では未使用）
	 * @returns 0（即時投稿）
	 */
	getNextPostDelay(_context: SchedulingContext): number {
		return 0; // 即時投稿。チュートリアルBOTは1回のみ書き込むため delay 不要
	}
}
