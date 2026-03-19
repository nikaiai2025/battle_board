/**
 * E2E フィクスチャ: 認証・管理者セッション
 *
 * 環境差分（ローカル / 本番）を吸収する認証関連フィクスチャ。
 * specファイルは環境を意識せず、フィクスチャ経由で認証済み状態を取得する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.1.1 環境抽象化フィクスチャ
 * See: docs/operations/runbooks/create-admin-account.md
 * See: docs/operations/runbooks/seed-smoke-user.md
 */

import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// ローカル用 Supabase REST ヘルパー
// ---------------------------------------------------------------------------

/**
 * Supabase REST の共通ヘッダーを返す。
 * service_role_key は RLS をバイパスするため、テストデータ作成に使用する。
 */
function supabaseHeaders(): Record<string, string> {
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
	return {
		apikey: key,
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
		Prefer: "return=representation",
	};
}

function supabaseUrl(): string {
	return process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
}

// ---------------------------------------------------------------------------
// authenticate — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境で認証済み状態を作る。
 *
 * 1. users テーブルにテストユーザーを作成
 * 2. currencies テーブルに初期残高を作成（コマンド実行に必要）
 * 3. edge_tokens テーブルに edge-token を作成
 * 4. ブラウザの Cookie に edge-token を設定
 *
 * See: supabase/migrations/00001_create_tables.sql > users テーブル
 * See: supabase/migrations/00006_user_registration.sql > edge_tokens テーブル
 */
export async function authenticateLocal(
	request: APIRequestContext,
	context: BrowserContext,
	baseURL: string,
): Promise<{ userId: string; edgeToken: string }> {
	const headers = supabaseHeaders();
	const base = supabaseUrl();
	const suffix = Date.now();

	// 1. users テーブルにテストユーザー作成
	const userRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `e2e-fixture-auth-${suffix}`,
			author_id_seed: `e2e-fixture-seed-${suffix}`,
			is_premium: false,
			is_verified: true,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const userId = users[0].id;

	// 2. currencies テーブルに初期残高（コマンドテストに十分な額）
	await request.post(`${base}/rest/v1/currencies`, {
		headers,
		data: { user_id: userId, balance: 10000 },
	});

	// 3. edge_tokens テーブルに edge-token 作成
	const token = `e2e-edge-token-${suffix}`;
	await request.post(`${base}/rest/v1/edge_tokens`, {
		headers,
		data: { user_id: userId, token },
	});

	// 4. ブラウザ Cookie に設定
	await context.addCookies([
		{
			name: "edge-token",
			value: token,
			url: baseURL,
		},
	]);

	return { userId, edgeToken: token };
}

// ---------------------------------------------------------------------------
// authenticate — 本番実装
// ---------------------------------------------------------------------------

/**
 * 本番環境で認証済み状態を作る。
 *
 * 事前シード済み edge-token（.env.prod.smoke）を Cookie に設定するのみ。
 *
 * See: supabase/migrations/00017_seed_smoke_user.sql
 * See: docs/operations/runbooks/seed-smoke-user.md
 */
export async function authenticateProd(
	context: BrowserContext,
	baseURL: string,
): Promise<void> {
	const token = process.env.PROD_SMOKE_EDGE_TOKEN;
	if (!token) {
		throw new Error(
			"PROD_SMOKE_EDGE_TOKEN is required for production tests. " +
				"See: docs/operations/runbooks/seed-smoke-user.md",
		);
	}

	await context.addCookies([
		{
			name: "edge-token",
			value: token,
			url: baseURL,
		},
	]);
}

// ---------------------------------------------------------------------------
// adminSession — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境で管理者セッションを取得する。
 *
 * 1. Supabase Auth に管理者ユーザーを作成（冪等: 既存なら 422 → スキップ）
 * 2. admin_users テーブルに登録（冪等: ON CONFLICT → スキップ）
 * 3. /api/admin/login で admin_session Cookie を取得
 *
 * See: docs/operations/runbooks/create-admin-account.md
 */
const LOCAL_ADMIN_EMAIL = "e2e-admin@battleboard.local";
const LOCAL_ADMIN_PASSWORD = "e2e-admin-test-password";

export async function ensureAdminAndLogin(
	request: APIRequestContext,
	baseURL: string,
): Promise<string> {
	const base = supabaseUrl();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

	// 1. Supabase Auth ユーザー作成（冪等: 既存なら 422 を返す）
	const authRes = await request.post(`${base}/auth/v1/admin/users`, {
		headers: {
			apikey: key,
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		data: {
			email: LOCAL_ADMIN_EMAIL,
			password: LOCAL_ADMIN_PASSWORD,
			email_confirm: true,
		},
	});

	let adminAuthId: string;
	if (authRes.ok()) {
		const body = (await authRes.json()) as { id: string };
		adminAuthId = body.id;
	} else {
		// 既存ユーザーを検索
		const listRes = await request.get(
			`${base}/auth/v1/admin/users?page=1&per_page=50`,
			{
				headers: {
					apikey: key,
					Authorization: `Bearer ${key}`,
				},
			},
		);
		const listBody = (await listRes.json()) as {
			users: Array<{ id: string; email: string }>;
		};
		const existing = listBody.users.find((u) => u.email === LOCAL_ADMIN_EMAIL);
		if (!existing) {
			throw new Error(
				`Failed to create or find admin user: ${authRes.status()} ${await authRes.text()}`,
			);
		}
		adminAuthId = existing.id;
	}

	// 2. admin_users テーブルに登録（冪等: 既存なら 409 → 無視）
	await request.post(`${base}/rest/v1/admin_users`, {
		headers: {
			...supabaseHeaders(),
			Prefer: "return=minimal",
		},
		data: {
			id: adminAuthId,
			email: LOCAL_ADMIN_EMAIL,
			role: "admin",
		},
	});
	// 409 Conflict は既存レコードのため無視

	// 3. /api/admin/login で admin_session を取得
	const loginRes = await request.post(`${baseURL}/api/admin/login`, {
		data: {
			email: LOCAL_ADMIN_EMAIL,
			password: LOCAL_ADMIN_PASSWORD,
		},
	});

	if (!loginRes.ok()) {
		throw new Error(
			`Admin login failed: ${loginRes.status()} ${await loginRes.text()}`,
		);
	}

	// Set-Cookie ヘッダーから admin_session を抽出
	const setCookieHeaders = loginRes
		.headersArray()
		.filter((h) => h.name.toLowerCase() === "set-cookie");
	for (const h of setCookieHeaders) {
		const match = h.value.match(/admin_session=([^;]+)/);
		if (match) return match[1];
	}

	throw new Error("admin_session cookie not found in login response");
}

// ---------------------------------------------------------------------------
// adminSession — 本番実装
// ---------------------------------------------------------------------------

/**
 * 本番環境で管理者ログインし admin_session を取得する。
 *
 * See: .env.prod.smoke.example
 */
export async function adminLoginProd(
	request: APIRequestContext,
	baseURL: string,
): Promise<string> {
	const email = process.env.PROD_ADMIN_EMAIL;
	const password = process.env.PROD_ADMIN_PASSWORD;
	if (!email || !password) {
		throw new Error(
			"PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD are required. " +
				"See: .env.prod.smoke.example",
		);
	}

	const loginRes = await request.post(`${baseURL}/api/admin/login`, {
		data: { email, password },
	});

	if (!loginRes.ok()) {
		throw new Error(
			`Admin login failed: ${loginRes.status()} ${await loginRes.text()}`,
		);
	}

	const setCookieHeaders = loginRes
		.headersArray()
		.filter((h) => h.name.toLowerCase() === "set-cookie");
	for (const h of setCookieHeaders) {
		const match = h.value.match(/admin_session=([^;]+)/);
		if (match) return match[1];
	}

	throw new Error("admin_session cookie not found in login response");
}
