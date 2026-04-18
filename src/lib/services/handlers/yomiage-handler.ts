/**
 * CommandHandler 実装: !yomiage（指定レス音声化）
 *
 * 同期フェーズでは対象レスの事前検証を行い、pending_async_commands に INSERT するのみ。
 * Gemini TTS 呼び出し・音声処理・URL 配布は GH Actions（yomiage-worker.ts）で非同期実行する。
 *
 * - コスト: 30
 * - ステルス: false（コマンド文字列は本文に残る）
 * - 引数: >>N（必須）
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/yomiage.md §4
 */

import { YOMIAGE_MODEL_ID } from "../../../../config/yomiage";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

/**
 * YomiageHandler が使用する PendingAsyncCommandRepository の DI インターフェース。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 */
export interface IYomiagePendingRepository {
	create(params: {
		commandType: string;
		threadId: string;
		targetPostNumber: number;
		invokerUserId: string;
		payload?: Record<string, unknown> | null;
	}): Promise<void>;
}

/**
 * YomiageHandler がターゲットバリデーションに使用するレス情報取得インターフェース。
 *
 * See: features/command_yomiage.feature @削除済みレスを対象に指定するとエラーになる
 * See: features/command_yomiage.feature @システムメッセージを対象に指定するとエラーになる
 */
export interface IYomiagePostRepository {
	findPostByNumber(
		threadId: string,
		postNumber: number,
	): Promise<YomiageTargetPost | null>;
}

/**
 * ターゲットバリデーションに必要なレス情報。
 *
 * See: features/command_yomiage.feature
 */
export interface YomiageTargetPost {
	isDeleted: boolean;
	isSystemMessage: boolean;
}

/**
 * rawArgs から対象レス番号を抽出する。
 * preValidate では不正入力を null として扱い、execute はこの値が妥当である前提で使用する。
 *
 * See: features/command_yomiage.feature @対象レスを指定しないとエラーになる
 */
function parseTargetPostNumber(rawArg: string | undefined): number | null {
	if (!rawArg) {
		return null;
	}

	const postNumber = Number.parseInt(rawArg.replace(">>", ""), 10);
	if (Number.isNaN(postNumber) || postNumber <= 0) {
		return null;
	}

	return postNumber;
}

/**
 * !yomiage ハンドラ。
 * preValidate で対象レスを検証し、execute で pending_async_commands に INSERT する。
 *
 * See: features/command_yomiage.feature @対象レスを指定しないとエラーになる
 * See: features/command_yomiage.feature @削除済みレスを対象に指定するとエラーになる
 * See: features/command_yomiage.feature @システムメッセージを対象に指定するとエラーになる
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 */
export class YomiageHandler implements CommandHandler {
	readonly commandName = "yomiage";

	constructor(
		private readonly pendingRepository: IYomiagePendingRepository,
		private readonly postRepository: IYomiagePostRepository | null = null,
	) {}

	/**
	 * !yomiage の事前検証を行う。
	 * 対象レス未指定・不正番号・削除済み・システムメッセージを通貨消費前に弾く。
	 *
	 * See: features/command_yomiage.feature @対象レスを指定しないとエラーになる
	 * See: features/command_yomiage.feature @削除済みレスを対象に指定するとエラーになる
	 * See: features/command_yomiage.feature @システムメッセージを対象に指定するとエラーになる
	 * See: docs/architecture/components/command.md §5 通貨引き落としの順序と事前検証（preValidate）
	 */
	async preValidate(ctx: CommandContext): Promise<{
		success: false;
		systemMessage: string;
	} | null> {
		const targetArg = (ctx.rawArgs ?? ctx.args)[0];

		if (!targetArg) {
			return {
				success: false,
				systemMessage: "対象レスを指定してください",
			};
		}

		const targetPostNumber = parseTargetPostNumber(targetArg);
		if (targetPostNumber === null) {
			return {
				success: false,
				systemMessage: "無効なレス番号です",
			};
		}

		if (this.postRepository) {
			const targetPost = await this.postRepository.findPostByNumber(
				ctx.threadId,
				targetPostNumber,
			);
			if (targetPost?.isDeleted) {
				return {
					success: false,
					systemMessage: "削除されたレスは対象にできません",
				};
			}
			if (targetPost?.isSystemMessage) {
				return {
					success: false,
					systemMessage: "システムメッセージは対象にできません",
				};
			}
		}

		return null;
	}

	/**
	 * !yomiage コマンドを実行する。
	 * 検証済みの対象レス番号を pending_async_commands に保存し、非同期処理へ委譲する。
	 *
	 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		const targetArg = (ctx.rawArgs ?? ctx.args)[0];
		const targetPostNumber = parseTargetPostNumber(targetArg);

		if (targetPostNumber === null) {
			throw new Error(
				"YomiageHandler.execute requires a validated >>postNumber argument",
			);
		}

		await this.pendingRepository.create({
			commandType: "yomiage",
			threadId: ctx.threadId,
			targetPostNumber,
			invokerUserId: ctx.userId,
			payload: {
				model_id: YOMIAGE_MODEL_ID,
				targetPostNumber,
			},
		});

		return {
			success: true,
			systemMessage: null,
		};
	}
}
