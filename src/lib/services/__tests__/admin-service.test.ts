/**
 * 単体テスト: admin-service.ts（AdminService）
 *
 * See: features/admin.feature
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 *
 * テスト方針:
 *   - PostRepository, ThreadRepository はモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（存在しないレス・スレッド、レスなしスレッド等）を網羅する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findById: vi.fn(),
	findByThreadId: vi.fn(),
	findByAuthorId: vi.fn().mockResolvedValue([]),
	softDelete: vi.fn(),
	softDeleteByThreadId: vi.fn(),
	countByDate: vi.fn().mockResolvedValue(0),
	countActiveThreadsByDate: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	softDelete: vi.fn(),
}));

// PostService をモック化する（AdminService が createPost を使ってシステムレスを挿入するため）
// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
vi.mock("@/lib/services/post-service", () => ({
	createPost: vi.fn(),
}));

// UserRepository をモック化する（AdminService.banUser/unbanUser/getUserList が使うため）
// See: features/admin.feature @管理者がユーザーをBANする
// See: features/admin.feature @管理者がユーザー一覧を閲覧できる
vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	updateIsBanned: vi.fn(),
	updateLastIpHash: vi.fn(),
	findAll: vi.fn().mockResolvedValue({ users: [], total: 0 }),
}));

// IpBanRepository をモック化する（AdminService.banIpByUserId/unbanIp が呼ぶため）
// See: features/admin.feature @管理者がユーザーのIPをBANする
vi.mock("@/lib/infrastructure/repositories/ip-ban-repository", () => ({
	isBanned: vi.fn().mockResolvedValue(false),
	create: vi.fn(),
	deactivate: vi.fn(),
	listActive: vi.fn().mockResolvedValue([]),
	findById: vi.fn().mockResolvedValue(null),
}));

// CurrencyService をモック化する（AdminService.grantCurrency が credit/getBalance を呼ぶため）
// See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
vi.mock("@/lib/services/currency-service", () => ({
	credit: vi.fn().mockResolvedValue(undefined),
	getBalance: vi.fn().mockResolvedValue(150),
	deduct: vi.fn(),
	initializeBalance: vi.fn(),
}));

// CurrencyRepository をモック化する（AdminService.getDashboard が sumAllBalances を呼ぶため）
// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
vi.mock("@/lib/infrastructure/repositories/currency-repository", () => ({
	findByUserId: vi.fn(),
	create: vi.fn(),
	credit: vi.fn(),
	deduct: vi.fn(),
	getBalance: vi.fn(),
	sumAllBalances: vi.fn().mockResolvedValue(0),
}));

// DailyStatsRepository をモック化する（AdminService.getDashboardHistory が findLatest を呼ぶため）
// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
vi.mock("@/lib/infrastructure/repositories/daily-stats-repository", () => ({
	findByDate: vi.fn().mockResolvedValue(null),
	findByDateRange: vi.fn().mockResolvedValue([]),
	findLatest: vi.fn().mockResolvedValue([]),
	upsert: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import type { Post } from "@/lib/domain/models/post";
import type { Thread } from "@/lib/domain/models/thread";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";
import * as PostService from "@/lib/services/post-service";
import type { DeletePostResult, DeleteThreadResult } from "../admin-service";
import { deletePost, deleteThread } from "../admin-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用 Post オブジェクトのファクトリ */
function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-uuid-001",
		threadId: "thread-uuid-001",
		postNumber: 5,
		authorId: "user-uuid-001",
		displayName: "名無しさん",
		dailyId: "Ax8kP2Lm",
		body: "テスト本文",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-13T00:00:00Z"),
		...overrides,
	};
}

/** テスト用 Thread オブジェクトのファクトリ */
function makeThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "thread-uuid-001",
		threadKey: "1741305600",
		boardId: "battleboard",
		title: "今日の雑談",
		postCount: 5,
		datByteSize: 1024,
		createdBy: "user-uuid-001",
		createdAt: new Date("2026-03-13T00:00:00Z"),
		lastPostAt: new Date("2026-03-13T00:00:00Z"),
		isDeleted: false,
		// See: features/thread.feature @pinned_thread
		isPinned: false,
		// See: docs/specs/thread_state_transitions.yaml #states.listed
		isDormant: false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AdminService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// PostService.createPost のデフォルトモック（システムレス挿入用）
		// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
		vi.mocked(PostService.createPost).mockResolvedValue({
			success: true,
			postId: "system-post-uuid-001",
			postNumber: 99,
			systemMessages: [],
		});
	});

	// =========================================================================
	// deletePost: レス削除
	// =========================================================================

	describe("deletePost", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: レスが存在する場合", () => {
			it("存在するレスを削除すると success: true を返す", async () => {
				// See: features/admin.feature @管理者が指定したレスを削除する
				const post = makePost({ id: "post-uuid-001" });
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				const result = await deletePost("post-uuid-001", "admin-uuid-001");

				expect(result.success).toBe(true);
			});

			it("削除時に PostRepository.softDelete を正しい postId で呼び出す", async () => {
				// See: features/admin.feature @管理者が指定したレスを削除する
				// See: docs/architecture/components/admin.md §4 > ソフトデリートのみ
				const post = makePost({ id: "post-uuid-001" });
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				await deletePost("post-uuid-001", "admin-uuid-001");

				expect(PostRepository.softDelete).toHaveBeenCalledWith("post-uuid-001");
				expect(PostRepository.softDelete).toHaveBeenCalledTimes(1);
			});

			it("存在確認のために PostRepository.findById を呼び出す", async () => {
				const post = makePost({ id: "post-uuid-001" });
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				await deletePost("post-uuid-001", "admin-uuid-001");

				expect(PostRepository.findById).toHaveBeenCalledWith("post-uuid-001");
			});

			it("reason 引数を渡しても正常に動作する", async () => {
				const post = makePost();
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				const result = await deletePost(
					"post-uuid-001",
					"admin-uuid-001",
					"不適切な内容",
				);

				expect(result.success).toBe(true);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: レスが存在しない
		// -----------------------------------------------------------------------

		describe("異常系: レスが存在しない場合", () => {
			it("存在しないレスの削除は not_found を返す", async () => {
				// See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
				vi.mocked(PostRepository.findById).mockResolvedValue(null);

				const result = await deletePost(
					"non-existent-post-uuid",
					"admin-uuid-001",
				);

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.reason).toBe("not_found");
				}
			});

			it("存在しないレスの場合は softDelete を呼び出さない", async () => {
				// See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
				vi.mocked(PostRepository.findById).mockResolvedValue(null);

				await deletePost("non-existent-post-uuid", "admin-uuid-001");

				expect(PostRepository.softDelete).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: リポジトリエラー
		// -----------------------------------------------------------------------

		describe("異常系: リポジトリエラー", () => {
			it("PostRepository.findById がエラーをスローした場合は伝播する", async () => {
				vi.mocked(PostRepository.findById).mockRejectedValue(
					new Error("DB接続エラー"),
				);

				await expect(
					deletePost("post-uuid-001", "admin-uuid-001"),
				).rejects.toThrow("DB接続エラー");
			});

			it("PostRepository.softDelete がエラーをスローした場合は伝播する", async () => {
				const post = makePost();
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockRejectedValue(
					new Error("DB更新エラー"),
				);

				await expect(
					deletePost("post-uuid-001", "admin-uuid-001"),
				).rejects.toThrow("DB更新エラー");
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース
		// -----------------------------------------------------------------------

		describe("エッジケース", () => {
			it("空文字列の postId でも PostRepository.findById を呼び出す", async () => {
				vi.mocked(PostRepository.findById).mockResolvedValue(null);

				const result = await deletePost("", "admin-uuid-001");

				expect(result.success).toBe(false);
				expect(PostRepository.findById).toHaveBeenCalledWith("");
			});

			it("既に削除済みのレスを再度削除しても success: true を返す", async () => {
				// ソフトデリートはべき等性を持つ（同じレスを2回削除しても問題ない）
				const deletedPost = makePost({ id: "post-uuid-001", isDeleted: true });
				vi.mocked(PostRepository.findById).mockResolvedValue(deletedPost);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				const result = await deletePost("post-uuid-001", "admin-uuid-001");

				expect(result.success).toBe(true);
			});
		});

		// -----------------------------------------------------------------------
		// システムレス挿入（方式B: 独立システムレス）
		// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
		// See: docs/architecture/components/posting.md §5 方式B
		// -----------------------------------------------------------------------

		describe("システムレス挿入: 削除時に「★システム」名義のレスが追加される", () => {
			it("削除時にcreatePostで★システム名義のシステムレスが挿入される", async () => {
				// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
				const post = makePost({
					id: "post-uuid-001",
					threadId: "thread-uuid-001",
				});
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				await deletePost("post-uuid-001", "admin-uuid-001");

				expect(PostService.createPost).toHaveBeenCalledWith(
					expect.objectContaining({
						threadId: "thread-uuid-001",
						displayName: "★システム",
						isBotWrite: true,
						isSystemMessage: true,
					}),
				);
			});

			it("commentが指定された場合、コメント内容がシステムレス本文に設定される", async () => {
				// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
				const post = makePost({ id: "post-uuid-001" });
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				await deletePost(
					"post-uuid-001",
					"admin-uuid-001",
					undefined,
					"スパム投稿のため削除",
				);

				expect(PostService.createPost).toHaveBeenCalledWith(
					expect.objectContaining({
						body: "🗑️ スパム投稿のため削除",
					}),
				);
			});

			it("commentが未指定の場合、フォールバックメッセージがシステムレス本文に設定される", async () => {
				// See: features/command_system.feature @管理者がコメントなしでレス削除した場合はフォールバックメッセージで通知される
				const post = makePost({ id: "post-uuid-001" });
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);

				await deletePost("post-uuid-001", "admin-uuid-001");

				expect(PostService.createPost).toHaveBeenCalledWith(
					expect.objectContaining({
						body: "🗑️ レス >>5 は管理者により削除されました",
					}),
				);
			});

			it("システムレス挿入が失敗しても削除結果は success: true を返す", async () => {
				// See: docs/architecture/components/posting.md §5 方式B
				const post = makePost({ id: "post-uuid-001" });
				vi.mocked(PostRepository.findById).mockResolvedValue(post);
				vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostService.createPost).mockRejectedValue(
					new Error("システムレス挿入失敗"),
				);

				const result = await deletePost("post-uuid-001", "admin-uuid-001");

				// 削除自体は成功
				expect(result.success).toBe(true);
			});
		});
	});

	// =========================================================================
	// deleteThread: スレッド削除
	// =========================================================================

	describe("deleteThread", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: スレッドが存在する場合", () => {
			it("存在するスレッドを削除すると success: true を返す", async () => {
				// See: features/admin.feature @管理者が指定したスレッドを削除する
				const thread = makeThread({ id: "thread-uuid-001" });
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockResolvedValue(
					undefined,
				);

				const result = await deleteThread("thread-uuid-001", "admin-uuid-001");

				expect(result.success).toBe(true);
			});

			it("スレッド削除時に ThreadRepository.softDelete を呼び出す", async () => {
				// See: features/admin.feature @スレッドとその中の全レスが削除される
				const thread = makeThread({ id: "thread-uuid-001" });
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockResolvedValue(
					undefined,
				);

				await deleteThread("thread-uuid-001", "admin-uuid-001");

				expect(ThreadRepository.softDelete).toHaveBeenCalledWith(
					"thread-uuid-001",
				);
				expect(ThreadRepository.softDelete).toHaveBeenCalledTimes(1);
			});

			it("スレッド内の全レスをバッチソフトデリートする（MEDIUM-005: N+1解消）", async () => {
				// See: features/admin.feature @スレッドとその中の全レスが削除される
				// MEDIUM-005: softDeleteByThreadId が1回呼ばれることを確認する（N+1ではなく1回のUPDATE）
				const thread = makeThread({ id: "thread-uuid-001" });
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockResolvedValue(
					undefined,
				);

				await deleteThread("thread-uuid-001", "admin-uuid-001");

				// softDeleteByThreadId が threadId を引数に1回呼ばれることを確認する
				expect(PostRepository.softDeleteByThreadId).toHaveBeenCalledWith(
					"thread-uuid-001",
				);
				expect(PostRepository.softDeleteByThreadId).toHaveBeenCalledTimes(1);
				// 個別 softDelete は呼ばれないことを確認する（N+1の解消）
				expect(PostRepository.softDelete).not.toHaveBeenCalled();
			});

			it("レスがないスレッドを削除しても成功する", async () => {
				// エッジケース: 空スレッド（レスが0件）の削除
				// softDeleteByThreadId は対象行がない場合でも正常に完了する
				const thread = makeThread({ id: "thread-uuid-001", postCount: 0 });
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockResolvedValue(
					undefined,
				);

				const result = await deleteThread("thread-uuid-001", "admin-uuid-001");

				expect(result.success).toBe(true);
				// softDeleteByThreadId は必ず1回呼ばれる（対象行がなくても問題ない）
				expect(PostRepository.softDeleteByThreadId).toHaveBeenCalledWith(
					"thread-uuid-001",
				);
			});

			it("reason 引数を渡しても正常に動作する", async () => {
				const thread = makeThread();
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockResolvedValue(
					undefined,
				);

				const result = await deleteThread(
					"thread-uuid-001",
					"admin-uuid-001",
					"不適切なスレッド",
				);

				expect(result.success).toBe(true);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: スレッドが存在しない
		// -----------------------------------------------------------------------

		describe("異常系: スレッドが存在しない場合", () => {
			it("存在しないスレッドの削除は not_found を返す", async () => {
				vi.mocked(ThreadRepository.findById).mockResolvedValue(null);

				const result = await deleteThread(
					"non-existent-thread-uuid",
					"admin-uuid-001",
				);

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.reason).toBe("not_found");
				}
			});

			it("存在しないスレッドの場合は softDelete 系を呼び出さない", async () => {
				vi.mocked(ThreadRepository.findById).mockResolvedValue(null);

				await deleteThread("non-existent-thread-uuid", "admin-uuid-001");

				expect(ThreadRepository.softDelete).not.toHaveBeenCalled();
				expect(PostRepository.softDeleteByThreadId).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: リポジトリエラー
		// -----------------------------------------------------------------------

		describe("異常系: リポジトリエラー", () => {
			it("ThreadRepository.findById がエラーをスローした場合は伝播する", async () => {
				vi.mocked(ThreadRepository.findById).mockRejectedValue(
					new Error("DB接続エラー"),
				);

				await expect(
					deleteThread("thread-uuid-001", "admin-uuid-001"),
				).rejects.toThrow("DB接続エラー");
			});

			it("ThreadRepository.softDelete がエラーをスローした場合は伝播する", async () => {
				const thread = makeThread();
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockRejectedValue(
					new Error("DB更新エラー"),
				);

				await expect(
					deleteThread("thread-uuid-001", "admin-uuid-001"),
				).rejects.toThrow("DB更新エラー");
			});

			it("PostRepository.softDeleteByThreadId がエラーをスローした場合は伝播する", async () => {
				// See: エッジケース: 異常系パス
				const thread = makeThread();
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockRejectedValue(
					new Error("DB更新エラー"),
				);

				await expect(
					deleteThread("thread-uuid-001", "admin-uuid-001"),
				).rejects.toThrow("DB更新エラー");
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース
		// -----------------------------------------------------------------------

		describe("エッジケース", () => {
			it("空文字列の threadId でも ThreadRepository.findById を呼び出す", async () => {
				vi.mocked(ThreadRepository.findById).mockResolvedValue(null);

				const result = await deleteThread("", "admin-uuid-001");

				expect(result.success).toBe(false);
				expect(ThreadRepository.findById).toHaveBeenCalledWith("");
			});

			it("大量のレス（1000件）があるスレッドを削除できる（MEDIUM-005: バッチで1回のUPDATE）", async () => {
				// See: エッジケース: 大量データ
				// MEDIUM-005: N+1解消により、1000件でも softDeleteByThreadId が1回だけ呼ばれる
				const thread = makeThread({ postCount: 1000 });
				vi.mocked(ThreadRepository.findById).mockResolvedValue(thread);
				vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined);
				vi.mocked(PostRepository.softDeleteByThreadId).mockResolvedValue(
					undefined,
				);

				const result = await deleteThread("thread-uuid-001", "admin-uuid-001");

				expect(result.success).toBe(true);
				// バッチ削除: softDeleteByThreadId が1回だけ呼ばれる（N回ではない）
				expect(PostRepository.softDeleteByThreadId).toHaveBeenCalledTimes(1);
				expect(PostRepository.softDeleteByThreadId).toHaveBeenCalledWith(
					"thread-uuid-001",
				);
			});
		});
	});
});
