/**
 * CommandHandler 実装: !help（案内表示コマンド）
 *
 * 実行すると ★システム 名義の独立レスで
 * 案内板と同一の内容を投稿する。
 *
 * - コスト: 0（無料）
 * - 引数: なし
 *
 * See: features/command_system.feature @help_command
 * See: scripts/upsert-pinned-thread.ts
 */

import { generateAnnouncementBody } from "../../domain/rules/announcement-text";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
	CommandsYaml,
} from "../command-service";

/**
 * !help ハンドラ。
 * コマンド設定から有効・非隠しコマンドを抽出し、案内テキストを生成して独立システムレスとして返す。
 */
export class HelpHandler implements CommandHandler {
	readonly commandName = "help";

	/** 表示対象コマンド一覧（コンストラクタ時に確定。リクエストごとに再計算しない） */
	private readonly visibleCommands: Array<{
		name: string;
		description: string;
		cost: number;
	}>;

	/**
	 * @param commandsConfig - コマンド設定（config/commands.ts から注入）
	 */
	constructor(commandsConfig: CommandsYaml) {
		this.visibleCommands = Object.entries(commandsConfig.commands)
			.filter(([, config]) => config.enabled && !config.hidden)
			.map(([name, config]) => ({
				name,
				description: config.description,
				cost: config.cost,
			}));
	}

	async execute(_ctx: CommandContext): Promise<CommandHandlerResult> {
		const body = generateAnnouncementBody(this.visibleCommands);
		return {
			success: true,
			systemMessage: null,
			eliminationNotice: body,
		};
	}
}
