/**
 * 単体テスト: PostRepository.searchByAuthorId
 *
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 * See: tmp/workers/bdd-architect_TASK-237/design.md §3.2
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（0件・キーワード・日付範囲・ページネーション・DBエラー）を網羅する
 *
 * カバレッジ対象:
 *   - 正常: 検索結果とtotal が返る
 *   - 正常: keyword フィルタが設定される（ilike）
 *   - 正常: startDate フィルタが設定される（gte）
 *   - 正常: endDate フィルタが設定される（lt: 23:59:59.999Z）
 *   - 正常: offset/limit によるページネーション（range）
 *   - 正常: is_deleted=false, is_system_message=false のフィルタ
 *   - 正常: threads INNER JOIN によりスレッドタイトルを取得する
 *   - 正常: 0件の場合は空配列と total=0 を返す
 *   - 異常: DBエラー時はエラーをスローする
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック（チェーンビルダーパターン）
// ---------------------------------------------------------------------------

const mockData: { data: unknown; count: unknown; error: unknown } = {
	data: [],
	count: 0,
	error: null,
};

/** Supabase クライアントのチェーン呼び出しをモック化するためのビルダー */
const mockQueryBuilder = {
	select: vi.fn(),
	eq: vi.fn(),
	ilike: vi.fn(),
	gte: vi.fn(),
	lt: vi.fn(),
	order: vi.fn(),
	range: vi.fn(),
};

// チェーンメソッドはすべて自身を返す（メソッドチェーン対応）
mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.ilike.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.gte.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.lt.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.order.mockReturnValue(mockQueryBuilder);
// range は最終チェーン（Promise を返す）
mockQueryBuilder.range.mockResolvedValue(mockData);

vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => mockQueryBuilder),
	},
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import * as PostRepository from "../../../../lib/infrastructure/repositories/post-repository";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const AUTHOR_ID = "11111111-1111-1111-1111-111111111111";
const THREAD_ID = "22222222-2222-2222-2222-222222222222";

/** テスト用の PostRow（DB レコード形式） + threads JOIN 結果 */
function makePostRowWithThread(overrides: Record<string, unknown> = {}) {
	return {
		id: "post-id-001",
		thread_id: THREAD_ID,
		post_number: 1,
		author_id: AUTHOR_ID,
		display_name: "名無しさん",
		daily_id: "Ax8kP2",
		body: "こんにちは",
		inline_system_info: null,
		is_system_message: false,
		is_deleted: false,
		created_at: "2026-03-10T12:00:00.000Z",
		threads: { title: "テストスレッド" },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("PostRepository.searchByAuthorId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// チェーンメソッドのリセット
		mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.ilike.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.gte.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.lt.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.order.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.range.mockResolvedValue({
			data: [],
			count: 0,
			error: null,
		});
	});

	// --- 正常系: 基本動作 ---

	it("検索結果（posts と total）を返す", async () => {
		const rows = [makePostRowWithThread()];
		mockQueryBuilder.range.mockResolvedValue({
			data: rows,
			count: 1,
			error: null,
		});

		const result = await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(result.posts).toHaveLength(1);
		expect(result.total).toBe(1);
	});

	it("PostWithThread 形式（threadTitle 付き）を返す", async () => {
		const rows = [makePostRowWithThread()];
		mockQueryBuilder.range.mockResolvedValue({
			data: rows,
			count: 1,
			error: null,
		});

		const result = await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(result.posts[0]).toMatchObject({
			id: "post-id-001",
			threadId: THREAD_ID,
			postNumber: 1,
			authorId: AUTHOR_ID,
			body: "こんにちは",
			isSystemMessage: false,
			isDeleted: false,
			threadTitle: "テストスレッド",
		});
		expect(result.posts[0].createdAt).toBeInstanceOf(Date);
	});

	// --- 正常系: 0 件 ---

	it("検索結果が 0 件の場合は空配列と total=0 を返す", async () => {
		// See: features/mypage.feature @検索結果が0件の場合はメッセージが表示される
		mockQueryBuilder.range.mockResolvedValue({
			data: [],
			count: 0,
			error: null,
		});

		const result = await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(result.posts).toEqual([]);
		expect(result.total).toBe(0);
	});

	// --- 正常系: フィルタ検証 ---

	it("author_id, is_deleted=false, is_system_message=false のフィルタが設定される", async () => {
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(mockQueryBuilder.eq).toHaveBeenCalledWith("author_id", AUTHOR_ID);
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith(
			"is_system_message",
			false,
		);
	});

	it("threads INNER JOIN の SELECT が設定される（COUNT + JOIN）", async () => {
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(mockQueryBuilder.select).toHaveBeenCalledWith(
			"*, threads!inner(title)",
			{ count: "exact" },
		);
	});

	// --- 正常系: keyword フィルタ ---

	it("keyword を指定すると ilike フィルタが設定される", async () => {
		// See: features/mypage.feature @キーワードで書き込み履歴を検索する
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
			keyword: "ボットちゃんねる",
		});

		expect(mockQueryBuilder.ilike).toHaveBeenCalledWith(
			"body",
			"%ボットちゃんねる%",
		);
	});

	it("keyword を指定しない場合は ilike は呼ばれない", async () => {
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(mockQueryBuilder.ilike).not.toHaveBeenCalled();
	});

	// --- 正常系: 日付範囲フィルタ ---

	it("startDate を指定すると gte フィルタが設定される", async () => {
		// See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
			startDate: "2026-03-10",
		});

		expect(mockQueryBuilder.gte).toHaveBeenCalledWith(
			"created_at",
			"2026-03-10T00:00:00.000Z",
		);
	});

	it("endDate を指定すると lt フィルタが設定される（23:59:59.999Z まで inclusive）", async () => {
		// See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
			endDate: "2026-03-15",
		});

		expect(mockQueryBuilder.lt).toHaveBeenCalledWith(
			"created_at",
			"2026-03-15T23:59:59.999Z",
		);
	});

	it("startDate も endDate も指定しない場合は gte/lt は呼ばれない", async () => {
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(mockQueryBuilder.gte).not.toHaveBeenCalled();
		expect(mockQueryBuilder.lt).not.toHaveBeenCalled();
	});

	// --- 正常系: ページネーション ---

	it("offset=0, limit=50 で range(0, 49) が呼ばれる（1ページ目）", async () => {
		// See: features/mypage.feature @書き込み履歴が50件以下の場合は全件表示される
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(mockQueryBuilder.range).toHaveBeenCalledWith(0, 49);
	});

	it("offset=50, limit=50 で range(50, 99) が呼ばれる（2ページ目）", async () => {
		// See: features/mypage.feature @2ページ目を表示すると51件目以降が表示される
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 50,
		});

		expect(mockQueryBuilder.range).toHaveBeenCalledWith(50, 99);
	});

	it("offset=100, limit=50 で range(100, 149) が呼ばれる（3ページ目）", async () => {
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 100,
		});

		expect(mockQueryBuilder.range).toHaveBeenCalledWith(100, 149);
	});

	// --- 正常系: created_at DESC ソート ---

	it("created_at DESC のソートが設定される", async () => {
		await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(mockQueryBuilder.order).toHaveBeenCalledWith("created_at", {
			ascending: false,
		});
	});

	// --- 正常系: count が null の場合 ---

	it("count が null の場合は total=0 を返す", async () => {
		mockQueryBuilder.range.mockResolvedValue({
			data: [],
			count: null,
			error: null,
		});

		const result = await PostRepository.searchByAuthorId(AUTHOR_ID, {
			limit: 50,
			offset: 0,
		});

		expect(result.total).toBe(0);
	});

	// --- 異常系: DBエラー ---

	it("DB エラーが発生した場合はエラーをスローする", async () => {
		mockQueryBuilder.range.mockResolvedValue({
			data: null,
			count: null,
			error: { message: "DB connection failed" },
		});

		await expect(
			PostRepository.searchByAuthorId(AUTHOR_ID, {
				limit: 50,
				offset: 0,
			}),
		).rejects.toThrow("PostRepository.searchByAuthorId failed");
	});
});
