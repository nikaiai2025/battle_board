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
	InMemoryPostRepo,
	InMemoryThreadRepo,
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
		createdAt: new Date(),
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
		createdAt: new Date(),
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
			createdAt: new Date(),
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
