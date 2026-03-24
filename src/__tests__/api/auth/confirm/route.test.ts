/**
 * 単体テスト: GET /api/auth/confirm
 *
 * Supabase カスタムメールテンプレートからリンクされるメール確認エンドポイント。
 * verifyOtp() でトークンを検証し、本登録完了 + edge-token 発行を行う。
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 * See: https://supabase.com/docs/guides/auth/server-side/email-based-auth-with-pkce-flow-for-ssr
 *
 * テスト方針:
 *   - Supabase Auth (verifyOtp) と RegistrationService はモック化
 *   - HTTPレベルの振る舞い（リダイレクト先、Cookie設定）を検証する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義
// ---------------------------------------------------------------------------

const { mockVerifyOtp, mockRegistrationService } = vi.hoisted(() => {
	return {
		mockVerifyOtp: vi.fn(),
		mockRegistrationService: {
			handleEmailConfirmCallback: vi.fn(),
		},
	};
});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/supabase/client", () => ({
	createAuthOnlyClient: () => ({
		auth: {
			verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
		},
	}),
}));

vi.mock("@/lib/services/registration-service", () => ({
	handleEmailConfirmCallback: (...args: unknown[]) =>
		mockRegistrationService.handleEmailConfirmCallback(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { GET } from "../../../../app/api/auth/confirm/route";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";
const USER_ID = "user-uuid-001";
const SUPABASE_AUTH_ID = "supabase-auth-uuid-001";
const NEW_EDGE_TOKEN = "new-edge-token-uuid";

/** テスト用 NextRequest を生成する */
function createRequest(params: Record<string, string>): NextRequest {
	const url = new URL(`${ORIGIN}/api/auth/confirm`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return new NextRequest(url.toString());
}

/** verifyOtp 成功レスポンスを返すモック設定 */
function mockVerifyOtpSuccess(
	userId = USER_ID,
	supabaseAuthId = SUPABASE_AUTH_ID,
) {
	mockVerifyOtp.mockResolvedValue({
		data: {
			user: {
				id: supabaseAuthId,
				user_metadata: { battleboard_user_id: userId },
			},
			session: {},
		},
		error: null,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/auth/confirm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	describe("正常系", () => {
		it("token_hash + type で verifyOtp を呼び出し、/mypage にリダイレクトして Cookie を設定する", async () => {
			mockVerifyOtpSuccess();
			mockRegistrationService.handleEmailConfirmCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});

			const req = createRequest({
				token_hash: "abc123hash",
				type: "email",
			});

			const response = await GET(req);

			// verifyOtp が正しいパラメータで呼ばれること
			expect(mockVerifyOtp).toHaveBeenCalledWith({
				type: "email",
				token_hash: "abc123hash",
			});

			// handleEmailConfirmCallback が supabaseAuthId と userId で呼ばれること
			expect(
				mockRegistrationService.handleEmailConfirmCallback,
			).toHaveBeenCalledWith(SUPABASE_AUTH_ID, USER_ID);

			// /mypage へリダイレクト
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/mypage`);

			// edge-token Cookie が設定されること
			const setCookieHeader = response.headers.get("set-cookie");
			expect(setCookieHeader).toContain("edge-token");
			expect(setCookieHeader).toContain(NEW_EDGE_TOKEN);
			expect(setCookieHeader).toContain("HttpOnly");
			expect(setCookieHeader?.toLowerCase()).toContain("samesite=lax");
			expect(setCookieHeader).toContain("Path=/");
		});

		it("next パラメータ指定時はその URL にリダイレクトする", async () => {
			mockVerifyOtpSuccess();
			mockRegistrationService.handleEmailConfirmCallback.mockResolvedValue({
				success: true,
				userId: USER_ID,
				edgeToken: NEW_EDGE_TOKEN,
			});

			const req = createRequest({
				token_hash: "abc123hash",
				type: "email",
				next: "/custom-page",
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/custom-page`);
		});
	});

	// =========================================================================
	// パラメータ不備
	// =========================================================================

	describe("パラメータ不備", () => {
		it("token_hash がない場合は /auth/error にリダイレクトする", async () => {
			const req = createRequest({ type: "email" });

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
			expect(mockVerifyOtp).not.toHaveBeenCalled();
		});

		it("type がない場合は /auth/error にリダイレクトする", async () => {
			const req = createRequest({ token_hash: "abc123hash" });

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
			expect(mockVerifyOtp).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// verifyOtp 失敗
	// =========================================================================

	describe("verifyOtp 失敗", () => {
		it("verifyOtp がエラーを返す場合は /auth/error にリダイレクトする", async () => {
			mockVerifyOtp.mockResolvedValue({
				data: { user: null, session: null },
				error: { message: "Token has expired or is invalid" },
			});

			const req = createRequest({
				token_hash: "expired-hash",
				type: "email",
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
			expect(
				mockRegistrationService.handleEmailConfirmCallback,
			).not.toHaveBeenCalled();
		});

		it("verifyOtp が user null を返す場合は /auth/error にリダイレクトする", async () => {
			mockVerifyOtp.mockResolvedValue({
				data: { user: null, session: null },
				error: null,
			});

			const req = createRequest({
				token_hash: "bad-hash",
				type: "email",
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
		});
	});

	// =========================================================================
	// user_metadata に battleboard_user_id がない
	// =========================================================================

	describe("user_metadata 不備", () => {
		it("battleboard_user_id がない場合は /auth/error にリダイレクトする", async () => {
			mockVerifyOtp.mockResolvedValue({
				data: {
					user: {
						id: SUPABASE_AUTH_ID,
						user_metadata: {}, // battleboard_user_id なし
					},
					session: {},
				},
				error: null,
			});

			const req = createRequest({
				token_hash: "abc123hash",
				type: "email",
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
			expect(
				mockRegistrationService.handleEmailConfirmCallback,
			).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// handleEmailConfirmCallback 失敗
	// =========================================================================

	describe("handleEmailConfirmCallback 失敗", () => {
		it("本登録処理が失敗した場合は /auth/error にリダイレクトする", async () => {
			mockVerifyOtpSuccess();
			mockRegistrationService.handleEmailConfirmCallback.mockResolvedValue({
				success: false,
				reason: "not_registered",
			});

			const req = createRequest({
				token_hash: "abc123hash",
				type: "email",
			});

			const response = await GET(req);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/error`);
		});
	});
});
