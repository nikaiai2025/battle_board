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
	// ランダム末尾3桁でthread_keyの一意性を保証（同一秒内の複数テスト対策）
	const rand = Math.floor(Math.random() * 900) + 100;

	// 1. シード用ユーザー作成（テスト認証ユーザーとは別）
	const userRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `seed-auth-${suffix}-${rand}`,
			author_id_seed: `seed-${suffix}-${rand}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const seedUserId = users[0].id;

	// 2. スレッド作成
	const threadKey = `${Math.floor(suffix / 1000)}${rand}`;
	const threadRes = await request.post(`${base}/rest/v1/threads`, {
		headers,
		data: {
			board_id: "livebot",
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
			boardId: "livebot",
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
// seedThreadWithAnchorPosts — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境でアンカー付きレスを含むテスト用スレッドをシードする。
 *
 * @anchor_popup と @post_number_display のE2Eテスト用。
 * レス5件（アンカー >>1, >>2 を含む）を持つスレッドを作成する。
 *
 * See: features/thread.feature @anchor_popup
 * See: features/thread.feature @post_number_display
 * See: tmp/workers/bdd-architect_TASK-215/design.md §3.1
 */
export async function seedThreadWithAnchorPostsLocal(
	request: APIRequestContext,
): Promise<{ threadId: string; threadKey: string }> {
	const headers = supabaseHeaders();
	const base = supabaseUrl();
	const suffix = Date.now();
	// ランダム末尾3桁でthread_keyの一意性を保証（同一秒内の複数テスト対策）
	const rand = Math.floor(Math.random() * 900) + 100;

	// 1. シード用ユーザー作成
	const userRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `seed-anchor-${suffix}-${rand}`,
			author_id_seed: `seed-anchor-${suffix}-${rand}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const seedUserId = users[0].id;

	// 2. スレッド作成
	const threadKey = `${Math.floor(suffix / 1000)}${rand}`;
	const threadRes = await request.post(`${base}/rest/v1/threads`, {
		headers,
		data: {
			board_id: "livebot",
			title: "[E2E] アンカーテスト用スレッド",
			post_count: 5,
			last_post_at: new Date().toISOString(),
			thread_key: threadKey,
			created_by: seedUserId,
		},
	});
	const threads = (await threadRes.json()) as Array<{ id: string }>;
	const threadId = threads[0].id;

	// 3. レス5件をバッチINSERT
	// レス1: 通常レス、レス2: >>1 アンカー、レス3: >>2 アンカー（ネスト用）
	// レス4: >>999 存在しないアンカー、レス5: post_number_display検証用
	const posts = [
		{
			thread_id: threadId,
			post_number: 1,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "ABCDE",
			body: "こんにちは",
			is_system_message: false,
			is_deleted: false,
		},
		{
			thread_id: threadId,
			post_number: 2,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "FGHIJ",
			body: ">>1 よろしく",
			is_system_message: false,
			is_deleted: false,
		},
		{
			thread_id: threadId,
			post_number: 3,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "KLMNO",
			body: ">>2 さらに返信",
			is_system_message: false,
			is_deleted: false,
		},
		{
			thread_id: threadId,
			post_number: 4,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "PQRST",
			body: ">>999 テスト",
			is_system_message: false,
			is_deleted: false,
		},
		{
			thread_id: threadId,
			post_number: 5,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "UVWXY",
			body: "テスト本文",
			is_system_message: false,
			is_deleted: false,
		},
	];

	await request.post(`${base}/rest/v1/posts`, {
		headers,
		data: posts,
	});

	return { threadId, threadKey };
}

// ---------------------------------------------------------------------------
// seedThreadWithAnchorPosts — 本番実装
// ---------------------------------------------------------------------------

/**
 * 本番環境でアンカー付きレスを含むテスト用スレッドを作成する。
 *
 * 認証済みユーザーのedge-tokenで通常のAPIフローを使い書き込む。
 *
 * See: features/thread.feature @anchor_popup
 * See: features/thread.feature @post_number_display
 */
export async function seedThreadWithAnchorPostsProd(
	request: APIRequestContext,
	baseURL: string,
	edgeToken: string,
): Promise<{ threadId: string; threadKey: string }> {
	const cookieHeader = { Cookie: `edge-token=${edgeToken}` };
	const jsonHeaders = {
		"Content-Type": "application/json",
		...cookieHeader,
	};

	// 1. スレッド作成（>>1 = "こんにちは"）
	const createRes = await request.post(`${baseURL}/api/threads`, {
		headers: jsonHeaders,
		data: {
			title: "[SMOKE] アンカーテスト用スレッド",
			body: "こんにちは",
			boardId: "livebot",
		},
	});
	if (!createRes.ok()) {
		throw new Error(
			`seedThreadWithAnchorPostsProd: thread creation failed: ${createRes.status()} ${await createRes.text()}`,
		);
	}
	const thread = (await createRes.json()) as {
		id: string;
		threadKey: string;
	};

	// 2-5. レスを順番に書き込み
	const replyBodies = [
		">>1 よろしく",
		">>2 さらに返信",
		">>999 テスト",
		"テスト本文",
	];
	for (const body of replyBodies) {
		const res = await request.post(
			`${baseURL}/api/threads/${thread.id}/posts`,
			{
				headers: jsonHeaders,
				data: { body },
			},
		);
		if (!res.ok()) {
			throw new Error(
				`seedThreadWithAnchorPostsProd: post failed: ${res.status()} ${await res.text()}`,
			);
		}
	}

	return { threadId: thread.id, threadKey: thread.threadKey };
}

// ---------------------------------------------------------------------------
// seedThreadWithManyPosts — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境で大量レスを含むテスト用スレッドをシードする。
 *
 * ポーリングテスト（@pagination B-1, B-2）用。
 * 指定件数のレスをバッチINSERTする。
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-215/design.md §3.2
 */
export async function seedThreadWithManyPostsLocal(
	request: APIRequestContext,
	postCount: number,
): Promise<{ threadId: string; threadKey: string; seedUserId: string }> {
	const headers = supabaseHeaders();
	const base = supabaseUrl();
	const suffix = Date.now();
	const rand = Math.floor(Math.random() * 900) + 100;

	// 1. シード用ユーザー作成
	const userRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `seed-many-${suffix}-${rand}`,
			author_id_seed: `seed-many-${suffix}-${rand}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const seedUserId = users[0].id;

	// 2. スレッド作成
	const threadKey = `${Math.floor(suffix / 1000)}${rand}`;
	const threadRes = await request.post(`${base}/rest/v1/threads`, {
		headers,
		data: {
			board_id: "livebot",
			title: "[E2E] ポーリングテスト用スレッド",
			post_count: postCount,
			last_post_at: new Date().toISOString(),
			thread_key: threadKey,
			created_by: seedUserId,
		},
	});
	const threads = (await threadRes.json()) as Array<{ id: string }>;
	const threadId = threads[0].id;

	// 3. レスをバッチINSERT（Supabase REST APIは配列POSTをサポート）
	// 大量データを一括投入するため、100件ずつバッチ送信する
	const batchSize = 100;
	for (let batchStart = 0; batchStart < postCount; batchStart += batchSize) {
		const batchEnd = Math.min(batchStart + batchSize, postCount);
		const posts = Array.from({ length: batchEnd - batchStart }, (_, i) => ({
			thread_id: threadId,
			post_number: batchStart + i + 1,
			author_id: seedUserId,
			display_name: "名無しさん",
			daily_id: "ABCDE",
			body: `テストレス ${batchStart + i + 1}`,
			is_system_message: false,
			is_deleted: false,
		}));
		await request.post(`${base}/rest/v1/posts`, {
			headers,
			data: posts,
		});
	}

	return { threadId, threadKey, seedUserId };
}

// ---------------------------------------------------------------------------
// seedEliminatedBotThread — ローカル実装
// ---------------------------------------------------------------------------

/**
 * ローカル環境で撃破済みBOTのレスを含むテスト用スレッドをシードする。
 *
 * 撃破済みBOT表示テスト（B-3, B-4）用。
 * BOTユーザー・botsテーブル・attacksテーブルを含む完全な状態を構築する。
 *
 * See: features/bot_system.feature @撃破済みボットのレスはWebブラウザで目立たない表示になる
 * See: tmp/workers/bdd-architect_TASK-215/design.md §3.3
 */
export async function seedEliminatedBotThreadLocal(
	request: APIRequestContext,
): Promise<{ threadId: string; threadKey: string; botPostNumber: number }> {
	const headers = supabaseHeaders();
	const base = supabaseUrl();
	const suffix = Date.now();
	const rand = Math.floor(Math.random() * 900) + 100;

	// 1. 通常ユーザー作成
	const userRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `seed-bot-test-${suffix}-${rand}`,
			author_id_seed: `seed-bot-test-${suffix}-${rand}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const users = (await userRes.json()) as Array<{ id: string }>;
	const normalUserId = users[0].id;

	// 2. BOTユーザー作成
	const botUserRes = await request.post(`${base}/rest/v1/users`, {
		headers,
		data: {
			auth_token: `seed-bot-user-${suffix}-${rand}`,
			author_id_seed: `seed-bot-user-${suffix}-${rand}`,
			is_premium: false,
			is_verified: false,
		},
	});
	const botUsers = (await botUserRes.json()) as Array<{ id: string }>;
	const botUserId = botUsers[0].id;

	// 3. botsテーブルに撃破済みBOT登録
	// botsテーブルには user_id / status カラムが存在しないため除外する。
	// persona, daily_id, daily_id_date は必須カラム。
	// is_active=false で撃破済み状態を表現する。
	const botRes = await request.post(`${base}/rest/v1/bots`, {
		headers,
		data: {
			name: "荒らし役",
			persona: "E2Eテスト用荒らし役",
			hp: 0,
			max_hp: 10,
			is_active: false,
			daily_id: `TEST${suffix}`.slice(0, 8),
			daily_id_date: new Date().toISOString().slice(0, 10),
		},
	});
	const botRows = (await botRes.json()) as Array<{ id: string }>;
	const botId = botRows[0].id;

	// 4. スレッド作成
	const threadKey = `${Math.floor(suffix / 1000)}${rand}`;
	const threadRes = await request.post(`${base}/rest/v1/threads`, {
		headers,
		data: {
			board_id: "livebot",
			title: "[E2E] BOT表示テスト用スレッド",
			post_count: 3,
			last_post_at: new Date().toISOString(),
			thread_key: threadKey,
			created_by: normalUserId,
		},
	});
	const threads = (await threadRes.json()) as Array<{ id: string }>;
	const threadId = threads[0].id;

	// 5. レス投入（通常レス + BOTレス）
	const posts = [
		{
			thread_id: threadId,
			post_number: 1,
			author_id: normalUserId,
			display_name: "名無しさん",
			daily_id: "ABCDE",
			body: "通常ユーザーのレスです。",
			is_system_message: false,
			is_deleted: false,
		},
		{
			thread_id: threadId,
			post_number: 2,
			author_id: botUserId,
			display_name: "名無しさん",
			daily_id: "ZZZZZ",
			body: "なんJほんま覇権やな",
			is_system_message: false,
			is_deleted: false,
		},
		{
			thread_id: threadId,
			post_number: 3,
			author_id: normalUserId,
			display_name: "名無しさん",
			daily_id: "ABCDE",
			body: "通常ユーザーの2レス目です。",
			is_system_message: false,
			is_deleted: false,
		},
	];

	// return=representation でpost_id(UUID)を取得する必要がある。
	// bot_postsレコード作成のためにpostsのUUIDが必要。
	// See: tmp/workers/bdd-architect_TASK-219/design.md §6 E2Eフィクスチャ不備の指摘
	const postsRes = await request.post(`${base}/rest/v1/posts`, {
		headers,
		data: posts,
	});
	const insertedPosts = (await postsRes.json()) as Array<{
		id: string;
		post_number: number;
	}>;

	// 6. bot_posts紐付けレコード作成
	// posts[1] (post_number: 2) がBOTレスなので、そのIDとbotIdを紐付ける
	const botPost = insertedPosts.find((p) => p.post_number === 2);
	if (!botPost) {
		throw new Error(
			"seedEliminatedBotThreadLocal: BOTレス(post_number:2)が見つかりません",
		);
	}

	await request.post(`${base}/rest/v1/bot_posts`, {
		headers: supabaseHeaders("return=minimal"),
		data: {
			post_id: botPost.id,
			bot_id: botId,
		},
	});

	return { threadId, threadKey, botPostNumber: 2 };
}

// ---------------------------------------------------------------------------
// insertPostLocal — 単一レス追加（ポーリングテスト用）
// ---------------------------------------------------------------------------

/**
 * ローカル環境で単一レスをDB直接INSERTする。
 *
 * ポーリングテストで「テスト中にレスが追加される」状態を作るために使用する。
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-215/design.md §3.2
 */
export async function insertPostLocal(
	request: APIRequestContext,
	threadId: string,
	postNumber: number,
	authorId: string,
	body: string,
): Promise<void> {
	const headers = supabaseHeaders();
	const base = supabaseUrl();

	await request.post(`${base}/rest/v1/posts`, {
		headers,
		data: {
			thread_id: threadId,
			post_number: postNumber,
			author_id: authorId,
			display_name: "名無しさん",
			daily_id: "NEWID",
			body,
			is_system_message: false,
			is_deleted: false,
		},
	});

	// thread.post_count も更新
	await request.patch(`${base}/rest/v1/threads?id=eq.${threadId}`, {
		headers: supabaseHeaders("return=minimal"),
		data: {
			post_count: postNumber,
			last_post_at: new Date().toISOString(),
		},
	});
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
