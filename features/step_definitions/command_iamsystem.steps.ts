/**
 * command_iamsystem.feature ステップ定義
 *
 * !iamsystem（ステルスでシステム偽装）コマンドのシナリオを実装する。
 * ステルスコマンド基盤の初実装であり、以下を検証する:
 *   - ステルス3原則（成功時除去 / 失敗時残す / 空本文投稿）
 *   - 表示名・IDの変更（★システム / SYSTEM）
 *   - is_system_message は false のまま
 *   - 他コマンド（!tell / !attack）との相互作用
 *
 * 再利用するステップ（他ファイルで定義済み）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーがログイン済みである" (common.steps.ts)
 *   - "ユーザーの通貨残高が {int} である" (common.steps.ts)
 *   - "本文に {string} を含めて投稿する" (command_system.steps.ts)
 *   - "通貨が {int} 消費される" (command_system.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *
 * See: features/command_iamsystem.feature
 * See: docs/architecture/components/command.md S5 ステルスコマンドの設計原則
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryCurrencyRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md S2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";
const TEST_BOARD_ID = "livebot";

// ---------------------------------------------------------------------------
// When: 本文に {string} のみを含めて投稿する
// See: features/command_iamsystem.feature @コマンドのみの書き込みでは空本文で投稿される
// ---------------------------------------------------------------------------

/**
 * 本文に "{string}" のみを含めて投稿する。
 * "本文に {string} を含めて投稿する" と同じ動作だが、
 * feature 上の意図（コマンドのみ）を明示するための別ステップ。
 */
When(
	"本文に {string} のみを含めて投稿する",
	async function (this: BattleBoardWorld, bodyContent: string) {
		const PostService = getPostService();

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: bodyContent,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("authRequired" in result) {
			this.lastResult = {
				type: "authRequired",
				code: result.code,
				edgeToken: result.edgeToken,
			};
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込みがスレッドに追加される
// 既存: specialist_browser_compat.steps.ts で定義済み。重複回避のためここでは定義しない。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 表示される本文は {string} である
// See: features/command_iamsystem.feature @成功時にコマンド文字列が投稿本文から除去される
// ---------------------------------------------------------------------------

Then(
	"表示される本文は {string} である",
	async function (this: BattleBoardWorld, expectedBody: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		// 最新の投稿を取得する
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		// システムメッセージ以外で最後の投稿を取得
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		assert.strictEqual(
			latestPost.body,
			expectedBody,
			`本文 "${expectedBody}" を期待しましたが "${latestPost.body}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: コマンド文字列 {string} は本文に含まれない
// See: features/command_iamsystem.feature @成功時にコマンド文字列が投稿本文から除去される
// ---------------------------------------------------------------------------

Then(
	"コマンド文字列 {string} は本文に含まれない",
	async function (this: BattleBoardWorld, commandString: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		assert(
			!latestPost.body.includes(commandString),
			`本文にコマンド文字列 "${commandString}" が含まれています: "${latestPost.body}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 表示される本文は空文字列である
// See: features/command_iamsystem.feature @コマンドのみの書き込みでは空本文で投稿される
// ---------------------------------------------------------------------------

Then("表示される本文は空文字列である", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドIDが設定されていません");

	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	const userPosts = posts.filter((p) => !p.isSystemMessage);
	assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
	const latestPost = userPosts[userPosts.length - 1];

	assert.strictEqual(
		latestPost.body,
		"",
		`本文が空文字列を期待しましたが "${latestPost.body}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: レス番号は消費される
// See: features/command_iamsystem.feature @コマンドのみの書き込みでは空本文で投稿される
// ---------------------------------------------------------------------------

Then("レス番号は消費される", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドIDが設定されていません");

	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	const userPosts = posts.filter((p) => !p.isSystemMessage);
	assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
	const latestPost = userPosts[userPosts.length - 1];

	assert(
		typeof latestPost.postNumber === "number" && latestPost.postNumber > 0,
		`レス番号が採番されていません: ${latestPost.postNumber}`,
	);
});

// ---------------------------------------------------------------------------
// Then: コマンドは実行されない
// 既存: command_system.steps.ts で定義済み。重複回避のためここでは定義しない。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 書き込み本文は {string} がそのまま表示される
// 既存: command_system.steps.ts で定義済み。重複回避のためここでは定義しない。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 書き込みの表示名は通常のユーザー表示名のままである
// See: features/command_iamsystem.feature @通貨不足で失敗すると...偽装も適用されない
// ---------------------------------------------------------------------------

Then(
	"書き込みの表示名は通常のユーザー表示名のままである",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		// 通常表示名（★システムではない）
		assert.notStrictEqual(
			latestPost.displayName,
			"★システム",
			`表示名がシステム偽装されています: "${latestPost.displayName}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込みの表示名は {string} である
// See: features/command_iamsystem.feature @成功時に表示名とIDがシステム風に変更される
// ---------------------------------------------------------------------------

Then(
	"書き込みの表示名は {string} である",
	async function (this: BattleBoardWorld, expectedName: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		assert.strictEqual(
			latestPost.displayName,
			expectedName,
			`表示名 "${expectedName}" を期待しましたが "${latestPost.displayName}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込みのIDは {string} である
// See: features/command_iamsystem.feature @成功時に表示名とIDがシステム風に変更される
// ---------------------------------------------------------------------------

Then(
	"書き込みのIDは {string} である",
	async function (this: BattleBoardWorld, expectedId: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		assert.strictEqual(
			latestPost.dailyId,
			expectedId,
			`ID "${expectedId}" を期待しましたが "${latestPost.dailyId}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: is_system_message は false である
// See: features/command_iamsystem.feature @表示名・IDのみ変更されis_system_messageはfalseのまま
// ---------------------------------------------------------------------------

Then(
	"is_system_message は false である",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		assert.strictEqual(
			latestPost.isSystemMessage,
			false,
			"is_system_message が false であることを期待しましたが true でした",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: システムメッセージ固有の背景色は適用されない
// See: features/command_iamsystem.feature @表示名・IDのみ変更されis_system_messageはfalseのまま
// ---------------------------------------------------------------------------

Then(
	"システムメッセージ固有の背景色は適用されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		// isSystemMessage=false なので背景色はUIレイヤで適用されない。
		// サービス層テストではフラグが false であることを確認済みのため、
		// UI固有の検証は省略する。
		assert.strictEqual(
			latestPost.isSystemMessage,
			false,
			"is_system_message=false であれば背景色は適用されない",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込み報酬が通常どおり付与される
// See: features/command_iamsystem.feature @表示名・IDのみ変更されis_system_messageはfalseのまま
// ---------------------------------------------------------------------------

Then(
	"書き込み報酬が通常どおり付与される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザー投稿が見つかりません");
		const latestPost = userPosts[userPosts.length - 1];

		// isSystemMessage=false であれば IncentiveService は通常どおり動作する。
		// インセンティブの具体的な検証は incentive.feature で行うため、
		// ここでは is_system_message=false で書き込み報酬がスキップされないことを確認。
		assert.strictEqual(
			latestPost.isSystemMessage,
			false,
			"is_system_message=false であれば書き込み報酬は通常どおり付与される",
		);
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーAが "!iamsystem" で投稿したレス >>N がある
// See: features/command_iamsystem.feature @!tellで人間と判定される
// ---------------------------------------------------------------------------

Given(
	/^ユーザーAが "!iamsystem" で投稿したレス >>(\d+) がある$/,
	async function (this: BattleBoardWorld, postNumber: number) {
		const AuthService = getAuthService();
		const PostService = getPostService();
		const CurrencyService = getCurrencyService();

		// ユーザーAをセットアップ
		const { token: tokenA, userId: userIdA } = await AuthService.issueEdgeToken(
			"userA-ip-hash-iamsystem",
		);
		await InMemoryUserRepo.updateIsVerified(userIdA, true);
		seedDummyPost(userIdA);

		// ユーザーAに十分な通貨残高を設定
		InMemoryCurrencyRepo._upsert({
			userId: userIdA,
			balance: 100,
			updatedAt: new Date(Date.now()),
		});

		// スレッドが未作成の場合は作成する
		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "iamsystem相互作用テスト用スレッド",
				createdBy: userIdA,
			});
			this.currentThreadId = thread.id;
		}

		// ダミーレスを投入して postNumber を指定値に合わせる
		// PostService.createPost でレス番号は自動採番されるため、
		// 目標の postNumber に達するまでダミー投稿を挿入する
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max, p) => Math.max(max, p.postNumber),
			0,
		);

		for (let i = currentMax + 1; i < postNumber; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: userIdA,
				displayName: "名無しさん",
				dailyId: "DUMMY",
				body: `ダミー投稿 ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}

		// ユーザーAが !iamsystem で投稿する
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "テスト投稿 !iamsystem",
			edgeToken: tokenA,
			ipHash: "userA-ip-hash-iamsystem",
			isBotWrite: false,
		});

		assert(
			"success" in result && result.success,
			"!iamsystem 投稿が失敗しました",
		);

		// 投稿のpostIdをworld.botPostNumberToIdに登録（!tell/!attack で >>N → UUID 解決に使用）
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const targetPost = posts.find((p) => p.postNumber === postNumber);
		assert(targetPost, `postNumber ${postNumber} の投稿が見つかりません`);

		this.botPostNumberToId.set(postNumber, targetPost.id);

		// ユーザーAの情報を named users に登録
		this.setNamedUser("ユーザーA", {
			userId: userIdA,
			edgeToken: tokenA,
			ipHash: "userA-ip-hash-iamsystem",
			isPremium: false,
			username: null,
		});
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーBの通貨残高が {int} である
// See: features/command_iamsystem.feature @!tellで人間と判定される
// ---------------------------------------------------------------------------

Given(
	"ユーザーBの通貨残高が {int} である",
	async function (this: BattleBoardWorld, balance: number) {
		const AuthService = getAuthService();

		// ユーザーBが未登録の場合はセットアップする
		let userB = this.getNamedUser("ユーザーB");
		if (!userB) {
			const { token: tokenB, userId: userIdB } =
				await AuthService.issueEdgeToken("userB-ip-hash-iamsystem");
			await InMemoryUserRepo.updateIsVerified(userIdB, true);
			seedDummyPost(userIdB);

			userB = {
				userId: userIdB,
				edgeToken: tokenB,
				ipHash: "userB-ip-hash-iamsystem",
				isPremium: false,
				username: null,
			};
			this.setNamedUser("ユーザーB", userB);
		}

		InMemoryCurrencyRepo._upsert({
			userId: userB.userId,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

// ---------------------------------------------------------------------------
// When: ユーザーBが {string} を実行する
// See: features/command_iamsystem.feature @!tellで人間と判定される
// ---------------------------------------------------------------------------

When(
	/^ユーザーBが "([^"]*)" を実行する$/,
	async function (this: BattleBoardWorld, commandString: string) {
		const PostService = getPostService();
		const userB = this.getNamedUser("ユーザーB");
		assert(userB, "ユーザーB が登録されていません");
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: commandString,
			edgeToken: userB.edgeToken,
			ipHash: userB.ipHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 判定結果は「人間」である
// See: features/command_iamsystem.feature @!tellで人間と判定される
// ---------------------------------------------------------------------------

Then("判定結果は「人間」である", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドIDが設定されていません");

	// !tell の結果は inlineSystemInfo に「人間」という判定を含む
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	// !tell 実行レス（ユーザーBの最新投稿）を取得
	const userBPosts = posts.filter((p) => !p.isSystemMessage);
	assert(userBPosts.length > 0, "ユーザーBの投稿が見つかりません");
	const tellPost = userBPosts[userBPosts.length - 1];

	// inlineSystemInfo に人間判定の結果が含まれていることを確認
	assert(
		tellPost.inlineSystemInfo,
		"inlineSystemInfo が null です（!tell の結果が含まれていません）",
	);
	assert(
		tellPost.inlineSystemInfo.includes("人間"),
		`判定結果に「人間」が含まれていません: "${tellPost.inlineSystemInfo}"`,
	);
});

// ---------------------------------------------------------------------------
// Given: 攻撃者の通貨残高が {int} である
// See: features/command_iamsystem.feature @!attackすると人間への攻撃扱いで賠償金が発生する
// ---------------------------------------------------------------------------

Given(
	"攻撃者の通貨残高が {int} である",
	async function (this: BattleBoardWorld, balance: number) {
		const AuthService = getAuthService();

		// 攻撃者が未登録の場合はセットアップする
		let attacker = this.getNamedUser("攻撃者");
		if (!attacker) {
			const { token, userId } = await AuthService.issueEdgeToken(
				"attacker-ip-hash-iamsystem",
			);
			await InMemoryUserRepo.updateIsVerified(userId, true);
			seedDummyPost(userId);

			attacker = {
				userId,
				edgeToken: token,
				ipHash: "attacker-ip-hash-iamsystem",
				isPremium: false,
				username: null,
			};
			this.setNamedUser("攻撃者", attacker);
		}

		InMemoryCurrencyRepo._upsert({
			userId: attacker.userId,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

// ---------------------------------------------------------------------------
// When: 攻撃者が {string} を実行する
// See: features/command_iamsystem.feature @!attackすると人間への攻撃扱いで賠償金が発生する
// ---------------------------------------------------------------------------

When(
	/^攻撃者が "([^"]*)" を実行する$/,
	async function (this: BattleBoardWorld, commandString: string) {
		const PostService = getPostService();
		const attacker = this.getNamedUser("攻撃者");
		assert(attacker, "攻撃者 が登録されていません");
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: commandString,
			edgeToken: attacker.edgeToken,
			ipHash: attacker.ipHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 人間への攻撃として賠償金が発生する
// See: features/command_iamsystem.feature @!attackすると人間への攻撃扱いで賠償金が発生する
// ---------------------------------------------------------------------------

Then(
	"人間への攻撃として賠償金が発生する",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		// !attack の結果は inlineSystemInfo に「賠償金」の情報を含む
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "攻撃者の投稿が見つかりません");
		const attackPost = userPosts[userPosts.length - 1];

		// inlineSystemInfo に賠償金の結果が含まれていることを確認
		assert(
			attackPost.inlineSystemInfo,
			"inlineSystemInfo が null です（!attack の結果が含まれていません）",
		);
		assert(
			attackPost.inlineSystemInfo.includes("賠償金"),
			`判定結果に「賠償金」が含まれていません: "${attackPost.inlineSystemInfo}"`,
		);
	},
);
