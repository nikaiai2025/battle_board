/**
 * APIテスト: 認証Cookie属性の検証
 *
 * PlaywrightのAPIRequestContextを使用したHTTPレベルのテスト。
 * ブラウザ不要（api project）で実行する。
 *
 * 検証対象:
 *   - POST /api/threads (未認証) → 401 + Set-Cookie: edge-token; HttpOnly; SameSite=Lax; Path=/
 *   - POST /api/threads/{threadId}/posts (未認証) → 同上
 *   - POST /api/auth/verify (認証成功) → 200 + Set-Cookie の Cookie 属性
 *
 * 検証ポイント:
 *   - HttpOnly フラグ（クライアント JS からアクセス不可）
 *   - SameSite=Lax
 *   - Path=/
 *   - Max-Age の存在
 *
 * See: docs/architecture/bdd_test_strategy.md §9.2 認証API
 * See: src/app/api/threads/route.ts
 * See: src/app/api/threads/[threadId]/posts/route.ts
 * See: src/app/api/auth/verify/route.ts
 */

import { type APIRequestContext, expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:3000";

const testRunId = Date.now();

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * Supabase Local DB の主要テーブルをクリーンアップする。
 *
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 */
async function cleanupDatabase(request: APIRequestContext): Promise<void> {
	const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

	const headers = {
		apikey: serviceRoleKey,
		Authorization: `Bearer ${serviceRoleKey}`,
		"Content-Type": "application/json",
		Prefer: "return=minimal",
	};

	await request.delete(
		`${supabaseUrl}/rest/v1/posts?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
	await request.delete(
		`${supabaseUrl}/rest/v1/threads?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
	await request.delete(
		`${supabaseUrl}/rest/v1/edge_tokens?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
}

/**
 * Set-Cookie ヘッダの文字列から edge-token Cookie のディレクティブを解析して返す。
 *
 * Playwright の response.headers()["set-cookie"] は単一のヘッダー文字列を返す。
 * 複数 Cookie が存在する場合は改行で区切られることがある。
 *
 * 注意: "Expires=Sun, 12 Apr..." のように Cookie 値内にカンマが含まれるため、
 * カンマで単純分割するとディレクティブが切り詰められる。
 * そのため、edge-token で始まるエントリのみセミコロン分割で解析する。
 *
 * @param setCookieHeader - Set-Cookie ヘッダの文字列
 * @returns edge-token Cookie のディレクティブ（小文字化済み）または null
 */
function parseEdgeTokenCookieDirectives(
	setCookieHeader: string,
): string[] | null {
	// 改行区切りで複数 Cookie を分割（カンマは Expires 値内に含まれるため使用しない）
	const cookieEntries = setCookieHeader.split("\n");
	// edge-token で始まるエントリを探す（先頭 or 改行後）
	const edgeTokenEntry = cookieEntries.find((entry) =>
		entry.trim().startsWith("edge-token="),
	);

	if (!edgeTokenEntry) return null;

	// ディレクティブをセミコロンで分割して小文字化して返す
	return edgeTokenEntry.split(";").map((d) => d.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

test.describe("認証 Cookie 属性の検証", () => {
	/**
	 * 各テスト前に DB をクリーンアップして独立性を保証する。
	 */
	test.beforeEach(async ({ request }) => {
		await cleanupDatabase(request);
	});

	// -------------------------------------------------------------------------
	// POST /api/threads (未認証) → 401 + Set-Cookie
	// -------------------------------------------------------------------------

	test("POST /api/threads 未認証 — 401 レスポンスに edge-token Cookie が含まれる", async ({
		request,
	}) => {
		// See: src/app/api/threads/route.ts @POST > 未認証時の Set-Cookie
		const response = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `Cookie属性テスト_${testRunId}`,
				body: "テスト本文",
			},
		});

		expect(response.status()).toBe(401);

		const setCookieHeader = response.headers()["set-cookie"] ?? "";
		expect(setCookieHeader).toContain("edge-token=");
	});

	test("POST /api/threads 未認証 — HttpOnly 属性が設定されている", async ({
		request,
	}) => {
		// See: src/app/api/threads/route.ts > response.cookies.set > httpOnly: true
		const response = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `HttpOnlyテスト_${testRunId}`,
				body: "テスト本文",
			},
		});

		expect(response.status()).toBe(401);

		const setCookieHeader = response.headers()["set-cookie"] ?? "";
		const directives = parseEdgeTokenCookieDirectives(setCookieHeader);
		expect(directives).not.toBeNull();

		// HttpOnly ディレクティブが含まれる
		expect(directives!.some((d) => d === "httponly")).toBe(true);
	});

	test("POST /api/threads 未認証 — SameSite=Lax 属性が設定されている", async ({
		request,
	}) => {
		// See: src/app/api/threads/route.ts > response.cookies.set > sameSite: 'lax'
		const response = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `SameSiteテスト_${testRunId}`,
				body: "テスト本文",
			},
		});

		expect(response.status()).toBe(401);

		const setCookieHeader = response.headers()["set-cookie"] ?? "";
		const directives = parseEdgeTokenCookieDirectives(setCookieHeader);
		expect(directives).not.toBeNull();

		// SameSite=Lax ディレクティブが含まれる
		expect(directives!.some((d) => d === "samesite=lax")).toBe(true);
	});

	test("POST /api/threads 未認証 — Path=/ 属性が設定されている", async ({
		request,
	}) => {
		// See: src/app/api/threads/route.ts > response.cookies.set > path: '/'
		const response = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `Path属性テスト_${testRunId}`,
				body: "テスト本文",
			},
		});

		expect(response.status()).toBe(401);

		const setCookieHeader = response.headers()["set-cookie"] ?? "";
		const directives = parseEdgeTokenCookieDirectives(setCookieHeader);
		expect(directives).not.toBeNull();

		// Path=/ ディレクティブが含まれる
		expect(directives!.some((d) => d === "path=/")).toBe(true);
	});

	test("POST /api/threads 未認証 — Max-Age が存在する", async ({ request }) => {
		// See: src/app/api/threads/route.ts > response.cookies.set > maxAge: 60 * 60 * 24 * 30
		const response = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `MaxAgeテスト_${testRunId}`,
				body: "テスト本文",
			},
		});

		expect(response.status()).toBe(401);

		const setCookieHeader = response.headers()["set-cookie"] ?? "";
		const directives = parseEdgeTokenCookieDirectives(setCookieHeader);
		expect(directives).not.toBeNull();

		// Max-Age ディレクティブが含まれる（値は正の整数）
		const maxAgeDirective = directives!.find((d) => d.startsWith("max-age="));
		expect(maxAgeDirective).toBeTruthy();
		const maxAgeValue = parseInt(maxAgeDirective!.split("=")[1], 10);
		expect(maxAgeValue).toBeGreaterThan(0);
	});

	test("POST /api/threads 未認証 — 401 レスポンスボディに authUrl が含まれる", async ({
		request,
	}) => {
		// See: src/app/api/threads/route.ts @POST > 401 レスポンス
		// Sprint-110: authCode / authCodeUrl は廃止。authUrl のみ返される
		const response = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `authUrl検証テスト_${testRunId}`,
				body: "テスト本文",
			},
		});

		expect(response.status()).toBe(401);

		const body = await response.json();

		// authUrl が /auth/verify を指す
		expect(body.authUrl).toBe("/auth/verify");

		// authCode / authCodeUrl は存在しない（Sprint-110 で廃止）
		expect(body.authCode).toBeUndefined();
		expect(body.authCodeUrl).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// POST /api/threads/{threadId}/posts (未認証) → 401 + Set-Cookie
	// -------------------------------------------------------------------------

	test("POST /api/threads/{threadId}/posts 未認証 — 401 + HttpOnly SameSite=Lax Cookie が含まれる", async ({
		request,
	}) => {
		// See: src/app/api/threads/[threadId]/posts/route.ts @POST > 未認証時の Set-Cookie
		//
		// Note: テスト環境では TURNSTILE_SECRET_KEY 未設定により認証が常に通過するため、
		//       edge-token Cookie なし（= null）では 401 になるが、
		//       無効な edge-token（DB に存在しない）でも 401 + Set-Cookie が返される。
		//       DB に存在しない UUID を edge-token として送信することで未認証状態をシミュレートする。
		// See: src/lib/services/auth-service.ts > verifyEdgeToken > not_found → authRequired

		// まず認証済みでスレッドを作成する
		const response401 = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `posts未認証テスト_${testRunId}`,
				body: "テスト本文",
			},
		});
		expect(response401.status()).toBe(401);

		const setCookie401 = response401.headers()["set-cookie"] ?? "";
		const edgeTokenMatch = setCookie401.match(/edge-token=([^;]+)/);
		expect(edgeTokenMatch).not.toBeNull();
		const edgeToken = edgeTokenMatch![1];

		// 認証完了（Sprint-110: Turnstile のみ、認証コード不要）
		const authResponse = await request.post(`${BASE_URL}/api/auth/verify`, {
			headers: {
				"Content-Type": "application/json",
				Cookie: `edge-token=${edgeToken}`,
			},
			data: { turnstileToken: "test-token" },
		});
		expect(authResponse.status()).toBe(200);

		// スレッド作成（認証済み）
		await new Promise((resolve) => setTimeout(resolve, 1100));
		const createResponse = await request.post(`${BASE_URL}/api/threads`, {
			headers: {
				"Content-Type": "application/json",
				Cookie: `edge-token=${edgeToken}`,
			},
			data: {
				title: `posts未認証テスト用スレッド_${testRunId}`,
				body: "テスト本文",
			},
		});
		expect(createResponse.status()).toBe(201);
		const thread = await createResponse.json();
		const threadId: string = thread.id;

		// DB に存在しない無効な edge-token で posts エンドポイントにアクセス
		// → verifyEdgeToken が not_found を返して 401 + Set-Cookie が発生する
		const fakeEdgeToken = "00000000-0000-0000-0000-000000000000";
		const postsResponse = await request.post(
			`${BASE_URL}/api/threads/${threadId}/posts`,
			{
				headers: {
					"Content-Type": "application/json",
					Cookie: `edge-token=${fakeEdgeToken}`,
				},
				data: { body: "無効トークンからのレス書き込み" },
			},
		);

		expect(postsResponse.status()).toBe(401);

		// Set-Cookie: edge-token が含まれる
		const setCookieHeader = postsResponse.headers()["set-cookie"] ?? "";
		expect(setCookieHeader).toContain("edge-token=");

		// Cookie 属性の検証
		const directives = parseEdgeTokenCookieDirectives(setCookieHeader);
		expect(directives).not.toBeNull();

		// HttpOnly
		expect(directives!.some((d) => d === "httponly")).toBe(true);

		// SameSite=Lax
		expect(directives!.some((d) => d === "samesite=lax")).toBe(true);

		// Path=/
		expect(directives!.some((d) => d === "path=/")).toBe(true);
	});

	// -------------------------------------------------------------------------
	// POST /api/auth/verify (認証成功) → 200 + Set-Cookie
	// Sprint-110: 認証コード廃止、Turnstile のみで認証
	// -------------------------------------------------------------------------

	test("POST /api/auth/verify 認証成功 — 200 + edge-token Cookie が再設定される", async ({
		request,
	}) => {
		// See: src/app/api/auth/verify/route.ts @POST > response.cookies.set

		// 未認証でスレッド作成を試みて edge-token を取得
		const response401 = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `auth-verify認証テスト_${testRunId}`,
				body: "テスト本文",
			},
		});
		expect(response401.status()).toBe(401);

		const setCookie401 = response401.headers()["set-cookie"] ?? "";
		const edgeTokenMatch = setCookie401.match(/edge-token=([^;]+)/);
		expect(edgeTokenMatch).not.toBeNull();
		const edgeToken = edgeTokenMatch![1];

		// Turnstile トークンを送信（認証コード不要）
		const authResponse = await request.post(`${BASE_URL}/api/auth/verify`, {
			headers: {
				"Content-Type": "application/json",
				Cookie: `edge-token=${edgeToken}`,
			},
			data: { turnstileToken: "test-token" },
		});

		// 認証成功: 200
		expect(authResponse.status()).toBe(200);

		// Set-Cookie: edge-token が再設定される
		const setCookieHeader = authResponse.headers()["set-cookie"] ?? "";
		expect(setCookieHeader).toContain("edge-token=");
	});

	test("POST /api/auth/verify 認証成功 — HttpOnly SameSite=Lax Path=/ Max-Age が設定される", async ({
		request,
	}) => {
		// See: src/app/api/auth/verify/route.ts > response.cookies.set > httpOnly/sameSite/path/maxAge

		// 未認証でスレッド作成を試みて edge-token を取得
		const response401 = await request.post(`${BASE_URL}/api/threads`, {
			headers: { "Content-Type": "application/json" },
			data: {
				title: `auth-verify属性テスト_${testRunId}`,
				body: "テスト本文",
			},
		});
		const setCookie401 = response401.headers()["set-cookie"] ?? "";
		const edgeTokenMatch = setCookie401.match(/edge-token=([^;]+)/);
		const edgeToken = edgeTokenMatch![1];

		// Turnstile トークンを送信（認証コード不要）
		const authResponse = await request.post(`${BASE_URL}/api/auth/verify`, {
			headers: {
				"Content-Type": "application/json",
				Cookie: `edge-token=${edgeToken}`,
			},
			data: { turnstileToken: "test-token" },
		});

		expect(authResponse.status()).toBe(200);

		const setCookieHeader = authResponse.headers()["set-cookie"] ?? "";
		const directives = parseEdgeTokenCookieDirectives(setCookieHeader);
		expect(directives).not.toBeNull();

		// HttpOnly
		expect(directives!.some((d) => d === "httponly")).toBe(true);

		// SameSite=Lax
		expect(directives!.some((d) => d === "samesite=lax")).toBe(true);

		// Path=/
		expect(directives!.some((d) => d === "path=/")).toBe(true);

		// Max-Age が存在し正の値
		const maxAgeDirective = directives!.find((d) => d.startsWith("max-age="));
		expect(maxAgeDirective).toBeTruthy();
		const maxAgeValue = parseInt(maxAgeDirective!.split("=")[1], 10);
		// 365日 = 31536000秒（Web API・専ブラ統一。実装全6箇所に合わせる）
		expect(maxAgeValue).toBe(60 * 60 * 24 * 365);
	});

	test("POST /api/auth/verify — edge-token Cookie なしでも新規発行して認証が成功する", async ({
		request,
	}) => {
		// See: src/app/api/auth/verify/route.ts @POST > edge-token が存在しない場合 → 新規発行して認証継続
		//
		// 実装変更(Sprint-141以降): edge-tokenなし時は 400 を返す代わりに、
		// issueEdgeToken() + issueAuthCode() で新規発行し、認証フローをそのまま継続する。
		// ヘッダーの「新規登録」リンク等、書き込み試行を経ずに直接 /auth/verify に来たケースを救済する。

		const authResponse = await request.post(`${BASE_URL}/api/auth/verify`, {
			headers: {
				"Content-Type": "application/json",
				// Cookie なし — 新規 edge-token が自動発行される
			},
			data: {
				turnstileToken: "test-token",
			},
		});

		// 新規発行後に認証フローが成功: 200
		expect(authResponse.status()).toBe(200);

		const body = await authResponse.json();
		expect(body.success).toBe(true);

		// 新規発行した edge-token が Cookie に設定される
		const setCookieHeader = authResponse.headers()["set-cookie"] ?? "";
		expect(setCookieHeader).toContain("edge-token=");
	});
});
