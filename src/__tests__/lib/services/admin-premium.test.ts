/**
 * 単体テスト: AdminService 課金ステータス管理機能
 *
 * setPremiumStatus の振る舞いを検証する。
 * ユーザーの有料/無料フラグ切り替えと境界条件・異常系を網羅する。
 *
 * See: features/admin.feature @管理者がユーザーを有料ステータスに変更する
 * See: features/admin.feature @管理者がユーザーを無料ステータスに変更する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	findAll: vi.fn(),
	updateIsPremium: vi.fn(),
	updateIsBanned: vi.fn(),
	updateLastIpHash: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findById: vi.fn(),
	findByThreadId: vi.fn(),
	findByAuthorId: vi.fn().mockResolvedValue([]),
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

import type { User } from "@/lib/domain/models/user";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import { setPremiumStatus } from "@/lib/services/admin-service";

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

/** テスト用管理者 ID */
const TEST_ADMIN_ID = crypto.randomUUID();

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AdminService setPremiumStatus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系: 有料ステータスへの変更
	// =========================================================================

	describe("有料ステータスへの変更（isPremium=true）", () => {
		// See: features/admin.feature @管理者がユーザーを有料ステータスに変更する

		it("無料ユーザーを有料ステータスに変更できる", async () => {
			// See: features/admin.feature @管理者がユーザーを有料ステータスに変更する
			const userId = crypto.randomUUID();
			const freeUser = makeUser({ id: userId, isPremium: false });
			vi.mocked(UserRepository.findById).mockResolvedValue(freeUser);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			const result = await setPremiumStatus(userId, true, TEST_ADMIN_ID);

			expect(result.success).toBe(true);
			expect(UserRepository.findById).toHaveBeenCalledWith(userId);
			expect(UserRepository.updateIsPremium).toHaveBeenCalledWith(userId, true);
		});

		it("既に有料ユーザーを有料ステータスに変更しても成功する（冪等性）", async () => {
			const userId = crypto.randomUUID();
			const premiumUser = makeUser({ id: userId, isPremium: true });
			vi.mocked(UserRepository.findById).mockResolvedValue(premiumUser);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			const result = await setPremiumStatus(userId, true, TEST_ADMIN_ID);

			expect(result.success).toBe(true);
			expect(UserRepository.updateIsPremium).toHaveBeenCalledWith(userId, true);
		});
	});

	// =========================================================================
	// 正常系: 無料ステータスへの変更
	// =========================================================================

	describe("無料ステータスへの変更（isPremium=false）", () => {
		// See: features/admin.feature @管理者がユーザーを無料ステータスに変更する

		it("有料ユーザーを無料ステータスに変更できる", async () => {
			// See: features/admin.feature @管理者がユーザーを無料ステータスに変更する
			const userId = crypto.randomUUID();
			const premiumUser = makeUser({ id: userId, isPremium: true });
			vi.mocked(UserRepository.findById).mockResolvedValue(premiumUser);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			const result = await setPremiumStatus(userId, false, TEST_ADMIN_ID);

			expect(result.success).toBe(true);
			expect(UserRepository.findById).toHaveBeenCalledWith(userId);
			expect(UserRepository.updateIsPremium).toHaveBeenCalledWith(
				userId,
				false,
			);
		});

		it("既に無料ユーザーを無料ステータスに変更しても成功する（冪等性）", async () => {
			const userId = crypto.randomUUID();
			const freeUser = makeUser({ id: userId, isPremium: false });
			vi.mocked(UserRepository.findById).mockResolvedValue(freeUser);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			const result = await setPremiumStatus(userId, false, TEST_ADMIN_ID);

			expect(result.success).toBe(true);
			expect(UserRepository.updateIsPremium).toHaveBeenCalledWith(
				userId,
				false,
			);
		});
	});

	// =========================================================================
	// 異常系: ユーザーが存在しない
	// =========================================================================

	describe("異常系: ユーザーが存在しない", () => {
		it("存在しないユーザーを有料化しようとすると not_found を返す", async () => {
			const nonExistentId = crypto.randomUUID();
			vi.mocked(UserRepository.findById).mockResolvedValue(null);

			const result = await setPremiumStatus(nonExistentId, true, TEST_ADMIN_ID);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason).toBe("not_found");
			}
			// updateIsPremium は呼ばれないこと
			expect(UserRepository.updateIsPremium).not.toHaveBeenCalled();
		});

		it("存在しないユーザーを無料化しようとすると not_found を返す", async () => {
			const nonExistentId = crypto.randomUUID();
			vi.mocked(UserRepository.findById).mockResolvedValue(null);

			const result = await setPremiumStatus(
				nonExistentId,
				false,
				TEST_ADMIN_ID,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason).toBe("not_found");
			}
			// updateIsPremium は呼ばれないこと
			expect(UserRepository.updateIsPremium).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 依存関係の検証
	// =========================================================================

	describe("依存関係の検証", () => {
		it("ユーザー存在確認で findById が呼ばれる", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({ id: userId });
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			await setPremiumStatus(userId, true, TEST_ADMIN_ID);

			expect(UserRepository.findById).toHaveBeenCalledTimes(1);
			expect(UserRepository.findById).toHaveBeenCalledWith(userId);
		});

		it("adminId は戻り値に含まれない（信頼済み前提のため）", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({ id: userId });
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			const result = await setPremiumStatus(userId, true, TEST_ADMIN_ID);

			// 成功時は { success: true } のみ返す
			expect(result).toEqual({ success: true });
		});
	});

	// =========================================================================
	// エッジケース: BANされたユーザーの扱い
	// =========================================================================

	describe("エッジケース", () => {
		it("BANされたユーザーでも有料ステータスに変更できる（BAN状態は独立）", async () => {
			// 課金ステータスとBANステータスは独立した概念のため、
			// BANユーザーであっても isPremium の変更は成功する
			const userId = crypto.randomUUID();
			const bannedUser = makeUser({
				id: userId,
				isBanned: true,
				isPremium: false,
			});
			vi.mocked(UserRepository.findById).mockResolvedValue(bannedUser);
			vi.mocked(UserRepository.updateIsPremium).mockResolvedValue();

			const result = await setPremiumStatus(userId, true, TEST_ADMIN_ID);

			expect(result.success).toBe(true);
			expect(UserRepository.updateIsPremium).toHaveBeenCalledWith(userId, true);
		});

		it("リポジトリエラー時は例外が伝播する", async () => {
			const userId = crypto.randomUUID();
			const user = makeUser({ id: userId });
			vi.mocked(UserRepository.findById).mockResolvedValue(user);
			vi.mocked(UserRepository.updateIsPremium).mockRejectedValue(
				new Error("Database error"),
			);

			await expect(
				setPremiumStatus(userId, true, TEST_ADMIN_ID),
			).rejects.toThrow("Database error");
		});
	});
});
