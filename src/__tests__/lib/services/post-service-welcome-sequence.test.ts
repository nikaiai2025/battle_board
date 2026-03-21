/**
 * 単体テスト: PostService.createPost — Step 6.5 ウェルカムシーケンス
 *
 * See: features/welcome.feature @仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する
 * See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
 * See: features/welcome.feature @初回書き込みの直後にウェルカムメッセージが独立システムレスで表示される
 * See: features/welcome.feature @2回目以降の書き込みではウェルカムシーケンスは発動しない
 * See: tmp/workers/bdd-architect_TASK-236/design.md §2.1 初回書き込み検出ロジック
 *
 * テスト方針:
 *   - PostRepository, CurrencyService, PendingTutorialRepository は全てモック化する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - 初回書き込み時にボーナス +50 が付与され、ウェルカムメッセージが投稿される
 *   - 初回書き込み時に pending_tutorials に INSERT される
 *   - 2回目以降はウェルカムシーケンスがスキップされる
 *   - isSystemMessage=true の場合はウェルカムシーケンスがスキップされる（無限ループ防止）
 *   - isBotWrite=true の場合はウェルカムシーケンスがスキップされる
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../../../lib/domain/models/post";
import type { Thread } from "../../../lib/domain/models/thread";

// ---------------------------------------------------------------------------
// モック宣言（vi.mock は巻き上げられるため import より前に記述する）
// ---------------------------------------------------------------------------

// Supabase クライアントをモック化（PostService が間接的に使用する外部依存）
vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: { from: vi.fn() },
}));

// AuthService をモック化
vi.mock("../../../lib/services/auth-service", () => ({
	isIpBanned: vi.fn().mockResolvedValue(false),
	isUserBanned: vi.fn().mockResolvedValue(false),
	verifyEdgeToken: vi.fn().mockResolvedValue({
		valid: true,
		userId: "user-001",
		authorIdSeed: "seed-001",
	}),
	issueEdgeToken: vi.fn(),
	issueAuthCode: vi.fn(),
}));

// UserRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn().mockResolvedValue({
		id: "user-001",
		isPremium: false,
		username: null,
	}),
	updateLastIpHash: vi.fn().mockResolvedValue(undefined),
}));

// ThreadRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	incrementPostCount: vi.fn().mockResolvedValue(undefined),
	updateLastPostAt: vi.fn().mockResolvedValue(undefined),
	countActiveThreads: vi.fn().mockResolvedValue(1),
	demoteOldestActiveThread: vi.fn().mockResolvedValue(undefined),
	wakeThread: vi.fn().mockResolvedValue(undefined),
}));

// PostRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/post-repository", () => ({
	findByThreadId: vi.fn().mockResolvedValue([]),
	getNextPostNumber: vi.fn().mockResolvedValue(1),
	create: vi.fn(),
	countByAuthorId: vi.fn(),
}));

// BotPostRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: vi.fn().mockResolvedValue([]),
}));

// BotRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: vi.fn().mockResolvedValue([]),
}));

// CurrencyService をモック化
vi.mock("../../../lib/services/currency-service", () => ({
	credit: vi.fn().mockResolvedValue(undefined),
}));

// PendingTutorialRepository をモック化
vi.mock(
	"../../../lib/infrastructure/repositories/pending-tutorial-repository",
	() => ({
		create: vi.fn().mockResolvedValue(undefined),
	}),
);

// CommandService の lazy 初期化を抑制（テスト対象外）
vi.mock("../../../lib/services/command-service", () => ({
	CommandService: vi.fn().mockImplementation(() => ({
		executeCommand: vi.fn().mockResolvedValue(null),
	})),
}));

// IncentiveService をモック化（テスト対象外）
vi.mock("../../../lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn().mockResolvedValue({ granted: [] }),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import * as PendingTutorialRepository from "../../../lib/infrastructure/repositories/pending-tutorial-repository";
import * as PostRepository from "../../../lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "../../../lib/infrastructure/repositories/thread-repository";
import * as CurrencyService from "../../../lib/services/currency-service";
import {
	createPost,
	setCommandService,
} from "../../../lib/services/post-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用のスレッドを生成する */
function createMockThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "thread-001",
		boardId: "battleboard",
		title: "テストスレッド",
		threadKey: "1700000000",
		postCount: 0,
		datByteSize: 0,
		createdBy: "user-001",
		lastPostAt: new Date("2026-03-21T12:00:00Z"),
		createdAt: new Date("2026-03-21T12:00:00Z"),
		isDeleted: false,
		isPinned: false,
		isDormant: false,
		...overrides,
	};
}

/** テスト用の作成済みレスを生成する */
function createMockCreatedPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-uuid-001",
		threadId: "thread-001",
		postNumber: 1,
		authorId: "user-001",
		displayName: "名無しさん",
		dailyId: "ABCDE",
		body: "はじめまして",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-21T12:00:00Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("PostService.createPost — Step 6.5 ウェルカムシーケンス", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// CommandService を null に設定してコマンド機能を無効化する
		setCommandService(null);

		// デフォルト設定: 通常のスレッドへの書き込み
		vi.mocked(ThreadRepository.findById).mockResolvedValue(createMockThread());
		vi.mocked(PostRepository.create).mockResolvedValue(createMockCreatedPost());
		vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
		vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);
	});

	// =========================================================================
	// 初回書き込み時
	// =========================================================================

	describe("初回書き込み時（postCount === 0）", () => {
		beforeEach(() => {
			// postCount === 0: 初回書き込み
			vi.mocked(PostRepository.countByAuthorId).mockResolvedValue(0);
		});

		/**
		 * 初回書き込み時にボーナス +50 が付与される
		 * See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
		 */
		it("初回書き込み時に CurrencyService.credit(userId, 50, welcome_bonus) が呼ばれる", async () => {
			await createPost({
				threadId: "thread-001",
				body: "はじめまして",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(CurrencyService.credit).toHaveBeenCalledOnce();
			expect(CurrencyService.credit).toHaveBeenCalledWith(
				"user-001",
				50,
				"welcome_bonus",
			);
		});

		/**
		 * 初回書き込み時にウェルカムメッセージが投稿される（PostRepository.create が2回呼ばれる）
		 * See: features/welcome.feature @初回書き込みの直後にウェルカムメッセージが独立システムレスで表示される
		 */
		it("初回書き込み時に PostRepository.create が2回呼ばれる（元レス + ウェルカムメッセージ）", async () => {
			// ウェルカムメッセージ（2回目の createPost）用の返り値
			vi.mocked(PostRepository.create)
				.mockResolvedValueOnce(createMockCreatedPost()) // 元レス
				.mockResolvedValueOnce(
					createMockCreatedPost({ postNumber: 2, body: ">>1 Welcome..." }),
				); // ウェルカムメッセージ

			await createPost({
				threadId: "thread-001",
				body: "はじめまして",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(PostRepository.create).toHaveBeenCalledTimes(2);

			// 2回目の呼び出し（ウェルカムメッセージ）の body を確認
			const secondCall = vi.mocked(PostRepository.create).mock.calls[1];
			expect(secondCall[0].body).toContain("Welcome to Underground");
			expect(secondCall[0].body).toContain(">>1"); // postNumber=1 へのアンカー
			expect(secondCall[0].isSystemMessage).toBe(true);
		});

		/**
		 * 初回書き込み時に pending_tutorials に INSERT される
		 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
		 */
		it("初回書き込み時に PendingTutorialRepository.create が呼ばれる", async () => {
			await createPost({
				threadId: "thread-001",
				body: "はじめまして",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(PendingTutorialRepository.create).toHaveBeenCalledOnce();
			expect(PendingTutorialRepository.create).toHaveBeenCalledWith({
				userId: "user-001",
				threadId: "thread-001",
				triggerPostNumber: 1,
			});
		});

		/**
		 * 初回書き込み時に書き込み自体は成功する
		 */
		it("初回書き込み時も書き込みが成功する（success=true）", async () => {
			const result = await createPost({
				threadId: "thread-001",
				body: "はじめまして",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(result).toMatchObject({ success: true });
		});
	});

	// =========================================================================
	// 2回目以降の書き込み時
	// =========================================================================

	describe("2回目以降の書き込み時（postCount > 0）", () => {
		beforeEach(() => {
			// postCount > 0: 2回目以降
			vi.mocked(PostRepository.countByAuthorId).mockResolvedValue(3);
		});

		/**
		 * 2回目以降はウェルカムシーケンスがスキップされる
		 * See: features/welcome.feature @2回目以降の書き込みではウェルカムシーケンスは発動しない
		 */
		it("2回目以降は CurrencyService.credit が呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: "2回目の書き込み",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(CurrencyService.credit).not.toHaveBeenCalled();
		});

		it("2回目以降は PendingTutorialRepository.create が呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: "2回目の書き込み",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(PendingTutorialRepository.create).not.toHaveBeenCalled();
		});

		it("2回目以降は PostRepository.create が1回のみ呼ばれる（元レスのみ）", async () => {
			await createPost({
				threadId: "thread-001",
				body: "2回目の書き込み",
				edgeToken: "valid-token",
				ipHash: "hash-001",
				isBotWrite: false,
			});

			expect(PostRepository.create).toHaveBeenCalledTimes(1);
		});
	});

	// =========================================================================
	// isSystemMessage=true の場合（無限ループ防止）
	// =========================================================================

	describe("isSystemMessage=true の場合", () => {
		/**
		 * isSystemMessage=true の場合は Step 6.5 の条件（!isSystemMessage）を満たさないため
		 * ウェルカムシーケンスは発動しない（無限ループ防止）
		 * See: tmp/workers/bdd-architect_TASK-236/design.md §2.1 無限ループ防止
		 */
		it("isSystemMessage=true の場合は countByAuthorId が呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: ">>1 Welcome to Underground...",
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});

			expect(PostRepository.countByAuthorId).not.toHaveBeenCalled();
		});

		it("isSystemMessage=true の場合は CurrencyService.credit が呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: ">>1 Welcome to Underground...",
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});

			expect(CurrencyService.credit).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// isBotWrite=true の場合
	// =========================================================================

	describe("isBotWrite=true の場合（通常のBOT書き込み）", () => {
		/**
		 * isBotWrite=true の場合は Step 6.5 の条件（!isBotWrite）を満たさないため
		 * ウェルカムシーケンスは発動しない
		 */
		it("isBotWrite=true の場合は countByAuthorId が呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: "BOTの書き込みです",
				edgeToken: null,
				ipHash: "bot-ip",
				isBotWrite: true,
			});

			expect(PostRepository.countByAuthorId).not.toHaveBeenCalled();
		});

		it("isBotWrite=true の場合は CurrencyService.credit が呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: "BOTの書き込みです",
				edgeToken: null,
				ipHash: "bot-ip",
				isBotWrite: true,
			});

			expect(CurrencyService.credit).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// PostInput.botUserId — BOT書き込み時の resolvedAuthorId 設定
	// =========================================================================

	describe("PostInput.botUserId — BOT書き込み時のコマンド実行用ユーザーID", () => {
		// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
		// See: tmp/workers/bdd-architect_TASK-236/design.md §3.5 PostInput.botUserId 方式

		it("isBotWrite=true かつ botUserId が指定された場合、書き込みが成功する", async () => {
			vi.mocked(PostRepository.create).mockResolvedValue({
				id: "post-bot-001",
				threadId: "thread-001",
				postNumber: 2,
				authorId: "bot-id-001",
				displayName: "名無しさん",
				dailyId: "BOT001",
				body: ">>1 !w  新参おるやん🤣",
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(),
			});

			const result = await createPost({
				threadId: "thread-001",
				body: ">>1 !w  新参おるやん🤣",
				edgeToken: null,
				ipHash: "bot-bot-id-001",
				isBotWrite: true,
				botUserId: "bot-id-001",
			});

			expect(result).toMatchObject({ success: true, postId: "post-bot-001" });
		});

		it("isBotWrite=true かつ botUserId が指定されない場合も書き込みが成功する（後方互換）", async () => {
			vi.mocked(PostRepository.create).mockResolvedValue({
				id: "post-bot-002",
				threadId: "thread-001",
				postNumber: 3,
				authorId: null,
				displayName: "名無しさん",
				dailyId: "BOT002",
				body: "なんJほんま覇権やな",
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(),
			});

			const result = await createPost({
				threadId: "thread-001",
				body: "なんJほんま覇権やな",
				edgeToken: null,
				ipHash: "bot-bot-id-002",
				isBotWrite: true,
				// botUserId は未指定（通常のBOT書き込み）
			});

			expect(result).toMatchObject({ success: true, postId: "post-bot-002" });
		});
	});
});
