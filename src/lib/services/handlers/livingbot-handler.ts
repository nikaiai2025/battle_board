/**
 * CommandHandler 実装: !livingbot（生存BOT数表示）コマンド
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2, §6
 *
 * !livingbot コマンドの仕様:
 *   - 引数: なし
 *   - 通貨コスト: 5（config/commands.yaml の livingbot.cost）
 *   - 掲示板全体の生存BOT数とスレッド内の生存BOT数をインラインで表示する
 *   - コスト消費は CommandService の共通処理で行うため、ハンドラ内での debit は不要
 *
 * v2変更: スレッド内カウントを追加。ctx.threadId を使用して両カウントを取得する。
 * 出力フォーマット: 🤖 生存BOT — 掲示板全体: {boardCount}体 / このスレッド: {threadCount}体
 */

import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * LivingBotHandler が使用する BotRepository のインターフェース。
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2.2, §6.4
 */
export interface ILivingBotBotRepository {
	countLivingBots(): Promise<number>;
	/** v2追加: スレッド内の生存BOT数をカウントする */
	countLivingBotsInThread(threadId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// LivingBotHandler クラス
// ---------------------------------------------------------------------------

/**
 * !livingbot（生存BOT数表示）ハンドラ。
 *
 * 掲示板全体の生存BOT数とスレッド内の生存BOT数をカウントし、
 * インライン表示用のメッセージを返す。
 * 引数なし、コスト消費は CommandService の共通処理で行われる。
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2.3, §6.5
 */
export class LivingBotHandler implements CommandHandler {
	/** コマンド名（! を除いた名前） */
	readonly commandName = "livingbot";

	/**
	 * @param botRepository - 生存BOTカウント取得（DI）
	 */
	constructor(private readonly botRepository: ILivingBotBotRepository) {}

	/**
	 * !livingbot コマンドを実行する。
	 *
	 * ctx.threadId を使用して掲示板全体とスレッド内の両カウントを取得し、
	 * v2フォーマットで返す。
	 *
	 * See: features/command_livingbot.feature @掲示板全体とスレッド内の生存BOT数がマージ表示される
	 *
	 * @param ctx - コマンド実行コンテキスト（threadId を使用）
	 * @returns コマンド実行結果（systemMessage に生存BOT数）
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		const boardCount = await this.botRepository.countLivingBots();
		const threadCount = await this.botRepository.countLivingBotsInThread(
			ctx.threadId,
		);
		return {
			success: true,
			systemMessage: `🤖 生存BOT — 掲示板全体: ${boardCount}体 / このスレッド: ${threadCount}体`,
		};
	}
}
