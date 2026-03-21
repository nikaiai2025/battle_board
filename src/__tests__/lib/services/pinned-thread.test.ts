/**
 * 固定スレッド（案内板）の単体テスト
 *
 * テスト対象:
 *   - PostService.createPost: 固定スレッドへの書き込み拒否（PINNED_THREAD ガード）
 *   - loadCommandConfigs: hidden フラグによる除外
 *   - generateAnnouncementBody: 案内テキスト生成ロジック
 *
 * See: features/thread.feature @pinned_thread
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §2
 */

import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

// node:fs モック（loadCommandConfigs テスト用）
vi.mock("node:fs");

// ThreadRepository モック
vi.mock("../../../lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	findByBoardId: vi.fn(),
	create: vi.fn(),
	incrementPostCount: vi.fn(),
	updateLastPostAt: vi.fn(),
	findByThreadKey: vi.fn(),
	updateDatByteSize: vi.fn(),
	softDelete: vi.fn(),
	// 休眠管理関数（TASK-203 で追加）
	// See: docs/specs/thread_state_transitions.yaml #transitions
	wakeThread: vi.fn(),
	demoteOldestActiveThread: vi.fn(),
	countActiveThreads: vi.fn(),
}));

// PostRepository モック（書き込みが実際に行われないよう）
vi.mock("../../../lib/infrastructure/repositories/post-repository", () => ({
	create: vi.fn().mockResolvedValue({
		id: "mock-post-id",
		threadId: "normal-thread-id",
		postNumber: 1,
		authorId: "user-1",
		displayName: "名無しさん",
		dailyId: "mock-daily-id",
		body: "テスト書き込み",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(),
	}),
	findByThreadId: vi.fn().mockResolvedValue([]),
	getNextPostNumber: vi.fn().mockResolvedValue(1),
	// Step 6.5: 初回書き込み検出（ウェルカムシーケンス）
	countByAuthorId: vi.fn().mockResolvedValue(1), // 2回目以降として扱う
}));

// UserRepository モック
vi.mock("../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn().mockResolvedValue(null),
	updateLastIpHash: vi.fn(),
}));

// AuthService モック
vi.mock("../../../lib/services/auth-service", () => ({
	issueEdgeToken: vi.fn(),
	issueAuthCode: vi.fn(),
	verifyEdgeToken: vi.fn().mockResolvedValue({
		valid: true,
		userId: "user-1",
		authorIdSeed: "seed-1",
	}),
	// BAN チェック（TASK-105 で追加）
	// See: features/admin.feature @BANされたIPからの書き込みが拒否される
	isIpBanned: vi.fn().mockResolvedValue(false),
	isUserBanned: vi.fn().mockResolvedValue(false),
}));

// IncentiveService モック
vi.mock("../../../lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn().mockResolvedValue({ granted: [] }),
}));

// BotPostRepository モック（TASK-220: getPostListWithBotMark追加に伴うモック追加）
vi.mock("../../../lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: vi.fn().mockResolvedValue([]),
}));

// BotRepository モック（TASK-220: getPostListWithBotMark追加に伴うモック追加）
vi.mock("../../../lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: vi.fn().mockResolvedValue([]),
}));

// CurrencyService モック（TASK-239: Step 6.5 ウェルカムシーケンス追加に伴うモック追加）
vi.mock("../../../lib/services/currency-service", () => ({
	credit: vi.fn().mockResolvedValue(undefined),
}));

// PendingTutorialRepository モック（TASK-239: Step 6.5 ウェルカムシーケンス追加に伴うモック追加）
vi.mock(
	"../../../lib/infrastructure/repositories/pending-tutorial-repository",
	() => ({
		create: vi.fn().mockResolvedValue(undefined),
	}),
);

import type { Thread } from "../../../lib/domain/models/thread";
import * as ThreadRepository from "../../../lib/infrastructure/repositories/thread-repository";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** テスト用固定スレッドを生成する */
function makePinnedThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "pinned-thread-id",
		threadKey: "4070908800",
		boardId: "battleboard",
		title: "■ BattleBoard 案内板",
		postCount: 1,
		datByteSize: 0,
		createdBy: "system",
		createdAt: new Date("2099-01-01T00:00:00Z"),
		lastPostAt: new Date("2099-01-01T00:00:00Z"),
		isDeleted: false,
		isPinned: true,
		// See: docs/specs/thread_state_transitions.yaml #states.listed
		isDormant: false,
		...overrides,
	};
}

/** テスト用通常スレッドを生成する */
function makeNormalThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "normal-thread-id",
		threadKey: "1700000000",
		boardId: "battleboard",
		title: "通常スレッド",
		postCount: 0,
		datByteSize: 0,
		createdBy: "user-1",
		createdAt: new Date(),
		lastPostAt: new Date(),
		isDeleted: false,
		isPinned: false,
		// See: docs/specs/thread_state_transitions.yaml #states.listed
		isDormant: false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// PostService: 固定スレッドへの書き込みガード
// See: features/thread.feature @固定スレッドには一般ユーザーが書き込みできない
// ---------------------------------------------------------------------------

describe("PostService.createPost — 固定スレッドへの書き込みガード", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// 休眠管理関数のデフォルトモック（TASK-203 で追加）
		// See: docs/specs/thread_state_transitions.yaml #transitions
		vi.mocked(ThreadRepository.wakeThread).mockResolvedValue(undefined);
		vi.mocked(ThreadRepository.demoteOldestActiveThread).mockResolvedValue(
			undefined,
		);
		// デフォルトはアクティブスレッド数 < 50（休眠化不要）
		vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(1);
	});

	it("isPinned=true のスレッドへの書き込みは PINNED_THREAD エラーで拒否される", async () => {
		// Arrange: 固定スレッドを返すようモック設定
		vi.mocked(ThreadRepository.findById).mockResolvedValue(makePinnedThread());

		// Act
		const { createPost } = await import("../../../lib/services/post-service");
		const result = await createPost({
			threadId: "pinned-thread-id",
			body: "テスト書き込み",
			edgeToken: "valid-token",
			ipHash: "test-ip-hash",
			isBotWrite: false,
		});

		// Assert
		expect(result).toMatchObject({
			success: false,
			code: "PINNED_THREAD",
		});
	});

	it("isPinned=false の通常スレッドへの書き込みはガードを通過する（バリデーション以降に進む）", async () => {
		// Arrange: 通常スレッドを返すようモック設定
		vi.mocked(ThreadRepository.findById).mockResolvedValue(makeNormalThread());

		// Act
		const { createPost } = await import("../../../lib/services/post-service");
		const result = await createPost({
			threadId: "normal-thread-id",
			body: "テスト書き込み",
			edgeToken: "valid-token",
			ipHash: "test-ip-hash",
			isBotWrite: false,
		});

		// Assert: PINNED_THREAD エラーではない（別のエラーや成功の可能性はある）
		if ("code" in result) {
			expect(result.code).not.toBe("PINNED_THREAD");
		}
	});

	it("スレッドが存在しない場合もガードは通過する（後続処理でエラーになる）", async () => {
		// Arrange: スレッドが存在しない
		vi.mocked(ThreadRepository.findById).mockResolvedValue(null);

		// Act
		const { createPost } = await import("../../../lib/services/post-service");
		const result = await createPost({
			threadId: "non-existent-thread-id",
			body: "テスト書き込み",
			edgeToken: "valid-token",
			ipHash: "test-ip-hash",
			isBotWrite: false,
		});

		// Assert: PINNED_THREAD エラーではない
		if ("code" in result) {
			expect(result.code).not.toBe("PINNED_THREAD");
		}
	});

	it("ボット書き込み（isBotWrite=true）でも固定スレッドへの書き込みは拒否される", async () => {
		// Arrange
		vi.mocked(ThreadRepository.findById).mockResolvedValue(makePinnedThread());

		// Act
		const { createPost } = await import("../../../lib/services/post-service");
		const result = await createPost({
			threadId: "pinned-thread-id",
			body: "ボット書き込みテスト",
			edgeToken: null,
			ipHash: "bot-ip-hash",
			isBotWrite: true,
		});

		// Assert: ボット書き込みでも拒否される
		expect(result).toMatchObject({
			success: false,
			code: "PINNED_THREAD",
		});
	});
});

// ---------------------------------------------------------------------------
// loadCommandConfigs: hidden フラグによる除外
// See: features/thread.feature @pinned_thread
// ---------------------------------------------------------------------------

describe("loadCommandConfigs — hidden コマンドの除外", () => {
	// node:fs モック済みの readFileSync を各テストで制御する
	const mockedReadFileSync = vi.mocked(fs.readFileSync);

	beforeEach(() => {
		mockedReadFileSync.mockReset();
	});

	it("hidden: true のコマンドは結果に含まれない", async () => {
		// Arrange: hidden フラグ付きコマンドを含む YAML を注入
		mockedReadFileSync.mockReturnValueOnce(
			[
				"commands:",
				"  tell:",
				"    description: AIだと告発する",
				"    cost: 10",
				"    enabled: true",
				"    hidden: false",
				"  abeshinzo:",
				"    description: 意味のないコマンド",
				"    cost: 0",
				"    enabled: true",
				"    hidden: true",
			].join("\n"),
		);

		const { loadCommandConfigs } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const result = loadCommandConfigs("/dummy/commands.yaml");

		// Assert: tell は含まれ、abeshinzo は除外される
		// See: features/thread.feature @pinned_thread
		expect(result.map((c) => c.name)).toContain("tell");
		expect(result.map((c) => c.name)).not.toContain("abeshinzo");
	});

	it("hidden フィールドが存在しないコマンドは除外されない", async () => {
		// Arrange: hidden フィールドなしの YAML を注入
		mockedReadFileSync.mockReturnValueOnce(
			[
				"commands:",
				"  w:",
				"    description: 草を生やす",
				"    cost: 0",
				"    enabled: true",
			].join("\n"),
		);

		const { loadCommandConfigs } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const result = loadCommandConfigs("/dummy/commands.yaml");

		expect(result.map((c) => c.name)).toContain("w");
	});

	it("enabled: false かつ hidden: false のコマンドは除外される", async () => {
		// Arrange: 無効なコマンドの YAML を注入
		mockedReadFileSync.mockReturnValueOnce(
			[
				"commands:",
				"  disabled_cmd:",
				"    description: 無効なコマンド",
				"    cost: 5",
				"    enabled: false",
				"    hidden: false",
			].join("\n"),
		);

		const { loadCommandConfigs } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const result = loadCommandConfigs("/dummy/commands.yaml");

		expect(result.map((c) => c.name)).not.toContain("disabled_cmd");
	});
});

// ---------------------------------------------------------------------------
// generateAnnouncementBody: 案内テキスト生成ロジック
// See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-b
// ---------------------------------------------------------------------------

describe("generateAnnouncementBody — 案内テキスト生成", () => {
	it("コマンド一覧がテキストに含まれる", async () => {
		const { generateAnnouncementBody } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const commands = [
			{ name: "tell", description: "指定レスをAIだと告発する", cost: 10 },
			{ name: "w", description: "指定レスに草を生やす", cost: 0 },
		];

		const body = generateAnnouncementBody(commands);

		expect(body).toContain("!tell");
		expect(body).toContain("!w");
		expect(body).toContain("10コイン");
		expect(body).toContain("無料");
	});

	it("/mypage リンクが含まれる", async () => {
		const { generateAnnouncementBody } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const commands = [{ name: "tell", description: "テスト", cost: 5 }];

		const body = generateAnnouncementBody(commands);

		expect(body).toContain("/mypage");
	});

	it("/dev/ リンクが含まれる", async () => {
		const { generateAnnouncementBody } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const commands = [{ name: "tell", description: "テスト", cost: 5 }];

		const body = generateAnnouncementBody(commands);

		expect(body).toContain("/dev/");
	});

	it("コマンドが空の場合でもクラッシュしない", async () => {
		const { generateAnnouncementBody } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);

		expect(() => generateAnnouncementBody([])).not.toThrow();
	});

	it("コスト0のコマンドは「無料」と表示される", async () => {
		const { generateAnnouncementBody } = await import(
			"../../../../scripts/upsert-pinned-thread"
		);
		const commands = [{ name: "w", description: "草を生やす", cost: 0 }];

		const body = generateAnnouncementBody(commands);

		expect(body).toContain("無料");
		expect(body).not.toContain("0コイン");
	});
});

// ---------------------------------------------------------------------------
// Thread モデル: isPinned フィールド
// See: src/lib/domain/models/thread.ts
// ---------------------------------------------------------------------------

describe("Thread モデル — isPinned フィールド", () => {
	it("isPinned が true の Thread オブジェクトを作成できる", () => {
		const thread = makePinnedThread();
		expect(thread.isPinned).toBe(true);
	});

	it("isPinned が false の Thread オブジェクトを作成できる", () => {
		const thread = makeNormalThread();
		expect(thread.isPinned).toBe(false);
	});
});
