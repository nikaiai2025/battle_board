/**
 * CommandHandler 実装: !tell（AI告発）コマンド
 *
 * See: features/ai_accusation.feature
 * See: features/command_system.feature @!tellコマンド
 * See: docs/architecture/components/accusation.md §1 分割方針
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !tell コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!tell >>5"）
 *   - 通貨コスト: 50（config/commands.yaml の tell.cost）
 *   - 告発ロジックはすべて AccusationService に委譲する
 *   - CommandService は通貨引き落としを事前に行い、TellHandler は AccusationService を呼ぶだけ
 */

import type { AccusationService } from "../accusation-service";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

/**
 * !tell（AI告発）ハンドラ。
 * AccusationService.accuse() に告発ロジックを委譲する。
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 */
export class TellHandler implements CommandHandler {
	/** コマンド名（! を除いた名前） */
	readonly commandName = "tell";

	/**
	 * @param accusationService - 告発ロジックを担うサービス（DI）
	 */
	constructor(private readonly accusationService: AccusationService) {}

	/**
	 * !tell コマンドを実行する。
	 *
	 * 引数から targetPostId を抽出し、AccusationService.accuse() に委譲する。
	 *
	 * 引数形式: args[0] = ">>5" のような ">>postNumber" 形式。
	 * ただし CommandService のレベルでは postNumber を UUID に変換する責務はなく、
	 * TellHandler は args[0] をそのまま targetPostId として AccusationService に渡す。
	 * （スレッドコンテキストから postId への変換は PostService / BDDステップが行う）
	 *
	 * Note: CommandContext.postId は「告発コマンドを含む書き込み自体の postId」であり、
	 *       告発対象の postId（args[0]）とは異なる。
	 *       args[0] が ">>N" 形式のポスト番号参照の場合、その UUID 解決は
	 *       呼び出し元（CommandService またはPostService）の責務とする。
	 *       BDDステップ定義の実装（TASK-079）でこの変換を担う。
	 *
	 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
	 * See: docs/architecture/components/command.md §3.1 依存先 > AccusationService
	 *
	 * @param ctx - コマンド実行コンテキスト
	 * @returns コマンド実行結果
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// 引数から targetPostId を取得する
		// See: docs/architecture/components/command.md §2.2 targetFormat: ">>postNumber"
		const targetArg = ctx.args[0];

		if (!targetArg) {
			return {
				success: false,
				systemMessage: "使い方: !tell >>レス番号",
			};
		}

		// AccusationService.accuse() に委譲する
		// See: docs/architecture/components/accusation.md §1 分割方針
		const result = await this.accusationService.accuse({
			accuserId: ctx.userId,
			targetPostId: targetArg,
			threadId: ctx.threadId,
			// accuserDailyId は ctx に含まれないため、CommandContext を拡張するか
			// PostService が dailyId を解決してから渡す必要がある。
			// 現フェーズでは ctx.userId を仮の dailyId として使用する。
			// BDDステップ定義（TASK-079）で正しい dailyId を渡すよう修正する。
			accuserDailyId: ctx.userId,
		});

		// alreadyAccused の場合はシステムメッセージのみ返す（成功フラグは false）
		if (result.alreadyAccused) {
			return {
				success: false,
				systemMessage: result.systemMessage,
			};
		}

		return {
			success: result.result === "hit",
			systemMessage: result.systemMessage,
		};
	}
}
