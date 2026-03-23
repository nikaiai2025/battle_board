/**
 * posting.feature ステップ定義
 *
 * 書き込み機能（無料ユーザー/有料ユーザー、バリデーション、同時書き込み）に関するシナリオを実装する。
 *
 * サービス層は動的 require で取得する（モック差し替え後に呼ばれるため）。
 *
 * See: features/posting.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 posting.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld, UserContext } from "../support/world";

// See: features/authentication.feature @認証フロー是正 (TASK-041)
// issueEdgeToken は isVerified=false でユーザーを作成するため、
// 書き込みを行うステップでは必ず updateIsVerified(userId, true) を呼ぶ必要がある。

// ウェルカムシーケンス抑止用ヘルパー（TASK-248 で追加）
// See: features/welcome.feature
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "livebot";

/** 名前付きユーザーごとの IP ハッシュを生成する */
function getIpHashForUser(name: string): string {
	return `bdd-test-ip-hash-${name}-sha512-placeholder`;
}

// ---------------------------------------------------------------------------
// Given: 無料ユーザーがスレッドを閲覧している
// See: features/posting.feature @無料ユーザーが書き込みを行う
// ---------------------------------------------------------------------------

/**
 * 無料ユーザーがスレッド "{string}" を閲覧している。
 * edge-token を発行し、指定タイトルのスレッドを作成して World に設定する。
 */
Given(
	"無料ユーザーがスレッド {string} を閲覧している",
	async function (this: BattleBoardWorld, title: string) {
		const AuthService = getAuthService();

		// 無料ユーザーとして edge-token を発行する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		this.currentIsPremium = false;
		this.currentUsername = null;
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: userId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;
	},
);

// ---------------------------------------------------------------------------
// Given: 有料ユーザーがユーザーネーム付きで設定済み
// See: features/posting.feature @有料ユーザーがユーザーネーム付きで書き込みを行う
// ---------------------------------------------------------------------------

/**
 * 有料ユーザーがユーザーネーム "{string}" を設定済みである。
 * isPremium=true、username 設定済みのユーザーを作成する。
 */
Given(
	"有料ユーザーがユーザーネーム {string} を設定済みである",
	async function (this: BattleBoardWorld, username: string) {
		const AuthService = getAuthService();

		// edge-token を発行する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		this.currentIsPremium = true;
		this.currentUsername = username;
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// インメモリのユーザーストアを直接更新して isPremium=true、username を設定する
		const user = await InMemoryUserRepo.findById(userId);
		if (user) {
			InMemoryUserRepo._insert({ ...user, isPremium: true, username });
		}
	},
);

/**
 * スレッド "{string}" を閲覧している — 有料ユーザーシナリオで使用する。
 * 現在のユーザー（有料）が指定タイトルのスレッドを閲覧する状態を設定する。
 */
Given(
	"スレッド {string} を閲覧している",
	async function (this: BattleBoardWorld, title: string) {
		assert(this.currentUserId, "ユーザーが設定されていません");
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーがスレッドを閲覧している（バリデーションシナリオ用）
// See: features/posting.feature @本文が空の場合は書き込みが行われない
// ---------------------------------------------------------------------------

/**
 * ユーザーがスレッド "{string}" を閲覧している。
 * ログイン済みユーザーとしてスレッドを設定する。
 */
Given(
	"ユーザーがスレッド {string} を閲覧している",
	async function (this: BattleBoardWorld, title: string) {
		const AuthService = getAuthService();

		// ログイン済みユーザーとして edge-token を発行する
		if (!this.currentEdgeToken) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
			// See: features/authentication.feature @認証フロー是正
			await InMemoryUserRepo.updateIsVerified(userId, true);
			// ウェルカムシーケンス抑止（TASK-248）
			seedDummyPost(userId);
		}

		// スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;
	},
);

// ---------------------------------------------------------------------------
// When: 空の本文で書き込みボタンを押す
// See: features/posting.feature @本文が空の場合は書き込みが行われない
// ---------------------------------------------------------------------------

When(
	"本文を空にして書き込みボタンを押す",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "",
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
// Then: 書き込み結果の検証
// See: features/posting.feature
// ---------------------------------------------------------------------------

Then("レスがスレッドに追加される", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`書き込み成功を期待しましたが "${this.lastResult.type}" でした: ${this.lastResult.type === "error" ? this.lastResult.message : ""}`,
	);
	// スレッドに実際にレスが追加されているか確認する
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert(posts.length > 0, "スレッドにレスが追加されていません");
});

Then(
	"表示名は {string} である",
	async function (this: BattleBoardWorld, expectedDisplayName: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドにレスが存在しません");

		// 最後に追加されたレスの表示名を確認する
		const lastPost = posts[posts.length - 1];
		assert.strictEqual(
			lastPost.displayName,
			expectedDisplayName,
			`表示名が "${expectedDisplayName}" であることを期待しましたが "${lastPost.displayName}" でした`,
		);
	},
);

Then("日次リセットIDが表示される", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert(posts.length > 0, "スレッドにレスが存在しません");

	const lastPost = posts[posts.length - 1];
	assert(lastPost.dailyId, "日次リセットIDが存在しません");
	assert(lastPost.dailyId.length > 0, "日次リセットIDが空です");
});

Then("レスは追加されない", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert.strictEqual(
		posts.length,
		0,
		`レスが追加されないことを期待しましたが ${posts.length} 件存在します`,
	);
});

// ---------------------------------------------------------------------------
// Given: 複数ユーザーの設定（同時書き込みシナリオ）
// See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" とユーザー "UserB" がスレッド "{string}" を閲覧している。
 * 2人のユーザーを namedUsers に登録し、共通スレッドを設定する。
 */
Given(
	"ユーザー {string} とユーザー {string} がスレッド {string} を閲覧している",
	async function (
		this: BattleBoardWorld,
		userAName: string,
		userBName: string,
		title: string,
	) {
		const AuthService = getAuthService();

		// UserA のセットアップ
		const ipHashA = getIpHashForUser(userAName);
		const { token: tokenA, userId: userIdA } =
			await AuthService.issueEdgeToken(ipHashA);
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userIdA, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userIdA);
		const userCtxA: UserContext = {
			userId: userIdA,
			edgeToken: tokenA,
			ipHash: ipHashA,
			isPremium: false,
			username: null,
		};
		this.setNamedUser(userAName, userCtxA);

		// UserB のセットアップ
		const ipHashB = getIpHashForUser(userBName);
		const { token: tokenB, userId: userIdB } =
			await AuthService.issueEdgeToken(ipHashB);
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userIdB, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userIdB);
		const userCtxB: UserContext = {
			userId: userIdB,
			edgeToken: tokenB,
			ipHash: ipHashB,
			isPremium: false,
			username: null,
		};
		this.setNamedUser(userBName, userCtxB);

		// 共有スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: userIdA,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;

		// currentUser を UserA に設定する
		this.currentEdgeToken = tokenA;
		this.currentUserId = userIdA;
		this.currentIpHash = ipHashA;
	},
);

// ---------------------------------------------------------------------------
// When: 2人が同時に書き込みを行う
// See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
// ---------------------------------------------------------------------------

/** 同時書き込みシナリオの結果を保持する */
interface ConcurrentPostResult {
	userA: { success: boolean; postNumber?: number; error?: string };
	userB: { success: boolean; postNumber?: number; error?: string };
}
let concurrentPostResult: ConcurrentPostResult | null = null;

When(
	"{string} と {string} が同時に書き込みを行う",
	async function (
		this: BattleBoardWorld,
		userAName: string,
		userBName: string,
	) {
		const PostService = getPostService();

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");

		const userCtxA = this.getNamedUser(userAName);
		const userCtxB = this.getNamedUser(userBName);
		assert(userCtxA, `ユーザー "${userAName}" が登録されていません`);
		assert(userCtxB, `ユーザー "${userBName}" が登録されていません`);

		// Promise.all で並行書き込みを実行する
		const [resultA, resultB] = await Promise.all([
			PostService.createPost({
				threadId: this.currentThreadId,
				body: `${userAName}の書き込み`,
				edgeToken: userCtxA.edgeToken,
				ipHash: userCtxA.ipHash,
				isBotWrite: false,
			}),
			PostService.createPost({
				threadId: this.currentThreadId,
				body: `${userBName}の書き込み`,
				edgeToken: userCtxB.edgeToken,
				ipHash: userCtxB.ipHash,
				isBotWrite: false,
			}),
		]);

		concurrentPostResult = {
			userA: {
				success: "success" in resultA && (resultA as any).success === true,
				postNumber:
					"success" in resultA && (resultA as any).success
						? (resultA as any).postNumber
						: undefined,
				error: "error" in resultA ? (resultA as any).error : undefined,
			},
			userB: {
				success: "success" in resultB && (resultB as any).success === true,
				postNumber:
					"success" in resultB && (resultB as any).success
						? (resultB as any).postNumber
						: undefined,
				error: "error" in resultB ? (resultB as any).error : undefined,
			},
		};

		this.lastResult = { type: "success", data: concurrentPostResult };
	},
);

// ---------------------------------------------------------------------------
// Then: 同時書き込み結果の検証
// See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
// ---------------------------------------------------------------------------

Then(
	"両方のレスが正しくスレッドに追加される",
	async function (this: BattleBoardWorld) {
		assert(concurrentPostResult, "同時書き込み結果が存在しません");
		assert(
			concurrentPostResult.userA.success,
			`UserAの書き込みが失敗しました: ${concurrentPostResult.userA.error}`,
		);
		assert(
			concurrentPostResult.userB.success,
			`UserBの書き込みが失敗しました: ${concurrentPostResult.userB.error}`,
		);

		// 実際にスレッドに2件追加されていることを確認する
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(
			posts.length >= 2,
			`スレッドに2件以上のレスが必要ですが ${posts.length} 件でした`,
		);
	},
);

Then("レス番号が重複しない", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);

	const postNumbers = posts.map((p) => p.postNumber);
	const uniquePostNumbers = new Set(postNumbers);
	assert.strictEqual(
		uniquePostNumbers.size,
		postNumbers.length,
		`レス番号が重複しています: ${postNumbers.join(", ")}`,
	);
});
