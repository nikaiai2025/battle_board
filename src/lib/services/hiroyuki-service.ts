/**
 * HiroyukiService -- !hiroyuki コマンドの非同期処理サービス
 *
 * GH Actions から AI 生成結果を受け取り、BOT 生成 + 投稿 + pending 削除を行う。
 * 失敗時は通貨返却 + システム通知 + pending 削除を行う。
 *
 * newspaper-service.ts をベースに、BOT 生成ロジック（bot-service.ts processAoriCommands 参照）を追加。
 * newspaper-service.ts とは異なり、★システムレスではなく BOT エンティティの書き込みとして投稿する。
 *
 * アーキテクチャ:
 *   - Vercel: コマンド受理 -> pending INSERT -> workflow_dispatch で GH Actions を即時起動
 *   - GH Actions: スレッドコンテキスト取得 -> AI API 呼び出し -> POST /complete で結果送信
 *   - Vercel: completeHiroyukiCommand で BOT 生成 + 投稿（または通貨返却 + エラー通知）
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/orchestrator/memo_hiroyuki_command.md §1〜§8
 */

import type { Bot } from "../domain/models/bot";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** pending_async_commands レコードの最小型 */
// See: features/command_hiroyuki.feature
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
 * completeHiroyukiCommand の DI インターフェース。
 * BOT 生成 + 投稿に必要な全依存を受け取る。
 *
 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
 * See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
 */
export interface IHiroyukiCompleteDeps {
	pendingAsyncCommandRepository: {
		deletePendingAsyncCommand(id: string): Promise<void>;
	};
	/** BOT エンティティ新規作成関数 */
	createBotFn: (
		bot: Omit<
			Bot,
			| "id"
			| "createdAt"
			| "survivalDays"
			| "totalPosts"
			| "accusedCount"
			| "timesAttacked"
			| "eliminatedAt"
			| "eliminatedBy"
		>,
	) => Promise<Bot>;
	/** bot_posts 紐付け作成関数 */
	createBotPostFn: (postId: string, botId: string) => Promise<void>;
	/** total_posts インクリメント関数 */
	incrementTotalPostsFn: (botId: string) => Promise<void>;
	/** レス投稿関数 */
	createPostFn: (params: {
		threadId: string;
		body: string;
		edgeToken: string | null;
		ipHash: string;
		displayName: string;
		isBotWrite: boolean;
		botUserId?: string;
		isSystemMessage?: boolean;
	}) => Promise<{
		success: boolean;
		postId: string;
		postNumber?: number;
		systemMessages?: unknown[];
	}>;
	/** 通貨加算関数（失敗時の返却用） */
	creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}

/**
 * getHiroyukiPendings の DI インターフェース。
 *
 * See: features/command_hiroyuki.feature
 */
export interface IHiroyukiPendingsDeps {
	pendingAsyncCommandRepository: {
		findByCommandType(commandType: string): Promise<PendingAsyncCommand[]>;
	};
}

/**
 * completeHiroyukiCommand の処理結果型。
 *
 * See: features/command_hiroyuki.feature
 */
export interface HiroyukiResult {
	pendingId: string;
	success: boolean;
	botId?: string;
	postId?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** !hiroyuki コマンドのコスト（commands.yaml の hiroyuki.cost と同値） */
// See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
const HIROYUKI_COMMAND_COST = 10;

// ---------------------------------------------------------------------------
// 偽装ID生成
// ---------------------------------------------------------------------------

/**
 * BOT 用の偽装日次IDを生成する。
 * 人間のIDと区別がつかないランダムな6文字の英数字文字列を返す。
 *
 * See: features/command_hiroyuki.feature @BOTに偽装IDと「名無しさん」表示名が割り当てられる
 */
function generateFakeDailyId(): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < 6; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

/**
 * JST 日付文字列（YYYY-MM-DD）を返す。
 *
 * See: features/command_hiroyuki.feature
 */
function getTodayJst(): string {
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstNow = new Date(Date.now() + jstOffset);
	return jstNow.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// getHiroyukiPendings
// ---------------------------------------------------------------------------

/**
 * pending_async_commands から commandType="hiroyuki" のエントリを取得する。
 * /api/internal/hiroyuki/pending から呼び出される。
 *
 * See: features/command_hiroyuki.feature
 */
export async function getHiroyukiPendings(
	deps: IHiroyukiPendingsDeps,
): Promise<PendingAsyncCommand[]> {
	return deps.pendingAsyncCommandRepository.findByCommandType("hiroyuki");
}

// ---------------------------------------------------------------------------
// completeHiroyukiCommand
// ---------------------------------------------------------------------------

/**
 * GH Actions から AI 生成結果を受け取り、BOT 生成 + 投稿を行う。
 *
 * 成功時フロー:
 *   1. ひろゆき BOT を新規作成（HP:10、「名無しさん」、偽装ID、使い切り）
 *   2. AI 生成テキストを BOT の書き込みとして投稿
 *      - ターゲットあり: >>N 返信形式
 *      - ターゲットなし: スレッド全体への感想
 *   3. bot_posts 紐付け + total_posts インクリメント
 *   4. pending 削除
 *
 * 失敗時フロー:
 *   1. 通貨返却（credit: 10）
 *   2. ★システム名義の独立レスでエラー通知
 *   3. pending 削除
 *
 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
 * See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
 */
export async function completeHiroyukiCommand(
	deps: IHiroyukiCompleteDeps,
	params: {
		pendingId: string;
		threadId: string;
		invokerUserId: string;
		success: boolean;
		generatedText?: string;
		error?: string;
		targetPostNumber: number;
	},
): Promise<HiroyukiResult> {
	const {
		pendingId,
		threadId,
		invokerUserId,
		success,
		generatedText,
		error,
		targetPostNumber,
	} = params;

	// 成功時かつ有効なテキストがある場合のみ成功フロー
	if (success && generatedText) {
		// Step 1: ひろゆき BOT を新規作成（使い切り設定）
		// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
		const today = getTodayJst();
		const newBot = await deps.createBotFn({
			name: "名無しさん",
			persona: "ひろゆき",
			hp: 10,
			maxHp: 10,
			dailyId: generateFakeDailyId(),
			dailyIdDate: today,
			isActive: true,
			isRevealed: false,
			revealedAt: null,
			revivedAt: null,
			grassCount: 0,
			botProfileKey: "hiroyuki",
			nextPostAt: null,
		});

		// Step 2: AI 生成テキストを BOT の書き込みとして投稿
		// ターゲットあり: >>N\n{text} 形式
		// ターゲットなし: {text} のみ
		// See: features/command_hiroyuki.feature @BOTの書き込みは >>5 への返信として構成される
		const body =
			targetPostNumber > 0
				? `>>${targetPostNumber}\n${generatedText}`
				: generatedText;

		const postResult = await deps.createPostFn({
			threadId,
			body,
			edgeToken: null,
			ipHash: "bot-hiroyuki",
			displayName: "名無しさん",
			isBotWrite: true,
			botUserId: newBot.id,
		});

		// Step 3: bot_posts 紐付け + total_posts インクリメント
		if (postResult.success) {
			await deps.createBotPostFn(postResult.postId, newBot.id);
			await deps.incrementTotalPostsFn(newBot.id);
		}

		// Step 4: pending 削除
		await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
			pendingId,
		);

		return {
			pendingId,
			success: true,
			botId: newBot.id,
			postId: postResult.postId,
		};
	}

	// 失敗フロー: BOT 未生成、通貨返却、エラー通知、pending 削除
	// See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
	const errorMessage = error ?? "Unknown error";

	// Step 1: 通貨返却
	try {
		await deps.creditFn(
			invokerUserId,
			HIROYUKI_COMMAND_COST,
			"hiroyuki_api_failure",
		);
	} catch (creditErr) {
		console.error(
			`HiroyukiService.completeHiroyukiCommand: 通貨返却失敗 user=${invokerUserId}`,
			creditErr,
		);
	}

	// Step 2: ★システム名義のエラー通知
	try {
		await deps.createPostFn({
			threadId,
			body: "ひろゆきの召喚に失敗しました。通貨は返却されました。",
			edgeToken: null,
			ipHash: "system-hiroyuki",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});
	} catch (notifyErr) {
		console.error(
			`HiroyukiService.completeHiroyukiCommand: エラー通知投稿失敗 thread=${threadId}`,
			notifyErr,
		);
	}

	// Step 3: pending 削除
	try {
		await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
			pendingId,
		);
	} catch (deleteErr) {
		console.error(
			`HiroyukiService.completeHiroyukiCommand: pending削除失敗 id=${pendingId}`,
			deleteErr,
		);
	}

	return {
		pendingId,
		success: false,
		error: errorMessage,
	};
}
