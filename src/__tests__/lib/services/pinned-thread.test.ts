/**
 * 固定スレッド（案内板）の単体テスト
 *
 * テスト対象:
 *   - PostService.createPost: 固定スレッドへの書き込み拒否（PINNED_THREAD ガード）
 *   - generateAnnouncementBody: 案内テキスト生成ロジック
 *
 * See: features/thread.feature @pinned_thread
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §2
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

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
}));

// UserRepository モック
vi.mock("../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn().mockResolvedValue(null),
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
}));

// IncentiveService モック
vi.mock("../../../lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn().mockResolvedValue({ granted: [] }),
}));

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
