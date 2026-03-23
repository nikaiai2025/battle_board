/**
 * 単体テスト: GET /api/mypage/history
 *
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 * See: docs/specs/openapi.yaml > /api/mypage/history
 *
 * テスト方針:
 *   - AuthService, MypageService はモック化（Supabase に依存しない）
 *   - クエリパラメータのバリデーション振る舞いを重点的に検証する
 *   - レスポンス形式（PaginatedPostHistory）の確認
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

const mockGetPostHistory = vi.fn();
vi.mock("../../../../lib/services/mypage-service", () => ({
	getPostHistory: (...args: unknown[]) => mockGetPostHistory(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言後）
// ---------------------------------------------------------------------------

import { GET } from "../../../../app/api/mypage/history/route";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const EDGE_TOKEN = "edge-token-test-001";
const USER_ID = "user-id-test-001";

/** デフォルトの認証成功レスポンス */
const AUTH_SUCCESS = { valid: true as const, userId: USER_ID };
/** 認証失敗レスポンス */
const AUTH_FAILURE = { valid: false as const };

/** デフォルトの PaginatedPostHistory */
const DEFAULT_HISTORY = {
	posts: [],
	total: 0,
	totalPages: 0,
	page: 1,
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * テスト用 NextRequest を構築する。
 * edge-token Cookie を自動で設定する。
 */
function makeRequest(params: Record<string, string> = {}): NextRequest {
	const url = new URL("http://localhost/api/mypage/history");
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	const req = new NextRequest(url.toString(), { method: "GET" });
	// Cookie を設定する（NextRequest のテスト用ヘルパー）
	Object.defineProperty(req, "cookies", {
		value: {
			get: (name: string) => {
				if (name === "edge-token") return { value: EDGE_TOKEN };
				return undefined;
			},
		},
	});
	return req;
}

/**
 * edge-token Cookie なしの NextRequest を構築する。
 */
function makeRequestWithoutCookie(
	params: Record<string, string> = {},
): NextRequest {
	const url = new URL("http://localhost/api/mypage/history");
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	const req = new NextRequest(url.toString(), { method: "GET" });
	Object.defineProperty(req, "cookies", {
		value: {
			get: (_name: string) => undefined,
		},
	});
	return req;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /api/mypage/history", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyEdgeToken.mockResolvedValue(AUTH_SUCCESS);
		mockGetPostHistory.mockResolvedValue(DEFAULT_HISTORY);
	});

	// =========================================================================
	// 認証チェック
	// =========================================================================

	describe("認証チェック", () => {
		it("edge-token Cookie がない場合は 401 を返す", async () => {
			const req = makeRequestWithoutCookie();

			const res = await GET(req);

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.error).toBe("UNAUTHORIZED");
		});

		it("edge-token が無効な場合は 401 を返す", async () => {
			mockVerifyEdgeToken.mockResolvedValue(AUTH_FAILURE);
			const req = makeRequest();

			const res = await GET(req);

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.error).toBe("UNAUTHORIZED");
		});

		it("認証成功の場合は 200 を返す", async () => {
			const req = makeRequest();

			const res = await GET(req);

			expect(res.status).toBe(200);
		});
	});

	// =========================================================================
	// レスポンス形式
	// =========================================================================

	describe("レスポンス形式", () => {
		it("PaginatedPostHistory 形式（posts, total, totalPages, page）を返す", async () => {
			// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
			const history = {
				posts: [
					{
						id: "post-001",
						threadId: "thread-001",
						threadTitle: "テストスレッド",
						postNumber: 1,
						body: "テスト",
						createdAt: new Date("2026-03-10T12:00:00Z"),
					},
				],
				total: 1,
				totalPages: 1,
				page: 1,
			};
			mockGetPostHistory.mockResolvedValue(history);
			const req = makeRequest();

			const res = await GET(req);
			const body = await res.json();

			expect(body.posts).toHaveLength(1);
			expect(body.total).toBe(1);
			expect(body.totalPages).toBe(1);
			expect(body.page).toBe(1);
		});
	});

	// =========================================================================
	// クエリパラメータ: page バリデーション
	// =========================================================================

	describe("クエリパラメータ: page バリデーション", () => {
		it("page=2 を指定するとサービスに page=2 が渡る", async () => {
			// See: features/mypage.feature @2ページ目を表示すると51件目以降が表示される
			const req = makeRequest({ page: "2" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ page: 2 }),
			);
		});

		it("page=0 は不正値のため page=1 にフォールバックする", async () => {
			const req = makeRequest({ page: "0" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ page: 1 }),
			);
		});

		it("page=-1 は不正値のため page=1 にフォールバックする", async () => {
			const req = makeRequest({ page: "-1" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ page: 1 }),
			);
		});

		it("page=abc は不正値のため page=1 にフォールバックする", async () => {
			const req = makeRequest({ page: "abc" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ page: 1 }),
			);
		});

		it("page 未指定の場合は page=1 がデフォルト", async () => {
			const req = makeRequest();

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ page: 1 }),
			);
		});
	});

	// =========================================================================
	// クエリパラメータ: keyword バリデーション
	// =========================================================================

	describe("クエリパラメータ: keyword バリデーション", () => {
		it("keyword を指定するとサービスに渡る", async () => {
			// See: features/mypage.feature @キーワードで書き込み履歴を検索する
			const req = makeRequest({ keyword: "ボットちゃんねる" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ keyword: "ボットちゃんねる" }),
			);
		});

		it("keyword が空文字の場合は undefined として渡る（フィルタなし）", async () => {
			const req = makeRequest({ keyword: "" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ keyword: undefined }),
			);
		});

		it("keyword が空白のみの場合は undefined として渡る", async () => {
			const req = makeRequest({ keyword: "   " });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ keyword: undefined }),
			);
		});

		it("keyword が201文字の場合は200文字に切り捨てられる", async () => {
			const longKeyword = "あ".repeat(201);
			const req = makeRequest({ keyword: longKeyword });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ keyword: "あ".repeat(200) }),
			);
		});

		it("keyword が200文字の場合はそのまま渡る（境界値）", async () => {
			const keyword200 = "あ".repeat(200);
			const req = makeRequest({ keyword: keyword200 });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ keyword: keyword200 }),
			);
		});
	});

	// =========================================================================
	// クエリパラメータ: start_date / end_date バリデーション
	// =========================================================================

	describe("クエリパラメータ: start_date / end_date バリデーション", () => {
		it("YYYY-MM-DD 形式の start_date はそのまま渡る", async () => {
			// See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
			const req = makeRequest({ start_date: "2026-03-10" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ startDate: "2026-03-10" }),
			);
		});

		it("YYYY-MM-DD 形式の end_date はそのまま渡る", async () => {
			const req = makeRequest({ end_date: "2026-03-15" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ endDate: "2026-03-15" }),
			);
		});

		it("不正な日付フォーマット（YYYY/MM/DD）は undefined として渡る", async () => {
			const req = makeRequest({ start_date: "2026/03/10" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ startDate: undefined }),
			);
		});

		it("存在しない日付（2026-02-30）は undefined として渡る", async () => {
			const req = makeRequest({ start_date: "2026-02-30" });

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({ startDate: undefined }),
			);
		});

		it("start_date と end_date を両方指定するとサービスに渡る", async () => {
			// See: features/mypage.feature @キーワードと日付範囲を組み合わせて検索する
			const req = makeRequest({
				start_date: "2026-03-10",
				end_date: "2026-03-15",
			});

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({
					startDate: "2026-03-10",
					endDate: "2026-03-15",
				}),
			);
		});

		it("日付未指定の場合は undefined として渡る", async () => {
			const req = makeRequest();

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({
					startDate: undefined,
					endDate: undefined,
				}),
			);
		});
	});

	// =========================================================================
	// 全パラメータ組み合わせ
	// =========================================================================

	describe("全パラメータ組み合わせ", () => {
		it("page + keyword + start_date + end_date を全て指定するとサービスに渡る", async () => {
			const req = makeRequest({
				page: "2",
				keyword: "草",
				start_date: "2026-03-10",
				end_date: "2026-03-15",
			});

			await GET(req);

			expect(mockGetPostHistory).toHaveBeenCalledWith(
				USER_ID,
				expect.objectContaining({
					page: 2,
					keyword: "草",
					startDate: "2026-03-10",
					endDate: "2026-03-15",
				}),
			);
		});
	});

	// =========================================================================
	// 異常系: サービスエラー
	// =========================================================================

	describe("異常系: サービスエラー", () => {
		it("MypageService.getPostHistory がエラーをスローした場合は 500 系エラーが発生する", async () => {
			mockGetPostHistory.mockRejectedValue(
				new Error("MypageService.getPostHistory failed"),
			);
			const req = makeRequest();

			await expect(GET(req)).rejects.toThrow(
				"MypageService.getPostHistory failed",
			);
		});
	});
});
