/**
 * 単体テスト: BotService next_post_at スケジューリング
 *
 * next_post_at 判定・更新、日次リセット時の next_post_at 再設定をテストする。
 *
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: docs/architecture/components/bot.md §2.1 書き込み実行
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
 *
 * テスト方針:
 *   - BotRepository, BotPostRepository, AttackRepository はすべてモック化する
 *   - next_post_at の判定ロジック（スキップ/投稿対象/更新）を検証する
 *   - performDailyReset での復活BOTの next_post_at 再設定を検証する
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "../../../lib/domain/models/bot";
import type { Attack } from "../../../lib/infrastructure/repositories/attack-repository";
import {
	BotService,
	type CreatePostFn,
	type IAttackRepository,
	type IBotPostRepository,
	type IBotRepository,
	type IThreadRepository,
	type ResolveStrategiesFn,
} from "../../../lib/services/bot-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 Bot（lurking状態）を生成する */
function createLurkingBot(overrides: Partial<Bot> = {}): Bot {
	return {
		id: "bot-001",
		name: "荒らし役",
		persona: "荒らし",
		hp: 10,
		maxHp: 10,
		dailyId: "FkBot01",
		dailyIdDate: "2026-03-16",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		grassCount: 0,
		botProfileKey: "荒らし役",
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date("2026-03-16T00:00:00Z"),
		...overrides,
	};
}

/** テスト用 Bot（eliminated状態）を生成する */
function createEliminatedBot(overrides: Partial<Bot> = {}): Bot {
	return createLurkingBot({
		isActive: false,
		hp: 0,
		eliminatedAt: new Date("2026-03-16T12:00:00Z"),
		eliminatedBy: "attacker-001",
		...overrides,
	});
}

/** モック BotRepository を生成する */
function createMockBotRepository(
	bot: Bot | null = createLurkingBot(),
): IBotRepository {
	return {
		findById: vi.fn().mockResolvedValue(bot),
		findAll: vi.fn().mockResolvedValue([]),
		updateHp: vi.fn().mockResolvedValue(undefined),
		eliminate: vi.fn().mockResolvedValue(undefined),
		reveal: vi.fn().mockResolvedValue(undefined),
		incrementTimesAttacked: vi.fn().mockResolvedValue(undefined),
		bulkResetRevealed: vi.fn().mockResolvedValue(0),
		bulkReviveEliminated: vi.fn().mockResolvedValue(0),
		// See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
		deleteEliminatedTutorialBots: vi.fn().mockResolvedValue(0),
		incrementSurvivalDays: vi.fn().mockResolvedValue(undefined),
		// See: features/bot_system.feature @BOTの書き込みで総書き込み数がインクリメントされる
		incrementTotalPosts: vi.fn().mockResolvedValue(undefined),
		// See: features/bot_system.feature @AI告発成功でBOTの被告発回数がインクリメントされる
		incrementAccusedCount: vi.fn().mockResolvedValue(undefined),
		updateDailyId: vi.fn().mockResolvedValue(undefined),
		updateNextPostAt: vi.fn().mockResolvedValue(undefined),
		findDueForPost: vi.fn().mockResolvedValue([]),
		// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
		create: vi
			.fn()
			.mockResolvedValue(createLurkingBot({ botProfileKey: "tutorial" })),
		countLivingBots: vi.fn().mockResolvedValue(0),
	};
}

/** モック BotPostRepository を生成する */
function createMockBotPostRepository(): IBotPostRepository {
	return {
		findByPostId: vi.fn().mockResolvedValue(null),
		create: vi.fn().mockResolvedValue(undefined),
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

/** モック CreatePostFn を生成する */
function createMockCreatePostFn(): CreatePostFn {
	return vi.fn().mockResolvedValue({
		success: true,
		postId: "post-001",
		postNumber: 1,
		systemMessages: [],
	}) as unknown as CreatePostFn;
}

/** モック AttackRepository を生成する */
function createMockAttackRepository(): IAttackRepository {
	return {
		findByAttackerAndBotAndDate: vi.fn().mockResolvedValue(null),
		create: vi.fn().mockResolvedValue({
			id: "attack-001",
			attackerId: "attacker-001",
			botId: "bot-001",
			attackDate: "2026-03-16",
			postId: "post-001",
			damage: 10,
			createdAt: new Date(),
		} as Attack),
		deleteByDateBefore: vi.fn().mockResolvedValue(0),
	};
}

/**
 * テスト用のモック resolveStrategies 関数。
 * 固定文メッセージ、ランダムスレッド選択、固定間隔スケジューリングを返す。
 */
function createMockResolveStrategies(): ResolveStrategiesFn {
	return vi.fn().mockReturnValue({
		content: {
			generateContent: vi.fn().mockResolvedValue("テスト書き込み"),
		},
		behavior: {
			decideAction: vi.fn().mockResolvedValue({
				type: "post_to_existing",
				threadId: "thread-001",
			}),
		},
		scheduling: {
			getNextPostDelay: vi.fn().mockReturnValue(90),
		},
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("BotService next_post_at スケジューリング", () => {
	// Date.now をモック化して時刻を制御する
	const FIXED_NOW = new Date("2026-03-16T12:00:00Z").getTime();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(FIXED_NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// =========================================================================
	// executeBotPost: next_post_at 判定
	// =========================================================================

	describe("executeBotPost() next_post_at 判定", () => {
		it("next_post_at が null の場合は投稿を実行する", async () => {
			// See: docs/architecture/architecture.md §13 TDR-010
			const bot = createLurkingBot({ nextPostAt: null });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();
			const resolveStrategies = createMockResolveStrategies();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
				resolveStrategies,
			);

			const result = await service.executeBotPost("bot-001");

			// 投稿が実行されたことを確認
			expect(result).not.toBeNull();
			expect(result?.postId).toBe("post-001");
			expect(createPostFn).toHaveBeenCalled();
		});

		it("next_post_at が過去の場合は投稿を実行する", async () => {
			// See: docs/architecture/architecture.md §13 TDR-010
			const pastTime = new Date(FIXED_NOW - 60 * 60 * 1000); // 1時間前
			const bot = createLurkingBot({ nextPostAt: pastTime });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();
			const resolveStrategies = createMockResolveStrategies();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
				resolveStrategies,
			);

			const result = await service.executeBotPost("bot-001");

			expect(result).not.toBeNull();
			expect(createPostFn).toHaveBeenCalled();
		});

		it("next_post_at が現在時刻ちょうどの場合は投稿を実行する（境界値）", async () => {
			const exactNow = new Date(FIXED_NOW);
			const bot = createLurkingBot({ nextPostAt: exactNow });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();
			const resolveStrategies = createMockResolveStrategies();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
				resolveStrategies,
			);

			const result = await service.executeBotPost("bot-001");

			expect(result).not.toBeNull();
			expect(createPostFn).toHaveBeenCalled();
		});

		it("next_post_at が未来の場合は投稿をスキップして null を返す", async () => {
			// See: docs/architecture/architecture.md §13 TDR-010
			const futureTime = new Date(FIXED_NOW + 60 * 60 * 1000); // 1時間後
			const bot = createLurkingBot({ nextPostAt: futureTime });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
			);

			const result = await service.executeBotPost("bot-001");

			// 投稿はスキップされ null が返る
			expect(result).toBeNull();
			expect(createPostFn).not.toHaveBeenCalled();
		});

		it("next_post_at が1ミリ秒後の場合はスキップする（境界値）", async () => {
			const barelyFuture = new Date(FIXED_NOW + 1);
			const bot = createLurkingBot({ nextPostAt: barelyFuture });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
			);

			const result = await service.executeBotPost("bot-001");

			expect(result).toBeNull();
			expect(createPostFn).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// executeBotPost: next_post_at 更新
	// =========================================================================

	describe("executeBotPost() next_post_at 更新", () => {
		it("投稿成功後に updateNextPostAt が呼ばれる", async () => {
			// See: docs/architecture/components/bot.md §2.1 書き込み実行 Step 6
			const bot = createLurkingBot({ nextPostAt: null });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();
			const resolveStrategies = createMockResolveStrategies();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
				resolveStrategies,
			);

			await service.executeBotPost("bot-001");

			expect(botRepo.updateNextPostAt).toHaveBeenCalledWith(
				"bot-001",
				expect.any(Date),
			);
		});

		it("更新される next_post_at は NOW() + delay 分後である", async () => {
			// getNextPostDelay が 90分を返すようモックされている
			const bot = createLurkingBot({ nextPostAt: null });
			const botRepo = createMockBotRepository(bot);
			const createPostFn = createMockCreatePostFn();
			const resolveStrategies = createMockResolveStrategies();

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
				resolveStrategies,
			);

			await service.executeBotPost("bot-001");

			const expectedNextPostAt = new Date(FIXED_NOW + 90 * 60 * 1000);
			expect(botRepo.updateNextPostAt).toHaveBeenCalledWith(
				"bot-001",
				expectedNextPostAt,
			);
		});

		it("updateNextPostAt が失敗しても投稿結果は返る（非致命的エラー）", async () => {
			const bot = createLurkingBot({ nextPostAt: null });
			const botRepo = createMockBotRepository(bot);
			(botRepo.updateNextPostAt as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB error"),
			);
			const createPostFn = createMockCreatePostFn();
			const resolveStrategies = createMockResolveStrategies();

			// console.error をモック化してノイズを抑制
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createPostFn,
				resolveStrategies,
			);

			const result = await service.executeBotPost("bot-001");

			// 投稿結果は正常に返る
			expect(result).not.toBeNull();
			expect(result?.postId).toBe("post-001");
			// エラーがログされていること
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	// =========================================================================
	// getActiveBotsDueForPost
	// =========================================================================

	describe("getActiveBotsDueForPost()", () => {
		it("投稿対象BOT一覧を findDueForPost に委譲して返す", async () => {
			const dueBots = [
				createLurkingBot({ id: "bot-001" }),
				createLurkingBot({ id: "bot-002" }),
			];
			const botRepo = createMockBotRepository();
			(botRepo.findDueForPost as ReturnType<typeof vi.fn>).mockResolvedValue(
				dueBots,
			);

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.getActiveBotsDueForPost();

			expect(result).toEqual(dueBots);
			expect(botRepo.findDueForPost).toHaveBeenCalled();
		});

		it("投稿対象BOTが0件の場合は空配列を返す", async () => {
			const botRepo = createMockBotRepository();
			(botRepo.findDueForPost as ReturnType<typeof vi.fn>).mockResolvedValue(
				[],
			);

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.getActiveBotsDueForPost();

			expect(result).toEqual([]);
		});
	});

	// =========================================================================
	// performDailyReset: next_post_at 再設定
	// =========================================================================

	describe("performDailyReset() next_post_at 再設定", () => {
		it("eliminated BOTが復活した場合、next_post_at が再設定される", async () => {
			// See: docs/architecture/components/bot.md §2.10 日次リセット処理
			// See: docs/architecture/architecture.md §13 TDR-010 > 撃破との整合性
			const eliminatedBot = createEliminatedBot({ id: "bot-dead-001" });
			const revivedBot = createLurkingBot({
				id: "bot-dead-001",
				survivalDays: 0,
			});

			const botRepo = createMockBotRepository();
			// 最初の findAll: eliminated BOTを含むリスト
			(botRepo.findAll as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([eliminatedBot])
				// 2回目の findAll: 復活後のBOTリスト
				.mockResolvedValueOnce([revivedBot]);

			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue(1);

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// 復活したBOTの next_post_at が設定されていること
			expect(botRepo.updateNextPostAt).toHaveBeenCalledWith(
				"bot-dead-001",
				expect.any(Date),
			);
		});

		it("復活BOTがいない場合、updateNextPostAt は呼ばれない", async () => {
			const activeBot = createLurkingBot({ id: "bot-active-001" });

			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([
				activeBot,
			]);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue(0);

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// updateNextPostAt は呼ばれない
			expect(botRepo.updateNextPostAt).not.toHaveBeenCalled();
		});

		it("復活した next_post_at は NOW() + delay 分後の値である", async () => {
			const eliminatedBot = createEliminatedBot({ id: "bot-dead-001" });
			const revivedBot = createLurkingBot({
				id: "bot-dead-001",
				survivalDays: 0,
			});

			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([eliminatedBot])
				.mockResolvedValueOnce([revivedBot]);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue(1);

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// updateNextPostAt に渡された Date が妥当であること
			// getNextPostDelay は 60-120 分を返すため、そのレンジ内であること
			const call = (botRepo.updateNextPostAt as ReturnType<typeof vi.fn>).mock
				.calls[0];
			expect(call).toBeDefined();
			const nextPostAtDate = call[1] as Date;
			const diffMinutes = (nextPostAtDate.getTime() - FIXED_NOW) / (60 * 1000);
			expect(diffMinutes).toBeGreaterThanOrEqual(60);
			expect(diffMinutes).toBeLessThanOrEqual(120);
		});

		it("複数の eliminated BOTが復活した場合、全てに next_post_at が設定される", async () => {
			const eliminated1 = createEliminatedBot({ id: "bot-dead-001" });
			const eliminated2 = createEliminatedBot({ id: "bot-dead-002" });
			const revived1 = createLurkingBot({
				id: "bot-dead-001",
				survivalDays: 0,
			});
			const revived2 = createLurkingBot({
				id: "bot-dead-002",
				survivalDays: 0,
			});

			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([eliminated1, eliminated2])
				.mockResolvedValueOnce([revived1, revived2]);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue(2);

			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// 2体分の updateNextPostAt が呼ばれていること
			expect(botRepo.updateNextPostAt).toHaveBeenCalledTimes(2);
			expect(botRepo.updateNextPostAt).toHaveBeenCalledWith(
				"bot-dead-001",
				expect.any(Date),
			);
			expect(botRepo.updateNextPostAt).toHaveBeenCalledWith(
				"bot-dead-002",
				expect.any(Date),
			);
		});
	});
});
