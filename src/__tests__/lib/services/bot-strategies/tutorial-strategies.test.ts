/**
 * 単体テスト: チュートリアルBOT Strategy 実装
 *
 * - TutorialContentStrategy: 正しい本文を生成すること
 * - TutorialBehaviorStrategy: 正しい threadId を返すこと
 * - ImmediateSchedulingStrategy: delay = 0 を返すこと
 * - resolveStrategies: tutorial プロファイル時にチュートリアル Strategy を返すこと
 *
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.3
 */

import { describe, expect, it } from "vitest";
import type { Bot } from "../../../../lib/domain/models/bot";
import { TutorialBehaviorStrategy } from "../../../../lib/services/bot-strategies/behavior/tutorial";
import { TutorialContentStrategy } from "../../../../lib/services/bot-strategies/content/tutorial";
import { ImmediateSchedulingStrategy } from "../../../../lib/services/bot-strategies/scheduling/immediate";
import { resolveStrategies } from "../../../../lib/services/bot-strategies/strategy-resolver";
import type {
	BehaviorContext,
	BotProfile,
	ContentGenerationContext,
	IThreadRepository,
	SchedulingContext,
} from "../../../../lib/services/bot-strategies/types";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 Bot（tutorial プロファイル）を生成する */
function createTutorialBot(overrides: Partial<Bot> = {}): Bot {
	return {
		id: "bot-tutorial-001",
		name: "チュートリアルBOT",
		persona: "チュートリアル",
		hp: 10,
		maxHp: 10,
		dailyId: "TutBot01",
		dailyIdDate: "2026-03-21",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		botProfileKey: "tutorial",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-21T00:00:00Z"),
		...overrides,
	};
}

/** テスト用 Bot（荒らし役プロファイル）を生成する */
function createDefaultBot(overrides: Partial<Bot> = {}): Bot {
	return {
		id: "bot-default-001",
		name: "荒らし役",
		persona: "荒らし",
		hp: 10,
		maxHp: 10,
		dailyId: "FkBot01",
		dailyIdDate: "2026-03-21",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		botProfileKey: "荒らし役",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-21T00:00:00Z"),
		...overrides,
	};
}

/** テスト用モック IThreadRepository を生成する */
function createMockThreadRepository(
	threads: { id: string }[] = [{ id: "thread-001" }],
): IThreadRepository {
	return {
		findByBoardId: async () => threads,
	};
}

// ---------------------------------------------------------------------------
// TutorialContentStrategy テスト
// ---------------------------------------------------------------------------

describe("TutorialContentStrategy", () => {
	// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 TutorialContentStrategy

	it("tutorialTargetPostNumber が指定された場合、>>N !w  新参おるやん🤣 の形式の本文を返す", async () => {
		const strategy = new TutorialContentStrategy();
		const context: ContentGenerationContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
			threadId: "thread-001",
			tutorialTargetPostNumber: 5,
		};

		const result = await strategy.generateContent(context);

		expect(result).toBe(">>5 !w  新参おるやん🤣");
	});

	it("tutorialTargetPostNumber = 1 の場合、>>1 !w  新参おるやん🤣 を返す", async () => {
		const strategy = new TutorialContentStrategy();
		const context: ContentGenerationContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
			threadId: "thread-001",
			tutorialTargetPostNumber: 1,
		};

		const result = await strategy.generateContent(context);

		expect(result).toBe(">>1 !w  新参おるやん🤣");
	});

	it("tutorialTargetPostNumber が未設定の場合、デフォルト値 1 で >>1 !w  新参おるやん🤣 を返す", async () => {
		const strategy = new TutorialContentStrategy();
		const context: ContentGenerationContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
			threadId: "thread-001",
			// tutorialTargetPostNumber は未設定
		};

		const result = await strategy.generateContent(context);

		expect(result).toBe(">>1 !w  新参おるやん🤣");
	});

	it("大きなレス番号（999）でも正しい本文を生成する", async () => {
		const strategy = new TutorialContentStrategy();
		const context: ContentGenerationContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
			threadId: "thread-001",
			tutorialTargetPostNumber: 999,
		};

		const result = await strategy.generateContent(context);

		expect(result).toBe(">>999 !w  新参おるやん🤣");
	});
});

// ---------------------------------------------------------------------------
// TutorialBehaviorStrategy テスト
// ---------------------------------------------------------------------------

describe("TutorialBehaviorStrategy", () => {
	// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 TutorialBehaviorStrategy

	it("tutorialThreadId が指定された場合、post_to_existing アクションを返す", async () => {
		const strategy = new TutorialBehaviorStrategy();
		const context: BehaviorContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
			boardId: "battleboard",
			tutorialThreadId: "thread-001",
		};

		const result = await strategy.decideAction(context);

		expect(result).toEqual({
			type: "post_to_existing",
			threadId: "thread-001",
		});
	});

	it("tutorialThreadId に別の値を渡しても、その threadId で post_to_existing を返す", async () => {
		const strategy = new TutorialBehaviorStrategy();
		const context: BehaviorContext = {
			botId: "bot-tutorial-002",
			botProfileKey: "tutorial",
			boardId: "battleboard",
			tutorialThreadId: "thread-special-999",
		};

		const result = await strategy.decideAction(context);

		expect(result).toEqual({
			type: "post_to_existing",
			threadId: "thread-special-999",
		});
	});

	it("tutorialThreadId が未設定の場合、エラーをスローする", async () => {
		const strategy = new TutorialBehaviorStrategy();
		const context: BehaviorContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
			boardId: "battleboard",
			// tutorialThreadId は未設定
		};

		await expect(strategy.decideAction(context)).rejects.toThrow(
			"TutorialBehaviorStrategy.decideAction: tutorialThreadId が未設定です (botId=bot-tutorial-001)",
		);
	});
});

// ---------------------------------------------------------------------------
// ImmediateSchedulingStrategy テスト
// ---------------------------------------------------------------------------

describe("ImmediateSchedulingStrategy", () => {
	// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 ImmediateSchedulingStrategy

	it("getNextPostDelay は常に 0 を返す", () => {
		const strategy = new ImmediateSchedulingStrategy();
		const context: SchedulingContext = {
			botId: "bot-tutorial-001",
			botProfileKey: "tutorial",
		};

		const result = strategy.getNextPostDelay(context);

		expect(result).toBe(0);
	});

	it("異なるコンテキストでも常に 0 を返す（コンテキストに依存しない）", () => {
		const strategy = new ImmediateSchedulingStrategy();

		// botProfileKey が null でも 0 を返す
		const contextNull: SchedulingContext = {
			botId: "bot-other",
			botProfileKey: null,
		};
		expect(strategy.getNextPostDelay(contextNull)).toBe(0);

		// botProfileKey が別の値でも 0 を返す
		const contextOther: SchedulingContext = {
			botId: "bot-other-2",
			botProfileKey: "荒らし役",
		};
		expect(strategy.getNextPostDelay(contextOther)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// resolveStrategies テスト（tutorial 分岐）
// ---------------------------------------------------------------------------

describe("resolveStrategies (tutorial 分岐)", () => {
	// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 resolveStrategies の拡張

	const tutorialProfile: BotProfile = {
		hp: 10,
		max_hp: 10,
		reward: { base_reward: 20, daily_bonus: 0, attack_bonus: 0 },
		fixed_messages: [],
	};

	const defaultProfile: BotProfile = {
		hp: 10,
		max_hp: 10,
		reward: { base_reward: 10, daily_bonus: 50, attack_bonus: 5 },
		fixed_messages: ["なんJほんま覇権やな"],
	};

	it("bot.botProfileKey === 'tutorial' の場合、TutorialContentStrategy を含む Strategy を返す", async () => {
		const bot = createTutorialBot();
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, tutorialProfile, {
			threadRepository: threadRepo,
		});

		expect(strategies.content).toBeInstanceOf(TutorialContentStrategy);
	});

	it("bot.botProfileKey === 'tutorial' の場合、TutorialBehaviorStrategy を含む Strategy を返す", async () => {
		const bot = createTutorialBot();
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, tutorialProfile, {
			threadRepository: threadRepo,
		});

		expect(strategies.behavior).toBeInstanceOf(TutorialBehaviorStrategy);
	});

	it("bot.botProfileKey === 'tutorial' の場合、ImmediateSchedulingStrategy を含む Strategy を返す", async () => {
		const bot = createTutorialBot();
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, tutorialProfile, {
			threadRepository: threadRepo,
		});

		expect(strategies.scheduling).toBeInstanceOf(ImmediateSchedulingStrategy);
	});

	it("bot.botProfileKey !== 'tutorial' の場合、TutorialContentStrategy を返さない（デフォルト Strategy）", async () => {
		const bot = createDefaultBot();
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, defaultProfile, {
			threadRepository: threadRepo,
		});

		expect(strategies.content).not.toBeInstanceOf(TutorialContentStrategy);
		expect(strategies.behavior).not.toBeInstanceOf(TutorialBehaviorStrategy);
		expect(strategies.scheduling).not.toBeInstanceOf(
			ImmediateSchedulingStrategy,
		);
	});

	it("bot.botProfileKey === null の場合、デフォルト Strategy を返す", async () => {
		const bot = createDefaultBot({ botProfileKey: null });
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, null, {
			threadRepository: threadRepo,
		});

		expect(strategies.content).not.toBeInstanceOf(TutorialContentStrategy);
	});

	it("tutorial Strategy は ImmediateSchedulingStrategy.getNextPostDelay が 0 を返す", async () => {
		const bot = createTutorialBot();
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, tutorialProfile, {
			threadRepository: threadRepo,
		});

		const delay = strategies.scheduling.getNextPostDelay({
			botId: bot.id,
			botProfileKey: bot.botProfileKey,
		});
		expect(delay).toBe(0);
	});

	it("tutorial Strategy は TutorialContentStrategy が正しい本文を生成する", async () => {
		const bot = createTutorialBot();
		const threadRepo = createMockThreadRepository();

		const strategies = resolveStrategies(bot, tutorialProfile, {
			threadRepository: threadRepo,
		});

		const body = await strategies.content.generateContent({
			botId: bot.id,
			botProfileKey: bot.botProfileKey,
			threadId: "thread-001",
			tutorialTargetPostNumber: 3,
		});
		expect(body).toBe(">>3 !w  新参おるやん🤣");
	});
});
