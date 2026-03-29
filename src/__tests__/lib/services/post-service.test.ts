/**
 * 単体テスト: PostService
 *
 * テスト対象:
 *   - createPost: BOT書き込み時のFK制約違反バグ修正
 *   - getPostListWithBotMark: BOTマーク付きレス一覧取得
 *
 * See: features/bot_system.feature @撃破済みボットのレスはWebブラウザで目立たない表示になる
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/reports/2026-03-22_cf_error_investigation.md §問題1
 *
 * テスト方針:
 *   - PostRepository, BotPostRepository, BotRepository は全てモック化する
 *   - 外部依存（Supabase）はモック化する（アンチパターン: 外部依存の未モック化回避）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象 (createPost):
 *   - BOT書き込み時にposts.author_idがNULLでINSERTされる（FK制約違反バグ修正）
 *   - BOT書き込み時にコマンドパイプラインのuserIdにbotUserIdが渡される
 *
 * カバレッジ対象 (getPostListWithBotMark):
 *   - 撃破済みBOT(is_active=false)のpostにbotMarkが含まれる
 *   - 活動中BOT(is_active=true)のpostにbotMarkが含まれない（セキュリティテスト）
 *   - 人間のpostにbotMarkがnull
 *   - bot_postsにレコードがないpost（人間の書き込み）はbotMark=null
 *   - postsが空の場合は空配列を返す
 *   - bot_postsが空の場合（全レスが人間の書き込み）はbotMark=nullで返す
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "../../../lib/domain/models/bot";
import type { Post } from "../../../lib/domain/models/post";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

// Supabase クライアントをモック化（PostService が間接的に使用する外部依存）
vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(),
	},
}));

// PostRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/post-repository", () => ({
	findByThreadId: vi.fn(),
	createWithAtomicNumber: vi.fn(),
	countByAuthorId: vi.fn().mockResolvedValue(1), // デフォルト: 初回書き込みではない
}));

// BotPostRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: vi.fn(),
}));

// BotRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: vi.fn(),
}));

// CommandService の lazy 初期化を抑制（テスト対象外）
vi.mock("../../../lib/services/command-service", () => ({
	CommandService: vi.fn().mockImplementation(() => ({
		executeCommand: vi.fn().mockResolvedValue(null),
	})),
}));

// createPost のテストに必要な追加モック
vi.mock("../../../lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	create: vi.fn(),
	incrementPostCount: vi.fn().mockResolvedValue(undefined),
	updateLastPostAt: vi.fn().mockResolvedValue(undefined),
	countActiveThreads: vi.fn().mockResolvedValue(0),
	wakeThread: vi.fn().mockResolvedValue(undefined),
	demoteOldestActiveThread: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	updateLastIpHash: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/services/auth-service", () => ({
	verifyEdgeToken: vi.fn(),
	issueEdgeToken: vi.fn(),
	issueAuthCode: vi.fn(),
	isIpBanned: vi.fn().mockResolvedValue(false),
	isUserBanned: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../../lib/services/currency-service", () => ({
	credit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn().mockResolvedValue({ granted: [], skipped: [] }),
}));

vi.mock(
	"../../../lib/infrastructure/repositories/pending-tutorial-repository",
	() => ({
		create: vi.fn().mockResolvedValue(undefined),
	}),
);

// テスト時は CommandService を null に設定することで依存を排除する
import { setCommandService } from "../../../lib/services/post-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用の人間のレスを生成する */
function createHumanPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-001",
		threadId: "thread-001",
		postNumber: 1,
		authorId: "user-001",
		displayName: "名無しさん",
		dailyId: "ABCDE",
		body: "通常のレスです",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-21T12:00:00Z"),
		...overrides,
	};
}

/** テスト用のBOTレスを生成する */
function createBotPost(postId: string, postNumber: number): Post {
	return {
		id: postId,
		threadId: "thread-001",
		postNumber,
		authorId: null,
		displayName: "名無しさん",
		dailyId: "ZZZZZ",
		body: "なんJほんま覇権やな",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-21T12:30:00Z"),
	};
}

/** テスト用の撃破済みBOT（is_active=false）を生成する */
function createEliminatedBot(botId: string): Bot {
	return {
		id: botId,
		name: "荒らし役",
		persona: "テスト用ペルソナ",
		hp: 0,
		maxHp: 10,
		dailyId: "ZZZZZ",
		dailyIdDate: "2026-03-21",
		isActive: false, // 撃破済み
		isRevealed: false,
		revealedAt: null,
		survivalDays: 5,
		totalPosts: 42,
		accusedCount: 3,
		timesAttacked: 1,
		grassCount: 0,
		botProfileKey: "荒らし役",
		nextPostAt: null,
		eliminatedAt: new Date("2026-03-21T10:00:00Z"),
		eliminatedBy: "user-001",
		createdAt: new Date("2026-03-16T00:00:00Z"),
	};
}

/** テスト用の活動中BOT（is_active=true）を生成する */
function createActiveBot(botId: string): Bot {
	return {
		id: botId,
		name: "荒らし役",
		persona: "テスト用ペルソナ",
		hp: 10,
		maxHp: 10,
		dailyId: "XXXXX",
		dailyIdDate: "2026-03-21",
		isActive: true, // 活動中（潜伏中 or 暴露済み）
		isRevealed: false,
		revealedAt: null,
		survivalDays: 2,
		totalPosts: 15,
		accusedCount: 0,
		timesAttacked: 0,
		grassCount: 0,
		botProfileKey: "荒らし役",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-19T00:00:00Z"),
	};
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

import type { Thread } from "../../../lib/domain/models/thread";
import * as BotPostRepository from "../../../lib/infrastructure/repositories/bot-post-repository";
import * as BotRepository from "../../../lib/infrastructure/repositories/bot-repository";
import * as PostRepository from "../../../lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "../../../lib/infrastructure/repositories/thread-repository";
import * as UserRepository from "../../../lib/infrastructure/repositories/user-repository";
import * as AuthService from "../../../lib/services/auth-service";
import * as IncentiveService from "../../../lib/services/incentive-service";
import {
	createPost,
	createThread,
	getPostListWithBotMark,
} from "../../../lib/services/post-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー（createPost テスト用）
// ---------------------------------------------------------------------------

/** テスト用スレッドを生成する */
function createTestThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "thread-001",
		threadKey: "1700000000",
		boardId: "livebot",
		title: "テストスレッド",
		postCount: 0,
		datByteSize: 0,
		createdBy: "user-001",
		createdAt: new Date("2026-03-22T00:00:00Z"),
		lastPostAt: new Date("2026-03-22T00:00:00Z"),
		isDeleted: false,
		isPinned: false,
		isDormant: false,
		...overrides,
	};
}

/** テスト用の作成済みPostを生成する（PostRepository.create の返り値）*/
function createTestCreatedPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-new-001",
		threadId: "thread-001",
		postNumber: 1,
		authorId: null, // BOT書き込みは null
		displayName: "名無しさん",
		dailyId: "ABCDE",
		body: "テスト投稿です",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-22T12:00:00Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// createPost のテスト
// ---------------------------------------------------------------------------

/**
 * BOT書き込み時のFK制約違反バグ修正のテスト
 * See: tmp/reports/2026-03-22_cf_error_investigation.md §問題1
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 */
describe("PostService.createPost — BOT書き込み", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setCommandService(null);

		// スレッドは通常スレッド（固定でない）
		vi.mocked(ThreadRepository.findById).mockResolvedValue(createTestThread());
		// レス番号の原子採番 + INSERT（authorId=nullで返す）
		vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
			createTestCreatedPost(),
		);
		// スレッドのアクティブ件数
		vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(1);
	});

	/**
	 * 修正対象のバグ: BOT書き込み時に resolvedAuthorId が botUserId（botsテーブルのID）に
	 * なっていたことで posts_author_id_fkey FK制約違反が発生していた。
	 * 修正後: BOT書き込み時は posts.author_id = NULL でINSERTされる。
	 *
	 * See: tmp/reports/2026-03-22_cf_error_investigation.md §問題1 根本原因
	 */
	it("BOT書き込み時にPostRepository.createのauthorIdがnullで呼ばれる（FK制約違反バグ修正）", async () => {
		const botId = "bot-uuid-1234-5678";

		await createPost({
			threadId: "thread-001",
			body: "こんにちは！なんJ！",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: botId,
		});

		expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledWith(
			expect.objectContaining({
				authorId: null, // botsテーブルのIDではなくNULL
			}),
		);
	});

	/**
	 * BOT書き込み時でもbotUserIdがコマンドパイプラインのuserIdに渡される。
	 * コマンドサービスが注入されていれば botUserId が userId として使われる。
	 *
	 * See: tmp/reports/2026-03-22_cf_error_investigation.md §修正方針 案A
	 */
	it("BOT書き込み時にbotUserIdがコマンドパイプラインのuserIdとして使われる", async () => {
		const botId = "bot-uuid-1234-5678";
		const mockExecuteCommand = vi.fn().mockResolvedValue(null);
		// CommandService を注入してコマンドパイプラインを有効化する
		setCommandService({
			executeCommand: mockExecuteCommand,
		} as any);

		await createPost({
			threadId: "thread-001",
			body: "こんにちは！なんJ！",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: botId,
		});

		expect(mockExecuteCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: botId, // botsテーブルのIDがコマンドパイプラインに渡される
			}),
		);
	});

	/**
	 * botUserIdが未指定の場合（古いコード互換）、authorIdはnullのまま。
	 */
	it("botUserIdが未指定でもauthorIdがnullでINSERTされる", async () => {
		await createPost({
			threadId: "thread-001",
			body: "システムからの書き込み",
			edgeToken: null,
			ipHash: "system-ip-hash",
			isBotWrite: true,
			// botUserId 未指定
		});

		expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledWith(
			expect.objectContaining({
				authorId: null,
			}),
		);
	});
});

describe("PostService.getPostListWithBotMark", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// CommandService を null に設定してコマンド機能を無効化する（テスト対象外）
		setCommandService(null);
	});

	describe("通常ケース", () => {
		/**
		 * 撃破済みBOT(is_active=false)のpostにbotMarkが含まれる
		 * See: tmp/workers/bdd-architect_TASK-219/design.md §5.1
		 */
		it("撃破済みBOT(is_active=false)の書き込みにbotMarkが付与される", async () => {
			const humanPost = createHumanPost({ id: "post-001", postNumber: 1 });
			const botPost = createBotPost("post-002", 2);
			const eliminatedBot = createEliminatedBot("bot-001");

			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
				humanPost,
				botPost,
			]);
			vi.mocked(BotPostRepository.findByPostIds).mockResolvedValue([
				{ postId: "post-002", botId: "bot-001" },
			]);
			vi.mocked(BotRepository.findByIds).mockResolvedValue([eliminatedBot]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(2);
			// 人間のレスはbotMark=null
			expect(result[0].botMark).toBeNull();
			// 撃破済みBOTのレスにはbotMarkが付与される
			expect(result[1].botMark).toEqual({ hp: 0, maxHp: 10 });
		});

		/**
		 * 人間のpostにbotMarkがnull
		 * See: tmp/workers/bdd-architect_TASK-219/design.md §5.1
		 */
		it("人間の書き込みにはbotMarkがnullである", async () => {
			const humanPost1 = createHumanPost({ id: "post-001", postNumber: 1 });
			const humanPost2 = createHumanPost({ id: "post-003", postNumber: 3 });

			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
				humanPost1,
				humanPost2,
			]);
			vi.mocked(BotPostRepository.findByPostIds).mockResolvedValue([]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(2);
			expect(result[0].botMark).toBeNull();
			expect(result[1].botMark).toBeNull();
		});

		/**
		 * bot_postsにレコードがないpost（人間の書き込み）はbotMark=null
		 */
		it("bot_postsにレコードがない書き込みはbotMark=nullを返す", async () => {
			const humanPost = createHumanPost({ id: "post-001", postNumber: 1 });

			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([humanPost]);
			vi.mocked(BotPostRepository.findByPostIds).mockResolvedValue([]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(1);
			expect(result[0].botMark).toBeNull();
		});
	});

	describe("セキュリティテスト", () => {
		/**
		 * 活動中BOT(is_active=true)のpostにbotMarkが含まれない
		 * これはゲームの根幹「AIか人間か分からない」を保護するための必須制約。
		 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.5 セキュリティ
		 */
		it("活動中BOT(is_active=true)の書き込みにはbotMarkが付与されない（セキュリティ制約）", async () => {
			const botPost = createBotPost("post-002", 2);
			const activeBot = createActiveBot("bot-002"); // is_active=true

			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([botPost]);
			vi.mocked(BotPostRepository.findByPostIds).mockResolvedValue([
				{ postId: "post-002", botId: "bot-002" },
			]);
			vi.mocked(BotRepository.findByIds).mockResolvedValue([activeBot]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(1);
			// 活動中BOTの書き込みにはbotMarkを付与してはならない
			expect(result[0].botMark).toBeNull();
		});

		/**
		 * 暴露済み(is_revealed=true)かつ活動中(is_active=true)のBOTにはbotMarkを付与しない
		 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.5 セキュリティ
		 */
		it("暴露済み(is_revealed=true)かつ活動中のBOTにはbotMarkが付与されない", async () => {
			const botPost = createBotPost("post-002", 2);
			const revealedActiveBot: Bot = {
				...createActiveBot("bot-003"),
				isActive: true, // 活動中
				isRevealed: true, // 暴露済み（BOTマーク付き）
			};

			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([botPost]);
			vi.mocked(BotPostRepository.findByPostIds).mockResolvedValue([
				{ postId: "post-002", botId: "bot-003" },
			]);
			vi.mocked(BotRepository.findByIds).mockResolvedValue([revealedActiveBot]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(1);
			// 暴露済み（BOTマーク付き）であってもis_active=trueならbotMarkを返さない
			expect(result[0].botMark).toBeNull();
		});
	});

	describe("エッジケース", () => {
		/**
		 * postsが空の場合は空配列を返す（空配列入力）
		 */
		it("postsが空の場合は空配列を返す", async () => {
			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(0);
			// BotPostRepository は呼ばれない
			expect(BotPostRepository.findByPostIds).not.toHaveBeenCalled();
		});

		/**
		 * 複数の撃破済みBOTが混在する場合
		 */
		it("複数の撃破済みBOTが混在するスレッドで各々のbotMarkが正しく付与される", async () => {
			const humanPost = createHumanPost({ id: "post-001", postNumber: 1 });
			const botPost1 = createBotPost("post-002", 2);
			const botPost2 = createBotPost("post-004", 4);
			const bot1 = createEliminatedBot("bot-001");
			const bot2: Bot = {
				...createEliminatedBot("bot-002"),
				hp: 3,
				maxHp: 20,
			};

			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
				humanPost,
				botPost1,
				botPost2,
			]);
			vi.mocked(BotPostRepository.findByPostIds).mockResolvedValue([
				{ postId: "post-002", botId: "bot-001" },
				{ postId: "post-004", botId: "bot-002" },
			]);
			vi.mocked(BotRepository.findByIds).mockResolvedValue([bot1, bot2]);

			const result = await getPostListWithBotMark("thread-001");

			expect(result).toHaveLength(3);
			expect(result[0].botMark).toBeNull(); // 人間
			expect(result[1].botMark).toEqual({ hp: 0, maxHp: 10 }); // bot1
			expect(result[2].botMark).toEqual({ hp: 3, maxHp: 20 }); // bot2
		});

		/**
		 * PostListOptions が正しく PostRepository.findByThreadId に渡される
		 */
		it("PostListOptionsが正しくPostRepository.findByThreadIdに渡される", async () => {
			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

			await getPostListWithBotMark("thread-001", { latestCount: 50 });

			expect(PostRepository.findByThreadId).toHaveBeenCalledWith("thread-001", {
				latestCount: 50,
			});
		});
	});
});

// ---------------------------------------------------------------------------
// S4: createPost 内の重複クエリ排除テスト
// See: tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md §4.2, §5.1 S4
// ---------------------------------------------------------------------------

describe("PostService.createPost — S4 重複クエリ排除", () => {
	/** 認証済み人間ユーザーの書き込みを準備するヘルパー */
	function setupAuthenticatedHumanWrite() {
		vi.clearAllMocks();
		setCommandService(null);

		vi.mocked(ThreadRepository.findById).mockResolvedValue(createTestThread());
		vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
			valid: true,
			userId: "user-001",
			authorIdSeed: "seed-abc",
		} as any);
		vi.mocked(AuthService.isIpBanned).mockResolvedValue(false);
		vi.mocked(UserRepository.findById).mockResolvedValue({
			id: "user-001",
			username: null,
			isPremium: false,
			isBanned: false,
			streakDays: 0,
			lastPostDate: null,
			lastIpHash: null,
			isVerified: true,
			createdAt: new Date("2026-03-20T00:00:00Z"),
		} as any);
		vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
			createTestCreatedPost({ authorId: "user-001", postNumber: 1 }),
		);
		vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);
		vi.mocked(PostRepository.countByAuthorId).mockResolvedValue(1);
		vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(undefined);
		vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(undefined);
		vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(1);
		vi.mocked(IncentiveService.evaluateOnPost).mockResolvedValue({
			granted: [],
			skipped: [],
		});
	}

	beforeEach(() => {
		setupAuthenticatedHumanWrite();
	});

	// -----------------------------------------------------------------------
	// S4-1: isUserBanned の重複排除（-1クエリ）
	// 現状: Step 2b で AuthService.isUserBanned → UserRepository.findById
	//       Step 3 で UserRepository.findById
	// 改善: Step 3 の findById 結果で banned 判定。AuthService.isUserBanned 不使用
	// -----------------------------------------------------------------------

	describe("S4-1: isUserBanned の重複排除", () => {
		it("認証済みユーザーの書き込みで AuthService.isUserBanned が呼ばれない（findById 結果で判定）", async () => {
			await createPost({
				threadId: "thread-001",
				body: "通常の書き込み",
				edgeToken: "token-abc",
				ipHash: "seed-abc",
				isBotWrite: false,
			});

			// S4-1: AuthService.isUserBanned は呼ばれないこと（重複クエリ排除）
			expect(AuthService.isUserBanned).not.toHaveBeenCalled();
			// 代わりに UserRepository.findById で取得した結果で banned 判定する
			expect(UserRepository.findById).toHaveBeenCalledWith("user-001");
		});

		it("isBanned=true のユーザーは Step 3 の findById 結果で書き込みが拒否される", async () => {
			vi.mocked(UserRepository.findById).mockResolvedValue({
				id: "user-001",
				username: null,
				isPremium: false,
				isBanned: true, // BAN されたユーザー
				streakDays: 0,
				lastPostDate: null,
				lastIpHash: null,
				isVerified: true,
				createdAt: new Date("2026-03-20T00:00:00Z"),
			} as any);

			const result = await createPost({
				threadId: "thread-001",
				body: "BANユーザーの書き込み",
				edgeToken: "token-abc",
				ipHash: "seed-abc",
				isBotWrite: false,
			});

			expect(result).toMatchObject({
				success: false,
				code: "USER_BANNED",
			});
			// AuthService.isUserBanned は呼ばれない
			expect(AuthService.isUserBanned).not.toHaveBeenCalled();
		});

		it("BOT書き込みでは UserRepository.findById も AuthService.isUserBanned も呼ばれない", async () => {
			await createPost({
				threadId: "thread-001",
				body: "BOTの書き込み",
				edgeToken: null,
				ipHash: "bot-ip",
				isBotWrite: true,
			});

			expect(AuthService.isUserBanned).not.toHaveBeenCalled();
			// BOT書き込みでは User 情報取得自体をスキップ
			expect(UserRepository.findById).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// S4-2: PostRepository.findByThreadId の重複排除（-1クエリ）
	// 現状: Step 7(sync) と Step 11(deferred) で2回呼ばれる
	// 改善: Step 7 の結果を保持し deferred phase に渡す
	// -----------------------------------------------------------------------

	describe("S4-2: findByThreadId の重複排除", () => {
		it("アンカー付き書き込みで PostRepository.findByThreadId が1回のみ呼ばれる（deferred でDB再取得しない）", async () => {
			const existingPost = createHumanPost({
				id: "post-existing",
				postNumber: 1,
				authorId: "user-002",
			});
			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
				existingPost,
			]);

			await createPost({
				threadId: "thread-001",
				body: ">>1 返信です",
				edgeToken: "token-abc",
				ipHash: "seed-abc",
				isBotWrite: false,
			});

			// findByThreadId はアンカー解析用の1回のみ（deferred phase での再取得なし）
			expect(PostRepository.findByThreadId).toHaveBeenCalledTimes(1);
		});

		it("deferred phase に pre-fetched threadPosts（新規レス追加済み）が渡される", async () => {
			const existingPost = createHumanPost({
				id: "post-existing",
				postNumber: 1,
				authorId: "user-002",
			});
			vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
				existingPost,
			]);
			const newPost = createTestCreatedPost({
				id: "post-new-001",
				postNumber: 2,
				authorId: "user-001",
			});
			vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
				newPost,
			);

			await createPost({
				threadId: "thread-001",
				body: ">>1 返信です",
				edgeToken: "token-abc",
				ipHash: "seed-abc",
				isBotWrite: false,
			});

			// deferred phase の options に cachedThreadPosts が渡されること
			expect(IncentiveService.evaluateOnPost).toHaveBeenCalledTimes(2);
			const deferredCall = vi.mocked(IncentiveService.evaluateOnPost).mock
				.calls[1];
			const deferredOptions = deferredCall[1];
			// cachedThreadPosts が存在し、既存レス + 新規レスの両方を含むこと
			expect(deferredOptions).toHaveProperty("cachedThreadPosts");
			const cachedPosts = (deferredOptions as any).cachedThreadPosts;
			expect(cachedPosts).toHaveLength(2);
			expect(cachedPosts.map((p: any) => p.id)).toContain("post-existing");
			expect(cachedPosts.map((p: any) => p.id)).toContain("post-new-001");
		});

		it("アンカーなし書き込みでは cachedThreadPosts が渡されない（findByThreadId 未呼出のため）", async () => {
			await createPost({
				threadId: "thread-001",
				body: "アンカーなしの書き込み",
				edgeToken: "token-abc",
				ipHash: "seed-abc",
				isBotWrite: false,
			});

			// アンカーなし → findByThreadId は呼ばれない
			expect(PostRepository.findByThreadId).not.toHaveBeenCalled();
			// deferred phase では cachedThreadPosts が undefined（DB から再取得される）
			expect(IncentiveService.evaluateOnPost).toHaveBeenCalledTimes(2);
			const deferredCall = vi.mocked(IncentiveService.evaluateOnPost).mock
				.calls[1];
			const deferredOptions = deferredCall[1];
			expect(deferredOptions).not.toHaveProperty("cachedThreadPosts");
		});
	});

	// -----------------------------------------------------------------------
	// S4-3: ThreadRepository.findById の重複排除 — 見送り
	// locked_files 外テスト (src/lib/services/__tests__/post-service.test.ts) が
	// deferred phase の第2引数を厳密一致で検証しており、cachedThread 追加で失敗するため見送り。
	// IncentiveService 側のインターフェース（cachedThread オプション）は準備済み。
	// See: tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md §5.1 S4
	// -----------------------------------------------------------------------

	describe("S4-3: ThreadRepository.findById（見送り）", () => {
		it("deferred phase に cachedThread は渡されない（S4-3 未適用）", async () => {
			await createPost({
				threadId: "thread-001",
				body: "通常の書き込み",
				edgeToken: "token-abc",
				ipHash: "seed-abc",
				isBotWrite: false,
			});

			// S4-3 未適用のため cachedThread は渡されない
			expect(IncentiveService.evaluateOnPost).toHaveBeenCalledTimes(2);
			const deferredCall = vi.mocked(IncentiveService.evaluateOnPost).mock
				.calls[1];
			const deferredOptions = deferredCall[1];
			expect(deferredOptions).not.toHaveProperty("cachedThread");
		});
	});
});

// ---------------------------------------------------------------------------
// createThread のテスト
// See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
// See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
// ---------------------------------------------------------------------------

describe("PostService.createThread — BOT書き込み（isBotWrite）", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setCommandService(null);

		// ThreadRepository.create のモック: スレッド作成成功を返す
		// BOT作成スレッドは createdBy=null（Sprint-149 修正A）
		vi.mocked(ThreadRepository.create).mockResolvedValue({
			id: "thread-new-001",
			threadKey: "1700000001",
			boardId: "livebot",
			title: "キュレーションBOTスレッド",
			postCount: 0,
			datByteSize: 0,
			createdBy: null,
			createdAt: new Date("2026-03-29T12:00:00Z"),
			lastPostAt: new Date("2026-03-29T12:00:00Z"),
			isDeleted: false,
			isPinned: false,
			isDormant: false,
		});

		// ThreadRepository.findById: createPost 内で使用される（固定スレッドガード）
		vi.mocked(ThreadRepository.findById).mockResolvedValue(
			createTestThread({ id: "thread-new-001" }),
		);

		// PostRepository.createWithAtomicNumber: createPost 内で使用される
		vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
			createTestCreatedPost({ threadId: "thread-new-001" }),
		);

		// スレッドのアクティブ件数
		vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(1);
	});

	/**
	 * BOT書き込み時（isBotWrite=true）は resolveAuth をスキップし、
	 * edgeToken=null でも認証エラーにならないことを検証する。
	 *
	 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
	 */
	it("isBotWrite=true の場合、edgeToken=null でもスレッド作成が成功する", async () => {
		const result = await createThread(
			{
				boardId: "livebot",
				title: "キュレーションBOTスレッド",
				firstPostBody: "まとめ記事の内容",
			},
			null, // edgeToken
			"bot-curation-001", // ipHash
			true, // isBotWrite
		);

		expect(result.success).toBe(true);
		expect(result.thread).toBeDefined();
		expect(result.firstPost).toBeDefined();
		// resolveAuth は isBotWrite=true なので認証スキップ。verifyEdgeToken は呼ばれない。
		expect(AuthService.verifyEdgeToken).not.toHaveBeenCalled();
	});

	/**
	 * isBotWrite=false（デフォルト）の場合、edgeToken=null は認証エラーになることを検証する。
	 * 後方互換性の確認。
	 */
	it("isBotWrite=false（デフォルト）の場合、edgeToken=null は認証エラーを返す", async () => {
		// resolveAuth が認証を要求するモック設定
		vi.mocked(AuthService.issueEdgeToken).mockResolvedValue({
			token: "new-edge-token",
			userId: "new-user-id",
		});
		vi.mocked(AuthService.issueAuthCode).mockResolvedValue({
			expiresAt: new Date("2026-12-31T00:00:00Z"),
		});

		const result = await createThread(
			{
				boardId: "livebot",
				title: "通常ユーザースレッド",
				firstPostBody: "通常の内容",
			},
			null, // edgeToken
			"user-ip-hash",
			// isBotWrite は省略（デフォルト false）
		);

		expect(result.success).toBe(false);
		expect(result.authRequired).toBeDefined();
		// 修正D: error フィールドに "認証が必要です" が含まれることを検証
		expect(result.error).toBe("認証が必要です");
	});

	/**
	 * BOT書き込み時（isBotWrite=true）は createdBy=null が ThreadRepository.create に渡されることを検証する。
	 * "system" 文字列ではなく null を渡すことで UUID 制約違反を回避する。
	 *
	 * See: supabase/migrations/00040_threads_created_by_nullable.sql
	 */
	it("isBotWrite=true の場合、ThreadRepository.create に createdBy=null が渡される", async () => {
		await createThread(
			{
				boardId: "livebot",
				title: "BOTスレッド createdBy検証",
				firstPostBody: "BOTの1レス目",
			},
			null,
			"bot-curation-002",
			true,
		);

		expect(ThreadRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				createdBy: null,
			}),
		);
	});

	/**
	 * BOT書き込み時の createPost 呼び出しでも isBotWrite=true が伝播することを検証する。
	 */
	it("isBotWrite=true の場合、内部の createPost にも isBotWrite=true が伝播する", async () => {
		await createThread(
			{
				boardId: "livebot",
				title: "BOTスレッド",
				firstPostBody: "BOTの1レス目",
			},
			null,
			"bot-123",
			true,
		);

		// createPost が内部で呼ばれた際の引数を検証する。
		// PostRepository.createWithAtomicNumber が呼ばれたことで createPost が実行されたことを確認。
		expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledWith(
			expect.objectContaining({
				authorId: null, // BOT書き込みは author_id = NULL
			}),
		);
	});
});
