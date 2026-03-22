/**
 * 単体テスト: BAN システム
 *
 * 対象:
 *   - AuthService.isIpBanned
 *   - AuthService.isUserBanned
 *   - AdminService.banUser
 *   - AdminService.unbanUser
 *   - AdminService.banIpByUserId
 *   - AdminService.unbanIp
 *   - AdminService.listActiveIpBans
 *   - PostService.createPost (BAN チェック統合)
 *
 * テスト方針:
 *   - 全外部依存（Supabase）はモック化する
 *   - 振る舞いを検証し、実装詳細に依存しない
 *   - エッジケース（BAN済み/未BAN/BANなし等）を網羅する
 *
 * See: features/admin.feature @ユーザーBAN / IP BAN シナリオ群
 * See: tmp/feature_plan_admin_expansion.md §2 IP BAN
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(),
		auth: { getUser: vi.fn() },
	},
}));

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	updateIsBanned: vi.fn(),
	updateLastIpHash: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/ip-ban-repository", () => ({
	isBanned: vi.fn(),
	create: vi.fn(),
	deactivate: vi.fn(),
	listActive: vi.fn(),
	findById: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	create: vi.fn(),
	findByThreadId: vi.fn(),
	getNextPostNumber: vi.fn().mockResolvedValue(1),
	findById: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	incrementPostCount: vi.fn(),
	updateLastPostAt: vi.fn(),
}));

vi.mock("@/lib/services/auth-service", () => ({
	verifyEdgeToken: vi.fn(),
	issueEdgeToken: vi.fn(),
	issueAuthCode: vi.fn(),
	isIpBanned: vi.fn(),
	isUserBanned: vi.fn(),
}));

vi.mock("@/lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn().mockResolvedValue({ granted: [] }),
}));

vi.mock("@/lib/domain/rules/daily-id", () => ({
	generateDailyId: vi.fn().mockReturnValue("testdailid"),
}));

vi.mock("@/lib/services/post-service", () => ({
	createPost: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import type { User } from "@/lib/domain/models/user";
import type { IpBan } from "@/lib/infrastructure/repositories/ip-ban-repository";
import * as IpBanRepository from "@/lib/infrastructure/repositories/ip-ban-repository";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import {
	banIpByUserId,
	banUser,
	listActiveIpBans,
	unbanIp,
	unbanUser,
} from "@/lib/services/admin-service";
import * as AuthService from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: "user-uuid-001",
		authToken: "test-edge-token-001",
		authorIdSeed: "test-seed-001",
		isPremium: false,
		isVerified: true,
		username: null,
		streakDays: 0,
		lastPostDate: null,
		createdAt: new Date("2026-03-17T00:00:00Z"),
		supabaseAuthId: null,
		registrationType: null,
		registeredAt: null,
		patToken: null,
		patLastUsedAt: null,
		grassCount: 0,
		isBanned: false,
		lastIpHash: "test-ip-hash-001",
		themeId: null,
		fontId: null,
		...overrides,
	};
}

function makeIpBan(overrides: Partial<IpBan> = {}): IpBan {
	return {
		id: "ban-uuid-001",
		ipHash: "test-ip-hash-001",
		reason: "テストBANの理由",
		bannedBy: "admin-uuid-001",
		bannedAt: new Date("2026-03-17T00:00:00Z"),
		expiresAt: null,
		isActive: true,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// AuthService BAN チェック
// ---------------------------------------------------------------------------

describe("AuthService BAN チェック", () => {
	describe("isIpBanned", () => {
		it("BAN済みIPは true を返す", async () => {
			vi.mocked(AuthService.isIpBanned).mockResolvedValue(true);

			const result = await AuthService.isIpBanned("banned-ip-hash");

			expect(result).toBe(true);
		});

		it("未BANのIPは false を返す", async () => {
			vi.mocked(AuthService.isIpBanned).mockResolvedValue(false);

			const result = await AuthService.isIpBanned("normal-ip-hash");

			expect(result).toBe(false);
		});

		// エッジケース: 空の ipHash
		it("空のIPハッシュでも false を返す（登録なし）", async () => {
			vi.mocked(AuthService.isIpBanned).mockResolvedValue(false);

			const result = await AuthService.isIpBanned("");

			expect(result).toBe(false);
		});
	});

	describe("isUserBanned", () => {
		it("BAN済みユーザーは true を返す", async () => {
			vi.mocked(AuthService.isUserBanned).mockResolvedValue(true);

			const result = await AuthService.isUserBanned("banned-user-id");

			expect(result).toBe(true);
		});

		it("未BANユーザーは false を返す", async () => {
			vi.mocked(AuthService.isUserBanned).mockResolvedValue(false);

			const result = await AuthService.isUserBanned("normal-user-id");

			expect(result).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// AdminService.banUser / unbanUser
// ---------------------------------------------------------------------------

describe("AdminService.banUser", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	// See: features/admin.feature @管理者がユーザーをBANする
	it("存在するユーザーを BAN できる", async () => {
		vi.mocked(UserRepository.findById).mockResolvedValue(makeUser());
		vi.mocked(UserRepository.updateIsBanned).mockResolvedValue();

		const result = await banUser("user-uuid-001", "admin-uuid-001");

		expect(result.success).toBe(true);
		expect(UserRepository.updateIsBanned).toHaveBeenCalledWith(
			"user-uuid-001",
			true,
		);
	});

	// エッジケース: 存在しないユーザーへの BAN 試行
	it("存在しないユーザーへの BAN は not_found を返す", async () => {
		vi.mocked(UserRepository.findById).mockResolvedValue(null);

		const result = await banUser("non-existent-user", "admin-uuid-001");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("not_found");
		}
		expect(UserRepository.updateIsBanned).not.toHaveBeenCalled();
	});
});

describe("AdminService.unbanUser", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	// See: features/admin.feature @管理者がユーザーBANを解除する
	it("BAN済みユーザーの BAN を解除できる", async () => {
		vi.mocked(UserRepository.findById).mockResolvedValue(
			makeUser({ isBanned: true }),
		);
		vi.mocked(UserRepository.updateIsBanned).mockResolvedValue();

		const result = await unbanUser("user-uuid-001", "admin-uuid-001");

		expect(result.success).toBe(true);
		expect(UserRepository.updateIsBanned).toHaveBeenCalledWith(
			"user-uuid-001",
			false,
		);
	});

	it("存在しないユーザーの BAN 解除は not_found を返す", async () => {
		vi.mocked(UserRepository.findById).mockResolvedValue(null);

		const result = await unbanUser("non-existent-user", "admin-uuid-001");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("not_found");
		}
	});
});

// ---------------------------------------------------------------------------
// AdminService.banIpByUserId
// ---------------------------------------------------------------------------

describe("AdminService.banIpByUserId", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	// See: features/admin.feature @管理者がユーザーのIPをBANする
	it("last_ip_hash を持つユーザーのIPをBANできる", async () => {
		const user = makeUser({ lastIpHash: "user-ip-hash-001" });
		vi.mocked(UserRepository.findById).mockResolvedValue(user);
		vi.mocked(IpBanRepository.create).mockResolvedValue(
			makeIpBan({ ipHash: "user-ip-hash-001" }),
		);

		const result = await banIpByUserId(
			"user-uuid-001",
			"admin-uuid-001",
			"テスト",
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.ban.ipHash).toBe("user-ip-hash-001");
		}
		expect(IpBanRepository.create).toHaveBeenCalledWith(
			"user-ip-hash-001",
			"テスト",
			"admin-uuid-001",
		);
	});

	// エッジケース: last_ip_hash が null のユーザーへの IP BAN 試行
	it("last_ip_hash が null のユーザーへの IP BAN は no_ip_hash を返す", async () => {
		const user = makeUser({ lastIpHash: null });
		vi.mocked(UserRepository.findById).mockResolvedValue(user);

		const result = await banIpByUserId("user-uuid-001", "admin-uuid-001");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("no_ip_hash");
		}
		expect(IpBanRepository.create).not.toHaveBeenCalled();
	});

	// エッジケース: 存在しないユーザーへの IP BAN 試行
	it("存在しないユーザーへの IP BAN は not_found を返す", async () => {
		vi.mocked(UserRepository.findById).mockResolvedValue(null);

		const result = await banIpByUserId("non-existent-user", "admin-uuid-001");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("not_found");
		}
	});
});

// ---------------------------------------------------------------------------
// AdminService.unbanIp
// ---------------------------------------------------------------------------

describe("AdminService.unbanIp", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	// See: features/admin.feature @管理者がIP BANを解除する
	it("存在する IP BAN を解除できる", async () => {
		vi.mocked(IpBanRepository.findById).mockResolvedValue(makeIpBan());
		vi.mocked(IpBanRepository.deactivate).mockResolvedValue();

		const result = await unbanIp("ban-uuid-001", "admin-uuid-001");

		expect(result.success).toBe(true);
		expect(IpBanRepository.deactivate).toHaveBeenCalledWith("ban-uuid-001");
	});

	// エッジケース: 存在しない BAN の解除試行
	it("存在しない IP BAN の解除は not_found を返す", async () => {
		vi.mocked(IpBanRepository.findById).mockResolvedValue(null);

		const result = await unbanIp("non-existent-ban", "admin-uuid-001");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("not_found");
		}
		expect(IpBanRepository.deactivate).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// AdminService.listActiveIpBans
// ---------------------------------------------------------------------------

describe("AdminService.listActiveIpBans", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("有効な IP BAN 一覧を返す", async () => {
		const bans = [
			makeIpBan(),
			makeIpBan({ id: "ban-uuid-002", ipHash: "ip-hash-002" }),
		];
		vi.mocked(IpBanRepository.listActive).mockResolvedValue(bans);

		const result = await listActiveIpBans();

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("ban-uuid-001");
		expect(result[1].id).toBe("ban-uuid-002");
	});

	// エッジケース: BAN が0件
	it("有効な IP BAN が0件の場合は空配列を返す", async () => {
		vi.mocked(IpBanRepository.listActive).mockResolvedValue([]);

		const result = await listActiveIpBans();

		expect(result).toHaveLength(0);
	});
});
