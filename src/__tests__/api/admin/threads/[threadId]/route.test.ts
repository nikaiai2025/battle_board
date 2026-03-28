/**
 * 単体テスト: GET /api/admin/threads/[threadId] — BOT情報付加
 *
 * See: features/admin.feature @管理者がスレッド詳細で投稿者の種別を識別できる
 *
 * テスト方針:
 *   - ThreadRepository, PostRepository, BotPostRepository, BotRepository,
 *     AuthService はモック化して外部依存を排除する
 *   - 各投稿にBOT情報（botId, botName）と投稿者種別が付加されることを検証する
 *   - 認証ガード（403）、リソース不在（404）のエラーケースを検証する
 *
 * カバレッジ対象:
 *   - 正常系: 人間・BOT・システムの混在投稿でBOT情報が正しく付加される
 *   - 認証エラー: admin_session Cookie なし → 403
 *   - リソース不在: 存在しないスレッドID → 404
 *   - エッジケース: 投稿ゼロのスレッド、全投稿がBOT、全投稿が人間
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted でモック変数を事前定義
// ---------------------------------------------------------------------------

const {
	mockVerifyAdminSession,
	mockFindThreadById,
	mockFindPostsByThreadId,
	mockFindByPostIds,
	mockFindByIds,
} = vi.hoisted(() => ({
	mockVerifyAdminSession: vi.fn(),
	mockFindThreadById: vi.fn(),
	mockFindPostsByThreadId: vi.fn(),
	mockFindByPostIds: vi.fn(),
	mockFindByIds: vi.fn(),
}));

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/auth-service", () => ({
	verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...args),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findById: (...args: unknown[]) => mockFindThreadById(...args),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findByThreadId: (...args: unknown[]) => mockFindPostsByThreadId(...args),
}));

vi.mock("@/lib/infrastructure/repositories/bot-post-repository", () => ({
	findByPostIds: (...args: unknown[]) => mockFindByPostIds(...args),
}));

vi.mock("@/lib/infrastructure/repositories/bot-repository", () => ({
	findByIds: (...args: unknown[]) => mockFindByIds(...args),
}));

vi.mock("@/lib/services/admin-service", () => ({
	deleteThread: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { GET } from "../../../../../app/api/admin/threads/[threadId]/route";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const THREAD_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const BOT_ID_1 = "bbbbbbbb-1111-2222-3333-444444444444";
const POST_ID_HUMAN = "cccccccc-1111-2222-3333-444444444444";
const POST_ID_BOT = "dddddddd-1111-2222-3333-444444444444";
const POST_ID_SYSTEM = "eeeeeeee-1111-2222-3333-444444444444";

const ADMIN_SESSION = { userId: "admin-user-id", role: "admin" };

function makeRequest(threadId: string, hasSession = true): NextRequest {
	const url = `http://localhost:3000/api/admin/threads/${threadId}`;
	const req = new NextRequest(url);
	if (hasSession) {
		// NextRequest の cookies をセットするために Cookie ヘッダーを使う
		return new NextRequest(url, {
			headers: { Cookie: "admin_session=valid-token" },
		});
	}
	return req;
}

function makeThread() {
	return {
		id: THREAD_ID,
		threadKey: "1234567890",
		boardId: "board-1",
		title: "今日の雑談",
		postCount: 3,
		datByteSize: 1024,
		createdBy: "user-1",
		createdAt: new Date("2026-03-01"),
		lastPostAt: new Date("2026-03-29"),
		isDeleted: false,
		isPinned: false,
		isDormant: false,
	};
}

function makePost(overrides: Record<string, unknown> = {}) {
	return {
		id: POST_ID_HUMAN,
		threadId: THREAD_ID,
		postNumber: 1,
		authorId: "user-1",
		displayName: "名無しさん",
		dailyId: "ABCD1234",
		body: "テスト投稿",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-29T10:00:00Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/admin/threads/[threadId] — BOT情報付加", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyAdminSession.mockResolvedValue(ADMIN_SESSION);
	});

	// --- 認証ガード ---

	it("admin_session Cookie なしの場合 403 を返す", async () => {
		const req = makeRequest(THREAD_ID, false);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toBe("FORBIDDEN");
	});

	it("admin_session が無効な場合 403 を返す", async () => {
		mockVerifyAdminSession.mockResolvedValue(null);
		const req = makeRequest(THREAD_ID);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		expect(res.status).toBe(403);
	});

	// --- リソース不在 ---

	it("存在しないスレッドID の場合 404 を返す", async () => {
		mockFindThreadById.mockResolvedValue(null);
		const req = makeRequest(THREAD_ID);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe("NOT_FOUND");
	});

	// --- 正常系: 人間・BOT・システムの混在 ---

	it("各投稿にBOT情報と投稿者種別が付加される", async () => {
		const humanPost = makePost({
			id: POST_ID_HUMAN,
			postNumber: 1,
			authorId: "user-1",
			isSystemMessage: false,
		});
		const botPost = makePost({
			id: POST_ID_BOT,
			postNumber: 2,
			authorId: null,
			isSystemMessage: false,
		});
		const systemPost = makePost({
			id: POST_ID_SYSTEM,
			postNumber: 3,
			authorId: null,
			isSystemMessage: true,
			displayName: "★システム",
		});

		mockFindThreadById.mockResolvedValue(makeThread());
		mockFindPostsByThreadId.mockResolvedValue([humanPost, botPost, systemPost]);
		mockFindByPostIds.mockResolvedValue([
			{ postId: POST_ID_BOT, botId: BOT_ID_1 },
		]);
		mockFindByIds.mockResolvedValue([
			{ id: BOT_ID_1, name: "荒らしBOT", botProfileKey: "arashi" },
		]);

		const req = makeRequest(THREAD_ID);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		expect(res.status).toBe(200);

		const body = await res.json();

		// thread が返される
		expect(body.thread.id).toBe(THREAD_ID);

		// posts が返される
		expect(body.posts).toHaveLength(3);

		// botInfoMap が返される（BOT投稿のみエントリあり）
		expect(body.botInfoMap).toBeDefined();
		expect(body.botInfoMap[POST_ID_BOT]).toEqual({
			botId: BOT_ID_1,
			botName: "荒らしBOT",
		});
		// 人間・システム投稿は botInfoMap に含まれない
		expect(body.botInfoMap[POST_ID_HUMAN]).toBeUndefined();
		expect(body.botInfoMap[POST_ID_SYSTEM]).toBeUndefined();

		// posterTypeMap が返される
		expect(body.posterTypeMap).toBeDefined();
		expect(body.posterTypeMap[POST_ID_HUMAN]).toBe("human");
		expect(body.posterTypeMap[POST_ID_BOT]).toBe("bot");
		expect(body.posterTypeMap[POST_ID_SYSTEM]).toBe("system");
	});

	// --- エッジケース: 投稿ゼロのスレッド ---

	it("投稿ゼロのスレッドでも正常に返る", async () => {
		mockFindThreadById.mockResolvedValue(makeThread());
		mockFindPostsByThreadId.mockResolvedValue([]);
		mockFindByPostIds.mockResolvedValue([]);
		mockFindByIds.mockResolvedValue([]);

		const req = makeRequest(THREAD_ID);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.posts).toHaveLength(0);
		expect(body.botInfoMap).toEqual({});
		expect(body.posterTypeMap).toEqual({});
	});

	// --- エッジケース: 全投稿がBOT ---

	it("全投稿がBOTの場合も正しく種別判定される", async () => {
		const botPost1 = makePost({
			id: POST_ID_BOT,
			postNumber: 1,
			authorId: null,
			isSystemMessage: false,
		});

		mockFindThreadById.mockResolvedValue(makeThread());
		mockFindPostsByThreadId.mockResolvedValue([botPost1]);
		mockFindByPostIds.mockResolvedValue([
			{ postId: POST_ID_BOT, botId: BOT_ID_1 },
		]);
		mockFindByIds.mockResolvedValue([
			{ id: BOT_ID_1, name: "荒らしBOT", botProfileKey: "arashi" },
		]);

		const req = makeRequest(THREAD_ID);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		const body = await res.json();

		expect(body.posterTypeMap[POST_ID_BOT]).toBe("bot");
		expect(body.botInfoMap[POST_ID_BOT].botName).toBe("荒らしBOT");
	});

	// --- エッジケース: 全投稿が人間 ---

	it("全投稿が人間の場合 botInfoMap は空", async () => {
		const humanPost = makePost({
			id: POST_ID_HUMAN,
			postNumber: 1,
			authorId: "user-1",
			isSystemMessage: false,
		});

		mockFindThreadById.mockResolvedValue(makeThread());
		mockFindPostsByThreadId.mockResolvedValue([humanPost]);
		mockFindByPostIds.mockResolvedValue([]);
		mockFindByIds.mockResolvedValue([]);

		const req = makeRequest(THREAD_ID);
		const res = await GET(req, {
			params: Promise.resolve({ threadId: THREAD_ID }),
		});
		const body = await res.json();

		expect(body.botInfoMap).toEqual({});
		expect(body.posterTypeMap[POST_ID_HUMAN]).toBe("human");
	});
});
