/**
 * 単体テスト: AdminService ユーザー管理機能（getUserList, getUserDetail, getUserPosts）
 *
 * ATK-006-1: getUserList の戻り値に通貨残高（balance）が含まれることを検証する。
 * ATK-006-2: getUserDetail/getUserPosts の戻り値にスレッド名（threadTitle）が含まれることを検証する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
 *
 * テスト方針:
 *   - UserRepository, PostRepository, CurrencyRepository はモック化する
 *   - getUserList: balance フィールドの付加、ページネーション、空リスト、N+1 回避の並列取得を検証
 *   - getUserDetail: PostWithThread（threadTitle 付き）の取得、ユーザー未存在時の null 返却を検証
 *   - getUserPosts: searchByAuthorId 経由の PostWithThread 取得、ページネーション伝播を検証
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	findAll: vi.fn(),
	updateIsBanned: vi.fn(),
	updateIsPremium: vi.fn(),
	updateLastIpHash: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findById: vi.fn(),
	findByThreadId: vi.fn(),
	findByAuthorId: vi.fn().mockResolvedValue([]),
	searchByAuthorId: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
	softDelete: vi.fn(),
	softDeleteByThreadId: vi.fn(),
	countByDate: vi.fn(),
	countActiveThreadsByDate: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/currency-repository", () => ({
	findByUserId: vi.fn(),
	create: vi.fn(),
	credit: vi.fn(),
	deduct: vi.fn(),
	getBalance: vi.fn().mockResolvedValue(0),
	sumAllBalances: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/daily-stats-repository", () => ({
	findByDate: vi.fn(),
	findByDateRange: vi.fn(),
	findLatest: vi.fn(),
	upsert: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	softDelete: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/ip-ban-repository", () => ({
	isBanned: vi.fn().mockResolvedValue(false),
	create: vi.fn(),
	deactivate: vi.fn(),
	listActive: vi.fn().mockResolvedValue([]),
	findById: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/services/currency-service", () => ({
	credit: vi.fn(),
	getBalance: vi.fn().mockResolvedValue(0),
	deduct: vi.fn(),
	initializeBalance: vi.fn(),
}));

vi.mock("@/lib/services/post-service", () => ({
	createPost: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import type { Post } from "@/lib/domain/models/post";
import type { User } from "@/lib/domain/models/user";
import * as CurrencyRepository from "@/lib/infrastructure/repositories/currency-repository";
import type { PostWithThread } from "@/lib/infrastructure/repositories/post-repository";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import {
	getUserDetail,
	getUserList,
	getUserPosts,
} from "@/lib/services/admin-service";
import * as CurrencyService from "@/lib/services/currency-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用 User ファクトリ */
function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: crypto.randomUUID(),
		authToken: "test-token",
		authorIdSeed: "test-seed",
		isPremium: false,
		isBanned: false,
		username: null,
		streakDays: 0,
		grassCount: 0,
		lastPostDate: null,
		lastIpHash: null,
		isVerified: true,
		supabaseAuthId: null,
		registrationType: null,
		registeredAt: null,
		patToken: null,
		patLastUsedAt: null,
		themeId: null,
		fontId: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		...overrides,
	};
}

/** テスト用 Post ファクトリ */
function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: crypto.randomUUID(),
		threadId: crypto.randomUUID(),
		postNumber: 1,
		authorId: crypto.randomUUID(),
		displayName: "名無しさん",
		dailyId: "testdly1",
		body: "テスト書き込み",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-01-15T12:00:00Z"),
		...overrides,
	};
}

/** テスト用 PostWithThread ファクトリ */
function makePostWithThread(
	overrides: Partial<PostWithThread> = {},
): PostWithThread {
	return {
		...makePost(overrides),
		threadTitle: overrides.threadTitle ?? "テストスレッド",
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AdminService getUserList", () => {
	// See: features/admin.feature @管理者がユーザー一覧を閲覧できる

	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系: 通貨残高の付加
	// =========================================================================

	describe("通貨残高（balance）の付加", () => {
		// See: features/admin.feature @各ユーザーのID、登録日時、ステータス、通貨残高が表示される

		it("各ユーザーに通貨残高（balance）フィールドが含まれる", async () => {
			// Arrange: 2人のユーザーを返すようモック設定
			const user1 = makeUser({ id: crypto.randomUUID() });
			const user2 = makeUser({ id: crypto.randomUUID() });
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user1, user2],
				total: 2,
			});
			// user1: 残高 100, user2: 残高 250
			vi.mocked(CurrencyRepository.getBalance)
				.mockResolvedValueOnce(100)
				.mockResolvedValueOnce(250);

			// Act
			const result = await getUserList();

			// Assert: 各ユーザーに balance が含まれる
			expect(result.users).toHaveLength(2);
			expect(result.users[0].balance).toBe(100);
			expect(result.users[1].balance).toBe(250);
			expect(result.total).toBe(2);
		});

		it("通貨残高が 0 のユーザーも balance: 0 として返される", async () => {
			const user = makeUser();
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user],
				total: 1,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0);

			const result = await getUserList();

			expect(result.users[0].balance).toBe(0);
			expect(typeof result.users[0].balance).toBe("number");
		});

		it("UserListItem に必要なフィールドが全て含まれる", async () => {
			// See: features/admin.feature @各ユーザーのID、登録日時、ステータス、通貨残高が表示される
			const userId = crypto.randomUUID();
			const user = makeUser({
				id: userId,
				createdAt: new Date("2026-02-15T10:00:00Z"),
				isBanned: false,
				isPremium: true,
				registrationType: "email",
				username: "testuser",
			});
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user],
				total: 1,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(500);

			const result = await getUserList();

			const item = result.users[0];
			expect(item.id).toBe(userId);
			expect(item.createdAt).toEqual(new Date("2026-02-15T10:00:00Z"));
			expect(item.isBanned).toBe(false);
			expect(item.isPremium).toBe(true);
			expect(item.registrationType).toBe("email");
			expect(item.username).toBe("testuser");
			expect(item.balance).toBe(500);
		});

		it("CurrencyRepository.getBalance が各ユーザーの ID で呼ばれる", async () => {
			const user1 = makeUser({ id: crypto.randomUUID() });
			const user2 = makeUser({ id: crypto.randomUUID() });
			const user3 = makeUser({ id: crypto.randomUUID() });
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user1, user2, user3],
				total: 3,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0);

			await getUserList();

			// 各ユーザーの ID で getBalance が呼ばれたことを確認
			expect(CurrencyRepository.getBalance).toHaveBeenCalledTimes(3);
			expect(CurrencyRepository.getBalance).toHaveBeenCalledWith(user1.id);
			expect(CurrencyRepository.getBalance).toHaveBeenCalledWith(user2.id);
			expect(CurrencyRepository.getBalance).toHaveBeenCalledWith(user3.id);
		});
	});

	// =========================================================================
	// 正常系: ページネーション
	// =========================================================================

	describe("ページネーション", () => {
		it("limit/offset オプションが UserRepository.findAll に渡される", async () => {
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [],
				total: 0,
			});

			await getUserList({ limit: 10, offset: 20 });

			expect(UserRepository.findAll).toHaveBeenCalledWith({
				limit: 10,
				offset: 20,
			});
		});

		it("orderBy オプションが UserRepository.findAll に渡される", async () => {
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [],
				total: 0,
			});

			await getUserList({ orderBy: "last_post_date" });

			expect(UserRepository.findAll).toHaveBeenCalledWith({
				orderBy: "last_post_date",
			});
		});

		it("オプション未指定時はデフォルトで呼び出される", async () => {
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [],
				total: 0,
			});

			await getUserList();

			expect(UserRepository.findAll).toHaveBeenCalledWith({});
		});
	});

	// =========================================================================
	// 境界値・エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("ユーザーが 0 人の場合は空配列と total: 0 を返す", async () => {
			// 空の配列 / 空文字列のエッジケース
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [],
				total: 0,
			});

			const result = await getUserList();

			expect(result.users).toEqual([]);
			expect(result.total).toBe(0);
			// getBalance は呼ばれない（ユーザーがいないため）
			expect(CurrencyRepository.getBalance).not.toHaveBeenCalled();
		});

		it("total がユーザー配列の件数より大きい場合（ページネーション時）", async () => {
			// ユーザー50人中の先頭2人を返す場合
			const user1 = makeUser();
			const user2 = makeUser();
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user1, user2],
				total: 50,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0);

			const result = await getUserList({ limit: 2, offset: 0 });

			expect(result.users).toHaveLength(2);
			expect(result.total).toBe(50);
		});

		it("BAN 済みユーザーの balance も正常に取得される", async () => {
			const bannedUser = makeUser({ isBanned: true });
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [bannedUser],
				total: 1,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(300);

			const result = await getUserList();

			expect(result.users[0].isBanned).toBe(true);
			expect(result.users[0].balance).toBe(300);
		});

		it("username が null のユーザーも正常に返される", async () => {
			// Null 入力のエッジケース
			const user = makeUser({ username: null });
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user],
				total: 1,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0);

			const result = await getUserList();

			expect(result.users[0].username).toBeNull();
		});

		it("registrationType が null（仮ユーザー）でも正常に返される", async () => {
			// Null 入力のエッジケース
			const user = makeUser({ registrationType: null });
			vi.mocked(UserRepository.findAll).mockResolvedValue({
				users: [user],
				total: 1,
			});
			vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0);

			const result = await getUserList();

			expect(result.users[0].registrationType).toBeNull();
		});
	});
});

describe("AdminService getUserDetail", () => {
	// See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
	// See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる

	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系: スレッド名付き書き込み履歴
	// =========================================================================

	describe("書き込み履歴にスレッド名（threadTitle）が含まれる", () => {
		// See: features/admin.feature @管理者画面でも各書き込みのスレッド名、本文、書き込み日時が含まれる

		it("getUserDetail の posts に threadTitle フィールドが含まれる", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({ id: userId });
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(100);

			const threadId = crypto.randomUUID();
			const postsWithThread: PostWithThread[] = [
				makePostWithThread({
					authorId: userId,
					threadId,
					threadTitle: "今日の雑談",
					postNumber: 1,
					body: "こんにちは",
				}),
				makePostWithThread({
					authorId: userId,
					threadId,
					threadTitle: "今日の雑談",
					postNumber: 2,
					body: "よろしく",
				}),
			];
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: postsWithThread,
				total: 2,
			});

			const result = await getUserDetail(userId);

			expect(result).not.toBeNull();
			expect(result!.posts).toHaveLength(2);
			expect(result!.posts[0].threadTitle).toBe("今日の雑談");
			expect(result!.posts[1].threadTitle).toBe("今日の雑談");
		});

		it("searchByAuthorId が userId, limit: 50, offset: 0 で呼ばれる", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({ id: userId });
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			await getUserDetail(userId);

			expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(userId, {
				limit: 50,
				offset: 0,
			});
		});

		it("複数スレッドの書き込みが混在する場合、各書き込みに正しい threadTitle が付く", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({ id: userId });
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(50);

			const thread1Id = crypto.randomUUID();
			const thread2Id = crypto.randomUUID();
			const posts: PostWithThread[] = [
				makePostWithThread({
					authorId: userId,
					threadId: thread1Id,
					threadTitle: "スレッドA",
					body: "Aへの書き込み",
				}),
				makePostWithThread({
					authorId: userId,
					threadId: thread2Id,
					threadTitle: "スレッドB",
					body: "Bへの書き込み",
				}),
				makePostWithThread({
					authorId: userId,
					threadId: thread1Id,
					threadTitle: "スレッドA",
					body: "Aへの2回目",
				}),
			];
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts,
				total: 3,
			});

			const result = await getUserDetail(userId);

			expect(result!.posts[0].threadTitle).toBe("スレッドA");
			expect(result!.posts[1].threadTitle).toBe("スレッドB");
			expect(result!.posts[2].threadTitle).toBe("スレッドA");
		});
	});

	// =========================================================================
	// 正常系: ユーザー基本情報 + 通貨残高
	// =========================================================================

	describe("ユーザー基本情報と通貨残高", () => {
		// See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる

		it("UserDetail に必要な全フィールドが含まれる", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({
				id: userId,
				isPremium: true,
				isBanned: false,
				username: "premiumuser",
				streakDays: 5,
				grassCount: 12,
				registrationType: "email",
				createdAt: new Date("2026-01-10T08:00:00Z"),
			});
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(999);
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			const result = await getUserDetail(userId);

			expect(result).toEqual({
				id: userId,
				createdAt: new Date("2026-01-10T08:00:00Z"),
				isBanned: false,
				isPremium: true,
				registrationType: "email",
				username: "premiumuser",
				streakDays: 5,
				grassCount: 12,
				balance: 999,
				posts: [],
			});
		});

		it("CurrencyService.getBalance が正しい userId で呼ばれる", async () => {
			const userId = crypto.randomUUID();
			vi.mocked(UserRepository.findById).mockResolvedValue(
				makeUser({ id: userId }),
			);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			await getUserDetail(userId);

			expect(CurrencyService.getBalance).toHaveBeenCalledWith(userId);
		});
	});

	// =========================================================================
	// 異常系・エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("存在しないユーザー ID の場合は null を返す", async () => {
			// Null/Undefined 入力のエッジケース
			vi.mocked(UserRepository.findById).mockResolvedValue(null);

			const result = await getUserDetail(crypto.randomUUID());

			expect(result).toBeNull();
			// ユーザーが見つからない場合、他のリポジトリは呼ばれない
			expect(CurrencyService.getBalance).not.toHaveBeenCalled();
			expect(PostRepository.searchByAuthorId).not.toHaveBeenCalled();
		});

		it("書き込みが 0 件のユーザーでも空配列が返される", async () => {
			// 空の配列のエッジケース
			const userId = crypto.randomUUID();
			vi.mocked(UserRepository.findById).mockResolvedValue(
				makeUser({ id: userId }),
			);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			const result = await getUserDetail(userId);

			expect(result!.posts).toEqual([]);
		});

		it("BAN 済みユーザーの詳細も取得できる", async () => {
			const userId = crypto.randomUUID();
			vi.mocked(UserRepository.findById).mockResolvedValue(
				makeUser({ id: userId, isBanned: true }),
			);
			vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			const result = await getUserDetail(userId);

			expect(result).not.toBeNull();
			expect(result!.isBanned).toBe(true);
		});
	});
});

describe("AdminService getUserPosts", () => {
	// See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる

	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系: スレッド名付き書き込み履歴の取得
	// =========================================================================

	describe("PostWithThread 配列（threadTitle 付き）の取得", () => {
		it("戻り値の各 post に threadTitle が含まれる", async () => {
			const userId = crypto.randomUUID();
			const posts: PostWithThread[] = [
				makePostWithThread({
					authorId: userId,
					threadTitle: "雑談スレ",
					body: "書き込み1",
				}),
				makePostWithThread({
					authorId: userId,
					threadTitle: "質問スレ",
					body: "書き込み2",
				}),
			];
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts,
				total: 2,
			});

			const result = await getUserPosts(userId);

			expect(result).toHaveLength(2);
			expect(result[0].threadTitle).toBe("雑談スレ");
			expect(result[1].threadTitle).toBe("質問スレ");
		});

		it("searchByAuthorId がデフォルトの limit: 50, offset: 0 で呼ばれる", async () => {
			const userId = crypto.randomUUID();
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			await getUserPosts(userId);

			expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(userId, {
				limit: 50,
				offset: 0,
			});
		});
	});

	// =========================================================================
	// 正常系: ページネーション
	// =========================================================================

	describe("ページネーション", () => {
		it("limit/offset オプションが searchByAuthorId に伝播される", async () => {
			// HIGH-003: offset をリポジトリに伝播してページネーションを機能させる
			const userId = crypto.randomUUID();
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			await getUserPosts(userId, { limit: 20, offset: 40 });

			expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(userId, {
				limit: 20,
				offset: 40,
			});
		});

		it("limit のみ指定時は offset がデフォルト 0 になる", async () => {
			const userId = crypto.randomUUID();
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			await getUserPosts(userId, { limit: 10 });

			expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(userId, {
				limit: 10,
				offset: 0,
			});
		});

		it("offset のみ指定時は limit がデフォルト 50 になる", async () => {
			const userId = crypto.randomUUID();
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			await getUserPosts(userId, { offset: 100 });

			expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(userId, {
				limit: 50,
				offset: 100,
			});
		});
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("書き込みが 0 件の場合は空配列を返す", async () => {
			// 空の配列のエッジケース
			const userId = crypto.randomUUID();
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts: [],
				total: 0,
			});

			const result = await getUserPosts(userId);

			expect(result).toEqual([]);
		});

		it("特殊文字を含むスレッドタイトルも正常に返される", async () => {
			// 特殊文字のエッジケース（Unicode、絵文字）
			const userId = crypto.randomUUID();
			const posts: PostWithThread[] = [
				makePostWithThread({
					authorId: userId,
					threadTitle: "絵文字テスト🔥🎉",
					body: "テスト",
				}),
			];
			vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
				posts,
				total: 1,
			});

			const result = await getUserPosts(userId);

			expect(result[0].threadTitle).toBe("絵文字テスト🔥🎉");
		});
	});
});
