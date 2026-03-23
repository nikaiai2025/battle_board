/**
 * TutorialContentStrategy — チュートリアルBOT用 ContentStrategy 実装（Phase C）
 *
 * チュートリアルBOTの書き込み本文を生成する。
 * トリガーとなったレス番号を含むアンカー付きの !w コマンド付き文字列を返す。
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 TutorialContentStrategy
 */

import type { ContentGenerationContext, ContentStrategy } from "../types";

/**
 * TutorialContentStrategy クラス。
 *
 * context.tutorialTargetPostNumber を使用して
 * `>>N !w\n新参おるやん🤣` 形式の本文を生成する。
 *
 * tutorialTargetPostNumber が未設定の場合は 1 をデフォルトとして使用する。
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 TutorialContentStrategy
 */
export class TutorialContentStrategy implements ContentStrategy {
	/**
	 * チュートリアルBOT用の本文を生成する。
	 *
	 * @param context - コンテンツ生成コンテキスト（tutorialTargetPostNumber を含む）
	 * @returns `>>N !w\n新参おるやん🤣` 形式の文字列
	 */
	async generateContent(context: ContentGenerationContext): Promise<string> {
		// context からターゲットのレス番号を取得（未設定の場合は 1 をデフォルトとする）
		const targetPostNumber = context.tutorialTargetPostNumber ?? 1;
		return `>>${targetPostNumber} !w\n新参おるやん🤣`;
	}
}
