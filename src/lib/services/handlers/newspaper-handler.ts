/**
 * CommandHandler 実装: !newspaper（最新ニュース取得）
 *
 * 同期フェーズでは pending_async_commands に INSERT するのみ。
 * AI API 呼び出し・★システムレス投稿は Cron フェーズ（processNewspaperCommands）で実行する。
 *
 * - コスト: 10
 * - ステルス: false（コマンド文字列は本文に残る）
 * - 引数: なし（targetPostNumber=0 を使用）
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §2
 */

import { NEWSPAPER_CATEGORIES } from "../../../../config/newspaper-categories";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// DI インターフェース
// ---------------------------------------------------------------------------

/**
 * NewspaperHandler が使用する PendingAsyncCommandRepository の DI インターフェース。
 * AoriHandler の IAoriPendingRepository と同一シグネチャ。
 *
 * See: features/command_newspaper.feature
 */
export interface INewspaperPendingRepository {
	create(params: {
		commandType: string;
		threadId: string;
		targetPostNumber: number;
		invokerUserId: string;
		payload?: Record<string, unknown> | null;
	}): Promise<void>;
}

/**
 * カテゴリ選択関数の型（DI 用）。
 * テスト時に決定論的な選択関数を注入する。
 *
 * See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
 */
export type CategorySelector = () => string;

/**
 * デフォルトのランダム選択関数。
 * 7 カテゴリからランダムに 1 つを返す。
 *
 * See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
 */
export const defaultCategorySelector: CategorySelector = () => {
	const idx = Math.floor(Math.random() * NEWSPAPER_CATEGORIES.length);
	return NEWSPAPER_CATEGORIES[idx];
};

// ---------------------------------------------------------------------------
// NewspaperHandler クラス
// ---------------------------------------------------------------------------

/**
 * !newspaper ハンドラ。
 * カテゴリをランダム選択し、pending_async_commands に INSERT する。
 * ステルスではないため、コマンド文字列は本文に残る。
 *
 * See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
 */
export class NewspaperHandler implements CommandHandler {
	readonly commandName = "newspaper";

	constructor(
		private readonly pendingRepository: INewspaperPendingRepository,
		private readonly selectCategory: CategorySelector = defaultCategorySelector,
	) {}

	/**
	 * !newspaper コマンドを実行する。
	 *
	 * 処理フロー:
	 *   1. カテゴリをランダム選択（CategorySelector DI で決定論的テスト可能）
	 *   2. pending_async_commands に INSERT（payload に category と model_id）
	 *   3. 成功を返す（systemMessage: null で同期出力なし）
	 *
	 * targetPostNumber は 0 を設定する。
	 * !newspaper は >>N 引数を取らず、特定レスへの返信ではないため。
	 *
	 * See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
	 * See: tmp/workers/bdd-architect_271/newspaper_design.md §2.8
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// Step 1: カテゴリをランダム選択
		const category = this.selectCategory();

		// Step 2: pending_async_commands に INSERT
		// targetPostNumber: 0 — !newspaper は特定レスを参照しない
		// payload.model_id: 将来のマルチモデル対応を見据えてプロバイダ識別子を格納
		await this.pendingRepository.create({
			commandType: "newspaper",
			threadId: ctx.threadId,
			targetPostNumber: 0,
			invokerUserId: ctx.userId,
			payload: {
				category,
				model_id: "gemini-3-flash-preview",
			},
		});

		// Step 3: 成功を返す（systemMessage: null でインライン出力なし）
		// ステルスではないため、コマンド文字列はそのまま本文に残る。
		// 結果は Cron フェーズで★システムレスとして投稿される。
		return {
			success: true,
			systemMessage: null,
		};
	}
}
