/**
 * 単体テスト: POST /api/auth/register/discord
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 * See: docs/architecture/components/user-registration.md §7.2 Discord連携
 *
 * テスト方針:
 *   - RegistrationService と AuthService はモック化して外部依存を排除する
 *   - edge-token Cookie 認証フローと Discord OAuth URL 返却を検証する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - 正常系: edge-token認証OK → registerWithDiscord呼び出し → redirectUrl返却
 *   - 未認証（Cookie なし）→ 401
 *   - 認証失敗（無効なedge-token）→ 401
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const { mockRegistrationService, mockAuthService, mockCookies } = vi.hoisted(
	() => {
		const mockRegistrationService = {
			registerWithDiscord: vi.fn(),
		};

		const mockAuthService = {
			verifyEdgeToken: vi.fn(),
		};

		const mockCookies = vi.fn();

		return { mockRegistrationService, mockAuthService, mockCookies };
	},
);

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/registration-service", () => ({
	registerWithDiscord: (...args: unknown[]) =>
		mockRegistrationService.registerWithDiscord(...args),
}));

vi.mock("@/lib/services/auth-service", () => ({
	verifyEdgeToken: (...args: unknown[]) =>
		mockAuthService.verifyEdgeToken(...args),
}));

vi.mock("next/headers", () => ({
	cookies: () => mockCookies(),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { POST } from "../../../../../app/api/auth/register/discord/route";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";
const EDGE_TOKEN = "test-edge-token-uuid";
const USER_ID = "user-uuid-001";
const DISCORD_OAUTH_URL =
	"https://discord.com/oauth/authorize?client_id=xxx&state=yyy";

/** テスト用 NextRequest を生成する */
function createRequest(): NextRequest {
	return new NextRequest(`${ORIGIN}/api/auth/register/discord`, {
		method: "POST",
	});
}

/** edge-token Cookie ありの cookieStore モックを設定する */
function setupCookieWithEdgeToken(token: string = EDGE_TOKEN): void {
	mockCookies.mockResolvedValue({
		get: (name: string) =>
			name === "edge-token" ? { value: token } : undefined,
	});
}

/** edge-token Cookie なしの cookieStore モックを設定する */
function setupCookieWithoutEdgeToken(): void {
	mockCookies.mockResolvedValue({
		get: (_name: string) => undefined,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/register/discord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルト: Cookie なし
		setupCookieWithoutEdgeToken();
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	describe("正常系", () => {
		it("edge-token 認証OK → registerWithDiscord を呼び出し redirectUrl を返す", async () => {
			// See: docs/architecture/components/user-registration.md §7.2 Discord連携
			// registerWithDiscord は同期関数（PKCE は Node.js crypto で直接生成）
			setupCookieWithEdgeToken(EDGE_TOKEN);
			mockAuthService.verifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				authorIdSeed: "seed-001",
			});
			mockRegistrationService.registerWithDiscord.mockReturnValue({
				redirectUrl: DISCORD_OAUTH_URL,
				codeVerifier: "test-code-verifier",
			});

			const response = await POST(createRequest());
			const body = (await response.json()) as {
				success: boolean;
				redirectUrl: string;
			};

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.redirectUrl).toBe(DISCORD_OAUTH_URL);
		});

		it("registerWithDiscord に正しい redirectTo が渡される", async () => {
			// redirectTo は `${origin}/api/auth/callback?flow=register&userId=${userId}` の形式
			// See: docs/architecture/components/user-registration.md §7.2 Discord連携
			setupCookieWithEdgeToken(EDGE_TOKEN);
			mockAuthService.verifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				authorIdSeed: "seed-001",
			});
			mockRegistrationService.registerWithDiscord.mockReturnValue({
				redirectUrl: DISCORD_OAUTH_URL,
				codeVerifier: "test-code-verifier",
			});

			await POST(createRequest());

			const expectedRedirectTo = `${ORIGIN}/api/auth/callback?flow=register&userId=${USER_ID}`;
			expect(mockRegistrationService.registerWithDiscord).toHaveBeenCalledWith(
				expectedRedirectTo,
			);
		});
	});

	// =========================================================================
	// 未認証（Cookie なし）
	// =========================================================================

	describe("未認証（Cookie なし）", () => {
		it("edge-token Cookie なし → 401 を返す", async () => {
			// setupCookieWithoutEdgeToken は beforeEach で設定済み
			const response = await POST(createRequest());
			const body = (await response.json()) as {
				success: boolean;
				error: string;
			};

			expect(response.status).toBe(401);
			expect(body.success).toBe(false);
			expect(body.error).toBeDefined();
			expect(
				mockRegistrationService.registerWithDiscord,
			).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 認証失敗（無効な edge-token）
	// =========================================================================

	describe("認証失敗（無効な edge-token）", () => {
		it("無効な edge-token → 401 を返す", async () => {
			setupCookieWithEdgeToken("invalid-edge-token");
			mockAuthService.verifyEdgeToken.mockResolvedValue({
				valid: false,
				reason: "not_found",
			});

			const response = await POST(createRequest());
			const body = (await response.json()) as {
				success: boolean;
				error: string;
			};

			expect(response.status).toBe(401);
			expect(body.success).toBe(false);
			expect(body.error).toBeDefined();
			expect(
				mockRegistrationService.registerWithDiscord,
			).not.toHaveBeenCalled();
		});

		it("is_verified=false の edge-token → 401 を返す", async () => {
			setupCookieWithEdgeToken("unverified-edge-token");
			mockAuthService.verifyEdgeToken.mockResolvedValue({
				valid: false,
				reason: "not_verified",
			});

			const response = await POST(createRequest());
			const body = (await response.json()) as {
				success: boolean;
				error: string;
			};

			expect(response.status).toBe(401);
			expect(body.success).toBe(false);
			expect(
				mockRegistrationService.registerWithDiscord,
			).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 異常系（Service例外）
	// =========================================================================

	describe("異常系（Service例外）", () => {
		it("registerWithDiscord がエラーをスローした場合は 500 を返す", async () => {
			// Service 例外がルートハンドラの try-catch で捕捉され、500 が返ること
			setupCookieWithEdgeToken(EDGE_TOKEN);
			mockAuthService.verifyEdgeToken.mockResolvedValue({
				valid: true,
				userId: USER_ID,
				authorIdSeed: "seed-001",
			});
			// registerWithDiscord は同期関数なので mockImplementation でスローする
			mockRegistrationService.registerWithDiscord.mockImplementation(() => {
				throw new Error(
					"RegistrationService.registerWithDiscord failed: discord error",
				);
			});

			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const response = await POST(createRequest());
			const body = (await response.json()) as {
				success: boolean;
				error: string;
			};

			expect(response.status).toBe(500);
			expect(body.success).toBe(false);
			expect(body.error).toBe("Discord本登録の開始に失敗しました");

			consoleSpy.mockRestore();
		});
	});
});
