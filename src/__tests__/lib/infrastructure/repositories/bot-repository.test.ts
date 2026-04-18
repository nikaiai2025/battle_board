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
		// TASK-307: ボット草カウント（00029マイグレーションで追加）
		grass_count: 0,
		// Sprint-154 TASK-387: 冪等化用タイムスタンプ（00047マイグレーションで追加）
		// See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
		revived_at: null,
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
		// TASK-307: ボット草カウント（00029マイグレーションで追加）
		grassCount: 0,
		// Sprint-154 TASK-387: 冪等化用タイムスタンプ（00047マイグレーションで追加）
		revivedAt: null,
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
		// See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
		//
		// 実装変更: UPDATE → INSERT（インカーネーションモデル）
		// 旧レコードは凍結保持し、新レコードを INSERT して新世代 Bot[] を返す。

		// Sprint-154 TASK-387: SELECT チェーンは .from().select().eq(is_active).is(revived_at, null).or(profile除外)
		// INSERT 成功後、同一ループ内で .from().update({revived_at: NOW()}).eq("id", old.id) が実行される。
		//
		// See: src/lib/infrastructure/repositories/bot-repository.ts bulkReviveEliminated
		// See: tmp/workers/bdd-architect_TASK-386/design.md §2.3

		/**
		 * bulkReviveEliminated の SELECT チェーンをセットアップする。
		 * 返り値で mockIsInner / mockOrInner を呼び出し検証に使える。
		 */
		function setupBulkReviveSelectChain(result: {
			data: unknown;
			error: unknown;
		}) {
			const mockOrInner = vi.fn().mockResolvedValue(result);
			const mockIsInner = vi.fn().mockReturnValue({ or: mockOrInner });
			const mockEqInner = vi.fn().mockReturnValue({ is: mockIsInner });
			mockSelect.mockReturnValueOnce({ eq: mockEqInner });
			return { mockEqInner, mockIsInner, mockOrInner };
		}

		/**
		 * 目標 active 件数を持つプロファイルの active 数カウントチェーンをセットアップする。
		 */
		function setupActiveCountChain(result: { count: number | null; error: unknown }) {
			const mockEqProfile = vi.fn().mockResolvedValue(result);
			const mockEqIsActive = vi.fn().mockReturnValue({ eq: mockEqProfile });
			mockSelect.mockReturnValueOnce({ eq: mockEqIsActive });
			return { mockEqIsActive, mockEqProfile };
		}

		/**
		 * INSERT 後の UPDATE チェーンを共通セットアップする。
		 * 成功時は error: null を返す。
		 */
		function setupReviveUpdateChain(result: { error: unknown }) {
			const mockUpdateEq = vi.fn().mockResolvedValue(result);
			mockUpdate.mockReturnValue({ eq: mockUpdateEq });
			return { mockUpdateEq };
		}

		function setupSequentialInsertSelectSingleChain(
			results: Array<{ data: unknown; error: unknown }>,
		) {
			const mockSelect2 = vi.fn().mockReturnValue({ single: mockSingle });
			mockInsert.mockReturnValue({ select: mockSelect2 });
			for (const result of results) {
				mockSingle.mockResolvedValueOnce(result);
			}
		}

		it("正常: eliminated ボットを復活させ新世代 Bot[] を返す", async () => {
			// SELECT *: eliminated かつ復活対象のボットを全フィールド取得
			const eliminatedRow = createBotRow({
				id: "bot-id-001",
				is_active: false,
				hp: 0,
				max_hp: 10,
				bot_profile_key: "荒らし役",
			});
			const { mockOrInner } = setupBulkReviveSelectChain({
				data: [eliminatedRow],
				error: null,
			});
			setupActiveCountChain({ count: 9, error: null });

			// INSERT ... select().single(): 新世代ボットの行を返す
			const newBotRow = createBotRow({
				id: "bot-id-001-new",
				is_active: true,
				hp: 10,
				survival_days: 0,
				times_attacked: 0,
				eliminated_at: null,
				eliminated_by: null,
			});
			setupInsertSelectSingleChain({ data: newBotRow, error: null });

			// 旧レコードへの revived_at = NOW() UPDATE
			setupReviveUpdateChain({ error: null });

			const result = await BotRepository.bulkReviveEliminated();

			// Bot[] が返ること
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("bot-id-001-new");
			expect(result[0].isActive).toBe(true);
			expect(result[0].hp).toBe(10);
			// tutorial・aori・hiroyuki 除外フィルタが正しく渡されていることを確認
			expect(mockOrInner).toHaveBeenCalledWith(
				"bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori,hiroyuki)",
			);
			// Sprint-154 TASK-387: 旧レコードへの revived_at = NOW() UPDATE が発行されることを確認
			expect(mockUpdate).toHaveBeenCalledTimes(1);
			expect(mockUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ revived_at: expect.any(String) }),
			);
		});

		it("正常: active=10 の荒らし役は eliminated が残っていても追加生成しない", async () => {
			const eliminatedRows = [
				createBotRow({
					id: "bot-id-old-001",
					is_active: false,
					hp: 0,
					max_hp: 10,
					bot_profile_key: "荒らし役",
				}),
				createBotRow({
					id: "bot-id-old-002",
					is_active: false,
					hp: 0,
					max_hp: 10,
					bot_profile_key: "荒らし役",
					created_at: "2026-03-17T00:00:00.000Z",
				}),
			];
			const { mockOrInner } = setupBulkReviveSelectChain({
				data: eliminatedRows,
				error: null,
			});
			const { mockEqIsActive, mockEqProfile } = setupActiveCountChain({
				count: 10,
				error: null,
			});

			const result = await BotRepository.bulkReviveEliminated();

			expect(result).toEqual([]);
			expect(mockInsert).not.toHaveBeenCalled();
			expect(mockUpdate).not.toHaveBeenCalled();
			expect(mockOrInner).toHaveBeenCalledWith(
				"bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori,hiroyuki)",
			);
			expect(mockEqIsActive).toHaveBeenCalledWith("is_active", true);
			expect(mockEqProfile).toHaveBeenCalledWith("bot_profile_key", "荒らし役");
		});

		it("正常: active=7 の荒らし役は deficit 分の 3 体だけ生成する", async () => {
			const eliminatedRows = Array.from({ length: 5 }, (_, index) =>
				createBotRow({
					id: `bot-id-old-${index + 1}`,
					is_active: false,
					hp: 0,
					max_hp: 10,
					bot_profile_key: "荒らし役",
					eliminated_at: `2026-03-1${index + 1}T12:00:00.000Z`,
					created_at: `2026-03-1${index + 1}T00:00:00.000Z`,
				}),
			);
			setupBulkReviveSelectChain({
				data: eliminatedRows,
				error: null,
			});
			setupActiveCountChain({ count: 7, error: null });
			setupSequentialInsertSelectSingleChain([
				{
					data: createBotRow({ id: "bot-id-new-001", is_active: true, hp: 10 }),
					error: null,
				},
				{
					data: createBotRow({ id: "bot-id-new-002", is_active: true, hp: 10 }),
					error: null,
				},
				{
					data: createBotRow({ id: "bot-id-new-003", is_active: true, hp: 10 }),
					error: null,
				},
			]);
			setupReviveUpdateChain({ error: null });

			const result = await BotRepository.bulkReviveEliminated();

			expect(result).toHaveLength(3);
			expect(result.map((bot) => bot.id)).toEqual([
				"bot-id-new-001",
				"bot-id-new-002",
				"bot-id-new-003",
			]);
			expect(mockInsert).toHaveBeenCalledTimes(3);
			expect(mockUpdate).toHaveBeenCalledTimes(3);
		});

		it("正常: active=0 の荒らし役は eliminated 多数でも 10 体だけ生成する", async () => {
			const eliminatedRows = Array.from({ length: 12 }, (_, index) =>
				createBotRow({
					id: `bot-id-old-${index + 1}`,
					is_active: false,
					hp: 0,
					max_hp: 10,
					bot_profile_key: "荒らし役",
					eliminated_at: `2026-03-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
					created_at: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
				}),
			);
			setupBulkReviveSelectChain({
				data: eliminatedRows,
				error: null,
			});
			setupActiveCountChain({ count: 0, error: null });
			setupSequentialInsertSelectSingleChain(
				Array.from({ length: 10 }, (_, index) => ({
					data: createBotRow({
						id: `bot-id-new-${index + 1}`,
						is_active: true,
						hp: 10,
					}),
					error: null,
				})),
			);
			setupReviveUpdateChain({ error: null });

			const result = await BotRepository.bulkReviveEliminated();

			expect(result).toHaveLength(10);
			expect(mockInsert).toHaveBeenCalledTimes(10);
			expect(mockUpdate).toHaveBeenCalledTimes(10);
		});

		it("正常: eliminated ボットが 0 件の場合は空配列を返す（INSERT なし）", async () => {
			setupBulkReviveSelectChain({ data: [], error: null });

			const result = await BotRepository.bulkReviveEliminated();

			// INSERT・UPDATE ともに呼ばれない
			expect(mockInsert).not.toHaveBeenCalled();
			expect(mockUpdate).not.toHaveBeenCalled();
			expect(result).toEqual([]);
		});

		it("正常: tutorial プロファイルの eliminated ボットは復活対象から除外される", async () => {
			// tutorial ボットが is_active=false でも or フィルタにより取得されない
			const { mockEqInner, mockIsInner, mockOrInner } =
				setupBulkReviveSelectChain({
					data: [], // tutorial ボットはフィルタで除外されるため 0 件
					error: null,
				});

			const result = await BotRepository.bulkReviveEliminated();

			expect(result).toEqual([]);
			// tutorial・aori・hiroyuki 除外フィルタが渡されていることを確認
			expect(mockEqInner).toHaveBeenCalledWith("is_active", false);
			expect(mockIsInner).toHaveBeenCalledWith("revived_at", null);
			expect(mockOrInner).toHaveBeenCalledWith(
				"bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori,hiroyuki)",
			);
		});

		it("正常: hiroyuki プロファイルの eliminated ボットは復活対象から除外される", async () => {
			const { mockEqInner, mockIsInner, mockOrInner } =
				setupBulkReviveSelectChain({
					data: [],
					error: null,
				});

			const result = await BotRepository.bulkReviveEliminated();

			expect(result).toEqual([]);
			expect(mockEqInner).toHaveBeenCalledWith("is_active", false);
			expect(mockIsInner).toHaveBeenCalledWith("revived_at", null);
			expect(mockOrInner).toHaveBeenCalledWith(
				"bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori,hiroyuki)",
			);
		});

		it("異常系: 取得時 DB エラーが発生した場合はエラーをスローする", async () => {
			setupBulkReviveSelectChain({
				data: null,
				error: { message: "fetch error" },
			});

			await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow(
				"BotRepository.bulkReviveEliminated fetch failed: fetch error",
			);
		});

		it("異常系: INSERT 時 DB エラーが発生した場合はエラーをスローする", async () => {
			const eliminatedRow = createBotRow({
				id: "bot-id-001",
				is_active: false,
				hp: 0,
				max_hp: 10,
				name: "荒らし役",
				bot_profile_key: "荒らし役",
			});
			setupBulkReviveSelectChain({
				data: [eliminatedRow],
				error: null,
			});
			setupActiveCountChain({ count: 9, error: null });

			// INSERT エラーをシミュレート
			setupInsertSelectSingleChain({
				data: null,
				error: { message: "insert error" },
			});

			await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow(
				'BotRepository.bulkReviveEliminated insert failed for bot "荒らし役": insert error',
			);
		});

		it("異常系: active 件数取得時の DB エラーはエラーをスローする", async () => {
			setupBulkReviveSelectChain({
				data: [
					createBotRow({
						id: "bot-id-001",
						is_active: false,
						hp: 0,
						max_hp: 10,
						bot_profile_key: "荒らし役",
					}),
				],
				error: null,
			});
			setupActiveCountChain({ count: null, error: { message: "count error" } });

			await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow(
				'BotRepository.bulkReviveEliminated count failed for profile "荒らし役": count error',
			);
		});

		// =========================================================================
		// Sprint-154 TASK-387: bulkReviveEliminated 冪等性テスト
		// See: tmp/workers/bdd-architect_TASK-386/design.md §7.1
		// See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
		// =========================================================================

		describe("冪等性（revived_at 方式）", () => {
			// See: features/bot_system.feature @撃破済みボットは翌日にHP初期値で復活する

			it("SELECT 条件に revived_at IS NULL が含まれる（冪等化の述語）", async () => {
				// design.md §2.3: 既に次世代を生成済みの旧レコードを除外する
				const { mockIsInner } = setupBulkReviveSelectChain({
					data: [],
					error: null,
				});

				await BotRepository.bulkReviveEliminated();

				expect(mockIsInner).toHaveBeenCalledWith("revived_at", null);
			});

			it("INSERT 成功後に旧レコードの revived_at が UPDATE される", async () => {
				// design.md §7.1: INSERT 成功直後に revived_at = NOW() を設定する
				const eliminatedRow = createBotRow({
					id: "bot-id-old",
					is_active: false,
					hp: 0,
					max_hp: 10,
					bot_profile_key: "荒らし役",
				});
				setupBulkReviveSelectChain({
					data: [eliminatedRow],
					error: null,
				});
				setupActiveCountChain({ count: 9, error: null });
				const newBotRow = createBotRow({
					id: "bot-id-new",
					is_active: true,
					hp: 10,
				});
				setupInsertSelectSingleChain({ data: newBotRow, error: null });
				const { mockUpdateEq } = setupReviveUpdateChain({ error: null });

				await BotRepository.bulkReviveEliminated();

				// UPDATE が旧レコードの id 指定で呼ばれることを確認
				expect(mockUpdate).toHaveBeenCalledWith(
					expect.objectContaining({ revived_at: expect.any(String) }),
				);
				expect(mockUpdateEq).toHaveBeenCalledWith("id", "bot-id-old");
			});

			it("INSERT 失敗時は旧レコードの revived_at UPDATE は発生しない", async () => {
				// design.md §7.1: INSERT 失敗時は状態維持（整合性保護）
				const eliminatedRow = createBotRow({
					id: "bot-id-old",
					is_active: false,
					hp: 0,
					max_hp: 10,
					name: "荒らし役",
					bot_profile_key: "荒らし役",
				});
				setupBulkReviveSelectChain({
					data: [eliminatedRow],
					error: null,
				});
				setupActiveCountChain({ count: 9, error: null });
				setupInsertSelectSingleChain({
					data: null,
					error: { message: "insert failed" },
				});

				await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow();

				// INSERT 失敗のため UPDATE は呼ばれない
				expect(mockUpdate).not.toHaveBeenCalled();
			});

			it("UPDATE 失敗時は明示的にエラーをスローする（運用復旧判断のため）", async () => {
				// INSERT 成功 → UPDATE 失敗の中間状態でもエラーで通知する
				const eliminatedRow = createBotRow({
					id: "bot-id-old",
					is_active: false,
					hp: 0,
					max_hp: 10,
					name: "荒らし役",
					bot_profile_key: "荒らし役",
				});
				setupBulkReviveSelectChain({
					data: [eliminatedRow],
					error: null,
				});
				setupActiveCountChain({ count: 9, error: null });
				setupInsertSelectSingleChain({
					data: createBotRow({ id: "bot-id-new", is_active: true }),
					error: null,
				});
				setupReviveUpdateChain({ error: { message: "update failed" } });

				await expect(BotRepository.bulkReviveEliminated()).rejects.toThrow(
					/mark-revived failed/,
				);
			});

			it("2回目の呼び出しで SELECT が 0件となる前提を冪等性で担保できる", async () => {
				// 実際の DB では 1 回目 UPDATE 後に revived_at IS NULL 条件から外れる。
				// 単体テストでは SELECT 結果が [] であれば INSERT/UPDATE が発生しないことで代替検証する。
				setupBulkReviveSelectChain({
					data: [],
					error: null,
				});

				const result = await BotRepository.bulkReviveEliminated();

				expect(result).toEqual([]);
				expect(mockInsert).not.toHaveBeenCalled();
				expect(mockUpdate).not.toHaveBeenCalled();
			});
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
				grassCount: 0,
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
					grassCount: 0,
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
	// deleteEliminatedSingleUseBots (Sprint-154 TASK-387: deleteEliminatedTutorialBots から汎化)
	// See: docs/architecture/components/bot.md §2.10 Step 6 使い切りBOTクリーンアップ
	// See: tmp/workers/bdd-architect_TASK-386/design.md §2.2
	// =========================================================================

	describe("deleteEliminatedSingleUseBots", () => {
		// See: features/command_aori.feature @煽りBOTは日次リセットで復活しない
		// See: features/command_hiroyuki.feature L40 コメント「使い切り」仕様

		/**
		 * 使い切りBOT撃破済み削除のチェーン:
		 *   .from().delete().in("bot_profile_key", SINGLE_USE).eq("is_active", false).select("id")
		 */
		function setupDeleteEliminatedChain(result: {
			data: unknown;
			error: unknown;
		}) {
			const mockSelectId = vi.fn().mockResolvedValue(result);
			const mockEqIsActive = vi.fn().mockReturnValue({ select: mockSelectId });
			const mockInProfileKey = vi.fn().mockReturnValue({ eq: mockEqIsActive });
			const mockDelete = vi.fn().mockReturnValue({ in: mockInProfileKey });
			return { mockDelete, mockInProfileKey, mockEqIsActive, mockSelectId };
		}

		/**
		 * 7日経過未撃破削除のチェーン:
		 *   .from().delete().in("bot_profile_key", SINGLE_USE).lt("created_at", ...).select("id")
		 */
		function setupDeleteStaleChain(result: { data: unknown; error: unknown }) {
			const mockSelectId = vi.fn().mockResolvedValue(result);
			const mockLtCreatedAt = vi.fn().mockReturnValue({ select: mockSelectId });
			const mockInProfileKey = vi.fn().mockReturnValue({ lt: mockLtCreatedAt });
			const mockDelete = vi.fn().mockReturnValue({ in: mockInProfileKey });
			return { mockDelete, mockInProfileKey, mockLtCreatedAt, mockSelectId };
		}

		it("正常: 撃破済み2件 + 古い未撃破1件を削除し合計3を返す", async () => {
			const { mockDelete: mockDeleteEliminated } = setupDeleteEliminatedChain({
				data: [{ id: "bot-tutorial-001" }, { id: "bot-aori-001" }],
				error: null,
			});
			const { mockDelete: mockDeleteStale } = setupDeleteStaleChain({
				data: [{ id: "bot-hiroyuki-001" }],
				error: null,
			});

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

			const count = await BotRepository.deleteEliminatedSingleUseBots();

			expect(count).toBe(3); // 撃破済み2 + 古い未撃破1
		});

		it("正常: 削除対象が 0 件の場合は 0 を返す", async () => {
			const { mockDelete: mockDeleteEliminated } = setupDeleteEliminatedChain({
				data: [],
				error: null,
			});
			const { mockDelete: mockDeleteStale } = setupDeleteStaleChain({
				data: [],
				error: null,
			});

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

			const count = await BotRepository.deleteEliminatedSingleUseBots();

			expect(count).toBe(0);
		});

		it("異常系: 撃破済み削除時 DB エラーが発生した場合はエラーをスローする", async () => {
			const { mockDelete: mockDeleteEliminated } = setupDeleteEliminatedChain({
				data: null,
				error: { message: "delete eliminated error" },
			});

			const { supabaseAdmin } = await import(
				"../../../../lib/infrastructure/supabase/client"
			);
			vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
				delete: mockDeleteEliminated,
			} as unknown as ReturnType<typeof supabaseAdmin.from>);

			await expect(
				BotRepository.deleteEliminatedSingleUseBots(),
			).rejects.toThrow(
				"BotRepository.deleteEliminatedSingleUseBots (eliminated) failed: delete eliminated error",
			);
		});

		it("異常系: 古い未撃破削除時 DB エラーが発生した場合はエラーをスローする", async () => {
			const { mockDelete: mockDeleteEliminated } = setupDeleteEliminatedChain({
				data: [],
				error: null,
			});
			const { mockDelete: mockDeleteStale } = setupDeleteStaleChain({
				data: null,
				error: { message: "delete stale error" },
			});

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
				BotRepository.deleteEliminatedSingleUseBots(),
			).rejects.toThrow(
				"BotRepository.deleteEliminatedSingleUseBots (stale) failed: delete stale error",
			);
		});

		// =========================================================================
		// Sprint-154 TASK-387: 使い切りBOT 3種拡張テスト
		// See: tmp/workers/bdd-architect_TASK-386/design.md §7.4（7日基準のクリーンアップ境界値）
		// =========================================================================

		it("撃破済みの使い切りBOT 3種（tutorial/aori/hiroyuki）がすべて削除対象となる", async () => {
			// design.md §2.2: SINGLE_USE_PROFILE_KEYS に tutorial/aori/hiroyuki が全て含まれる
			const { mockDelete: mockDeleteEliminated, mockInProfileKey } =
				setupDeleteEliminatedChain({
					data: [
						{ id: "bot-tutorial-001" },
						{ id: "bot-aori-001" },
						{ id: "bot-hiroyuki-001" },
					],
					error: null,
				});
			const { mockDelete: mockDeleteStale } = setupDeleteStaleChain({
				data: [],
				error: null,
			});

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

			const count = await BotRepository.deleteEliminatedSingleUseBots();

			expect(count).toBe(3);
			// bot_profile_key フィルタが tutorial / aori / hiroyuki を全て含むこと
			expect(mockInProfileKey).toHaveBeenCalledWith("bot_profile_key", [
				"tutorial",
				"aori",
				"hiroyuki",
			]);
		});

		it("7日経過の未撃破レコード削除で 7日前以前を指す created_at 閾値が使われる", async () => {
			// design.md §7.4: 7日基準の境界値テスト（召喚直後の保護）
			const { mockDelete: mockDeleteEliminated } = setupDeleteEliminatedChain({
				data: [],
				error: null,
			});
			const {
				mockDelete: mockDeleteStale,
				mockLtCreatedAt,
				mockInProfileKey,
			} = setupDeleteStaleChain({
				data: [{ id: "bot-hiroyuki-stale-001" }],
				error: null,
			});

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

			const before = Date.now();
			const count = await BotRepository.deleteEliminatedSingleUseBots();
			const after = Date.now();

			expect(count).toBe(1);
			// bot_profile_key は全 3種を指定
			expect(mockInProfileKey).toHaveBeenCalledWith("bot_profile_key", [
				"tutorial",
				"aori",
				"hiroyuki",
			]);
			// lt("created_at", ISO文字列) が呼ばれ、閾値は "7日前 ± 実行時間" の範囲
			const lastCall = mockLtCreatedAt.mock.calls.at(-1);
			expect(lastCall?.[0]).toBe("created_at");
			const thresholdIso = lastCall?.[1] as string;
			const thresholdMs = new Date(thresholdIso).getTime();
			const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
			expect(thresholdMs).toBeGreaterThanOrEqual(before - sevenDaysMs);
			expect(thresholdMs).toBeLessThanOrEqual(after - sevenDaysMs);
		});

		it("撃破済み削除と7日経過削除の両方が実行され合計値が返される（境界値: 両系経路の合算）", async () => {
			// UX 保護（7日以内の未撃破は削除されない）ことを確認する代理テスト:
			// Stale 側の data が空（= 7日以内は対象外）でも、撃破済み側のみの合計が返ることを確認。
			const { mockDelete: mockDeleteEliminated } = setupDeleteEliminatedChain({
				data: [{ id: "bot-tutorial-001" }],
				error: null,
			});
			const { mockDelete: mockDeleteStale } = setupDeleteStaleChain({
				data: [], // 7日以内の未撃破は削除対象にならない
				error: null,
			});

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

			const count = await BotRepository.deleteEliminatedSingleUseBots();

			// 撃破済み 1件 + 7日経過 0件 = 1
			expect(count).toBe(1);
		});
	});

	// =========================================================================
	// findDueForPost
	// See: features/bot_system.feature
	// See: docs/architecture/architecture.md §13 TDR-010
	// =========================================================================

	describe("findDueForPost", () => {
		/**
		 * findDueForPost のチェーンは:
		 * .from("bots").select("*").eq("is_active", true).neq("bot_profile_key", "tutorial").lte("next_post_at", now)
		 * neq / lte は既存のホイストモックに含まれないため、テストごとにローカルで構築する。
		 */
		function setupFindDueForPostChain(result: {
			data: unknown;
			error: unknown;
		}) {
			const mockLte = vi.fn().mockResolvedValue(result);
			const mockNeq = vi.fn().mockReturnValue({ lte: mockLte });
			mockSelect.mockReturnValue({ eq: mockEq });
			mockEq.mockReturnValue({ neq: mockNeq });
			return { mockNeq, mockLte };
		}

		it("正常: 投稿対象のボットリストを返す（チュートリアルBOT除外）", async () => {
			const rows = [
				createBotRow({
					id: "curation-bot-001",
					bot_profile_key: "curation",
					next_post_at: "2026-03-16T11:00:00.000Z",
				}),
			];
			setupFindDueForPostChain({ data: rows, error: null });

			const result = await BotRepository.findDueForPost();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("curation-bot-001");
			expect(result[0].botProfileKey).toBe("curation");
		});

		it("正常: 投稿対象が 0 件の場合は空配列を返す", async () => {
			setupFindDueForPostChain({ data: [], error: null });

			const result = await BotRepository.findDueForPost();

			expect(result).toEqual([]);
		});

		it("正常: チュートリアルBOTが neq 条件で除外されることを確認する", async () => {
			// チェーンに .neq("bot_profile_key", "tutorial") が含まれることをモック検証
			const { mockNeq } = setupFindDueForPostChain({
				data: [],
				error: null,
			});

			await BotRepository.findDueForPost();

			// neq が "bot_profile_key", "tutorial" で呼ばれたことを検証
			expect(mockNeq).toHaveBeenCalledWith("bot_profile_key", "tutorial");
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupFindDueForPostChain({
				data: null,
				error: { message: "connection timeout" },
			});

			await expect(BotRepository.findDueForPost()).rejects.toThrow(
				"BotRepository.findDueForPost failed: connection timeout",
			);
		});
	});
});
