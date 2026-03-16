/**
 * E2E テストヘルパー: データベースクリーンアップ
 *
 * テスト前に Supabase Local DB の主要テーブルをクリーンアップするヘルパー。
 * basic-flow.spec.ts および navigation.spec.ts で共有する。
 *
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 */

import type { APIRequestContext } from "@playwright/test";

/**
 * テスト前に Supabase Local DB の主要テーブルをクリーンアップする。
 *
 * テスト間の独立性を保証するため、各テスト前に実行する。
 * Service Role Key を使って全レコードを削除する。
 *
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 *
 * @param request - Playwright の APIRequestContext オブジェクト
 */
export async function cleanupDatabase(
	request: APIRequestContext,
): Promise<void> {
	const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

	const headers = {
		apikey: serviceRoleKey,
		Authorization: `Bearer ${serviceRoleKey}`,
		"Content-Type": "application/json",
		Prefer: "return=minimal",
	};

	// posts → threads の順で削除（外部キー制約を考慮）
	await request.delete(
		`${supabaseUrl}/rest/v1/posts?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
	await request.delete(
		`${supabaseUrl}/rest/v1/threads?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
	// edge_tokens（認証トークン）も削除
	await request.delete(
		`${supabaseUrl}/rest/v1/edge_tokens?id=neq.00000000-0000-0000-0000-000000000000`,
		{ headers },
	);
}

/**
 * Supabase REST API を使ってシードデータを投入する。
 *
 * 動的ルートのスモークテスト用にスレッドとレスのシードデータを DB に直接 INSERT する。
 * threads.created_by（外部キー）の制約を満たすため、先にテスト用ユーザーを作成する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.5.7 動的ルートの扱い
 * See: supabase/migrations/00001_create_tables.sql > threads テーブル定義
 *
 * @param request - Playwright の APIRequestContext オブジェクト
 * @returns 作成したスレッドの ID
 */
export async function seedThreadWithPost(
	request: APIRequestContext,
): Promise<{ threadId: string }> {
	const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

	const headers = {
		apikey: serviceRoleKey,
		Authorization: `Bearer ${serviceRoleKey}`,
		"Content-Type": "application/json",
		Prefer: "return=representation",
	};

	// スレッド作成に必要なユーザーを作成する（threads.created_by の外部キー制約）
	// See: supabase/migrations/00001_create_tables.sql > users テーブル
	const userRes = await request.post(`${supabaseUrl}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `smoke-test-token-${Date.now()}`,
			author_id_seed: `smoke-test-seed-${Date.now()}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const userId = users[0].id;

	// スレッドを投入（実際のDBカラム名に合わせる）
	// See: supabase/migrations/00001_create_tables.sql > threads テーブル
	const threadKey = String(Math.floor(Date.now() / 1000));
	const threadRes = await request.post(`${supabaseUrl}/rest/v1/threads`, {
		headers,
		data: {
			board_id: "battleboard",
			title: "スモークテスト用スレッド",
			post_count: 1,
			last_post_at: new Date().toISOString(),
			thread_key: threadKey,
			created_by: userId,
		},
	});

	const threads = (await threadRes.json()) as Array<{ id: string }>;
	const threadId = threads[0].id;

	// レス（>>1）を投入
	// See: supabase/migrations/00001_create_tables.sql > posts テーブル
	await request.post(`${supabaseUrl}/rest/v1/posts`, {
		headers,
		data: {
			thread_id: threadId,
			post_number: 1,
			author_id: userId,
			display_name: "名無しさん",
			daily_id: "ABCDE",
			body: "スモークテスト用の最初のレスです。",
			is_system_message: false,
			is_deleted: false,
		},
	});

	return { threadId };
}
