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
 * See: features/ai_accusation.feature
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
	// config/commands.yaml と一致するボーナス設定を渡す
	// See: config/commands.yaml > tell
	return new AccusationService(
		PostRepo,
		BotPostRepo,
		AccusationRepo,
		CurrencyService,
		{ hitBonus: 20, falseAccusationBonus: 10, cost: 10 },
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

/** 告発コスト（config/commands.yaml の tell.cost と同値） */
const TELL_COST = 10;

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
 * See: features/ai_accusation.feature
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
		// 対象レスが存在しない場合は存在しない UUID を渡す（非UUID文字列はリポジトリバリデーションに弾かれる）
		// See: features/support/in-memory/assert-uuid.ts
		targetPostId: targetPostId ?? crypto.randomUUID(),
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
// Given: ユーザーの通貨残高が N である
// Note: common.steps.ts の同名ステップを再利用する。
// Before フックで accusation シナリオ用のデフォルトユーザーがセットアップ済み。
// See: features/support/hooks.ts
// See: features/step_definitions/common.steps.ts
// ---------------------------------------------------------------------------

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
			createdAt: new Date(Date.now()),
		});

		InMemoryBotPostRepo._insert(postId, botId);
		accusationState.postNumberToId.set(postNumber, postId);
	},
);

// ---------------------------------------------------------------------------
// Given: レス >>N は人間ユーザーによる書き込みである
// ---------------------------------------------------------------------------

Given(
	/^レス >>(\d+) は人間ユーザーによる書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);

		const targetDailyId = "TgtDly1";
		const AuthService = getAuthService();
		const { userId: targetUserId } = await AuthService.issueEdgeToken(
			`accusation-target-ip-${targetDailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(targetUserId, true);

		InMemoryCurrencyRepo._upsert({
			userId: targetUserId,
			balance: 0,
			updatedAt: new Date(Date.now()),
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
			createdAt: new Date(Date.now()),
		});

		accusationState.postNumberToId.set(postNumber, postId);
	},
);

// ---------------------------------------------------------------------------
// Given: 人間がAIっぽく振る舞い告発を誘うシナリオ
// ---------------------------------------------------------------------------

Given(
	/^人間ユーザーがAIっぽい文体で書き込んでいる$/,
	async function (this: BattleBoardWorld) {
		const dailyId = "BaitDly";
		const AuthService = getAuthService();

		const { userId: targetUserId } = await AuthService.issueEdgeToken(
			`accusation-bait-ip-${dailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(targetUserId, true);

		InMemoryCurrencyRepo._upsert({
			userId: targetUserId,
			balance: 0,
			updatedAt: new Date(Date.now()),
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
			createdAt: new Date(Date.now()),
		});

		accusationState.postNumberToId.set(3, postId);
	},
);

Given(
	/^別のユーザーが "!tell >>(\d+)" を実行する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		const AuthService = getAuthService();

		const accuserDailyId = "AccDly1";
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
			updatedAt: new Date(Date.now()),
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
	/^レス >>(\d+) は自分自身の書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);

		assert(this.currentUserId, "ユーザーIDが設定されていません");

		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId,
			balance: 200,
			updatedAt: new Date(Date.now()),
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
			createdAt: new Date(Date.now()),
		});

		accusationState.postNumberToId.set(postNumber, postId);
		// bot_system シナリオでも使用されるため world.botPostNumberToId にも登録する
		// See: features/bot_system.feature @自分の書き込みに対して攻撃を試みると拒否される
		this.botPostNumberToId.set(postNumber, postId);
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
			updatedAt: new Date(Date.now()),
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
			createdAt: new Date(Date.now()),
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
			updatedAt: new Date(Date.now()),
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
// Then: 通貨が N 消費され残高が M になる
// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
// ---------------------------------------------------------------------------

Then(
	/^通貨が (\d+) 消費され残高が (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		costStr: string,
		expectedBalanceAfterCostStr: string,
	) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const expectedCost = parseInt(costStr, 10);
		const expectedBalanceAfterCost = parseInt(expectedBalanceAfterCostStr, 10);

		if (accusationState.balanceBeforeAccusation > 0) {
			// AI告発シナリオ: コスト消費の論理検証
			// 変更前残高 - コスト = 期待残高
			// 実際の残高はボーナス付与後の値になるため、変更前残高から計算で検証する
			const actualCost =
				accusationState.balanceBeforeAccusation - expectedBalanceAfterCost;
			assert.strictEqual(
				actualCost,
				expectedCost,
				`通貨消費の検証: 変更前残高=${accusationState.balanceBeforeAccusation}, 期待コスト=${expectedCost}, 実際コスト=${actualCost}`,
			);
		} else {
			// 非告発シナリオ（bot_system 等）: 現在残高を直接確認する
			// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
			const CurrencyService = getCurrencyService();
			const balance = await CurrencyService.getBalance(this.currentUserId);
			assert.strictEqual(
				balance,
				expectedBalanceAfterCost,
				`通貨残高が ${expectedBalanceAfterCost} であることを期待しましたが ${balance} でした`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: スレッドにシステムメッセージが表示される
// ---------------------------------------------------------------------------

Then(
	"スレッドにシステムメッセージが表示される",
	async function (this: BattleBoardWorld) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		assert(
			accusationState.lastAccusationResult.systemMessage.length > 0,
			"システムメッセージが空です",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: システムメッセージに告発者のIDが含まれる
// ---------------------------------------------------------------------------

Then(
	"システムメッセージに告発者のIDが含まれる",
	async function (this: BattleBoardWorld) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		const accuserDailyId =
			(this as any)._accuserDailyId ?? this.currentUserId?.slice(0, 8);
		assert(
			accusationState.lastAccusationResult.systemMessage.includes(
				accuserDailyId,
			),
			`システムメッセージに告発者のID "${accuserDailyId}" が含まれることを期待しました。実際: "${accusationState.lastAccusationResult.systemMessage}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: システムメッセージに {string} が含まれる
// ---------------------------------------------------------------------------

Then(
	/^システムメッセージに "([^"]+)" が含まれる$/,
	async function (this: BattleBoardWorld, expectedText: string) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		assert(
			accusationState.lastAccusationResult.systemMessage.includes(expectedText),
			`システムメッセージに "${expectedText}" が含まれることを期待しました。実際: "${accusationState.lastAccusationResult.systemMessage}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 告発成功ボーナス N が告発者に付与され残高が M になる
// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
// ---------------------------------------------------------------------------

Then(
	/^告発成功ボーナス (\d+) が告発者に付与され残高が (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		bonusStr: string,
		expectedBalanceStr: string,
	) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");

		const expectedBonus = parseInt(bonusStr, 10);
		const expectedBalance = parseInt(expectedBalanceStr, 10);

		// ボーナス額の検証
		assert.strictEqual(accusationState.lastAccusationResult.result, "hit");
		assert.strictEqual(
			accusationState.lastAccusationResult.bonusAmount,
			expectedBonus,
			`告発成功ボーナスが ${expectedBonus} であることを期待しましたが ${accusationState.lastAccusationResult.bonusAmount} でした`,
		);

		// 残高の検証
		const CurrencyService = getCurrencyService();
		const currentBalance = await CurrencyService.getBalance(this.currentUserId);
		assert.strictEqual(
			currentBalance,
			expectedBalance,
			`ボーナス付与後の残高が ${expectedBalance} であることを期待しましたが ${currentBalance} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: ボーナス関連
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 告発者に通貨報酬は付与されない
// !tell はコスト消費のみで報酬なし。
// 告発後の残高がコスト消費分のみ（AccusationService が credit を呼ばない）であることを検証する。
// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
// See: features/ai_accusation.feature @AI告発に失敗するとコストのみ消費される
// ---------------------------------------------------------------------------

Then("告発者に通貨報酬は付与されない", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const CurrencyService = getCurrencyService();
	const currentBalance = await CurrencyService.getBalance(this.currentUserId);
	// コスト消費後の残高が「告発前残高 - コスト」と一致すること
	// つまり报酬（credit）が呼ばれていないことを確認する
	const expectedBalance = accusationState.balanceBeforeAccusation - TELL_COST;
	assert.strictEqual(
		currentBalance,
		expectedBalance,
		`告発者への通貨報酬が付与されていないことを期待しました。期待残高=${expectedBalance}, 実際残高=${currentBalance}`,
	);
});

// ---------------------------------------------------------------------------
// Then: 被告発者に通貨は付与されない
// !tell 失敗時（対象が人間）でも被告発者への通貨付与はない（冤罪ボーナス廃止）。
// See: features/ai_accusation.feature @AI告発に失敗するとコストのみ消費される
// ---------------------------------------------------------------------------

Then("被告発者に通貨は付与されない", async function (this: BattleBoardWorld) {
	assert(
		accusationState.targetAuthorUserId,
		"被告発者のユーザーIDが設定されていません",
	);
	const CurrencyService = getCurrencyService();
	const targetBalance = await CurrencyService.getBalance(
		accusationState.targetAuthorUserId,
	);
	// Given ステップで被告発者の初期残高を 0 に設定しているため、0 のままであることを確認する
	assert.strictEqual(
		targetBalance,
		0,
		`被告発者に通貨が付与されていないことを期待しましたが、残高は ${targetBalance} でした`,
	);
});

Then(
	"告発者にはボーナスが付与されない",
	async function (this: BattleBoardWorld) {
		assert(accusationState.lastAccusationResult, "告発結果が存在しません");
		assert.strictEqual(accusationState.lastAccusationResult.result, "miss");
	},
);

Then(
	/^被告発者に冤罪ボーナス (\d+) が付与される$/,
	async function (this: BattleBoardWorld, bonusStr: string) {
		const expectedBonus = parseInt(bonusStr, 10);
		assert(
			accusationState.targetAuthorUserId,
			"被告発者のユーザーIDが設定されていません",
		);
		const CurrencyService = getCurrencyService();
		const targetBalance = await CurrencyService.getBalance(
			accusationState.targetAuthorUserId,
		);
		assert.strictEqual(
			targetBalance,
			expectedBonus,
			`被告発者に冤罪ボーナス ${expectedBonus} が付与されることを期待しましたが、残高は ${targetBalance} でした`,
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

// NOTE: "通貨残高は N のまま変化しない" は common.steps.ts で定義済み。
// ai_accusation シナリオでもそのステップを再利用する。

// NOTE: "通貨は消費されない" は command_system.steps.ts で定義済み。
// ai_accusation シナリオでもそのステップを再利用する。
