/**
 * 単体テスト: AuthService — edge-token チャネル分離
 *
 * Sprint-150: verifyEdgeToken が channel を返すこと、
 * issueEdgeToken が channel を EdgeTokenRepository.create に渡すこと。
 *
 * See: tmp/edge_token_channel_separation_plan.md
 *
 * テスト方針:
 *   - 外部依存はすべてモック化する
 *   - verifyEdgeToken が EdgeToken.channel を正しく戻り値に含めることを検証する
 *   - issueEdgeToken が channel 引数を EdgeTokenRepository.create に伝播することを検証する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言（vi.hoisted でファクトリ内から参照可能にする）
// ---------------------------------------------------------------------------

const {
	mockFindByToken,
	mockCreate,
	mockFindById,
	mockIsBanned,
	mockUserCreate,
	mockInitializeBalance,
} = vi.hoisted(() => ({
	mockFindByToken: vi.fn(),
	mockCreate: vi.fn(),
	mockFindById: vi.fn(),
	mockIsBanned: vi.fn(),
	mockUserCreate: vi.fn(),
	mockInitializeBalance: vi.fn(),
}));

vi.mock(
	"../../../lib/infrastructure/repositories/edge-token-repository",
	() => ({
		findByToken: mockFindByToken,
		create: mockCreate,
	}),
);

vi.mock("../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: mockFindById,
	create: mockUserCreate,
}));

vi.mock("../../../lib/infrastructure/repositories/ip-ban-repository", () => ({
	isBanned: mockIsBanned,
}));

vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {},
}));

vi.mock("../../../lib/services/currency-service", () => ({
	initializeBalance: mockInitializeBalance,
}));

vi.mock("../../../lib/infrastructure/external/turnstile-client", () => ({
	verifyTurnstileToken: vi.fn(),
}));

vi.mock(
	"../../../lib/infrastructure/repositories/auth-code-repository",
	() => ({
		create: vi.fn(),
		findByTokenId: vi.fn(),
		markVerified: vi.fn(),
		findByWriteToken: vi.fn(),
		clearWriteToken: vi.fn(),
		deleteUnverifiedByTokenId: vi.fn(),
		updateWriteToken: vi.fn(),
	}),
);

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------

import {
	getLayoutAuthStatus,
	issueEdgeToken,
	verifyEdgeToken,
} from "../../../lib/services/auth-service";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AuthService -- channel separation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// verifyEdgeToken -- channel in return value
	// =========================================================================

	describe("verifyEdgeToken", () => {
		it("web channel token returns channel='web'", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.4
			mockFindByToken.mockResolvedValue({
				id: "et-001",
				userId: "user-001",
				token: "test-token",
				channel: "web",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockFindById.mockResolvedValue({
				id: "user-001",
				authorIdSeed: "seed-hash",
				isVerified: true,
				isBanned: false,
			});

			const result = await verifyEdgeToken("test-token", "ip-hash");

			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.channel).toBe("web");
				expect(result.userId).toBe("user-001");
				expect(result.authorIdSeed).toBe("seed-hash");
			}
		});

		it("senbra channel token returns channel='senbra'", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.4
			mockFindByToken.mockResolvedValue({
				id: "et-002",
				userId: "user-002",
				token: "senbra-token",
				channel: "senbra",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockFindById.mockResolvedValue({
				id: "user-002",
				authorIdSeed: "seed-hash-2",
				isVerified: true,
				isBanned: false,
			});

			const result = await verifyEdgeToken("senbra-token", "ip-hash");

			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.channel).toBe("senbra");
			}
		});

		it("returns valid=false when token is not found", async () => {
			mockFindByToken.mockResolvedValue(null);

			const result = await verifyEdgeToken("invalid-token", "ip-hash");

			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.reason).toBe("not_found");
			}
		});

		it("returns valid=false when user is not verified", async () => {
			mockFindByToken.mockResolvedValue({
				id: "et-003",
				userId: "user-003",
				token: "unverified-token",
				channel: "web",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockFindById.mockResolvedValue({
				id: "user-003",
				authorIdSeed: "seed-hash-3",
				isVerified: false,
				isBanned: false,
			});

			const result = await verifyEdgeToken("unverified-token", "ip-hash");

			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.reason).toBe("not_verified");
			}
		});
	});

	// =========================================================================
	// issueEdgeToken -- channel propagation to EdgeTokenRepository.create
	// =========================================================================

	describe("issueEdgeToken", () => {
		it("passes channel='web' to EdgeTokenRepository.create", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.3
			mockIsBanned.mockResolvedValue(false);
			mockUserCreate.mockResolvedValue({
				id: "new-user-001",
				authToken: "generated-token",
				authorIdSeed: "ip-hash",
			});
			mockCreate.mockResolvedValue({
				id: "et-new",
				userId: "new-user-001",
				token: "generated-token",
				channel: "web",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockInitializeBalance.mockResolvedValue(undefined);

			await issueEdgeToken("ip-hash", "web");

			expect(mockCreate).toHaveBeenCalledWith(
				"new-user-001",
				expect.any(String),
				"web",
			);
		});

		it("passes channel='senbra' to EdgeTokenRepository.create", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.3
			mockIsBanned.mockResolvedValue(false);
			mockUserCreate.mockResolvedValue({
				id: "new-user-002",
				authToken: "generated-token-2",
				authorIdSeed: "ip-hash",
			});
			mockCreate.mockResolvedValue({
				id: "et-new-2",
				userId: "new-user-002",
				token: "generated-token-2",
				channel: "senbra",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockInitializeBalance.mockResolvedValue(undefined);

			await issueEdgeToken("ip-hash", "senbra");

			expect(mockCreate).toHaveBeenCalledWith(
				"new-user-002",
				expect.any(String),
				"senbra",
			);
		});

		it("defaults to channel='web' when not specified", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.3
			mockIsBanned.mockResolvedValue(false);
			mockUserCreate.mockResolvedValue({
				id: "new-user-003",
				authToken: "generated-token-3",
				authorIdSeed: "ip-hash",
			});
			mockCreate.mockResolvedValue({
				id: "et-new-3",
				userId: "new-user-003",
				token: "generated-token-3",
				channel: "web",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockInitializeBalance.mockResolvedValue(undefined);

			await issueEdgeToken("ip-hash");

			expect(mockCreate).toHaveBeenCalledWith(
				"new-user-003",
				expect.any(String),
				"web",
			);
		});
	});

	// =========================================================================
	// getLayoutAuthStatus -- channel-aware layout state
	// =========================================================================

	describe("getLayoutAuthStatus", () => {
		it("senbra channel token でも channel を含めて返し、layout 側で判定できる", async () => {
			mockFindByToken.mockResolvedValue({
				id: "et-layout-001",
				userId: "user-layout-001",
				token: "layout-token",
				channel: "senbra",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});
			mockFindById.mockResolvedValue({
				id: "user-layout-001",
				isVerified: true,
				supabaseAuthId: "supabase-auth-001",
			});

			const result = await getLayoutAuthStatus("layout-token");

			expect(result).toEqual({
				isAuthenticated: true,
				isRegistered: true,
				channel: "senbra",
			});
		});

		it("token が見つからない場合は channel=null の未認証を返す", async () => {
			mockFindByToken.mockResolvedValue(null);

			const result = await getLayoutAuthStatus("missing-token");

			expect(result).toEqual({
				isAuthenticated: false,
				isRegistered: false,
				channel: null,
			});
		});
	});
});
