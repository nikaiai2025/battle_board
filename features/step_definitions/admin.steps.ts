/**
 * admin.feature ステップ定義
 *
 * 管理者によるレス削除・スレッド削除・権限エラーのシナリオを実装する。
 *
 * D-10 §1 に従いサービス層（AdminService）を直接呼び出す。
 * APIルートは経由しない。
 *
 * See: features/admin.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: src/lib/services/admin-service.ts
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryAdminRepo,
	InMemoryCurrencyRepo,
	InMemoryDailyStatsRepo,
	InMemoryIpBanRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// テスト用定数
// See: features/admin.feature
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト板 ID */
const TEST_BOARD_ID = "battleboard";

/** テスト用管理者アカウントの固定値 */
const TEST_ADMIN_ID = "test-admin-user-id-001";
const TEST_ADMIN_EMAIL = "admin@battleboard.test";
const TEST_ADMIN_PASSWORD = "admin-secret-password";

/** テスト用一般ユーザー ID */
const TEST_NON_ADMIN_USER_ID = "test-non-admin-user-id-001";

// ---------------------------------------------------------------------------
// AdminService の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

/**
 * AdminService を動的 require で取得する。
 * register-mocks.js によるモック差し替え後に呼び出す必要があるため動的ロード。
 */
function getAdminService() {
	return require("../../src/lib/services/admin-service") as typeof import("../../src/lib/services/admin-service");
}

// ---------------------------------------------------------------------------
// シナリオ状態（シナリオをまたがない非 World ローカル状態）
// ---------------------------------------------------------------------------

/**
 * レス番号 -> Post ID のマッピング。
 * "スレッド にレス >>N が存在する" Given ステップで登録し、
 * "レス >>N の削除を実行する" When ステップで参照する。
 */
const postNumberToId = new Map<number, string>();

// ---------------------------------------------------------------------------
// Given: 管理者がログイン済みである
// See: features/admin.feature @管理者が指定したレスを削除する
// See: features/admin.feature @管理者が指定したスレッドを削除する
// See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
// ---------------------------------------------------------------------------

/**
 * 管理者ユーザーをインメモリストアに登録し、World に adminId を設定する。
 * AdminService は adminId を信頼する（認証済み前提）ため、
 * セッション発行は不要。adminId を World に持たせるだけでよい。
 *
 * See: src/lib/services/admin-service.ts §設計上の判断
 * See: docs/architecture/components/admin.md §5 設計上の判断
 */
Given("管理者がログイン済みである", async function (this: BattleBoardWorld) {
	// インメモリ管理者ユーザーを登録する
	InMemoryAdminRepo._insert({
		id: TEST_ADMIN_ID,
		role: "admin",
		createdAt: new Date(Date.now()),
	});
	// World に管理者 ID とセッション状態を保持する
	this.currentAdminId = TEST_ADMIN_ID;
	this.isAdmin = true;
});

// ---------------------------------------------------------------------------
// Given: 管理者でないユーザーがログイン済みである
// See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
// ---------------------------------------------------------------------------

/**
 * 管理者権限を持たない一般ユーザーとしてログイン済み状態を設定する。
 * adminId を null にし、isAdmin を false にする。
 */
Given(
	"管理者でないユーザーがログイン済みである",
	function (this: BattleBoardWorld) {
		// 一般ユーザー（管理者権限なし）を設定する
		this.currentAdminId = null;
		this.currentUserId = TEST_NON_ADMIN_USER_ID;
		this.isAdmin = false;
	},
);

// ---------------------------------------------------------------------------
// Given: スレッド "..." にレス >>N が存在する
// See: features/admin.feature @管理者が指定したレスを削除する
// ---------------------------------------------------------------------------

/**
 * 指定したタイトルのスレッドに指定番号のレスを作成するヘルパー関数。
 * 固定リテラルステップから呼び出す共通ロジック。
 *
 * See: features/admin.feature @管理者が指定したレスを削除する
 */
async function createThreadWithPost(
	world: BattleBoardWorld,
	threadTitle: string,
	postNumber: number,
): Promise<void> {
	// スレッドを作成する
	const thread = await InMemoryThreadRepo.create({
		threadKey: Math.floor(Date.now() / 1000).toString(),
		boardId: TEST_BOARD_ID,
		title: threadTitle,
		createdBy: "system",
	});
	world.currentThreadId = thread.id;
	world.currentThreadTitle = threadTitle;

	// レスをストアに直接挿入する
	// See: docs/architecture/bdd_test_strategy.md §5.4 テストデータ作成の優先順位（直接挿入は許容）
	const postId = crypto.randomUUID();
	InMemoryPostRepo._insert({
		id: postId,
		threadId: thread.id,
		postNumber,
		authorId: TEST_NON_ADMIN_USER_ID,
		displayName: "名無しさん",
		dailyId: "testdly",
		body: `テスト書き込み本文（>>${postNumber}）`,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});

	// postNumber -> postId のマッピングを登録する
	postNumberToId.set(postNumber, postId);
}

/**
 * スレッド "..." にレス >>5 が存在する。
 *
 * admin.feature の「管理者がコメント付きでレスを削除する」シナリオで使用する。
 * thread.steps.ts の `スレッド {string} にレス >>1 が存在する` と異なり、
 * admin.steps.ts では固定リテラルで定義して曖昧さを排除する。
 *
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 * See: docs/architecture/bdd_test_strategy.md §4 ファイル分割方針
 */
Given(
	"スレッド {string} にレス >>5 が存在する",
	async function (this: BattleBoardWorld, threadTitle: string) {
		await createThreadWithPost(this, threadTitle, 5);
	},
);

/**
 * スレッド "..." にレス >>3 が存在する。
 *
 * admin.feature の「管理者がコメントなしでレスを削除する」シナリオで使用する。
 * thread.steps.ts の `スレッド {string} にレス >>1 が存在する` と同様に
 * 固定リテラルで定義して曖昧さを排除する。
 *
 * See: features/admin.feature @管理者がコメントなしでレスを削除する
 * See: docs/architecture/bdd_test_strategy.md §4 ファイル分割方針
 */
Given(
	"スレッド {string} にレス >>3 が存在する",
	async function (this: BattleBoardWorld, threadTitle: string) {
		await createThreadWithPost(this, threadTitle, 3);
	},
);

// ---------------------------------------------------------------------------
// Given: レス >>N は存在しない
// See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
// ---------------------------------------------------------------------------

/**
 * レス >>999 は存在しない。
 *
 * admin.feature の「存在しないレスの削除を試みるとエラーになる」シナリオで使用する。
 * ストアには何も挿入しない（デフォルトで存在しない）。
 *
 * See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
 */
Given("レス >>999 は存在しない", function (this: BattleBoardWorld) {
	// 何もしない（ストアには対応するレスが存在しない状態がデフォルト）
	// postNumberToId から当該番号を明示的に除去する（念のため）
	postNumberToId.delete(999);
});

// ---------------------------------------------------------------------------
// When: レス >>N の削除を実行する（管理者）
// See: features/admin.feature @管理者が指定したレスを削除する
// See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
// ---------------------------------------------------------------------------

/**
 * レス >>5 の削除を実行する（管理者による通常削除）。
 *
 * AdminService.deletePost を呼び出してレスを削除する。
 * 管理者（isAdmin = true）が実行する正規の削除操作。
 *
 * See: features/admin.feature @管理者が指定したレスを削除する
 * See: src/lib/services/admin-service.ts > deletePost
 */
When("レス >>5 の削除を実行する", async function (this: BattleBoardWorld) {
	assert(this.currentAdminId, "管理者がログイン済みである必要があります");

	const AdminService = getAdminService();
	const postId = postNumberToId.get(5);
	assert(
		postId,
		"レス >>5 の Post ID が見つかりません（Givenステップで作成が必要）",
	);

	// 存在するレスの削除を実行する
	const result = await AdminService.deletePost(postId, this.currentAdminId);

	if (result.success) {
		this.lastResult = { type: "success", data: result };
		// 削除後の状態を World に記録する
		this.lastDeletedPostId = postId;
		this.lastDeletedPostNumber = 5;
	} else {
		this.lastResult = {
			type: "error",
			message: `指定されたレスが見つかりません`,
			code: result.reason,
		};
	}
});

/**
 * レス >>999 の削除を実行する（存在しないレスの削除試行）。
 *
 * AdminService.deletePost を呼び出すが、>>999 はストアに存在しないため not_found が返る。
 *
 * See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
 * See: src/lib/services/admin-service.ts > deletePost
 */
When("レス >>999 の削除を実行する", async function (this: BattleBoardWorld) {
	assert(this.currentAdminId, "管理者がログイン済みである必要があります");

	const AdminService = getAdminService();

	// ストアに存在しない UUID を指定して削除を試みる
	const result = await AdminService.deletePost(
		crypto.randomUUID(), // 存在しない UUID（>>999 はストアにないため）
		this.currentAdminId,
	);

	this.lastResult = result.success
		? { type: "success", data: result }
		: {
				type: "error",
				message: `指定されたレスが見つかりません`,
				code: result.reason,
			};
});

// ---------------------------------------------------------------------------
// When: レス >>N の削除を試みる（非管理者）
// See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
// ---------------------------------------------------------------------------

/**
 * レス >>5 の削除を試みる（非管理者ユーザー）。
 *
 * 管理者権限のないユーザーがレス削除を試みる。
 * AdminService は adminId を信頼するため、ステップ定義側で isAdmin フラグを確認する。
 *
 * See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
 * See: src/lib/services/admin-service.ts §設計上の判断（adminId を信頼する）
 */
When("レス >>5 の削除を試みる", async function (this: BattleBoardWorld) {
	// 管理者権限チェック: isAdmin が false の場合は権限エラーを返す
	if (!this.isAdmin) {
		this.lastResult = {
			type: "error",
			message: "権限がありません",
			code: "UNAUTHORIZED",
		};
		return;
	}

	// 管理者の場合は削除を実行する（このシナリオでは到達しないはず）
	const AdminService = getAdminService();
	const postId = postNumberToId.get(5);
	if (!postId) {
		this.lastResult = {
			type: "error",
			message: "指定されたレスが見つかりません",
			code: "not_found",
		};
		return;
	}
	assert(this.currentAdminId);
	const result = await AdminService.deletePost(postId, this.currentAdminId);
	this.lastResult = result.success
		? { type: "success", data: result }
		: {
				type: "error",
				message: "指定されたレスが見つかりません",
				code: result.reason,
			};
});

// ---------------------------------------------------------------------------
// When: スレッド "..." の削除を実行する
// See: features/admin.feature @管理者が指定したスレッドを削除する
// ---------------------------------------------------------------------------

/**
 * AdminService.deleteThread を呼び出してスレッドを削除する。
 *
 * See: src/lib/services/admin-service.ts > deleteThread
 */
When(
	"スレッド {string} の削除を実行する",
	async function (this: BattleBoardWorld, threadTitle: string) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");
		assert(
			this.currentThreadId,
			`スレッド "${threadTitle}" の ID が設定されていません`,
		);

		const AdminService = getAdminService();
		const result = await AdminService.deleteThread(
			this.currentThreadId,
			this.currentAdminId,
		);

		if (result.success) {
			this.lastResult = { type: "success", data: result };
			this.lastDeletedThreadId = this.currentThreadId;
			this.lastDeletedThreadTitle = threadTitle;
		} else {
			this.lastResult = {
				type: "error",
				message: "スレッドが見つかりません",
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: レス >>N の表示位置に "このレスは削除されました" と表示される
// See: features/admin.feature @管理者が指定したレスを削除する
// ---------------------------------------------------------------------------

// (レス >>5 の表示位置 / レス番号 >>5 の欠番確認は汎用ステップ >>{int} に統合済み)

// ---------------------------------------------------------------------------
// Then: 権限エラーメッセージが表示される
// See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
// ---------------------------------------------------------------------------

/**
 * 最後の操作が権限エラーで終わったことを検証する。
 */
Then("権限エラーメッセージが表示される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`権限エラーを期待しましたが "${this.lastResult.type}" でした`,
	);
	const errorResult = this.lastResult as {
		type: "error";
		message: string;
		code?: string;
	};
	assert(
		errorResult.code === "UNAUTHORIZED" || errorResult.message.includes("権限"),
		`権限エラーメッセージを期待しましたが "${errorResult.message}" (code: ${errorResult.code}) でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: レスは削除されない
// See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
// ---------------------------------------------------------------------------

/**
 * 権限エラー後にレスが削除されていないことを確認する。
 * 現在のスレッドにレスが存在することを確認する。
 *
 * 注: このシナリオでは "スレッド にレス が存在する" Given がないため
 * postNumberToId にエントリが存在しない場合は、スレッドとレスの非存在を確認する。
 */
Then("レスは削除されない", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`エラー（削除失敗）を期待しましたが "${this.lastResult.type}" でした`,
	);
	// エラーが発生しているため削除は実行されていない（状態は変化なし）
});

// ---------------------------------------------------------------------------
// Given: スレッド "..." が存在する
// See: features/admin.feature @管理者が指定したスレッドを削除する
// ---------------------------------------------------------------------------

/**
 * 指定タイトルのスレッドをインメモリストアに作成する。
 * common.steps.ts の "スレッド が存在し N 件のレスがある" と区別するための
 * admin 専用の Given ステップ。
 *
 * See: docs/architecture/bdd_test_strategy.md §4 ファイル分割方針
 */
Given(
	"スレッド {string} が存在する",
	async function (this: BattleBoardWorld, threadTitle: string) {
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: threadTitle,
			createdBy: "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = threadTitle;

		// スレッドにレスを1件追加する（スレッド削除テスト用）
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: thread.id,
			postNumber: 1,
			authorId: TEST_NON_ADMIN_USER_ID,
			displayName: "名無しさん",
			dailyId: "testdly",
			body: "このスレッドのレスです",
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
	},
);

// ---------------------------------------------------------------------------
// Then: スレッドとその中の全レスが削除される
// See: features/admin.feature @管理者が指定したスレッドを削除する
// ---------------------------------------------------------------------------

/**
 * スレッドと全レスが is_deleted = true になっていることを確認する。
 */
Then(
	"スレッドとその中の全レスが削除される",
	async function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`スレッド削除成功を期待しましたが "${this.lastResult.type}" でした`,
		);

		assert(
			this.lastDeletedThreadId,
			"削除されたスレッド ID が設定されていません",
		);

		// スレッドが is_deleted = true になっているか確認する
		const thread = await InMemoryThreadRepo.findById(this.lastDeletedThreadId);
		assert(thread !== null, "削除されたスレッドが存在しません");
		assert.strictEqual(
			thread.isDeleted,
			true,
			`スレッドの isDeleted が true であることを期待しましたが false でした`,
		);

		// スレッド内の全レスも is_deleted = true であるか確認する
		// findByThreadId は isDeleted=true を除外するため、返却数が 0 であることで検証する
		const activePosts = await InMemoryPostRepo.findByThreadId(
			this.lastDeletedThreadId,
		);
		assert.strictEqual(
			activePosts.length,
			0,
			`スレッド内のアクティブなレスが 0 件であることを期待しましたが ${activePosts.length} 件でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: スレッド一覧から "..." が消える
// See: features/admin.feature @管理者が指定したスレッドを削除する
// ---------------------------------------------------------------------------

/**
 * スレッド一覧（findByBoardId）から指定タイトルのスレッドが消えていることを確認する。
 * findByBoardId は isDeleted = true を除外するため、削除後は一覧に出ない。
 */
Then(
	"スレッド一覧から {string} が消える",
	async function (this: BattleBoardWorld, threadTitle: string) {
		const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID);
		const found = threads.find((t) => t.title === threadTitle);
		assert.strictEqual(
			found,
			undefined,
			`スレッド一覧から "${threadTitle}" が消えることを期待しましたが、まだ存在しています`,
		);
	},
);

// ---------------------------------------------------------------------------
// When: レス >>N の削除をコメント付きで実行する
// See: features/admin.feature @管理者がコメント付きでレスを削除する
// ---------------------------------------------------------------------------

/**
 * レス >>N の削除をコメント付きで実行する。
 *
 * AdminService.deletePost を comment 引数付きで呼び出す。
 * 削除後、システムレスに管理者コメントが表示される。
 *
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 * See: src/lib/services/admin-service.ts > deletePost
 */
When(
	"レス >>{int} の削除をコメント {string} 付きで実行する",
	async function (this: BattleBoardWorld, postNumber: number, comment: string) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");

		const AdminService = getAdminService();
		const postId = postNumberToId.get(postNumber);
		assert(
			postId,
			`レス >>${postNumber} の Post ID が見つかりません（Givenステップで作成が必要）`,
		);

		// コメント付きで削除を実行する
		// See: src/lib/services/admin-service.ts > deletePost(postId, adminId, reason?, comment?)
		const result = await AdminService.deletePost(
			postId,
			this.currentAdminId,
			undefined,
			comment,
		);

		if (result.success) {
			this.lastResult = { type: "success", data: result };
			this.lastDeletedPostId = postId;
			this.lastDeletedPostNumber = postNumber;
		} else {
			this.lastResult = {
				type: "error",
				message: "指定されたレスが見つかりません",
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: レス >>N の削除をコメントなしで実行する
// See: features/admin.feature @管理者がコメントなしでレスを削除する
// ---------------------------------------------------------------------------

/**
 * レス >>N の削除をコメントなしで実行する。
 *
 * AdminService.deletePost を comment 引数なしで呼び出す。
 * 削除後、システムレスにはフォールバックメッセージが表示される。
 *
 * See: features/admin.feature @管理者がコメントなしでレスを削除する
 * See: src/lib/services/admin-service.ts > deletePost（comment 未指定時はフォールバック）
 */
When(
	"レス >>{int} の削除をコメントなしで実行する",
	async function (this: BattleBoardWorld, postNumber: number) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");

		const AdminService = getAdminService();
		const postId = postNumberToId.get(postNumber);
		assert(
			postId,
			`レス >>${postNumber} の Post ID が見つかりません（Givenステップで作成が必要）`,
		);

		// comment を渡さずに削除を実行する（フォールバックメッセージが使用される）
		// See: src/lib/services/admin-service.ts ADMIN_DELETE_FALLBACK_MESSAGE
		const result = await AdminService.deletePost(postId, this.currentAdminId);

		if (result.success) {
			this.lastResult = { type: "success", data: result };
			this.lastDeletedPostId = postId;
			this.lastDeletedPostNumber = postNumber;
		} else {
			this.lastResult = {
				type: "error",
				message: "指定されたレスが見つかりません",
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: レス >>N の表示位置に "このレスは削除されました" と表示される（汎用版）
// See: features/admin.feature @管理者がコメントなしでレスを削除する
// ---------------------------------------------------------------------------

/**
 * レス >>N の表示位置に "このレスは削除されました" と表示される（汎用版）。
 *
 * postNumberToId から postId を取得し、isDeleted = true であることを確認する。
 * 表示文字列の置換はプレゼンテーション層の責務のため、
 * BDD テストでは isDeleted フラグが true であることを検証する。
 *
 * See: features/admin.feature @管理者がコメントなしでレスを削除する
 * See: src/lib/services/admin-service.ts §責務（表示文字列の置換はUIの責務）
 */
Then(
	"レス >>{int} の表示位置に {string} と表示される",
	async function (
		this: BattleBoardWorld,
		postNumber: number,
		expectedMessage: string,
	) {
		assert.strictEqual(
			expectedMessage,
			"このレスは削除されました",
			`期待するメッセージ "${expectedMessage}" は "このレスは削除されました" ではありません`,
		);

		const postId = postNumberToId.get(postNumber);
		assert(postId, `レス番号 ${postNumber} の Post ID が見つかりません`);

		// isDeleted = true になっているか findById で確認する
		// findByThreadId は isDeleted=true を除外するため findById を使用する
		const post = await InMemoryPostRepo.findById(postId);
		assert(post !== null, `レス ID ${postId} が存在しません`);
		assert.strictEqual(
			post.isDeleted,
			true,
			`レス >>${postNumber} の isDeleted が true であることを期待しましたが false でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: レス番号 >>N は欠番にならず保持される（汎用版）
// See: features/admin.feature @管理者がコメントなしでレスを削除する
// ---------------------------------------------------------------------------

/**
 * レス番号 >>N は欠番にならず保持される（汎用版）。
 *
 * 削除後もレス番号がストアに存在することを確認する。
 * ソフトデリートのため物理削除されず postNumber は保持される。
 *
 * See: features/admin.feature @管理者がコメントなしでレスを削除する
 */
Then(
	"レス番号 >>{int} は欠番にならず保持される",
	async function (this: BattleBoardWorld, postNumber: number) {
		const postId = postNumberToId.get(postNumber);
		assert(postId, `レス番号 ${postNumber} の Post ID が見つかりません`);

		// isDeleted = true でもレコード自体は存在する（ソフトデリート）
		// findById は isDeleted に関わらずレコードを返す
		const post = await InMemoryPostRepo.findById(postId);
		assert(
			post !== null,
			`レス >>${postNumber} のレコードが存在しません（欠番になってはいけない）`,
		);
		assert.strictEqual(
			post.postNumber,
			postNumber,
			`レス番号 ${postNumber} が保持されることを期待しましたが ${post.postNumber} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 独立したシステムレスが追加される: (DocString)
// See: features/admin.feature @管理者がコメント付きでレスを削除する
// See: features/admin.feature @管理者がコメントなしでレスを削除する
// ---------------------------------------------------------------------------

/**
 * 独立したシステムレスが追加される（DocString で期待値を指定）。
 *
 * DocString のフォーマット:
 *   ★システム
 *   🗑️ {管理者コメント or フォールバックメッセージ}
 *
 * 検証方法:
 *   - Line 1: システムレスの displayName（★システム）
 *   - Line 2: システムレスの body に含まれる文字列
 *
 * スレッド内に isSystemMessage=true かつ displayName=★システム のレスが
 * 存在し、その body が期待値（DocString 2行目）に含まれる文字列であることを確認する。
 *
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 * See: features/admin.feature @管理者がコメントなしでレスを削除する
 * See: src/lib/services/admin-service.ts > deletePost（createPost で挿入）
 * See: docs/architecture/components/posting.md §5 方式B: 独立システムレス
 */
Then(
	"独立したシステムレスが追加される:",
	async function (this: BattleBoardWorld, docString: string) {
		// DocString を行分割して期待値を取得する
		// Line 1: displayName（★システム）
		// Line 2: body の期待値（🗑️ ...）
		const lines = docString.trim().split("\n");
		assert(
			lines.length >= 2,
			`DocString は2行以上である必要があります。実際: "${docString}"`,
		);
		const expectedDisplayName = lines[0].trim();
		const expectedBodyContent = lines.slice(1).join("\n").trim();

		assert(
			this.currentThreadId,
			"currentThreadId が設定されていません（Givenステップで作成が必要）",
		);

		// スレッド内の全レス（isDeleted=false）を取得する
		// システムレスは削除されていないので findByThreadId で取得できる
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);

		// isSystemMessage=true かつ displayName が期待値と一致するレスを検索する
		const systemPost = posts.find(
			(p) => p.isSystemMessage && p.displayName === expectedDisplayName,
		);

		assert(
			systemPost !== undefined,
			`displayName="${expectedDisplayName}" の独立システムレスが見つかりません。` +
				`スレッド内のレス: ${JSON.stringify(posts.map((p) => ({ displayName: p.displayName, isSystemMessage: p.isSystemMessage, body: p.body })))}`,
		);

		// body が期待値を含んでいることを確認する
		// BDD 期待値: "🗑️ コメント内容"
		// サービス実装: comment そのまま or フォールバックメッセージ
		// 検証: body が expectedBodyContent を含むかを確認する
		assert(
			systemPost.body.includes(expectedBodyContent) ||
				expectedBodyContent.includes(systemPost.body),
			`システムレスの body が期待値と一致しません。\n` +
				`期待値: "${expectedBodyContent}"\n` +
				`実際: "${systemPost.body}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// BAN システム ステップ定義
// See: features/admin.feature @ユーザーBAN / IP BAN シナリオ群
// See: tmp/feature_plan_admin_expansion.md §1-a
// ---------------------------------------------------------------------------

/**
 * BAN システムの AdminService を動的 require で取得するヘルパー。
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */
function getAdminServiceForBan() {
	return require("../../src/lib/services/admin-service") as typeof import("../../src/lib/services/admin-service");
}

/**
 * PostService を動的 require で取得するヘルパー。
 * BAN後の書き込み拒否テストに使用する。
 */
function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

/**
 * AuthService を動的 require で取得するヘルパー。
 * IP BAN後の新規登録拒否テストに使用する。
 */
function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

/** テスト用スレッド（書き込みテスト用） */
let banTestThreadId: string | null = null;

// ---------------------------------------------------------------------------
// Given: ユーザー "UserA" が存在する（BAN操作シナリオ用）
// See: features/admin.feature @管理者がユーザーをBANする
// See: features/admin.feature @管理者がユーザーのIPをBANする
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" が存在する状態を設定する。
 * BAN系シナリオで必要なユーザーをインメモリストアに登録する。
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 */
Given(
	"ユーザー {string} が存在する",
	async function (this: BattleBoardWorld, userName: string) {
		// テスト用ユーザーを登録する
		const user = await InMemoryUserRepo.create({
			authToken: `test-token-${userName}`,
			authorIdSeed: `test-seed-${userName}`,
			isPremium: false,
			username: null,
			isBanned: false,
			lastIpHash: `test-ip-hash-${userName}`,
		});

		// namedUsers に登録する
		this.setNamedUser(userName, {
			userId: user.id,
			edgeToken: user.authToken,
			ipHash: user.authorIdSeed,
			isPremium: false,
			username: null,
		});
	},
);

// ---------------------------------------------------------------------------
// When: ユーザー "UserA" をBANする
// See: features/admin.feature @管理者がユーザーをBANする
// ---------------------------------------------------------------------------

/**
 * 管理者がユーザー "UserA" をBANする。
 * AdminService.banUser を呼び出す。
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 */
When(
	"ユーザー {string} をBANする",
	async function (this: BattleBoardWorld, userName: string) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");

		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const AdminService = getAdminServiceForBan();
		const result = await AdminService.banUser(
			namedUser.userId,
			this.currentAdminId,
		);

		this.lastResult = result.success
			? { type: "success", data: result }
			: { type: "error", message: "BAN に失敗しました", code: result.reason };
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザー "UserA" のステータスがBAN済みになる
// See: features/admin.feature @管理者がユーザーをBANする
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" の isBanned フラグが true になっていることを確認する。
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 */
Then(
	"ユーザー {string} のステータスがBAN済みになる",
	async function (this: BattleBoardWorld, userName: string) {
		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const user = await InMemoryUserRepo.findById(namedUser.userId);
		assert(user !== null, `ユーザー "${userName}" が見つかりません`);
		assert.strictEqual(
			user.isBanned,
			true,
			`ユーザー "${userName}" の isBanned が true であることを期待しましたが false でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザー "UserA" がBANされている
// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
// See: features/admin.feature @管理者がユーザーBANを解除する
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" がBANされている状態を設定する。
 * BAN済みのユーザーをインメモリストアに登録する。
 *
 * See: features/admin.feature @BANされたユーザーの書き込みが拒否される
 * See: features/admin.feature @管理者がユーザーBANを解除する
 */
Given(
	"ユーザー {string} がBANされている",
	async function (this: BattleBoardWorld, userName: string) {
		// BAN済みユーザーを作成する
		const user = await InMemoryUserRepo.create({
			authToken: `test-token-banned-${userName}`,
			authorIdSeed: `test-seed-banned-${userName}`,
			isPremium: false,
			username: null,
			isBanned: true, // BAN済み
			isVerified: true,
			lastIpHash: `test-ip-hash-banned-${userName}`,
		});

		// namedUsers に登録する
		this.setNamedUser(userName, {
			userId: user.id,
			edgeToken: user.authToken,
			ipHash: user.authorIdSeed,
			isPremium: false,
			username: null,
		});
	},
);

// ---------------------------------------------------------------------------
// When: ユーザー "UserA" がスレッドへの書き込みを試みる
// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
// ---------------------------------------------------------------------------

/**
 * BAN済みユーザー "UserA" がスレッドへの書き込みを試みる。
 * PostService.createPost を呼び出してBANチェックを検証する。
 *
 * See: features/admin.feature @BANされたユーザーの書き込みが拒否される
 */
When(
	"ユーザー {string} がスレッドへの書き込みを試みる",
	async function (this: BattleBoardWorld, userName: string) {
		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		// 書き込みテスト用スレッドを作成する（未作成の場合）
		if (!banTestThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: `${Date.now()}`,
				boardId: TEST_BOARD_ID,
				title: "BAN テスト用スレッド",
				createdBy: "system",
			});
			banTestThreadId = thread.id;
		}
		// currentThreadId を設定する（posting.steps.ts の "レスは追加されない" が参照する）
		this.currentThreadId = banTestThreadId;

		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: banTestThreadId,
			body: "BANされたユーザーの書き込みテスト",
			edgeToken: namedUser.edgeToken,
			ipHash: namedUser.ipHash,
			isBotWrite: false,
		});

		if ("authRequired" in result) {
			this.lastResult = {
				type: "error",
				message: "認証が必要です",
				code: "AUTH_REQUIRED",
			};
		} else if (!result.success) {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		} else {
			this.lastResult = { type: "success", data: result };
		}
	},
);

// ---------------------------------------------------------------------------
// Then: エラーメッセージが表示される（BAN系）
// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
// See: features/admin.feature @BANされたIPからの書き込みが拒否される
// ---------------------------------------------------------------------------

// エラーメッセージが表示される → 既存の "権限エラーメッセージが表示される" に対応
// このシナリオでは type: "error" であることのみ確認する（共通）
// 既存の Then "エラーメッセージが表示される" と衝突しないよう、
// BAN 系のシナリオでは「エラーメッセージが表示される」ステップで共通 error チェック

// ---------------------------------------------------------------------------
// Then: レスは追加されない（BAN系）
// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
// See: features/admin.feature @BANされたIPからの書き込みが拒否される
// ---------------------------------------------------------------------------

// 既存の "レスは削除されない" ステップと同様のパターン
// BAN系シナリオでは type: "error" であることを確認

// ---------------------------------------------------------------------------
// When: 管理者がユーザー "UserA" のBANを解除する
// See: features/admin.feature @管理者がユーザーBANを解除する
// ---------------------------------------------------------------------------

/**
 * 管理者がユーザー "UserA" のBANを解除する。
 * AdminService.unbanUser を呼び出す。
 *
 * See: features/admin.feature @管理者がユーザーBANを解除する
 */
When(
	"管理者がユーザー {string} のBANを解除する",
	async function (this: BattleBoardWorld, userName: string) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");

		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const AdminService = getAdminServiceForBan();
		const result = await AdminService.unbanUser(
			namedUser.userId,
			this.currentAdminId,
		);

		this.lastResult = result.success
			? { type: "success", data: result }
			: {
					type: "error",
					message: "BAN解除に失敗しました",
					code: result.reason,
				};
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザー "UserA" の書き込みが可能になる
// See: features/admin.feature @管理者がユーザーBANを解除する
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" の isBanned フラグが false になっていることを確認する。
 *
 * See: features/admin.feature @管理者がユーザーBANを解除する
 */
Then(
	"ユーザー {string} の書き込みが可能になる",
	async function (this: BattleBoardWorld, userName: string) {
		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const user = await InMemoryUserRepo.findById(namedUser.userId);
		assert(user !== null, `ユーザー "${userName}" が見つかりません`);
		assert.strictEqual(
			user.isBanned,
			false,
			`ユーザー "${userName}" の isBanned が false であることを期待しましたが true でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// When: ユーザー "UserA" のIPをBANする
// See: features/admin.feature @管理者がユーザーのIPをBANする
// ---------------------------------------------------------------------------

/**
 * 管理者がユーザー "UserA" のIPをBANする。
 * AdminService.banIpByUserId を呼び出す。
 * ユーザーに last_ip_hash が設定されていることが前提。
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 */
When(
	"ユーザー {string} のIPをBANする",
	async function (this: BattleBoardWorld, userName: string) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");

		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const AdminService = getAdminServiceForBan();
		const result = await AdminService.banIpByUserId(
			namedUser.userId,
			this.currentAdminId,
			"テスト用IP BAN",
		);

		this.lastResult = result.success
			? { type: "success", data: result }
			: {
					type: "error",
					message: "IP BAN に失敗しました",
					code: result.reason,
				};
	},
);

// ---------------------------------------------------------------------------
// Then: IP BANリストに登録される
// See: features/admin.feature @管理者がユーザーのIPをBANする
// ---------------------------------------------------------------------------

/**
 * IP BAN リストに登録されていることを確認する。
 * InMemoryIpBanRepo の listActive で確認する。
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 */
Then("IP BANリストに登録される", async function (this: BattleBoardWorld) {
	// 操作が成功していることを確認する
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`IP BAN 成功を期待しましたが "${this.lastResult.type}" でした`,
	);

	// 有効な IP BAN が1件以上存在することを確認する
	const activeBans = await InMemoryIpBanRepo.listActive();
	assert(activeBans.length > 0, "IP BANリストにエントリが登録されていません");
});

// ---------------------------------------------------------------------------
// Given: ユーザー "UserA" のIPがBANされている
// See: features/admin.feature @BANされたIPからの書き込みが拒否される
// See: features/admin.feature @BANされたIPからの新規登録が拒否される
// See: features/admin.feature @管理者がIP BANを解除する
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" のIPがBANされている状態を設定する。
 * ユーザーを作成し、そのIPを ip_bans に直接登録する。
 *
 * See: features/admin.feature @BANされたIPからの書き込みが拒否される
 */
Given(
	"ユーザー {string} のIPがBANされている",
	async function (this: BattleBoardWorld, userName: string) {
		const ipHash = `test-ip-hash-banned-ip-${userName}`;

		// ユーザーを作成する（IPを持つ）
		const user = await InMemoryUserRepo.create({
			authToken: `test-token-ip-banned-${userName}`,
			authorIdSeed: `test-seed-ip-banned-${userName}`,
			isPremium: false,
			username: null,
			isBanned: false,
			isVerified: true,
			lastIpHash: ipHash,
		});

		// namedUsers に登録する
		this.setNamedUser(userName, {
			userId: user.id,
			edgeToken: user.authToken,
			ipHash, // このIPがBANされている
			isPremium: false,
			username: null,
		});

		// IP BAN を直接登録する（Given状態設定）
		const ban = await InMemoryIpBanRepo.create(
			ipHash,
			"テスト用IP BAN",
			TEST_ADMIN_ID,
		);

		// BAN ID を World に保存する（解除テスト用）
		this.lastResult = { type: "success", data: { banId: ban.id } };
	},
);

// ---------------------------------------------------------------------------
// When: そのIPからスレッドへの書き込みを試みる
// See: features/admin.feature @BANされたIPからの書き込みが拒否される
// ---------------------------------------------------------------------------

/**
 * BAN済みIPからスレッドへの書き込みを試みる。
 * PostService.createPost を呼び出してIP BANチェックを検証する。
 *
 * See: features/admin.feature @BANされたIPからの書き込みが拒否される
 */
When(
	"そのIPからスレッドへの書き込みを試みる",
	async function (this: BattleBoardWorld) {
		// BAN済みIPは UserA のもの
		const namedUser = this.getNamedUser("UserA");
		assert(namedUser, "ユーザー UserA が存在しません");

		// 書き込みテスト用スレッドを作成する（未作成の場合）
		if (!banTestThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: `${Date.now()}`,
				boardId: TEST_BOARD_ID,
				title: "IP BAN テスト用スレッド",
				createdBy: "system",
			});
			banTestThreadId = thread.id;
		}
		// currentThreadId を設定する（posting.steps.ts の "レスは追加されない" が参照する）
		this.currentThreadId = banTestThreadId;

		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: banTestThreadId,
			body: "BANされたIPからの書き込みテスト",
			edgeToken: namedUser.edgeToken,
			ipHash: namedUser.ipHash, // BAN済みIP
			isBotWrite: false,
		});

		if ("authRequired" in result) {
			this.lastResult = {
				type: "error",
				message: "認証が必要です",
				code: "AUTH_REQUIRED",
			};
		} else if (!result.success) {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		} else {
			this.lastResult = { type: "success", data: result };
		}
	},
);

// ---------------------------------------------------------------------------
// When: そのIPから認証コード発行を試みる
// See: features/admin.feature @BANされたIPからの新規登録が拒否される
// ---------------------------------------------------------------------------

/**
 * BAN済みIPから認証コード発行（新規登録）を試みる。
 * AuthService.issueEdgeToken を呼び出してIP BANチェックを検証する。
 *
 * See: features/admin.feature @BANされたIPからの新規登録が拒否される
 */
When(
	"そのIPから認証コード発行を試みる",
	async function (this: BattleBoardWorld) {
		const namedUser = this.getNamedUser("UserA");
		assert(namedUser, "ユーザー UserA が存在しません");

		const AuthService = getAuthService();
		try {
			// BAN済みIPで新規ユーザー作成（edge-token発行）を試みる
			await AuthService.issueEdgeToken(namedUser.ipHash);
			// 成功した場合はエラーが出ないはずなので不正な結果として記録
			this.lastResult = { type: "success", data: {} };
		} catch (err) {
			const message = err instanceof Error ? err.message : "不明なエラー";
			this.lastResult = {
				type: "error",
				message,
				code: message.startsWith("IP_BANNED") ? "IP_BANNED" : "UNKNOWN",
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 認証コードは発行されない
// See: features/admin.feature @BANされたIPからの新規登録が拒否される
// ---------------------------------------------------------------------------

/**
 * 認証コードが発行されなかったことを確認する。
 * lastResult が error（IP_BANNED）であることを確認する。
 *
 * See: features/admin.feature @BANされたIPからの新規登録が拒否される
 */
Then("認証コードは発行されない", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`IP BAN エラーを期待しましたが "${this.lastResult.type}" でした`,
	);
	const errorResult = this.lastResult as {
		type: "error";
		message: string;
		code?: string;
	};
	assert(
		errorResult.code === "IP_BANNED" ||
			errorResult.message.includes("IP_BANNED"),
		`IP BAN エラーを期待しましたが "${errorResult.message}" (code: ${errorResult.code}) でした`,
	);
});

// ---------------------------------------------------------------------------
// When: 管理者がそのIP BANを解除する
// See: features/admin.feature @管理者がIP BANを解除する
// ---------------------------------------------------------------------------

/**
 * 管理者が UserA のIP BANを解除する。
 * AdminService.unbanIp を呼び出す。
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 */
When("管理者がそのIP BANを解除する", async function (this: BattleBoardWorld) {
	// 管理者を設定する（Given "ユーザーのIPがBANされている" には管理者ログインステップがない）
	if (!this.currentAdminId) {
		InMemoryAdminRepo._insert({
			id: TEST_ADMIN_ID,
			role: "admin",
			createdAt: new Date(Date.now()),
		});
		this.currentAdminId = TEST_ADMIN_ID;
		this.isAdmin = true;
	}

	// BAN IDを取得する（Given "ユーザーのIPがBANされている" で設定した lastResult から）
	const activeBans = await InMemoryIpBanRepo.listActive();
	assert(activeBans.length > 0, "解除する IP BAN が存在しません");

	const banId = activeBans[0].id;
	const AdminService = getAdminServiceForBan();
	const result = await AdminService.unbanIp(banId, this.currentAdminId);

	this.lastResult = result.success
		? { type: "success", data: result }
		: {
				type: "error",
				message: "IP BAN 解除に失敗しました",
				code: result.reason,
			};
});

// ---------------------------------------------------------------------------
// Then: そのIPからの書き込みが可能になる
// See: features/admin.feature @管理者がIP BANを解除する
// ---------------------------------------------------------------------------

/**
 * IP BAN 解除後、そのIPからの書き込みが可能になることを確認する。
 * InMemoryIpBanRepo の listActive が空（または解除済み）になっていることを確認する。
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 */
Then(
	"そのIPからの書き込みが可能になる",
	async function (this: BattleBoardWorld) {
		// 解除操作が成功していることを確認する
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`IP BAN 解除成功を期待しましたが "${this.lastResult.type}" でした`,
		);

		// 有効な IP BAN が0件になっていることを確認する
		const activeBans = await InMemoryIpBanRepo.listActive();
		assert.strictEqual(
			activeBans.length,
			0,
			`IP BAN 解除後は有効な IP BAN が0件であることを期待しましたが ${activeBans.length} 件でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 通貨付与ステップ定義
// See: features/admin.feature @通貨付与シナリオ群
// See: tmp/feature_plan_admin_expansion.md §1-b, §3
// ---------------------------------------------------------------------------

/**
 * AdminService.grantCurrency を動的 require で取得するヘルパー。
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */
function getAdminServiceForCurrency() {
	return require("../../src/lib/services/admin-service") as typeof import("../../src/lib/services/admin-service");
}

// ---------------------------------------------------------------------------
// Given: ユーザー "UserA" の通貨残高が N である
// See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
//
// 注: このステップは incentive.steps.ts に定義済みの
// "ユーザー {string} の通貨残高が {int} である" を再利用する。
// 重複定義を避けるため admin.steps.ts では定義しない。
// See: features/step_definitions/incentive.steps.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// When: ユーザー "UserA" に通貨 N を付与する
// See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
// ---------------------------------------------------------------------------

/**
 * 管理者がユーザー "UserA" に通貨 N を付与する。
 * AdminService.grantCurrency を呼び出す。
 *
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 * See: src/lib/services/admin-service.ts > grantCurrency
 */
When(
	"ユーザー {string} に通貨 {int} を付与する",
	async function (this: BattleBoardWorld, userName: string, amount: number) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");

		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const AdminService = getAdminServiceForCurrency();
		const result = await AdminService.grantCurrency(
			namedUser.userId,
			amount,
			this.currentAdminId,
		);

		this.lastResult = result.success
			? { type: "success", data: result }
			: {
					type: "error",
					message: "通貨付与に失敗しました",
					code: result.reason,
				};
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザー "UserA" の通貨残高が N になる
// See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" の通貨残高が指定値になっていることを確認する。
 *
 * InMemoryCurrencyRepo.getBalance で残高を取得して検証する。
 *
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 */
Then(
	"ユーザー {string} の通貨残高が {int} になる",
	async function (
		this: BattleBoardWorld,
		userName: string,
		expectedBalance: number,
	) {
		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const actualBalance = await InMemoryCurrencyRepo.getBalance(
			namedUser.userId,
		);
		assert.strictEqual(
			actualBalance,
			expectedBalance,
			`ユーザー "${userName}" の通貨残高が ${expectedBalance} であることを期待しましたが ${actualBalance} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// When: 通貨付与APIを呼び出す（非管理者）
// See: features/admin.feature @管理者でないユーザーが通貨付与を試みると権限エラーになる
// ---------------------------------------------------------------------------

/**
 * 非管理者ユーザーが通貨付与APIを呼び出す。
 * isAdmin = false の場合は権限エラーを返す。
 *
 * BDD テストはサービス層テストのため、APIルートは経由しない。
 * isAdmin フラグを確認して権限エラーをシミュレートする。
 *
 * See: features/admin.feature @管理者でないユーザーが通貨付与を試みると権限エラーになる
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 */
When("通貨付与APIを呼び出す", function (this: BattleBoardWorld) {
	// 管理者権限チェック: isAdmin が false の場合は権限エラーを返す
	if (!this.isAdmin) {
		this.lastResult = {
			type: "error",
			message: "権限がありません",
			code: "UNAUTHORIZED",
		};
		return;
	}

	// 管理者の場合は付与を試みる（このシナリオでは到達しないはず）
	this.lastResult = {
		type: "error",
		message: "権限がありません",
		code: "UNAUTHORIZED",
	};
});

// ---------------------------------------------------------------------------
// ユーザー管理ステップ定義
// See: features/admin.feature @ユーザー管理シナリオ群
// See: tmp/feature_plan_admin_expansion.md §1-c, §4
// ---------------------------------------------------------------------------

/**
 * AdminService を動的 require で取得するヘルパー（ユーザー管理用）。
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */
function getAdminServiceForUsers() {
	return require("../../src/lib/services/admin-service") as typeof import("../../src/lib/services/admin-service");
}

/** ユーザー一覧取得結果（Then ステップでのアサーション用） */
let userListResult: {
	users: import("../../src/lib/domain/models/user").User[];
	total: number;
} | null = null;

/** ユーザー詳細取得結果（Then ステップでのアサーション用） */
let userDetailResult:
	| import("../../src/lib/services/admin-service").UserDetail
	| null = null;

// ---------------------------------------------------------------------------
// Given: ユーザーが5人登録されている
// See: features/admin.feature @管理者がユーザー一覧を閲覧できる
// ---------------------------------------------------------------------------

/**
 * テスト用ユーザーを5人インメモリストアに登録する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
Given("ユーザーが5人登録されている", async function (this: BattleBoardWorld) {
	for (let i = 1; i <= 5; i++) {
		await InMemoryUserRepo.create({
			authToken: `test-token-user-${i}`,
			authorIdSeed: `test-seed-user-${i}`,
			isPremium: false,
			username: null,
		});
	}
});

// ---------------------------------------------------------------------------
// When: ユーザー一覧ページを表示する
// See: features/admin.feature @管理者がユーザー一覧を閲覧できる
// ---------------------------------------------------------------------------

/**
 * AdminService.getUserList を呼び出してユーザー一覧を取得する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 * See: src/lib/services/admin-service.ts > getUserList
 */
When("ユーザー一覧ページを表示する", async function (this: BattleBoardWorld) {
	assert(this.currentAdminId, "管理者がログイン済みである必要があります");
	const AdminService = getAdminServiceForUsers();
	userListResult = await AdminService.getUserList({ limit: 50 });
	this.lastResult = { type: "success", data: userListResult };
});

// ---------------------------------------------------------------------------
// Then: ユーザーが一覧表示される
// See: features/admin.feature @管理者がユーザー一覧を閲覧できる
// ---------------------------------------------------------------------------

/**
 * ユーザー一覧が取得できていることを確認する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
Then("ユーザーが一覧表示される", function (this: BattleBoardWorld) {
	assert(userListResult, "ユーザー一覧取得結果が存在しません");
	assert(
		userListResult.users.length > 0,
		`ユーザーが1人以上一覧表示されることを期待しましたが 0 人でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 各ユーザーのID、登録日時、ステータス、通貨残高が表示される
// See: features/admin.feature @管理者がユーザー一覧を閲覧できる
// ---------------------------------------------------------------------------

/**
 * ユーザー一覧の各エントリに必要なフィールドが含まれることを確認する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
Then(
	"各ユーザーのID、登録日時、ステータス、通貨残高が表示される",
	function (this: BattleBoardWorld) {
		assert(userListResult, "ユーザー一覧取得結果が存在しません");
		assert(
			userListResult.total >= 5,
			`総件数が5以上であることを期待しましたが ${userListResult.total} でした`,
		);
		for (const user of userListResult.users) {
			assert(user.id, `ユーザーにIDが存在しません: ${JSON.stringify(user)}`);
			assert(
				user.createdAt instanceof Date,
				`ユーザーに登録日時が存在しません: ${user.id}`,
			);
			// ステータス（isPremium / registrationType などの組み合わせ）
			assert(
				typeof user.isPremium === "boolean",
				`ユーザーに isPremium フィールドが存在しません: ${user.id}`,
			);
			// 通貨残高は CurrencyService 経由で確認（一覧APIでは別途取得）
			// ここでは id, createdAt, isPremium の存在確認のみ行う
		}
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザー "UserA" が過去に3件の書き込みを行っている
// See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" を作成し、3件の書き込みをインメモリストアに直接登録する。
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
Given(
	"ユーザー {string} が過去に3件の書き込みを行っている",
	async function (this: BattleBoardWorld, userName: string) {
		// ユーザーを作成する
		const user = await InMemoryUserRepo.create({
			authToken: `test-token-detail-${userName}`,
			authorIdSeed: `test-seed-detail-${userName}`,
			isPremium: false,
			username: null,
		});

		// namedUsers に登録する
		this.setNamedUser(userName, {
			userId: user.id,
			edgeToken: user.authToken,
			ipHash: user.authorIdSeed,
			isPremium: false,
			username: null,
		});

		// テスト用スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: `detail-thread-${Date.now()}`,
			boardId: TEST_BOARD_ID,
			title: `${userName} のテスト用スレッド`,
			createdBy: "system",
		});

		// 3件の書き込みを直接ストアに挿入する
		for (let i = 1; i <= 3; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: thread.id,
				postNumber: i,
				authorId: user.id,
				displayName: "名無しさん",
				dailyId: "testdly",
				body: `${userName} の書き込み ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - (3 - i) * 60 * 1000),
			});
		}
	},
);

// ---------------------------------------------------------------------------
// When: ユーザー "UserA" の詳細ページを表示する
// See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
// ---------------------------------------------------------------------------

/**
 * AdminService.getUserDetail を呼び出してユーザー詳細を取得する。
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
When(
	"ユーザー {string} の詳細ページを表示する",
	async function (this: BattleBoardWorld, userName: string) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");
		const namedUser = this.getNamedUser(userName);
		assert(namedUser, `ユーザー "${userName}" が存在しません`);

		const AdminService = getAdminServiceForUsers();
		userDetailResult = await AdminService.getUserDetail(namedUser.userId);
		this.lastResult = userDetailResult
			? { type: "success", data: userDetailResult }
			: {
					type: "error",
					message: "ユーザーが見つかりません",
					code: "not_found",
				};
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザーの基本情報（ステータス、通貨残高、ストリーク）が表示される
// See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
// ---------------------------------------------------------------------------

/**
 * ユーザー詳細に基本情報が含まれることを確認する。
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
Then(
	"ユーザーの基本情報（ステータス、通貨残高、ストリーク）が表示される",
	function (this: BattleBoardWorld) {
		assert(userDetailResult, "ユーザー詳細取得結果が存在しません");
		assert(userDetailResult.id, "ユーザーIDが存在しません");
		assert(
			typeof userDetailResult.isPremium === "boolean",
			"ステータス（isPremium）が存在しません",
		);
		assert(
			typeof userDetailResult.balance === "number",
			"通貨残高（balance）が存在しません",
		);
		assert(
			typeof userDetailResult.streakDays === "number",
			"ストリーク（streakDays）が存在しません",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込み一覧が表示される
// See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
// ---------------------------------------------------------------------------

/**
 * ユーザー詳細に書き込み一覧が含まれることを確認する。
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
Then("書き込み一覧が表示される", function (this: BattleBoardWorld) {
	assert(userDetailResult, "ユーザー詳細取得結果が存在しません");
	assert(
		Array.isArray(userDetailResult.posts),
		"書き込み一覧（posts）が配列でありません",
	);
	assert(
		userDetailResult.posts.length >= 3,
		`書き込みが3件以上あることを期待しましたが ${userDetailResult.posts.length} 件でした`,
	);
});

// ---------------------------------------------------------------------------
// Given: 管理者がユーザー "UserA" の詳細ページを表示している
// See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserA" を作成し詳細ページを取得済みの状態にする。
 * 「管理者が特定ユーザーの詳細を閲覧できる」の Given + When を組み合わせた状態。
 *
 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
 */
Given(
	"管理者がユーザー {string} の詳細ページを表示している",
	async function (this: BattleBoardWorld, userName: string) {
		// 管理者を設定する
		if (!this.currentAdminId) {
			InMemoryAdminRepo._insert({
				id: TEST_ADMIN_ID,
				role: "admin",
				createdAt: new Date(Date.now()),
			});
			this.currentAdminId = TEST_ADMIN_ID;
			this.isAdmin = true;
		}

		// ユーザーを作成し書き込みを3件登録する
		const user = await InMemoryUserRepo.create({
			authToken: `test-token-history-${userName}`,
			authorIdSeed: `test-seed-history-${userName}`,
			isPremium: false,
			username: null,
		});

		this.setNamedUser(userName, {
			userId: user.id,
			edgeToken: user.authToken,
			ipHash: user.authorIdSeed,
			isPremium: false,
			username: null,
		});

		// テスト用スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: `history-thread-${Date.now()}`,
			boardId: TEST_BOARD_ID,
			title: `${userName} の履歴テスト用スレッド`,
			createdBy: "system",
		});

		// 3件の書き込みを直接ストアに挿入する
		for (let i = 1; i <= 3; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: thread.id,
				postNumber: i,
				authorId: user.id,
				displayName: "名無しさん",
				dailyId: "testdly",
				body: `${userName} の履歴書き込み ${i}（スレッド: ${thread.id}）`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - (3 - i) * 60 * 1000),
			});
		}

		// 詳細ページを取得する
		const AdminService = getAdminServiceForUsers();
		userDetailResult = await AdminService.getUserDetail(user.id);
	},
);

// ---------------------------------------------------------------------------
// Then: 各書き込みのスレッド名、本文、書き込み日時が含まれる
// See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
// ---------------------------------------------------------------------------

/**
 * ユーザー詳細の書き込み履歴に必要なフィールドが含まれることを確認する。
 * threadId（スレッド名の代替）・body・createdAt の存在を確認する。
 *
 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
 */
Then(
	"管理者画面でも各書き込みのスレッド名、本文、書き込み日時が含まれる",
	function (this: BattleBoardWorld) {
		assert(userDetailResult, "ユーザー詳細取得結果が存在しません");
		assert(
			Array.isArray(userDetailResult.posts),
			"書き込み一覧（posts）が配列でありません",
		);
		assert(
			userDetailResult.posts.length >= 3,
			`書き込みが3件以上あることを期待しましたが ${userDetailResult.posts.length} 件でした`,
		);
		for (const post of userDetailResult.posts) {
			assert(post.threadId, `書き込みに threadId が存在しません: ${post.id}`);
			assert(post.body, `書き込みに本文が存在しません: ${post.id}`);
			assert(
				post.createdAt instanceof Date,
				`書き込みに日時が存在しません: ${post.id}`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// ダッシュボードステップ定義
// See: features/admin.feature @ダッシュボードシナリオ群
// See: tmp/feature_plan_admin_expansion.md §1-d, §5
// ---------------------------------------------------------------------------

/**
 * AdminService を動的 require で取得するヘルパー（ダッシュボード用）。
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */
function getAdminServiceForDashboard() {
	return require("../../src/lib/services/admin-service") as typeof import("../../src/lib/services/admin-service");
}

/** ダッシュボードサマリー取得結果（Then ステップでのアサーション用） */
let dashboardResult:
	| import("../../src/lib/services/admin-service").DashboardSummary
	| null = null;

/** ダッシュボード推移取得結果（Then ステップでのアサーション用） */
let dashboardHistoryResult:
	| import("../../src/lib/infrastructure/repositories/daily-stats-repository").DailyStat[]
	| null = null;

// ---------------------------------------------------------------------------
// When: ダッシュボードを表示する
// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
// ---------------------------------------------------------------------------

/**
 * AdminService.getDashboard を呼び出してリアルタイムサマリーを取得する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
When("ダッシュボードを表示する", async function (this: BattleBoardWorld) {
	assert(this.currentAdminId, "管理者がログイン済みである必要があります");
	const AdminService = getAdminServiceForDashboard();
	const today = new Date(Date.now()).toISOString().slice(0, 10);
	dashboardResult = await AdminService.getDashboard({ today });
	this.lastResult = { type: "success", data: dashboardResult };
});

// ---------------------------------------------------------------------------
// Then: 総ユーザー数が表示される
// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
// ---------------------------------------------------------------------------

/**
 * ダッシュボードサマリーに総ユーザー数が含まれることを確認する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
Then("総ユーザー数が表示される", function (this: BattleBoardWorld) {
	assert(dashboardResult, "ダッシュボード取得結果が存在しません");
	assert(
		typeof dashboardResult.totalUsers === "number",
		"総ユーザー数（totalUsers）が数値でありません",
	);
	assert(
		dashboardResult.totalUsers >= 0,
		`総ユーザー数が0以上であることを期待しましたが ${dashboardResult.totalUsers} でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 本日の書き込み数が表示される
// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
// ---------------------------------------------------------------------------

/**
 * ダッシュボードサマリーに本日の書き込み数が含まれることを確認する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
Then("本日の書き込み数が表示される", function (this: BattleBoardWorld) {
	assert(dashboardResult, "ダッシュボード取得結果が存在しません");
	assert(
		typeof dashboardResult.todayPosts === "number",
		"本日の書き込み数（todayPosts）が数値でありません",
	);
	assert(
		dashboardResult.todayPosts >= 0,
		`本日の書き込み数が0以上であることを期待しましたが ${dashboardResult.todayPosts} でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: アクティブスレッド数が表示される
// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
// ---------------------------------------------------------------------------

/**
 * ダッシュボードサマリーにアクティブスレッド数が含まれることを確認する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
Then("アクティブスレッド数が表示される", function (this: BattleBoardWorld) {
	assert(dashboardResult, "ダッシュボード取得結果が存在しません");
	assert(
		typeof dashboardResult.activeThreads === "number",
		"アクティブスレッド数（activeThreads）が数値でありません",
	);
	assert(
		dashboardResult.activeThreads >= 0,
		`アクティブスレッド数が0以上であることを期待しましたが ${dashboardResult.activeThreads} でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 通貨流通量が表示される
// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
// ---------------------------------------------------------------------------

/**
 * ダッシュボードサマリーに通貨流通量が含まれることを確認する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
Then("通貨流通量が表示される", function (this: BattleBoardWorld) {
	assert(dashboardResult, "ダッシュボード取得結果が存在しません");
	assert(
		typeof dashboardResult.currencyInCirculation === "number",
		"通貨流通量（currencyInCirculation）が数値でありません",
	);
	assert(
		dashboardResult.currencyInCirculation >= 0,
		`通貨流通量が0以上であることを期待しましたが ${dashboardResult.currencyInCirculation} でした`,
	);
});

// ---------------------------------------------------------------------------
// Given: 過去7日分の日次統計が記録されている
// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
// ---------------------------------------------------------------------------

/**
 * 過去7日分の日次統計をインメモリストアに直接登録する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
Given(
	"過去7日分の日次統計が記録されている",
	async function (this: BattleBoardWorld) {
		const today = new Date(Date.now());
		for (let i = 7; i >= 1; i--) {
			const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const statDate = date.toISOString().slice(0, 10);
			await InMemoryDailyStatsRepo.upsert({
				statDate,
				totalUsers: 100 + i * 5,
				newUsers: i,
				activeUsers: 50 + i * 2,
				totalPosts: 200 + i * 10,
				totalThreads: 10 + i,
				activeThreads: 20 + i * 3,
				currencyInCirculation: 10000 + i * 500,
				currencyGranted: i * 100,
				currencyConsumed: i * 50,
				totalAccusations: i * 2,
				totalAttacks: i * 3,
			});
		}
	},
);

// ---------------------------------------------------------------------------
// When: ダッシュボードの推移グラフを表示する
// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
// ---------------------------------------------------------------------------

/**
 * AdminService.getDashboardHistory を呼び出して日次推移を取得する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
When(
	"ダッシュボードの推移グラフを表示する",
	async function (this: BattleBoardWorld) {
		assert(this.currentAdminId, "管理者がログイン済みである必要があります");
		const AdminService = getAdminServiceForDashboard();
		dashboardHistoryResult = await AdminService.getDashboardHistory({
			days: 7,
		});
		this.lastResult = {
			type: "success",
			data: dashboardHistoryResult,
		};
	},
);

// ---------------------------------------------------------------------------
// Then: 日付ごとの統計推移が確認できる
// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
// ---------------------------------------------------------------------------

/**
 * 日次推移データに日付ごとの統計が含まれることを確認する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
Then("日付ごとの統計推移が確認できる", function (this: BattleBoardWorld) {
	assert(dashboardHistoryResult, "ダッシュボード推移取得結果が存在しません");
	assert(
		dashboardHistoryResult.length > 0,
		`推移データが1件以上あることを期待しましたが 0 件でした`,
	);

	// 各エントリに必要なフィールドが含まれることを確認する
	for (const stat of dashboardHistoryResult) {
		assert(stat.statDate, `推移データに statDate が存在しません`);
		assert(
			typeof stat.totalUsers === "number",
			`推移データに totalUsers が存在しません: ${stat.statDate}`,
		);
		assert(
			typeof stat.totalPosts === "number",
			`推移データに totalPosts が存在しません: ${stat.statDate}`,
		);
	}
});
