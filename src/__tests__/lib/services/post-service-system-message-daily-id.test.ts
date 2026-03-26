/**
 * 単体テスト: PostService.createPost — Step 4 dailyId 生成
 *
 * 修正背景: システムメッセージ（isSystemMessage=true）の dailyId がハッシュ値で
 * 生成されていたバグを修正。モデル定義 post.ts L22 で「システムメッセージの場合は
 * "SYSTEM"」と規定されているため、isSystemMessage=true 時は "SYSTEM" 固定にする。
 *
 * See: src/lib/domain/models/post.ts @dailyId
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 *
 * テスト方針:
 *   - PostRepository, AuthService, ThreadRepository など全ての外部依存をモック化する
 *   - PostRepository.create に渡される引数を検証することで dailyId を確認する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - isSystemMessage=true の場合、PostRepository.create に dailyId="SYSTEM" が渡される
 *   - isSystemMessage=false（通常レス）の場合、dailyId がハッシュ値になる（"SYSTEM" でない）
 *   - isSystemMessage 未指定（デフォルト）の場合も通常レスとして扱われる
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
	createWithAtomicNumber: vi.fn(),
	countByAuthorId: vi.fn().mockResolvedValue(3), // 2回目以降（ウェルカムシーケンス無効）
}));

// BotPostRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: vi.fn().mockResolvedValue([]),
}));

// BotRepository をモック化
vi.mock("../../../lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: vi.fn().mockResolvedValue([]),
}));

// CurrencyService をモック化（テスト対象外）
vi.mock("../../../lib/services/currency-service", () => ({
	credit: vi.fn().mockResolvedValue(undefined),
}));

// PendingTutorialRepository をモック化（テスト対象外）
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

import * as PostRepository from "../../../lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "../../../lib/infrastructure/repositories/thread-repository";
import {
	createPost,
	setCommandService,
} from "../../../lib/services/post-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用の通常スレッドを生成する */
function createMockThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "thread-001",
		boardId: "livebot",
		title: "テストスレッド",
		threadKey: "1700000000",
		postCount: 5,
		datByteSize: 0,
		createdBy: "user-001",
		lastPostAt: new Date("2026-03-22T00:00:00Z"),
		createdAt: new Date("2026-03-22T00:00:00Z"),
		isDeleted: false,
		isPinned: false,
		isDormant: false,
		...overrides,
	};
}

/** テスト用の作成済みレスを生成する（dailyId を任意に設定可能） */
function createMockCreatedPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-uuid-001",
		threadId: "thread-001",
		postNumber: 1,
		authorId: null,
		displayName: "★システム",
		dailyId: "SYSTEM",
		body: "システムメッセージ本文",
		inlineSystemInfo: null,
		isSystemMessage: true,
		isDeleted: false,
		createdAt: new Date("2026-03-22T12:00:00Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("PostService.createPost — Step 4 dailyId 生成", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// CommandService を null に設定してコマンド機能を無効化する
		setCommandService(null);

		// デフォルト設定: 通常のスレッドへの書き込み
		vi.mocked(ThreadRepository.findById).mockResolvedValue(createMockThread());
		vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
			createMockCreatedPost(),
		);
	});

	// =========================================================================
	// isSystemMessage=true の場合: dailyId="SYSTEM" 固定
	// =========================================================================

	describe("isSystemMessage=true（システムメッセージ）", () => {
		/**
		 * システムメッセージの dailyId は "SYSTEM" 固定になる
		 * See: src/lib/domain/models/post.ts @dailyId（L22）
		 */
		it("isSystemMessage=true の場合、PostRepository.create に dailyId='SYSTEM' が渡される", async () => {
			await createPost({
				threadId: "thread-001",
				body: "★ システムからのお知らせ",
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});

			expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledOnce();
			const callArg = vi.mocked(PostRepository.createWithAtomicNumber).mock
				.calls[0][0];
			expect(callArg.dailyId).toBe("SYSTEM");
		});

		/**
		 * ipHash が "system" 以外でも isSystemMessage=true なら dailyId は "SYSTEM" になる
		 */
		it("ipHash の値によらず isSystemMessage=true なら dailyId='SYSTEM' になる", async () => {
			await createPost({
				threadId: "thread-001",
				body: "ボットからのシステム通知",
				edgeToken: null,
				ipHash: "some-random-hash-value",
				isBotWrite: true,
				isSystemMessage: true,
			});

			expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledOnce();
			const callArg = vi.mocked(PostRepository.createWithAtomicNumber).mock
				.calls[0][0];
			expect(callArg.dailyId).toBe("SYSTEM");
		});

		/**
		 * isSystemMessage=true でも書き込み自体は成功する
		 */
		it("isSystemMessage=true の場合も success=true が返される", async () => {
			const result = await createPost({
				threadId: "thread-001",
				body: "★ システムからのお知らせ",
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});

			expect(result).toMatchObject({ success: true });
		});
	});

	// =========================================================================
	// isSystemMessage=false の場合: dailyId はハッシュ値
	// =========================================================================

	describe("isSystemMessage=false（通常レス）", () => {
		/**
		 * 通常レスの dailyId は "SYSTEM" でなく generateDailyId() によるハッシュ値になる
		 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
		 */
		it("isSystemMessage=false の場合、PostRepository.create に dailyId='SYSTEM' は渡されない", async () => {
			// 通常レスの返り値: dailyId はハッシュ値
			vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
				createMockCreatedPost({
					authorId: null,
					displayName: "名無しさん",
					dailyId: "ABC12", // generateDailyId() の結果（モック戻り値はテスト無関係）
					body: "通常のレス",
					isSystemMessage: false,
				}),
			);

			await createPost({
				threadId: "thread-001",
				body: "通常のレス",
				edgeToken: null,
				ipHash: "hash-001",
				isBotWrite: true, // 認証スキップのためにBOT書き込みを使用
				isSystemMessage: false,
			});

			expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledOnce();
			const callArg = vi.mocked(PostRepository.createWithAtomicNumber).mock
				.calls[0][0];
			// 通常レスでは "SYSTEM" は渡されない
			expect(callArg.dailyId).not.toBe("SYSTEM");
		});

		/**
		 * isSystemMessage を省略した場合（デフォルト false）も通常レスとして扱われる
		 */
		it("isSystemMessage 未指定（デフォルト）の場合、dailyId は 'SYSTEM' でない", async () => {
			vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(
				createMockCreatedPost({
					authorId: null,
					displayName: "名無しさん",
					dailyId: "XYZ99",
					body: "通常のレス（isSystemMessage省略）",
					isSystemMessage: false,
				}),
			);

			await createPost({
				threadId: "thread-001",
				body: "通常のレス（isSystemMessage省略）",
				edgeToken: null,
				ipHash: "hash-002",
				isBotWrite: true, // 認証スキップ
				// isSystemMessage は省略（デフォルト false）
			});

			expect(PostRepository.createWithAtomicNumber).toHaveBeenCalledOnce();
			const callArg = vi.mocked(PostRepository.createWithAtomicNumber).mock
				.calls[0][0];
			expect(callArg.dailyId).not.toBe("SYSTEM");
		});
	});
});
