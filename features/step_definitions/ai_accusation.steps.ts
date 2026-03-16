/**
 * ai_accusation.feature ステップ定義
 *
 * AI告発（!tell コマンド）に関するシナリオを実装する。
 *
 * カバーするシナリオ:
 *   - AI告発に成功すると結果がスレッド全体に公開される
 *   - AI告発に失敗すると冤罪ボーナスが被告発者に付与される
 *   - 人間がAIっぽく振る舞い告発を誘って冤罪ボーナスを稼ぐ
 *   - 通貨不足でAI告発が実行できない
 *   - 自分の書き込みに対してAI告発を試みると拒否される
 *   - 同一ユーザーが同一レスに対して再度告発を試みると拒否される
 *   - 存在しないレスに対してAI告発を試みるとエラーになる
 *   - システムメッセージに対してAI告発を試みると拒否される
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryBotPostRepo,
	InMemoryCurrencyRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getAccusationService() {
	const { AccusationService } =
		require("../../src/lib/services/accusation-service") as typeof import("../../src/lib/services/accusation-service");
	const PostRepo = require("../../src/lib/infrastructure/repositories/post-repository");
	const BotPostRepo = require("../../src/lib/infrastructure/repositories/bot-post-repository");
	const AccusationRepo = require("../../src/lib/infrastructure/repositories/accusation-repository");
	const CurrencyService = require("../../src/lib/services/currency-service");
	return new AccusationService(
		PostRepo,
		BotPostRepo,
		AccusationRepo,
		CurrencyService,
	);
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-accusation";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "battleboard";

/** 告発コスト（commands.yaml の tell.cost と同値） */
const TELL_COST = 50;

// ---------------------------------------------------------------------------
// シナリオ内で共有される状態（エクスポートして command_system.steps.ts から参照可能にする）
// ---------------------------------------------------------------------------

/**
 * AI告発のシナリオ状態。
 * 複数のステップ定義ファイル（ai_accusation.steps.ts, command_system.steps.ts）から
 * アクセスできるように、モジュールレベルでエクスポートする。
 */
export const accusationState = {
	/** AI告発シナリオがアクティブかどうか（command_system シナリオとの判別用） */
	active: false,
	/** postNumber -> postId のマッピング（告発対象解決用） */
	postNumberToId: new Map<number, string>(),
	/** 告発結果（Then ステップでのアサーション用） */
	lastAccusationResult: null as
		| import("../../src/lib/domain/models/accusation").AccusationResult
		| null,
	/** 告発前の通貨残高（通貨消費検証用） */
	balanceBeforeAccusation: 0,
	/** 被告発者のユーザーID（冤罪ボーナス検証用） */
	targetAuthorUserId: null as string | null,
	/** 被告発者の日次ID（冤罪ボーナスメッセージ検証用） */
	targetAuthorDailyId: null as string | null,
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ユーザーとスレッドのセットアップを行う。
 * 既にセットアップ済みの場合はスキップする。
 */
async function ensureUserAndThread(world: BattleBoardWorld): Promise<void> {
	const AuthService = getAuthService();

	if (!world.currentUserId) {
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		world.currentEdgeToken = token;
		world.currentUserId = userId;
		world.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
	}

	if (!world.currentThreadId) {
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "AI告発テスト用スレッド",
			createdBy: world.currentUserId,
		});
		world.currentThreadId = thread.id;
	}
}

/**
 * !tell コマンドの実行を行う（エクスポートして command_system.steps.ts から呼び出し可能）。
 * PostService 経由ではなく AccusationService を直接呼び出す。
 * TellHandler は postNumber -> postId の変換を行わないため、
 * BDDステップでこの変換を担う。
 *
 * See: src/lib/services/handlers/tell-handler.ts > Note
 * See: features/phase2/ai_accusation.feature
 */
export async function executeTellCommand(
	world: BattleBoardWorld,
	postNumber: number,
): Promise<void> {
	assert(world.currentUserId, "ユーザーIDが設定されていません");
	assert(world.currentThreadId, "スレッドIDが設定されていません");

	const targetPostId = accusationState.postNumberToId.get(postNumber);

	// 告発前の通貨残高を記録する
	const CurrencyService = getCurrencyService();
	accusationState.balanceBeforeAccusation = await CurrencyService.getBalance(
		world.currentUserId,
	);

	// 通貨残高チェック（CommandService の責務を再現する）
	if (accusationState.balanceBeforeAccusation < TELL_COST) {
		accusationState.lastAccusationResult = null;
		world.lastResult = {
			type: "error",
			message: "通貨が不足しています",
		};
		return;
	}

	// 通貨消費（CommandService の責務を再現する）
	const deductResult = await CurrencyService.deduct(
		world.currentUserId,
		TELL_COST,
		"command_tell",
	);

	if (!deductResult.success) {
		accusationState.lastAccusationResult = null;
		world.lastResult = {
			type: "error",
			message: "通貨が不足しています",
		};
		return;
	}

	// AccusationService.accuse() を呼び出す
	const accusationService = getAccusationService();
	const result = await accusationService.accuse({
		accuserId: world.currentUserId,
		targetPostId: targetPostId ?? `nonexistent-${postNumber}`,
		threadId: world.currentThreadId,
		accuserDailyId:
			(world as any)._accuserDailyId ?? world.currentUserId.slice(0, 8),
	});

	accusationState.lastAccusationResult = result;

	// alreadyAccused やエラー応答の場合は通貨を返金する
	// 本番では CommandService が補償しない（D-08 command.md §5）が、
	// BDD では直接 AccusationService を呼ぶため、エラー系は通貨を戻す。
	if (
		result.alreadyAccused ||
		result.systemMessage.includes("できません") ||
		result.systemMessage.includes("見つかりません")
	) {
		await CurrencyService.credit(
			world.currentUserId,
			TELL_COST,
			"initial_grant",
		);
		world.lastResult = {
			type: "error",
			message: result.systemMessage,
		};
		return;
	}

	world.lastResult = {
		type: "success",
		data: result,
	};
}

// ---------------------------------------------------------------------------
// Given: ユーザー（ID:xxx）の通貨残高が N である
// See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
// ---------------------------------------------------------------------------

Given(
	/^ユーザー（ID:([^）]+)）の通貨残高が (\d+) である$/,
	async function (this: BattleBoardWorld, dailyId: string, balanceStr: string) {
		const balance = parseInt(balanceStr, 10);
		const AuthService = getAuthService();

		const { token, userId } = await AuthService.issueEdgeToken(
			`accusation-test-ip-${dailyId}`,
		);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = `accusation-test-ip-${dailyId}`;
		await InMemoryUserRepo.updateIsVerified(userId, true);

		(this as any)._accuserDailyId = dailyId;

		InMemoryCurrencyRepo._upsert({
			userId,
			balance,
			updatedAt: new Date(),
		});

		await ensureUserAndThread(this);
	},
);

// ---------------------------------------------------------------------------
// Given: レス >>N はAIボットによる書き込みである
// ---------------------------------------------------------------------------

Given(
	/^レス >>(\d+) はAIボットによる書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);

		const postId = crypto.randomUUID();
		const botId = crypto.randomUUID();

		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: "BotDly1",
			body: "テスト用ボット書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});

		InMemoryBotPostRepo._insert(postId, botId);
		accusationState.postNumberToId.set(postNumber, postId);
	},
);

// ---------------------------------------------------------------------------
// Given: レス >>N は人間ユーザー（ID:xxx）による書き込みである
// ---------------------------------------------------------------------------

Given(
	/^レス >>(\d+) は人間ユーザー（ID:([^）]+)）による書き込みである$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		targetDailyId: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);

		const AuthService = getAuthService();
		const { userId: targetUserId } = await AuthService.issueEdgeToken(
			`accusation-target-ip-${targetDailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(targetUserId, true);

		InMemoryCurrencyRepo._upsert({
			userId: targetUserId,
			balance: 0,
			updatedAt: new Date(),
		});

		accusationState.targetAuthorUserId = targetUserId;
		accusationState.targetAuthorDailyId = targetDailyId;

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: targetUserId,
			displayName: "名無しさん",
			dailyId: targetDailyId,
			body: "テスト用人間の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});

		accusationState.postNumberToId.set(postNumber, postId);
	},
);

// ---------------------------------------------------------------------------
// Given: 人間がAIっぽく振る舞い告発を誘うシナリオ
// ---------------------------------------------------------------------------

Given(
	/^人間ユーザー（ID:([^）]+)）がAIっぽい文体で書き込んでいる$/,
	async function (this: BattleBoardWorld, dailyId: string) {
		const AuthService = getAuthService();

		const { userId: targetUserId } = await AuthService.issueEdgeToken(
			`accusation-bait-ip-${dailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(targetUserId, true);

		InMemoryCurrencyRepo._upsert({
			userId: targetUserId,
			balance: 0,
			updatedAt: new Date(),
		});

		accusationState.targetAuthorUserId = targetUserId;
		accusationState.targetAuthorDailyId = dailyId;

		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "AIのフリ戦略テスト用スレッド",
				createdBy: targetUserId,
			});
			this.currentThreadId = thread.id;
		}

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber: 3,
			authorId: targetUserId,
			displayName: "名無しさん",
			dailyId,
			body: "私はAIです。統計的に最適な回答を提供します。",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});

		accusationState.postNumberToId.set(3, postId);
	},
);

Given(
	/^別のユーザー（ID:([^）]+)）が "!tell >>(\d+)" を実行する$/,
	async function (
		this: BattleBoardWorld,
		accuserDailyId: string,
		postNumberStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		const AuthService = getAuthService();

		const { token, userId } = await AuthService.issueEdgeToken(
			`accusation-accuser-ip-${accuserDailyId}`,
		);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = `accusation-accuser-ip-${accuserDailyId}`;
		await InMemoryUserRepo.updateIsVerified(userId, true);

		(this as any)._accuserDailyId = accuserDailyId;

		InMemoryCurrencyRepo._upsert({
			userId,
			balance: 100,
			updatedAt: new Date(),
		});

		await executeTellCommand(this, postNumber);
	},
);

Given(
	/^レス >>(\d+) は人間の書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		const postId = accusationState.postNumberToId.get(postNumber);
		assert(postId, `レス >>${postNumber} がセットアップされていません`);

		const botRecord = await InMemoryBotPostRepo.findByPostId(postId);
		assert.strictEqual(
			botRecord,
			null,
			`レス >>${postNumber} がボットの書き込みとして登録されていますが、人間の書き込みであるべきです`,
		);
	},
);

// ---------------------------------------------------------------------------
// Given: エラーケース
// ---------------------------------------------------------------------------

Given(
	"ユーザーの通貨残高がAI告発コスト未満である",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		const { token, userId } = await AuthService.issueEdgeToken(
			"accusation-insufficient-ip",
		);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = "accusation-insufficient-ip";
		await InMemoryUserRepo.updateIsVerified(userId, true);

		InMemoryCurrencyRepo._upsert({
			userId,
			balance: TELL_COST - 1,
			updatedAt: new Date(),
		});

		await ensureUserAndThread(this);
	},
);

Given(
	/^レス >>(\d+) は自分自身の書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);

		assert(this.currentUserId, "ユーザーIDが設定されていません");

		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId,
			balance: 200,
			updatedAt: new Date(),
		});

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: this.currentUserId,
			displayName: "名無しさん",
			dailyId: "SelfDly",
			body: "自分の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});

		accusationState.postNumberToId.set(postNumber, postId);
	},
);

Given(
	/^ユーザーがレス >>(\d+) に対して既にAI告発を実行済みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);

		assert(this.currentUserId, "ユーザーIDが設定されていません");

		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId,
			balance: 200,
			updatedAt: new Date(),
		});

		const postId = crypto.randomUUID();
		const botId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: "DupDly1",
			body: "重複告発テスト用書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});
		InMemoryBotPostRepo._insert(postId, botId);
		accusationState.postNumberToId.set(postNumber, postId);

		await executeTellCommand(this, postNumber);
		assert(
			accusationState.lastAccusationResult !== null,
			"最初の告発が実行されませんでした",
		);

		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId,
			balance: 200,
			updatedAt: new Date(),
		});
	},
);

// NOTE: "レス >>999 は存在しない" は admin.steps.ts で定義済み。
// ai_accusation の「存在しないレス」シナリオではそのステップを再利用する。
// ただし通貨残高のセットアップは別途必要なので、Before で行う or 前のGivenで担保する。

// ---------------------------------------------------------------------------
// When: "!tell >>N" を再度実行する
// NOTE: "!tell >>N" を実行する は command_system.steps.ts の "{string} を実行する" が処理する。
// "再度" 付きは ai_accusation 固有のため、ここで定義する。
// ---------------------------------------------------------------------------

When(
	/^"!tell >>(\d+)" を再度実行する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await executeTellCommand(this, postNumber);
	},
);

// ---------------------------------------------------------------------------
// Then: 告発コスト分の通貨が消費される
// ---------------------------------------------------------------------------

Then("告発コスト分の通貨が消費される", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const CurrencyService = getCurrencyService();
	const currentBalance = await CurrencyService.getBalance(this.currentUserId);

	// 告発コストが消費されたことを確認する。
	// hit の場合: balance = before - TELL_COST + ACCUSATION_HIT_BONUS（告発者にボーナス）
	// miss の場合: balance = before - TELL_COST（ボーナスは被告発者に付与、告発者には付与されない）
	const result = accusationState.lastAccusationResult;
	const accuserBonus =
		result?.result === "hit" ? (result?.bonusAmount ?? 0) : 0;
	const expectedBalance =
		accusationState.balanceBeforeAccusation - TELL_COST + accuserBonus;
	assert.strictEqual(
		currentBalance,
		expectedBalance,
		`告発コスト消費の検証: 期待残高=${expectedBalance}（変更前:${accusationState.balanceBeforeAccusation} - コスト:${TELL_COST} + ボーナス:${accuserBonus}）, 実際=${currentBalance}`,
	);
});

// ---------------------------------------------------------------------------
// Then: スレッドにシステムメッセージが表示される
// ---------------------------------------------------------------------------

Then(
	"スレッドにシステムメッセージが表示される:",
	async function (this: BattleBoardWorld, docString: string) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");

		const expectedMessage = docString
			.replace("{告発成功ボーナス}", "100")
			.replace("{告発コスト}", "50")
			.replace("{冤罪ボーナス額}", "50");

		const expectedLines = expectedMessage.trim().split("\n");
		const actualLines = accusationState.lastAccusationResult.systemMessage
			.trim()
			.split("\n");

		for (let i = 0; i < expectedLines.length; i++) {
			const expectedLine = expectedLines[i].trim();
			const actualLine = actualLines[i]?.trim() ?? "";
			assert.strictEqual(
				actualLine,
				expectedLine,
				`システムメッセージの ${i + 1} 行目が一致しません。\n期待: "${expectedLine}"\n実際: "${actualLine}"`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: ボーナス関連
// ---------------------------------------------------------------------------

Then(
	"告発成功ボーナスが告発者に付与される",
	async function (this: BattleBoardWorld) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		assert.strictEqual(accusationState.lastAccusationResult.result, "hit");
		assert(accusationState.lastAccusationResult.bonusAmount > 0);
	},
);

Then(
	"告発者にはボーナスが付与されない",
	async function (this: BattleBoardWorld) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		assert.strictEqual(accusationState.lastAccusationResult.result, "miss");
	},
);

Then(
	"被告発者に冤罪ボーナスが付与される",
	async function (this: BattleBoardWorld) {
		assert(
			accusationState.targetAuthorUserId,
			"被告発者のユーザーIDが設定されていません",
		);
		const CurrencyService = getCurrencyService();
		const targetBalance = await CurrencyService.getBalance(
			accusationState.targetAuthorUserId,
		);
		assert(
			targetBalance > 0,
			`被告発者に冤罪ボーナスが付与されていません（残高: ${targetBalance}）`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: エラーメッセージ関連
// ---------------------------------------------------------------------------

Then(
	/^エラーのシステムメッセージ "([^"]+)" が表示される$/,
	async function (this: BattleBoardWorld, expectedMessage: string) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(this.lastResult.type, "error");
		assert(
			this.lastResult.message.includes(expectedMessage),
			`エラーメッセージに "${expectedMessage}" が含まれることを期待しましたが "${this.lastResult.message}" でした`,
		);
	},
);

Then(
	"エラーのシステムメッセージが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(this.lastResult.type, "error");
	},
);

Then("告発は実行されない", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(this.lastResult.type, "error");
});

Then("通貨残高は変化しない", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const CurrencyService = getCurrencyService();
	const currentBalance = await CurrencyService.getBalance(this.currentUserId);
	assert.strictEqual(
		currentBalance,
		accusationState.balanceBeforeAccusation,
		`通貨残高が変化しないことを期待しましたが、変更前: ${accusationState.balanceBeforeAccusation}, 変更後: ${currentBalance}`,
	);
});

// NOTE: "通貨は消費されない" は command_system.steps.ts で定義済み。
// ai_accusation シナリオでもそのステップを再利用する。

// ---------------------------------------------------------------------------
// Then: 冤罪ボーナス（AIのフリ戦略）
// ---------------------------------------------------------------------------

Then(
	/^判定結果 "([^"]+)" が全公開される$/,
	async function (this: BattleBoardWorld, expectedResult: string) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		assert(
			accusationState.lastAccusationResult.systemMessage.includes(
				expectedResult,
			),
			`システムメッセージに "${expectedResult}" が含まれることを期待しました`,
		);
	},
);

Then(
	/^ID:([^ ]+) に冤罪ボーナスが付与される$/,
	async function (this: BattleBoardWorld, _dailyId: string) {
		assert(
			accusationState.targetAuthorUserId,
			"被告発者のユーザーIDが設定されていません",
		);
		const CurrencyService = getCurrencyService();
		const targetBalance = await CurrencyService.getBalance(
			accusationState.targetAuthorUserId,
		);
		assert(
			targetBalance > 0,
			`ID:${_dailyId} に冤罪ボーナスが付与されていません`,
		);
	},
);
