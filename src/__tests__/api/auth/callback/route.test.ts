/**
 * 単体テスト: GET /api/auth/callback
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md §7.1, §7.2, §7.3 フロー詳細
 *
 * テスト方針:
 *   - RegistrationService と AuthService はモック化して外部依存を排除する
 *   - フロー判定ロジック（flow パラメータによる分岐）と Cookie 設定を検証する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - Discord本登録フロー: code + flow=register + userId → handleOAuthCallback呼び出し → リダイレクト + Cookie設定
 *   - Discordログインフロー: code + flow=login → handleOAuthCallback呼び出し → リダイレクト + Cookie設定
 *   - メール確認フロー: code + flow=email_confirm + userId → handleOAuthCallback呼び出し
 *   - codeなし → エラーリダイレクト
 *   - handleOAuthCallback失敗 → エラーリダイレクト
 *   - email_confirm で userId なし → ログインフローにフォールスルー
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const { mockRegistrationService } = vi.hoisted(() => {
	const mockRegistrationService = {
		handleOAuthCallback: vi.fn(),
	};

	return { mockRegistrationService };
});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/registration-service", () => ({
	handleOAuthCallback: (...args: unknown[]) =>
		mockRegistrationService.handleOAuthCallback(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { GET } from "../../../../app/api/auth/callback/route";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";
const USER_ID = "user-uuid-001";
const NEW_EDGE_TOKEN = "new-edge-token-uuid";

/** テスト用 NextRequest を生成する */
function createRequest(params: Record<string, string>): NextRequest {
	const url = new URL(`${ORIGIN}/api/auth/callback`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return new NextRequest(url.toString());
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/auth/callback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// code パラメータなし（共通エラー処理）
	// =========================================================================

	describe("code パラメータなし", () => {
		it("異常系: /auth/error にリダイレクトする", async () => {
			const req = createRequest({ flow: "login" });

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
			expect(
				mockRegistrationService.handleOAuthCallback,
			).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Discord本登録フロー (flow=register + userId)
	// =========================================================================

	describe("Discord本登録フロー (flow=register + userId)", () => {
		it("正常: handleOAuthCallback(code, userId) を呼び出し、/mypage にリダイレクトして Cookie を設定する", async () => {
			// See: docs/architecture/components/user-registration.md §7.2 Discord連携
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});

			const req = createRequest({
				code: "oauth-code-abc",
				flow: "register",
				userId: USER_ID,
			});

			const response = await GET(req);

			// handleOAuthCallback が code と userId で呼ばれることを確認
			expect(mockRegistrationService.handleOAuthCallback).toHaveBeenCalledWith(
				"oauth-code-abc",
				USER_ID,
			);

			// /mypage へリダイレクト
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/mypage`);

			// edge-token Cookie が設定されること
			const setCookieHeader = response.headers.get("set-cookie");
			expect(setCookieHeader).toContain("edge-token");
			expect(setCookieHeader).toContain(NEW_EDGE_TOKEN);
			expect(setCookieHeader).toContain("HttpOnly");
			// Next.js の set-cookie ヘッダーでは SameSite の値が小文字になる
			expect(setCookieHeader?.toLowerCase()).toContain("samesite=lax");
		});

		it("異常系: handleOAuthCallback が失敗した場合は /auth/error にリダイレクトする", async () => {
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: false,
				reason: "invalid_credentials",
			});

			const req = createRequest({
				code: "bad-code",
				flow: "register",
				userId: USER_ID,
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
		});

		it("エッジケース: flow=register だが userId なし → ログインフローとして処理（pendingUserId なし）", async () => {
			// userId がない場合、フロー1の条件に合致しないのでフロー2に落ちる
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: false,
				reason: "not_registered",
			});

			const req = createRequest({
				code: "oauth-code-abc",
				flow: "register",
				// userId なし
			});

			const response = await GET(req);

			// handleOAuthCallback が code のみで呼ばれること
			expect(mockRegistrationService.handleOAuthCallback).toHaveBeenCalledWith(
				"oauth-code-abc",
			);
		});
	});

	// =========================================================================
	// Discordログインフロー (flow=login)
	// =========================================================================

	describe("Discordログインフロー (flow=login)", () => {
		it("正常: handleOAuthCallback(code) を呼び出し、/mypage にリダイレクトして Cookie を設定する", async () => {
			// See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});

			const req = createRequest({
				code: "oauth-code-xyz",
				flow: "login",
			});

			const response = await GET(req);

			// handleOAuthCallback が code のみで呼ばれること（pendingUserId なし）
			expect(mockRegistrationService.handleOAuthCallback).toHaveBeenCalledWith(
				"oauth-code-xyz",
			);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/mypage`);

			const setCookieHeader = response.headers.get("set-cookie");
			expect(setCookieHeader).toContain("edge-token");
			expect(setCookieHeader).toContain(NEW_EDGE_TOKEN);
		});

		it("異常系: handleOAuthCallback が失敗した場合は /auth/error にリダイレクトする", async () => {
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: false,
				reason: "not_registered",
			});

			const req = createRequest({ code: "bad-code", flow: "login" });

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
		});
	});

	// =========================================================================
	// flow パラメータなし（ログインフローと同様）
	// =========================================================================

	describe("flow パラメータなし", () => {
		it("正常: handleOAuthCallback(code) を呼び出し、/mypage にリダイレクトする", async () => {
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});

			const req = createRequest({ code: "oauth-code-noflow" });

			const response = await GET(req);

			expect(mockRegistrationService.handleOAuthCallback).toHaveBeenCalledWith(
				"oauth-code-noflow",
			);
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/mypage`);
		});
	});

	// =========================================================================
	// メール確認フロー (flow=email_confirm)
	// =========================================================================

	describe("メール確認フロー (flow=email_confirm + userId)", () => {
		it("正常: URL の userId を使って handleOAuthCallback(code, userId, 'email') を呼び出す", async () => {
			// Discord 本登録と同パターン: userId は URL パラメータから取得
			// Gmailアプリ等 Cookie 非共有環境でも動作する
			// See: docs/architecture/components/user-registration.md §7.1 メール認証
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});

			const req = createRequest({
				code: "email-confirm-code",
				flow: "email_confirm",
				userId: USER_ID,
			});

			const response = await GET(req);

			expect(mockRegistrationService.handleOAuthCallback).toHaveBeenCalledWith(
				"email-confirm-code",
				USER_ID,
				"email",
			);
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/mypage`);

			// edge-token Cookie が設定されること
			const setCookieHeader = response.headers.get("set-cookie");
			expect(setCookieHeader).toContain("edge-token");
			expect(setCookieHeader).toContain(NEW_EDGE_TOKEN);
		});

		it("異常系: userId なし → ログインフローにフォールスルー", async () => {
			// flow=email_confirm だが userId がない場合、条件不一致で else 節に落ちる
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: false,
				reason: "not_registered",
			});

			const req = createRequest({
				code: "email-confirm-code",
				flow: "email_confirm",
				// userId なし
			});

			const response = await GET(req);

			// pendingUserId なしのログインフローとして処理される
			expect(mockRegistrationService.handleOAuthCallback).toHaveBeenCalledWith(
				"email-confirm-code",
			);
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
		});

		it("異常系: handleOAuthCallback が失敗 → /auth/error にリダイレクト", async () => {
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: false,
				reason: "invalid_credentials",
			});

			const req = createRequest({
				code: "email-confirm-code",
				flow: "email_confirm",
				userId: USER_ID,
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
		});
	});

	// =========================================================================
	// Cookie 設定の詳細検証
	// =========================================================================

	describe("Cookie 設定", () => {
		beforeEach(() => {
			mockRegistrationService.handleOAuthCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});
		});

		it("正常: edge-token Cookie に path=/ が設定される", async () => {
			const req = createRequest({ code: "code-abc", flow: "login" });
			const response = await GET(req);

			const setCookieHeader = response.headers.get("set-cookie");
			expect(setCookieHeader).toContain("Path=/");
		});

		it("正常: edge-token Cookie に Max-Age（365日相当）が設定される", async () => {
			const req = createRequest({ code: "code-abc", flow: "login" });
			const response = await GET(req);

			const setCookieHeader = response.headers.get("set-cookie");
			// 365日 = 60 * 60 * 24 * 365 = 31536000
			expect(setCookieHeader).toContain("31536000");
		});
	});
});
