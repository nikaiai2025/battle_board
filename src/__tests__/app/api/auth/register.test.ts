/**
 * 単体テスト: POST /api/auth/register
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * テスト方針:
 *   - AuthService, RegistrationService, next/headers はモック化
 *   - HTTPレベルの振る舞い（ステータスコード、レスポンスボディ）を検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

const mockCookies = {
	get: vi.fn(),
};

vi.mock("next/headers", () => ({
	cookies: vi.fn(() => Promise.resolve(mockCookies)),
}));

const mockVerifyEdgeToken = vi.fn();
vi.mock("../../../../lib/services/auth-service", () => ({
	verifyEdgeToken: (...args: unknown[]) => mockVerifyEdgeToken(...args),
}));

const mockRegisterWithEmail = vi.fn();
vi.mock("../../../../lib/services/registration-service", () => ({
	registerWithEmail: (...args: unknown[]) => mockRegisterWithEmail(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { POST } from "../../../../app/api/auth/register/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function createRequest(
	body: unknown,
	headers: Record<string, string> = {},
): NextRequest {
	return new NextRequest("http://localhost/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

const VALID_EMAIL = "test@example.com";
const VALID_PASSWORD = "password123";
const USER_ID = "user-uuid-001";
const EDGE_TOKEN = "edge-token-value-001";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルト: edge-token Cookie が存在し、認証済みの仮ユーザー
		mockCookies.get.mockReturnValue({ value: EDGE_TOKEN });
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: USER_ID,
			authorIdSeed: "seed-001",
		});
		mockRegisterWithEmail.mockResolvedValue({ success: true });
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: 仮ユーザーが本登録申請すると 200 を返す", async () => {
		// See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.message).toContain("確認メールを送信しました");
	});

	it("正常: redirectTo 指定時はそのまま registerWithEmail に渡す", async () => {
		const req = createRequest({
			email: VALID_EMAIL,
			password: VALID_PASSWORD,
			redirectTo: "https://example.com/callback",
		});
		await POST(req);

		expect(mockRegisterWithEmail).toHaveBeenCalledWith(
			USER_ID,
			VALID_EMAIL,
			VALID_PASSWORD,
			"https://example.com/callback",
		);
	});

	it("正常: redirectTo 未指定時はデフォルト '/mypage' を渡す", async () => {
		// カスタムメールテンプレートで {{ .RedirectTo }} として使用される。
		// メール確認後の最終リダイレクト先として /api/auth/confirm の next パラメータになる。
		// See: src/app/api/auth/confirm/route.ts
		const req = createRequest({
			email: VALID_EMAIL,
			password: VALID_PASSWORD,
			// redirectTo なし（フロントエンドのデフォルト動作）
		});
		await POST(req);

		const actualRedirectTo = mockRegisterWithEmail.mock.calls[0][3] as string;

		// デフォルト値が設定されていること（undefined でないこと）
		expect(actualRedirectTo).toBeDefined();
		expect(actualRedirectTo).not.toBe("undefined");

		// /mypage がデフォルトのリダイレクト先であること
		expect(actualRedirectTo).toBe("/mypage");
	});

	// =========================================================================
	// バリデーション
	// =========================================================================

	it("バリデーション: リクエストボディが不正なJSONの場合は 400 を返す", async () => {
		const req = new NextRequest("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not-json",
		});
		const res = await POST(req);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it("バリデーション: email が未指定の場合は 400 を返す", async () => {
		const req = createRequest({ password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	it("バリデーション: email の形式が不正な場合は 400 を返す", async () => {
		const req = createRequest({
			email: "not-an-email",
			password: VALID_PASSWORD,
		});
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	it("バリデーション: password が未指定の場合は 400 を返す", async () => {
		const req = createRequest({ email: VALID_EMAIL });
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	it("バリデーション: password が 8 文字未満の場合は 400 を返す", async () => {
		const req = createRequest({ email: VALID_EMAIL, password: "short" });
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	// =========================================================================
	// 認証エラー
	// =========================================================================

	it("認証エラー: edge-token Cookie がない場合は 401 を返す", async () => {
		mockCookies.get.mockReturnValue(undefined);

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it("認証エラー: edge-token が無効な場合は 401 を返す", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: false,
			reason: "not_found",
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
	});

	// =========================================================================
	// 登録エラー（Conflict）
	// =========================================================================

	it("重複エラー: 既に本登録済みの場合は 409 already_registered を返す", async () => {
		mockRegisterWithEmail.mockResolvedValue({
			success: false,
			reason: "already_registered",
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.reason).toBe("already_registered");
	});

	it("重複エラー: メールアドレスが既に使用済みの場合は 409 email_taken を返す", async () => {
		// See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
		mockRegisterWithEmail.mockResolvedValue({
			success: false,
			reason: "email_taken",
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.reason).toBe("email_taken");
	});

	it("ユーザー未発見: not_found の場合は 401 を返す", async () => {
		mockRegisterWithEmail.mockResolvedValue({
			success: false,
			reason: "not_found",
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
	});
});
