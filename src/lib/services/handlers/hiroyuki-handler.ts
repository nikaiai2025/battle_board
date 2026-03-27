/**
 * CommandHandler 実装: !hiroyuki（ひろゆき風AI BOT召喚）
 *
 * 同期フェーズでは pending_async_commands に INSERT するのみ。
 * AI API 呼び出し・BOT生成・書き込みは GH Actions（hiroyuki-worker.ts）で非同期実行する。
 *
 * - コスト: 10
 * - ステルス: false（コマンド文字列は本文に残る）
 * - 引数: >>N（任意）
 *   - 引数あり: 対象ユーザーの全レスを踏まえたひろゆき風返信を生成
 *   - 引数なし: スレッド全体への感想を生成
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/orchestrator/memo_hiroyuki_command.md §2〜§8
 */

import { HIROYUKI_MODEL_ID } from "../../../../config/hiroyuki-prompt";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// DI インターフェース
// ---------------------------------------------------------------------------

/**
 * HiroyukiHandler が使用する PendingAsyncCommandRepository の DI インターフェース。
 * NewspaperHandler の INewspaperPendingRepository と同一シグネチャ。
 *
 * See: features/command_hiroyuki.feature
 */
export interface IHiroyukiPendingRepository {
	create(params: {
		commandType: string;
		threadId: string;
		targetPostNumber: number;
		invokerUserId: string;
		payload?: Record<string, unknown> | null;
	}): Promise<void>;
}

/**
 * HiroyukiHandler がターゲットバリデーションに使用するレス情報取得インターフェース。
 * 削除済み・システムメッセージの判定に必要なフィールドを提供する。
 *
 * See: features/command_hiroyuki.feature @削除済みレスを対象に指定するとエラーになる
 * See: features/command_hiroyuki.feature @システムメッセージを対象に指定するとエラーになる
 */
export interface IHiroyukiPostRepository {
	/**
	 * スレッドIDとレス番号でレスを検索する。
	 * 存在しない場合は null を返す。
	 */
	findPostByNumber(
		threadId: string,
		postNumber: number,
	): Promise<HiroyukiTargetPost | null>;
}

/**
 * ターゲットバリデーションに必要なレス情報。
 * 削除済みフラグ・システムメッセージフラグのみを保持する最小インターフェース。
 */
export interface HiroyukiTargetPost {
	/** レスが削除済みかどうか */
	isDeleted: boolean;
	/** システムメッセージかどうか */
	isSystemMessage: boolean;
}

// ---------------------------------------------------------------------------
// HiroyukiHandler クラス
// ---------------------------------------------------------------------------

/**
 * !hiroyuki ハンドラ。
 * ターゲット指定あり/なし両対応。pending_async_commands に INSERT し、非ステルス成功を返す。
 * 通貨チェックは CommandService の共通処理（Step 3-4）で完了済みのため、
 * ハンドラは pending INSERT とバリデーションのみを担当する。
 *
 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
 * See: features/command_hiroyuki.feature @ターゲット指定なしではBOTがスレッド全体への感想を投稿する
 */
export class HiroyukiHandler implements CommandHandler {
	readonly commandName = "hiroyuki";

	constructor(
		private readonly pendingRepository: IHiroyukiPendingRepository,
		private readonly postRepository: IHiroyukiPostRepository | null = null,
	) {}

	/**
	 * !hiroyuki コマンドを実行する。
	 *
	 * 処理フロー:
	 *   1. 引数から target_post_number を取得（引数なしは 0）
	 *   2. ターゲット指定ありの場合、ターゲットバリデーション（削除済み・システムメッセージ）
	 *   3. pending_async_commands に INSERT（payload に model_id と targetPostNumber）
	 *   4. 非ステルス成功を返す（systemMessage: null でインライン出力なし）
	 *
	 * ターゲット番号 0 は「引数なし」を表す（!hiroyuki の場合）。
	 * >>N 指定の場合はそのポスト番号を使用する。
	 *
	 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
	 * See: features/command_hiroyuki.feature @削除済みレスを対象に指定するとエラーになる
	 * See: features/command_hiroyuki.feature @システムメッセージを対象に指定するとエラーになる
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// Step 1: 引数から target_post_number を取得
		// rawArgs を使用する（PostNumberResolver 解決前の元の >>N 形式）。
		// args は UUID に解決されるが、pending_async_commands には postNumber が必要。
		// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
		const targetArg = (ctx.rawArgs ?? ctx.args)[0]; // ">>5" 形式（解決前）、undefined なら引数なし

		let targetPostNumber = 0; // 0 = 引数なし（スレッド全体モード）

		if (targetArg) {
			// 引数あり: >>N 形式からポスト番号を取得
			const postNumber = parseInt(targetArg.replace(">>", ""), 10);
			if (isNaN(postNumber) || postNumber <= 0) {
				return {
					success: false,
					systemMessage: "無効なレス番号です",
				};
			}

			// Step 2: ターゲットバリデーション（削除済み・システムメッセージ）
			// See: features/command_hiroyuki.feature @削除済みレスを対象に指定するとエラーになる
			// See: features/command_hiroyuki.feature @システムメッセージを対象に指定するとエラーになる
			if (this.postRepository) {
				const targetPost = await this.postRepository.findPostByNumber(
					ctx.threadId,
					postNumber,
				);

				if (targetPost) {
					if (targetPost.isDeleted) {
						return {
							success: false,
							systemMessage: "削除されたレスは対象にできません",
						};
					}

					if (targetPost.isSystemMessage) {
						return {
							success: false,
							systemMessage: "システムメッセージは対象にできません",
						};
					}
				}
			}

			targetPostNumber = postNumber;
		}

		// Step 3: pending_async_commands に INSERT
		// targetPostNumber: 0 = スレッド全体モード、N = 対象ユーザーの全レスモード
		// payload.model_id: 使用するGeminiモデルID
		// payload.targetPostNumber: Cron処理でターゲットユーザーのIDを取得するために使用
		await this.pendingRepository.create({
			commandType: "hiroyuki",
			threadId: ctx.threadId,
			targetPostNumber,
			invokerUserId: ctx.userId,
			payload: {
				model_id: HIROYUKI_MODEL_ID,
				targetPostNumber,
			},
		});

		// Step 4: 非ステルス成功を返す（systemMessage: null でインライン出力なし）
		// 非ステルスのため、コマンド文字列はそのまま本文に残る。
		// 結果は Cron フェーズでBOT書き込みとして投稿される。
		return {
			success: true,
			systemMessage: null,
		};
	}
}
