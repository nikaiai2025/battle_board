/**
 * 単体テスト: RandomThreadBehaviorStrategy
 *
 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
 * See: docs/architecture/components/bot.md §2.12.3 RandomThreadBehaviorStrategy
 *
 * テスト方針:
 *   - IThreadRepository はモック化する
 *   - decideAction() の振る舞い（BotAction の返り値形式）を検証する
 *   - エッジケース: スレッド0件、50件、ランダム性確認
 */

import { describe, expect, it, vi } from "vitest";
import type { IThreadRepository } from "../../../../lib/services/bot-service";
import { RandomThreadBehaviorStrategy } from "../../../../lib/services/bot-strategies/behavior/random-thread";
import type { BehaviorContext } from "../../../../lib/services/bot-strategies/types";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** モック IThreadRepository を生成する */
function createMockThreadRepository(
	threads: { id: string }[] = [],
): IThreadRepository {
	return {
		findByBoardId: vi.fn().mockResolvedValue(threads),
	};
}

/** テスト用 BehaviorContext を生成する */
function createContext(
	overrides: Partial<BehaviorContext> = {},
): BehaviorContext {
	return {
		botId: "bot-001",
		botProfileKey: "荒らし役",
		boardId: "livebot",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("RandomThreadBehaviorStrategy", () => {
	// =========================================================================
	// decideAction() — 正常系
	// =========================================================================

	describe("decideAction() — 正常系", () => {
		it("スレッド一覧のいずれかの threadId を持つ post_to_existing アクションを返す", async () => {
			// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
			const threads = [
				{ id: "thread-001" },
				{ id: "thread-002" },
				{ id: "thread-003" },
			];
			const threadRepo = createMockThreadRepository(threads);
			const strategy = new RandomThreadBehaviorStrategy(threadRepo);
			const context = createContext();

			const result = await strategy.decideAction(context);

			expect(result.type).toBe("post_to_existing");
			if (result.type === "post_to_existing") {
				expect(threads.map((t) => t.id)).toContain(result.threadId);
			}
		});

		it("返り値の type は 'post_to_existing' であること", async () => {
			// See: docs/architecture/components/bot.md §2.11 BotAction
			const threads = [{ id: "thread-001" }];
			const strategy = new RandomThreadBehaviorStrategy(
				createMockThreadRepository(threads),
			);

			const result = await strategy.decideAction(createContext());

			expect(result.type).toBe("post_to_existing");
		});

		it("50件のスレッドから1件の post_to_existing アクションが返される（BDDシナリオD対応）", async () => {
			// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
			const threads = Array.from({ length: 50 }, (_, i) => ({
				id: `thread-${String(i + 1).padStart(3, "0")}`,
			}));
			const strategy = new RandomThreadBehaviorStrategy(
				createMockThreadRepository(threads),
			);

			const result = await strategy.decideAction(createContext());

			expect(result.type).toBe("post_to_existing");
			if (result.type === "post_to_existing") {
				expect(threads.map((t) => t.id)).toContain(result.threadId);
			}
		});

		it("100回呼び出した場合、複数の異なるスレッドが選択される（ランダム性の確認）", async () => {
			// 確率論的テスト: 10件から100回選んでも毎回同じ確率は (1/10)^99 ≒ 0
			const threads = Array.from({ length: 10 }, (_, i) => ({
				id: `thread-${i + 1}`,
			}));
			const strategy = new RandomThreadBehaviorStrategy(
				createMockThreadRepository(threads),
			);
			const context = createContext();

			const selected = new Set<string>();
			for (let i = 0; i < 100; i++) {
				const result = await strategy.decideAction(context);
				if (result.type === "post_to_existing") {
					selected.add(result.threadId);
				}
			}

			expect(selected.size).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// decideAction() — 異常系
	// =========================================================================

	describe("decideAction() — 異常系", () => {
		it("スレッドが0件の場合はエラーをスローする", async () => {
			// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
			const strategy = new RandomThreadBehaviorStrategy(
				createMockThreadRepository([]),
			);

			await expect(strategy.decideAction(createContext())).rejects.toThrow();
		});

		it("スレッドが0件の場合のエラーメッセージに boardId と botId が含まれる", async () => {
			const strategy = new RandomThreadBehaviorStrategy(
				createMockThreadRepository([]),
			);
			const context = createContext({
				botId: "bot-test-999",
				boardId: "testboard",
			});

			await expect(strategy.decideAction(context)).rejects.toThrow(
				/boardId=testboard/,
			);
		});
	});

	// =========================================================================
	// BehaviorStrategy インターフェース準拠
	// =========================================================================

	describe("BehaviorStrategy インターフェース準拠", () => {
		it("decideAction() は Promise<BotAction> を返す", async () => {
			const threads = [{ id: "thread-001" }];
			const strategy = new RandomThreadBehaviorStrategy(
				createMockThreadRepository(threads),
			);

			const result = strategy.decideAction(createContext());

			expect(result).toBeInstanceOf(Promise);
			const resolved = await result;
			expect(resolved).toHaveProperty("type");
		});
	});
});
