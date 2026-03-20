/**
 * 単体テスト: PostRepository.findByAuthorIdAndDate
 *
 * See: features/investigation.feature
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.3
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（0件・件数制限・DBエラー）を網羅する
 *
 * カバレッジ対象:
 *   - 正常: 指定日のレスが取得できる（全件・limit あり）
 *   - 正常: 0件の場合は空配列を返す
 *   - 正常: limit 指定時はクエリに limit が渡される
 *   - 正常: システムメッセージ・削除済みを除外するフィルタが設定される
 *   - 異常: DBエラー時はエラーをスローする
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック（チェーンビルダーパターン）
// ---------------------------------------------------------------------------

const mockData: { data: unknown; error: unknown } = { data: [], error: null };

/** Supabase クライアントのチェーン呼び出しをモック化するためのビルダー */
const mockQueryBuilder = {
	select: vi.fn(),
	eq: vi.fn(),
	gte: vi.fn(),
	lt: vi.fn(),
	order: vi.fn(),
	limit: vi.fn(),
};

// チェーンメソッドはすべて自身を返す（メソッドチェーン対応）
mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.gte.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.lt.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.order.mockReturnValue(mockQueryBuilder);
// limit は最終的に Promise を返す（最後のチェーン）
mockQueryBuilder.limit.mockResolvedValue(mockData);
// limit なし（order が最終）の場合も Promise を返す
mockQueryBuilder.order.mockResolvedValue(mockData);

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
const DATE = "2026-03-20";

/** テスト用の PostRow（DB レコード形式）*/
function makePostRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "post-id-001",
		thread_id: "thread-id-001",
		post_number: 4,
		author_id: AUTHOR_ID,
		display_name: "名無しさん",
		daily_id: "Ax8kP2",
		body: "こんにちは",
		inline_system_info: null,
		is_system_message: false,
		is_deleted: false,
		created_at: "2026-03-20T05:23:15.000Z",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("PostRepository.findByAuthorIdAndDate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// チェーンメソッドのリセット（自身を返す）
		mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.gte.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.lt.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.order.mockResolvedValue({ data: [], error: null });
		mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null });
	});

	// --- 正常系: 0件 ---

	it("レスが0件の場合は空配列を返す", async () => {
		mockQueryBuilder.order.mockResolvedValue({ data: [], error: null });
		const result = await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE);
		expect(result).toEqual([]);
	});

	// --- 正常系: 複数件取得 ---

	it("該当する日付のレス一覧を返す", async () => {
		const rows = [
			makePostRow(),
			makePostRow({ id: "post-id-002", post_number: 5 }),
		];
		mockQueryBuilder.order.mockResolvedValue({ data: rows, error: null });

		const result = await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("post-id-001");
		expect(result[1].id).toBe("post-id-002");
	});

	// --- 正常系: ドメインモデルへの変換 ---

	it("DB レコードをドメインモデル（camelCase）に変換する", async () => {
		const row = makePostRow();
		mockQueryBuilder.order.mockResolvedValue({ data: [row], error: null });

		const result = await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE);
		expect(result[0]).toMatchObject({
			id: "post-id-001",
			threadId: "thread-id-001",
			postNumber: 4,
			authorId: AUTHOR_ID,
			displayName: "名無しさん",
			dailyId: "Ax8kP2",
			body: "こんにちは",
			isSystemMessage: false,
			isDeleted: false,
		});
		expect(result[0].createdAt).toBeInstanceOf(Date);
	});

	// --- 正常系: limit あり ---

	it("limit を指定した場合は limit が適用される", async () => {
		const row = makePostRow();
		// limit が呼ばれる場合は order が builder を返し、limit が Promise を返す
		mockQueryBuilder.order.mockReturnValue(mockQueryBuilder);
		mockQueryBuilder.limit.mockResolvedValue({ data: [row], error: null });

		const result = await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE, {
			limit: 3,
		});
		expect(mockQueryBuilder.limit).toHaveBeenCalledWith(3);
		expect(result).toHaveLength(1);
	});

	// --- 正常系: limit なし ---

	it("limit を指定しない場合は limit メソッドが呼ばれない", async () => {
		mockQueryBuilder.order.mockResolvedValue({ data: [], error: null });

		await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE);
		expect(mockQueryBuilder.limit).not.toHaveBeenCalled();
	});

	// --- 正常系: フィルタ確認（eq で is_system_message=false, is_deleted=false） ---

	it("is_system_message=false と is_deleted=false のフィルタが設定される", async () => {
		mockQueryBuilder.order.mockResolvedValue({ data: [], error: null });

		await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE);

		// eq が author_id, is_system_message, is_deleted の3回呼ばれることを確認
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith("author_id", AUTHOR_ID);
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith(
			"is_system_message",
			false,
		);
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
	});

	// --- 正常系: 日付範囲フィルタ ---

	it("指定日付の UTC 範囲フィルタ（gte/lt）が設定される", async () => {
		mockQueryBuilder.order.mockResolvedValue({ data: [], error: null });

		await PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE);

		expect(mockQueryBuilder.gte).toHaveBeenCalledWith(
			"created_at",
			`${DATE}T00:00:00.000Z`,
		);
		expect(mockQueryBuilder.lt).toHaveBeenCalledWith(
			"created_at",
			`${DATE}T23:59:59.999Z`,
		);
	});

	// --- 異常系: DBエラー ---

	it("DB エラーが発生した場合はエラーをスローする", async () => {
		mockQueryBuilder.order.mockResolvedValue({
			data: null,
			error: { message: "DB connection failed" },
		});

		await expect(
			PostRepository.findByAuthorIdAndDate(AUTHOR_ID, DATE),
		).rejects.toThrow("PostRepository.findByAuthorIdAndDate failed");
	});
});
