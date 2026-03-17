/**
 * 統合テスト専用ステップ定義
 *
 * integrationプロファイル（Supabase Local実DB）専用のGiven/Thenステップ。
 * defaultプロファイルのステップ定義は InMemoryリポジトリの直接操作（_insert等）に依存しており、
 * 実DBでは動作しない。このファイルはその代替として、サービス層と実リポジトリを経由して
 * データをセットアップするステップを提供する。
 *
 * 命名規則:
 *   - Given文言は「統合テスト用に〜」を接頭辞として、既存ステップとの重複を避ける
 *   - Then文言も「統合テスト用に〜」を接頭辞として重複を避ける
 *
 * See: features/integration/crud.feature
 * See: features/support/integration-hooks.ts（DBクリーンアップ）
 * See: docs/architecture/bdd_test_strategy.md §8 統合テスト方針
 * See: tmp/tasks/task_TASK-136.md §実装方針 > 方針A
 */

import { Given, Then } from "@cucumber/cucumber";
import assert from "assert";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// サービス層・リポジトリの動的 require ヘルパー
//
// 実DBモードでは register-real-repos.js がロードされ、モック差し替えを行わない。
// そのため動的 require でロードしたリポジトリは実Supabaseクライアントを使用する。
// See: features/support/register-real-repos.js
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

/** AuthService を動的 require で取得する */
function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

/** PostService を動的 require で取得する */
function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

/**
 * 実UserRepositoryを動的 require で取得する。
 * InMemoryUserRepo.updateIsVerified ではなく実DBを更新するために使用する。
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateIsVerified
 */
function getUserRepository() {
	return require("../../src/lib/infrastructure/repositories/user-repository") as typeof import("../../src/lib/infrastructure/repositories/user-repository");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-integration-test-ip-hash-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// Given: 統合テスト用に認証済みユーザーが存在する
//
// 既存の「ユーザーがログイン済みである」（common.steps.ts）との違い:
//   - InMemoryUserRepo.updateIsVerified の代わりに実UserRepository.updateIsVerified を呼ぶ
//   - 実DBの users テーブルの is_verified フラグを更新する
//   - verifyEdgeToken が実DBを参照するため、正常系テストには実DBの更新が必要
//
// See: features/integration/crud.feature @統合テスト：スレッドと最初のレスが実DBに保存される
// See: src/lib/infrastructure/repositories/user-repository.ts > updateIsVerified
// ---------------------------------------------------------------------------

/**
 * 統合テスト用に認証済みユーザーが存在する。
 *
 * AuthService.issueEdgeToken で実DBにユーザーを作成し、
 * UserRepository.updateIsVerified で is_verified=true に更新する。
 * これにより PostService.createThread / createPost が認証を通過できる。
 */
Given(
	"統合テスト用に認証済みユーザーが存在する",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const UserRepository = getUserRepository();

		// edge-token を発行し実DBにユーザーを INSERT する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;

		// 実DBの is_verified フラグを true に更新する
		// InMemoryUserRepo.updateIsVerified はInMemoryストアにしか反映されないため、
		// 統合テストでは実UserRepositoryを直接呼ぶ必要がある。
		// See: src/lib/services/post-service.ts > resolveAuth > verifyEdgeToken
		await UserRepository.updateIsVerified(userId, true);
	},
);

// ---------------------------------------------------------------------------
// Given: 統合テスト用にスレッドが実DBに存在する
//
// 既存の「スレッド "..." を閲覧している」（posting.steps.ts）との違い:
//   - InMemoryThreadRepo.create の代わりに PostService.createThread を使う
//   - 実DBの threads テーブルにスレッドを INSERT する
//
// See: features/integration/crud.feature @統合テスト：既存スレッドへのレス書き込みが実DBに保存される
// ---------------------------------------------------------------------------

/**
 * 統合テスト用にスレッド "{string}" が実DBに存在する。
 *
 * PostService.createThread でスレッドを作成し、currentThreadId を設定する。
 * 事前に「統合テスト用に認証済みユーザーが存在する」が実行されている必要がある。
 */
Given(
	"統合テスト用にスレッド {string} が実DBに存在する",
	async function (this: BattleBoardWorld, title: string) {
		const PostService = getPostService();

		assert(
			this.currentEdgeToken,
			"統合テスト用に認証済みユーザーが存在するを先に実行してください",
		);

		// PostService.createThread でスレッドを実DBに INSERT する
		const result = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title,
				firstPostBody: "統合テスト用の初期レスです",
			},
			this.currentEdgeToken,
			this.currentIpHash,
		);

		assert(
			result.success && result.thread,
			`統合テスト用スレッドの作成に失敗しました: ${result.error ?? "不明なエラー"}`,
		);

		this.currentThreadId = result.thread!.id;
		this.currentThreadTitle = title;
	},
);

// ---------------------------------------------------------------------------
// Then: 統合テスト用にスレッドのレスが実DBに保存されている
//
// 既存の「1件目のレスとして本文...が書き込まれる」（thread.steps.ts）との違い:
//   - InMemoryPostRepo.findByThreadId の代わりに PostService.getPostList を使う
//   - 実DBの posts テーブルからレスを取得して検証する
//
// See: features/integration/crud.feature @統合テスト：スレッドと最初のレスが実DBに保存される
// ---------------------------------------------------------------------------

/**
 * 統合テスト用にスレッドのレスが実DBに保存されている。
 *
 * PostService.getPostList で実DBからレスを取得し、1件以上存在することを確認する。
 * スレッド作成時に最初のレスが正しく INSERT されたことを検証する。
 */
Then(
	"統合テスト用にスレッドのレスが実DBに保存されている",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentThreadId, "スレッドが設定されていません");

		// 実DBからレスを取得して検証する
		// PostService.getPostList は PostRepository.findByThreadId を使うため実DBを参照する
		const posts = await PostService.getPostList(this.currentThreadId);

		assert(
			posts.length > 0,
			`スレッドにレスが1件も保存されていません (threadId: ${this.currentThreadId})`,
		);

		const firstPost = posts[0];
		assert(
			firstPost.postNumber === 1,
			`最初のレスの番号が 1 であることを期待しましたが ${firstPost.postNumber} でした`,
		);
		assert(firstPost.body, "最初のレスの本文が空です");
		assert(firstPost.dailyId, "最初のレスに日次リセットIDが設定されていません");
		assert(firstPost.displayName, "最初のレスに表示名が設定されていません");
		assert(firstPost.createdAt, "最初のレスに書き込み日時が設定されていません");
	},
);

// ---------------------------------------------------------------------------
// Then: 統合テスト用にレスが実DBに保存されている
//
// 既存の「レスがスレッドに追加される」（posting.steps.ts）との違い:
//   - InMemoryPostRepo.findByThreadId の代わりに PostService.getPostList を使う
//   - 実DBの posts テーブルからレスを取得して検証する
//
// See: features/integration/crud.feature @統合テスト：既存スレッドへのレス書き込みが実DBに保存される
// ---------------------------------------------------------------------------

/**
 * 統合テスト用にレスが実DBに保存されている。
 *
 * PostService.getPostList で実DBからレスを取得し、最新レスが存在することを確認する。
 * スレッドへのレス書き込みが正しく INSERT されたことを検証する。
 */
Then(
	"統合テスト用にレスが実DBに保存されている",
	async function (this: BattleBoardWorld) {
		const PostService = getPostService();

		assert(this.currentThreadId, "スレッドが設定されていません");

		// 実DBからレスを取得して検証する
		const posts = await PostService.getPostList(this.currentThreadId);

		// スレッド作成時の初期レス（1件）に加えて、新しいレスが追加されているはず
		assert(
			posts.length >= 2,
			`スレッドに追加レスが存在しません (threadId: ${this.currentThreadId}, posts.length: ${posts.length})`,
		);

		// 最新レスを確認する
		const latestPost = posts[posts.length - 1];
		assert(latestPost.body, "最新レスの本文が空です");
		assert(latestPost.dailyId, "最新レスに日次リセットIDが設定されていません");
		assert(latestPost.displayName, "最新レスに表示名が設定されていません");
		assert(latestPost.createdAt, "最新レスに書き込み日時が設定されていません");
	},
);
