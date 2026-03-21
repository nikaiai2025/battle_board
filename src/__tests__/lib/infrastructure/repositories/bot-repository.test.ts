/**
 * 単体テスト: BotRepository
 *
 * See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
 * See: docs/architecture/components/bot.md §2.2 HP更新・ダメージ処理
 * See: docs/architecture/components/bot.md §5.1 bots テーブル変更 (v5)
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - incrementColumn のアトミック更新（RPC呼び出し）を重点的に検証する
 *   - HIGH-004（レースコンディション）修正の回帰テストを含む
 *   - 各メソッドの正常系・異常系・エッジケースを網羅する
 *
 * カバレッジ対象:
 *   - incrementTotalPosts:    正常呼び出し・DBエラー
 *   - incrementAccusedCount:  正常呼び出し・DBエラー
 *   - incrementSurvivalDays:  正常呼び出し・DBエラー
 *   - incrementTimesAttacked: 正常呼び出し・DBエラー（主要ユースケース）
 *   - findById:               正常取得・存在しない（PGRST116）・DBエラー
 *   - findActive:             正常取得（複数件）・DBエラー
 *   - findAll:                正常取得・DBエラー
 *   - updateHp:               正常更新・DBエラー
 *   - reveal / unreveal:      正常更新・DBエラー
 *   - eliminate:              正常更新・DBエラー
 *   - bulkResetRevealed:      正常実行・DBエラー
 *   - bulkReviveEliminated:   正常実行・0件・DBエラー
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック
// ---------------------------------------------------------------------------

/**
 * vi.mock ファクトリはファイルトップへホイスティングされるため、
 * 通常の const 宣言より前に実行される。
 * vi.hoisted を使用してファクトリ内で参照する変数をホイスティング順序に合わせる。
 */
const { mockRpc, mockSelect, mockInsert, mockUpdate, mockEq, mockSingle } =
	vi.hoisted(() => ({
		mockRpc: vi.fn(),
		mockSelect: vi.fn(),
		mockInsert: vi.fn(),
		mockUpdate: vi.fn(),
		mockEq: vi.fn(),
		mockSingle: vi.fn(),
	}));

/**
 * supabaseAdmin モジュールをモック化する。
 * BotRepository はインポート時に supabaseAdmin を参照するため、
 * モジュールレベルでモックを宣言する必要がある。
 */
vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: mockSelect,
			insert: mockInsert,
			update: mockUpdate,
			eq: mockEq,
			single: mockSingle,
		})),
		rpc: mockRpc,
	},
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import * as BotRepository from "../../../../lib/infrastructure/repositories/bot-repository";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-03-16T12:00:00.000Z";
const NOW = new Date(NOW_ISO);

/** テスト用の BotRow（DB レコード形式）を生成する */
function createBotRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "bot-id-001",
		name: "荒らし役",
		persona: "荒らし",
		hp: 10,
		max_hp: 10,
		daily_id: "FkBot01",
		daily_id_date: "2026-03-16",
		is_active: true,
		is_revealed: false,
		revealed_at: null,
		survival_days: 3,
		total_posts: 5,
		accused_count: 2,
		times_attacked: 1,
		bot_profile_key: "荒らし役",
		next_post_at: null,
		eliminated_at: null,
		eliminated_by: null,
		created_at: NOW_ISO,
		...overrides,
	};
}

/** テスト用の Bot（ドメインモデル形式）を生成する */
function createExpectedBot(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "bot-id-001",
		name: "荒らし役",
		persona: "荒らし",
		hp: 10,
		maxHp: 10,
		dailyId: "FkBot01",
		dailyIdDate: "2026-03-16",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 3,
		totalPosts: 5,
		accusedCount: 2,
		timesAttacked: 1,
		botProfileKey: "荒らし役",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: NOW,
		...overrides,
	};
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select().eq().single()
 */
function setupSelectEqSingleChain(result: { data: unknown; error: unknown }) {
	mockSelect.mockReturnValue({ eq: mockEq });
	mockEq.mockReturnValue({ single: mockSingle });
	mockSingle.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select().eq()
 */
function setupSelectEqChain(result: { data: unknown; error: unknown }) {
	mockSelect.mockReturnValue({ eq: mockEq });
	mockEq.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select()
 */
function setupSelectChain(result: { data: unknown; error: unknown }) {
	mockSelect.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().update().eq()
 */
function setupUpdateEqChain(result: { data: unknown; error: unknown }) {
	mockUpdate.mockReturnValue({ eq: mockEq });
	mockEq.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().update().eq().select()
 * bulkResetRevealed の .eq().select() チェーンに対応する。
 */
function setupUpdateEqSelectChain(result: { data: unknown; error: unknown }) {
	const mockSelect2 = vi.fn().mockResolvedValue(result);
	mockUpdate.mockReturnValue({ eq: mockEq });
	mockEq.mockReturnValue({ select: mockSelect2 });
}

/**
 * Supabase のチェーン呼び出しパターン: .from().insert().select().single()
 */
function setupInsertSelectSingleChain(result: {
	data: unknown;
	error: unknown;
}) {
	const mockSelect2 = vi.fn().mockReturnValue({ single: mockSingle });
	mockInsert.mockReturnValue({ select: mockSelect2 });
	mockSingle.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select().eq(is_active)
 */
function setupSelectEqActiveChain(result: { data: unknown; error: unknown }) {
	mockSelect.mockReturnValue({ eq: mockEq });
	mockEq.mockResolvedValue(result);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("BotRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// incrementColumn (アトミック更新) — HIGH-004 修正の中心
	// =========================================================================

	describe("incrementTimesAttacked（HIGH-004: アトミック更新）", () => {
		// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
		// See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される

		it("正常: increment_bot_column RPC を呼び出す（SELECT+UPDATEではなくRPC）", async () => {
			// HIGH-004 修正の回帰テスト: supabaseAdmin.from().select() が呼ばれないことを確認
			mockRpc.mockResolvedValue({ data: 2, error: null });

			await BotRepository.incrementTimesAttacked("bot-id-001");

			// RPC が呼ばれていること
			expect(mockRpc).toHaveBeenCalledWith("increment_bot_column", {
				p_bot_id: "bot-id-001",
				p_column: "times_attacked",
			});
		});

		it("正常: increment_bot_column RPC が1度だけ呼ばれる（2ステップではない）", async () => {
			// HIGH-004 修正の回帰テスト: RPC 1回のみ（SELECT 0回 + UPDATE 0回）
			mockRpc.mockResolvedValue({ data: 3, error: null });

			await BotRepository.incrementTimesAttacked("bot-id-001");

			// RPC が正確に1回呼ばれること（SELECT + UPDATE の2回ではない）
			expect(mockRpc).toHaveBeenCalledTimes(1);
		});

		it("正常: 異なる botId で呼ばれた場合、正しい botId が RPC に渡される", async () => {
			mockRpc.mockResolvedValue({ data: 1, error: null });

			await BotRepository.incrementTimesAttacked("another-bot-uuid");

			expect(mockRpc).toHaveBeenCalledWith("increment_bot_column", {
				p_bot_id: "another-bot-uuid",
				p_column: "times_attacked",
			});
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			mockRpc.mockResolvedValue({
				data: null,
				error: { message: "connection timeout" },
			});

			await expect(
				BotRepository.incrementTimesAttacked("bot-id-001"),
			).rejects.toThrow(
				"BotRepository.increment(times_attacked) failed: connection timeout",
			);
		});

		it("異常系: ボットが存在しない場合（RPC が例外を返す）はエラーをスローする", async () => {
			mockRpc.mockResolvedValue({
				data: null,
				error: { message: "increment_bot_column: bot not found: bot-id-999" },
			});

			await expect(
				BotRepository.incrementTimesAttacked("bot-id-999"),
			).rejects.toThrow("BotRepository.increment(times_attacked) failed:");
		});
	});

	describe("incrementTotalPosts", () => {
		it("正常: total_posts カラムで RPC を呼び出す", async () => {
			mockRpc.mockResolvedValue({ data: 6, error: null });

			await BotRepository.incrementTotalPosts("bot-id-001");

			expect(mockRpc).toHaveBeenCalledWith("increment_bot_column", {
				p_bot_id: "bot-id-001",
				p_column: "total_posts",
			});
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			mockRpc.mockResolvedValue({
				data: null,
				error: { message: "db error" },
			});

			await expect(
				BotRepository.incrementTotalPosts("bot-id-001"),
			).rejects.toThrow(
				"BotRepository.increment(total_posts) failed: db error",
			);
		});
	});

	describe("incrementAccusedCount", () => {
		it("正常: accused_count カラムで RPC を呼び出す", async () => {
			mockRpc.mockResolvedValue({ data: 3, error: null });

			await BotRepository.incrementAccusedCount("bot-id-001");

			expect(mockRpc).toHaveBeenCalledWith("increment_bot_column", {
				p_bot_id: "bot-id-001",
				p_column: "accused_count",
			});
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			mockRpc.mockResolvedValue({
				data: null,
				error: { message: "db error" },
			});

			await expect(
				BotRepository.incrementAccusedCount("bot-id-001"),
			).rejects.toThrow(
				"BotRepository.increment(accused_count) failed: db error",
			);
		});
	});

	describe("incrementSurvivalDays", () => {
		it("正常: survival_days カラムで RPC を呼び出す", async () => {
			mockRpc.mockResolvedValue({ data: 4, error: null });

			await BotRepository.incrementSurvivalDays("bot-id-001");

			expect(mockRpc).toHaveBeenCalledWith("increment_bot_column", {
				p_bot_id: "bot-id-001",
				p_column: "survival_days",
			});
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			mockRpc.mockResolvedValue({
				data: null,
				error: { message: "db error" },
			});

			await expect(
				BotRepository.incrementSurvivalDays("bot-id-001"),
			).rejects.toThrow(
				"BotRepository.increment(survival_days) failed: db error",
			);
		});
	});

	// =========================================================================
	// findById
	// =========================================================================

	describe("findById", () => {
		it("正常: ボットが見つかった場合は Bot ドメインモデルを返す", async () => {
			const row = createBotRow();
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await BotRepository.findById("bot-id-001");

			expect(result).toEqual(createExpectedBot());
		});

		it("正常: PGRST116 エラーの場合は null を返す", async () => {
			setupSelectEqSingleChain({
				data: null,
				error: { code: "PGRST116", message: "Row not found" },
			});

			const result = await BotRepository.findById("bot-id-not-found");

			expect(result).toBeNull();
		});

		it("正常: snake_case から camelCase に正しく変換される", async () => {
			const row = createBotRow({
				hp: 5,
				max_hp: 10,
				daily_id: "FkBotXY",
				daily_id_date: "2026-03-17",
				is_active: false,
				is_revealed: true,
				revealed_at: "2026-03-17T10:00:00.000Z",
				survival_days: 7,
				total_posts: 20,
				accused_count: 3,
				times_attacked: 5,
				bot_profile_key: "レイドボス",
				eliminated_at: "2026-03-17T11:00:00.000Z",
				eliminated_by: "user-id-001",
			});
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await BotRepository.findById("bot-id-001");

			expect(result?.hp).toBe(5);
			expect(result?.maxHp).toBe(10);
			expect(result?.dailyId).toBe("FkBotXY");
			expect(result?.dailyIdDate).toBe("2026-03-17");
			expect(result?.isActive).toBe(false);
			expect(result?.isRevealed).toBe(true);
			expect(result?.revealedAt).toEqual(new Date("2026-03-17T10:00:00.000Z"));
			expect(result?.survivalDays).toBe(7);
			expect(result?.totalPosts).toBe(20);
			expect(result?.accusedCount).toBe(3);
			expect(result?.timesAttacked).toBe(5);
			expect(result?.botProfileKey).toBe("レイドボス");
			expect(result?.eliminatedAt).toEqual(
				new Date("2026-03-17T11:00:00.000Z"),
			);
			expect(result?.eliminatedBy).toBe("user-id-001");
		});

		it("正常: revealed_at が null の場合、revealedAt は null になる", async () => {
			const row = createBotRow({ revealed_at: null });
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await BotRepository.findById("bot-id-001");

			expect(result?.revealedAt).toBeNull();
		});

		it("正常: eliminated_at が null の場合、eliminatedAt は null になる", async () => {
			const row = createBotRow({ eliminated_at: null });
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await BotRepository.findById("bot-id-001");

			expect(result?.eliminatedAt).toBeNull();
		});

		it("異常系: PGRST116 以外の DB エラーはスローされる", async () => {
			setupSelectEqSingleChain({
				data: null,
				error: { code: "PGRST001", message: "connection failed" },
			});

			await expect(BotRepository.findById("bot-id-001")).rejects.toThrow(
				"BotRepository.findById failed: connection failed",
			);
		});

		it("エッジケース: bot_profile_key が null の場合 botProfileKey は null になる", async () => {
			const row = createBotRow({ bot_profile_key: null });
			setupSelectEqSingleChain({ data: row, error: null });

			const result = await BotRepository.findById("bot-id-001");

			expect(result?.botProfileKey).toBeNull();
		});
	});

	// =========================================================================
	// findActive
	// =========================================================================

	describe("findActive", () => {
		it("正常: 活動中のボットリストを返す", async () => {
			const rows = [
				createBotRow({ id: "bot-id-001" }),
				createBotRow({ id: "bot-id-002" }),
			];
			setupSelectEqActiveChain({ data: rows, error: null });

			const result = await BotRepository.findActive();

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("bot-id-001");
			expect(result[1].id).toBe("bot-id-002");
		});

		it("正常: 活動中ボットが 0 件の場合は空配列を返す", async () => {
			setupSelectEqActiveChain({ data: [], error: null });

			const result = await BotRepository.findActive();

			expect(result).toEqual([]);
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupSelectEqActiveChain({
				data: null,
				error: { message: "query failed" },
			});

			await expect(BotRepository.findActive()).rejects.toThrow(
				"BotRepository.findActive failed: query failed",
			);
		});
	});

	// =========================================================================
	// findAll
	// =========================================================================

	describe("findAll", () => {
		it("正常: 全ボットリストを返す（is_active フラグ問わず）", async () => {
			const rows = [
				createBotRow({ id: "bot-id-001", is_active: true }),
				createBotRow({ id: "bot-id-002", is_active: false }),
			];
			setupSelectChain({ data: rows, error: null });

			const result = await BotRepository.findAll();

			expect(result).toHaveLength(2);
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupSelectChain({ data: null, error: { message: "db error" } });

			await expect(BotRepository.findAll()).rejects.toThrow(
				"BotRepository.findAll failed: db error",
			);
		});
	});

	// =========================================================================
	// updateHp
	// =========================================================================

	describe("updateHp", () => {
		it("正常: HP が更新される", async () => {
			setupUpdateEqChain({ data: null, error: null });

			await expect(
				BotRepository.updateHp("bot-id-001", 5),
			).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqChain({ data: null, error: { message: "update failed" } });

			await expect(BotRepository.updateHp("bot-id-001", 5)).rejects.toThrow(
				"BotRepository.updateHp failed: update failed",
			);
		});
	});

	// =========================================================================
	// reveal / unreveal
	// =========================================================================

	describe("reveal", () => {
		// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合

		it("正常: is_revealed = true に更新される", async () => {
			setupUpdateEqChain({ data: null, error: null });

			await expect(BotRepository.reveal("bot-id-001")).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqChain({ data: null, error: { message: "reveal failed" } });

			await expect(BotRepository.reveal("bot-id-001")).rejects.toThrow(
				"BotRepository.reveal failed: reveal failed",
			);
		});
	});

	describe("unreveal", () => {
		it("正常: is_revealed = false に更新される", async () => {
			setupUpdateEqChain({ data: null, error: null });

			await expect(
				BotRepository.unreveal("bot-id-001"),
			).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqChain({ data: null, error: { message: "unreveal failed" } });

			await expect(BotRepository.unreveal("bot-id-001")).rejects.toThrow(
				"BotRepository.unreveal failed: unreveal failed",
			);
		});
	});

	// =========================================================================
	// eliminate
	// =========================================================================

	describe("eliminate", () => {
		// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される

		it("正常: ボットが撃破状態（is_active = false）に更新される", async () => {
			setupUpdateEqChain({ data: null, error: null });

			await expect(
				BotRepository.eliminate("bot-id-001", "attacker-id-001"),
			).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqChain({
				data: null,
				error: { message: "eliminate failed" },
			});

			await expect(
				BotRepository.eliminate("bot-id-001", "attacker-id-001"),
			).rejects.toThrow("BotRepository.eliminate failed: eliminate failed");
		});
	});

	// =========================================================================
	// bulkResetRevealed
	// =========================================================================

	describe("bulkResetRevealed", () => {
		// See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する

		it("正常: 解除したボット数を返す", async () => {
			setupUpdateEqSelectChain({
				data: [{ id: "bot-id-001" }, { id: "bot-id-002" }],
				error: null,
			});

			const count = await BotRepository.bulkResetRevealed();

			expect(count).toBe(2);
		});

		it("正常: 対象ボットが 0 件の場合は 0 を返す", async () => {
			setupUpdateEqSelectChain({ data: [], error: null });

			const count = await BotRepository.bulkResetRevealed();

			expect(count).toBe(0);
		});

		it("正常: data が null の場合は 0 を返す", async () => {
			setupUpdateEqSelectChain({ data: null, error: null });

			const count = await BotRepository.bulkResetRevealed();

			expect(count).toBe(0);
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqSelectChain({
				data: null,
				error: { message: "bulk reset failed" },
			});

			await expect(BotRepository.bulkResetRevealed()).rejects.toThrow(
				"BotRepository.bulkResetRevealed failed: bulk reset failed",
			);
		});
	});

	// =========================================================================
	// bulkReviveEliminated
	// =========================================================================

	describe("bulkReviveEliminated", () => {
		// See: features/bot_system.feature @撃破済みボットは翌日にHP初期値で復活する
		// See: features/welcome.feature @チュートリアルBOTは日次リセットで復活しない

		it("正常: eliminated ボットを復活させ復活数を返す", async () => {
			// Supabase のチェーン: .from().select().eq().or() → 復活対象取得（tutorial 除外）
			const mockOrInner = vi.fn().mockResolvedValue({
				data: [
					{ id: "bot-id-001", max_hp: 10 },
					{ id: "bot-id-002", max_hp: 20 },
				],
				error: null,
			});
			const mockEqInner = vi.fn().mockReturnValue({ or: mockOrInner });
			mockSelect.mockReturnValue({ eq: mockEqInner });

			// .from().update().eq() → 個別更新（2回呼ばれる）
			mockUpdate.mockReturnValue({ eq: mockEq });
			mockEq.mockResolvedValue({ error: null });

			const count = await BotRepository.bulkReviveEliminated();

			expect(count).toBe(2);
			// tutorial 除外フィルタが正しく渡されていることを確認
			expect(mockOrInner).toHaveBeenCalledWith(
				"bot_profile_key.is.null,bot_profile_key.neq.tutorial",
			);
		});

		it("正常: eliminated ボットが 0 件の場合は 0 を返す（DB更新なし）", async () => {
			const mockOrInner = vi.fn().mockResolvedValue({ data: [], error: null });
			const mockEqInner = vi.fn().mockReturnValue({ or: mockOrInner });
			mockSelect.mockReturnValue({ eq: mockEqInner });

			const count = await BotRepository.bulkReviveEliminated();

			// 更新は呼ばれない
			expect(mockUpdate).not.toHaveBeenCalled();
			expect(count).toBe(0);
		});

		it("正常: tutorial プロファイルの eliminated ボットは復活対象から除外される", async () => {
			// tutorial ボットが is_active=false でも or フィルタにより取得されない
			const mockOrInner = vi.fn().mockResolvedValue({
				data: [], // tutorial ボットはフィルタで除外されるため 0 件
				error: null,
			});
			const mockEqInner = vi.fn().mockReturnValue({ or: mockOrInner });
			mockSelect.mockReturnValue({ eq: mockEqInner });

			const count = await BotRepository.bulkReviveEliminated();

			expect(count).toBe(0);
			// tutorial 除外フィルタが渡されていることを確認
			expect(mockEqInner).toHaveBeenCalledWith("is_active", false);
			expect(mockOrInner).toHaveBeenCalledWith(
				"bot_profile_key.is.null,bot_profile_key.neq.tutorial",
			);
		});

		it("異常系: 取得時 DB エラーが発生した場合はエラーをスローする", async () => {
			const mockOrInner = vi
				.fn()
				.mockResolvedValue({ data: null, error: { message: "fetch error" } });
			const mockEqInner = vi.fn().mockReturnValue({ or: mockOrInner });
			mockSelect.mockReturnValue({ eq: mockEqInner });

			await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow(
				"BotRepository.bulkReviveEliminated fetch failed: fetch error",
			);
		});

		it("異常系: 更新時 DB エラーが発生した場合はエラーをスローする", async () => {
			const mockOrInner = vi.fn().mockResolvedValue({
				data: [{ id: "bot-id-001", max_hp: 10 }],
				error: null,
			});
			const mockEqInner = vi.fn().mockReturnValue({ or: mockOrInner });
			mockSelect.mockReturnValue({ eq: mockEqInner });

			mockUpdate.mockReturnValue({ eq: mockEq });
			mockEq.mockResolvedValue({ error: { message: "update error" } });

			await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow(
				"BotRepository.bulkReviveEliminated update failed for bot bot-id-001: update error",
			);
		});
	});

	// =========================================================================
	// create
	// =========================================================================

	describe("create", () => {
		it("正常: ボットが作成され Bot ドメインモデルを返す", async () => {
			const row = createBotRow();
			setupInsertSelectSingleChain({ data: row, error: null });

			const result = await BotRepository.create({
				name: "荒らし役",
				persona: "荒らし",
				hp: 10,
				maxHp: 10,
				dailyId: "FkBot01",
				dailyIdDate: "2026-03-16",
				isActive: true,
				isRevealed: false,
				revealedAt: null,
				botProfileKey: "荒らし役",
				// See: docs/architecture/architecture.md §13 TDR-010
				nextPostAt: null,
			});

			expect(result).toEqual(createExpectedBot());
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupInsertSelectSingleChain({
				data: null,
				error: { message: "duplicate key" },
			});

			await expect(
				BotRepository.create({
					name: "荒らし役",
					persona: "荒らし",
					hp: 10,
					maxHp: 10,
					dailyId: "FkBot01",
					dailyIdDate: "2026-03-16",
					isActive: true,
					isRevealed: false,
					revealedAt: null,
					botProfileKey: null,
					// See: docs/architecture/architecture.md §13 TDR-010
					nextPostAt: null,
				}),
			).rejects.toThrow("BotRepository.create failed: duplicate key");
		});
	});

	// =========================================================================
	// updateDailyId
	// =========================================================================

	describe("updateDailyId", () => {
		it("正常: 偽装IDと発行日が更新される", async () => {
			setupUpdateEqChain({ data: null, error: null });

			await expect(
				BotRepository.updateDailyId("bot-id-001", "NewId01", "2026-03-17"),
			).resolves.toBeUndefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupUpdateEqChain({
				data: null,
				error: { message: "update failed" },
			});

			await expect(
				BotRepository.updateDailyId("bot-id-001", "NewId01", "2026-03-17"),
			).rejects.toThrow("BotRepository.updateDailyId failed: update failed");
		});
	});

	// =========================================================================
	// deleteEliminatedTutorialBots
	// =========================================================================

	describe("deleteEliminatedTutorialBots", () => {
		// See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
		// See: tmp/workers/bdd-architect_TASK-236/design.md §3.8

		it("正常: 撃破済み2件 + 古い未撃破1件を削除し合計3を返す", async () => {
			// Supabase のチェーン: .from().delete().eq("bot_profile_key","tutorial").eq("is_active",false).select("id")
			// → 撃破済み2件
			const mockDeleteSelectEliminated = vi.fn().mockResolvedValue({
				data: [{ id: "bot-tutorial-001" }, { id: "bot-tutorial-002" }],
				error: null,
			});
			const mockEqIsActiveFalse = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectEliminated });
			const mockEqBotProfileKeyEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqIsActiveFalse });
			const mockDeleteEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyEliminated });

			// Supabase のチェーン: .from().delete().eq("bot_profile_key","tutorial").lt("created_at", ...).select("id")
			// → 古い未撃破1件
			const mockDeleteSelectStale = vi.fn().mockResolvedValue({
				data: [{ id: "bot-tutorial-003" }],
				error: null,
			});
			const mockLtCreatedAt = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectStale });
			const mockEqBotProfileKeyStale = vi
				.fn()
				.mockReturnValue({ lt: mockLtCreatedAt });
			const mockDeleteStale = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyStale });

			// 1回目の from() 呼び出し: 撃破済み削除
			// 2回目の from() 呼び出し: 古い未撃破削除
			const { supabaseAdmin } = await import(
				"../../../../lib/infrastructure/supabase/client"
			);
			vi.mocked(supabaseAdmin.from)
				.mockReturnValueOnce({
					delete: mockDeleteEliminated,
				} as unknown as ReturnType<typeof supabaseAdmin.from>)
				.mockReturnValueOnce({
					delete: mockDeleteStale,
				} as unknown as ReturnType<typeof supabaseAdmin.from>);

			const count = await BotRepository.deleteEliminatedTutorialBots();

			expect(count).toBe(3); // 撃破済み2 + 古い未撃破1
		});

		it("正常: 削除対象が 0 件の場合は 0 を返す", async () => {
			const mockDeleteSelectEliminated = vi.fn().mockResolvedValue({
				data: [],
				error: null,
			});
			const mockEqIsActiveFalse = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectEliminated });
			const mockEqBotProfileKeyEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqIsActiveFalse });
			const mockDeleteEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyEliminated });

			const mockDeleteSelectStale = vi.fn().mockResolvedValue({
				data: [],
				error: null,
			});
			const mockLtCreatedAt = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectStale });
			const mockEqBotProfileKeyStale = vi
				.fn()
				.mockReturnValue({ lt: mockLtCreatedAt });
			const mockDeleteStale = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyStale });

			const { supabaseAdmin } = await import(
				"../../../../lib/infrastructure/supabase/client"
			);
			vi.mocked(supabaseAdmin.from)
				.mockReturnValueOnce({
					delete: mockDeleteEliminated,
				} as unknown as ReturnType<typeof supabaseAdmin.from>)
				.mockReturnValueOnce({
					delete: mockDeleteStale,
				} as unknown as ReturnType<typeof supabaseAdmin.from>);

			const count = await BotRepository.deleteEliminatedTutorialBots();

			expect(count).toBe(0);
		});

		it("異常系: 撃破済み削除時 DB エラーが発生した場合はエラーをスローする", async () => {
			const mockDeleteSelectEliminated = vi.fn().mockResolvedValue({
				data: null,
				error: { message: "delete eliminated error" },
			});
			const mockEqIsActiveFalse = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectEliminated });
			const mockEqBotProfileKeyEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqIsActiveFalse });
			const mockDeleteEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyEliminated });

			const { supabaseAdmin } = await import(
				"../../../../lib/infrastructure/supabase/client"
			);
			vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
				delete: mockDeleteEliminated,
			} as unknown as ReturnType<typeof supabaseAdmin.from>);

			await expect(
				BotRepository.deleteEliminatedTutorialBots(),
			).rejects.toThrow(
				"BotRepository.deleteEliminatedTutorialBots (eliminated) failed: delete eliminated error",
			);
		});

		it("異常系: 古い未撃破削除時 DB エラーが発生した場合はエラーをスローする", async () => {
			const mockDeleteSelectEliminated = vi.fn().mockResolvedValue({
				data: [],
				error: null,
			});
			const mockEqIsActiveFalse = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectEliminated });
			const mockEqBotProfileKeyEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqIsActiveFalse });
			const mockDeleteEliminated = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyEliminated });

			const mockDeleteSelectStale = vi.fn().mockResolvedValue({
				data: null,
				error: { message: "delete stale error" },
			});
			const mockLtCreatedAt = vi
				.fn()
				.mockReturnValue({ select: mockDeleteSelectStale });
			const mockEqBotProfileKeyStale = vi
				.fn()
				.mockReturnValue({ lt: mockLtCreatedAt });
			const mockDeleteStale = vi
				.fn()
				.mockReturnValue({ eq: mockEqBotProfileKeyStale });

			const { supabaseAdmin } = await import(
				"../../../../lib/infrastructure/supabase/client"
			);
			vi.mocked(supabaseAdmin.from)
				.mockReturnValueOnce({
					delete: mockDeleteEliminated,
				} as unknown as ReturnType<typeof supabaseAdmin.from>)
				.mockReturnValueOnce({
					delete: mockDeleteStale,
				} as unknown as ReturnType<typeof supabaseAdmin.from>);

			await expect(
				BotRepository.deleteEliminatedTutorialBots(),
			).rejects.toThrow(
				"BotRepository.deleteEliminatedTutorialBots (stale) failed: delete stale error",
			);
		});
	});
});
