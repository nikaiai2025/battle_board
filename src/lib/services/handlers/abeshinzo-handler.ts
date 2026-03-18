/**
 * CommandHandler 実装: !abeshinzo（ジョークコマンド）
 *
 * 隠しコマンド（裏技）。実行すると ★システム 名義の独立レスで
 * 「意味のないメッセージだよ」と投稿される。
 *
 * - コスト: 0（無料）
 * - 引数: なし
 * - hidden: true（コマンドヘルプに表示されない）
 */

import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

/**
 * !abeshinzo ハンドラ。
 * 引数不要・副作用なし。固定メッセージを独立システムレスとして返す。
 */
export class AbeshinzoHandler implements CommandHandler {
	readonly commandName = "abeshinzo";

	async execute(_ctx: CommandContext): Promise<CommandHandlerResult> {
		return {
			success: true,
			systemMessage: null,
			eliminationNotice: "意味のないコマンドだよ",
		};
	}
}
