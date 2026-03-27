/**
 * NoOpContentStrategy — create_thread 時の ContentStrategy プレースホルダ
 *
 * create_thread アクションでは BehaviorStrategy が title/body を包括するため、
 * ContentStrategy.generateContent() は呼び出されないはずである。
 * 万一呼び出された場合はエラーをスローする（安全策）。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.3
 */

import type { ContentGenerationContext, ContentStrategy } from "../types";

/**
 * NoOpContentStrategy クラス。
 *
 * キュレーションBOT（create_thread）では ContentStrategy は使用されないため、
 * 呼び出された場合はエラーをスローする。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.3
 */
export class NoOpContentStrategy implements ContentStrategy {
	/**
	 * このメソッドは呼び出されることを想定していない。
	 * create_thread では BehaviorStrategy が body を包括するため、
	 * ContentStrategy は使用されない。
	 *
	 * @throws Error 常にエラーをスロー
	 */
	async generateContent(_context: ContentGenerationContext): Promise<string> {
		throw new Error(
			"NoOpContentStrategy.generateContent: create_thread では ContentStrategy は使用されません",
		);
	}
}
