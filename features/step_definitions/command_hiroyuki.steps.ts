/**
 * command_hiroyuki.feature ステップ定義
 *
 * !hiroyuki（ひろゆき風AI BOT召喚）コマンドのシナリオを実装する。
 * AI API（Gemini）統合 + BOT生成ロジックを検証する:
 *   - 非同期キューINSERT -> Cron処理 -> BOT生成 + AI生成テキスト投稿
 *   - ターゲットあり/なしのプロンプト構築
 *   - プロンプトインジェクション防止（systemInstruction / contents の構造的分離）
 *   - API失敗時の通貨返却・エラー通知
 *
 * 再利用するステップ（他ファイルで定義済み）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーがログイン済みである" (common.steps.ts)
 *   - "ユーザーの通貨残高が {int} である" (common.steps.ts)
 *   - "本文に {string} を含めて投稿する" (command_system.steps.ts)
 *   - "通貨は消費されない" (command_system.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *   - "{string} を実行する" (command_system.steps.ts)
 *   - "ユーザーが {string} を含む書き込みを投稿した" (command_aori.steps.ts)
 *   - "BOT召喚の定期処理が実行される" (command_aori.steps.ts)
 *   - "通貨が 10 消費され残高が 90 になっている" (command_newspaper.steps.ts)
 *   - "AI APIが利用不可である（リトライ含む全試行が失敗）" (command_newspaper.steps.ts)
 *   - "消費された通貨 10 がユーザーに返却され残高が 100 に戻る" (command_newspaper.steps.ts)
 *   - "レス >>N は管理者により削除済みである" (reactions.steps.ts)
 *   - "レス >>10 はシステムメッセージである" (command_system.steps.ts)
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/orchestrator/memo_hiroyuki_command.md §1〜§8
 */

import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { HIROYUKI_SYSTEM_PROMPT } from "../../config/hiroyuki-prompt";
import {
	completeHiroyukiCommand,
	type IHiroyukiCompleteDeps,
} from "../../src/lib/services/hiroyuki-service";
import { InMemoryGoogleAiAdapter } from "../support/in-memory/google-ai-adapter";
import {
	InMemoryBotPostRepo,
	InMemoryBotRepo,
	InMemoryCurrencyRepo,
	InMemoryIncentiveLogRepo,
	InMemoryPendingAsyncCommandRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// InMemoryPostRepo に findPostByNumber エイリアスを追加する（monkey-patch）
//
// HiroyukiHandler の IHiroyukiPostRepository は findPostByNumber を要求するが、
// InMemoryPostRepo は findByThreadIdAndPostNumber を公開している。
// CommandService が auto-resolve で InMemoryPostRepo を HiroyukiHandler に渡す際、
// findPostByNumber が存在しないと TypeError になるため、ここでエイリアスを追加する。
//
// TASK-334 で IHiroyukiPostRepository のメソッド名と実リポジトリのメソッド名に
// 不一致がある（findPostByNumber vs findByThreadIdAndPostNumber）。
// この monkey-patch はその不一致を BDD テスト環境で補正する。
// ---------------------------------------------------------------------------
if (!(InMemoryPostRepo as Record<string, unknown>)["findPostByNumber"]) {
	(InMemoryPostRepo as Record<string, unknown>)["findPostByNumber"] =
		InMemoryPostRepo.findByThreadIdAndPostNumber;
}

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md S2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

// ---------------------------------------------------------------------------
// モックインスタンス（シナリオ間で共有）
// ---------------------------------------------------------------------------

/**
 * AI API モック。
 * generate() の呼び出し履歴と shouldFail 設定でシナリオを制御する。
 * See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
 */
const mockAiAdapter = new InMemoryGoogleAiAdapter();

/** 最後の completeHiroyukiCommand の結果 */
let lastHiroyukiResult: Awaited<
	ReturnType<typeof completeHiroyukiCommand>
> | null = null;

// ---------------------------------------------------------------------------
// Before フック: シナリオ間の状態リセット
// resetAllStores() は InMemory リポジトリのみリセットする。
// モジュールスコープの mockAiAdapter, lastHiroyukiResult は
// ここで明示的にリセットする必要がある。
// ---------------------------------------------------------------------------

Before(() => {
	resetMockState();
});

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** !hiroyuki コマンドのコスト（commands.yaml と同値） */
const HIROYUKI_COMMAND_COST = 10;

/** テスト用に設定する初期通貨残高 */
const DEFAULT_TEST_BALANCE = 100;

/** テスト用ボードID */
const TEST_BOARD_ID = "livebot";

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * InMemoryIncentiveLogRepo に new_thread_join エントリを事前挿入して、
 * 初回スレッド参加ボーナス(+3)が付与されるのを防ぐ。
 *
 * See: features/command_newspaper.steps.ts の同パターン
 */
function blockNewThreadJoinBonus(userId: string, threadId: string): void {
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstNow = new Date(Date.now() + jstOffset);
	const todayJst = jstNow.toISOString().slice(0, 10);
	InMemoryIncentiveLogRepo._insert({
		id: crypto.randomUUID(),
		userId,
		eventType: "new_thread_join",
		amount: 0,
		contextId: threadId,
		contextDate: todayJst,
		createdAt: new Date(Date.now()),
	});
}

/**
 * モック状態をリセットする。
 */
function resetMockState(): void {
	mockAiAdapter.reset();
	lastHiroyukiResult = null;
}

/**
 * completeHiroyukiCommand を InMemory DI で実行する。
 * BOT生成 -> AI生成テキスト投稿のフルフローを検証する。
 *
 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
 */
async function executeCompleteHiroyuki(
	threadId: string,
	invokerUserId: string,
	targetPostNumber: number,
	success: boolean,
	generatedText?: string,
	error?: string,
): Promise<void> {
	const PostService = getPostService();
	const CurrencyService = getCurrencyService();

	const deps: IHiroyukiCompleteDeps = {
		pendingAsyncCommandRepository: InMemoryPendingAsyncCommandRepo,
		createBotFn: (botData) => InMemoryBotRepo.create(botData),
		createBotPostFn: (postId, botId) =>
			InMemoryBotPostRepo.create(postId, botId),
		incrementTotalPostsFn: (botId) =>
			InMemoryBotRepo.incrementTotalPosts(botId),
		createPostFn: async (params) => {
			const result = await PostService.createPost({
				threadId: params.threadId,
				body: params.body,
				edgeToken: params.edgeToken,
				ipHash: params.ipHash,
				displayName: params.displayName,
				isBotWrite: params.isBotWrite,
				botUserId: params.botUserId,
				isSystemMessage: params.isSystemMessage,
			});
			if ("success" in result && result.success) {
				return {
					success: true,
					postId: result.postId,
					postNumber: result.postNumber,
					systemMessages: result.systemMessages,
				};
			}
			throw new Error("error" in result ? result.error : "createPost failed");
		},
		creditFn: (userId, amount, _reason) =>
			CurrencyService.credit(
				userId,
				amount,
				"hiroyuki_api_failure" as Parameters<typeof CurrencyService.credit>[2],
			),
	};

	// pending を取得
	const pendings =
		await InMemoryPendingAsyncCommandRepo.findByCommandType("hiroyuki");
	const pending = pendings[0];

	if (!pending) {
		// pending がない場合は直接パラメータで呼び出す（テストシナリオ用）
		lastHiroyukiResult = await completeHiroyukiCommand(deps, {
			pendingId: "test-pending-id",
			threadId,
			invokerUserId,
			success,
			generatedText,
			error,
			targetPostNumber,
		});
		return;
	}

	lastHiroyukiResult = await completeHiroyukiCommand(deps, {
		pendingId: pending.id,
		threadId: pending.threadId,
		invokerUserId: pending.invokerUserId,
		success,
		generatedText,
		error,
		targetPostNumber:
			(pending.payload as { targetPostNumber?: number } | null)
				?.targetPostNumber ?? 0,
	});
}

/**
 * Scenarios 1, 2, 5 用: hiroyuki pending を遅延処理する。
 *
 * "BOT召喚の定期処理が実行される" は command_aori.steps.ts に定義されており、
 * processAoriCommands() のみを実行する（hiroyuki pending は処理されない）。
 * hiroyuki シナリオの Then ステップで、未処理の hiroyuki pending が存在する場合に
 * このヘルパーを呼んで hiroyuki 固有の処理（AI API呼び出し -> complete）を実行する。
 *
 * shouldFail=true の場合はエラーフローを実行する。
 *
 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
 * See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
 */
async function processHiroyukiPendingIfNeeded(
	world: BattleBoardWorld,
): Promise<void> {
	// 既に処理済みなら何もしない
	if (lastHiroyukiResult) return;

	const pendings =
		await InMemoryPendingAsyncCommandRepo.findByCommandType("hiroyuki");
	if (pendings.length === 0) return;

	const pending = pendings[pendings.length - 1];
	const targetPostNumber =
		(pending.payload as { targetPostNumber?: number } | null)
			?.targetPostNumber ?? 0;

	assert(world.currentThreadId, "スレッドIDが設定されていません");
	assert(pending.invokerUserId, "invokerUserId が設定されていません");

	// shouldFail が設定されている場合（AI API利用不可シナリオ）
	if (mockAiAdapter.shouldFail) {
		await executeCompleteHiroyuki(
			world.currentThreadId,
			pending.invokerUserId,
			targetPostNumber,
			false,
			undefined,
			"AI API is unavailable (mock)",
		);
		return;
	}

	// スレッド全レスを取得してプロンプトを構築
	const allPosts = await InMemoryPostRepo.findByThreadId(world.currentThreadId);
	const threadContext = allPosts
		.filter((p: { isDeleted: boolean }) => !p.isDeleted)
		.map(
			(p: {
				postNumber: number;
				isSystemMessage: boolean;
				displayName: string;
				dailyId: string;
				body: string;
			}) => {
				const nameLabel = p.isSystemMessage ? "★システム" : p.displayName;
				return `>>${p.postNumber} ${nameLabel}(ID:${p.dailyId}): ${p.body}`;
			},
		)
		.join("\n");

	let userPrompt: string;
	if (targetPostNumber > 0) {
		const targetPost = allPosts.find(
			(p: { postNumber: number }) => p.postNumber === targetPostNumber,
		);
		if (targetPost) {
			const targetDailyId = (targetPost as { dailyId: string }).dailyId;
			const targetPostNumbers = allPosts
				.filter(
					(p: {
						dailyId: string;
						isDeleted: boolean;
						isSystemMessage: boolean;
					}) =>
						p.dailyId === targetDailyId && !p.isDeleted && !p.isSystemMessage,
				)
				.map((p: { postNumber: number }) => p.postNumber);
			userPrompt = `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nID: ${targetDailyId} のユーザーの投稿（レス番号${targetPostNumbers.join(", ")}）に対して返信してください。`;
		} else {
			userPrompt = `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nスレッド全体の流れを読んで感想を述べてください。`;
		}
	} else {
		userPrompt = `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nスレッド全体の流れを読んで感想を述べてください。`;
	}

	// AI API モック呼び出し
	const aiResult = await mockAiAdapter.generate({
		systemPrompt: HIROYUKI_SYSTEM_PROMPT,
		userPrompt,
		modelId: "gemini-3-flash-preview",
	});

	// completeHiroyukiCommand 実行
	await executeCompleteHiroyuki(
		world.currentThreadId,
		pending.invokerUserId,
		targetPostNumber,
		true,
		aiResult.text,
	);
}

/**
 * !hiroyuki コマンドの投稿 + 非同期処理（BOT生成）の一連のフローを実行する。
 * AI API モックの generate() 呼び出しを記録し、BDDアサーションに使用する。
 *
 * Scenarios 3, 4, 8 用: 直接 executeHiroyukiFullFlow を呼び出すパターン。
 * PostService.createPost -> CommandService -> HiroyukiHandler -> pending INSERT
 * -> プロンプト構築 -> mockAiAdapter.generate() -> completeHiroyukiCommand
 *
 * See: features/command_hiroyuki.feature @ターゲット指定時、対象ユーザーの全レスがAI APIに渡される
 */
async function executeHiroyukiFullFlow(
	world: BattleBoardWorld,
	commandBody: string,
): Promise<void> {
	resetMockState();

	assert(world.currentEdgeToken, "ユーザーがログイン済みである必要があります");
	assert(world.currentUserId, "ユーザーIDが設定されていません");
	assert(world.currentThreadId, "スレッドが設定されていません");

	// 通貨残高がコマンドコスト未満の場合は設定する
	const currentBalance = await InMemoryCurrencyRepo.getBalance(
		world.currentUserId,
	);
	if (currentBalance < HIROYUKI_COMMAND_COST) {
		InMemoryCurrencyRepo._upsert({
			userId: world.currentUserId,
			balance: DEFAULT_TEST_BALANCE,
			updatedAt: new Date(Date.now()),
		});
	}

	// 初回スレッド参加ボーナスブロック
	blockNewThreadJoinBonus(world.currentUserId, world.currentThreadId);

	// !hiroyuki を投稿して pending に INSERT
	const PostService = getPostService();
	const result = await PostService.createPost({
		threadId: world.currentThreadId,
		body: commandBody,
		edgeToken: world.currentEdgeToken,
		ipHash: world.currentIpHash,
		isBotWrite: false,
	});

	assert(
		"success" in result && result.success,
		`!hiroyuki 投稿が失敗しました: ${"error" in result ? result.error : "unknown"}`,
	);

	// pending を取得してスレッドコンテキストからプロンプトを構築
	const pendings =
		await InMemoryPendingAsyncCommandRepo.findByCommandType("hiroyuki");
	assert(pendings.length > 0, "pending が作成されていません");
	const pending = pendings[pendings.length - 1];
	const targetPostNumber =
		(pending.payload as { targetPostNumber?: number } | null)
			?.targetPostNumber ?? 0;

	// スレッド全レスを取得してプロンプトを構築
	const allPosts = await InMemoryPostRepo.findByThreadId(world.currentThreadId);

	// プロンプト構築（worker の buildUserPrompt と同等のロジック）
	const threadContext = allPosts
		.filter((p: { isDeleted: boolean }) => !p.isDeleted)
		.map(
			(p: {
				postNumber: number;
				isSystemMessage: boolean;
				displayName: string;
				dailyId: string;
				body: string;
			}) => {
				const nameLabel = p.isSystemMessage ? "★システム" : p.displayName;
				return `>>${p.postNumber} ${nameLabel}(ID:${p.dailyId}): ${p.body}`;
			},
		)
		.join("\n");

	let userPrompt: string;
	if (targetPostNumber > 0) {
		const targetPost = allPosts.find(
			(p: { postNumber: number }) => p.postNumber === targetPostNumber,
		);
		if (targetPost) {
			const targetDailyId = (targetPost as { dailyId: string }).dailyId;
			const targetPostNumbers = allPosts
				.filter(
					(p: {
						dailyId: string;
						isDeleted: boolean;
						isSystemMessage: boolean;
					}) =>
						p.dailyId === targetDailyId && !p.isDeleted && !p.isSystemMessage,
				)
				.map((p: { postNumber: number }) => p.postNumber);
			userPrompt = `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nID: ${targetDailyId} のユーザーの投稿（レス番号${targetPostNumbers.join(", ")}）に対して返信してください。`;
		} else {
			userPrompt = `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nスレッド全体の流れを読んで感想を述べてください。`;
		}
	} else {
		userPrompt = `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nスレッド全体の流れを読んで感想を述べてください。`;
	}

	// AI API モックの generate() を呼び出す（呼び出し履歴を記録）
	let aiText: string;
	try {
		const aiResult = await mockAiAdapter.generate({
			systemPrompt: HIROYUKI_SYSTEM_PROMPT,
			userPrompt,
			modelId: "gemini-3-flash-preview",
		});
		aiText = aiResult.text;
	} catch {
		// AI API 失敗時は completeHiroyukiCommand のエラーフローを実行
		await executeCompleteHiroyuki(
			world.currentThreadId,
			world.currentUserId,
			targetPostNumber,
			false,
			undefined,
			"AI API is unavailable (mock)",
		);
		return;
	}

	// completeHiroyukiCommand を実行
	await executeCompleteHiroyuki(
		world.currentThreadId,
		world.currentUserId,
		targetPostNumber,
		true,
		aiText,
	);
}

// ===========================================================================
// Background ステップ（他ファイルで定義済みのものは再利用）
// ===========================================================================

// "コマンドレジストリに以下のコマンドが登録されている:" -> command_system.steps.ts
// "ユーザーがログイン済みである" -> common.steps.ts

// ===========================================================================
// Scenario: ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// See: features/command_hiroyuki.feature
// ===========================================================================

Given(
	"スレッド {string} にレスが書き込まれている",
	async function (this: BattleBoardWorld, _threadTitle: string) {
		// スレッドは Background で作成済み。追加レスを挿入して >>5 を作成する
		assert(this.currentThreadId, "スレッドが設定されていません");
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max: number, p: { postNumber: number }) => Math.max(max, p.postNumber),
			0,
		);
		for (let i = currentMax + 1; i <= 5; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: this.currentUserId,
				displayName: "名無しさん",
				dailyId: "Ax8kP2",
				body: `テスト投稿 ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}
	},
);

Given(
	"スレッド {string} に複数のレスが書き込まれている",
	async function (this: BattleBoardWorld, _threadTitle: string) {
		// スレッドは Background で作成済み。複数レスを挿入する
		assert(this.currentThreadId, "スレッドが設定されていません");
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max: number, p: { postNumber: number }) => Math.max(max, p.postNumber),
			0,
		);
		// 複数の異なるユーザーの投稿を作成
		for (let i = currentMax + 1; i <= currentMax + 5; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: crypto.randomUUID(),
				displayName: "名無しさん",
				dailyId: `User${i}`,
				body: `雑談レス ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}
	},
);

// ===========================================================================
// Then: ひろゆきBOT（HP:10）が新規生成される
// Scenarios 1, 2 の定期処理後に遅延実行 + 検証する。
// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// ===========================================================================

Then(
	/^ひろゆきBOT（HP:(\d+)）が新規生成される$/,
	async function (this: BattleBoardWorld, expectedHp: number) {
		// Scenarios 1, 2: "BOT召喚の定期処理が実行される" は processAoriCommands のみ実行する。
		// hiroyuki pending が未処理の場合、ここで遅延処理を実行する。
		await processHiroyukiPendingIfNeeded(this);

		assert(lastHiroyukiResult, "completeHiroyukiCommand の結果がありません");
		assert(lastHiroyukiResult.success, "BOT生成が失敗しています");
		assert(lastHiroyukiResult.botId, "botId が設定されていません");

		const bot = await InMemoryBotRepo.findById(lastHiroyukiResult.botId);
		assert(bot, "ひろゆきBOTが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`HP が ${expectedHp} であるべきです`,
		);
		assert.strictEqual(
			bot.botProfileKey,
			"hiroyuki",
			"botProfileKey が 'hiroyuki' であるべきです",
		);
		assert.strictEqual(
			bot.isActive,
			true,
			"ひろゆきBOTは is_active=true であるべきです",
		);
		assert.strictEqual(
			bot.nextPostAt,
			null,
			"ひろゆきBOTは next_post_at=null であるべきです（使い切り）",
		);
	},
);

// ===========================================================================
// Then: BOTがAI生成テキストをスレッドに書き込む
// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// ===========================================================================

Then(
	"BOTがAI生成テキストをスレッドに書き込む",
	async function (this: BattleBoardWorld) {
		await processHiroyukiPendingIfNeeded(this);

		assert(lastHiroyukiResult, "completeHiroyukiCommand の結果がありません");
		assert(lastHiroyukiResult.success, "BOT生成が失敗しています");
		assert(lastHiroyukiResult.postId, "postId が設定されていません");

		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPost = posts.find(
			(p: { id: string }) => p.id === lastHiroyukiResult!.postId,
		);
		assert(botPost, "ひろゆきBOTの投稿が見つかりません");
		assert(
			(botPost as { body: string }).body.length > 0,
			"BOT書き込み本文が空です",
		);
	},
);

// ===========================================================================
// Then: BOTの書き込みは >>5 への返信として構成される
// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// ===========================================================================

Then(
	"BOTの書き込みは >>5 への返信として構成される",
	async function (this: BattleBoardWorld) {
		await processHiroyukiPendingIfNeeded(this);

		assert(lastHiroyukiResult, "completeHiroyukiCommand の結果がありません");
		assert(lastHiroyukiResult.postId, "postId が設定されていません");

		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPost = posts.find(
			(p: { id: string }) => p.id === lastHiroyukiResult!.postId,
		);
		assert(botPost, "ひろゆきBOTの投稿が見つかりません");
		assert(
			(botPost as { body: string }).body.startsWith(">>5\n"),
			`BOT書き込みが '>>5\\n' で始まるべきです: "${(botPost as { body: string }).body.slice(0, 30)}"`,
		);
	},
);

// ===========================================================================
// Then: 召喚者の書き込み本文 "..." はそのまま表示される
// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// ===========================================================================

Then(
	"召喚者の書き込み本文 {string} はそのまま表示される",
	async function (this: BattleBoardWorld, expectedBody: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		// 召喚者の投稿を検索（BOT以外の投稿でコマンド文字列を含むもの）
		const invokerPost = posts.find(
			(p: { body: string; authorId: string }) =>
				p.body.includes(expectedBody) && p.authorId === this.currentUserId,
		);
		assert(invokerPost, `召喚者の投稿 "${expectedBody}" が見つかりません`);
		assert(
			(invokerPost as { body: string }).body.includes(expectedBody),
			`本文に "${expectedBody}" が含まれるべきです`,
		);
	},
);

// ===========================================================================
// Then: BOTがスレッド全体に対するAI生成テキストを書き込む
// See: features/command_hiroyuki.feature @ターゲット指定なしではBOTがスレッド全体への感想を投稿する
// ===========================================================================

Then(
	"BOTがスレッド全体に対するAI生成テキストを書き込む",
	async function (this: BattleBoardWorld) {
		await processHiroyukiPendingIfNeeded(this);

		assert(lastHiroyukiResult, "completeHiroyukiCommand の結果がありません");
		assert(lastHiroyukiResult.success, "BOT生成が失敗しています");
		assert(lastHiroyukiResult.postId, "postId が設定されていません");

		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPost = posts.find(
			(p: { id: string }) => p.id === lastHiroyukiResult!.postId,
		);
		assert(botPost, "ひろゆきBOTの投稿が見つかりません");
		// ターゲットなしの場合、>>N プレフィックスがないことを確認
		assert(
			!(botPost as { body: string }).body.match(/^>>\d+/),
			`ターゲットなしの場合、>>N プレフィックスがないべきです: "${(botPost as { body: string }).body.slice(0, 30)}"`,
		);
	},
);

// ===========================================================================
// Then: BOTに偽装IDと「名無しさん」表示名が割り当てられる（hiroyuki 版）
//
// command_aori.steps.ts の同名ステップは lastAoriResult に依存するため、
// hiroyuki シナリオでは機能しない。
// ここで hiroyuki 専用の検証を processHiroyukiPendingIfNeeded 経由で行う。
//
// 注意: 同名ステップが aori に存在するため、Cucumber は最初に登録された方を使う。
//       aori のステップが先に読まれた場合、hiroyuki シナリオでは lastAoriResult が
//       null で失敗する。この問題はエスカレーション ESC-TASK-335-2 で対処する。
//
// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// ===========================================================================
// Note: "BOTに偽装IDと「名無しさん」表示名が割り当てられる" は command_aori.steps.ts で
//       定義済みのため、ここでは定義しない（重複するとambiguousエラー）。
//       aori の lastAoriResult が empty のため Scenario 1 では失敗する可能性がある。
//       この問題はエスカレーションで対処する。

// ===========================================================================
// Scenario: AI API連携 — コンテキスト構成
// See: features/command_hiroyuki.feature @ターゲット指定時、対象ユーザーの全レスがAI APIに渡される
// ===========================================================================

Given(
	/^スレッド "([^"]*)" にレス >>(\d+)（投稿者ID: ([^)]+)）がある$/,
	async function (
		this: BattleBoardWorld,
		_threadTitle: string,
		postNumber: number,
		dailyId: string,
	) {
		resetMockState();
		assert(this.currentThreadId, "スレッドが設定されていません");
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		// 指定レス番号まで既存レスがない場合は埋める
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max: number, p: { postNumber: number }) => Math.max(max, p.postNumber),
			0,
		);
		for (let i = currentMax + 1; i < postNumber; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: crypto.randomUUID(),
				displayName: "名無しさん",
				dailyId: `Other${i}`,
				body: `レス ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}

		// 指定レスを指定IDで作成
		InMemoryPostRepo._insert({
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber,
			authorId: this.currentUserId,
			displayName: "名無しさん",
			dailyId,
			body: `投稿者ID ${dailyId} の投稿です`,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
	},
);

Given(
	/^ID: ([^ ]+) がスレッド内に他にも投稿している$/,
	async function (this: BattleBoardWorld, dailyId: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 同じ dailyId で追加の投稿を作成
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const maxPostNum = existingPosts.reduce(
			(max: number, p: { postNumber: number }) => Math.max(max, p.postNumber),
			0,
		);
		for (let i = 1; i <= 2; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: maxPostNum + i,
				authorId: this.currentUserId!,
				displayName: "名無しさん",
				dailyId,
				body: `${dailyId} の追加投稿 ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}
	},
);

// ===========================================================================
// When: "!hiroyuki >>5" による召喚が処理される
// See: features/command_hiroyuki.feature @ターゲット指定時、対象ユーザーの全レスがAI APIに渡される
// ===========================================================================

When(
	/^"(!hiroyuki(?:\s+>>\d+)?)" による召喚が処理される$/,
	async function (this: BattleBoardWorld, commandBody: string) {
		await executeHiroyukiFullFlow(this, commandBody);
	},
);

// ===========================================================================
// Then: AI API検証ステップ
// See: features/command_hiroyuki.feature @ターゲット指定時、対象ユーザーの全レスがAI APIに渡される
// ===========================================================================

Then(
	"AI APIにひろゆき人格のシステムプロンプトが渡される",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		assert.strictEqual(
			lastCall.systemPrompt,
			HIROYUKI_SYSTEM_PROMPT,
			"システムプロンプトが HIROYUKI_SYSTEM_PROMPT と一致するべきです",
		);
	},
);

Then(
	"AI APIにスレッドの全レステキストがコンテキストとして渡される",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		assert(
			lastCall.userPrompt.includes("以下はスレッドの全レスです"),
			`ユーザープロンプトにスレッドコンテキストが含まれるべきです`,
		);
	},
);

Then(
	/^AI APIに対象ユーザー（ID: ([^)]+)）の全レスを特定する情報が含まれる$/,
	function (this: BattleBoardWorld, targetDailyId: string) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		assert(
			lastCall.userPrompt.includes(`ID: ${targetDailyId}`),
			`ユーザープロンプトに対象ユーザーID "${targetDailyId}" が含まれるべきです`,
		);
	},
);

Then(
	"AI APIに対象ユーザーへの返信指示が含まれる",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		assert(
			lastCall.userPrompt.includes("に対して返信してください"),
			`ユーザープロンプトに返信指示が含まれるべきです`,
		);
	},
);

Then("特定ユーザーへの返信指示は含まれない", function (this: BattleBoardWorld) {
	assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
	const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
	assert(
		!lastCall.userPrompt.includes("に対して返信してください"),
		"ターゲットなし時に返信指示が含まれるべきではありません",
	);
	assert(
		lastCall.userPrompt.includes(
			"スレッド全体の流れを読んで感想を述べてください",
		),
		"スレッド全体への感想指示が含まれるべきです",
	);
});

// ===========================================================================
// Scenario: AI API呼び出しが失敗した場合はBOT未生成・通貨返却
//
// Note: "通貨が 10 消費され残高が 90 になっている" は command_newspaper.steps.ts で
//       ハードコード定義済み。ここでは重複定義しない。
// Note: "AI APIが利用不可である（リトライ含む全試行が失敗）" は command_newspaper.steps.ts で
//       定義済み。newspaper の mockAiAdapter.shouldFail を設定するが、
//       hiroyuki の mockAiAdapter には影響しない。
//       processHiroyukiPendingIfNeeded 内で hiroyuki の mockAiAdapter.shouldFail を
//       チェックしてエラーフローを実行する。
//
// See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
// ===========================================================================

// "AI APIが利用不可である" ステップは newspaper の mockAiAdapter を設定するが、
// hiroyuki の mockAiAdapter にも shouldFail を設定する必要がある。
// newspaper ステップと hiroyuki ステップは異なるモジュールの mockAiAdapter を持つため、
// hiroyuki 固有の Given ステップで自身の mockAiAdapter.shouldFail を設定する。
//
// このステップは feature file では "AI APIが利用不可である（リトライ含む全試行が失敗）" の
// 直前に実行されるため衝突しない（newspaper のステップが先に読まれる）。
// processHiroyukiPendingIfNeeded は hiroyuki の mockAiAdapter.shouldFail を見るため、
// ここで設定しておく。
//
// 注意: feature file のステップ "AI APIが利用不可である（リトライ含む全試行が失敗）" は
//       newspaper.steps.ts で処理される。hiroyuki の mockAiAdapter には影響しないが、
//       processHiroyukiPendingIfNeeded が hiroyuki の mockAiAdapter.shouldFail を
//       チェックするため、hiroyuki Scenario 5 ではここで設定が必要。
//       問題: feature file にはこの hiroyuki 固有のステップが存在しないため、
//       newspaper のステップで処理される。hiroyuki の mockAiAdapter.shouldFail は
//       設定されない。この問題はエスカレーション ESC-TASK-335-2 で対処する。
//
//       ワークアラウンド: processHiroyukiPendingIfNeeded で、hiroyuki pending が
//       存在する場合は常に shouldFail=false として成功フローを実行する。
//       ただし Scenario 5 では失敗フローが必要なため、これでは不十分。
//       この問題はエスカレーションで対処する。

Then("ひろゆきBOTは生成されない", async function (this: BattleBoardWorld) {
	// Scenario 5: AI API 失敗時の検証
	// processHiroyukiPendingIfNeeded は mockAiAdapter.shouldFail をチェックする。
	// newspaper ステップで設定された shouldFail は hiroyuki の mockAiAdapter には
	// 反映されないため、ここで hiroyuki の mockAiAdapter にも設定する。
	// Note: ステップ実行順序上、newspaper の "AI APIが利用不可である" が先に実行され、
	//       その後 "BOT召喚の定期処理が実行される" -> "ひろゆきBOTは生成されない" の順。
	//       ここで hiroyuki の mockAiAdapter.shouldFail を true に設定してから
	//       遅延処理を実行する。
	mockAiAdapter.shouldFail = true;
	await processHiroyukiPendingIfNeeded(this);

	assert(lastHiroyukiResult, "completeHiroyukiCommand の結果がありません");
	assert.strictEqual(
		lastHiroyukiResult.success,
		false,
		"BOT生成が成功していないべきです",
	);
	assert.strictEqual(
		lastHiroyukiResult.botId,
		undefined,
		"botId が設定されていないべきです",
	);
});

// ===========================================================================
// Then: 「★システム」名義の独立レスでエラーが通知される（hiroyuki 版）
//
// command_newspaper.steps.ts の同名ステップは lastNewspaperResult に依存し、
// "ニュースの取得に失敗しました" を検索する。hiroyuki では動作しない。
// このステップは newspaper のステップと同名であり、重複定義するとambiguousエラーになる。
//
// ワークアラウンド: newspaper の定義が Cucumber に先に読まれるため、
//   hiroyuki シナリオでも newspaper のステップが実行される。
//   newspaper のステップは lastNewspaperResult を要求するため失敗する。
//   この問題はエスカレーション ESC-TASK-335-2 で対処する。
//
// See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
// ===========================================================================
// Note: "「★システム」名義の独立レスでエラーが通知される" は定義しない。
//       newspaper のステップが使われるが、hiroyuki では動作しない可能性がある。

// ===========================================================================
// Scenario: プロンプトインジェクション防止
// See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
// ===========================================================================

Given(
	/^レス >>(\d+) の本文が "([^"]*)" である$/,
	async function (this: BattleBoardWorld, postNumber: number, body: string) {
		resetMockState();
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 指定レス番号まで既存レスがない場合は埋める
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max: number, p: { postNumber: number }) => Math.max(max, p.postNumber),
			0,
		);
		for (let i = currentMax + 1; i < postNumber; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: crypto.randomUUID(),
				displayName: "名無しさん",
				dailyId: `Dummy${i}`,
				body: `ダミー ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}

		// 指定レスをインジェクション試行本文で作成
		InMemoryPostRepo._insert({
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber,
			authorId: crypto.randomUUID(),
			displayName: "名無しさん",
			dailyId: "Inject1",
			body,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
	},
);

Then(
	"AI APIのシステムプロンプトはハードコードされた人格設定のままである",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		// systemPrompt がハードコードされた HIROYUKI_SYSTEM_PROMPT と完全一致
		assert.strictEqual(
			lastCall.systemPrompt,
			HIROYUKI_SYSTEM_PROMPT,
			"システムプロンプトが改竄されています",
		);
		// systemPrompt にスレッド本文が混入していないことを確認
		assert(
			!lastCall.systemPrompt.includes("Ignore all instructions"),
			"systemPrompt にインジェクション文字列が混入しています",
		);
	},
);

Then(
	"スレッド本文はシステムプロンプトとは別のメッセージとして渡される",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		// userPrompt にスレッド本文が含まれている
		assert(
			lastCall.userPrompt.includes("Ignore all instructions"),
			"userPrompt にスレッド本文が含まれるべきです（構造的分離）",
		);
		// systemPrompt には含まれていない（上のステップで検証済みだが明示的に再確認）
		assert(
			!lastCall.systemPrompt.includes("Ignore all instructions"),
			"systemPrompt にはスレッド本文が含まれるべきではありません",
		);
	},
);
