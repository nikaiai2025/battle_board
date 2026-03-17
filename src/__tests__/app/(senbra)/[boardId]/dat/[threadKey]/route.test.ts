/**
 * 単体テスト: GET /{boardId}/dat/{threadKey}.dat — Cache-Control ヘッダ検証
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 * See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
 *
 * テスト方針:
 *   - ThreadRepository / PostRepository はモック化
 *   - DatFormatter, ShiftJisEncoder はモック化
 *   - 全レスポンス（200 / 206 / 304）に Cache-Control: no-cache が含まれることを検証する
 *   - RFC 7234 §4.2.2 ヒューリスティックキャッシュ防止の対応確認
 *
 * Sprint-51 TASK-145: Cache-Control: no-cache ヘッダ追加
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const {
	mockFindByThreadKey,
	mockFindByThreadId,
	mockBuildDat,
	mockEncode,
	MockDatFormatter,
	MockShiftJisEncoder,
} = vi.hoisted(() => {
	const mockFindByThreadKey = vi.fn();
	const mockFindByThreadId = vi.fn();
	const mockBuildDat = vi.fn();
	const mockEncode = vi.fn();

	function MockDatFormatter(this: unknown) {
		(this as Record<string, unknown>).buildDat = (...args: unknown[]) =>
			mockBuildDat(...args);
	}

	function MockShiftJisEncoder(this: unknown) {
		(this as Record<string, unknown>).encode = (...args: unknown[]) =>
			mockEncode(...args);
	}

	return {
		mockFindByThreadKey,
		mockFindByThreadId,
		mockBuildDat,
		mockEncode,
		MockDatFormatter,
		MockShiftJisEncoder,
	};
});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findByThreadKey: (...args: unknown[]) => mockFindByThreadKey(...args),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findByThreadId: (...args: unknown[]) => mockFindByThreadId(...args),
}));

vi.mock("@/lib/infrastructure/adapters/dat-formatter", () => ({
	DatFormatter: MockDatFormatter,
}));

vi.mock("@/lib/infrastructure/encoding/shift-jis", () => ({
	ShiftJisEncoder: MockShiftJisEncoder,
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { GET } from "@/app/(senbra)/[boardId]/dat/[threadKey]/route";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * テスト用スレッドオブジェクトを生成する。
 */
function makeThread(lastPostAt: Date) {
	return {
		id: "thread-uuid-001",
		boardId: "test",
		threadKey: "1234567890",
		title: "テストスレ",
		lastPostAt,
		postCount: 5,
		datByteSize: 100,
		isDeleted: false,
	};
}

/**
 * GET リクエストを生成する。
 *
 * @param threadKey - スレッドキー
 * @param ifModifiedSince - If-Modified-Since ヘッダ（省略可）
 * @param range - Range ヘッダ（省略可）
 */
function createGetRequest(
	threadKey: string,
	options: { ifModifiedSince?: string; range?: string } = {},
): Request {
	return new Request(
		`http://localhost/test/dat/${threadKey}.dat`,
		{
			method: "GET",
			headers: {
				...(options.ifModifiedSince
					? { "if-modified-since": options.ifModifiedSince }
					: {}),
				...(options.range ? { range: options.range } : {}),
			},
		},
	);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /{boardId}/dat/{threadKey}.dat — Cache-Control ヘッダ検証", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルト: encode は 10バイトのBufferを返す（差分テスト用）
		mockEncode.mockReturnValue(Buffer.from("0123456789"));
		// デフォルト: buildDat は空文字を返す
		mockBuildDat.mockReturnValue("");
		// デフォルト: findByThreadId は空配列を返す
		mockFindByThreadId.mockResolvedValue([]);
	});

	// =========================================================================
	// 404 Not Found — スレッドが存在しない場合
	// =========================================================================

	describe("404 Not Found", () => {
		it("正常: スレッドが存在しない場合、404 が返される", async () => {
			mockFindByThreadKey.mockResolvedValue(null);

			const req = createGetRequest("9999999999");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "9999999999",
					}),
				},
			);

			expect(res.status).toBe(404);
		});
	});

	// =========================================================================
	// 200 OK — Cache-Control ヘッダの確認
	// =========================================================================

	describe("200 OK — Cache-Control ヘッダ", () => {
		it("正常: 200 レスポンスに Cache-Control: no-cache が含まれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
			// Cache-Control: no-cache により専ブラがヒューリスティックキャッシュを適用しないことを保証する
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));

			const req = createGetRequest("1234567890");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});

		it("正常: 200 レスポンスに Last-Modified ヘッダが含まれる", async () => {
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));

			const req = createGetRequest("1234567890");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Last-Modified")).toBeTruthy();
		});
	});

	// =========================================================================
	// 304 Not Modified — Cache-Control ヘッダの確認
	// =========================================================================

	describe("304 Not Modified — Cache-Control ヘッダ", () => {
		it("正常: 304 レスポンスに Cache-Control: no-cache が含まれる", async () => {
			// 304 に Cache-Control がないと、専ブラが以降のリクエストでヒューリスティックキャッシュを
			// 再適用してしまう可能性がある（RFC 7234 §4.3.4）
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));

			const req = createGetRequest("1234567890", {
				ifModifiedSince: sinceDate,
			});
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(304);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});
	});

	// =========================================================================
	// 206 Partial Content（差分あり）— Cache-Control ヘッダの確認
	// =========================================================================

	describe("206 Partial Content（差分あり）— Cache-Control ヘッダ", () => {
		it("正常: 206（差分あり）レスポンスに Cache-Control: no-cache が含まれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));
			// encode は 10バイトを返す（デフォルト）。rangeStart=5 → 5バイトの差分
			mockEncode.mockReturnValue(Buffer.from("0123456789"));

			const req = createGetRequest("1234567890", { range: "bytes=5-" });
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(206);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});

		it("正常: 206（差分あり）レスポンスに Last-Modified ヘッダが含まれる", async () => {
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));
			mockEncode.mockReturnValue(Buffer.from("0123456789"));

			const req = createGetRequest("1234567890", { range: "bytes=5-" });
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(206);
			expect(res.headers.get("Last-Modified")).toBe(
				lastPostAt.toUTCString(),
			);
		});
	});

	// =========================================================================
	// 206 Partial Content（更新なし: rangeStart >= totalBytes）— Cache-Control ヘッダの確認
	// =========================================================================

	describe("206 Partial Content（更新なし）— Cache-Control ヘッダ", () => {
		it("正常: 206（更新なし）レスポンスに Cache-Control: no-cache が含まれる", async () => {
			// rangeStart がファイルサイズ以上の場合、空の206を返す（専ブラが更新なしと判断）
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));
			// encode は 10バイトを返す（デフォルト）。rangeStart=100 >= totalBytes=10 → 更新なし
			mockEncode.mockReturnValue(Buffer.from("0123456789"));

			const req = createGetRequest("1234567890", { range: "bytes=100-" });
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(206);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});

		it("正常: 206（更新なし）レスポンスの Content-Length は 0 である", async () => {
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));
			mockEncode.mockReturnValue(Buffer.from("0123456789"));

			const req = createGetRequest("1234567890", { range: "bytes=100-" });
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(206);
			expect(res.headers.get("Content-Length")).toBe("0");
		});
	});

	// =========================================================================
	// Content-Type ヘッダの確認
	// =========================================================================

	describe("Content-Type ヘッダ", () => {
		it("正常: 200 レスポンスの Content-Type に Shift_JIS が含まれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByThreadKey.mockResolvedValue(makeThread(lastPostAt));

			const req = createGetRequest("1234567890");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({
						boardId: "test",
						threadKey: "1234567890",
					}),
				},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("Shift_JIS");
		});
	});
});
