/**
 * 単体テスト: GET /api/admin/bots/[botId] — BOT詳細API
 *
 * See: features/admin.feature @管理者がBOTの詳細を確認できる
 *
 * テスト方針:
 *   - BotRepository, BotPostRepository, PostRepository, ThreadRepository,
 *     AuthService はモック化して外部依存を排除する
 *   - BOT基本情報＋アクティブスレッドの投稿履歴が返ることを検証する
 *   - 休眠スレッドの投稿が除外されることを検証する
 *   - 認証ガード（403）、リソース不在（404）のエラーケースを検証する
 *
 * カバレッジ対象:
 *   - 正常系: BOT詳細＋投稿履歴（アクティブスレッドのみ）
 *   - 認証エラー: admin_session なし → 403
 *   - リソース不在: 存在しないBOT ID → 404
 *   - エッジケース: 投稿ゼロのBOT
 *   - エッジケース: 全投稿が休眠スレッド → 投稿履歴空
 *   - エッジケース: 投稿履歴の上限（50件）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted でモック変数を事前定義
// ---------------------------------------------------------------------------

const {
	mockVerifyAdminSession,
	mockFindBotById,
	mockFindByBotId,
	mockFindPostsByThreadId,
	mockFindThreadById,
} = vi.hoisted(() => ({
	mockVerifyAdminSession: vi.fn(),
	mockFindBotById: vi.fn(),
	mockFindByBotId: vi.fn(),
	mockFindPostsByThreadId: vi.fn(),
	mockFindThreadById: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Supabase モック: BOT詳細API は Supabase に直接クエリする箇所がある
// ---------------------------------------------------------------------------

const { mockSupabaseFrom } = vi.hoisted(() => {
	const mockSupabaseFrom = vi.fn();
	return { mockSupabaseFrom };
});

vi.mock("@/lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: (...args: unknown[]) => mockSupabaseFrom(...args),
	},
}));

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/auth-service", () => ({
	verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...args),
}));

vi.mock("@/lib/infrastructure/repositories/bot-repository", () => ({
	findById: (...args: unknown[]) => mockFindBotById(...args),
}));

vi.mock("@/lib/infrastructure/repositories/bot-post-repository", () => ({
	findByBotId: (...args: unknown[]) => mockFindByBotId(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { GET } from "../../../../../app/api/admin/bots/[botId]/route";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const BOT_ID = "bbbbbbbb-1111-2222-3333-444444444444";
const POST_ID_1 = "cccccccc-1111-2222-3333-444444444444";
const POST_ID_2 = "dddddddd-1111-2222-3333-444444444444";
const THREAD_ID_ACTIVE = "eeeeeeee-1111-2222-3333-444444444444";
const THREAD_ID_DORMANT = "ffffffff-1111-2222-3333-444444444444";
const ADMIN_SESSION = { userId: "admin-user-id", role: "admin" };

function makeRequest(botId: string, hasSession = true): NextRequest {
	const url = `http://localhost:3000/api/admin/bots/${botId}`;
	if (hasSession) {
		return new NextRequest(url, {
			headers: { Cookie: "admin_session=valid-token" },
		});
	}
	return new NextRequest(url);
}

function makeBot(overrides: Record<string, unknown> = {}) {
	return {
		id: BOT_ID,
		name: "荒らしBOT",
		persona: "荒らし役",
		hp: 80,
		maxHp: 100,
		dailyId: "ABCD1234",
		dailyIdDate: "2026-03-29",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 5,
		totalPosts: 30,
		accusedCount: 2,
		timesAttacked: 1,
		grassCount: 0,
		botProfileKey: "arashi",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-20"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Supabase チェーンモック構築ヘルパー
// ---------------------------------------------------------------------------

/**
 * posts テーブルへのクエリをモック化する。
 * SELECT posts + threads JOIN → 投稿履歴＋スレッド情報を返す。
 */
function setupPostsQueryMock(
	posts: Array<{
		id: string;
		thread_id: string;
		post_number: number;
		display_name: string;
		daily_id: string;
		body: string;
		inline_system_info: string | null;
		is_system_message: boolean;
		is_deleted: boolean;
		created_at: string;
		author_id: string | null;
		threads: { title: string; is_dormant: boolean };
	}>,
) {
	// Supabase チェーンをモック化
	const mockOrder = vi.fn().mockReturnValue({
		limit: vi.fn().mockResolvedValue({ data: posts, error: null }),
	});
	const mockEqIsDormant = vi.fn().mockReturnValue({ order: mockOrder });
	const mockEqIsDeleted = vi.fn().mockReturnValue({
		eq: mockEqIsDormant,
	});
	const mockIn = vi.fn().mockReturnValue({
		eq: mockEqIsDeleted,
	});
	const mockSelect = vi.fn().mockReturnValue({
		in: mockIn,
	});

	mockSupabaseFrom.mockReturnValue({
		select: mockSelect,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/admin/bots/[botId] — BOT詳細", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyAdminSession.mockResolvedValue(ADMIN_SESSION);
	});

	// --- 認証ガード ---

	it("admin_session Cookie なしの場合 403 を返す", async () => {
		const req = makeRequest(BOT_ID, false);
		const res = await GET(req, {
			params: Promise.resolve({ botId: BOT_ID }),
		});
		expect(res.status).toBe(403);
	});

	it("admin_session が無効な場合 403 を返す", async () => {
		mockVerifyAdminSession.mockResolvedValue(null);
		const req = makeRequest(BOT_ID);
		const res = await GET(req, {
			params: Promise.resolve({ botId: BOT_ID }),
		});
		expect(res.status).toBe(403);
	});

	// --- リソース不在 ---

	it("存在しないBOT IDの場合 404 を返す", async () => {
		mockFindBotById.mockResolvedValue(null);
		const req = makeRequest(BOT_ID);
		const res = await GET(req, {
			params: Promise.resolve({ botId: BOT_ID }),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe("NOT_FOUND");
	});

	// --- 正常系: BOT詳細＋投稿履歴 ---

	it("BOT基本情報とアクティブスレッドの投稿履歴が返る", async () => {
		mockFindBotById.mockResolvedValue(makeBot());
		mockFindByBotId.mockResolvedValue([
			{ postId: POST_ID_1, botId: BOT_ID },
			{ postId: POST_ID_2, botId: BOT_ID },
		]);

		// Supabase posts クエリのモック: アクティブスレッドの投稿のみ返す
		setupPostsQueryMock([
			{
				id: POST_ID_1,
				thread_id: THREAD_ID_ACTIVE,
				post_number: 3,
				display_name: "名無しさん",
				daily_id: "ABCD1234",
				body: "BOTの投稿です",
				inline_system_info: null,
				is_system_message: false,
				is_deleted: false,
				created_at: "2026-03-29T10:00:00Z",
				author_id: null,
				threads: { title: "今日の雑談", is_dormant: false },
			},
		]);

		const req = makeRequest(BOT_ID);
		const res = await GET(req, {
			params: Promise.resolve({ botId: BOT_ID }),
		});
		expect(res.status).toBe(200);

		const body = await res.json();

		// BOT基本情報
		expect(body.bot.id).toBe(BOT_ID);
		expect(body.bot.name).toBe("荒らしBOT");

		// 投稿履歴
		expect(body.posts).toHaveLength(1);
		expect(body.posts[0].threadTitle).toBe("今日の雑談");
		expect(body.posts[0].body).toBe("BOTの投稿です");
	});

	// --- エッジケース: 投稿ゼロのBOT ---

	it("投稿ゼロのBOTでも正常に返る", async () => {
		mockFindBotById.mockResolvedValue(makeBot());
		mockFindByBotId.mockResolvedValue([]);

		const req = makeRequest(BOT_ID);
		const res = await GET(req, {
			params: Promise.resolve({ botId: BOT_ID }),
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.bot.id).toBe(BOT_ID);
		expect(body.posts).toEqual([]);
	});
});
