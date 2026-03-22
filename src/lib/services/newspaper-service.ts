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
 * アーキテクチャ（GH Actions 移行後）:
 *   - GH Actions: AI API 呼び出し → POST /complete で結果送信
 *   - Vercel: GET /pending でキュー取得 → completeNewspaperCommand で DB 書き込み
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.2
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §3
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

/** createPostFn の共通パラメータ型 */
type CreatePostParams = {
	threadId: string;
	body: string;
	edgeToken: null;
	ipHash: string;
	displayName: string;
	isBotWrite: true;
	isSystemMessage: true;
};

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
	createPostFn: (
		params: CreatePostParams,
	) => Promise<{ success: boolean; postId: string }>;
	creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}

/**
 * completeNewspaperCommand の DI インターフェース。
 * IGoogleAiAdapter を除いた依存のみを受け取る（AI 呼び出しは GH Actions 側で完了済み）。
 *
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §3.2
 */
export interface INewspaperCompleteDeps {
	pendingAsyncCommandRepository: {
		deletePendingAsyncCommand(id: string): Promise<void>;
	};
	createPostFn: (
		params: CreatePostParams,
	) => Promise<{ success: boolean; postId: string }>;
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
 * ※ GH Actions 移行後はこの制限は使用しない（newspaper-worker.ts 側で上限管理）。
 *
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.5
 */
const MAX_PROCESS_PER_EXECUTION = 1;

// ---------------------------------------------------------------------------
// completeNewspaperCommand
// ---------------------------------------------------------------------------

/**
 * GH Actions から AI 生成結果を受け取り、DB への書き込みを行う。
 *
 * 成功時フロー:
 *   1. ★システム名義で createPost（AI 生成テキストを投稿）
 *   2. pending 削除
 *
 * 失敗時フロー:
 *   1. 通貨返却（CurrencyService.credit）
 *   2. ★システムエラー通知
 *   3. pending 削除（無限リトライ防止）
 *
 * See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §3.2
 */
export async function completeNewspaperCommand(
	deps: INewspaperCompleteDeps,
	params: {
		pendingId: string;
		threadId: string;
		invokerUserId: string;
		success: boolean;
		generatedText?: string;
		error?: string;
	},
): Promise<NewspaperResult> {
	const { pendingId, threadId, invokerUserId, success, generatedText, error } =
		params;

	if (success && generatedText) {
		// 成功時: ★システム名義で投稿 → pending 削除
		const postResult = await deps.createPostFn({
			threadId,
			body: generatedText,
			edgeToken: null,
			ipHash: "system-newspaper",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});

		await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
			pendingId,
		);

		return {
			pendingId,
			success: true,
			postId: postResult.postId,
		};
	}

	// 失敗時: 通貨返却 → エラー通知 → pending 削除
	const errorMessage = error ?? "Unknown error";

	try {
		const commandCost = 10; // commands.yaml の newspaper.cost
		await deps.creditFn(invokerUserId, commandCost, "newspaper_api_failure");
	} catch (creditErr) {
		console.error(
			`NewspaperService.completeNewspaperCommand: 通貨返却失敗 user=${invokerUserId}`,
			creditErr,
		);
	}

	try {
		await deps.createPostFn({
			threadId,
			body: "ニュースの取得に失敗しました。通貨は返却されました。",
			edgeToken: null,
			ipHash: "system-newspaper",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});
	} catch (notifyErr) {
		console.error(
			`NewspaperService.completeNewspaperCommand: エラー通知投稿失敗 thread=${threadId}`,
			notifyErr,
		);
	}

	try {
		await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
			pendingId,
		);
	} catch (deleteErr) {
		console.error(
			`NewspaperService.completeNewspaperCommand: pending削除失敗 id=${pendingId}`,
			deleteErr,
		);
	}

	return {
		pendingId,
		success: false,
		error: errorMessage,
	};
}

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
