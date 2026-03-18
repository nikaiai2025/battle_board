/**
 * 単体テスト: POST /api/auth/login/discord
 *
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 * See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
 *
 * テスト方針:
 *   - RegistrationService はモック化して外部依存を排除する
 *   - 認証チェック不要（新デバイスからのログインのため）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - 正常系: loginWithDiscord呼び出し → redirectUrl返却
 *   - Service例外 → 500
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const { mockRegistrationService } = vi.hoisted(() => {
	const mockRegistrationService = {
		loginWithDiscord: vi.fn(),
	};

	return { mockRegistrationService };
});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/registration-service", () => ({
	loginWithDiscord: (...args: unknown[]) =>
		mockRegistrationService.loginWithDiscord(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { POST } from "../../../../../app/api/auth/login/discord/route";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";
const DISCORD_OAUTH_URL =
	"https://discord.com/oauth/authorize?client_id=xxx&state=zzz";

/** テスト用 NextRequest を生成する */
function createRequest(): NextRequest {
	return new NextRequest(`${ORIGIN}/api/auth/login/discord`, {
		method: "POST",
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/login/discord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	describe("正常系", () => {
		it("loginWithDiscord を呼び出し redirectUrl を返す", async () => {
			// See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
			mockRegistrationService.loginWithDiscord.mockResolvedValue({
				redirectUrl: DISCORD_OAUTH_URL,
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

		it("loginWithDiscord に正しい redirectTo が渡される", async () => {
			// redirectTo は `${origin}/api/auth/callback?flow=login` の形式
			// See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
			mockRegistrationService.loginWithDiscord.mockResolvedValue({
				redirectUrl: DISCORD_OAUTH_URL,
			});

			await POST(createRequest());

			const expectedRedirectTo = `${ORIGIN}/api/auth/callback?flow=login`;
			expect(mockRegistrationService.loginWithDiscord).toHaveBeenCalledWith(
				expectedRedirectTo,
			);
		});

		it("認証チェックなしで呼び出せる（新デバイスからのログインのため）", async () => {
			// ログインは edge-token なし（新デバイス）のケースが多いため認証チェック不要
			// See: docs/architecture/components/user-registration.md §12 新規APIルート（注意）
			mockRegistrationService.loginWithDiscord.mockResolvedValue({
				redirectUrl: DISCORD_OAUTH_URL,
			});

			// Cookie なしでもリクエストが通ること
			const response = await POST(createRequest());

			expect(response.status).toBe(200);
		});
	});

	// =========================================================================
	// 異常系（Service例外）
	// =========================================================================

	describe("異常系（Service例外）", () => {
		it("loginWithDiscord がエラーをスローした場合は 500 を返す", async () => {
			mockRegistrationService.loginWithDiscord.mockRejectedValue(
				new Error("RegistrationService.loginWithDiscord failed: discord error"),
			);

			await expect(POST(createRequest())).rejects.toThrow();
		});
	});
});
