/**
 * CommandHandler 実装: !iamsystem（ステルスでシステム偽装）
 *
 * 投稿の表示名を「★システム」、IDを「SYSTEM」に変更する。
 * 見た目はシステムメッセージだが、実体は人間の投稿のまま。
 * is_system_message は false を維持する（PostFieldOverrides による上書きのみ）。
 *
 * - コスト: 5
 * - ステルス: true（コマンド文字列は本文から除去される）
 * - 引数: なし
 *
 * See: features/command_iamsystem.feature
 * See: docs/architecture/components/command.md S5 ステルスコマンドの設計原則
 */

import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

/**
 * !iamsystem ハンドラ。
 * 引数不要・副作用なし。postFieldOverrides で表示名とdailyIdの上書きを指示する。
 * 通貨チェックは CommandService の共通処理（Step 3-4）で完了済みのため、
 * ハンドラは常に success: true を返す。
 *
 * See: features/command_iamsystem.feature @成功時に表示名とIDがシステム風に変更される
 */
export class IamsystemHandler implements CommandHandler {
	readonly commandName = "iamsystem";

	async execute(_ctx: CommandContext): Promise<CommandHandlerResult> {
		// ステルスコマンドはインラインメッセージを出さない
		// See: features/command_iamsystem.feature @成功時にコマンド文字列が投稿本文から除去される
		return {
			success: true,
			systemMessage: null,
			postFieldOverrides: {
				displayName: "★システム",
				dailyId: "SYSTEM",
			},
		};
	}
}
