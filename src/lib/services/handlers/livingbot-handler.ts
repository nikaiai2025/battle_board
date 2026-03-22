/**
 * CommandHandler 実装: !livingbot（生存BOT数表示）コマンド
 *
 * See: features/command_livingbot.feature @掲示板全体の生存BOT数がレス内マージで表示される
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2 !livingbot ハンドラ設計
 *
 * !livingbot コマンドの仕様:
 *   - 引数: なし
 *   - 通貨コスト: 5（config/commands.yaml の livingbot.cost）
 *   - 掲示板全体の生存BOT数をインラインで表示する
 *   - コスト消費は CommandService の共通処理で行うため、ハンドラ内での debit は不要
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
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2.2
 */
export interface ILivingBotBotRepository {
	countLivingBots(): Promise<number>;
}

// ---------------------------------------------------------------------------
// LivingBotHandler クラス
// ---------------------------------------------------------------------------

/**
 * !livingbot（生存BOT数表示）ハンドラ。
 *
 * 掲示板全体の生存BOT数をカウントし、インライン表示用のメッセージを返す。
 * 引数なし、コスト消費は CommandService の共通処理で行われる。
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2.3
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
	 * See: features/command_livingbot.feature @掲示板全体の生存BOT数がレス内マージで表示される
	 *
	 * @param ctx - コマンド実行コンテキスト（未使用）
	 * @returns コマンド実行結果（systemMessage に生存BOT数）
	 */
	async execute(_ctx: CommandContext): Promise<CommandHandlerResult> {
		const count = await this.botRepository.countLivingBots();
		return {
			success: true,
			systemMessage: `🤖 掲示板全体の生存BOT: ${count}体`,
		};
	}
}
