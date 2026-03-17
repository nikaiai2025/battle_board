/**
 * 単体テスト: POST /api/auth/logout
 *
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 * See: docs/architecture/components/user-registration.md §5.3 ログアウト
 *
 * テスト方針:
 *   - RegistrationService, next/headers はモック化
 *   - Cookie削除の振る舞いを検証する
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

const mockLogout = vi.fn();
vi.mock("../../../../lib/services/registration-service", () => ({
	logout: (...args: unknown[]) => mockLogout(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { POST } from "../../../../app/api/auth/logout/route";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const EDGE_TOKEN = "edge-token-value-001";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLogout.mockResolvedValue(undefined);
	});

	// =========================================================================
	// 正常系
	// =========================================================================

	it("正常: ログアウト成功時は 200 を返す", async () => {
		// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
		mockCookies.get.mockReturnValue({ value: EDGE_TOKEN });

		const req = new NextRequest("http://localhost/api/auth/logout", {
			method: "POST",
		});
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	it("正常: RegistrationService.logout が edge-token を引数に呼ばれる", async () => {
		mockCookies.get.mockReturnValue({ value: EDGE_TOKEN });

		const req = new NextRequest("http://localhost/api/auth/logout", {
			method: "POST",
		});
		await POST(req);

		expect(mockLogout).toHaveBeenCalledWith(EDGE_TOKEN);
	});

	it("正常: ログアウト後に edge-token Cookie が削除される", async () => {
		mockCookies.get.mockReturnValue({ value: EDGE_TOKEN });

		const req = new NextRequest("http://localhost/api/auth/logout", {
			method: "POST",
		});
		const res = await POST(req);

		// Cookie削除はSet-Cookie: edge-token=; Max-Age=0 などで確認
		const setCookie = res.headers.get("Set-Cookie");
		expect(setCookie).toContain("edge-token");
	});

	// =========================================================================
	// 冪等性
	// =========================================================================

	it("冪等性: edge-token Cookie がない状態でもログアウトは 200 を返す", async () => {
		// 未ログイン状態でもエラーにならない
		mockCookies.get.mockReturnValue(undefined);

		const req = new NextRequest("http://localhost/api/auth/logout", {
			method: "POST",
		});
		const res = await POST(req);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		// logout サービスは呼ばれない（token がないため）
		expect(mockLogout).not.toHaveBeenCalled();
	});
});
