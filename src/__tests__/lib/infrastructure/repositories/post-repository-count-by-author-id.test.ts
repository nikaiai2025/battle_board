/**
 * 単体テスト: PostRepository.countByAuthorId
 *
 * See: features/welcome.feature @仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §2.1 初回書き込み検出ロジック
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - 正常: 著者IDに紐づくレスが 0 件の場合は 0 を返す
 *   - 正常: 著者IDに紐づくレスが N 件の場合は N を返す
 *   - 正常: DB が count=null を返した場合は 0 を返す（フォールバック）
 *   - 異常: DBエラー時はエラーをスローする
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック（チェーンビルダーパターン）
// ---------------------------------------------------------------------------

type MockResult = { count: number | null; error: unknown };
const mockResult: MockResult = { count: 0, error: null };

/** Supabase クライアントのチェーン呼び出しをモック化するためのビルダー */
const mockQueryBuilder = {
	select: vi.fn(),
	eq: vi.fn(),
};

// チェーンメソッドはすべて自身を返す（メソッドチェーン対応）
// 最後の eq が Promise を返す
mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
mockQueryBuilder.eq.mockResolvedValue(mockResult);

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
// テストスイート
// ---------------------------------------------------------------------------

describe("PostRepository.countByAuthorId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// チェーンメソッドの再設定
		mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
	});

	/**
	 * 著者IDに紐づくレスが 0 件の場合は 0 を返す
	 * See: features/welcome.feature @仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する
	 */
	it("レス 0 件の著者IDに対して 0 を返す", async () => {
		mockQueryBuilder.eq.mockResolvedValue({ count: 0, error: null });

		const count = await PostRepository.countByAuthorId("user-001");

		expect(count).toBe(0);
	});

	/**
	 * 著者IDに紐づくレスが複数件の場合はその件数を返す
	 * See: features/welcome.feature @2回目以降の書き込みではウェルカムシーケンスは発動しない
	 */
	it("レス N 件の著者IDに対して N を返す", async () => {
		mockQueryBuilder.eq.mockResolvedValue({ count: 5, error: null });

		const count = await PostRepository.countByAuthorId("user-001");

		expect(count).toBe(5);
	});

	/**
	 * DB が count=null を返した場合は 0 を返す（境界値: フォールバック）
	 */
	it("DB が count=null を返した場合は 0 を返す（フォールバック）", async () => {
		mockQueryBuilder.eq.mockResolvedValue({ count: null, error: null });

		const count = await PostRepository.countByAuthorId("user-001");

		expect(count).toBe(0);
	});

	/**
	 * DBエラー時はエラーをスローする（異常系）
	 */
	it("DBエラー時はエラーをスローする", async () => {
		mockQueryBuilder.eq.mockResolvedValue({
			count: null,
			error: { message: "connection refused" },
		});

		await expect(PostRepository.countByAuthorId("user-001")).rejects.toThrow(
			"PostRepository.countByAuthorId failed",
		);
	});
});
