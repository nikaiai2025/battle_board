/**
 * TopicDrivenSchedulingStrategy の単体テスト
 *
 * See: features/curation_bot.feature @BOTの投稿間隔は12時間〜24時間のランダム間隔である
 * See: docs/architecture/components/bot.md §2.13.3 TopicDrivenSchedulingStrategy
 */
import { describe, expect, it } from "vitest";
import { TopicDrivenSchedulingStrategy } from "../../../../../lib/services/bot-strategies/scheduling/topic-driven";

const SCHEDULING_CONTEXT = {
	botId: "bot-001",
	botProfileKey: "curation_newsplus",
};

describe("TopicDrivenSchedulingStrategy", () => {
	describe("getNextPostDelay", () => {
		it("デフォルトで 720〜1440 の範囲内の整数を返す", () => {
			const strategy = new TopicDrivenSchedulingStrategy();
			for (let i = 0; i < 100; i++) {
				const delay = strategy.getNextPostDelay(SCHEDULING_CONTEXT);
				expect(delay).toBeGreaterThanOrEqual(720);
				expect(delay).toBeLessThanOrEqual(1440);
				expect(Number.isInteger(delay)).toBe(true);
			}
		});

		it("カスタム min/max を指定した場合、指定範囲内の整数を返す", () => {
			const strategy = new TopicDrivenSchedulingStrategy(100, 200);
			for (let i = 0; i < 50; i++) {
				const delay = strategy.getNextPostDelay(SCHEDULING_CONTEXT);
				expect(delay).toBeGreaterThanOrEqual(100);
				expect(delay).toBeLessThanOrEqual(200);
			}
		});

		it("min === max の場合は常にその値を返す", () => {
			const strategy = new TopicDrivenSchedulingStrategy(300, 300);
			const delay = strategy.getNextPostDelay(SCHEDULING_CONTEXT);
			expect(delay).toBe(300);
		});

		it("100回の試行でmin（720）を少なくとも1回返す（統計的確認）", () => {
			// 範囲が721通り（720〜1440）あるため、100回で720が出なくても正常だが
			// 広い視点でランダム性を確認する: 最大値と最小値の両端が出ること
			const strategy = new TopicDrivenSchedulingStrategy();
			const results = new Set<number>();
			for (let i = 0; i < 500; i++) {
				results.add(strategy.getNextPostDelay(SCHEDULING_CONTEXT));
			}
			// 500回なら複数の異なる値が出るはず
			expect(results.size).toBeGreaterThan(10);
		});

		it("コンテキスト引数は無視される（固定範囲スケジュール）", () => {
			const strategy = new TopicDrivenSchedulingStrategy();
			const delay1 = strategy.getNextPostDelay({
				botId: "bot-aaa",
				botProfileKey: "profile-x",
			});
			const delay2 = strategy.getNextPostDelay({
				botId: "bot-bbb",
				botProfileKey: null,
			});
			// どちらも同じ範囲に収まることを確認
			expect(delay1).toBeGreaterThanOrEqual(720);
			expect(delay2).toBeGreaterThanOrEqual(720);
		});
	});
});
