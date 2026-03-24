/**
 * 単体テスト: POST /api/auth/reset-password
 *
 * See: features/user_registration.feature @本登録ユーザーがパスワード再設定を申請する
 * See: features/user_registration.feature @未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない
 *
 * テスト方針:
 *   - RegistrationService はモック化して外部依存を排除する
 *   - HTTPレベルの振る舞い（ステータスコード、レスポンスボディ）を検証する
 *   - セキュリティ: 未登録メールでも 200 が返ることを検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

const mockRequestPasswordReset = vi.fn();
vi.mock("../../../../lib/services/registration-service", () => ({
	requestPasswordReset: (...args: unknown[]) =>
		mockRequestPasswordReset(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { POST } from "../../../../app/api/auth/reset-password/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function createRequest(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/auth/reset-password", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

const VALID_EMAIL = "test@example.com";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/reset-password", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequestPasswordReset.mockResolvedValue({ success: true });
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: メールアドレスを指定すると 200 を返す", async () => {
		const req = createRequest({ email: VALID_EMAIL });
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.message).toBeDefined();
	});

	it("正常: requestPasswordReset に email と redirectTo を渡す", async () => {
		const req = createRequest({ email: VALID_EMAIL });
		await POST(req);

		expect(mockRequestPasswordReset).toHaveBeenCalledWith(
			VALID_EMAIL,
			"/auth/reset-password",
		);
	});

	// =========================================================================
	// セキュリティ: ユーザー列挙攻撃防止
	// =========================================================================

	it("セキュリティ: 未登録メールでも 200 を返す（列挙攻撃防止）", async () => {
		// requestPasswordReset は常に success を返す仕様
		const req = createRequest({ email: "nonexistent@example.com" });
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	// =========================================================================
	// バリデーション
	// =========================================================================

	it("バリデーション: リクエストボディが不正な JSON の場合は 400 を返す", async () => {
		const req = new NextRequest("http://localhost/api/auth/reset-password", {
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
		const req = createRequest({});
		const res = await POST(req);

		expect(res.status).toBe(400);
	});

	it("バリデーション: email の形式が不正な場合は 400 を返す", async () => {
		const req = createRequest({ email: "not-an-email" });
		const res = await POST(req);

		expect(res.status).toBe(400);
	});
});
