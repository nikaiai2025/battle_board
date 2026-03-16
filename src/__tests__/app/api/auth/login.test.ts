/**
 * 単体テスト: POST /api/auth/login
 *
 * See: features/未実装/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 * See: features/未実装/user_registration.feature @誤ったパスワードではログインできない
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * テスト方針:
 *   - RegistrationService はモック化
 *   - HTTPレベルの振る舞い（ステータスコード、レスポンスボディ、Cookie設定）を検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

const mockLoginWithEmail = vi.fn();
vi.mock("../../../../lib/services/registration-service", () => ({
	loginWithEmail: (...args: unknown[]) => mockLoginWithEmail(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { POST } from "../../../../app/api/auth/login/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function createRequest(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

const VALID_EMAIL = "test@example.com";
const VALID_PASSWORD = "password123";
const USER_ID = "user-uuid-001";
const NEW_EDGE_TOKEN = "new-edge-token-uuid-001";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: ログイン成功時は 200 を返す", async () => {
		// See: features/未実装/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
		mockLoginWithEmail.mockResolvedValue({
			success: true,
			userId: USER_ID,
			edgeToken: NEW_EDGE_TOKEN,
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	it("正常: ログイン成功時に edge-token Cookie が設定される", async () => {
		// See: features/未実装/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
		mockLoginWithEmail.mockResolvedValue({
			success: true,
			userId: USER_ID,
			edgeToken: NEW_EDGE_TOKEN,
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		const setCookie = res.headers.get("Set-Cookie");
		expect(setCookie).toContain("edge-token");
		expect(setCookie).toContain(NEW_EDGE_TOKEN);
	});

	it("正常: edge-token Cookie に HttpOnly が設定される", async () => {
		mockLoginWithEmail.mockResolvedValue({
			success: true,
			userId: USER_ID,
			edgeToken: NEW_EDGE_TOKEN,
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		const setCookie = res.headers.get("Set-Cookie");
		expect(setCookie?.toLowerCase()).toContain("httponly");
	});

	it("正常: RegistrationService.loginWithEmail が正しい引数で呼ばれる", async () => {
		mockLoginWithEmail.mockResolvedValue({
			success: true,
			userId: USER_ID,
			edgeToken: NEW_EDGE_TOKEN,
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		await POST(req);

		expect(mockLoginWithEmail).toHaveBeenCalledWith(
			VALID_EMAIL,
			VALID_PASSWORD,
		);
	});

	// =========================================================================
	// バリデーション
	// =========================================================================

	it("バリデーション: リクエストボディが不正な場合は 400 を返す", async () => {
		const req = new NextRequest("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "invalid-json",
		});
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	it("バリデーション: email が未指定の場合は 400 を返す", async () => {
		const req = createRequest({ password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	it("バリデーション: password が未指定の場合は 400 を返す", async () => {
		const req = createRequest({ email: VALID_EMAIL });
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	// =========================================================================
	// 認証エラー
	// =========================================================================

	it("認証エラー: 認証情報が誤っている場合は 401 を返す", async () => {
		// See: features/未実装/user_registration.feature @誤ったパスワードではログインできない
		mockLoginWithEmail.mockResolvedValue({
			success: false,
			reason: "invalid_credentials",
		});

		const req = createRequest({ email: VALID_EMAIL, password: "wrong" });
		const res = await POST(req);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it("認証エラー: 本登録が完了していない場合は 401 を返す", async () => {
		mockLoginWithEmail.mockResolvedValue({
			success: false,
			reason: "not_registered",
		});

		const req = createRequest({ email: VALID_EMAIL, password: VALID_PASSWORD });
		const res = await POST(req);

		expect(res.status).toBe(401);
	});
});
