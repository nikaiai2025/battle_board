/**
 * authentication.feature ステップ定義
 *
 * 書き込み認証（edge-token + 認証コード）と日次リセットIDに関するシナリオを実装する。
 *
 * サービス層は動的 require で取得する。
 * これは mock-installer.ts の installMocks() が BeforeAll フックで呼ばれ、
 * キャッシュを書き換えた後にサービス層の関数を呼ぶために必要。
 * 静的 import だとモジュールロード時にキャッシュ書き換え前の本番コードが固定される。
 *
 * See: features/authentication.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 authentication.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryAdminRepo,
	InMemoryAuthCodeRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryTurnstileClient,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
// ウェルカムシーケンス抑止用ヘルパー（TASK-248 で追加）
// See: features/welcome.feature
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// World 型拡張（authentication.feature 向け追加プロパティ）
// ---------------------------------------------------------------------------

/**
 * BattleBoardWorld に authentication.feature 向けプロパティを追加する型宣言。
 * write_token（専ブラ認証フロー G4）の保存に使用する。
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/specialist_browser_compat.feature @専ブラ認証フロー
 */
declare module "../support/world" {
	interface BattleBoardWorld {
		/** write_token（専ブラ向け認証橋渡しトークン、認証成功時に設定） */
		currentWriteToken: string | null;
	}
}

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

/** AuthService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

/** PostService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

/** AdminUserRepository を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getAdminUserRepository() {
	return require("../../src/lib/infrastructure/repositories/admin-user-repository") as typeof import("../../src/lib/infrastructure/repositories/admin-user-repository");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "livebot";

// ---------------------------------------------------------------------------
// Given: 未認証ユーザーが書き込みを送信する
// See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
// ---------------------------------------------------------------------------

/**
 * 未認証のユーザーが書き込みフォームから書き込みを送信する。
 * edge-token を保持しない状態（currentEdgeToken = null）を設定する。
 */
Given(
	"未認証のユーザーが書き込みフォームから書き込みを送信する",
	async function (this: BattleBoardWorld) {
		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "認証テスト用スレッド",
			createdBy: "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = thread.title;
		this.currentEdgeToken = null;
		this.currentIpHash = DEFAULT_IP_HASH;
	},
);

// ---------------------------------------------------------------------------
// When: サーバーが書き込みリクエストを処理する
// See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
// ---------------------------------------------------------------------------

/**
 * サーバーが書き込みリクエストを処理する。
 * 未認証（edgeToken=null）で createPost を呼び出す。
 */
When(
	"サーバーが書き込みリクエストを処理する",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "テスト書き込み本文",
			edgeToken: null, // 未認証
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("authRequired" in result && result.authRequired) {
			this.lastResult = {
				type: "authRequired",
				code: result.code,
				edgeToken: result.edgeToken,
			};
			// 発行された edge-token を保存する
			this.currentEdgeToken = result.edgeToken;
		} else if ("success" in result && !result.success) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		} else {
			this.lastResult = { type: "success", data: result };
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 認証コード入力ページへの案内が表示される
// See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
// ---------------------------------------------------------------------------

Then(
	"認証コード入力ページへの案内が表示される",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"authRequired",
			`authRequired が返されることを期待しましたが "${this.lastResult.type}" でした`,
		);
	},
);

Then("6桁の認証コードが発行される", async function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "authRequired",
		"authRequired 状態が必要です",
	);
	// authRequired に含まれる code が発行済みであることを確認
	const code = this.lastResult.code;
	assert(code, "認証コードが発行されていません");
	assert(
		/^\d{6}$/.test(code),
		`6桁の数字コードを期待しましたが "${code}" でした`,
	);
});

Then("edge-token Cookie が発行される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "authRequired",
		"authRequired 状態が必要です",
	);
	const token = this.lastResult.edgeToken;
	assert(token, "edge-token が発行されていません");
	assert(token.length > 0, "edge-token が空です");
});

// ---------------------------------------------------------------------------
// Given: 有効な認証コードを持つユーザー
// See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
// ---------------------------------------------------------------------------

/**
 * ユーザーが有効な6桁認証コードを持っている。
 * edge-token を発行し、認証コードを発行して World に保存する。
 */
Given(
	"ユーザーが有効な6桁認証コードを持っている",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		// edge-token を発行する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;

		// 認証コードを発行する（有効期限内）
		const { code } = await AuthService.issueAuthCode(DEFAULT_IP_HASH, token);
		// World の lastResult に code を一時保存する
		this.lastResult = { type: "authRequired", code, edgeToken: token };
	},
);

/**
 * ユーザーが有効期限切れの6桁認証コードを持っている。
 * 有効期限を過去に設定した認証コードを直接ストアに挿入する。
 */
Given(
	"ユーザーが有効期限切れの6桁認証コードを持っている",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		// edge-token を発行する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;

		// 有効期限切れの認証コードを直接ストアに挿入する
		const expiredAt = new Date(Date.now() - 1000); // 1秒前に期限切れ
		InMemoryAuthCodeRepo._insert({
			id: crypto.randomUUID(),
			code: "123456",
			tokenId: token,
			ipHash: DEFAULT_IP_HASH,
			verified: false,
			expiresAt: expiredAt,
			createdAt: new Date(Date.now() - 700 * 1000),
		});
		this.lastResult = {
			type: "authRequired",
			code: "123456",
			edgeToken: token,
		};
	},
);

// ---------------------------------------------------------------------------
// Given: Turnstile 検証結果の設定
// See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
// ---------------------------------------------------------------------------

Given(
	"ユーザーがTurnstile検証を通過している",
	function (this: BattleBoardWorld) {
		// See: features/support/in-memory/turnstile-client.ts @setStubResult
		InMemoryTurnstileClient.setStubResult(true);
	},
);

Given(
	"ユーザーがTurnstile検証に失敗している",
	function (this: BattleBoardWorld) {
		// See: features/support/in-memory/turnstile-client.ts @setStubResult
		InMemoryTurnstileClient.setStubResult(false);
	},
);

// ---------------------------------------------------------------------------
// When: /auth/verify で認証コードを送信する
// See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
// ---------------------------------------------------------------------------

/**
 * ユーザーが /auth/verify で認証コードを送信する。
 * AuthService.verifyAuthCode を呼び出し、戻り値 { success, writeToken? } を処理する。
 * 認証成功時は write_token を World に保存する（専ブラ向け G4 対応）。
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */
When(
	/^ユーザーが \/auth\/verify で認証コードを送信する$/,
	async function (this: BattleBoardWorld) {
		assert(this.lastResult?.type === "authRequired", "認証コードが必要です");
		const code = this.lastResult.code;

		const AuthService = getAuthService();

		// AuthService.verifyAuthCode を呼び出す（Turnstileトークンはダミー）
		// 戻り値: { success: boolean, writeToken?: string }
		const result = await AuthService.verifyAuthCode(
			code,
			"dummy-turnstile-token",
			DEFAULT_IP_HASH,
		);

		if (result.success) {
			// write_token を World に保存する（専ブラシナリオで使用）
			this.currentWriteToken = result.writeToken ?? null;
			this.lastResult = {
				type: "success",
				data: { verified: true, writeToken: result.writeToken },
			};
		} else {
			this.lastResult = {
				type: "error",
				message: "認証に失敗しました",
				code: "AUTH_FAILED",
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 認証結果の検証
// See: features/authentication.feature
// ---------------------------------------------------------------------------

Then("edge-token が有効化される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "success",
		`認証成功を期待しましたが "${this.lastResult?.type}" でした`,
	);
});

/**
 * write_tokenが発行される。
 * verifyAuthCode 成功時に write_token が World に保存されていることを確認する。
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */
Then("write_tokenが発行される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "success",
		`認証成功を期待しましたが "${this.lastResult?.type}" でした`,
	);
	// write_token は World.currentWriteToken に保存されている
	assert(this.currentWriteToken, "write_token が発行されていません");
	// 32文字 hex の形式を確認する
	assert(
		/^[0-9a-f]{32}$/.test(this.currentWriteToken),
		`write_token が 32文字 hex 形式であることを期待しましたが "${this.currentWriteToken}" でした`,
	);
});

Then("書き込み可能状態になる", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "success",
		`書き込み可能状態（success）を期待しましたが "${this.lastResult?.type}" でした`,
	);
});

Then("認証エラーメッセージが表示される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`認証エラーを期待しましたが "${this.lastResult.type}" でした`,
	);
});

Then("edge-token は有効化されない", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`認証失敗（error）を期待しましたが "${this.lastResult.type}" でした`,
	);
});

// ---------------------------------------------------------------------------
// 日次リセットID: 同日中に異なるスレッドで同一ID
// See: features/authentication.feature @同日中は異なるスレッドでも同一の日次リセットIDが表示される
// ---------------------------------------------------------------------------

/** スレッドA・Bそれぞれへの書き込み結果（dailyId）を保持する */
interface MultiPostRecord {
	postId: string;
	postNumber: number;
	dailyId: string;
}
const multiPostResults: MultiPostRecord[] = [];

When(
	"スレッド {string} とスレッド {string} にそれぞれ書き込む",
	async function (this: BattleBoardWorld, titleA: string, titleB: string) {
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const PostService = getPostService();

		// スレッドAとBを作成する
		const threadA = await InMemoryThreadRepo.create({
			threadKey: (Math.floor(Date.now() / 1000) - 1).toString(),
			boardId: TEST_BOARD_ID,
			title: titleA,
			createdBy: this.currentUserId ?? "system",
		});
		const threadB = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: titleB,
			createdBy: this.currentUserId ?? "system",
		});

		// スレッドAに書き込む
		const resultA = await PostService.createPost({
			threadId: threadA.id,
			body: "スレッドAへの書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		// スレッドBに書き込む
		const resultB = await PostService.createPost({
			threadId: threadB.id,
			body: "スレッドBへの書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		// 書き込み結果を保存する
		multiPostResults.length = 0;
		if ("success" in resultA && resultA.success) {
			const posts = await InMemoryPostRepo.findByThreadId(threadA.id);
			if (posts.length > 0) {
				multiPostResults.push({
					postId: resultA.postId,
					postNumber: resultA.postNumber,
					dailyId: posts[posts.length - 1].dailyId,
				});
			}
		}
		if ("success" in resultB && resultB.success) {
			const posts = await InMemoryPostRepo.findByThreadId(threadB.id);
			if (posts.length > 0) {
				multiPostResults.push({
					postId: resultB.postId,
					postNumber: resultB.postNumber,
					dailyId: posts[posts.length - 1].dailyId,
				});
			}
		}

		this.lastResult = { type: "success", data: multiPostResults };
	},
);

Then(
	"両方の書き込みに同一の日次リセットIDが表示される",
	function (this: BattleBoardWorld) {
		assert(
			multiPostResults.length === 2,
			`2つの書き込み結果が必要ですが ${multiPostResults.length} 件でした`,
		);
		assert.strictEqual(
			multiPostResults[0].dailyId,
			multiPostResults[1].dailyId,
			`同一の日次リセットIDを期待しましたが "${multiPostResults[0].dailyId}" と "${multiPostResults[1].dailyId}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 日次リセットID: 翌日になるとIDがリセットされる
// See: features/authentication.feature @翌日になると日次リセットIDがリセットされる
// ---------------------------------------------------------------------------

/** 昨日の書き込みの日次リセットID */
let yesterdayDailyId: string | null = null;
/** 今日の書き込みの日次リセットID */
let todayDailyId: string | null = null;

Given(
	"ユーザーが昨日の日次リセットIDで書き込みを行っている",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// 「昨日」の時刻を設定する
		const yesterday = new Date(Date.now());
		yesterday.setDate(yesterday.getDate() - 1);
		yesterday.setHours(10, 0, 0, 0);
		this.setCurrentTime(yesterday);

		// edge-token を発行する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// スレッドを作成して昨日の日付で書き込む
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(yesterday.getTime() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "日次リセットIDテスト用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;

		const result = await PostService.createPost({
			threadId: thread.id,
			body: "昨日の書き込み",
			edgeToken: token,
			ipHash: DEFAULT_IP_HASH,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			const posts = await InMemoryPostRepo.findByThreadId(thread.id);
			yesterdayDailyId = posts[posts.length - 1]?.dailyId ?? null;
		}
	},
);

When(
	"日付が変更された後に書き込みを行う",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		// 「今日」の時刻を設定する（昨日の翌日）
		// this.currentTime（昨日のモック時刻）の翌日を設定する。
		// Date.now() はモック時刻（昨日）を返すため、実際の時刻は currentTime から算出する。
		const todayBase = this.currentTime ?? new Date(Date.now());
		const today = new Date(todayBase.getTime() + 24 * 60 * 60 * 1000);
		today.setHours(10, 0, 0, 0);
		this.setCurrentTime(today);

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");
		assert(this.currentThreadId, "スレッドが設定されていません");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "今日の書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
			todayDailyId = posts[posts.length - 1]?.dailyId ?? null;
			this.lastResult = { type: "success", data: result };
		}
	},
);

Then(
	"昨日とは異なる新しい日次リセットIDが表示される",
	function (this: BattleBoardWorld) {
		assert(yesterdayDailyId !== null, "昨日の日次リセットIDが存在しません");
		assert(todayDailyId !== null, "今日の日次リセットIDが存在しません");
		assert.notStrictEqual(
			todayDailyId,
			yesterdayDailyId,
			`翌日に日次リセットIDが変わることを期待しましたが、両方とも "${yesterdayDailyId}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Cookie削除後に再認証しても同日・同一回線では同じIDになる
// See: features/authentication.feature @Cookie削除後に再認証しても同日・同一回線では同じIDになる
// ---------------------------------------------------------------------------

/** 最初の書き込みの日次リセットID */
let firstDailyId: string | null = null;
/** 再認証後の書き込みの日次リセットID */
let reAuthDailyId: string | null = null;

Given(
	"ユーザーが同日中に同一回線から書き込みを行っている",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// edge-token を発行して書き込みを行う
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "再認証テスト用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;

		const result = await PostService.createPost({
			threadId: thread.id,
			body: "再認証前の書き込み",
			edgeToken: token,
			ipHash: DEFAULT_IP_HASH,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			const posts = await InMemoryPostRepo.findByThreadId(thread.id);
			firstDailyId = posts[posts.length - 1]?.dailyId ?? null;
		}
	},
);

Given(
	"ユーザーが edge-token Cookie を削除する",
	function (this: BattleBoardWorld) {
		// edge-token を null にして Cookie 削除をシミュレートする
		this.currentEdgeToken = null;
	},
);

Given(
	"ユーザーが認証コードで再認証する",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		// 同一 IP から新しい edge-token を発行する（同日・同一回線なので同じ ipHash）
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		// ipHash は同じまま（同一回線）
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);
	},
);

When("同じスレッドに再度書き込む", async function (this: BattleBoardWorld) {
	const PostService = getPostService();

	assert(this.currentEdgeToken, "ユーザーが再認証済みである必要があります");
	assert(this.currentThreadId, "スレッドが設定されていません");

	const result = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "再認証後の書き込み",
		edgeToken: this.currentEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});

	if ("success" in result && result.success) {
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		reAuthDailyId = posts[posts.length - 1]?.dailyId ?? null;
		this.lastResult = { type: "success", data: result };
	}
});

Then(
	"再認証前と同一の日次リセットIDが表示される",
	function (this: BattleBoardWorld) {
		assert(firstDailyId !== null, "再認証前の日次リセットIDが存在しません");
		assert(reAuthDailyId !== null, "再認証後の日次リセットIDが存在しません");
		assert.strictEqual(
			reAuthDailyId,
			firstDailyId,
			`同日・同一回線では同一の日次リセットIDを期待しましたが "${firstDailyId}" と "${reAuthDailyId}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 日付変更のタイミングでIDが混在しない
// See: features/authentication.feature @日付変更のタイミングでIDが混在しない
// ---------------------------------------------------------------------------

/** 日付変更直前の書き込みの日次リセットID */
let beforeMidnightDailyId: string | null = null;
/** 日付変更直後の書き込みの日次リセットID */
let afterMidnightDailyId: string | null = null;

Given("現在時刻が日付変更直前である", function (this: BattleBoardWorld) {
	// JST 23:59:00 に固定設定する
	// JST = UTC+9 なので、JST 23:59 = UTC 14:59
	// 固定 UTC 日時（2026-03-11T14:59:00Z）= JST 2026-03-11 23:59
	// advanceTimeByMinutes(2) 後 → UTC 2026-03-11T15:01:00Z = JST 2026-03-12 00:01
	// これにより getTodayJst() が日付境界をまたぐことを保証する
	const utcDate = new Date("2026-03-11T14:59:00.000Z");
	this.setCurrentTime(utcDate);
});

When(
	"日付変更をまたいで書き込みを行う",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "日付変更テスト用スレッド",
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;

		// 日付変更直前の書き込み（現在の仮想時刻で）
		const resultBefore = await PostService.createPost({
			threadId: thread.id,
			body: "日付変更直前の書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in resultBefore && resultBefore.success) {
			const posts = await InMemoryPostRepo.findByThreadId(thread.id);
			beforeMidnightDailyId = posts[posts.length - 1]?.dailyId ?? null;
		}

		// 日付変更直後に時刻を進める（JST 0:01）
		this.advanceTimeByMinutes(2);

		// 日付変更直後の書き込み
		const resultAfter = await PostService.createPost({
			threadId: thread.id,
			body: "日付変更直後の書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in resultAfter && resultAfter.success) {
			const posts = await InMemoryPostRepo.findByThreadId(thread.id);
			afterMidnightDailyId = posts[posts.length - 1]?.dailyId ?? null;
			this.lastResult = { type: "success", data: resultAfter };
		}
	},
);

Then(
	"日付変更後の書き込みには新しいIDが適用される",
	function (this: BattleBoardWorld) {
		assert(
			beforeMidnightDailyId !== null,
			"日付変更前の日次リセットIDが存在しません",
		);
		assert(
			afterMidnightDailyId !== null,
			"日付変更後の日次リセットIDが存在しません",
		);
		assert.notStrictEqual(
			afterMidnightDailyId,
			beforeMidnightDailyId,
			`日付変更後に新しいIDが適用されることを期待しましたが、両方とも "${beforeMidnightDailyId}" でした`,
		);
	},
);

Then(
	"日付変更前の書き込みのIDは変更されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		assert(
			beforeMidnightDailyId !== null,
			"日付変更前の日次リセットIDが存在しません",
		);

		// スレッド内の全レスを取得して、最初のレスのIDを確認する
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "レスが存在しません");

		const firstPost = posts[0];
		assert.strictEqual(
			firstPost.dailyId,
			beforeMidnightDailyId,
			`日付変更前のレスのIDが変更されていないことを期待しましたが "${firstPost.dailyId}" でした（期待値: "${beforeMidnightDailyId}"）`,
		);
	},
);

// ---------------------------------------------------------------------------
// G1: 認証バイパス防止
// See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
// ---------------------------------------------------------------------------

/**
 * ユーザーが edge-token を発行されているが認証コードを未入力である。
 * issueEdgeToken で edge-token を発行するが、verifyAuthCode を呼ばないため
 * isVerified = false のまま（認証コード未入力状態）。
 *
 * See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
 */
Given(
	"ユーザーがedge-tokenを発行されているが認証コードを未入力である",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		// edge-token を発行する（isVerified=false のまま）
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "G1認証バイパス防止テスト用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;
	},
);

/**
 * ユーザーが書き込みを送信する（G1シナリオ）。
 * 未認証（isVerified=false）ユーザーが createPost を呼び出す。
 * PostService は verifyEdgeToken で not_verified を検出し、authRequired を返す。
 *
 * See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 */
When("ユーザーが書き込みを送信する", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	assert(this.currentEdgeToken, "edge-token が設定されていません");

	const PostService = getPostService();

	const result = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "G1テスト書き込み",
		edgeToken: this.currentEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});

	if ("authRequired" in result && result.authRequired) {
		this.lastResult = {
			type: "authRequired",
			code: result.code,
			edgeToken: result.edgeToken,
		};
		this.currentEdgeToken = result.edgeToken;
	} else if ("success" in result && result.success) {
		this.lastResult = { type: "success", data: result };
	} else {
		this.lastResult = {
			type: "error",
			message: (result as any).error,
			code: (result as any).code,
		};
	}
});

/**
 * 認証コード入力ページへの案内が再度表示される（G1シナリオ）。
 * authRequired が返されていることを確認する。
 *
 * See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 */
Then(
	"認証コード入力ページへの案内が再度表示される",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"authRequired",
			`authRequired が返されることを期待しましたが "${this.lastResult.type}" でした`,
		);
	},
);

/**
 * 書き込みは処理されない（G1シナリオ）。
 * スレッドにレスが追加されていないことを確認する。
 *
 * See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 */
Then("書き込みは処理されない", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert.strictEqual(
		posts.length,
		0,
		`書き込みが処理されないことを期待しましたが ${posts.length} 件のレスが存在します`,
	);
});

// ---------------------------------------------------------------------------
// G2: IP変更時の継続性
// See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
// ---------------------------------------------------------------------------

/**
 * ユーザーのIPアドレスが変わった後に書き込みを行う（G2シナリオ）。
 * 書き込み可能状態（isVerified=true）のユーザーが異なるIPハッシュで createPost を呼び出す。
 * IP整合チェックはソフトチェックのため、IP変更後も書き込み成功する。
 *
 * See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 * See: docs/architecture/architecture.md §5.2 > IP整合チェック方針（ソフトチェック）
 */
When(
	"ユーザーのIPアドレスが変わった後に書き込みを行う",
	async function (this: BattleBoardWorld) {
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const PostService = getPostService();

		// isVerified=true に設定して「認証済み」状態にする（G2: IP変更後の継続性テスト）
		// common.steps.ts の issueEdgeToken はisVerified=falseで作るため、ここで認証済み状態にする
		await InMemoryUserRepo.updateIsVerified(this.currentUserId, true);

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "G2 IP変更テスト用スレッド",
			createdBy: this.currentUserId,
		});
		this.currentThreadId = thread.id;

		// 異なるIPハッシュで書き込む（IPアドレス変更をシミュレート）
		const differentIpHash = "bdd-test-ip-hash-CHANGED-sha512-placeholder";

		const result = await PostService.createPost({
			threadId: thread.id,
			body: "IP変更後の書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: differentIpHash, // 異なるIPハッシュ
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
		} else {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

/**
 * 書き込みは正常に処理される（G2シナリオ）。
 * IP変更後も書き込みが成功することを確認する。
 *
 * See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 */
Then("書き込みは正常に処理される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`書き込み成功を期待しましたが "${this.lastResult.type}" でした`,
	);
});

// ---------------------------------------------------------------------------
// G3: edge-token 有効期限
// See: features/authentication.feature @edge-token Cookieの有効期限が切れると再認証が必要になる
// ---------------------------------------------------------------------------

/**
 * edge-token Cookie の有効期限が切れた後に書き込みを行う（G3シナリオ）。
 * edge-token を World から削除（null に設定）して期限切れをシミュレートし、
 * null edgeToken で createPost を呼び出す。
 *
 * See: features/authentication.feature @edge-token Cookieの有効期限が切れると再認証が必要になる
 */
When(
	"edge-token Cookieの有効期限が切れた後に書き込みを行う",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "G3 edge-token期限切れテスト用スレッド",
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;

		// edge-token Cookie の有効期限切れをシミュレート（edgeToken=null）
		const result = await PostService.createPost({
			threadId: thread.id,
			body: "G3テスト書き込み",
			edgeToken: null, // Cookie期限切れ
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("authRequired" in result && result.authRequired) {
			this.lastResult = {
				type: "authRequired",
				code: result.code,
				edgeToken: result.edgeToken,
			};
			// 新しく発行された edge-token を保存する
			this.currentEdgeToken = result.edgeToken;
		} else if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

/**
 * 新しいedge-tokenが発行される（G3シナリオ）。
 * authRequired が返され、新しい edge-token が World に保存されていることを確認する。
 *
 * See: features/authentication.feature @edge-token Cookieの有効期限が切れると再認証が必要になる
 */
Then("新しいedge-tokenが発行される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "authRequired",
		`authRequired が返されることを期待しましたが "${this.lastResult?.type}" でした`,
	);
	const token = this.lastResult.edgeToken;
	assert(token, "新しい edge-token が発行されていません");
	assert(token.length > 0, "新しい edge-token が空です");
});

// ---------------------------------------------------------------------------
// 管理者ログイン（メール + パスワード）
// See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
// See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
// ---------------------------------------------------------------------------

/** テスト用管理者アカウントの固定値 */
const TEST_ADMIN_ID = "test-admin-user-id-auth-001";
const TEST_ADMIN_EMAIL = "admin@battleboard.test";
const TEST_ADMIN_PASSWORD = "admin-secret-password";
const TEST_ADMIN_WRONG_PASSWORD = "wrong-password";

/**
 * 管理者アカウントが存在する。
 * インメモリストアに管理者ユーザーと認証情報を登録する。
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/support/in-memory/admin-repository.ts > _insert, _insertCredential
 */
Given("管理者アカウントが存在する", function (this: BattleBoardWorld) {
	// 管理者ユーザーをストアに登録する
	InMemoryAdminRepo._insert({
		id: TEST_ADMIN_ID,
		role: "admin",
		createdAt: new Date(Date.now()),
	});
	// 認証情報（メール + パスワード）を登録する
	InMemoryAdminRepo._insertCredential(
		TEST_ADMIN_EMAIL,
		TEST_ADMIN_PASSWORD,
		TEST_ADMIN_ID,
	);
});

/**
 * 管理者が正しいメールアドレスとパスワードを入力してログインする。
 * AdminUserRepository.loginWithPassword を呼び出す。
 *
 * See: src/lib/infrastructure/repositories/admin-user-repository.ts > loginWithPassword
 * See: features/support/in-memory/admin-repository.ts > loginWithPassword
 */
When(
	"管理者が正しいメールアドレスとパスワードを入力してログインする",
	async function (this: BattleBoardWorld) {
		const AdminUserRepository = getAdminUserRepository();
		const result = await AdminUserRepository.loginWithPassword(
			TEST_ADMIN_EMAIL,
			TEST_ADMIN_PASSWORD,
		);

		if (result.success) {
			this.currentAdminId = result.userId;
			this.adminSessionToken = result.sessionToken;
			this.isAdmin = true;
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: "ログインに失敗しました",
				code: result.reason,
			};
		}
	},
);

/**
 * 管理者が誤ったパスワードでログインを試みる。
 * 誤ったパスワードで AdminUserRepository.loginWithPassword を呼び出す。
 *
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 * See: features/support/in-memory/admin-repository.ts > loginWithPassword
 */
When(
	"管理者が誤ったパスワードでログインを試みる",
	async function (this: BattleBoardWorld) {
		const AdminUserRepository = getAdminUserRepository();
		const result = await AdminUserRepository.loginWithPassword(
			TEST_ADMIN_EMAIL,
			TEST_ADMIN_WRONG_PASSWORD,
		);

		if (result.success) {
			this.currentAdminId = result.userId;
			this.adminSessionToken = result.sessionToken;
			this.isAdmin = true;
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: "ログインに失敗しました",
				code: result.reason,
			};
		}
	},
);

/**
 * 管理者セッションが作成される。
 * adminSessionToken が設定されており、isAdmin が true であることを確認する。
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 */
Then("管理者セッションが作成される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`管理者ログイン成功を期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(
		this.adminSessionToken,
		"管理者セッショントークンが設定されていません",
	);
	assert(this.adminSessionToken.length > 0, "管理者セッショントークンが空です");
	assert.strictEqual(
		this.isAdmin,
		true,
		"管理者フラグが true であることを期待しました",
	);
});

/**
 * 管理画面にアクセスできる。
 * 管理者セッションが存在することを確認する（実際のUIアクセスは不要）。
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト（UIアクセスは検証外）
 */
Then("管理画面にアクセスできる", function (this: BattleBoardWorld) {
	// サービス層テストのため、管理者セッションが存在することをもって
	// 管理画面へのアクセス権があると判断する
	assert(
		this.adminSessionToken,
		"管理者セッショントークンが存在することで管理画面アクセス権を確認します",
	);
	assert(this.currentAdminId, "管理者 ID が設定されていることを確認します");
});

/**
 * ログインエラーメッセージが表示される。
 * 最後の操作がエラーで終わったことを検証する。
 *
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 */
Then("ログインエラーメッセージが表示される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`ログインエラーを期待しましたが "${this.lastResult.type}" でした`,
	);
	const errorResult = this.lastResult as {
		type: "error";
		message: string;
		code?: string;
	};
	assert(
		errorResult.code === "invalid_credentials" ||
			errorResult.message.length > 0,
		"ログインエラーメッセージが存在することを確認します",
	);
});

/**
 * 管理者セッションは作成されない。
 * adminSessionToken が null であることを確認する。
 *
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 */
Then("管理者セッションは作成されない", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`セッション未作成（error）を期待しましたが "${this.lastResult.type}" でした`,
	);
	assert.strictEqual(
		this.adminSessionToken,
		null,
		"管理者セッショントークンが null であることを期待しましたが設定されていました",
	);
});
