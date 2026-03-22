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
	getNextPostNumber: vi.fn(),
	create: vi.fn(),
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
	evaluateOnPost: vi.fn().mockResolvedValue({ granted: [] }),
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
import * as AuthService from "../../../lib/services/auth-service";
import {
	createPost,
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
		boardId: "battleboard",
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
		// レス番号採番
		vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
		// レス作成（authorId=nullで返す）
		vi.mocked(PostRepository.create).mockResolvedValue(createTestCreatedPost());
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

		expect(PostRepository.create).toHaveBeenCalledWith(
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

		expect(PostRepository.create).toHaveBeenCalledWith(
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
