/**
 * 単体テスト: CurrencyRepository.getBalancesByUserIds
 *
 * N+1 問題修正（TASK-315）で追加した getBalancesByUserIds 関数のテスト。
 * WHERE user_id IN (...) で一括取得し、userId → balance の Map を返すことを検証する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 * See: features/admin.feature @各ユーザーのID、登録日時、ステータス、通貨残高が表示される
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 空配列入力時はクエリを実行しない（空Mapを返す）
 *   - 複数ユーザーの残高が正しくMapに格納される
 *   - currencies テーブルにレコードが存在しないユーザーはMapに含まれない
 *   - DBエラー時は例外をスローする
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

/**
 * vi.mock ファクトリはファイルトップへホイスティングされるため、
 * vi.hoisted を使用してファクトリ内で参照する変数をホイスティング順序に合わせる。
 */
const { mockFrom, mockSelect, mockIn } = vi.hoisted(() => ({
	mockFrom: vi.fn(),
	mockSelect: vi.fn(),
	mockIn: vi.fn(),
}));

vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: mockFrom,
	},
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import { getBalancesByUserIds } from "@/lib/infrastructure/repositories/currency-repository";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** Supabase チェーン（from().select().in()）をモック設定するヘルパー */
function setupSupabaseMock(
	result:
		| { data: { user_id: string; balance: number }[] | null; error: null }
		| { data: null; error: { message: string } },
) {
	mockIn.mockResolvedValue(result);
	mockSelect.mockReturnValue({ in: mockIn });
	mockFrom.mockReturnValue({ select: mockSelect });
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("CurrencyRepository.getBalancesByUserIds", () => {
	// See: features/admin.feature @管理者がユーザー一覧を閲覧できる

	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系: 空配列
	// =========================================================================

	describe("空配列入力", () => {
		it("空配列が渡された場合はDBクエリを実行せず空Mapを返す", async () => {
			// 空配列 / 空文字列のエッジケース
			const result = await getBalancesByUserIds([]);

			// DBクエリは呼ばれない
			expect(mockFrom).not.toHaveBeenCalled();
			// 空Mapを返す
			expect(result).toEqual(new Map());
			expect(result.size).toBe(0);
		});
	});

	// =========================================================================
	// 正常系: 複数ユーザー
	// =========================================================================

	describe("複数ユーザーの一括取得", () => {
		it("複数ユーザーの残高がuserIdをキーとするMapで返される", async () => {
			const userId1 = crypto.randomUUID();
			const userId2 = crypto.randomUUID();
			const userId3 = crypto.randomUUID();

			setupSupabaseMock({
				data: [
					{ user_id: userId1, balance: 100 },
					{ user_id: userId2, balance: 250 },
					{ user_id: userId3, balance: 0 },
				],
				error: null,
			});

			const result = await getBalancesByUserIds([userId1, userId2, userId3]);

			expect(result.size).toBe(3);
			expect(result.get(userId1)).toBe(100);
			expect(result.get(userId2)).toBe(250);
			expect(result.get(userId3)).toBe(0);
		});

		it("単一ユーザーIDで呼び出された場合も正常に取得できる", async () => {
			const userId = crypto.randomUUID();

			setupSupabaseMock({
				data: [{ user_id: userId, balance: 500 }],
				error: null,
			});

			const result = await getBalancesByUserIds([userId]);

			expect(result.size).toBe(1);
			expect(result.get(userId)).toBe(500);
		});

		it("currenciesテーブルにレコードが存在しないユーザーはMapに含まれない", async () => {
			// 2ユーザーを要求したが1ユーザー分しかDBにレコードがない場合
			const userId1 = crypto.randomUUID();
			const userId2 = crypto.randomUUID();

			setupSupabaseMock({
				data: [{ user_id: userId1, balance: 300 }],
				error: null,
			});

			const result = await getBalancesByUserIds([userId1, userId2]);

			expect(result.size).toBe(1);
			expect(result.get(userId1)).toBe(300);
			// userId2 はMapに含まれない（呼び出し側で ?? 0 として扱う）
			expect(result.has(userId2)).toBe(false);
		});

		it("残高 0 のユーザーも正常にMapに格納される", async () => {
			// 境界値: 残高 0
			const userId = crypto.randomUUID();

			setupSupabaseMock({
				data: [{ user_id: userId, balance: 0 }],
				error: null,
			});

			const result = await getBalancesByUserIds([userId]);

			expect(result.get(userId)).toBe(0);
		});

		it("DBが空のデータ（[]）を返した場合は空Mapを返す", async () => {
			// 空の配列のエッジケース（DBにレコードがない）
			const userId1 = crypto.randomUUID();
			const userId2 = crypto.randomUUID();

			setupSupabaseMock({ data: [], error: null });

			const result = await getBalancesByUserIds([userId1, userId2]);

			expect(result.size).toBe(0);
		});

		it("supabaseAdmin.from('currencies').select('user_id, balance').in('user_id', userIds) が正しく呼ばれる", async () => {
			// クエリ構造の検証: WHERE user_id IN (...)
			const userId1 = crypto.randomUUID();
			const userId2 = crypto.randomUUID();
			const userIds = [userId1, userId2];

			setupSupabaseMock({ data: [], error: null });

			await getBalancesByUserIds(userIds);

			expect(mockFrom).toHaveBeenCalledWith("currencies");
			expect(mockSelect).toHaveBeenCalledWith("user_id, balance");
			expect(mockIn).toHaveBeenCalledWith("user_id", userIds);
		});
	});

	// =========================================================================
	// 異常系: DBエラー
	// =========================================================================

	describe("DBエラー", () => {
		it("Supabaseがエラーを返した場合は例外をスローする", async () => {
			// 異常系パス: DBエラー
			mockIn.mockResolvedValue({
				data: null,
				error: { message: "connection refused" },
			});
			mockSelect.mockReturnValue({ in: mockIn });
			mockFrom.mockReturnValue({ select: mockSelect });

			await expect(getBalancesByUserIds([crypto.randomUUID()])).rejects.toThrow(
				"CurrencyRepository.getBalancesByUserIds failed",
			);
		});

		it("エラーメッセージにDBエラーの詳細が含まれる", async () => {
			const errorMessage = "relation 'currencies' does not exist";
			mockIn.mockResolvedValue({
				data: null,
				error: { message: errorMessage },
			});
			mockSelect.mockReturnValue({ in: mockIn });
			mockFrom.mockReturnValue({ select: mockSelect });

			await expect(getBalancesByUserIds([crypto.randomUUID()])).rejects.toThrow(
				errorMessage,
			);
		});
	});

	// =========================================================================
	// エッジケース: 大量データ
	// =========================================================================

	describe("大量データ", () => {
		it("100件のユーザーIDを渡しても正常に処理できる", async () => {
			// 大量データのエッジケース
			const userIds = Array.from({ length: 100 }, () => crypto.randomUUID());
			const dbData = userIds.map((id, i) => ({ user_id: id, balance: i * 10 }));

			setupSupabaseMock({ data: dbData, error: null });

			const result = await getBalancesByUserIds(userIds);

			expect(result.size).toBe(100);
			expect(result.get(userIds[0])).toBe(0);
			expect(result.get(userIds[99])).toBe(990);
		});
	});
});
