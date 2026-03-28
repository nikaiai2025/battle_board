/**
 * dev_board.feature ステップ定義
 *
 * 開発連絡板（認証なし書き込み、バリデーション、ページネーション）に関する
 * 全6シナリオを実装する。
 *
 * DevPostService は dev-post-repository.ts を静的 import しているため、
 * register-mocks.js によるキャッシュ差し込みで InMemory 実装に差し替える。
 *
 * サービス層は動的 require で取得する（モック差し替え後に呼ばれるため）。
 *
 * "エラーメッセージが表示される" ステップは common.steps.ts で定義済みのため、
 * このファイルでは定義しない。代わりに When ステップでエラー時に
 * this.lastResult を設定することで common ステップの検証が機能する。
 *
 * See: features/dev_board.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { InMemoryDevPostRepo } from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getDevPostService() {
	return require("../../src/lib/services/dev-post-service") as typeof import("../../src/lib/services/dev-post-service");
}

// ---------------------------------------------------------------------------
// World の拡張型定義
// DevBoard シナリオ固有のコンテキストを World に追加する。
// ---------------------------------------------------------------------------

interface DevBoardContext {
	/** 最後の getPosts 結果 */
	lastPaginatedPosts?: Awaited<
		ReturnType<
			typeof import("../../src/lib/services/dev-post-service").getPosts
		>
	>;
	/** 書き込み前の投稿件数（追加確認用） */
	postCountBefore?: number;
}

type DevBoardWorld = BattleBoardWorld & DevBoardContext;

// ---------------------------------------------------------------------------
// Given: ユーザーが開発連絡板を表示している
// See: features/dev_board.feature @認証なしで書き込みができる
// See: features/dev_board.feature @名前は必須である
// See: features/dev_board.feature @本文が空の場合は投稿できない
// ---------------------------------------------------------------------------

/**
 * ユーザーが開発連絡板を表示している。
 * 特に事前状態は不要（InMemory ストアは Before フックでリセット済み）。
 * 書き込み前の件数を記録しておく（Then ステップでの追加確認に使用）。
 */
Given(
	"ユーザーが開発連絡板を表示している",
	async function (this: DevBoardWorld) {
		this.postCountBefore = await InMemoryDevPostRepo.count();
	},
);

// ---------------------------------------------------------------------------
// Given: 開発連絡板に書き込みが N 件ある
// See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
// See: features/dev_board.feature @書き込みが100件ごとにページ分割される
// See: features/dev_board.feature @2ページ目を表示できる
// ---------------------------------------------------------------------------

/**
 * 開発連絡板に書き込みが {int} 件ある。
 * InMemory ストアに指定件数の投稿を直接挿入する。
 * 投稿日時は1秒ずつ異なる値を設定して created_at DESC ソートを検証可能にする。
 */
Given(
	"開発連絡板に書き込みが{int}件ある",
	async function (this: DevBoardWorld, count: number) {
		// 基準時刻（古い順に 1 秒ずつ進める）
		const baseTime = new Date("2026-01-01T00:00:00Z");
		for (let i = 1; i <= count; i++) {
			InMemoryDevPostRepo._insert({
				id: i,
				name: `投稿者${i}`,
				title: "",
				body: `書き込み内容${i}`,
				url: "",
				createdAt: new Date(baseTime.getTime() + i * 1000),
			});
		}
	},
);

// ---------------------------------------------------------------------------
// When: 名前と本文を入力して投稿する
// See: features/dev_board.feature @認証なしで書き込みができる
// ---------------------------------------------------------------------------

/**
 * 名前 {string} と本文 {string} を入力して投稿する。
 * 成功時は this.lastResult を success に設定する。
 * エラー時は this.lastResult を error に設定する（common.steps.ts の
 * "エラーメッセージが表示される" ステップで検証できるようにする）。
 */
When(
	"名前 {string} と本文 {string} を入力して投稿する",
	async function (this: DevBoardWorld, name: string, body: string) {
		const DevPostService = getDevPostService();
		try {
			const post = await DevPostService.createPost(name, "", body, "");
			this.lastResult = { type: "success", data: post };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.lastResult = { type: "error", message };
		}
	},
);

// ---------------------------------------------------------------------------
// When: 名前を空にして本文を投稿する
// See: features/dev_board.feature @名前は必須である
// ---------------------------------------------------------------------------

/**
 * 名前を空にして本文 {string} を投稿する。
 * バリデーションエラーを this.lastResult に設定する。
 */
When(
	"名前を空にして本文 {string} を投稿する",
	async function (this: DevBoardWorld, body: string) {
		const DevPostService = getDevPostService();
		try {
			const post = await DevPostService.createPost("", "", body, "");
			this.lastResult = { type: "success", data: post };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.lastResult = { type: "error", message };
		}
	},
);

// ---------------------------------------------------------------------------
// When: 本文を空にして投稿する
// See: features/dev_board.feature @本文が空の場合は投稿できない
// ---------------------------------------------------------------------------

/**
 * 本文を空にして投稿する。
 * バリデーションエラーを this.lastResult に設定する。
 */
When("本文を空にして投稿する", async function (this: DevBoardWorld) {
	const DevPostService = getDevPostService();
	try {
		const post = await DevPostService.createPost("投稿者", "", "", "");
		this.lastResult = { type: "success", data: post };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		this.lastResult = { type: "error", message };
	}
});

// ---------------------------------------------------------------------------
// When: 開発連絡板を表示する
// See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
// See: features/dev_board.feature @書き込みが100件ごとにページ分割される
// ---------------------------------------------------------------------------

/**
 * 開発連絡板を表示する（1ページ目）。
 */
When("開発連絡板を表示する", async function (this: DevBoardWorld) {
	const DevPostService = getDevPostService();
	this.lastPaginatedPosts = await DevPostService.getPosts(1);
});

// ---------------------------------------------------------------------------
// When: 開発連絡板の2ページ目を表示する
// See: features/dev_board.feature @2ページ目を表示できる
// ---------------------------------------------------------------------------

/**
 * 開発連絡板の2ページ目を表示する。
 */
When("開発連絡板の2ページ目を表示する", async function (this: DevBoardWorld) {
	const DevPostService = getDevPostService();
	this.lastPaginatedPosts = await DevPostService.getPosts(2);
});

// ---------------------------------------------------------------------------
// Then: 書き込みが開発連絡板に表示される
// See: features/dev_board.feature @認証なしで書き込みができる
// ---------------------------------------------------------------------------

/**
 * 書き込みが開発連絡板に表示される。
 * InMemory ストアに1件増えていることを確認する。
 * また lastResult が success であることを確認する。
 */
Then("書き込みが開発連絡板に表示される", async function (this: DevBoardWorld) {
	assert.ok(this.lastResult !== null, "操作結果が存在すること");
	assert.strictEqual(
		this.lastResult?.type,
		"success",
		`投稿が成功していること（実際: ${this.lastResult?.type}）`,
	);
	const currentCount = await InMemoryDevPostRepo.count();
	const before = this.postCountBefore ?? 0;
	assert.strictEqual(
		currentCount,
		before + 1,
		`書き込み後の件数が ${before + 1} であること（実際: ${currentCount}）`,
	);
});

// ---------------------------------------------------------------------------
// Then: 認証を求められない
// See: features/dev_board.feature @認証なしで書き込みができる
// ---------------------------------------------------------------------------

/**
 * 認証を求められない。
 * lastResult が success であること（authRequired でないこと）を確認する。
 */
Then("認証を求められない", async function (this: DevBoardWorld) {
	assert.ok(this.lastResult !== null, "操作結果が存在すること");
	assert.notStrictEqual(
		this.lastResult?.type,
		"authRequired",
		`認証を求められないこと（実際: ${this.lastResult?.type}）`,
	);
	assert.notStrictEqual(
		this.lastResult?.type,
		"error",
		`認証エラーが発生していないこと（実際: ${this.lastResult?.type}）`,
	);
});

// ---------------------------------------------------------------------------
// Then: 書き込みは追加されない
// See: features/dev_board.feature @名前は必須である
// See: features/dev_board.feature @本文が空の場合は投稿できない
// ---------------------------------------------------------------------------

/**
 * 書き込みは追加されない。
 * InMemory ストアの件数が変わっていないことを確認する。
 */
Then("書き込みは追加されない", async function (this: DevBoardWorld) {
	const currentCount = await InMemoryDevPostRepo.count();
	const before = this.postCountBefore ?? 0;
	assert.strictEqual(
		currentCount,
		before,
		`書き込み件数が変化していないこと（期待: ${before}、実際: ${currentCount}）`,
	);
});

// ---------------------------------------------------------------------------
// Then: 書き込みが新しい順に表示される
// See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
// ---------------------------------------------------------------------------

/**
 * 書き込みが新しい順に表示される。
 * posts の createdAt が降順に並んでいることを確認する。
 */
Then("書き込みが新しい順に表示される", async function (this: DevBoardWorld) {
	assert.ok(this.lastPaginatedPosts, "getPosts の結果が存在すること");
	const posts = this.lastPaginatedPosts.posts;
	assert.ok(posts.length > 0, "投稿が1件以上存在すること");

	for (let i = 0; i < posts.length - 1; i++) {
		assert.ok(
			posts[i].createdAt.getTime() >= posts[i + 1].createdAt.getTime(),
			`投稿[${i}] (${posts[i].createdAt.toISOString()}) が ` +
				`投稿[${i + 1}] (${posts[i + 1].createdAt.toISOString()}) より新しいこと`,
		);
	}
});

// ---------------------------------------------------------------------------
// Then: 各書き込みに通番・名前・投稿日時が表示される
// See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
// ---------------------------------------------------------------------------

/**
 * 各書き込みに通番・名前・投稿日時が表示される。
 * 各 DevPost に id・name・createdAt が存在することを確認する。
 */
Then(
	"各書き込みに通番・名前・投稿日時が表示される",
	async function (this: DevBoardWorld) {
		assert.ok(this.lastPaginatedPosts, "getPosts の結果が存在すること");
		const posts = this.lastPaginatedPosts.posts;
		for (const post of posts) {
			assert.ok(
				post.id !== undefined && post.id !== null,
				`通番 (id) が存在すること（post.id: ${post.id}）`,
			);
			assert.ok(
				post.name !== undefined && post.name !== null && post.name !== "",
				`名前が存在すること（post.name: ${post.name}）`,
			);
			assert.ok(
				post.createdAt instanceof Date,
				`投稿日時が Date 型であること（post.createdAt: ${post.createdAt}）`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 最新の100件が表示される
// See: features/dev_board.feature @書き込みが100件ごとにページ分割される
// ---------------------------------------------------------------------------

/**
 * 最新の100件が表示される。
 * getPosts(1) の結果が100件であることを確認する。
 * 1ページ目は id=250（最新）〜 id=151 の投稿が表示される。
 */
Then("最新の100件が表示される", async function (this: DevBoardWorld) {
	assert.ok(this.lastPaginatedPosts, "getPosts の結果が存在すること");
	assert.strictEqual(
		this.lastPaginatedPosts.posts.length,
		100,
		`1ページ目が100件であること（実際: ${this.lastPaginatedPosts.posts.length}）`,
	);
	// 最新100件 = ストア内で最も新しい id=250〜151 の投稿
	const posts = this.lastPaginatedPosts.posts;
	assert.strictEqual(
		posts[0].id,
		250,
		`1件目は最新投稿(id=250)であること（実際: ${posts[0].id}）`,
	);
	assert.strictEqual(
		posts[99].id,
		151,
		`100件目は id=151 であること（実際: ${posts[99].id}）`,
	);
});

// ---------------------------------------------------------------------------
// Then: ページ送りリンク "[1] [2] [3]" が表示される
// See: features/dev_board.feature @書き込みが100件ごとにページ分割される
// ---------------------------------------------------------------------------

/**
 * ページ送りリンク "[1] [2] [3]" が表示される。
 * totalPages が 3 であることを確認する（250件 / 100件 = 3ページ）。
 */
Then(
	"ページ送りリンク {string} が表示される",
	async function (this: DevBoardWorld, _linkText: string) {
		assert.ok(this.lastPaginatedPosts, "getPosts の結果が存在すること");
		assert.strictEqual(
			this.lastPaginatedPosts.totalPages,
			3,
			`totalPages が 3 であること（実際: ${this.lastPaginatedPosts.totalPages}）`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 101件目〜200件目の書き込みが新しい順に表示される
// See: features/dev_board.feature @2ページ目を表示できる
// ---------------------------------------------------------------------------

/**
 * 101件目〜200件目の書き込みが新しい順に表示される。
 * 2ページ目は offset=100 から 100件取得するため、id=150〜51 の投稿が表示される。
 */
Then(
	"101件目〜200件目の書き込みが新しい順に表示される",
	async function (this: DevBoardWorld) {
		assert.ok(this.lastPaginatedPosts, "getPosts の結果が存在すること");
		const posts = this.lastPaginatedPosts.posts;
		assert.strictEqual(
			posts.length,
			100,
			`2ページ目が100件であること（実際: ${posts.length}）`,
		);
		// 2ページ目の先頭は全体で新しい順の101番目 = id=150
		assert.strictEqual(
			posts[0].id,
			150,
			`2ページ目先頭が id=150 であること（実際: ${posts[0].id}）`,
		);
		// 2ページ目の末尾は全体で新しい順の200番目 = id=51
		assert.strictEqual(
			posts[99].id,
			51,
			`2ページ目末尾が id=51 であること（実際: ${posts[99].id}）`,
		);
		// 新しい順に並んでいることを確認する
		for (let i = 0; i < posts.length - 1; i++) {
			assert.ok(
				posts[i].createdAt.getTime() >= posts[i + 1].createdAt.getTime(),
				`投稿[${i}] が 投稿[${i + 1}] より新しいこと`,
			);
		}
	},
);
