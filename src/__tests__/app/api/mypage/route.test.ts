/**
 * 単体テスト: GET /api/mypage
 *
 * See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
 * See: features/mypage.feature @マイページに基本情報が表示される
 *
 * テスト方針:
 *   - AuthService, MypageService はモック化（Supabase に依存しない）
 *   - Set-Cookie ヘッダーによるテーマ/フォント Cookie 同期を検証する
 *   - 認証・404のエラーレスポンスも検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

const mockVerifyEdgeToken = vi.fn();
vi.mock("../../../../lib/services/auth-service", () => ({
	verifyEdgeToken: (...args: unknown[]) => mockVerifyEdgeToken(...args),
}));

const mockGetMypage = vi.fn();
vi.mock("../../../../lib/services/mypage-service", () => ({
	getMypage: (...args: unknown[]) => mockGetMypage(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言後）
// ---------------------------------------------------------------------------

import { GET } from "../../../../app/api/mypage/route";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const VALID_TOKEN = "valid-edge-token";
const VALID_USER_ID = "user-123";

/** テスト用 MypageInfo（解決済みテーマ/フォント値） */
const MOCK_MYPAGE_INFO = {
	userId: VALID_USER_ID,
	balance: 100,
	isPremium: false,
	username: null,
	streakDays: 0,
	registrationType: null,
	patToken: null,
	patLastUsedAt: null,
	grassCount: 0,
	grassIcon: "",
	themeId: "default",
	fontId: "gothic",
};

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** edge-token Cookie付きのNextRequestを生成する */
function createRequest(token?: string): NextRequest {
	const url = "http://localhost:3000/api/mypage";
	const req = new NextRequest(url);
	if (token) {
		// NextRequest の cookies に edge-token を設定
		req.cookies.set("edge-token", token);
	}
	return req;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/mypage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// 認証エラー
	// -----------------------------------------------------------------------

	it("edge-token Cookie がない場合は 401 を返す", async () => {
		const req = createRequest();
		const res = await GET(req);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("UNAUTHORIZED");
	});

	it("edge-token が無効な場合は 401 を返す", async () => {
		mockVerifyEdgeToken.mockResolvedValue({ valid: false });
		const req = createRequest("invalid-token");
		const res = await GET(req);
		expect(res.status).toBe(401);
	});

	// -----------------------------------------------------------------------
	// ユーザー不存在
	// -----------------------------------------------------------------------

	it("ユーザーが存在しない場合は 404 を返す", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: VALID_USER_ID,
		});
		mockGetMypage.mockResolvedValue(null);
		const req = createRequest(VALID_TOKEN);
		const res = await GET(req);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe("NOT_FOUND");
	});

	// -----------------------------------------------------------------------
	// 正常系: レスポンス + Set-Cookie
	// See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
	// -----------------------------------------------------------------------

	it("正常時に 200 と MypageInfo を返す", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: VALID_USER_ID,
		});
		mockGetMypage.mockResolvedValue(MOCK_MYPAGE_INFO);
		const req = createRequest(VALID_TOKEN);
		const res = await GET(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.userId).toBe(VALID_USER_ID);
		expect(body.themeId).toBe("default");
		expect(body.fontId).toBe("gothic");
	});

	it("レスポンスに bb-theme Set-Cookie ヘッダーが含まれる", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: VALID_USER_ID,
		});
		mockGetMypage.mockResolvedValue(MOCK_MYPAGE_INFO);
		const req = createRequest(VALID_TOKEN);
		const res = await GET(req);
		const setCookies = res.headers.getSetCookie();
		const themeCookie = setCookies.find((c: string) =>
			c.startsWith("bb-theme="),
		);
		expect(themeCookie).toBeDefined();
		expect(themeCookie).toContain("bb-theme=default");
		expect(themeCookie).toContain("Path=/");
		expect(themeCookie).toContain("SameSite=Lax");
		expect(themeCookie).toContain("Max-Age=31536000");
	});

	it("レスポンスに bb-font Set-Cookie ヘッダーが含まれる", async () => {
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: VALID_USER_ID,
		});
		mockGetMypage.mockResolvedValue(MOCK_MYPAGE_INFO);
		const req = createRequest(VALID_TOKEN);
		const res = await GET(req);
		const setCookies = res.headers.getSetCookie();
		const fontCookie = setCookies.find((c: string) => c.startsWith("bb-font="));
		expect(fontCookie).toBeDefined();
		expect(fontCookie).toContain("bb-font=gothic");
		expect(fontCookie).toContain("Path=/");
		expect(fontCookie).toContain("SameSite=Lax");
		expect(fontCookie).toContain("Max-Age=31536000");
	});

	it("有料テーマがフォールバックされた場合、Cookie にフォールバック後の値が設定される", async () => {
		// ダウングレード後のユーザー: resolveTheme/resolveFont が default/gothic を返す
		const downgradeInfo = {
			...MOCK_MYPAGE_INFO,
			themeId: "default", // ocean からフォールバック済み
			fontId: "gothic", // noto-sans-jp からフォールバック済み
		};
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: VALID_USER_ID,
		});
		mockGetMypage.mockResolvedValue(downgradeInfo);
		const req = createRequest(VALID_TOKEN);
		const res = await GET(req);
		const setCookies = res.headers.getSetCookie();
		const themeCookie = setCookies.find((c: string) =>
			c.startsWith("bb-theme="),
		);
		const fontCookie = setCookies.find((c: string) => c.startsWith("bb-font="));
		expect(themeCookie).toContain("bb-theme=default");
		expect(fontCookie).toContain("bb-font=gothic");
	});

	it("有料テーマを使用中の有料ユーザーの場合、Cookie に有料テーマの値が設定される", async () => {
		const premiumInfo = {
			...MOCK_MYPAGE_INFO,
			isPremium: true,
			themeId: "ocean",
			fontId: "noto-sans-jp",
		};
		mockVerifyEdgeToken.mockResolvedValue({
			valid: true,
			userId: VALID_USER_ID,
		});
		mockGetMypage.mockResolvedValue(premiumInfo);
		const req = createRequest(VALID_TOKEN);
		const res = await GET(req);
		const setCookies = res.headers.getSetCookie();
		const themeCookie = setCookies.find((c: string) =>
			c.startsWith("bb-theme="),
		);
		const fontCookie = setCookies.find((c: string) => c.startsWith("bb-font="));
		expect(themeCookie).toContain("bb-theme=ocean");
		expect(fontCookie).toContain("bb-font=noto-sans-jp");
	});
});
