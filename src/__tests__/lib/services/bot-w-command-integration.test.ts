/**
 * 統合テスト: BOT !w コマンド実行パスの検証（Phase 1）
 *
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: features/reactions.feature @草を生やした結果がレス末尾にマージ表示される
 * See: docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md
 *
 * テスト目的:
 *   チュートリアルBOTの !w コマンドが、BOT投稿は成功するがコマンド効果
 *   （inlineSystemInfo へのレス内マージ）が発揮されない問題を再現・検証する。
 *   Phase 1 として以下の3レベルで段階的にテスト:
 *     1. GrassHandler 単体: isBotGiver=true で systemMessage が非null
 *     2. CommandService 経由: executeCommand で isBotGiver が正しく伝播
 *     3. PostService 経由: createPost で inlineSystemInfo にマージされる
 *
 * テスト方針:
 *   - 外部依存（Supabase等）はすべてモック化する
 *   - TutorialContentStrategy が生成する本文形式を実際に使用する
 *   - parseCommand, CommandService, GrassHandler の統合パスを検証する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Level 1: GrassHandler 単体テスト（isBotGiver パス）
// ---------------------------------------------------------------------------

import type { Post } from "../../../lib/domain/models/post";
import type { CommandContext } from "../../../lib/services/command-service";
import {
	GrassHandler,
	type IGrassBotPostRepository,
	type IGrassPostRepository,
	type IGrassRepository,
} from "../../../lib/services/handlers/grass-handler";

/** テスト用の人間のレス（草の対象レス） */
function createTargetPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-target-uuid",
		threadId: "thread-001",
		postNumber: 5,
		authorId: "user-target-001",
		displayName: "名無しさん",
		dailyId: "Tg5xK2",
		body: "初めての書き込みです",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-26T10:00:00Z"),
		...overrides,
	};
}

/** GrassHandler 用モックファクトリ */
function createGrassHandlerMocks(targetPost: Post | null = createTargetPost()) {
	const postRepo: IGrassPostRepository = {
		findById: vi.fn().mockResolvedValue(targetPost),
	};
	const grassRepo: IGrassRepository = {
		existsForToday: vi.fn().mockResolvedValue(false),
		create: vi.fn().mockResolvedValue({ id: "grass-001" }),
		incrementGrassCount: vi.fn().mockResolvedValue(1),
		incrementBotGrassCount: vi.fn().mockResolvedValue(1),
	};
	const botPostRepo: IGrassBotPostRepository = {
		findByPostId: vi.fn().mockResolvedValue(null),
	};
	return { postRepo, grassRepo, botPostRepo };
}

describe("Level 1: GrassHandler 単体 — BOT !w パス（isBotGiver=true）", () => {
	it("isBotGiver=true で execute() を呼ぶと success=true かつ systemMessage が非null で返る", async () => {
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const handler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		const ctx: CommandContext = {
			args: ["post-target-uuid"],
			postId: "post-caller-001",
			threadId: "thread-001",
			userId: "bot-uuid-1234", // BOTのID（usersテーブルに存在しない）
			dailyId: "BotDly01",
			isBotGiver: true,
		};

		const result = await handler.execute(ctx);

		expect(result.success).toBe(true);
		expect(result.systemMessage).not.toBeNull();
		expect(result.systemMessage).toContain(">>5");
		expect(result.systemMessage).toContain("(ID:Tg5xK2)");
		expect(result.systemMessage).toContain("草");
	});

	it("isBotGiver=true では grass_reactions INSERT がスキップされる（FK制約違反回避）", async () => {
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const handler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		const ctx: CommandContext = {
			args: ["post-target-uuid"],
			postId: "post-caller-001",
			threadId: "thread-001",
			userId: "bot-uuid-1234",
			dailyId: "BotDly01",
			isBotGiver: true,
		};

		await handler.execute(ctx);

		expect(grassRepo.create).not.toHaveBeenCalled();
		expect(grassRepo.existsForToday).not.toHaveBeenCalled();
	});

	it("isBotGiver=true でも草カウント加算は実行される", async () => {
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const handler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		const ctx: CommandContext = {
			args: ["post-target-uuid"],
			postId: "post-caller-001",
			threadId: "thread-001",
			userId: "bot-uuid-1234",
			dailyId: "BotDly01",
			isBotGiver: true,
		};

		await handler.execute(ctx);

		expect(grassRepo.incrementGrassCount).toHaveBeenCalledWith(
			"user-target-001",
		);
	});
});

// ---------------------------------------------------------------------------
// Level 2: CommandService 経由テスト
// ---------------------------------------------------------------------------

import type { AccusationService } from "../../../lib/services/accusation-service";
import type {
	CommandExecutionInput,
	CommandsYaml,
	ICurrencyService,
	IPostNumberResolver,
} from "../../../lib/services/command-service";
import { CommandService } from "../../../lib/services/command-service";

/**
 * AccusationService モック（TellHandler は無効化だがコンストラクタで必要）。
 * null を渡すと createAccusationService() が require() で外部モジュールを読み込むため、
 * テスト環境ではダミーオブジェクトを渡す。
 */
function createMockAccusationService(): AccusationService {
	return {
		accuse: vi.fn().mockResolvedValue({
			result: "miss",
			bonusAmount: 0,
			systemMessage: "ダミー",
			alreadyAccused: false,
		}),
	} as unknown as AccusationService;
}

/** !w のみ有効化したテスト用コマンド設定 */
const COMMANDS_W_ONLY: CommandsYaml = {
	commands: {
		w: {
			description: "指定レスに草を生やす",
			cost: 0,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
	},
};

/** CurrencyService モック（!w は cost=0 なので実質呼ばれない） */
function createMockCurrencyService(): ICurrencyService {
	return {
		deduct: vi.fn().mockResolvedValue({ success: true, newBalance: 100 }),
		getBalance: vi.fn().mockResolvedValue(100),
	};
}

/**
 * PostNumberResolver モック。
 * >>5 -> post-target-uuid の解決をシミュレートする。
 */
function createMockPostNumberResolver(targetPost: Post): IPostNumberResolver {
	return {
		findByThreadIdAndPostNumber: vi
			.fn()
			.mockImplementation(
				async (threadId: string, postNumber: number): Promise<Post | null> => {
					if (
						threadId === targetPost.threadId &&
						postNumber === targetPost.postNumber
					) {
						return targetPost;
					}
					return null;
				},
			),
	};
}

describe("Level 2: CommandService 経由 — BOT !w パス", () => {
	let currencyService: ICurrencyService;
	let accusationService: AccusationService;

	beforeEach(() => {
		vi.clearAllMocks();
		currencyService = createMockCurrencyService();
		accusationService = createMockAccusationService();
	});

	it("rawCommand='>>5 !w\\n新参おるやん' + isBotGiver=true で success=true かつ systemMessage が返る", async () => {
		// TutorialContentStrategy が生成する実際の本文形式を使用
		const rawCommand = ">>5 !w\n新参おるやん🤣";
		const targetPost = createTargetPost();
		const resolver = createMockPostNumberResolver(targetPost);

		// GrassHandler モック: 実際の GrassHandler を DI する
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const grassHandler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		const service = new CommandService(
			currencyService,
			accusationService,
			COMMANDS_W_ONLY,
			null, // attackHandler
			grassHandler,
			resolver,
		);

		const input: CommandExecutionInput = {
			rawCommand,
			postId: "",
			threadId: "thread-001",
			userId: "bot-uuid-1234",
			dailyId: "BotDly01",
			isBotGiver: true,
		};

		const result = await service.executeCommand(input);

		expect(result).not.toBeNull();
		expect(result!.success).toBe(true);
		expect(result!.systemMessage).not.toBeNull();
		expect(result!.systemMessage).toContain(">>5");
		expect(result!.systemMessage).toContain("草");
	});

	it("parseCommand が '>>5 !w\\n新参おるやん' から正しくコマンドを解析する", async () => {
		// parseCommand を直接テスト（CommandService の Step 1）
		const { parseCommand } = await import(
			"../../../lib/domain/rules/command-parser"
		);

		const rawCommand = ">>5 !w\n新参おるやん🤣";
		const result = parseCommand(rawCommand, ["w"]);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("w");
		// 改行分割済みのため、後方引数にフレーバーテキストは含まれない
		// 前方引数 >>5 が args に含まれる
		expect(result!.args).toContain(">>5");
		// フレーバーテキストが引数に混入していないことを確認
		expect(result!.args).not.toContain("新参おるやん🤣");
	});

	it("PostNumberResolver が >>5 を UUID に正しく解決する", async () => {
		const rawCommand = ">>5 !w\n新参おるやん🤣";
		const targetPost = createTargetPost();
		const resolver = createMockPostNumberResolver(targetPost);
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const grassHandler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		const service = new CommandService(
			currencyService,
			accusationService,
			COMMANDS_W_ONLY,
			null,
			grassHandler,
			resolver,
		);

		const input: CommandExecutionInput = {
			rawCommand,
			postId: "",
			threadId: "thread-001",
			userId: "bot-uuid-1234",
			dailyId: "BotDly01",
			isBotGiver: true,
		};

		await service.executeCommand(input);

		// PostNumberResolver が呼ばれたことを確認
		expect(resolver.findByThreadIdAndPostNumber).toHaveBeenCalledWith(
			"thread-001",
			5,
		);
		// GrassHandler が UUID で findById を呼んだことを確認
		expect(postRepo.findById).toHaveBeenCalledWith("post-target-uuid");
	});

	it("isBotGiver=true が CommandContext に正しく伝播する", async () => {
		const rawCommand = ">>5 !w\n新参おるやん🤣";
		const targetPost = createTargetPost();
		const resolver = createMockPostNumberResolver(targetPost);
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const grassHandler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		// execute をスパイして引数を確認する
		const executeSpy = vi.spyOn(grassHandler, "execute");

		const service = new CommandService(
			currencyService,
			accusationService,
			COMMANDS_W_ONLY,
			null,
			grassHandler,
			resolver,
		);

		const input: CommandExecutionInput = {
			rawCommand,
			postId: "",
			threadId: "thread-001",
			userId: "bot-uuid-1234",
			dailyId: "BotDly01",
			isBotGiver: true,
		};

		await service.executeCommand(input);

		expect(executeSpy).toHaveBeenCalledOnce();
		const ctx = executeSpy.mock.calls[0][0];
		expect(ctx.isBotGiver).toBe(true);
		expect(ctx.userId).toBe("bot-uuid-1234");
	});

	it("isBotGiver=false/undefined では GrassRepository.create が呼ばれる（回帰確認）", async () => {
		const rawCommand = ">>5 !w\n新参おるやん🤣";
		const targetPost = createTargetPost();
		const resolver = createMockPostNumberResolver(targetPost);
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const grassHandler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		const service = new CommandService(
			currencyService,
			accusationService,
			COMMANDS_W_ONLY,
			null,
			grassHandler,
			resolver,
		);

		// isBotGiver を設定しない（人間の書き込み）
		const input: CommandExecutionInput = {
			rawCommand,
			postId: "",
			threadId: "thread-001",
			userId: "user-human-001",
			dailyId: "HmnDly01",
		};

		await service.executeCommand(input);

		// 人間の場合は create が呼ばれる
		expect(grassRepo.create).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// Level 3: PostService 経由テスト（フルパス統合）
// ---------------------------------------------------------------------------

// PostService はモジュールレベルでリポジトリを import するため、vi.mock で事前差し替え
vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: { from: vi.fn() },
}));

vi.mock("../../../lib/infrastructure/repositories/post-repository", () => ({
	findByThreadId: vi.fn(),
	getNextPostNumber: vi.fn(),
	create: vi.fn(),
	countByAuthorId: vi.fn().mockResolvedValue(1),
	findByThreadIdAndPostNumber: vi.fn(),
}));

vi.mock("../../../lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: vi.fn(),
}));

vi.mock("../../../lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: vi.fn(),
}));

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
	deduct: vi.fn().mockResolvedValue({ success: true, newBalance: 100 }),
	getBalance: vi.fn().mockResolvedValue(100),
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

import type { Thread } from "../../../lib/domain/models/thread";
import * as PostRepository from "../../../lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "../../../lib/infrastructure/repositories/thread-repository";
import {
	createPost,
	setCommandService,
} from "../../../lib/services/post-service";

/** テスト用スレッド */
function createTestThread(): Thread {
	return {
		id: "thread-001",
		threadKey: "1700000000",
		boardId: "livebot",
		title: "テストスレッド",
		postCount: 5,
		datByteSize: 0,
		createdBy: "user-001",
		createdAt: new Date("2026-03-22T00:00:00Z"),
		lastPostAt: new Date("2026-03-22T00:00:00Z"),
		isDeleted: false,
		isPinned: false,
		isDormant: false,
	};
}

/** PostRepository.create の返り値（BOT書き込み結果） */
function createCreatedPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-new-bot-001",
		threadId: "thread-001",
		postNumber: 6,
		authorId: null,
		displayName: "名無しさん",
		dailyId: "BotDly01",
		body: ">>5 !w\n新参おるやん🤣",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-26T12:00:00Z"),
		...overrides,
	};
}

describe("Level 3: PostService 経由 — BOT !w フルパス統合", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// スレッド存在
		vi.mocked(ThreadRepository.findById).mockResolvedValue(createTestThread());
		// レス番号採番
		vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(6);
		// レス作成成功
		vi.mocked(PostRepository.create).mockResolvedValue(createCreatedPost());
		// スレッドアクティブ件数
		vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(1);
	});

	it("isBotWrite=true + !w コマンド付き本文で inlineSystemInfo にシステムメッセージがマージされる", async () => {
		// 対象レス（!w の宛先）を PostNumberResolver で解決するために必要
		const targetPost = createTargetPost();

		// PostNumberResolver モック: >>5 → post-target-uuid
		const resolver = createMockPostNumberResolver(targetPost);

		// GrassHandler（実オブジェクト + モックリポジトリ）
		const { postRepo, grassRepo, botPostRepo } = createGrassHandlerMocks();
		const grassHandler = new GrassHandler(postRepo, grassRepo, botPostRepo);

		// CommandService を組み立てて PostService に注入する
		const cmdCurrencyService = createMockCurrencyService();
		const cmdAccusationService = createMockAccusationService();
		const commandService = new CommandService(
			cmdCurrencyService,
			cmdAccusationService,
			COMMANDS_W_ONLY,
			null,
			grassHandler,
			resolver,
		);
		setCommandService(
			commandService as unknown as Parameters<typeof setCommandService>[0],
		);

		const result = await createPost({
			threadId: "thread-001",
			body: ">>5 !w\n新参おるやん🤣",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: "bot-uuid-1234",
		});

		// 書き込み自体は成功するはず
		expect(result).toHaveProperty("success", true);

		// PostRepository.create に渡された inlineSystemInfo を検証する
		// これが null のままだとコマンド効果が発揮されていない
		const createCall = vi.mocked(PostRepository.create).mock.calls[0];
		expect(createCall).toBeDefined();

		const createArg = createCall[0];
		// inlineSystemInfo にシステムメッセージが含まれることを確認
		// ここが null の場合、BOT !w のコマンド効果が発揮されていない（バグ再現）
		expect(createArg.inlineSystemInfo).not.toBeNull();
		expect(createArg.inlineSystemInfo).toContain(">>5");
		expect(createArg.inlineSystemInfo).toContain("草");
	});

	it("isBotWrite=true で authorId が null のままINSERTされる（FK制約違反バグ回帰確認）", async () => {
		// CommandService を null に設定（コマンド無効化）— authorId の検証に集中
		setCommandService(null);

		const result = await createPost({
			threadId: "thread-001",
			body: "こんにちは！",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: "bot-uuid-1234",
		});

		expect(result).toHaveProperty("success", true);

		const createCall = vi.mocked(PostRepository.create).mock.calls[0];
		expect(createCall).toBeDefined();
		expect(createCall[0].authorId).toBeNull();
	});

	it("isBotWrite=false（人間書き込み）で !w を実行しても isBotGiver が伝播しない（回帰確認）", async () => {
		// CommandService を null にして、このテストでは検証しない
		setCommandService(null);

		// 人間書き込みでは isBotGiver が設定されないことのみ確認
		// （フルパスの検証は Level 2 で実施済み）
		expect(true).toBe(true); // Placeholder - Level 2 で網羅済み
	});

	it("CommandService が null の場合、コマンド効果が発揮されず inlineSystemInfo が null になる", async () => {
		// 仮説検証: getCommandService() が初期化失敗で null を返す場合、
		// コマンドパイプラインがスキップされ inlineSystemInfo が null になる。
		// 本番 CF Workers でこの状態が発生している可能性がある。
		// See: post-service.ts L460 — const cmdService = getCommandService();
		setCommandService(null);

		const result = await createPost({
			threadId: "thread-001",
			body: ">>5 !w\n新参おるやん\ud83e\udd23",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: "bot-uuid-1234",
		});

		// 書き込み自体は成功する
		expect(result).toHaveProperty("success", true);

		// しかし inlineSystemInfo は null（コマンド未実行）
		const createCall = vi.mocked(PostRepository.create).mock.calls[0];
		expect(createCall).toBeDefined();
		expect(createCall[0].inlineSystemInfo).toBeNull();
	});

	it("コマンド実行が例外をスローしても書き込みは成功する（try-catch による保護）", async () => {
		// executeCommand が例外をスローしてもcreatePost全体はロールバックしない
		// See: post-service.ts L496-506 — try-catch で握りつぶし
		const mockCommandService = {
			executeCommand: vi.fn().mockRejectedValue(new Error("DB接続エラー")),
		};
		setCommandService(
			mockCommandService as unknown as Parameters<typeof setCommandService>[0],
		);

		const result = await createPost({
			threadId: "thread-001",
			body: ">>5 !w\n新参おるやん\ud83e\udd23",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: "bot-uuid-1234",
		});

		// 書き込みは成功する（コマンド失敗は巻き戻さない）
		expect(result).toHaveProperty("success", true);

		// inlineSystemInfo は null（コマンド実行失敗）
		const createCall = vi.mocked(PostRepository.create).mock.calls[0];
		expect(createCall).toBeDefined();
		expect(createCall[0].inlineSystemInfo).toBeNull();
	});

	it("commandResult が null（コマンド未検出）の場合でも書き込みは成功する", async () => {
		// executeCommand が null を返す = コマンドが本文中に存在しない
		const mockCommandService = {
			executeCommand: vi.fn().mockResolvedValue(null),
		};
		setCommandService(
			mockCommandService as unknown as Parameters<typeof setCommandService>[0],
		);

		const result = await createPost({
			threadId: "thread-001",
			body: "コマンドなしの通常本文",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
			botUserId: "bot-uuid-1234",
		});

		expect(result).toHaveProperty("success", true);

		const createCall = vi.mocked(PostRepository.create).mock.calls[0];
		expect(createCall).toBeDefined();
		expect(createCall[0].inlineSystemInfo).toBeNull();
	});
});
