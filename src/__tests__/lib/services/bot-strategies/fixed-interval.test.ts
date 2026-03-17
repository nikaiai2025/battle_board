/**
 * 単体テスト: FixedIntervalSchedulingStrategy
 *
 * See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
 * See: docs/architecture/components/bot.md §2.1 書き込み実行（GitHub Actionsから呼び出し）
 * See: docs/architecture/components/bot.md §2.12.3 FixedIntervalSchedulingStrategy
 *
 * テスト方針:
 *   - getNextPostDelay() の返り値が [min, max] 範囲内の整数であることを検証する
 *   - デフォルト値（60〜120分）とカスタム値の両方を検証する
 *   - ランダム性の確認（100回実行で複数の値が出現する）
 */

import { describe, expect, it } from "vitest";
import { FixedIntervalSchedulingStrategy } from "../../../../lib/services/bot-strategies/scheduling/fixed-interval";
import type { SchedulingContext } from "../../../../lib/services/bot-strategies/types";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 SchedulingContext を生成する */
function createContext(
	overrides: Partial<SchedulingContext> = {},
): SchedulingContext {
	return {
		botId: "bot-001",
		botProfileKey: "荒らし役",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("FixedIntervalSchedulingStrategy", () => {
	// =========================================================================
	// getNextPostDelay() — デフォルト値（60〜120分）
	// =========================================================================

	describe("getNextPostDelay() — デフォルト値（60〜120分）", () => {
		it("返値が 60 以上 120 以下の整数である", () => {
			// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
			const strategy = new FixedIntervalSchedulingStrategy();
			const delay = strategy.getNextPostDelay(createContext());

			expect(delay).toBeGreaterThanOrEqual(60);
			expect(delay).toBeLessThanOrEqual(120);
			expect(Number.isInteger(delay)).toBe(true);
		});

		it("100回呼び出しても常に 60〜120 の範囲内である（境界値）", () => {
			// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
			const strategy = new FixedIntervalSchedulingStrategy();
			const context = createContext();

			for (let i = 0; i < 100; i++) {
				const delay = strategy.getNextPostDelay(context);
				expect(delay).toBeGreaterThanOrEqual(60);
				expect(delay).toBeLessThanOrEqual(120);
			}
		});

		it("複数回呼び出した場合、必ずしも同じ値ではない（ランダム性の確認）", () => {
			// 確率論的テスト: 61種類の値のうち少なくとも2種類は出現するはず
			const strategy = new FixedIntervalSchedulingStrategy();
			const context = createContext();

			const values = new Set<number>();
			for (let i = 0; i < 100; i++) {
				values.add(strategy.getNextPostDelay(context));
			}

			expect(values.size).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// getNextPostDelay() — カスタム min/max
	// =========================================================================

	describe("getNextPostDelay() — カスタム min/max", () => {
		it("カスタム min=30, max=60 の場合、30〜60 の範囲内の整数を返す", () => {
			const strategy = new FixedIntervalSchedulingStrategy(30, 60);
			const context = createContext();

			for (let i = 0; i < 100; i++) {
				const delay = strategy.getNextPostDelay(context);
				expect(delay).toBeGreaterThanOrEqual(30);
				expect(delay).toBeLessThanOrEqual(60);
				expect(Number.isInteger(delay)).toBe(true);
			}
		});

		it("min === max の場合、常に同じ値を返す（境界値）", () => {
			const strategy = new FixedIntervalSchedulingStrategy(90, 90);
			const context = createContext();

			for (let i = 0; i < 10; i++) {
				expect(strategy.getNextPostDelay(context)).toBe(90);
			}
		});

		it("最小値（0）と最大値（1440 = 24時間）の境界を正しく扱う", () => {
			const strategy = new FixedIntervalSchedulingStrategy(0, 1440);
			const context = createContext();

			const delay = strategy.getNextPostDelay(context);
			expect(delay).toBeGreaterThanOrEqual(0);
			expect(delay).toBeLessThanOrEqual(1440);
			expect(Number.isInteger(delay)).toBe(true);
		});
	});

	// =========================================================================
	// SchedulingStrategy インターフェース準拠
	// =========================================================================

	describe("SchedulingStrategy インターフェース準拠", () => {
		it("getNextPostDelay() は number を返す（非 Promise）", () => {
			const strategy = new FixedIntervalSchedulingStrategy();
			const result = strategy.getNextPostDelay(createContext());

			expect(typeof result).toBe("number");
			// Promise でないことを確認
			expect(result).not.toBeInstanceOf(Promise);
		});

		it("SchedulingContext の botProfileKey が null でも正常に動作する", () => {
			const strategy = new FixedIntervalSchedulingStrategy();
			const context = createContext({ botProfileKey: null });

			const delay = strategy.getNextPostDelay(context);

			expect(delay).toBeGreaterThanOrEqual(60);
			expect(delay).toBeLessThanOrEqual(120);
		});
	});
});
