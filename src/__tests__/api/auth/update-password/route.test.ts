/**
 * 単体テスト: POST /api/auth/update-password
 *
 * See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
 *
 * テスト方針:
 *   - AuthService, RegistrationService, cookies はモック化して外部依存を排除する
 *   - HTTPレベルの振る舞い（ステータスコード、レスポンスボディ）を検証する
 *   - 認証: edge-token がない場合や無効な場合は 401 を返すことを検証する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義
// ---------------------------------------------------------------------------

const { mockVerifyEdgeToken, mockUpdatePassword, mockCookies } = vi.hoisted(
	() => {
		return {
			mockVerifyEdgeToken: vi.fn(),
			mockUpdatePassword: vi.fn(),
			mockCookies: vi.fn(),
		};
	},
);

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
	cookies: () => mockCookies(),
}));

vi.mock("@/lib/services/auth-service", () => ({
	verifyEdgeToken: (...args: unknown[]) => mockVerifyEdgeToken(...args),
}));

vi.mock("@/lib/services/registration-service", () => ({
	updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { POST } from "../../../../app/api/auth/update-password/route";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

const USER_ID = "user-uuid-001";
const VALID_EDGE_TOKEN = "valid-edge-token";
const NEW_PASSWORD = "newpassword123";

function createRequest(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/auth/update-password", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** Cookie ストアのモックを設定する */
function setupCookieMock(edgeToken?: string) {
	mockCookies.mockResolvedValue({
		get: (name: string) =>
			name === "edge-token" && edgeToken ? { value: edgeToken } : undefined,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/update-password", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: 認証済みユーザーがパスワードを更新すると 200 を返す", async () => {
		setupCookieMock(VALID_EDGE_TOKEN);
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: USER_ID,
			authorIdSeed: "seed",
		});
		mockUpdatePassword.mockResolvedValue({ success: true });

		const req = createRequest({ password: NEW_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	it("正常: updatePassword に userId と password を渡す", async () => {
		setupCookieMock(VALID_EDGE_TOKEN);
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: USER_ID,
			authorIdSeed: "seed",
		});
		mockUpdatePassword.mockResolvedValue({ success: true });

		const req = createRequest({ password: NEW_PASSWORD });
		await POST(req);

		expect(mockUpdatePassword).toHaveBeenCalledWith(USER_ID, NEW_PASSWORD);
	});

	// =========================================================================
	// 認証エラー
	// =========================================================================

	it("認証: edge-token がない場合は 401 を返す", async () => {
		setupCookieMock(undefined);

		const req = createRequest({ password: NEW_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(mockVerifyEdgeToken).not.toHaveBeenCalled();
	});

	it("認証: edge-token が無効な場合は 401 を返す", async () => {
		setupCookieMock("invalid-token");
		mockVerifyEdgeToken.mockResolvedValue({
			valid: false,
			reason: "not_found",
		});

		const req = createRequest({ password: NEW_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(mockUpdatePassword).not.toHaveBeenCalled();
	});

	it("認証: updatePassword が失敗した場合は 401 を返す", async () => {
		setupCookieMock(VALID_EDGE_TOKEN);
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: USER_ID,
			authorIdSeed: "seed",
		});
		mockUpdatePassword.mockResolvedValue({
			success: false,
			reason: "not_registered",
		});

		const req = createRequest({ password: NEW_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	// =========================================================================
	// バリデーション
	// =========================================================================

	it("バリデーション: リクエストボディが不正な JSON の場合は 400 を返す", async () => {
		const req = new NextRequest("http://localhost/api/auth/update-password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not-json",
		});

		const res = await POST(req);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it("バリデーション: password が未指定の場合は 400 を返す", async () => {
		const req = createRequest({});
		const res = await POST(req);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it("バリデーション: password が8文字未満の場合は 400 を返す", async () => {
		const req = createRequest({ password: "short" });
		const res = await POST(req);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.success).toBe(false);
	});
});
