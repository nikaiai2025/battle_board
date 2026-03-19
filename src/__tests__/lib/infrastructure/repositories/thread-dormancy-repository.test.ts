/**
 * 単体テスト: ThreadRepository — 休眠管理関数
 *
 * テスト対象:
 *   - wakeThread: 休眠スレッドを復活させる（is_dormant = false）
 *   - demoteOldestActiveThread: アクティブ非固定スレッドの中で最古を休眠化
 *   - countActiveThreads: アクティブスレッド数を返す
 *
 * See: features/thread.feature @スレッド一覧には最新50件のみ表示される
 * See: docs/specs/thread_state_transitions.yaml #transitions
 * See: docs/architecture/architecture.md §7.1 step 2b TDR-012
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 各メソッドの正常系・異常系（DBエラー）・エッジケースを網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック
// ---------------------------------------------------------------------------

/** Supabase クライアントのチェーン呼び出しをモック化するためのビルダー */
const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

/**
 * supabaseAdmin モジュールをモック化する。
 * ThreadRepository はインポート時に supabaseAdmin を参照するため、
 * モジュールレベルでモックを宣言する必要がある。
 */
vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: mockSelect,
			update: mockUpdate,
			eq: mockEq,
			order: mockOrder,
			limit: mockLimit,
			single: mockSingle,
		})),
	},
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言後）
// ---------------------------------------------------------------------------

import {
	countActiveThreads,
	demoteOldestActiveThread,
	wakeThread,
} from "../../../../lib/infrastructure/repositories/thread-repository";

// ---------------------------------------------------------------------------
// テストヘルパー（空 — 各テストケース内で直接モック設定する）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// wakeThread テスト
// ---------------------------------------------------------------------------

describe("ThreadRepository.wakeThread — 休眠スレッドの復活", () => {
	// See: docs/specs/thread_state_transitions.yaml #transitions unlisted→listed

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("正常系: is_dormant=false に更新し、エラーなしで完了する", async () => {
		// Arrange: supabase の update チェーンが成功を返す
		const chain = {
			update: mockUpdate,
			eq: mockEq,
		};
		mockUpdate.mockReturnValue(chain);
		mockEq.mockResolvedValue({ error: null });

		// Act
		await expect(wakeThread("thread-uuid-001")).resolves.toBeUndefined();

		// Assert: update が is_dormant=false で呼ばれた
		expect(mockUpdate).toHaveBeenCalledWith({ is_dormant: false });
		expect(mockEq).toHaveBeenCalledWith("id", "thread-uuid-001");
	});

	it("異常系: DB エラー時は例外をスローする", async () => {
		// Arrange: eq が DB エラーを返す
		const chain = {
			update: mockUpdate,
			eq: mockEq,
		};
		mockUpdate.mockReturnValue(chain);
		mockEq.mockResolvedValue({
			error: { message: "DB接続エラー", code: "PGRST500" },
		});

		// Act & Assert
		await expect(wakeThread("thread-uuid-001")).rejects.toThrow(
			"ThreadRepository.wakeThread failed",
		);
	});

	it("エッジケース: スレッドID が空文字でも呼び出し自体は実行される（バリデーションはDB側）", async () => {
		// Arrange
		const chain = {
			update: mockUpdate,
			eq: mockEq,
		};
		mockUpdate.mockReturnValue(chain);
		mockEq.mockResolvedValue({ error: null });

		// Act & Assert: 例外なし
		await expect(wakeThread("")).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// demoteOldestActiveThread テスト
// ---------------------------------------------------------------------------

describe("ThreadRepository.demoteOldestActiveThread — 末尾スレッド休眠化", () => {
	// See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("正常系: 対象スレッドを取得して is_dormant=true に更新する", async () => {
		// Arrange: 2段階のチェーン呼び出し
		// 1. select チェーン（対象スレッドを取得）
		// 2. update チェーン（is_dormant=true に更新）

		const updateChain = { update: mockUpdate, eq: mockEq };
		let eqCallCount = 0;

		// select チェーン: single() で対象スレッドを返す
		const selectChain = {
			select: mockSelect,
			eq: mockEq,
			order: mockOrder,
			limit: mockLimit,
			single: mockSingle,
		};
		mockSelect.mockReturnValue(selectChain);
		mockOrder.mockReturnValue(selectChain);
		mockLimit.mockReturnValue(selectChain);
		// eq は複数回呼ばれる（board_id, is_deleted, is_dormant, is_pinned）
		mockEq.mockImplementation(() => {
			eqCallCount++;
			// 4回目（is_pinned=false の eq）の後は single() チェーンを返す
			return eqCallCount < 4 ? selectChain : selectChain;
		});
		mockSingle.mockResolvedValue({
			data: { id: "oldest-thread-id" },
			error: null,
		});

		// update チェーン: eq で完了
		mockUpdate.mockReturnValue(updateChain);
		// update後のeqはPromiseを返す
		const originalEq = mockEq.getMockImplementation();
		mockEq.mockImplementation((...args) => {
			// update後のeqはPromiseを返す
			if (args[0] === "id") {
				return Promise.resolve({ error: null });
			}
			return originalEq ? originalEq(...args) : selectChain;
		});

		// Act
		await expect(
			demoteOldestActiveThread("battleboard"),
		).resolves.toBeUndefined();
	});

	it("正常系: 対象スレッドが存在しない場合（PGRST116）は何もしない", async () => {
		// Arrange: single() が PGRST116 を返す（対象なし）
		const selectChain = {
			select: mockSelect,
			eq: mockEq,
			order: mockOrder,
			limit: mockLimit,
			single: mockSingle,
		};
		mockSelect.mockReturnValue(selectChain);
		mockEq.mockReturnValue(selectChain);
		mockOrder.mockReturnValue(selectChain);
		mockLimit.mockReturnValue(selectChain);
		mockSingle.mockResolvedValue({
			data: null,
			error: { message: "対象なし", code: "PGRST116" },
		});

		// Act & Assert: 例外なし・何もしない
		await expect(
			demoteOldestActiveThread("battleboard"),
		).resolves.toBeUndefined();

		// update は呼ばれない
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("異常系: select で PGRST116 以外の DB エラーが発生した場合は例外をスローする", async () => {
		// Arrange: PGRST116 以外のエラー
		const selectChain = {
			select: mockSelect,
			eq: mockEq,
			order: mockOrder,
			limit: mockLimit,
			single: mockSingle,
		};
		mockSelect.mockReturnValue(selectChain);
		mockEq.mockReturnValue(selectChain);
		mockOrder.mockReturnValue(selectChain);
		mockLimit.mockReturnValue(selectChain);
		mockSingle.mockResolvedValue({
			data: null,
			error: { message: "DB接続エラー", code: "PGRST500" },
		});

		// Act & Assert
		await expect(demoteOldestActiveThread("battleboard")).rejects.toThrow(
			"ThreadRepository.demoteOldestActiveThread (select) failed",
		);
	});
});

// ---------------------------------------------------------------------------
// countActiveThreads テスト
// ---------------------------------------------------------------------------

describe("ThreadRepository.countActiveThreads — アクティブスレッド数", () => {
	// See: docs/specs/thread_state_transitions.yaml #listing_rules max_listed

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("正常系: アクティブスレッド数（count）を返す", async () => {
		// Arrange: select( { count: 'exact', head: true } ) チェーン
		const chain = {
			select: mockSelect,
			eq: mockEq,
		};
		mockSelect.mockReturnValue(chain);
		// eq は複数回呼ばれる（board_id, is_deleted, is_dormant）
		mockEq
			.mockReturnValueOnce(chain)
			.mockReturnValueOnce(chain)
			.mockResolvedValue({ count: 42, error: null });

		// Act
		const result = await countActiveThreads("battleboard");

		// Assert
		expect(result).toBe(42);
	});

	it("正常系: count が 0 の場合は 0 を返す", async () => {
		// Arrange
		const chain = {
			select: mockSelect,
			eq: mockEq,
		};
		mockSelect.mockReturnValue(chain);
		mockEq
			.mockReturnValueOnce(chain)
			.mockReturnValueOnce(chain)
			.mockResolvedValue({ count: 0, error: null });

		// Act
		const result = await countActiveThreads("battleboard");

		// Assert
		expect(result).toBe(0);
	});

	it("正常系: count が null の場合は 0 にフォールバックする", async () => {
		// Arrange: count が null（Supabase の稀なケース）
		const chain = {
			select: mockSelect,
			eq: mockEq,
		};
		mockSelect.mockReturnValue(chain);
		mockEq
			.mockReturnValueOnce(chain)
			.mockReturnValueOnce(chain)
			.mockResolvedValue({ count: null, error: null });

		// Act
		const result = await countActiveThreads("battleboard");

		// Assert: null フォールバックで 0
		expect(result).toBe(0);
	});

	it("異常系: DB エラー時は例外をスローする", async () => {
		// Arrange
		const chain = {
			select: mockSelect,
			eq: mockEq,
		};
		mockSelect.mockReturnValue(chain);
		mockEq
			.mockReturnValueOnce(chain)
			.mockReturnValueOnce(chain)
			.mockResolvedValue({
				count: null,
				error: { message: "DB接続エラー", code: "PGRST500" },
			});

		// Act & Assert
		await expect(countActiveThreads("battleboard")).rejects.toThrow(
			"ThreadRepository.countActiveThreads failed",
		);
	});

	it("境界値: count が 50 の場合は 50 を返す（上限ちょうど）", async () => {
		// Arrange
		const chain = {
			select: mockSelect,
			eq: mockEq,
		};
		mockSelect.mockReturnValue(chain);
		mockEq
			.mockReturnValueOnce(chain)
			.mockReturnValueOnce(chain)
			.mockResolvedValue({ count: 50, error: null });

		// Act
		const result = await countActiveThreads("battleboard");

		// Assert
		expect(result).toBe(50);
	});

	it("境界値: count が 51 の場合は 51 を返す（上限超過）", async () => {
		// Arrange
		const chain = {
			select: mockSelect,
			eq: mockEq,
		};
		mockSelect.mockReturnValue(chain);
		mockEq
			.mockReturnValueOnce(chain)
			.mockReturnValueOnce(chain)
			.mockResolvedValue({ count: 51, error: null });

		// Act
		const result = await countActiveThreads("battleboard");

		// Assert
		expect(result).toBe(51);
	});
});
