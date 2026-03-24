/**
 * 単体テスト: POST /api/auth/verify Route Handler
 *
 * See: features/authentication.feature @Turnstile通過で認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 *
 * テスト方針:
 *   - AuthService はモック化する
 *   - next/headers の cookies / headers はモック化する
 *   - HTTP レベルの振る舞い（レスポンスコード・ボディ・Cookie）を検証する
 *   - write_token がレスポンスに含まれることを検証する
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/auth-service", () => ({
	hashIp: vi.fn((ip: string) => `hashed:${ip}`),
	verifyAuth: vi.fn(),
}));

vi.mock("next/headers", () => ({
	cookies: vi.fn(),
	headers: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import { cookies, headers } from "next/headers";
import * as AuthService from "@/lib/services/auth-service";
import { POST } from "../route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * テスト用 NextRequest を生成する
 */
function makeRequest(
	body: Record<string, unknown>,
	options: { ip?: string } = {},
): NextRequest {
	const { ip = "127.0.0.1" } = options;
	return new NextRequest("http://localhost/api/auth/verify", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": ip,
		},
		body: JSON.stringify(body),
	});
}

/**
 * cookies() の get メソッドをモック化するヘルパー
 */
function mockCookies(edgeToken: string | undefined) {
	const cookieStoreMock = {
		get: vi.fn((name: string) => {
			if (name === "edge-token" && edgeToken !== undefined) {
				return { value: edgeToken };
			}
			return undefined;
		}),
	};
	vi.mocked(cookies).mockResolvedValue(
		cookieStoreMock as unknown as ReturnType<typeof cookies> extends Promise<
			infer T
		>
			? T
			: never,
	);
}

/**
 * headers() をモック化するヘルパー
 */
function mockHeaders(ip: string = "127.0.0.1") {
	const headersMock = {
		get: vi.fn((name: string) => {
			if (name === "x-forwarded-for") return ip;
			return null;
		}),
	};
	vi.mocked(headers).mockResolvedValue(
		headersMock as unknown as ReturnType<typeof headers> extends Promise<
			infer T
		>
			? T
			: never,
	);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("POST /api/auth/verify", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルトのモック設定
		mockHeaders();
		mockCookies("valid-edge-token");
	});

	// =========================================================================
	// 正常系: 認証成功
	// =========================================================================

	describe("正常系: 認証成功", () => {
		// See: features/authentication.feature @Turnstile通過で認証に成功する

		it("認証成功時に 200 と { success: true, writeToken } を返す", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "abcdef1234567890abcdef1234567890",
			});

			const req = makeRequest({ turnstileToken: "valid-turnstile" });
			const res = await POST(req);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				writeToken?: string;
			};
			expect(body.success).toBe(true);
			expect(body.writeToken).toBe("abcdef1234567890abcdef1234567890");
		});

		it("write_token が undefined でも 200 と { success: true } を返す", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: undefined,
			});

			const req = makeRequest({ turnstileToken: "valid-turnstile" });
			const res = await POST(req);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				writeToken?: string;
			};
			expect(body.success).toBe(true);
		});

		it("認証成功時に edge-token Cookie を設定する", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "test-write-token",
			});

			const req = makeRequest({ turnstileToken: "valid-turnstile" });
			const res = await POST(req);

			// edge-token Cookie が設定されることを確認
			const setCookie = res.headers.get("set-cookie");
			expect(setCookie).toContain("edge-token");
		});

		it("AuthService.verifyAuth を正しい引数で呼び出す", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "test-token",
			});
			mockHeaders("192.168.1.100");

			const req = makeRequest(
				{ turnstileToken: "some-turnstile" },
				{ ip: "192.168.1.100" },
			);
			await POST(req);

			expect(AuthService.verifyAuth).toHaveBeenCalledWith(
				"valid-edge-token",
				"some-turnstile",
				expect.any(String), // IP ハッシュ
			);
		});
	});

	// =========================================================================
	// 異常系: 認証失敗
	// =========================================================================

	describe("異常系: 認証失敗", () => {
		// See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する

		it("認証失敗時に 401 と { success: false, error } を返す", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: false,
			});

			const req = makeRequest({ turnstileToken: "invalid-turnstile" });
			const res = await POST(req);

			expect(res.status).toBe(401);
			const body = (await res.json()) as {
				success: boolean;
				error?: string;
			};
			expect(body.success).toBe(false);
			expect(body.error).toBeTruthy();
		});

		it("認証失敗時に write_token は含まれない", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: false,
			});

			const req = makeRequest({ turnstileToken: "invalid-turnstile" });
			const res = await POST(req);

			const body = (await res.json()) as { writeToken?: string };
			expect(body.writeToken).toBeUndefined();
		});
	});

	// =========================================================================
	// 異常系: バリデーションエラー
	// =========================================================================

	describe("異常系: バリデーションエラー", () => {
		it("リクエストボディが不正な場合に 400 を返す", async () => {
			const req = new NextRequest("http://localhost/api/auth/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			});
			const res = await POST(req);

			expect(res.status).toBe(400);
		});

		it("turnstileToken が未指定の場合に 400 を返す", async () => {
			const req = makeRequest({ turnstileToken: "" });
			const res = await POST(req);

			expect(res.status).toBe(400);
		});

		it("Cookie もボディも edge-token がない場合に 400 を返す", async () => {
			mockCookies(undefined);

			const req = makeRequest({ turnstileToken: "valid" });
			const res = await POST(req);

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error?: string };
			expect(body.error).toContain("edge-token");
		});
	});

	// =========================================================================
	// 専ブラ向け: リクエストボディの edgeToken フォールバック
	// Sprint-110 で6桁コードを廃止した際のリグレッション修正
	// See: features/specialist_browser_compat.feature @専ブラ認証フロー
	// =========================================================================

	describe("専ブラ向け: ボディの edgeToken フォールバック", () => {
		it("Cookie がなくてもボディの edgeToken で認証できる", async () => {
			mockCookies(undefined);
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "senbra-write-token",
			});

			const req = makeRequest({
				turnstileToken: "valid-turnstile",
				edgeToken: "senbra-edge-token",
			});
			const res = await POST(req);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				writeToken?: string;
			};
			expect(body.success).toBe(true);
			expect(body.writeToken).toBe("senbra-write-token");
		});

		it("ボディの edgeToken で AuthService.verifyAuth が呼ばれる", async () => {
			mockCookies(undefined);
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "token",
			});

			const req = makeRequest({
				turnstileToken: "some-turnstile",
				edgeToken: "senbra-edge-token",
			});
			await POST(req);

			expect(AuthService.verifyAuth).toHaveBeenCalledWith(
				"senbra-edge-token",
				"some-turnstile",
				expect.any(String),
			);
		});

		it("ボディの edgeToken は Cookie より優先される", async () => {
			mockCookies("browser-edge-token");
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "token",
			});

			const req = makeRequest({
				turnstileToken: "valid-turnstile",
				edgeToken: "senbra-edge-token",
			});
			await POST(req);

			// Cookie の "browser-edge-token" ではなくボディの "senbra-edge-token" が使われる
			expect(AuthService.verifyAuth).toHaveBeenCalledWith(
				"senbra-edge-token",
				"valid-turnstile",
				expect.any(String),
			);
		});

		it("ボディの edgeToken が空文字の場合は Cookie にフォールバックする", async () => {
			mockCookies("browser-edge-token");
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "token",
			});

			const req = makeRequest({
				turnstileToken: "valid-turnstile",
				edgeToken: "",
			});
			await POST(req);

			expect(AuthService.verifyAuth).toHaveBeenCalledWith(
				"browser-edge-token",
				"valid-turnstile",
				expect.any(String),
			);
		});
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("リクエストボディに code を含めなくても認証できる（6桁コード廃止済み）", async () => {
			vi.mocked(AuthService.verifyAuth).mockResolvedValue({
				success: true,
				writeToken: "test-write-token",
			});

			// code フィールドなしで送信
			const req = makeRequest({ turnstileToken: "valid-turnstile" });
			const res = await POST(req);

			expect(res.status).toBe(200);
		});
	});
});
