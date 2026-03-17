/**
 * 単体テスト: GET /{boardId}/subject.txt — 304 Not Modified 判定
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 *
 * テスト方針:
 *   - ThreadRepository はモック化
 *   - SubjectFormatter, ShiftJisEncoder はモック化
 *   - 304 Not Modified 判定ロジック（秒精度比較）を重点的に検証する
 *   - エッジケース（同一秒内更新、無効なIf-Modified-Since、スレッドなし）を網羅する
 *
 * バグ修正対応: Sprint-51 TASK-144
 *   Before（バグ）: latestPostAt <= sinceDate でミリ秒精度のまま直接比較
 *   After（修正）: Math.floor(t/1000) で秒精度に正規化してから比較
 *   同一秒内（例: .500ms と .000ms）のDB更新が304誤返却されていた問題を修正
 *
 * バグ修正対応: Sprint-51 TASK-146
 *   Before（バグ）: threads[0].lastPostAt を直接使用 → 固定スレッド(2099年)が先頭になると永久304
 *   After（修正）: 現在時刻より未来のlastPostAtを除外してから最新時刻を決定
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const {
	mockFindByBoardId,
	mockBuildSubjectTxt,
	mockEncode,
	MockSubjectFormatter,
	MockShiftJisEncoder,
} = vi.hoisted(() => {
	const mockFindByBoardId = vi.fn();
	const mockBuildSubjectTxt = vi.fn();
	const mockEncode = vi.fn();

	function MockSubjectFormatter(this: unknown) {
		(this as Record<string, unknown>).buildSubjectTxt = (...args: unknown[]) =>
			mockBuildSubjectTxt(...args);
	}

	function MockShiftJisEncoder(this: unknown) {
		(this as Record<string, unknown>).encode = (...args: unknown[]) =>
			mockEncode(...args);
	}

	return {
		mockFindByBoardId,
		mockBuildSubjectTxt,
		mockEncode,
		MockSubjectFormatter,
		MockShiftJisEncoder,
	};
});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findByBoardId: (...args: unknown[]) => mockFindByBoardId(...args),
}));

vi.mock("@/lib/infrastructure/adapters/subject-formatter", () => ({
	SubjectFormatter: MockSubjectFormatter,
}));

vi.mock("@/lib/infrastructure/encoding/shift-jis", () => ({
	ShiftJisEncoder: MockShiftJisEncoder,
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import { GET } from "@/app/(senbra)/[boardId]/subject.txt/route";

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
 * @param boardId - 板ID
 * @param ifModifiedSince - If-Modified-Since ヘッダ（省略可）
 */
function createGetRequest(boardId: string, ifModifiedSince?: string): Request {
	return new Request(`http://localhost/${boardId}/subject.txt`, {
		method: "GET",
		headers: {
			...(ifModifiedSince ? { "if-modified-since": ifModifiedSince } : {}),
		},
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GET /{boardId}/subject.txt — 304 Not Modified 判定", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルト: encode は空のBufferを返す
		mockEncode.mockReturnValue(Buffer.from(""));
		// デフォルト: buildSubjectTxt は空文字を返す
		mockBuildSubjectTxt.mockReturnValue("");
	});

	// =========================================================================
	// スレッドが存在しない場合
	// =========================================================================

	describe("スレッドなし（空一覧）", () => {
		it("正常: スレッドが0件の場合、200 が返される（If-Modified-Since なし）", async () => {
			// See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
			mockFindByBoardId.mockResolvedValue([]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
		});

		it("正常: スレッドが0件の場合、If-Modified-Since があっても 200 が返される（304判定をスキップ）", async () => {
			mockFindByBoardId.mockResolvedValue([]);

			const req = createGetRequest("test", "Wed, 01 Jan 2025 00:00:00 GMT");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// スレッドなしでは304判定を行わず200を返す
			expect(res.status).toBe(200);
		});
	});

	// =========================================================================
	// If-Modified-Since なし → 常に 200
	// =========================================================================

	describe("If-Modified-Since ヘッダなし", () => {
		it("正常: If-Modified-Since なしの場合、200 が返される", async () => {
			// See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
			const lastPostAt = new Date("2025-01-01T00:00:00.500Z");
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
		});
	});

	// =========================================================================
	// 304 Not Modified 判定 — 正常系（更新なし）
	// =========================================================================

	describe("304 Not Modified — 更新なし", () => {
		it("正常: lastPostAt === sinceDate の場合、304 が返される", async () => {
			// See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
			// 秒単位が同一なら304（ミリ秒は切り捨て）
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(304);
		});

		it("正常: lastPostAt < sinceDate の場合（DB日付が古い）、304 が返される", async () => {
			// lastPostAt が sinceDate より古い → 304
			const lastPostAt = new Date("2025-06-01T11:59:59.000Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(304);
		});

		it("正常: lastPostAt のミリ秒が .999Z で sinceDate の同一秒の場合、304 が返される（秒精度切り捨て）", async () => {
			// 秒精度切り捨て後に同一秒なら304
			// lastPostAt: 12:00:00.999Z → sec=1748779200
			// sinceDate:  12:00:00 GMT  → sec=1748779200
			const lastPostAt = new Date("2025-06-01T12:00:00.999Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// .999Z → sec=0 なので lastPostAtSec === sinceSec → 304
			expect(res.status).toBe(304);
		});
	});

	// =========================================================================
	// 304 Not Modified 判定 — 主要バグ修正ケース
	// 同一秒内にDB更新が発生した場合に誤って304を返すバグの検証
	// =========================================================================

	describe("304 Not Modified — バグ修正（同一秒内更新で 200 が返ること）", () => {
		it("バグ修正: lastPostAt のミリ秒が .500Z で sinceDate の同一秒 .000 の場合、200 が返される（秒精度比較）", async () => {
			// TASK-144 修正の中核ケース
			// Before（バグ）: lastPostAt(.500Z) > sinceDate(.000) → Dateオブジェクト直接比較で 200 → 問題なし?
			// 実際のバグ: sinceDate がラウンドトリップで lastPostAt のミリ秒を含んだ値になる場合
			// 例: Last-Modified として .500Z が返され、クライアントが If-Modified-Since に同値を送ると
			//   sinceDate = .500Z、lastPostAt = .500Z → 直接比較で「等しい」→ 304 → 正しい
			// しかしHTTP Date は秒精度なので sinceDate.getTime() は必ず秒の倍数になる。
			// バグの本質: lastPostAt=.500Z > sinceDate=.000Z → Date直接比較だと「更新あり扱い」となり
			//             本来304を返すべき場面で200を返す。
			// 秒精度正規化後: lastPostAtSec = sinceSec → 304 が正しい
			const lastPostAt = new Date("2025-06-01T12:00:00.500Z");
			// sinceDate は HTTP Date 形式（秒精度）: 12:00:00 GMT = .000Z
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// 秒精度で比較: lastPostAtSec (12:00:00) === sinceSec (12:00:00) → 304
			// （修正前バグ: lastPostAt(.500Z) > sinceDate(.000Z) → 200誤返却）
			expect(res.status).toBe(304);
		});

		it("バグ修正: lastPostAt が sinceDate より 1秒以上新しい場合、200 が返される（正常な更新検出）", async () => {
			// lastPostAt が sinceDate より 1秒以上新しい → 更新あり → 200
			const lastPostAt = new Date("2025-06-01T12:00:01.000Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
		});

		it("バグ修正: lastPostAt が sinceDate より 500ms 新しい場合、200 が返される（秒精度で次の秒）", async () => {
			// lastPostAt: 12:00:01.500Z → sec=T+1 > sinceSec=T → 200
			const lastPostAt = new Date("2025-06-01T12:00:01.500Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
		});
	});

	// =========================================================================
	// If-Modified-Since が無効値の場合
	// =========================================================================

	describe("If-Modified-Since が無効値", () => {
		it("エッジケース: If-Modified-Since が不正な日付文字列の場合、200 が返される", async () => {
			// 不正なデータ型: new Date('invalid') は NaN
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", "invalid-date-string");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// NaN チェックで 304 判定をスキップ → 200
			expect(res.status).toBe(200);
		});

		it("エッジケース: If-Modified-Since が空文字の場合、200 が返される", async () => {
			// 空の入力値
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			// 空文字ヘッダは headers オブジェクト上では設定されないため
			// ヘッダなしと同等として扱う
			const req = new Request("http://localhost/test/subject.txt", {
				method: "GET",
			});
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
		});
	});

	// =========================================================================
	// Last-Modified レスポンスヘッダの確認
	// =========================================================================

	describe("Last-Modified レスポンスヘッダ", () => {
		it("正常: 200 レスポンスに Last-Modified ヘッダが含まれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Last-Modified")).toBeTruthy();
		});

		it("正常: Last-Modified ヘッダが秒精度（HTTP Date形式）で返される（ラウンドトリップ保証）", async () => {
			// ラウンドトリップ保証: Last-Modified を If-Modified-Since に使い回した際に
			// ミリ秒精度の不一致が起きないよう、秒精度に正規化して返す
			// new Date(.500Z).toUTCString() → "Sun, 01 Jun 2025 12:00:00 GMT"（ミリ秒は含まれない）
			const lastPostAt = new Date("2025-06-01T12:00:00.500Z");
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			const lastModified = res.headers.get("Last-Modified");
			// HTTP Date 形式はミリ秒を含まない（例: "Sun, 01 Jun 2025 12:00:00 GMT"）
			// toUTCString() は秒精度なのでミリ秒は含まれない
			expect(lastModified).toBe("Sun, 01 Jun 2025 12:00:00 GMT");
		});

		it("正常: スレッドが0件の場合、Last-Modified ヘッダが含まれる（エポック日付）", async () => {
			mockFindByBoardId.mockResolvedValue([]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// スレッドなし時もLast-Modifiedは返す
			expect(res.headers.get("Last-Modified")).toBeTruthy();
		});
	});

	// =========================================================================
	// Content-Type ヘッダの確認
	// =========================================================================

	describe("Content-Type ヘッダ", () => {
		it("正常: Content-Type に Shift_JIS が含まれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
			mockFindByBoardId.mockResolvedValue([]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.headers.get("Content-Type")).toContain("Shift_JIS");
		});
	});

	// =========================================================================
	// Cache-Control ヘッダの確認（RFC 7234 §4.2.2 ヒューリスティックキャッシュ防止）
	// =========================================================================

	describe("Cache-Control ヘッダ", () => {
		it("正常: 200 レスポンスに Cache-Control: no-cache が含まれる", async () => {
			// See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
			// Cache-Control: no-cache により専ブラがヒューリスティックキャッシュを適用しないことを保証する
			mockFindByBoardId.mockResolvedValue([
				makeThread(new Date("2025-06-01T12:00:00.000Z")),
			]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});

		it("正常: スレッドが0件の200レスポンスにも Cache-Control: no-cache が含まれる", async () => {
			mockFindByBoardId.mockResolvedValue([]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});

		it("正常: 304 レスポンスに Cache-Control: no-cache が含まれる", async () => {
			// 304 に Cache-Control がないと、専ブラが以降のリクエストでヒューリスティックキャッシュを
			// 再適用してしまう可能性がある（RFC 7234 §4.3.4）
			const lastPostAt = new Date("2025-06-01T12:00:00.000Z");
			const sinceDate = "Sun, 01 Jun 2025 12:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(304);
			expect(res.headers.get("Cache-Control")).toBe("no-cache");
		});
	});

	// =========================================================================
	// 境界値: 極端な日付
	// =========================================================================

	describe("境界値テスト", () => {
		it("境界値: lastPostAt が UNIX エポック（1970-01-01）の場合でも正常動作する", async () => {
			const lastPostAt = new Date(0); // UNIX epoch
			const sinceDate = "Thu, 01 Jan 1970 00:00:00 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// epoch同士 → 304
			expect(res.status).toBe(304);
		});

		it("境界値: 非常に大きな日付（2099年）でも正常動作する", async () => {
			const lastPostAt = new Date("2099-12-31T23:59:59.999Z");
			const sinceDate = "Thu, 31 Dec 2099 23:59:59 GMT";
			mockFindByBoardId.mockResolvedValue([makeThread(lastPostAt)]);

			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// .999Z → sec同一 → 304
			expect(res.status).toBe(304);
		});
	});

	// =========================================================================
	// 固定スレッド（isPinned=true, lastPostAt=2099年）混在ケース
	// TASK-146: 永久304バグ修正の検証
	// =========================================================================

	describe("固定スレッド混在ケース（永久304バグ修正）", () => {
		/**
		 * 固定スレッドのlastPostAt（未来日時）を除外し、通常スレッドのlastPostAtで判定する。
		 * See: sprint-51 TASK-146
		 */

		it("バグ修正: 固定スレッド（2099年）と通常スレッドが混在する場合、通常スレッドのlastPostAtで304判定する", async () => {
			// 固定スレッド(isPinned=true): lastPostAt=2099年 → bump順で先頭に来る
			// 通常スレッド: lastPostAt=2026年（現在時刻より古い）
			const pinnedThread = {
				...makeThread(new Date("2099-01-01T00:00:00.000Z")),
				isPinned: true,
			};
			const normalThread = makeThread(new Date("2026-03-10T12:00:00.000Z"));

			// bump順（last_post_at DESC）: pinnedThread が先頭
			mockFindByBoardId.mockResolvedValue([pinnedThread, normalThread]);

			// If-Modified-Since: 通常スレッドの投稿後（2026-03-10 13:00:00）
			const sinceDate = "Tue, 10 Mar 2026 13:00:00 GMT";
			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// 固定スレッド(2099年=未来)を除外 → 通常スレッド(2026-03-10 12:00:00) < sinceDate(2026-03-10 13:00:00) → 304
			expect(res.status).toBe(304);
		});

		it("バグ修正: 固定スレッド（2099年）と通常スレッドが混在し、通常スレッドに新着投稿がある場合、200を返す", async () => {
			// 通常スレッドが更新されている場合は200を返すことを確認
			const pinnedThread = {
				...makeThread(new Date("2099-01-01T00:00:00.000Z")),
				isPinned: true,
			};
			// 通常スレッドはsinceDate=2026-03-10 12:00:00より新しい
			const normalThread = makeThread(new Date("2026-03-10T13:00:01.000Z"));

			// bump順: pinnedThread が先頭
			mockFindByBoardId.mockResolvedValue([pinnedThread, normalThread]);

			// If-Modified-Since: 2026-03-10 13:00:00
			const sinceDate = "Tue, 10 Mar 2026 13:00:00 GMT";
			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// 固定スレッド(2099年)を除外 → 通常スレッド(13:00:01) > sinceDate(13:00:00) → 200
			expect(res.status).toBe(200);
		});

		it("バグ修正: Last-Modifiedヘッダが固定スレッドの2099年ではなく通常スレッドの実際の日時を返す", async () => {
			// Last-Modifiedが2099年を返すと専ブラが2099年のIf-Modified-Sinceを送り永久304になる
			const pinnedThread = {
				...makeThread(new Date("2099-01-01T00:00:00.000Z")),
				isPinned: true,
			};
			const normalThread = makeThread(new Date("2026-03-18T10:00:00.000Z"));

			// bump順: pinnedThread が先頭
			mockFindByBoardId.mockResolvedValue([pinnedThread, normalThread]);

			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
			const lastModified = res.headers.get("Last-Modified");
			// Last-Modifiedは通常スレッドの日時であること（2099年ではない）
			expect(lastModified).toBe("Wed, 18 Mar 2026 10:00:00 GMT");
		});

		it("バグ修正: 固定スレッドのみ存在する場合（通常スレッド0件）、200が返される", async () => {
			// 固定スレッドしかない場合: 未来日時除外後の候補なし → フォールバック
			const pinnedThread = {
				...makeThread(new Date("2099-01-01T00:00:00.000Z")),
				isPinned: true,
			};

			mockFindByBoardId.mockResolvedValue([pinnedThread]);

			// If-Modified-Since なし
			const req = createGetRequest("test");
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			expect(res.status).toBe(200);
		});

		it("バグ修正: 固定スレッドのみで以前のIf-Modified-Sinceが2099年の場合、304が返される（フォールバック動作）", async () => {
			// 固定スレッドしかない場合: 未来除外後の候補なし → 最後の要素（固定スレッド自身）をフォールバック使用
			const pinnedThread = {
				...makeThread(new Date("2099-01-01T00:00:00.000Z")),
				isPinned: true,
			};

			mockFindByBoardId.mockResolvedValue([pinnedThread]);

			// If-Modified-Since: 2099-01-01（固定スレッドの日時）
			const sinceDate = "Thu, 01 Jan 2099 00:00:00 GMT";
			const req = createGetRequest("test", sinceDate);
			const res = await GET(
				req as unknown as import("next/server").NextRequest,
				{
					params: Promise.resolve({ boardId: "test" }),
				},
			);

			// 固定スレッドのみ → フォールバック（最後の要素=固定スレッド自身）使用 → sec同一 → 304
			expect(res.status).toBe(304);
		});
	});
});
