/**
 * 単体テスト: DailyStatsService
 *
 * 日次統計集計サービスの振る舞いをテストする。
 * supabaseAdmin をモック化し、集計ロジックの正確性を検証する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: src/lib/services/daily-stats-service.ts
 *
 * テスト方針:
 *   - supabaseAdmin のクエリをモック化して DB 依存を排除する
 *   - aggregateAndUpsert の入出力・エラーハンドリングを検証する
 *   - getYesterdayJst の日付計算を検証する
 *   - getJstDateRange の JST/UTC 変換を検証する
 *   - 集計クエリが JST 基準の UTC 境界で呼ばれることを検証する
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: (...args: unknown[]) => mockFrom(...args),
	},
}));

import {
	aggregateAndUpsert,
	getJstDateRange,
	getYesterdayJst,
} from "../../../lib/services/daily-stats-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * supabaseAdmin.from() のクエリチェーンをセットアップする。
 * 全てのクエリが成功する状態にする。
 * gteArg / ltArg に呼び出し引数をキャプチャする。
 */
function setupSuccessfulQueriesWithCapture() {
	const countResult = { count: 5, error: null };
	const dataResult = { data: [], error: null };

	const capturedArgs: { gte: string[]; lt: string[] } = { gte: [], lt: [] };

	const makeLtMock = () =>
		vi.fn().mockImplementation((col: string, val: string) => {
			capturedArgs.lt.push(val);
			return {
				eq: vi.fn().mockReturnValue({
					not: vi.fn().mockResolvedValue(dataResult),
					...countResult,
				}),
				gt: vi.fn().mockResolvedValue(dataResult),
				lt: vi.fn().mockResolvedValue(dataResult),
				...countResult,
			};
		});

	const makeGteMock = () =>
		vi.fn().mockImplementation((col: string, val: string) => {
			capturedArgs.gte.push(val);
			return {
				lt: makeLtMock(),
				eq: vi.fn().mockReturnValue({
					not: vi.fn().mockResolvedValue(dataResult),
					...countResult,
				}),
				...countResult,
			};
		});

	const chainMock = {
		select: vi.fn().mockReturnValue({
			gte: makeGteMock(),
			...countResult,
		}),
		upsert: vi.fn().mockResolvedValue({ error: null }),
	};

	mockFrom.mockReturnValue(chainMock);
	return { chainMock, capturedArgs };
}

/**
 * supabaseAdmin.from() のクエリチェーンをセットアップする。
 * 全てのクエリが成功する状態にする。
 */
function setupSuccessfulQueries() {
	const countResult = { count: 5, error: null };
	const dataResult = { data: [], error: null };

	const chainMock = {
		select: vi.fn().mockReturnValue({
			gte: vi.fn().mockReturnValue({
				lt: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						not: vi.fn().mockResolvedValue(dataResult),
						...countResult,
					}),
					gt: vi.fn().mockResolvedValue(dataResult),
					lt: vi.fn().mockResolvedValue(dataResult),
					...countResult,
				}),
				eq: vi.fn().mockReturnValue({
					not: vi.fn().mockResolvedValue(dataResult),
					...countResult,
				}),
				...countResult,
			}),
			...countResult,
		}),
		upsert: vi.fn().mockResolvedValue({ error: null }),
	};

	mockFrom.mockReturnValue(chainMock);
	return chainMock;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("DailyStatsService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// getJstDateRange
	// =========================================================================

	describe("getJstDateRange()", () => {
		it("JST 日付に対応する UTC 開始・終了境界を返す", () => {
			// JST 2026-03-25 00:00:00 = UTC 2026-03-24T15:00:00Z
			// JST 2026-03-26 00:00:00 = UTC 2026-03-25T15:00:00Z
			const { startUtc, endUtc } = getJstDateRange("2026-03-25");

			expect(startUtc).toBe("2026-03-25T00:00:00+09:00");
			expect(endUtc).toBe("2026-03-26T00:00:00+09:00");
		});

		it("月末日の場合、翌月初の境界を返す", () => {
			const { startUtc, endUtc } = getJstDateRange("2026-03-31");

			expect(startUtc).toBe("2026-03-31T00:00:00+09:00");
			expect(endUtc).toBe("2026-04-01T00:00:00+09:00");
		});

		it("年末日の場合、翌年初の境界を返す", () => {
			const { startUtc, endUtc } = getJstDateRange("2025-12-31");

			expect(startUtc).toBe("2025-12-31T00:00:00+09:00");
			expect(endUtc).toBe("2026-01-01T00:00:00+09:00");
		});

		it("月初の場合、前月末を start に含まない（翌日が endUtc）", () => {
			const { startUtc, endUtc } = getJstDateRange("2026-04-01");

			expect(startUtc).toBe("2026-04-01T00:00:00+09:00");
			expect(endUtc).toBe("2026-04-02T00:00:00+09:00");
		});
	});

	// =========================================================================
	// aggregateAndUpsert
	// =========================================================================

	describe("aggregateAndUpsert()", () => {
		it("指定日の統計を集計し DailyStat を返す", async () => {
			setupSuccessfulQueries();

			const result = await aggregateAndUpsert("2026-03-15");

			expect(result.stat_date).toBe("2026-03-15");
			// count ベースのクエリは全て 5 を返す
			expect(result.total_users).toBe(5);
			expect(result.new_users).toBe(5);
			expect(result.total_posts).toBe(5);
			expect(result.total_threads).toBe(5);
			// data ベースのクエリは空配列なので 0
			expect(result.active_users).toBe(0);
			expect(result.active_threads).toBe(0);
			expect(result.currency_in_circulation).toBe(0);
			expect(result.currency_granted).toBe(0);
			expect(result.currency_consumed).toBe(0);
		});

		it("集計後に daily_stats テーブルへ UPSERT する", async () => {
			const chainMock = setupSuccessfulQueries();

			await aggregateAndUpsert("2026-03-15");

			// upsert が呼ばれたことを検証
			expect(chainMock.upsert).toHaveBeenCalledTimes(1);
			const upsertArgs = chainMock.upsert.mock.calls[0];
			expect(upsertArgs[0].stat_date).toBe("2026-03-15");
			expect(upsertArgs[1]).toEqual({ onConflict: "stat_date" });
		});

		it("UPSERT が失敗した場合、例外をスローする", async () => {
			const chainMock = setupSuccessfulQueries();
			chainMock.upsert.mockResolvedValue({
				error: { message: "UPSERT failed" },
			});

			await expect(aggregateAndUpsert("2026-03-15")).rejects.toThrow(
				"UPSERT 失敗: UPSERT failed",
			);
		});

		it("集計クエリが失敗した場合、例外をスローする", async () => {
			// 全てのクエリがエラーを返すように完全なチェーンをモック化する
			const errorResult = {
				count: null,
				error: { message: "DB connection error" },
				data: null,
			};

			const errorChain = {
				select: vi.fn().mockReturnValue({
					gte: vi.fn().mockReturnValue({
						lt: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								not: vi.fn().mockResolvedValue(errorResult),
								...errorResult,
							}),
							gt: vi.fn().mockResolvedValue(errorResult),
							lt: vi.fn().mockResolvedValue(errorResult),
							...errorResult,
						}),
						eq: vi.fn().mockReturnValue({
							not: vi.fn().mockResolvedValue(errorResult),
							...errorResult,
						}),
						...errorResult,
					}),
					...errorResult,
				}),
				upsert: vi.fn().mockResolvedValue({ error: null }),
			};

			mockFrom.mockReturnValue(errorChain);

			await expect(aggregateAndUpsert("2026-03-15")).rejects.toThrow(
				"DB connection error",
			);
		});

		it("集計クエリの開始境界が JST 基準の +09:00 オフセット付き ISO 文字列である", async () => {
			// JST 2026-03-25 の開始は 2026-03-25T00:00:00+09:00
			// （UTC 換算: 2026-03-24T15:00:00Z）
			const gteValues: string[] = [];
			const ltValues: string[] = [];

			const countResult = { count: 0, error: null };
			const dataResult = { data: [], error: null };

			const makeLt = () =>
				vi.fn().mockImplementation((_col: string, val: string) => {
					ltValues.push(val);
					return {
						eq: vi.fn().mockReturnValue({
							not: vi.fn().mockResolvedValue(dataResult),
							...countResult,
						}),
						gt: vi.fn().mockResolvedValue(dataResult),
						lt: vi.fn().mockResolvedValue(dataResult),
						...countResult,
					};
				});

			const makeGte = () =>
				vi.fn().mockImplementation((_col: string, val: string) => {
					gteValues.push(val);
					return {
						lt: makeLt(),
						eq: vi.fn().mockReturnValue({
							not: vi.fn().mockResolvedValue(dataResult),
							...countResult,
						}),
						...countResult,
					};
				});

			const chainMock = {
				select: vi.fn().mockReturnValue({
					gte: makeGte(),
					...countResult,
				}),
				upsert: vi.fn().mockResolvedValue({ error: null }),
			};
			mockFrom.mockReturnValue(chainMock);

			await aggregateAndUpsert("2026-03-25");

			// 全ての gte 呼び出しが JST 基準の +09:00 形式であること
			expect(gteValues.length).toBeGreaterThan(0);
			for (const v of gteValues) {
				expect(v).toBe("2026-03-25T00:00:00+09:00");
			}

			// 全ての lt 呼び出しが翌日 JST 基準の +09:00 形式であること
			expect(ltValues.length).toBeGreaterThan(0);
			for (const v of ltValues) {
				expect(v).toBe("2026-03-26T00:00:00+09:00");
			}
		});
	});

	// =========================================================================
	// getYesterdayJst
	// =========================================================================

	describe("getYesterdayJst()", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it("YYYY-MM-DD 形式で昨日の日付を返す", () => {
			// 2026-03-19 15:00:00 UTC = 2026-03-20 00:00:00 JST
			// → 昨日は 2026-03-19
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-03-19T15:00:00Z"));

			const result = getYesterdayJst();
			expect(result).toBe("2026-03-19");
		});

		it("月初の場合、前月末の日付を返す", () => {
			// 2026-04-01 00:00:00 UTC = 2026-04-01 09:00:00 JST
			// → 昨日は 2026-03-31
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));

			const result = getYesterdayJst();
			expect(result).toBe("2026-03-31");
		});

		it("年初の場合、前年末の日付を返す", () => {
			// 2026-01-01 00:00:00 UTC = 2026-01-01 09:00:00 JST
			// → 昨日は 2025-12-31
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const result = getYesterdayJst();
			expect(result).toBe("2025-12-31");
		});
	});
});
