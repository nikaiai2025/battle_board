/**
 * CommandHandler 実装: !aori（煽りBOT召喚）
 *
 * 同期フェーズでは pending_async_commands に INSERT するのみ。
 * 煽り BOT のスポーン・書き込みは Cron フェーズ（BotService.processAoriCommands）で実行する。
 *
 * - コスト: 10
 * - ステルス: true（コマンド文字列は本文から除去される）
 * - 引数: >>N（対象レス番号）
 *
 * See: features/command_aori.feature
 * See: docs/architecture/components/command.md S5 非同期副作用のキューイングパターン
 */

import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// DI インターフェース
// ---------------------------------------------------------------------------

/**
 * AoriHandler が使用する PendingAsyncCommandRepository の DI インターフェース。
 * See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
 */
export interface IAoriPendingRepository {
	create(params: {
		commandType: string;
		threadId: string;
		targetPostNumber: number;
		invokerUserId: string;
		payload?: Record<string, unknown> | null;
	}): Promise<void>;
}

// ---------------------------------------------------------------------------
// AoriHandler クラス
// ---------------------------------------------------------------------------

/**
 * !aori ハンドラ。
 * pending_async_commands に INSERT し、ステルス成功を返す。
 * 通貨チェックは CommandService の共通処理（Step 3-4）で完了済みのため、
 * ハンドラは pending INSERT とバリデーションのみを担当する。
 *
 * See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
 */
export class AoriHandler implements CommandHandler {
	readonly commandName = "aori";

	constructor(private readonly pendingRepository: IAoriPendingRepository) {}

	/**
	 * !aori コマンドを実行する。
	 *
	 * 処理フロー:
	 *   1. 引数から target_post_number を取得・バリデーション
	 *   2. pending_async_commands に INSERT
	 *   3. ステルス成功を返す（systemMessage: null でインライン出力なし）
	 *
	 * See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// Step 1: 引数から target_post_number を取得
		// rawArgs を使用する（PostNumberResolver 解決前の元の >>N 形式）。
		// args は UUID に解決されるが、pending_async_commands には postNumber が必要。
		// See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
		const targetArg = (ctx.rawArgs ?? ctx.args)[0]; // ">>5" 形式（解決前）
		if (!targetArg) {
			return {
				success: false,
				systemMessage: "対象レスを指定してください（例: !aori >>5）",
			};
		}

		const postNumber = parseInt(targetArg.replace(">>", ""), 10);
		if (isNaN(postNumber) || postNumber <= 0) {
			return {
				success: false,
				systemMessage: "無効なレス番号です",
			};
		}

		// Step 2: pending_async_commands に INSERT
		await this.pendingRepository.create({
			commandType: "aori",
			threadId: ctx.threadId,
			targetPostNumber: postNumber,
			invokerUserId: ctx.userId,
		});

		// Step 3: ステルス成功を返す（systemMessage: null でインライン出力なし）
		// See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
		return {
			success: true,
			systemMessage: null,
		};
	}
}
