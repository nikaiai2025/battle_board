/**
 * E2E フィクスチャ: テストデータ操作
 *
 * 環境差分（ローカル / 本番）を吸収するデータ操作フィクスチャ。
 * seedThread はテストデータ作成、cleanup はテストデータ削除を担う。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.1.1 環境抽象化フィクスチャ
 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
 */

import type { APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// 共通ヘルパー
// ---------------------------------------------------------------------------

function supabaseHeaders(
	prefer = "return=representation",
): Record<string, string> {
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
	return {
		apikey: key,
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
		Prefer: prefer,
	};
}

function supabaseUrl(): string {
	return process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
}

// ---------------------------------------------------------------------------
// seedThread — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境でテスト用スレッドをシードする。
 *
 * Supabase REST API 経由で users → threads → posts を直接 INSERT する。
 * テストの前提データ作成用。認証済みユーザーがフィクスチャで別途作成される前提のため、
 * シードデータは「別ユーザーが作成したスレッド」として投入する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.7 動的ルートの扱い
 */
export async function seedThreadLocal(
	request: APIRequestContext,
): Promise<{ threadId: string; threadKey: string }> {
	const headers = supabaseHeaders();
	const base = supabaseUrl();
	const suffix = Date.now();

	// 1. シード用ユーザー作成（テスト認証ユーザーとは別）
	const userRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `seed-auth-${suffix}`,
			author_id_seed: `seed-${suffix}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const seedUserId = users[0].id;

	// 2. スレッド作成
	const threadKey = String(Math.floor(suffix / 1000));
	const threadRes = await request.post(`${base}/rest/v1/threads`, {
		headers,
		data: {
			board_id: "battleboard",
			title: "[E2E] テスト用スレッド",
			post_count: 1,
			last_post_at: new Date().toISOString(),
			thread_key: threadKey,
			created_by: seedUserId,
		},
	});
	const threads = (await threadRes.json()) as Array<{ id: string }>;
	const threadId = threads[0].id;

	// 3. >>1 レス作成
	await request.post(`${base}/rest/v1/posts`, {
		headers,
		data: {
			thread_id: threadId,
			post_number: 1,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "ABCDE",
			body: "E2Eテスト用の最初のレスです。",
			is_system_message: false,
			is_deleted: false,
		},
	});

	return { threadId, threadKey };
}

// ---------------------------------------------------------------------------
// seedThread — 本番実装
// ---------------------------------------------------------------------------

/**
 * 本番環境でテスト用スレッドを作成する。
 *
 * 認証済みユーザーの edge-token で POST /api/threads を叩く。
 * アプリの通常フローで作成するため、全カラムが正しく設定される。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
 */
export async function seedThreadProd(
	request: APIRequestContext,
	baseURL: string,
	edgeToken: string,
): Promise<{ threadId: string; threadKey: string }> {
	const res = await request.post(`${baseURL}/api/threads`, {
		headers: {
			"Content-Type": "application/json",
			Cookie: `edge-token=${edgeToken}`,
		},
		data: {
			title: "[SMOKE] E2Eテスト用スレッド",
			body: "スモークテスト用の最初のレスです。",
			boardId: "battleboard",
		},
	});

	if (!res.ok()) {
		throw new Error(
			`seedThreadProd failed: ${res.status()} ${await res.text()}`,
		);
	}

	// POST /api/threads は Thread オブジェクトを直接返す（{ id, threadKey, ... }）
	// See: src/app/api/threads/route.ts > NextResponse.json(result.thread, { status: 201 })
	// See: src/lib/domain/models/thread.ts > Thread.id, Thread.threadKey
	const body = (await res.json()) as {
		id: string;
		threadKey: string;
	};
	return { threadId: body.id, threadKey: body.threadKey };
}

// ---------------------------------------------------------------------------
// cleanup — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境のテストデータを全件削除する。
 *
 * Service Role Key で外部キー制約の順序を考慮しながら削除する。
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 */
export async function cleanupLocal(request: APIRequestContext): Promise<void> {
	const base = supabaseUrl();
	const headers = supabaseHeaders("return=minimal");

	// 外部キー制約の順序: posts → threads → users
	// edge_tokens は authenticate フィクスチャが管理するため cleanup 対象外。
	// cleanupLocal は beforeEach で呼ばれるが、authenticate フィクスチャはフィクスチャの
	// セットアップ時（beforeEach より前）に edge_token を作成する。
	// ここで edge_tokens を全件削除すると認証必須ページが 401 エラーで失敗するため除外する。
	// users も同様の理由で削除しない（テスト間で独立性は十分）。
	await request.delete(
		`${base}/rest/v1/posts?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
	await request.delete(
		`${base}/rest/v1/threads?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
}

// ---------------------------------------------------------------------------
// cleanup — 本番実装
// ---------------------------------------------------------------------------

/**
 * 本番環境のテストデータを管理者API経由で個別削除する。
 *
 * 管理者API（DELETE /api/admin/threads/{threadId}）を使用する。
 * テストで作成したスレッドのみを削除し、一般ユーザーのデータには触れない。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.3.2 検証範囲 > 管理者操作
 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
 * See: src/app/api/admin/threads/[threadId]/route.ts
 */
export async function cleanupProd(
	request: APIRequestContext,
	baseURL: string,
	adminSessionToken: string,
	threadIds: string[],
): Promise<void> {
	for (const threadId of threadIds) {
		const res = await request.delete(
			`${baseURL}/api/admin/threads/${threadId}`,
			{
				headers: {
					Cookie: `admin_session=${adminSessionToken}`,
				},
			},
		);
		// 404 はすでに削除済み → 問題なし
		if (!res.ok() && res.status() !== 404) {
			console.warn(
				`[cleanup] Failed to delete thread ${threadId}: ${res.status()}`,
			);
		}
	}
}
