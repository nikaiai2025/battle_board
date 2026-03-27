/**
 * calculateBuzzScore の単体テスト
 *
 * See: features/curation_bot.feature ヘッダコメント（バズスコア算出式）
 * See: docs/architecture/components/bot.md §2.13.5 バズスコア算出式
 */
import { describe, expect, it } from "vitest";
import { calculateBuzzScore } from "../../../../lib/domain/rules/buzz-score";

describe("calculateBuzzScore", () => {
	const NOW_MS = 1_700_000_000_000; // 固定基準時刻（ms）

	it("経過0時間のスレッドのスコアを算出する（+2 でゼロ除算防止）", () => {
		// elapsedHours = 0, score = resCount / (0 + 2)^1.5 = 100 / 2.828...
		const createdAt = NOW_MS / 1000; // ちょうど now
		const score = calculateBuzzScore(100, createdAt, NOW_MS);
		expect(score).toBeCloseTo(100 / 2 ** 1.5, 5);
	});

	it("経過10時間のスレッドのスコアを算出する", () => {
		const createdAt = NOW_MS / 1000 - 10 * 3600;
		const score = calculateBuzzScore(200, createdAt, NOW_MS);
		expect(score).toBeCloseTo(200 / 12 ** 1.5, 5);
	});

	it("レス数0はスコア0を返す", () => {
		const createdAt = NOW_MS / 1000 - 5 * 3600;
		const score = calculateBuzzScore(0, createdAt, NOW_MS);
		expect(score).toBe(0);
	});

	it("経過時間が長いほどスコアが低くなる", () => {
		const recentCreated = NOW_MS / 1000 - 1 * 3600;
		const oldCreated = NOW_MS / 1000 - 100 * 3600;
		const recentScore = calculateBuzzScore(100, recentCreated, NOW_MS);
		const oldScore = calculateBuzzScore(100, oldCreated, NOW_MS);
		expect(recentScore).toBeGreaterThan(oldScore);
	});

	it("レス数が多いほどスコアが高くなる（同一スレッドで比較）", () => {
		const createdAt = NOW_MS / 1000 - 3 * 3600;
		const lowScore = calculateBuzzScore(10, createdAt, NOW_MS);
		const highScore = calculateBuzzScore(1000, createdAt, NOW_MS);
		expect(highScore).toBeGreaterThan(lowScore);
	});

	it("nowMs を省略すると Date.now() が使われる（スコアが正の値を返す）", () => {
		// createdUnixTime を現在より過去に設定
		const createdAt = Date.now() / 1000 - 24 * 3600;
		const score = calculateBuzzScore(50, createdAt);
		expect(score).toBeGreaterThan(0);
	});

	it("境界値: 大量レス数（100000件）でオーバーフローしない", () => {
		const createdAt = NOW_MS / 1000 - 1 * 3600;
		const score = calculateBuzzScore(100000, createdAt, NOW_MS);
		expect(Number.isFinite(score)).toBe(true);
		expect(score).toBeGreaterThan(0);
	});

	it("境界値: 非常に古いスレッド（1年前）のスコアは非常に小さい値を返す", () => {
		const createdAt = NOW_MS / 1000 - 365 * 24 * 3600;
		const score = calculateBuzzScore(100, createdAt, NOW_MS);
		expect(score).toBeGreaterThan(0);
		expect(score).toBeLessThan(0.01);
	});
});
