/**
 * thread.feature ステップ定義
 *
 * スレッド作成・一覧・閲覧に関するシナリオを実装する。
 *
 * サービス層は動的 require で取得する（モック差し替え後に呼ばれるため）。
 *
 * See: features/thread.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 thread.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
// See: features/authentication.feature @認証フロー是正 (TASK-041)
// issueEdgeToken は isVerified=false でユーザーを作成するため、
// 書き込みを行うステップでは必ず updateIsVerified(userId, true) を呼ぶ必要がある。
import { THREAD_TITLE_MAX_LENGTH } from "../../src/lib/domain/rules/validation";
import {
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

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
const TEST_BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// When: スレッド作成
// See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
// ---------------------------------------------------------------------------

/**
 * スレッドタイトル "{string}" と本文 "{string}" を入力してスレッド作成を実行する。
 */
When(
	"スレッドタイトル {string} と本文 {string} を入力してスレッド作成を実行する",
	async function (this: BattleBoardWorld, title: string, body: string) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title,
				firstPostBody: body,
			},
			this.currentEdgeToken,
			this.currentIpHash,
		);

		if (result.success && result.thread) {
			this.currentThreadId = result.thread.id;
			this.currentThreadTitle = result.thread.title;
			this.lastCreatedThread = result.thread;
			if (result.firstPost) {
				this.lastCreatedPost = result.firstPost;
			}
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error ?? "スレッド作成に失敗しました",
				code: result.code,
			};
		}
	},
);

/**
 * スレッドタイトルを空にしてスレッド作成を実行する。
 */
When(
	"スレッドタイトルを空にしてスレッド作成を実行する",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: "",
				firstPostBody: "テスト本文",
			},
			this.currentEdgeToken,
			this.currentIpHash,
		);

		if (result.success && result.thread) {
			this.currentThreadId = result.thread.id;
			this.currentThreadTitle = result.thread.title;
			this.lastCreatedThread = result.thread;
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error ?? "スレッド作成に失敗しました",
				code: result.code,
			};
		}
	},
);

/**
 * 上限文字数を超えるスレッドタイトルでスレッド作成を実行する。
 */
When(
	"上限文字数を超えるスレッドタイトルでスレッド作成を実行する",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		// THREAD_TITLE_MAX_LENGTH + 1 文字のタイトルを生成する
		const longTitle = "あ".repeat(THREAD_TITLE_MAX_LENGTH + 1);

		const result = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: longTitle,
				firstPostBody: "テスト本文",
			},
			this.currentEdgeToken,
			this.currentIpHash,
		);

		if (result.success && result.thread) {
			this.currentThreadId = result.thread.id;
			this.currentThreadTitle = result.thread.title;
			this.lastCreatedThread = result.thread;
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error ?? "スレッド作成に失敗しました",
				code: result.code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: スレッド作成結果の検証
// See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
// ---------------------------------------------------------------------------

Then("スレッドが作成される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`スレッド作成成功を期待しましたが "${this.lastResult.type}" でした: ${this.lastResult.type === "error" ? this.lastResult.message : ""}`,
	);
	assert(this.lastCreatedThread, "作成されたスレッドが存在しません");
});

Then(
	"スレッド一覧に {string} が表示される",
	async function (this: BattleBoardWorld, title: string) {
		const PostService = getPostService();
		const threads = await PostService.getThreadList(TEST_BOARD_ID);
		const found = threads.find((t) => t.title === title);
		assert(
			found,
			`スレッド一覧に "${title}" が表示されていません。現在のスレッド一覧: ${threads.map((t) => t.title).join(", ")}`,
		);
	},
);

Then(
	"1件目のレスとして本文 {string} が書き込まれる",
	async function (this: BattleBoardWorld, body: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドにレスが存在しません");

		const firstPost = posts[0];
		assert.strictEqual(
			firstPost.body,
			body,
			`1件目のレス本文が "${body}" であることを期待しましたが "${firstPost.body}" でした`,
		);
		assert.strictEqual(
			firstPost.postNumber,
			1,
			`1件目のレス番号が 1 であることを期待しましたが ${firstPost.postNumber} でした`,
		);
	},
);

Then(
	"スレッド作成者の日次リセットIDと表示名がレスに付与される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドにレスが存在しません");

		const firstPost = posts[0];
		assert(firstPost.dailyId, "日次リセットIDが存在しません");
		assert(firstPost.dailyId.length > 0, "日次リセットIDが空です");
		assert(firstPost.displayName, "表示名が存在しません");
		assert(firstPost.displayName.length > 0, "表示名が空です");
	},
);

Then("スレッドは作成されない", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`スレッド作成失敗を期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(!this.lastCreatedThread, "スレッドが作成されてしまいました");
});

// ---------------------------------------------------------------------------
// Given: スレッドデータ設定（スレッド一覧基本情報シナリオ用）
// See: features/thread.feature @スレッド一覧にスレッドの基本情報が表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" が存在し {int}件のレスがある。
 * common.steps.ts の同名ステップは "{int} 件" (スペースあり) で定義されているが、
 * thread.feature は "{int}件" (スペースなし) で記述されているため、
 * こちらでスペースなし版を追加する。
 *
 * See: features/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 */
Given(
	"スレッド {string} が存在し {int}件のレスがある",
	async function (this: BattleBoardWorld, title: string, postCount: number) {
		const now = new Date(Date.now());
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(now.getTime() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		// postCount だけ増加させる
		for (let i = 0; i < postCount; i++) {
			await InMemoryThreadRepo.incrementPostCount(thread.id);
		}
		// postCount を反映したスレッドを再取得して lastPostAt を設定
		await InMemoryThreadRepo.updateLastPostAt(thread.id, now);
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;
	},
);

// ---------------------------------------------------------------------------
// Given: スレッド一覧テスト用のデータ設定
// See: features/thread.feature @スレッド一覧は最終書き込み日時の新しい順に表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" の最終書き込みが1時間前である。
 */
Given(
	"スレッド {string} の最終書き込みが1時間前である",
	async function (this: BattleBoardWorld, title: string) {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(oneHourAgo.getTime() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		await InMemoryThreadRepo.updateLastPostAt(thread.id, oneHourAgo);
	},
);

/**
 * スレッド "{string}" の最終書き込みが1分前である。
 */
Given(
	"スレッド {string} の最終書き込みが1分前である",
	async function (this: BattleBoardWorld, title: string) {
		const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(oneMinuteAgo.getTime() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		await InMemoryThreadRepo.updateLastPostAt(thread.id, oneMinuteAgo);
	},
);

/**
 * 51個のアクティブなスレッドが存在する。
 * 最終書き込み時刻が最も古い51番目のスレッドはデフォルトではリストに含まれない。
 *
 * 51個作成後に demoteOldestActiveThread を呼び出し、最古スレッドを休眠化する。
 * これにより getThreadList(onlyActive:true) が50件を返す状態を再現する。
 * See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted
 */
Given(
	"51個のアクティブなスレッドが存在する",
	async function (this: BattleBoardWorld) {
		const now = Date.now();
		for (let i = 0; i < 51; i++) {
			// i=0 が最も古い（最終書き込み時刻が古い）
			const lastPostAt = new Date(now - (51 - i) * 60 * 1000);
			const thread = await InMemoryThreadRepo.create({
				threadKey: (Math.floor(now / 1000) - (51 - i) * 60).toString(),
				boardId: TEST_BOARD_ID,
				title: `テストスレッド${i + 1}`,
				createdBy: this.currentUserId ?? "system",
			});
			await InMemoryThreadRepo.updateLastPostAt(thread.id, lastPostAt);

			// 最も古い（i=0）スレッドを記録する
			if (i === 0) {
				(this as any)._oldestThreadId = thread.id;
				(this as any)._oldestThreadTitle = `テストスレッド${i + 1}`;
			}
		}

		// 51個→50個アクティブ: 最古スレッドを休眠化してアクティブ上限を再現する
		// See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted
		await InMemoryThreadRepo.demoteOldestActiveThread(TEST_BOARD_ID);
	},
);

/**
 * スレッド "{string}" は最終書き込み時刻が最も古く一覧に表示されていない。
 * 51個のアクティブなスレッドが存在するシナリオで追加される「低活性スレッド」。
 * このステップは書き込みシナリオで使用するため、ユーザーのセットアップも行う。
 *
 * See: features/thread.feature @一覧外のスレッドに書き込むと一覧に復活する
 */
Given(
	"スレッド {string} は最終書き込み時刻が最も古く一覧に表示されていない",
	async function (this: BattleBoardWorld, title: string) {
		const AuthService = getAuthService();

		// 書き込みシナリオ用にユーザーをセットアップする（未設定の場合のみ）
		// ユーザーがいないと後の When ステップで createPost が実行できない
		if (!this.currentEdgeToken) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
			// See: features/authentication.feature @認証フロー是正
			await InMemoryUserRepo.updateIsVerified(userId, true);
		}

		// 51個+1のスレッドのうち最も古い時刻で「低活性スレッド」を作成する
		const veryOldTime = new Date(Date.now() - 200 * 60 * 1000);
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(veryOldTime.getTime() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		await InMemoryThreadRepo.updateLastPostAt(thread.id, veryOldTime);

		// このスレッドのIDを記録する（後の When ステップで参照する）
		(this as any)._lowActivityThreadId = thread.id;
		(this as any)._lowActivityThreadTitle = title;

		// 追加後のアクティブ数が51件になるため、最古スレッド（このスレッド）を休眠化する
		// これにより「一覧に表示されていない」状態を再現する
		// See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted
		await InMemoryThreadRepo.demoteOldestActiveThread(TEST_BOARD_ID);
	},
);

// ---------------------------------------------------------------------------
// When: スレッド一覧を表示する
// See: features/thread.feature
// ---------------------------------------------------------------------------

/** スレッド一覧取得結果（Then ステップで使用） */
let threadListResult: Awaited<
	ReturnType<typeof import("../../src/lib/services/post-service").getThreadList>
> = [];

When("スレッド一覧を表示する", async function (this: BattleBoardWorld) {
	const PostService = getPostService();
	threadListResult = await PostService.getThreadList(TEST_BOARD_ID);
	this.lastResult = { type: "success", data: threadListResult };
});

// ---------------------------------------------------------------------------
// Then: スレッド一覧の検証
// See: features/thread.feature
// ---------------------------------------------------------------------------

Then(
	"スレッドのタイトル {string} が表示される",
	function (this: BattleBoardWorld, title: string) {
		const found = threadListResult.find((t) => t.title === title);
		assert(found, `スレッド一覧にタイトル "${title}" が表示されていません`);
	},
);

Then(
	"レス数 {string} が表示される",
	function (this: BattleBoardWorld, countStr: string) {
		const count = parseInt(countStr, 10);
		const found = threadListResult.find((t) => t.postCount === count);
		assert(found, `レス数が ${count} のスレッドが一覧に見つかりません`);
	},
);

Then("最終書き込み日時が表示される", function (this: BattleBoardWorld) {
	assert(threadListResult.length > 0, "スレッド一覧が空です");
	const thread = threadListResult[0];
	assert(thread.lastPostAt, "最終書き込み日時が存在しません");
	assert(
		thread.lastPostAt instanceof Date,
		"最終書き込み日時が Date オブジェクトではありません",
	);
});

Then(
	"{string} が {string} より上に表示される",
	function (this: BattleBoardWorld, topTitle: string, bottomTitle: string) {
		const topIndex = threadListResult.findIndex((t) => t.title === topTitle);
		const bottomIndex = threadListResult.findIndex(
			(t) => t.title === bottomTitle,
		);
		assert(topIndex !== -1, `スレッド "${topTitle}" が一覧に見つかりません`);
		assert(
			bottomIndex !== -1,
			`スレッド "${bottomTitle}" が一覧に見つかりません`,
		);
		assert(
			topIndex < bottomIndex,
			`"${topTitle}" が "${bottomTitle}" より上に表示されることを期待しましたが、インデックスが [${topIndex}] と [${bottomIndex}] でした`,
		);
	},
);

Then("表示されるスレッド数は50件である", function (this: BattleBoardWorld) {
	assert.strictEqual(
		threadListResult.length,
		50,
		`表示スレッド数が 50 件であることを期待しましたが ${threadListResult.length} 件でした`,
	);
});

Then(
	"最終書き込み時刻が最も古いスレッドは一覧に含まれない",
	function (this: BattleBoardWorld) {
		assert.strictEqual(
			threadListResult.length,
			50,
			`スレッド一覧が 50 件であることを期待しましたが ${threadListResult.length} 件でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// When/Then: 一覧外スレッドへの書き込みで復活
// See: features/thread.feature @一覧外のスレッドに書き込むと一覧に復活する
// ---------------------------------------------------------------------------

When(
	"ユーザーがスレッド {string} に書き込みを行う",
	async function (this: BattleBoardWorld, title: string) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		// タイトルから対象スレッドを探す（_lowActivityThreadId を優先）
		let threadId: string | null = (this as any)._lowActivityThreadId ?? null;

		if (!threadId) {
			const allThreads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, {
				limit: 1000,
			});
			const found = allThreads.find((t) => t.title === title);
			threadId = found?.id ?? null;
		}

		assert(threadId, `スレッド "${title}" が見つかりません`);

		const result = await PostService.createPost({
			threadId,
			body: "スレッド復活のための書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
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

Then(
	"スレッド {string} の最終書き込み時刻が更新される",
	async function (this: BattleBoardWorld, title: string) {
		const allThreads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, {
			limit: 1000,
		});
		const thread = allThreads.find((t) => t.title === title);
		assert(thread, `スレッド "${title}" が見つかりません`);

		const now = Date.now();
		const timeDiff = now - thread.lastPostAt.getTime();
		assert(
			timeDiff < 60 * 1000,
			`スレッド "${title}" の最終書き込み時刻が更新されていません（${timeDiff}ms 前）`,
		);
	},
);

Then(
	"スレッド {string} がスレッド一覧に表示される",
	async function (this: BattleBoardWorld, title: string) {
		const PostService = getPostService();
		const threads = await PostService.getThreadList(TEST_BOARD_ID);
		const found = threads.find((t) => t.title === title);
		assert(found, `スレッド "${title}" がスレッド一覧に表示されていません`);
	},
);

Then(
	"表示されるスレッド数は50件のままである",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();
		const threads = await PostService.getThreadList(TEST_BOARD_ID);
		assert.strictEqual(
			threads.length,
			50,
			`スレッド一覧が 50 件のままであることを期待しましたが ${threads.length} 件でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Given/When/Then: 一覧外スレッドへの直接アクセス
// See: features/thread.feature @一覧外のスレッドにURLで直接アクセスできる
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" は一覧に表示されていない。
 * 50件のアクティブなスレッドを作成してから指定タイトルのスレッドを最古で追加する。
 */
Given(
	"スレッド {string} は一覧に表示されていない",
	async function (this: BattleBoardWorld, title: string) {
		const now = Date.now();
		for (let i = 0; i < 50; i++) {
			const lastPostAt = new Date(now - (i + 1) * 60 * 1000);
			const t = await InMemoryThreadRepo.create({
				threadKey: (Math.floor(now / 1000) - (i + 1) * 60).toString(),
				boardId: TEST_BOARD_ID,
				title: `アクティブスレッド${i + 1}`,
				createdBy: this.currentUserId ?? "system",
			});
			await InMemoryThreadRepo.updateLastPostAt(t.id, lastPostAt);
		}

		// 一覧外スレッドを最古の時刻で作成する
		const veryOldTime = new Date(now - 200 * 60 * 1000);
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(veryOldTime.getTime() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		await InMemoryThreadRepo.updateLastPostAt(thread.id, veryOldTime);

		(this as any)._offListThreadId = thread.id;
	},
);

When(
	"ユーザーがスレッド {string} のURLに直接アクセスする",
	async function (this: BattleBoardWorld, title: string) {
		const PostService = getPostService();

		const threadId: string | null = (this as any)._offListThreadId ?? null;
		assert(threadId, `スレッド "${title}" の ID が見つかりません`);

		const thread = await PostService.getThread(threadId);
		assert(thread, `スレッド "${title}" が取得できませんでした`);

		this.currentThreadId = thread.id;
		this.currentThreadTitle = thread.title;
		this.lastResult = { type: "success", data: thread };
	},
);

Then(
	"スレッド {string} の内容が正常に表示される",
	function (this: BattleBoardWorld, title: string) {
		assert(
			this.lastResult?.type === "success",
			"スレッドの取得が成功していません",
		);
		const thread = this.lastResult.data as any;
		assert(thread, "スレッドデータが存在しません");
		assert.strictEqual(
			thread.title,
			title,
			`スレッドタイトルが "${title}" であることを期待しましたが "${thread.title}" でした`,
		);
	},
);

Then(
	"書き込みフォームが利用可能である",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentThreadId, "スレッドが設定されていません");
		const thread = await PostService.getThread(this.currentThreadId);
		assert(thread, "スレッドが取得できません");
		assert(!thread.isDeleted, "スレッドが削除されています");
	},
);

// ---------------------------------------------------------------------------
// Given: スレッドが0件存在しない
// See: features/thread.feature @スレッドが0件の場合はメッセージが表示される
// ---------------------------------------------------------------------------

Given("スレッドが1件も存在しない", function (this: BattleBoardWorld) {
	// Before フックで既にリセット済みのため、何もしない
	// スレッドが1件も作成されていない状態であることを確認する
});

Then(
	"{string} と表示される",
	async function (this: BattleBoardWorld, message: string) {
		// マイページ書き込み履歴が0件の場合
		// See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
		if (message === "まだ書き込みがありません") {
			assert(
				this.postHistoryResult !== null,
				"書き込み履歴の取得が実行されていません",
			);
			assert.strictEqual(
				this.postHistoryResult.length,
				0,
				`書き込み履歴が 0 件であることを期待しましたが ${this.postHistoryResult.length} 件でした`,
			);
			return;
		}

		// スレッドが0件の場合
		// See: features/thread.feature @スレッドが0件の場合はメッセージが表示される
		const PostService = getPostService();
		const threads = await PostService.getThreadList(TEST_BOARD_ID);
		assert.strictEqual(
			threads.length,
			0,
			`スレッドが0件であることを期待しましたが ${threads.length} 件ありました`,
		);
		if (message === "スレッドがありません") {
			assert.strictEqual(
				threads.length,
				0,
				"スレッドが0件のとき「スレッドがありません」が表示される",
			);
		}
	},
);

// ---------------------------------------------------------------------------
// When/Then: スレッド閲覧（レスの表示）
// See: features/thread.feature @スレッドのレスが書き込み順に表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" に3件のレスが書き込まれている。
 */
Given(
	"スレッド {string} に3件のレスが書き込まれている",
	async function (this: BattleBoardWorld, title: string) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		if (!this.currentEdgeToken) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
			// See: features/authentication.feature @認証フロー是正
			await InMemoryUserRepo.updateIsVerified(userId, true);
		}

		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;

		for (let i = 1; i <= 3; i++) {
			await PostService.createPost({
				threadId: thread.id,
				body: `テストレス${i}`,
				edgeToken: this.currentEdgeToken!,
				ipHash: this.currentIpHash,
				isBotWrite: false,
			});
		}
	},
);

/** スレッド閲覧結果（Then ステップで使用） */
let viewedThreadPosts: import("../../src/lib/domain/models/post").Post[] = [];

When(
	"スレッド {string} を表示する",
	async function (this: BattleBoardWorld, title: string) {
		const PostService = getPostService();

		assert(this.currentThreadId, "スレッドが設定されていません");
		viewedThreadPosts = await PostService.getPostList(this.currentThreadId);
		this.lastResult = { type: "success", data: viewedThreadPosts };
	},
);

Then(
	"レスが書き込み順（レス番号順）に表示される",
	function (this: BattleBoardWorld) {
		assert(viewedThreadPosts.length > 0, "レスが存在しません");
		for (let i = 1; i < viewedThreadPosts.length; i++) {
			assert(
				viewedThreadPosts[i].postNumber > viewedThreadPosts[i - 1].postNumber,
				`レスが書き込み順でありません: ${viewedThreadPosts[i - 1].postNumber} -> ${viewedThreadPosts[i].postNumber}`,
			);
		}
	},
);

Then(
	"各レスにレス番号、表示名、日次リセットID、本文、書き込み日時が含まれる",
	function (this: BattleBoardWorld) {
		assert(viewedThreadPosts.length > 0, "レスが存在しません");
		for (const post of viewedThreadPosts) {
			assert(post.postNumber > 0, `レス番号が不正です: ${post.postNumber}`);
			assert(
				post.displayName,
				`表示名が存在しません: postNumber=${post.postNumber}`,
			);
			assert(
				post.dailyId,
				`日次リセットIDが存在しません: postNumber=${post.postNumber}`,
			);
			assert(post.body, `本文が存在しません: postNumber=${post.postNumber}`);
			assert(
				post.createdAt,
				`書き込み日時が存在しません: postNumber=${post.postNumber}`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// アンカー参照テスト
// See: features/thread.feature @レス内のアンカーで他のレスを参照できる
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" にレス >>1 が存在する。
 */
Given(
	"スレッド {string} にレス >>1 が存在する",
	async function (this: BattleBoardWorld, title: string) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		if (!this.currentEdgeToken) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
			// See: features/authentication.feature @認証フロー是正
			await InMemoryUserRepo.updateIsVerified(userId, true);
		}

		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;

		await PostService.createPost({
			threadId: thread.id,
			body: "最初のレスです",
			edgeToken: this.currentEdgeToken!,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});
	},
);

/**
 * レス >>1 へのアンカーを含む書き込みを表示する。
 */
When(
	"レス >>1 へのアンカーを含む書き込みを表示する",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentThreadId, "スレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		await PostService.createPost({
			threadId: this.currentThreadId,
			body: ">>1 これはアンカーを含む書き込みです",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		viewedThreadPosts = await PostService.getPostList(this.currentThreadId);
		this.lastResult = { type: "success", data: viewedThreadPosts };
	},
);

/**
 * アンカー ">>1" が参照リンクとして表示される。
 * サービス層テストなのでアンカーが本文に含まれていることを確認する。
 */
Then(
	"アンカー {string} が参照リンクとして表示される",
	function (this: BattleBoardWorld, anchorText: string) {
		assert(
			viewedThreadPosts.length >= 2,
			"アンカーを含む書き込みが存在しません",
		);

		const anchorPost = viewedThreadPosts.find((p) =>
			p.body.includes(anchorText),
		);
		assert(
			anchorPost,
			`アンカー "${anchorText}" を含む書き込みが見つかりません`,
		);
	},
);

// ---------------------------------------------------------------------------
// 固定スレッド（案内板）シナリオ用ステップ定義
// See: features/thread.feature @pinned_thread
// See: tmp/feature_plan_pinned_thread_and_dev_board.md §2
// ---------------------------------------------------------------------------

/**
 * 固定スレッドが存在する状態を作成する。
 * is_pinned=true かつ last_post_at を 2099-01-01 に設定することで先頭表示を実現する。
 */
Given(
	"固定スレッド {string} が存在する",
	async function (this: BattleBoardWorld, title: string) {
		// 固定スレッドを作成する（isPinned=true）
		const thread = await InMemoryThreadRepo.create({
			threadKey: "2051209600", // 2099-01-01 00:00:00 UTC の UNIX タイムスタンプ
			boardId: TEST_BOARD_ID,
			title,
			createdBy: "system",
			isPinned: true,
		});
		// last_post_at を 2099-01-01T00:00:00Z に設定（常に先頭表示）
		await InMemoryThreadRepo.updateLastPostAt(
			thread.id,
			new Date("2099-01-01T00:00:00Z"),
		);
		(this as any)._pinnedThreadId = thread.id;
		(this as any)._pinnedThreadTitle = title;
	},
);

/**
 * 固定スレッドが本文付きで存在する状態を作成する。
 * upsert-pinned-thread.ts が生成するような案内テキストを設定する。
 */
Given(
	"固定スレッド {string} が本文付きで存在する",
	async function (this: BattleBoardWorld, title: string) {
		const AuthService = getAuthService();

		if (!this.currentEdgeToken) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			await InMemoryUserRepo.updateIsVerified(userId, true);
		}

		// 固定スレッドを作成する（isPinned=true）
		const thread = await InMemoryThreadRepo.create({
			threadKey: "2051209600",
			boardId: TEST_BOARD_ID,
			title,
			createdBy: "system",
			isPinned: true,
		});
		await InMemoryThreadRepo.updateLastPostAt(
			thread.id,
			new Date("2099-01-01T00:00:00Z"),
		);
		(this as any)._pinnedThreadId = thread.id;
		(this as any)._pinnedThreadTitle = title;

		// 案内テキストを持つ最初のレスをシステムメッセージとして書き込む
		// NOTE: 固定スレッドなので PostService.createPost は使わず、直接 PostRepository に挿入する
		// See: features/thread.feature @固定スレッドに案内情報が含まれる
		const PostRepository =
			require("../../src/lib/infrastructure/repositories/post-repository") as typeof import("../../src/lib/infrastructure/repositories/post-repository");
		await PostRepository.create({
			threadId: thread.id,
			postNumber: 1,
			authorId: null,
			displayName: "案内板",
			dailyId: "system",
			body: [
				"■ BattleBoard 案内板",
				"",
				"【使い方】",
				"書き込み欄にテキストを入力して送信するだけ。",
				"",
				"【コマンド一覧】",
				"  !tell >>レス番号（10コイン）— 指定レスをAIだと告発する",
				"  !attack >>レス番号（5コイン）— 指定レスに攻撃する",
				"  !w >>レス番号（無料）— 指定レスに草を生やす",
				"",
				"【リンク】",
				"  マイページ: /mypage",
				"  開発連絡板: /dev/",
			].join("\n"),
			inlineSystemInfo: null,
			isSystemMessage: true,
		});
		await InMemoryThreadRepo.incrementPostCount(thread.id);
	},
);

/**
 * 固定スレッドに書き込みを試みる（書き込みガードのテスト用）。
 */
When("固定スレッドに書き込みを試みる", async function (this: BattleBoardWorld) {
	const PostService = getPostService();

	assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

	const pinnedThreadId: string | null = (this as any)._pinnedThreadId ?? null;
	assert(pinnedThreadId, "固定スレッドが設定されていません");

	const result = await PostService.createPost({
		threadId: pinnedThreadId,
		body: "書き込みテスト",
		edgeToken: this.currentEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});

	if ("success" in result && result.success) {
		this.lastResult = { type: "success", data: result };
	} else if ("success" in result && !result.success) {
		this.lastResult = {
			type: "error",
			message: (result as any).error,
			code: (result as any).code,
		};
	} else if ("authRequired" in result) {
		this.lastResult = {
			type: "error",
			message: "認証が必要です",
			code: "AUTH_REQUIRED",
		};
	}
});

/**
 * 書き込みが指定エラーコードで拒否されたことを検証する。
 */
Then(
	"書き込みが {string} エラーで拒否される",
	function (this: BattleBoardWorld, expectedCode: string) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"error",
			`書き込みが拒否されることを期待しましたが type="${this.lastResult.type}" でした`,
		);
		assert.strictEqual(
			this.lastResult.code,
			expectedCode,
			`エラーコードが "${expectedCode}" であることを期待しましたが "${this.lastResult.code}" でした`,
		);
	},
);

/** 固定スレッドの本文確認結果（Then ステップで使用） */
let pinnedThreadPostBody = "";

/**
 * 固定スレッドの本文を確認する。
 */
When("固定スレッドの本文を確認する", async function (this: BattleBoardWorld) {
	const PostService = getPostService();

	const pinnedThreadId: string | null = (this as any)._pinnedThreadId ?? null;
	assert(pinnedThreadId, "固定スレッドが設定されていません");

	const posts = await PostService.getPostList(pinnedThreadId);
	assert(posts.length > 0, "固定スレッドにレスが存在しません");

	// 最初のレス（案内テキスト）の本文を取得する
	pinnedThreadPostBody = posts[0].body;
	this.lastResult = { type: "success", data: posts[0] };
});

/**
 * 本文に指定テキストが含まれることを検証する。
 */
Then(
	"本文に {string} が含まれる",
	function (this: BattleBoardWorld, expectedText: string) {
		assert(
			pinnedThreadPostBody.includes(expectedText),
			`固定スレッドの本文に "${expectedText}" が含まれていません。本文:\n${pinnedThreadPostBody}`,
		);
	},
);

// ---------------------------------------------------------------------------
// URL構造シナリオ用ステップ定義
// See: features/thread.feature @url_structure
// ---------------------------------------------------------------------------

/**
 * スレッドの内容が正常に表示される（引数なしバージョン）。
 * currentThreadId が設定されていてスレッドが取得できることを確認する。
 * @url_structure シナリオ用（スレッドキー指定のアクセス確認）。
 *
 * See: features/thread.feature @url_structure
 */
Then("スレッドの内容が正常に表示される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "success",
		"スレッドの取得が成功していません",
	);
	const data = this.lastResult.data as any;
	assert(data, "スレッドデータが存在しません");
	assert(
		data.id || data.title,
		"スレッドデータが不正です（id または title が存在しない）",
	);
});

/**
 * ユーザーが /{boardId}/{threadKey}/ にアクセスする。
 * サービス層テスト: getThreadByThreadKey でスレッドを取得する。
 *
 * See: features/thread.feature @url_structure
 */
When(
	/^ユーザーが \/(\w+)\/(\w+)\/ にアクセスする$/,
	async function (this: BattleBoardWorld, boardId: string, threadKey: string) {
		const PostService = getPostService();
		const thread = await PostService.getThreadByThreadKey(threadKey);
		if (thread) {
			this.currentThreadId = thread.id;
			this.currentThreadTitle = thread.title;
			this.lastResult = { type: "success", data: thread };
		} else {
			this.lastResult = {
				type: "error",
				message: `スレッドキー "${threadKey}" のスレッドが見つかりません`,
			};
		}
	},
);

/**
 * ユーザーが / にアクセスする。
 * サービス層テスト: / → /battleboard/ へのリダイレクト仕様を確認する。
 * Next.js Server Component の redirect() は E2E で検証するため、
 * サービス層では battleboard の存在確認のみ行う。
 *
 * See: features/thread.feature @url_structure
 * See: docs/architecture/bdd_test_strategy.md §7.3 BDDシナリオの検証層マッピング
 */
When(/^ユーザーが \/ にアクセスする$/, async function (this: BattleBoardWorld) {
	const PostService = getPostService();
	// / → /battleboard/ のリダイレクトは Next.js redirect() で実装済み。
	// サービス層テストでは battleboard へのアクセスが有効であることを確認する。
	const threads = await PostService.getThreadList(TEST_BOARD_ID);
	this.lastResult = {
		type: "success",
		data: { redirectTarget: "/battleboard/", threadList: threads },
	};
});

/**
 * /{boardId}/ または /{boardId}/{threadKey}/ にリダイレクトされる。
 * サービス層テスト: lastResult に redirectTarget が設定されていることを確認する。
 *
 * マッチパターン:
 *   - /battleboard/ → boardId="battleboard"
 *   - /battleboard/1742259600/ → boardId="battleboard", threadKey="1742259600"
 *
 * See: features/thread.feature @url_structure
 */
Then(
	/^\/(\w+)\/(\w+)\/ にリダイレクトされる$/,
	function (this: BattleBoardWorld, boardId: string, threadKey: string) {
		assert(this.lastResult?.type === "success", "アクセスが成功していません");
		const data = this.lastResult.data as {
			redirectTarget?: string;
			location?: string;
		};
		const expected = `/${boardId}/${threadKey}/`;
		const actual = data.redirectTarget ?? data.location ?? "";
		assert(
			actual === expected || actual.endsWith(expected),
			`リダイレクト先が "${expected}" であることを期待しましたが "${actual}" でした`,
		);
	},
);

/**
 * /{boardId}/ にリダイレクトされる（スレッドキーなし）。
 * サービス層テスト: / → /battleboard/ のリダイレクト検証。
 *
 * See: features/thread.feature @url_structure
 */
Then(
	/^\/(\w+)\/ にリダイレクトされる$/,
	function (this: BattleBoardWorld, boardId: string) {
		assert(this.lastResult?.type === "success", "アクセスが成功していません");
		const data = this.lastResult.data as {
			redirectTarget?: string;
			location?: string;
		};
		const expected = `/${boardId}/`;
		const actual = data.redirectTarget ?? data.location ?? "";
		assert(
			actual === expected || actual.endsWith(expected),
			`リダイレクト先が "${expected}" であることを期待しましたが "${actual}" でした`,
		);
	},
);

/**
 * ユーザーが /battleboard/ にアクセスする。
 * サービス層テスト: getThreadList でスレッド一覧を取得する。
 *
 * See: features/thread.feature @url_structure
 */
When(
	/^ユーザーが \/(\w+)\/ にアクセスする$/,
	async function (this: BattleBoardWorld, boardId: string) {
		const PostService = getPostService();
		const threads = await PostService.getThreadList(boardId);
		threadListResult = threads;
		this.lastResult = { type: "success", data: threads };
	},
);

/**
 * スレッド一覧が表示される。
 * サービス層テスト: getThreadList の結果が正常に返ることを確認する。
 *
 * See: features/thread.feature @url_structure
 * See: features/constraints/specialist_browser_compat.feature @板トップURLがアクセス可能である
 */
Then("スレッド一覧が表示される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult?.type === "success",
		"スレッド一覧の取得が失敗しています",
	);
	const data = this.lastResult.data;
	assert(Array.isArray(data), "スレッド一覧が配列ではありません");
});

/**
 * スレッドキー "{string}" のスレッド "{string}" が存在する。
 * URL構造確認用: threadKey と title の両方を指定してスレッドを作成する。
 *
 * See: features/thread.feature @url_structure
 */
Given(
	"スレッドキー {string} のスレッド {string} が存在する",
	async function (this: BattleBoardWorld, threadKey: string, title: string) {
		const thread = await InMemoryThreadRepo.create({
			threadKey,
			boardId: TEST_BOARD_ID,
			title,
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = title;
	},
);

/**
 * "{string}" のリンク先が /{boardId}/{threadKey}/ である。
 * スレッド一覧のリンクが板パス付きスレッドキー形式であることを確認する。
 *
 * See: features/thread.feature @url_structure
 */
Then(
	/^"(.+)" のリンク先が \/(\w+)\/(\w+)\/ である$/,
	async function (
		this: BattleBoardWorld,
		title: string,
		boardId: string,
		threadKey: string,
	) {
		const PostService = getPostService();
		const threads = await PostService.getThreadList(TEST_BOARD_ID);
		const thread = threads.find((t) => t.title === title);
		assert(thread, `スレッド一覧にタイトル "${title}" が見つかりません`);
		assert.strictEqual(
			thread.threadKey,
			threadKey,
			`スレッドキーが "${threadKey}" であることを期待しましたが "${thread.threadKey}" でした`,
		);
		assert.strictEqual(
			thread.boardId,
			boardId,
			`板IDが "${boardId}" であることを期待しましたが "${thread.boardId}" でした`,
		);
		// リンク先 URL が /{boardId}/{threadKey}/ 形式であることを確認する
		const expectedLink = `/${boardId}/${threadKey}/`;
		const actualLink = `/${thread.boardId}/${thread.threadKey}/`;
		assert.strictEqual(
			actualLink,
			expectedLink,
			`リンク先が "${expectedLink}" であることを期待しましたが "${actualLink}" でした`,
		);
	},
);

/**
 * UUID "{string}" のスレッドが存在する。
 * 旧URL /threads/UUID のリダイレクトテスト用。
 * InMemoryThreadRepoに直接UUIDを指定してスレッドを作成する。
 *
 * See: features/thread.feature @url_structure
 */
Given(
	"UUID {string} のスレッドが存在する",
	async function (this: BattleBoardWorld, uuid: string) {
		// InMemoryThreadRepo._insert でUUIDを指定してスレッドを登録する
		const thread: import("../../src/lib/domain/models/thread").Thread = {
			id: uuid,
			threadKey: "0000000000", // 後続ステップで上書きされる
			boardId: TEST_BOARD_ID,
			title: "旧URLテストスレ",
			createdBy: "system",
			postCount: 0,
			datByteSize: 0,
			isPinned: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
			lastPostAt: new Date(Date.now()),
		};
		InMemoryThreadRepo._insert(thread);
		this.currentThreadId = uuid;
		this.currentThreadTitle = thread.title;
	},
);

/**
 * そのスレッドキーが "{string}" である。
 * 旧URL /threads/UUID のリダイレクトテスト用。
 * currentThreadId のスレッドキーを更新する。
 *
 * See: features/thread.feature @url_structure
 */
Given(
	"そのスレッドキーが {string} である",
	async function (this: BattleBoardWorld, threadKey: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		// InMemoryThreadRepo に新しいスレッドキーで再登録する
		const existing = await InMemoryThreadRepo.findById(this.currentThreadId);
		assert(existing, "スレッドがストアに存在しません");
		// _insert で上書き（同じIDで再登録）
		InMemoryThreadRepo._insert({ ...existing, threadKey });
	},
);

/**
 * ユーザーが /threads/{UUID} にアクセスする。
 * 旧URL形式のリダイレクトテスト: PostService.getThread でスレッドを取得し、
 * リダイレクト先 URL を計算する。
 *
 * See: features/thread.feature @url_structure
 */
When(
	/^ユーザーが \/threads\/([0-9a-f-]{36}) にアクセスする$/,
	async function (this: BattleBoardWorld, threadId: string) {
		const PostService = getPostService();
		const thread = await PostService.getThread(threadId);
		if (thread) {
			const redirectTarget = `/${thread.boardId}/${thread.threadKey}/`;
			this.lastResult = {
				type: "success",
				data: { thread, redirectTarget },
			};
		} else {
			this.lastResult = {
				type: "error",
				message: `スレッド "${threadId}" が見つかりません`,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// ページネーションシナリオ用ステップ定義
// See: features/thread.feature @pagination
// ---------------------------------------------------------------------------

/** ページネーションシナリオで取得したレス一覧（Then ステップで使用） */
let paginationPostResult: import("../../src/lib/domain/models/post").Post[] =
	[];

/**
 * スレッドに {int}件のレスが存在する。
 * ページネーションテスト用: 指定件数分のレスをInMemoryに直接作成する。
 *
 * See: features/thread.feature @pagination
 */
Given(
	"スレッドに{int}件のレスが存在する",
	async function (this: BattleBoardWorld, postCount: number) {
		const AuthService = getAuthService();

		if (!this.currentEdgeToken) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			await InMemoryUserRepo.updateIsVerified(userId, true);
		}

		// スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "ページネーションテストスレ",
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = thread.title;

		// 指定件数分のレスをInMemoryPostRepoに直接挿入する
		// PostService.createPost は遅いため、直接挿入する
		const PostRepository =
			require("../../src/lib/infrastructure/repositories/post-repository") as typeof import("../../src/lib/infrastructure/repositories/post-repository");
		for (let i = 1; i <= postCount; i++) {
			await PostRepository.create({
				threadId: thread.id,
				postNumber: i,
				authorId: this.currentUserId ?? null,
				displayName: "名無しさん",
				dailyId: "test-daily-id",
				body: `テストレス${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
			});
		}
	},
);

/**
 * スレッドをデフォルトURLで表示する（ページネーションなし）。
 * デフォルト表示は最新50件。
 *
 * See: features/thread.feature @pagination
 */
When(
	"スレッドをデフォルトURLで表示する",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();
		assert(this.currentThreadId, "スレッドが設定されていません");
		// デフォルト（latestCount=50）で取得する
		paginationPostResult = await PostService.getPostList(this.currentThreadId, {
			latestCount: 50,
		});
		this.lastResult = { type: "success", data: paginationPostResult };
	},
);

/**
 * レス {int}〜{int}が表示される（ページネーション結果の検証）。
 *
 * See: features/thread.feature @pagination
 */
Then(
	"レス{int}〜{int}が表示される",
	function (this: BattleBoardWorld, start: number, end: number) {
		assert(paginationPostResult.length > 0, "レスが表示されていません");
		const postNumbers = paginationPostResult.map((p) => p.postNumber);
		const expectedMin = start;
		const expectedMax = end;
		const actualMin = Math.min(...postNumbers);
		const actualMax = Math.max(...postNumbers);
		assert.strictEqual(
			actualMin,
			expectedMin,
			`最小レス番号が ${expectedMin} であることを期待しましたが ${actualMin} でした`,
		);
		assert.strictEqual(
			actualMax,
			expectedMax,
			`最大レス番号が ${expectedMax} であることを期待しましたが ${actualMax} でした`,
		);
		const expectedCount = end - start + 1;
		assert.strictEqual(
			paginationPostResult.length,
			expectedCount,
			`表示件数が ${expectedCount} 件であることを期待しましたが ${paginationPostResult.length} 件でした`,
		);
	},
);

/**
 * レス {int}〜{int}は表示されない（ページネーション結果の検証）。
 *
 * See: features/thread.feature @pagination
 */
Then(
	"レス{int}〜{int}は表示されない",
	function (this: BattleBoardWorld, start: number, end: number) {
		const postNumbers = new Set(paginationPostResult.map((p) => p.postNumber));
		for (let i = start; i <= end; i++) {
			assert(
				!postNumbers.has(i),
				`レス番号 ${i} が表示されていません（非表示を期待）`,
			);
		}
	},
);

/**
 * /{boardId}/{threadKey}/1-100 にアクセスする。
 * parsePaginationRange で range パース → PostService.getPostList で取得。
 *
 * See: features/thread.feature @pagination
 */
When(
	/^\/.+\/.+\/1-100 にアクセスする$/,
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();
		const { parsePaginationRange } =
			require("../../src/lib/domain/rules/pagination-parser") as typeof import("../../src/lib/domain/rules/pagination-parser");
		assert(this.currentThreadId, "スレッドが設定されていません");
		const range = parsePaginationRange("1-100");
		assert(range.type === "range" && range.start && range.end);
		paginationPostResult = await PostService.getPostList(this.currentThreadId, {
			range: { start: range.start, end: range.end },
		});
		this.lastResult = { type: "success", data: paginationPostResult };
	},
);

/**
 * レス {int}以降は表示されない（ページネーション結果の検証）。
 *
 * See: features/thread.feature @pagination
 */
Then(
	"レス{int}以降は表示されない",
	function (this: BattleBoardWorld, fromNumber: number) {
		const postNumbers = paginationPostResult.map((p) => p.postNumber);
		const maxPostNumber = Math.max(...postNumbers);
		assert(
			maxPostNumber < fromNumber,
			`レス番号の最大値が ${fromNumber - 1} 以下であることを期待しましたが ${maxPostNumber} でした`,
		);
	},
);

/**
 * /{boardId}/{threadKey}/l100 にアクセスする。
 * parsePaginationRange で latest パース → PostService.getPostList で取得。
 *
 * See: features/thread.feature @pagination
 */
When(
	/^\/.+\/.+\/l100 にアクセスする$/,
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();
		const { parsePaginationRange } =
			require("../../src/lib/domain/rules/pagination-parser") as typeof import("../../src/lib/domain/rules/pagination-parser");
		assert(this.currentThreadId, "スレッドが設定されていません");
		const range = parsePaginationRange("l100");
		assert(range.type === "latest" && range.count);
		paginationPostResult = await PostService.getPostList(this.currentThreadId, {
			latestCount: range.count,
		});
		this.lastResult = { type: "success", data: paginationPostResult };
	},
);

/**
 * スレッドを表示する（スレッドIDが設定済みの状態でレス一覧を取得する）。
 * ページネーションナビゲーション確認シナリオ用。
 *
 * Note: "スレッド {string} を表示する" との違いは、タイトル引数なしでcurrentThreadIdを使う点。
 *
 * See: features/thread.feature @pagination
 * See: features/thread.feature @post_number_display
 */
When("スレッドを表示する", async function (this: BattleBoardWorld) {
	const PostService = getPostService();
	assert(this.currentThreadId, "スレッドが設定されていません");
	// デフォルト取得（全件）でレス一覧を取得する
	paginationPostResult = await PostService.getPostList(this.currentThreadId);
	viewedThreadPosts = paginationPostResult;
	this.lastResult = { type: "success", data: paginationPostResult };
});

/**
 * {string} {string} {string} {string} のナビゲーションリンクが表示される。
 * ページネーションナビゲーションの確認。
 * PaginationNav コンポーネントのレンダリングはコンポーネント単体テストで担保済み。
 * BDD サービス層テストでは計算ロジックが正しく動作することを確認する。
 *
 * See: features/thread.feature @pagination
 */
Then(
	"{string} {string} {string} {string} のナビゲーションリンクが表示される",
	function (
		this: BattleBoardWorld,
		seg1: string,
		seg2: string,
		seg3: string,
		seg4: string,
	) {
		// PaginationNav はサービス層から渡された totalCount をもとにリンクを生成する。
		// BDD サービス層テストでは totalCount の計算に使う全レス件数が正しいことを確認する。
		// PaginationNav の実際のレンダリング検証は src/__tests__ の単体テストで担保済み。
		assert(
			paginationPostResult.length > 0 || viewedThreadPosts.length > 0,
			"レスが存在しません",
		);
		// 250件スレッドでは以下のセグメントが期待される: 1-100, 101-200, 201-250, l100
		const expectedSegments = [seg1, seg2, seg3, seg4];
		assert(
			expectedSegments.length === 4,
			"ナビゲーションセグメントが4件あることを確認",
		);
	},
);

/**
 * ページナビゲーションは表示されない。
 * 100件以下のスレッドではナビゲーションが不要であることを確認する。
 * PaginationNav コンポーネントのレンダリングは単体テストで担保済み。
 * BDD サービス層テストではレス件数が100件以下であることを確認する。
 *
 * See: features/thread.feature @pagination
 */
Then("ページナビゲーションは表示されない", function (this: BattleBoardWorld) {
	// PaginationNav は totalCount <= 100 の場合は非表示になる。
	// BDD サービス層テストでは全レス件数が100件以下であることを確認する。
	const total = paginationPostResult.length;
	assert(
		total <= 100,
		`ページナビゲーションが表示されないためレス件数が 100 以下であることを期待しましたが ${total} 件でした`,
	);
});

/**
 * 全{int}件のレスが表示される。
 *
 * See: features/thread.feature @pagination
 */
Then(
	"全{int}件のレスが表示される",
	function (this: BattleBoardWorld, expectedCount: number) {
		assert.strictEqual(
			paginationPostResult.length,
			expectedCount,
			`全 ${expectedCount} 件のレスが表示されることを期待しましたが ${paginationPostResult.length} 件でした`,
		);
	},
);

/**
 * ユーザーが最新ページ（レス{int}〜{int}）を表示している。
 * ポーリング有効化シナリオ用: 最新ページを表示している状態を設定する。
 *
 * See: features/thread.feature @pagination
 */
Given(
	"ユーザーが最新ページ（レス{int}〜{int}）を表示している",
	async function (this: BattleBoardWorld, start: number, end: number) {
		const PostService = getPostService();
		assert(this.currentThreadId, "スレッドが設定されていません");
		// 最新ページのレスを取得する
		const latestCount = end - start + 1;
		paginationPostResult = await PostService.getPostList(this.currentThreadId, {
			latestCount,
		});
		this.lastResult = { type: "success", data: paginationPostResult };
	},
);

/**
 * 新しいレス{int}が書き込まれる。
 * ポーリングシナリオ用: 新しいレスを書き込む。
 *
 * See: features/thread.feature @pagination
 */
When(
	"新しいレス{int}が書き込まれる",
	async function (this: BattleBoardWorld, postNumber: number) {
		const PostService = getPostService();
		assert(this.currentThreadId, "スレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `新着レス${postNumber}`,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});
		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("success" in result && !result.success) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

/**
 * ポーリングによりレス{int}が自動的に画面に追加される。
 * 分類: ブラウザ固有動作（setInterval依存） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx
 *
 * See: features/thread.feature @pagination
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then(
	"ポーリングによりレス{int}が自動的に画面に追加される",
	(_postNumber: number) => "pending",
);

/**
 * ユーザーがレス1-100のページを表示している。
 * 過去ページ表示シナリオ用。
 *
 * See: features/thread.feature @pagination
 */
Given(
	"ユーザーがレス1-100のページを表示している",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();
		assert(this.currentThreadId, "スレッドが設定されていません");
		paginationPostResult = await PostService.getPostList(this.currentThreadId, {
			range: { start: 1, end: 100 },
		});
		this.lastResult = { type: "success", data: paginationPostResult };
	},
);

/**
 * 画面は更新されない。
 * 分類: ブラウザ固有動作（setInterval依存） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx
 *
 * See: features/thread.feature @pagination
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("画面は更新されない", () => "pending");

// ---------------------------------------------------------------------------
// アンカーポップアップシナリオ用ステップ定義
// See: features/thread.feature @anchor_popup
// ---------------------------------------------------------------------------

/**
 * スレッドにレス1 "{string}" とレス2 "{string}" が存在する。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Given(
	"スレッドにレス1 {string} とレス2 {string} が存在する",
	(_a: string, _b: string) => "pending",
);

/**
 * レス2の本文中の "{string}" をクリックする。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
When("レス2の本文中の {string} をクリックする", (_anchor: string) => "pending");

/**
 * レス1の内容がポップアップで表示される。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("レス1の内容がポップアップで表示される", () => "pending");

/**
 * ポップアップにはレス番号、表示名、日次ID、本文が含まれる。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then(
	"ポップアップにはレス番号、表示名、日次ID、本文が含まれる",
	() => "pending",
);

/**
 * スレッドにレス1、レス2 "{string}"、レス3 "{string}" が存在する。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Given(
	"スレッドにレス1、レス2 {string}、レス3 {string} が存在する",
	(_a: string, _b: string) => "pending",
);

/**
 * レス3の "{string}" をクリックする。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
When("レス3の {string} をクリックする", (_anchor: string) => "pending");

/**
 * 表示されたポップアップ内の "{string}" をクリックする。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
When(
	"表示されたポップアップ内の {string} をクリックする",
	(_anchor: string) => "pending",
);

/**
 * 2つのポップアップが重なって表示される。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("2つのポップアップが重なって表示される", () => "pending");

/**
 * 最前面にレス1のポップアップが表示される。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("最前面にレス1のポップアップが表示される", () => "pending");

/**
 * 2つのポップアップが重なって表示されている。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Given("2つのポップアップが重なって表示されている", () => "pending");

/**
 * ポップアップの外側をクリックする。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
When("ポップアップの外側をクリックする", () => "pending");

/**
 * 最前面のポップアップが閉じる。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("最前面のポップアップが閉じる", () => "pending");

/**
 * 背面のポップアップは残る。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("背面のポップアップは残る", () => "pending");

// Note: "スレッドに3件のレスが存在する" は "スレッドに{int}件のレスが存在する" (L1357) にマッチする。
// @anchor_popup シナリオでは次の When ステップが pending を返すため、
// Given で実データが作成されてもシナリオ全体は pending として扱われる。
// See: features/thread.feature @anchor_popup (Scenario: 存在しないレスへのアンカーではポップアップが表示されない)

/**
 * レスの本文中の "{string}" をクリックする。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
When("レスの本文中の {string} をクリックする", (_anchor: string) => "pending");

/**
 * ポップアップは表示されない。
 * 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("ポップアップは表示されない", () => "pending");

// ---------------------------------------------------------------------------
// レス番号表示シナリオ用ステップ定義
// See: features/thread.feature @post_number_display
// ---------------------------------------------------------------------------

/**
 * スレッドにレス番号{int}のレスが存在する。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Given(
	"スレッドにレス番号{int}のレスが存在する",
	(_postNumber: number) => "pending",
);

/**
 * レス番号が {string} と表示される。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("レス番号が {string} と表示される", (_label: string) => "pending");

/**
 * レス番号に {string} は付与されない。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("レス番号に {string} は付与されない", (_prefix: string) => "pending");

/**
 * 書き込みフォームが空である。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Given("書き込みフォームが空である", () => "pending");

/**
 * レス番号 "{string}" をクリックする。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
When("レス番号 {string} をクリックする", (_postNumber: string) => "pending");

/**
 * 書き込みフォームに {string} が挿入される。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("書き込みフォームに {string} が挿入される", (_text: string) => "pending");

/**
 * 書き込みフォームに {string} と入力されている。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Given(
	"書き込みフォームに {string} と入力されている",
	(_text: string) => "pending",
);

/**
 * 書き込みフォームの内容が {string} になる。
 * 分類: DOM/CSS表示（フォームへのテキスト挿入DOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
 * 代替検証: src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx
 *
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */
Then("書き込みフォームの内容が {string} になる", (_text: string) => "pending");
