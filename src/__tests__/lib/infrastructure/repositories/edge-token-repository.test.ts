/**
 * 単体テスト: EdgeTokenRepository
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md §3.2 新テーブル edge_tokens
 * See: docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 各メソッドの正常系・異常系・エッジケースを網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - create: 正常作成・channel 指定・channel デフォルト・DB エラー
 *   - findByToken: 見つかる・見つからない・DB エラー
 *   - findByUserId: 複数件・0件・DB エラー
 *   - deleteByToken: 正常削除・DB エラー
 *   - updateLastUsedAt: 正常更新・DB エラー
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック
// ---------------------------------------------------------------------------

/** Supabase クライアントのチェーン呼び出しをモック化するためのビルダー */
const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

/**
 * supabaseAdmin モジュールをモック化する。
 * EdgeTokenRepository はインポート時に supabaseAdmin を参照するため、
 * モジュールレベルでモックを宣言する必要がある。
 */
vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			insert: mockInsert,
			select: mockSelect,
			update: mockUpdate,
			delete: mockDelete,
			eq: mockEq,
			order: mockOrder,
			single: mockSingle,
		})),
	},
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import type { EdgeToken } from "../../../../lib/infrastructure/repositories/edge-token-repository";
import * as EdgeTokenRepository from "../../../../lib/infrastructure/repositories/edge-token-repository";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-16T12:00:00Z");
const NOW_ISO = NOW.toISOString();

/** テスト用の EdgeTokenRow（DB レコード形式）を生成する */
function createEdgeTokenRow(
	overrides: Partial<{
		id: string;
		user_id: string;
		token: string;
		channel: string;
		created_at: string;
		last_used_at: string;
	}> = {},
) {
	return {
		id: "edge-token-id-001",
		user_id: "user-id-001",
		token: "abc123def456abc123def456abc123de",
		channel: "web",
		created_at: NOW_ISO,
		last_used_at: NOW_ISO,
		...overrides,
	};
}

/** テスト用の EdgeToken（ドメインモデル形式）を生成する */
function createExpectedEdgeToken(
	overrides: Partial<EdgeToken> = {},
): EdgeToken {
	return {
		id: "edge-token-id-001",
		userId: "user-id-001",
		token: "abc123def456abc123def456abc123de",
		channel: "web",
		createdAt: NOW,
		lastUsedAt: NOW,
		...overrides,
	};
}

/**
 * Supabase のチェーン呼び出しパターン: .from().insert().select().single()
 * に対して結果を返すようモックを設定する。
 */
function setupInsertChain(result: { data: unknown; error: unknown }) {
	mockInsert.mockReturnValue({ select: mockSelect });
	mockSelect.mockReturnValue({ single: mockSingle });
	mockSingle.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select().eq().single()
 * に対して結果を返すようモックを設定する。
 */
function setupSelectEqSingleChain(result: { data: unknown; error: unknown }) {
	mockSelect.mockReturnValue({ eq: mockEq });
	mockEq.mockReturnValue({ single: mockSingle });
	mockSingle.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select().eq().order()
 * に対して結果を返すようモックを設定する。
 */
function setupSelectEqOrderChain(result: { data: unknown; error: unknown }) {
	mockSelect.mockReturnValue({ eq: mockEq });
	mockEq.mockReturnValue({ order: mockOrder });
	mockOrder.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().update().eq()
 * に対して結果を返すようモックを設定する。
 */
function setupUpdateEqChain(result: { data: unknown; error: unknown }) {
	mockUpdate.mockReturnValue({ eq: mockEq });
	mockEq.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().delete().eq()
 * に対して結果を返すようモックを設定する。
 */
function setupDeleteEqChain(result: { data: unknown; error: unknown }) {
	mockDelete.mockReturnValue({ eq: mockEq });
	mockEq.mockResolvedValue(result);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("EdgeTokenRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// create
	// =========================================================================

	describe("create", () => {
		it("正常: userId と token を渡すと EdgeToken が返される", async () => {
			// See: features/user_registration.feature
			const row = createEdgeTokenRow();
			setupInsertChain({ data: row, error: null });

			const result = await EdgeTokenRepository.create(
				"user-id-001",
				"abc123def456abc123def456abc123de",
			);

			expect(result).toEqual(createExpectedEdgeToken());
		});

		it("正常: 作成された EdgeToken の userId フィールドが正しく変換される", async () => {
			const row = createEdgeTokenRow({ user_id: "specific-user-id" });
			setupInsertChain({ data: row, error: null });

			const result = await EdgeTokenRepository.create(
				"specific-user-id",
				"anytoken",
			);

			expect(result.userId).toBe("specific-user-id");
		});

		it("正常: 日時フィールドが Date オブジェクトに変換される", async () => {
			const row = createEdgeTokenRow({
				created_at: "2026-01-01T00:00:00Z",
				last_used_at: "2026-02-15T10:30:00Z",
			});
			setupInsertChain({ data: row, error: null });

			const result = await EdgeTokenRepository.create(
				"user-id-001",
				"anytoken",
			);

			expect(result.createdAt).toEqual(new Date("2026-01-01T00:00:00Z"));
			expect(result.lastUsedAt).toEqual(new Date("2026-02-15T10:30:00Z"));
		});

		it("正常: channel='web' を指定して作成すると channel='web' の EdgeToken が返される", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §2
			const row = createEdgeTokenRow({ channel: "web" });
			setupInsertChain({ data: row, error: null });

			const result = await EdgeTokenRepository.create(
				"user-id-001",
				"abc123def456abc123def456abc123de",
				"web",
			);

			expect(result.channel).toBe("web");
		});

		it("正常: channel='senbra' を指定して作成すると channel='senbra' の EdgeToken が返される", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §2
			const row = createEdgeTokenRow({ channel: "senbra" });
			setupInsertChain({ data: row, error: null });

			const result = await EdgeTokenRepository.create(
				"user-id-001",
				"abc123def456abc123def456abc123de",
				"senbra",
			);

			expect(result.channel).toBe("senbra");
		});

		it("正常: channel 省略時はデフォルト 'web' で作成される", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §2
			const row = createEdgeTokenRow({ channel: "web" });
			setupInsertChain({ data: row, error: null });

			const result = await EdgeTokenRepository.create(
				"user-id-001",
				"abc123def456abc123def456abc123de",
			);

			expect(result.channel).toBe("web");
		});

		it("正常: INSERT に channel が含まれる", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.2
			const row = createEdgeTokenRow({ channel: "senbra" });
			setupInsertChain({ data: row, error: null });

			await EdgeTokenRepository.create("user-id-001", "test-token", "senbra");

			// insert が { user_id, token, channel } で呼ばれたことを確認
			expect(mockInsert).toHaveBeenCalledWith({
				user_id: "user-id-001",
				token: "test-token",
				channel: "senbra",
			});
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupInsertChain({
				data: null,
				error: { message: "duplicate key value" },
			});

			await expect(
				EdgeTokenRepository.create("user-id-001", "duplicate-token"),
			).rejects.toThrow(
				"EdgeTokenRepository.create failed: duplicate key value",
			);
		});
	});

	// =========================================================================
	// findByToken
	// =========================================================================

	describe("findByToken", () => {
		it("正常: 存在する token で EdgeToken が返される（channel 含む）", async () => {
			// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
			const row = createEdgeTokenRow();
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await EdgeTokenRepository.findByToken(
				"abc123def456abc123def456abc123de",
			);

			expect(result).toEqual(createExpectedEdgeToken());
			expect(result?.channel).toBe("web");
		});

		it("正常: senbra チャネルの token で channel='senbra' が返される", async () => {
			// See: tmp/edge_token_channel_separation_plan.md §3.4
			const row = createEdgeTokenRow({ channel: "senbra" });
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await EdgeTokenRepository.findByToken("senbra-token");

			expect(result?.channel).toBe("senbra");
		});

		it("正常: 存在しない token の場合は null を返す", async () => {
			setupSelectEqSingleChain({
				data: null,
				error: { code: "PGRST116", message: "Row not found" },
			});

			const result = await EdgeTokenRepository.findByToken("nonexistent-token");

			expect(result).toBeNull();
		});

		it("異常系: PGRST116 以外の DB エラーはスローされる", async () => {
			setupSelectEqSingleChain({
				data: null,
				error: { code: "PGRST001", message: "connection error" },
			});

			await expect(
				EdgeTokenRepository.findByToken("any-token"),
			).rejects.toThrow(
				"EdgeTokenRepository.findByToken failed: connection error",
			);
		});

		it("エッジケース: 空文字列のトークンも検索を試みる", async () => {
			setupSelectEqSingleChain({
				data: null,
				error: { code: "PGRST116", message: "Row not found" },
			});

			const result = await EdgeTokenRepository.findByToken("");

			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// findByUserId
	// =========================================================================

	describe("findByUserId", () => {
		it("正常: 複数の edge-token が返される", async () => {
			const rows = [
				createEdgeTokenRow({ id: "token-id-1", token: "token1" }),
				createEdgeTokenRow({ id: "token-id-2", token: "token2" }),
			];
			setupSelectEqOrderChain({ data: rows, error: null });

			const result = await EdgeTokenRepository.findByUserId("user-id-001");

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("token-id-1");
			expect(result[1].id).toBe("token-id-2");
		});

		it("正常: 該当するユーザーの edge-token が存在しない場合は空配列を返す", async () => {
			setupSelectEqOrderChain({ data: [], error: null });

			const result = await EdgeTokenRepository.findByUserId(
				"user-with-no-tokens",
			);

			expect(result).toEqual([]);
		});

		it("正常: data が null の場合も空配列を返す", async () => {
			setupSelectEqOrderChain({ data: null, error: null });

			const result = await EdgeTokenRepository.findByUserId("user-id-001");

			expect(result).toEqual([]);
		});

		it("正常: 返されたすべての EdgeToken の日時フィールドが Date 型である", async () => {
			const rows = [
				createEdgeTokenRow({
					id: "token-id-1",
					created_at: "2026-01-01T00:00:00Z",
					last_used_at: "2026-03-01T00:00:00Z",
				}),
				createEdgeTokenRow({
					id: "token-id-2",
					created_at: "2026-02-01T00:00:00Z",
					last_used_at: "2026-03-10T00:00:00Z",
				}),
			];
			setupSelectEqOrderChain({ data: rows, error: null });

			const result = await EdgeTokenRepository.findByUserId("user-id-001");

			for (const edgeToken of result) {
				expect(edgeToken.createdAt).toBeInstanceOf(Date);
				expect(edgeToken.lastUsedAt).toBeInstanceOf(Date);
			}
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupSelectEqOrderChain({
				data: null,
				error: { message: "network error" },
			});

			await expect(
				EdgeTokenRepository.findByUserId("user-id-001"),
			).rejects.toThrow(
				"EdgeTokenRepository.findByUserId failed: network error",
			);
		});
	});

	// =========================================================================
	// deleteByToken
	// =========================================================================

	describe("deleteByToken", () => {
		it("正常: 指定した token の行が削除される（エラーなし）", async () => {
			// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
			setupDeleteEqChain({ data: null, error: null });

			await expect(
				EdgeTokenRepository.deleteByToken("abc123def456abc123def456abc123de"),
			).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupDeleteEqChain({
				data: null,
				error: { message: "foreign key violation" },
			});

			await expect(
				EdgeTokenRepository.deleteByToken("any-token"),
			).rejects.toThrow(
				"EdgeTokenRepository.deleteByToken failed: foreign key violation",
			);
		});

		it("エッジケース: 存在しないトークンを削除しても正常終了する（DB は 0 件削除を正常扱い）", async () => {
			setupDeleteEqChain({ data: null, error: null });

			await expect(
				EdgeTokenRepository.deleteByToken("nonexistent-token"),
			).resolves.toBeUndefined();
		});
	});

	// =========================================================================
	// updateLastUsedAt
	// =========================================================================

	describe("updateLastUsedAt", () => {
		it("正常: 指定した token の last_used_at が更新される（エラーなし）", async () => {
			setupUpdateEqChain({ data: null, error: null });

			await expect(
				EdgeTokenRepository.updateLastUsedAt(
					"abc123def456abc123def456abc123de",
				),
			).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqChain({
				data: null,
				error: { message: "connection timeout" },
			});

			await expect(
				EdgeTokenRepository.updateLastUsedAt("any-token"),
			).rejects.toThrow(
				"EdgeTokenRepository.updateLastUsedAt failed: connection timeout",
			);
		});

		it("エッジケース: 更新対象の token が存在しなくても DB エラーがなければ正常終了する", async () => {
			// Supabase の UPDATE は対象行が 0 件でもエラーにならない
			setupUpdateEqChain({ data: null, error: null });

			await expect(
				EdgeTokenRepository.updateLastUsedAt("nonexistent-token"),
			).resolves.toBeUndefined();
		});
	});
});
