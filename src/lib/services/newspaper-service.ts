/**
 * NewspaperService — !newspaper コマンドの非同期処理（Cron フェーズ）
 *
 * pending_async_commands から "newspaper" エントリを読み取り、
 * AI API でニュースを取得して「★システム」名義の独立レスとして投稿する。
 *
 * BotService ではなく独立したモジュールとして配置する理由:
 *   - !newspaper は BOT エンティティを生成しない
 *   - BotService の責務（BOT ライフサイクル管理）とは無関係
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.2
 */

import { NEWSPAPER_SYSTEM_PROMPT } from "../../../config/newspaper-prompt";
import type { IGoogleAiAdapter } from "../infrastructure/adapters/google-ai-adapter";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** pending_async_commands レコードの最小型 */
interface PendingAsyncCommand {
	id: string;
	commandType: string;
	threadId: string;
	targetPostNumber: number;
	invokerUserId: string;
	payload: Record<string, unknown> | null;
	createdAt: Date;
}

/**
 * processNewspaperCommands の DI インターフェース。
 * 依存するすべての外部操作を DI パラメータで受け取る。
 *
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.2
 */
export interface INewspaperServiceDeps {
	pendingAsyncCommandRepository: {
		findByCommandType(commandType: string): Promise<PendingAsyncCommand[]>;
		deletePendingAsyncCommand(id: string): Promise<void>;
	};
	googleAiAdapter: IGoogleAiAdapter;
	createPostFn: (params: {
		threadId: string;
		body: string;
		edgeToken: null;
		ipHash: string;
		displayName: string;
		isBotWrite: true;
		isSystemMessage: true;
	}) => Promise<{ success: boolean; postId: string }>;
	creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}

/**
 * 個別 pending 処理の結果型。
 */
export interface NewspaperResult {
	pendingId: string;
	success: boolean;
	postId?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 1 回の Cron 実行で処理する pending 件数の上限。
 * Vercel Hobby プランのタイムアウト（10 秒）対策として 1 件に制限する。
 *
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.5
 */
const MAX_PROCESS_PER_EXECUTION = 1;

// ---------------------------------------------------------------------------
// processNewspaperCommands
// ---------------------------------------------------------------------------

/**
 * pending_async_commands から "newspaper" エントリを読み取り、
 * AI API でニュースを取得して★システムレスとして投稿する。
 *
 * エラーフロー（AI API 全試行失敗時）:
 *   1. 通貨返却（CurrencyService.credit）
 *   2. ★システムエラー通知
 *   3. pending 削除（無限リトライ防止）
 *
 * See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.2
 */
export async function processNewspaperCommands(
	deps: INewspaperServiceDeps,
): Promise<{ processed: number; results: NewspaperResult[] }> {
	const pendingList =
		await deps.pendingAsyncCommandRepository.findByCommandType("newspaper");

	if (pendingList.length === 0) {
		return { processed: 0, results: [] };
	}

	// Vercel タイムアウト対策: 1 件のみ処理する
	const pendingToProcess = pendingList.slice(0, MAX_PROCESS_PER_EXECUTION);
	const results: NewspaperResult[] = [];

	for (const pending of pendingToProcess) {
		try {
			// ペイロードからカテゴリと model_id を取得
			const payload = pending.payload as {
				category: string;
				model_id: string;
			} | null;
			const category = payload?.category ?? "IT";
			const modelId = payload?.model_id ?? "gemini-3-flash-preview";

			// Step 1: AI API 呼び出し（Google Search Grounding）
			const aiResult = await deps.googleAiAdapter.generateWithSearch({
				systemPrompt: NEWSPAPER_SYSTEM_PROMPT,
				userPrompt: `${category}カテゴリの最新ニュースを1件紹介してください。`,
				modelId,
			});

			// Step 2: ★システム名義の独立レスとして投稿
			const postResult = await deps.createPostFn({
				threadId: pending.threadId,
				body: aiResult.text,
				edgeToken: null,
				ipHash: "system-newspaper",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});

			// Step 3: pending 削除
			await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
				pending.id,
			);

			results.push({
				pendingId: pending.id,
				success: true,
				postId: postResult.postId,
			});
		} catch (err) {
			// AI API 全試行失敗 or 投稿失敗
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			console.error(
				`NewspaperService.processNewspaperCommands: pending=${pending.id} failed`,
				err,
			);

			// Step 4: 通貨返却
			try {
				const commandCost = 10; // commands.yaml の newspaper.cost
				await deps.creditFn(
					pending.invokerUserId,
					commandCost,
					"newspaper_api_failure",
				);
			} catch (creditErr) {
				console.error(
					`NewspaperService: 通貨返却失敗 user=${pending.invokerUserId}`,
					creditErr,
				);
			}

			// Step 5: ★システムエラー通知
			try {
				await deps.createPostFn({
					threadId: pending.threadId,
					body: "ニュースの取得に失敗しました。通貨は返却されました。",
					edgeToken: null,
					ipHash: "system-newspaper",
					displayName: "★システム",
					isBotWrite: true,
					isSystemMessage: true,
				});
			} catch (notifyErr) {
				console.error(
					`NewspaperService: エラー通知投稿失敗 thread=${pending.threadId}`,
					notifyErr,
				);
			}

			// Step 6: pending 削除（エラー時も削除して無限リトライを防ぐ）
			try {
				await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
					pending.id,
				);
			} catch (deleteErr) {
				console.error(
					`NewspaperService: pending削除失敗 id=${pending.id}`,
					deleteErr,
				);
			}

			results.push({
				pendingId: pending.id,
				success: false,
				error: errorMessage,
			});
		}
	}

	return { processed: pendingToProcess.length, results };
}
