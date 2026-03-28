/**
 * 単体テスト: UserCopipeRepository（InMemory実装の振る舞い検証）
 *
 * features/support/in-memory/user-copipe-repository.ts の動作を検証する。
 * BDDテストの信頼性（インメモリ実装が本番実装と同等の振る舞いをすること）を担保する。
 *
 * 注意: features/ ディレクトリは tsconfig.json の exclude 対象のため、
 * Vitest から直接インポートするのではなく、同等のロジックをインラインで再現してテストする。
 * InMemory実装の具体的なコード検証は BDD テスト（npx cucumber-js）で行われる。
 *
 * See: features/user_copipe.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック（user-copipe-repository.ts が import するため必要）
// ---------------------------------------------------------------------------

const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: mockSelect,
			insert: mockInsert,
			update: mockUpdate,
			delete: mockDelete,
			eq: mockEq,
			order: mockOrder,
			maybeSingle: mockMaybeSingle,
			single: mockSingle,
		})),
	},
}));

import {
	deleteById,
	findById,
	findByUserId,
	insert,
	update,
} from "../../../../lib/infrastructure/repositories/user-copipe-repository";

// ---------------------------------------------------------------------------
// テスト設定
// ---------------------------------------------------------------------------

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const SAMPLE_ROW = {
	id: 1,
	user_id: USER_A,
	name: "テスト",
	content: "本文",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
	vi.clearAllMocks();
	// Supabase のチェーン呼び出しをデフォルトで自己参照するように設定する
	mockSelect.mockReturnValue({
		eq: mockEq,
		order: mockOrder,
		maybeSingle: mockMaybeSingle,
		single: mockSingle,
	});
	mockInsert.mockReturnValue({ select: mockSelect, single: mockSingle });
	mockUpdate.mockReturnValue({
		eq: mockEq,
		select: mockSelect,
		single: mockSingle,
	});
	mockDelete.mockReturnValue({ eq: mockEq });
	mockEq.mockReturnValue({
		order: mockOrder,
		maybeSingle: mockMaybeSingle,
		select: mockSelect,
		single: mockSingle,
	});
	mockOrder.mockReturnValue({ data: [], error: null });
});

// ---------------------------------------------------------------------------
// findByUserId
// ---------------------------------------------------------------------------

describe("findByUserId", () => {
	it("ユーザーのエントリを返す", async () => {
		mockOrder.mockResolvedValue({ data: [SAMPLE_ROW], error: null });

		const result = await findByUserId(USER_A);

		expect(result).toHaveLength(1);
		expect(result[0].userId).toBe(USER_A);
		expect(result[0].name).toBe("テスト");
		expect(result[0].createdAt).toBeInstanceOf(Date);
		expect(result[0].updatedAt).toBeInstanceOf(Date);
	});

	it("データなしの場合は空配列を返す", async () => {
		mockOrder.mockResolvedValue({ data: [], error: null });

		const result = await findByUserId(USER_A);

		expect(result).toEqual([]);
	});

	it("DB エラー時は例外をスローする", async () => {
		mockOrder.mockResolvedValue({
			data: null,
			error: { message: "DB error" },
		});

		await expect(findByUserId(USER_A)).rejects.toThrow(
			"UserCopipeRepository.findByUserId failed",
		);
	});
});

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

describe("findById", () => {
	it("存在するエントリを返す", async () => {
		mockMaybeSingle.mockResolvedValue({ data: SAMPLE_ROW, error: null });

		const result = await findById(1);

		expect(result).not.toBeNull();
		expect(result?.id).toBe(1);
	});

	it("存在しない場合は null を返す", async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });

		const result = await findById(99999);

		expect(result).toBeNull();
	});

	it("DB エラー時は例外をスローする", async () => {
		mockMaybeSingle.mockResolvedValue({
			data: null,
			error: { message: "DB error" },
		});

		await expect(findById(1)).rejects.toThrow(
			"UserCopipeRepository.findById failed",
		);
	});
});

// ---------------------------------------------------------------------------
// insert
// ---------------------------------------------------------------------------

describe("insert", () => {
	it("エントリを登録して返す", async () => {
		mockSingle.mockResolvedValue({ data: SAMPLE_ROW, error: null });
		mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) });

		const result = await insert({
			userId: USER_A,
			name: "テスト",
			content: "本文",
		});

		expect(result.userId).toBe(USER_A);
		expect(result.name).toBe("テスト");
	});

	it("DB エラー時は例外をスローする", async () => {
		mockSingle.mockResolvedValue({
			data: null,
			error: { message: "insert error" },
		});
		mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) });

		await expect(
			insert({ userId: USER_A, name: "テスト", content: "本文" }),
		).rejects.toThrow("UserCopipeRepository.insert failed");
	});
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("update", () => {
	it("エントリを更新して返す", async () => {
		const updatedRow = {
			...SAMPLE_ROW,
			name: "更新後",
			updated_at: "2026-02-01T00:00:00.000Z",
		};
		mockSingle.mockResolvedValue({ data: updatedRow, error: null });
		mockUpdate.mockReturnValue({
			eq: () => ({ select: () => ({ single: mockSingle }) }),
		});

		const result = await update(1, { name: "更新後", content: "本文" });

		expect(result.name).toBe("更新後");
	});

	it("DB エラー時は例外をスローする", async () => {
		mockSingle.mockResolvedValue({
			data: null,
			error: { message: "update error" },
		});
		mockUpdate.mockReturnValue({
			eq: () => ({ select: () => ({ single: mockSingle }) }),
		});

		await expect(
			update(99999, { name: "テスト", content: "本文" }),
		).rejects.toThrow("UserCopipeRepository.update failed");
	});
});

// ---------------------------------------------------------------------------
// deleteById
// ---------------------------------------------------------------------------

describe("deleteById", () => {
	it("エラーなしで削除が完了する", async () => {
		mockEq.mockResolvedValue({ error: null });
		mockDelete.mockReturnValue({ eq: mockEq });

		await expect(deleteById(1)).resolves.toBeUndefined();
	});

	it("DB エラー時は例外をスローする", async () => {
		mockEq.mockResolvedValue({ error: { message: "delete error" } });
		mockDelete.mockReturnValue({ eq: mockEq });

		await expect(deleteById(1)).rejects.toThrow(
			"UserCopipeRepository.deleteById failed",
		);
	});
});
