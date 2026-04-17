/**
 * 単体テスト: resolveStrategies（Strategy リゾルバー）
 *
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 * See: docs/architecture/components/bot.md §2.12.3 Strategy 実装一覧
 *
 * テスト方針:
 *   - resolveStrategies() が正しい BotStrategies を返すことを検証する
 *   - 返される Strategy 実装が期待するクラスのインスタンスであることを確認する
 *   - Phase 3/4 向けの TODO コメント（yaml指定、owner_id判定）は現時点では未実装のため、
 *     デフォルト（Phase 2）解決のみ検証する
 */

import { describe, expect, it, vi } from "vitest";
import { botProfilesConfig } from "../../../../../config/bot-profiles";
import type { Bot } from "../../../../lib/domain/models/bot";
import type { IThreadRepository } from "../../../../lib/services/bot-service";
import { RandomThreadBehaviorStrategy } from "../../../../lib/services/bot-strategies/behavior/random-thread";
import { FixedMessageContentStrategy } from "../../../../lib/services/bot-strategies/content/fixed-message";
import { FixedIntervalSchedulingStrategy } from "../../../../lib/services/bot-strategies/scheduling/fixed-interval";
import {
	type ResolveStrategiesOptions,
	resolveStrategies,
} from "../../../../lib/services/bot-strategies/strategy-resolver";
import type { BotProfile } from "../../../../lib/services/bot-strategies/types";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 Bot エンティティを生成する */
function createBot(overrides: Partial<Bot> = {}): Bot {
	return {
		id: "bot-001",
		name: "荒らし役",
		persona: "荒らし",
		hp: 10,
		maxHp: 10,
		dailyId: "FkBot01",
		dailyIdDate: "2026-03-17",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		revivedAt: null,
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		grassCount: 0,
		botProfileKey: "荒らし役",
		// See: docs/architecture/architecture.md §13 TDR-010
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-17T00:00:00Z"),
		...overrides,
	};
}

/** テスト用 BotProfile を生成する */
function createBotProfile(overrides: Partial<BotProfile> = {}): BotProfile {
	return {
		hp: 10,
		max_hp: 10,
		reward: { base_reward: 10, daily_bonus: 50, attack_bonus: 5 },
		fixed_messages: ["テスト固定文"],
		...overrides,
	};
}

/** モック IThreadRepository を生成する */
function createMockThreadRepository(
	threads: { id: string }[] = [{ id: "thread-001" }],
): IThreadRepository {
	return {
		findByBoardId: vi.fn().mockResolvedValue(threads),
	};
}

/** テスト用 ResolveStrategiesOptions を生成する */
function createOptions(
	overrides: Partial<ResolveStrategiesOptions> = {},
): ResolveStrategiesOptions {
	return {
		threadRepository: createMockThreadRepository(),
		botProfiles: botProfilesConfig,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("resolveStrategies", () => {
	// =========================================================================
	// デフォルト解決（Phase 2）
	// =========================================================================

	describe("デフォルト解決（Phase 2 荒らし役）", () => {
		it("BotStrategies の 3つのフィールドが存在する（content, behavior, scheduling）", () => {
			// See: docs/architecture/components/bot.md §2.12.2 BotStrategies
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions(),
			);

			expect(result).toHaveProperty("content");
			expect(result).toHaveProperty("behavior");
			expect(result).toHaveProperty("scheduling");
		});

		it("content は FixedMessageContentStrategy のインスタンスを返す", () => {
			// See: docs/architecture/components/bot.md §2.12.3 Phase 2 (既存) > ContentStrategy
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions(),
			);

			expect(result.content).toBeInstanceOf(FixedMessageContentStrategy);
		});

		it("behavior は RandomThreadBehaviorStrategy のインスタンスを返す", () => {
			// See: docs/architecture/components/bot.md §2.12.3 Phase 2 (既存) > BehaviorStrategy
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions(),
			);

			expect(result.behavior).toBeInstanceOf(RandomThreadBehaviorStrategy);
		});

		it("scheduling は FixedIntervalSchedulingStrategy のインスタンスを返す", () => {
			// See: docs/architecture/components/bot.md §2.12.3 Phase 2 (既存) > SchedulingStrategy
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions(),
			);

			expect(result.scheduling).toBeInstanceOf(FixedIntervalSchedulingStrategy);
		});
	});

	// =========================================================================
	// null プロファイルの扱い
	// =========================================================================

	describe("null プロファイルの扱い", () => {
		it("profile が null の場合でも BotStrategies を返す（デフォルト解決）", () => {
			// See: docs/architecture/components/bot.md §2.12.2 解決の優先順位 > 3. デフォルト
			const result = resolveStrategies(createBot(), null, createOptions());

			expect(result).toHaveProperty("content");
			expect(result).toHaveProperty("behavior");
			expect(result).toHaveProperty("scheduling");
		});

		it("profile が null の場合でも FixedMessageContentStrategy が返される", () => {
			const result = resolveStrategies(createBot(), null, createOptions());

			expect(result.content).toBeInstanceOf(FixedMessageContentStrategy);
		});
	});

	// =========================================================================
	// 返された Strategy が実際に動作する
	// =========================================================================

	describe("返された Strategy が実際に動作する", () => {
		it("content.generateContent() が荒らし役の固定文リストから値を返す", async () => {
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions(),
			);

			const content = await result.content.generateContent({
				botId: "bot-001",
				botProfileKey: "荒らし役",
				threadId: "thread-001",
			});

			// 固定文リストに含まれる文字列が返されること
			const fixedMessages = (
				result.content as FixedMessageContentStrategy
			).getFixedMessages("荒らし役");
			expect(fixedMessages).toContain(content);
		});

		it("behavior.decideAction() が post_to_existing アクションを返す", async () => {
			const threads = [{ id: "thread-abc" }];
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions({
					threadRepository: createMockThreadRepository(threads),
				}),
			);

			const action = await result.behavior.decideAction({
				botId: "bot-001",
				botProfileKey: "荒らし役",
				boardId: "livebot",
			});

			expect(action.type).toBe("post_to_existing");
			if (action.type === "post_to_existing") {
				expect(action.threadId).toBe("thread-abc");
			}
		});

		it("scheduling.getNextPostDelay() が 60〜120 の整数を返す", () => {
			const result = resolveStrategies(
				createBot(),
				createBotProfile(),
				createOptions(),
			);

			const delay = result.scheduling.getNextPostDelay({
				botId: "bot-001",
				botProfileKey: "荒らし役",
			});

			expect(delay).toBeGreaterThanOrEqual(60);
			expect(delay).toBeLessThanOrEqual(120);
			expect(Number.isInteger(delay)).toBe(true);
		});
	});
});
