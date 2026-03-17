/**
 * 単体テスト: AdminService ダッシュボード機能
 *
 * getDashboard / getDashboardHistory の振る舞いを検証する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5 ダッシュボード
 *
 * テスト方針:
 *   - UserRepository, PostRepository, CurrencyRepository, DailyStatsRepository はモック化する
 *   - リアルタイムサマリー（getDashboard）とスナップショット取得（getDashboardHistory）を分けて検証
 *   - エッジケース（データなし、今日日付指定、範囲外など）を網羅する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	findAll: vi.fn(),
	updateIsBanned: vi.fn(),
	updateLastIpHash: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findById: vi.fn(),
	findByThreadId: vi.fn(),
	findByAuthorId: vi.fn().mockResolvedValue([]),
	softDelete: vi.fn(),
	softDeleteByThreadId: vi.fn(),
	countByDate: vi.fn(),
	countActiveThreadsByDate: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/currency-repository", () => ({
	findByUserId: vi.fn(),
	create: vi.fn(),
	credit: vi.fn(),
	deduct: vi.fn(),
	getBalance: vi.fn().mockResolvedValue(0),
	sumAllBalances: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/daily-stats-repository", () => ({
	findByDate: vi.fn(),
	findByDateRange: vi.fn(),
	findLatest: vi.fn(),
	upsert: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	findById: vi.fn(),
	softDelete: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/ip-ban-repository", () => ({
	isBanned: vi.fn().mockResolvedValue(false),
	create: vi.fn(),
	deactivate: vi.fn(),
	listActive: vi.fn().mockResolvedValue([]),
	findById: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/services/currency-service", () => ({
	credit: vi.fn(),
	getBalance: vi.fn().mockResolvedValue(0),
	deduct: vi.fn(),
	initializeBalance: vi.fn(),
}));

vi.mock("@/lib/services/post-service", () => ({
	createPost: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import * as CurrencyRepository from "@/lib/infrastructure/repositories/currency-repository";
import type { DailyStat } from "@/lib/infrastructure/repositories/daily-stats-repository";
import * as DailyStatsRepository from "@/lib/infrastructure/repositories/daily-stats-repository";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import {
	getDashboard,
	getDashboardHistory,
} from "@/lib/services/admin-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用 DailyStat ファクトリ */
function makeDailyStat(overrides: Partial<DailyStat> = {}): DailyStat {
	return {
		statDate: "2026-03-10",
		totalUsers: 100,
		newUsers: 5,
		activeUsers: 20,
		totalPosts: 50,
		totalThreads: 3,
		activeThreads: 10,
		currencyInCirculation: 5000,
		currencyGranted: 200,
		currencyConsumed: 50,
		totalAccusations: 2,
		totalAttacks: 1,
		createdAt: new Date("2026-03-11T00:05:00Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AdminService ダッシュボード", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// getDashboard: リアルタイムサマリー
	// =========================================================================

	describe("getDashboard", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系", () => {
			it("ユーザー数・書き込み数・アクティブスレッド数・通貨流通量を返す", async () => {
				// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 42,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(18);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(7);
				vi.mocked(CurrencyRepository.sumAllBalances).mockResolvedValue(3500);

				const result = await getDashboard({ today: "2026-03-17" });

				expect(result.totalUsers).toBe(42);
				expect(result.todayPosts).toBe(18);
				expect(result.activeThreads).toBe(7);
				expect(result.currencyInCirculation).toBe(3500);
			});

			it("today オプションを PostRepository.countByDate に渡す", async () => {
				// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 0,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(0);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(0);
				vi.mocked(CurrencyRepository.sumAllBalances).mockResolvedValue(0);

				await getDashboard({ today: "2026-01-15" });

				expect(PostRepository.countByDate).toHaveBeenCalledWith("2026-01-15");
				expect(PostRepository.countActiveThreadsByDate).toHaveBeenCalledWith(
					"2026-01-15",
				);
			});

			it("today 省略時は現在日付を使用する", async () => {
				// See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 0,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(0);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(0);
				vi.mocked(CurrencyRepository.sumAllBalances).mockResolvedValue(0);

				const today = new Date().toISOString().slice(0, 10);

				await getDashboard();

				expect(PostRepository.countByDate).toHaveBeenCalledWith(today);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: ゼロ値
		// -----------------------------------------------------------------------

		describe("エッジケース: ゼロ値", () => {
			it("ユーザーが0人の場合は totalUsers=0 を返す", async () => {
				// See: エッジケース: 空の配列
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 0,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(0);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(0);
				vi.mocked(CurrencyRepository.sumAllBalances).mockResolvedValue(0);

				const result = await getDashboard({ today: "2026-03-17" });

				expect(result.totalUsers).toBe(0);
				expect(result.todayPosts).toBe(0);
				expect(result.activeThreads).toBe(0);
				expect(result.currencyInCirculation).toBe(0);
			});

			it("通貨流通量が0の場合は currencyInCirculation=0 を返す", async () => {
				// See: エッジケース: 境界値（最小値）
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 100,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(5);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(2);
				vi.mocked(CurrencyRepository.sumAllBalances).mockResolvedValue(0);

				const result = await getDashboard({ today: "2026-03-17" });

				expect(result.currencyInCirculation).toBe(0);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: 大量データ
		// -----------------------------------------------------------------------

		describe("エッジケース: 大量データ", () => {
			it("ユーザー数10万人・書き込み1万件でも正常に集計する", async () => {
				// See: エッジケース: 大量データ（1万件以上）
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 100_000,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(10_000);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(
					500,
				);
				vi.mocked(CurrencyRepository.sumAllBalances).mockResolvedValue(
					5_000_000,
				);

				const result = await getDashboard({ today: "2026-03-17" });

				expect(result.totalUsers).toBe(100_000);
				expect(result.todayPosts).toBe(10_000);
				expect(result.activeThreads).toBe(500);
				expect(result.currencyInCirculation).toBe(5_000_000);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: リポジトリエラー
		// -----------------------------------------------------------------------

		describe("異常系: リポジトリエラー", () => {
			it("UserRepository.findAll がエラーをスローした場合は伝播する", async () => {
				// See: エッジケース: 異常系パス
				vi.mocked(UserRepository.findAll).mockRejectedValue(
					new Error("DB接続エラー"),
				);

				await expect(getDashboard({ today: "2026-03-17" })).rejects.toThrow(
					"DB接続エラー",
				);
			});

			it("CurrencyRepository.sumAllBalances がエラーをスローした場合は伝播する", async () => {
				vi.mocked(UserRepository.findAll).mockResolvedValue({
					users: [],
					total: 0,
				});
				vi.mocked(PostRepository.countByDate).mockResolvedValue(0);
				vi.mocked(PostRepository.countActiveThreadsByDate).mockResolvedValue(0);
				vi.mocked(CurrencyRepository.sumAllBalances).mockRejectedValue(
					new Error("集計エラー"),
				);

				await expect(getDashboard({ today: "2026-03-17" })).rejects.toThrow(
					"集計エラー",
				);
			});
		});
	});

	// =========================================================================
	// getDashboardHistory: 日次推移
	// =========================================================================

	describe("getDashboardHistory", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系", () => {
			it("7日分の日次統計を返す", async () => {
				// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
				const stats = Array.from({ length: 7 }, (_, i) =>
					makeDailyStat({
						statDate: `2026-03-${String(10 + i).padStart(2, "0")}`,
					}),
				);
				vi.mocked(DailyStatsRepository.findByDateRange).mockResolvedValue(
					stats,
				);

				const result = await getDashboardHistory({ days: 7 });

				expect(result).toHaveLength(7);
				expect(DailyStatsRepository.findByDateRange).toHaveBeenCalledTimes(1);
			});

			it("fromDate / toDate が指定された場合は findByDateRange にそのまま渡す", async () => {
				// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
				vi.mocked(DailyStatsRepository.findByDateRange).mockResolvedValue([]);

				await getDashboardHistory({
					fromDate: "2026-03-01",
					toDate: "2026-03-07",
				});

				expect(DailyStatsRepository.findByDateRange).toHaveBeenCalledWith(
					"2026-03-01",
					"2026-03-07",
				);
			});

			it("statDate が含まれた DailyStat 配列を返す", async () => {
				// See: features/admin.feature @管理者が統計情報の日次推移を確認できる
				const stat = makeDailyStat({ statDate: "2026-03-15" });
				vi.mocked(DailyStatsRepository.findByDateRange).mockResolvedValue([
					stat,
				]);

				const result = await getDashboardHistory({
					fromDate: "2026-03-15",
					toDate: "2026-03-15",
				});

				expect(result[0].statDate).toBe("2026-03-15");
				expect(result[0].totalPosts).toBe(50);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: データなし
		// -----------------------------------------------------------------------

		describe("エッジケース: データなし", () => {
			it("統計レコードが存在しない場合は空配列を返す", async () => {
				// See: エッジケース: 空の配列
				vi.mocked(DailyStatsRepository.findByDateRange).mockResolvedValue([]);

				const result = await getDashboardHistory({ days: 7 });

				expect(result).toEqual([]);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: days パラメータ
		// -----------------------------------------------------------------------

		describe("エッジケース: days パラメータ", () => {
			it("days=1 の場合は1日分の範囲で findByDateRange を呼ぶ", async () => {
				// See: エッジケース: 境界値（最小値）
				vi.mocked(DailyStatsRepository.findByDateRange).mockResolvedValue([]);

				await getDashboardHistory({ days: 1 });

				// findByDateRange が呼ばれたことを確認する（日付は動的なため引数の形式のみチェック）
				expect(DailyStatsRepository.findByDateRange).toHaveBeenCalledTimes(1);
				const [fromArg, toArg] = vi.mocked(DailyStatsRepository.findByDateRange)
					.mock.calls[0];
				expect(fromArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
				expect(toArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			});

			it("days=30 の場合も findByDateRange が呼ばれる", async () => {
				vi.mocked(DailyStatsRepository.findByDateRange).mockResolvedValue([]);

				await getDashboardHistory({ days: 30 });

				expect(DailyStatsRepository.findByDateRange).toHaveBeenCalledTimes(1);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: リポジトリエラー
		// -----------------------------------------------------------------------

		describe("異常系: リポジトリエラー", () => {
			it("DailyStatsRepository.findByDateRange がエラーをスローした場合は伝播する", async () => {
				// See: エッジケース: 異常系パス
				vi.mocked(DailyStatsRepository.findByDateRange).mockRejectedValue(
					new Error("DB接続エラー"),
				);

				await expect(getDashboardHistory({ days: 7 })).rejects.toThrow(
					"DB接続エラー",
				);
			});
		});
	});
});
