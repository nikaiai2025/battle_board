/**
 * 単体テスト: DevPostService
 *
 * 開発連絡板のユースケース（getPosts / createPost）の振る舞いをテストする。
 * supabaseAdmin をモック化し、DB依存を排除して純粋なロジックを検証する。
 *
 * See: features/dev_board.feature
 * See: src/lib/services/dev-post-service.ts
 *
 * テスト方針:
 *   - supabaseAdmin のクエリをモック化して DB 依存を排除する
 *   - 名前のデフォルト値（「名無しさん」）の適用ロジックを検証する
 *   - 本文バリデーション（空文字・空白のみ）を検証する
 *   - 本番の PostService に一切依存しないことを import から確認する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義
// supabaseAdmin のクエリチェーンをモック化して DB 依存を排除する
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: mockSelect,
			insert: mockInsert,
		})),
	},
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック定義後にインポートする）
// ---------------------------------------------------------------------------

import { createPost, getPosts } from "../../../lib/services/dev-post-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** SELECT クエリチェーンのセットアップ（getPosts 用） */
function setupSelectChain(rows: object[], totalCount?: number) {
	// findAll 用: select → order → range
	mockRange.mockResolvedValue({ data: rows, error: null });
	mockOrder.mockReturnValue({ range: mockRange });
	// count 用と findAll 用の select を切り替える
	mockSelect.mockImplementation(
		(_columns: string, opts?: { count?: string; head?: boolean }) => {
			if (opts?.head) {
				// count() 呼び出し
				return Promise.resolve({
					count: totalCount ?? rows.length,
					error: null,
				});
			}
			// findAll() 呼び出し
			return { order: mockOrder };
		},
	);
}

/** SELECT クエリチェーンのセットアップ（エラー用） */
function setupSelectChainError(message: string) {
	mockRange.mockResolvedValue({ data: null, error: { message } });
	mockOrder.mockReturnValue({ range: mockRange });
	mockSelect.mockImplementation(
		(_columns: string, opts?: { count?: string; head?: boolean }) => {
			if (opts?.head) {
				return Promise.resolve({ count: 0, error: null });
			}
			return { order: mockOrder };
		},
	);
}

/** INSERT クエリチェーンのセットアップ（createPost 用） */
function setupInsertChain(row: object) {
	mockSingle.mockResolvedValue({ data: row, error: null });
	mockSelect.mockReturnValue({ single: mockSingle });
	mockInsert.mockReturnValue({ select: mockSelect });
}

/** INSERT クエリチェーンのセットアップ（エラー用） */
function setupInsertChainError(message: string) {
	mockSingle.mockResolvedValue({ data: null, error: { message } });
	mockSelect.mockReturnValue({ single: mockSingle });
	mockInsert.mockReturnValue({ select: mockSelect });
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("DevPostService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// getPosts
	// =========================================================================

	describe("getPosts", () => {
		it("投稿一覧をページネーション付きで返す", async () => {
			// Arrange: 2件の投稿を DB が返すように設定する
			const rows = [
				{
					id: 2,
					name: "開発者A",
					title: "報告",
					body: "2件目の投稿",
					url: "",
					created_at: "2026-03-22T10:00:00Z",
				},
				{
					id: 1,
					name: "名無しさん",
					title: "",
					body: "1件目の投稿",
					url: "",
					created_at: "2026-03-22T09:00:00Z",
				},
			];
			setupSelectChain(rows, 2);

			// Act
			const result = await getPosts();

			// Assert: ページネーション情報が正しいこと
			expect(result.posts).toHaveLength(2);
			expect(result.posts[0].id).toBe(2);
			expect(result.posts[0].name).toBe("開発者A");
			expect(result.posts[0].body).toBe("2件目の投稿");
			expect(result.posts[0].createdAt).toBeInstanceOf(Date);
			expect(result.posts[1].id).toBe(1);
			expect(result.totalCount).toBe(2);
			expect(result.currentPage).toBe(1);
			expect(result.totalPages).toBe(1);
		});

		it("投稿が0件の場合は空配列とページ情報を返す", async () => {
			// Arrange
			setupSelectChain([], 0);

			// Act
			const result = await getPosts();

			// Assert
			expect(result.posts).toEqual([]);
			expect(result.totalCount).toBe(0);
			expect(result.totalPages).toBe(1);
		});

		it("DB エラー時は Error をスローする", async () => {
			// Arrange
			setupSelectChainError("DB connection failed");

			// Act & Assert
			await expect(getPosts()).rejects.toThrow(
				"DevPostRepository.findAll failed",
			);
		});
	});

	// =========================================================================
	// createPost
	// =========================================================================

	describe("createPost", () => {
		it("名前と本文を指定して投稿を作成する", async () => {
			// Arrange
			const row = {
				id: 1,
				name: "開発者A",
				title: "テストタイトル",
				body: "デプロイ完了",
				url: "http://example.com",
				created_at: "2026-03-22T10:00:00Z",
			};
			setupInsertChain(row);

			// Act
			const result = await createPost(
				"開発者A",
				"テストタイトル",
				"デプロイ完了",
				"http://example.com",
			);

			// Assert
			expect(result.id).toBe(1);
			expect(result.name).toBe("開発者A");
			expect(result.title).toBe("テストタイトル");
			expect(result.body).toBe("デプロイ完了");
			expect(result.url).toBe("http://example.com");
			expect(result.createdAt).toBeInstanceOf(Date);
		});

		it("名前が空の場合は Error をスローする", async () => {
			// Act & Assert
			await expect(createPost("", "", "テスト投稿", "")).rejects.toThrow(
				"名前を入力してください",
			);

			// INSERT が呼ばれないことを確認する
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("名前が空白のみの場合も Error をスローする", async () => {
			// Act & Assert
			await expect(createPost("   ", "", "テスト", "")).rejects.toThrow(
				"名前を入力してください",
			);

			// INSERT が呼ばれないことを確認する
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("本文が空の場合は Error をスローする", async () => {
			// Arrange: INSERT は呼ばれないはず

			// Act & Assert
			await expect(createPost("開発者A", "", "", "")).rejects.toThrow(
				"本文を入力してください",
			);

			// INSERT が呼ばれないことを確認する
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("本文が空白のみの場合も Error をスローする", async () => {
			// Arrange

			// Act & Assert: 名前は有効値を渡し、本文のバリデーションを検証する
			await expect(createPost("開発者A", "", "   ", "")).rejects.toThrow(
				"本文を入力してください",
			);

			// INSERT が呼ばれないことを確認する
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("本文の前後の空白はトリムして保存する", async () => {
			// Arrange
			const row = {
				id: 4,
				name: "開発者A",
				title: "",
				body: "トリムされた本文",
				url: "",
				created_at: "2026-03-22T10:00:00Z",
			};
			setupInsertChain(row);

			// Act
			await createPost("開発者A", "", "  トリムされた本文  ", "");

			// Assert: body がトリムされて Repository に渡されること
			expect(mockInsert).toHaveBeenCalledWith({
				name: "開発者A",
				title: "",
				body: "トリムされた本文",
				url: "",
			});
		});

		it("DB エラー時は Error をスローする", async () => {
			// Arrange
			setupInsertChainError("insert failed");

			// Act & Assert
			await expect(createPost("開発者A", "", "テスト", "")).rejects.toThrow(
				"DevPostRepository.insert failed",
			);
		});
	});
});
