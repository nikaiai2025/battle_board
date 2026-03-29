/**
 * 単体テスト: BotService（AIボットシステムサービス）
 *
 * See: features/bot_system.feature
 * See: docs/architecture/components/bot.md §2 公開インターフェース
 * See: docs/specs/bot_state_transitions.yaml
 *
 * テスト方針:
 *   - BotRepository, BotPostRepository, AttackRepository はすべてモック化する
 *   - 各メソッドの振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（撃破済み・既攻撃・存在しない等）を網羅する
 */

import { describe, expect, it, vi } from "vitest";
import type { Bot } from "../../../lib/domain/models/bot";
import type { Attack } from "../../../lib/infrastructure/repositories/attack-repository";
import {
	BotService,
	type CreatePostFn,
	type IAttackRepository,
	type IBotPostRepository,
	type IBotRepository,
	type IPendingTutorialRepository,
	type IThreadRepository,
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

/** テスト用 Bot（revealed状態）を生成する */
function createRevealedBot(overrides: Partial<Bot> = {}): Bot {
	return createLurkingBot({
		isRevealed: true,
		revealedAt: new Date("2026-03-16T10:00:00Z"),
		...overrides,
	});
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
		bulkUpdateDailyIds: vi.fn().mockResolvedValue(undefined),
		bulkIncrementSurvivalDays: vi.fn().mockResolvedValue(undefined),
		bulkResetRevealed: vi.fn().mockResolvedValue(0),
		bulkReviveEliminated: vi.fn().mockResolvedValue([]),
		// See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
		deleteEliminatedTutorialBots: vi.fn().mockResolvedValue(0),
		incrementSurvivalDays: vi.fn().mockResolvedValue(undefined),
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

/**
 * モック PendingTutorialRepository を生成する
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 */
function createMockPendingTutorialRepository(
	pendingList: Array<{
		id: string;
		userId: string;
		threadId: string;
		triggerPostNumber: number;
		createdAt: Date;
	}> = [],
): IPendingTutorialRepository {
	return {
		findAll: vi.fn().mockResolvedValue(pendingList),
		deletePendingTutorial: vi.fn().mockResolvedValue(undefined),
	};
}

/** モック BotPostRepository を生成する */
function createMockBotPostRepository(
	record: { postId: string; botId: string } | null = null,
): IBotPostRepository {
	return {
		findByPostId: vi.fn().mockResolvedValue(record),
		findByPostIds: vi.fn().mockResolvedValue(record ? [record] : []),
		create: vi.fn().mockResolvedValue(undefined),
	};
}

/**
 * モック IThreadRepository を生成する
 * @param threads - findByBoardId の返値となるスレッドリスト
 */
function createMockThreadRepository(
	threads: { id: string }[] = [],
): IThreadRepository {
	return {
		findByBoardId: vi.fn().mockResolvedValue(threads),
	};
}

/**
 * モック CreatePostFn を生成する
 * @param result - createPostFn が返す結果（デフォルトは成功）
 */
function createMockCreatePostFn(
	result: Awaited<ReturnType<CreatePostFn>> = {
		success: true,
		postId: "post-001",
		postNumber: 1,
		systemMessages: [],
	},
): CreatePostFn {
	return vi.fn().mockResolvedValue(result) as unknown as CreatePostFn;
}

/** モック AttackRepository を生成する */
function createMockAttackRepository(
	existingAttack: Attack | null = null,
): IAttackRepository {
	return {
		findByAttackerAndBotAndDate: vi.fn().mockResolvedValue(existingAttack),
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

/** テスト用 BotService を生成するヘルパー */
function createService(
	options: {
		bot?: Bot | null;
		botPostRecord?: { postId: string; botId: string } | null;
		existingAttack?: Attack | null;
		allBots?: Bot[];
	} = {},
): BotService {
	const botRepo = createMockBotRepository(
		"bot" in options ? (options.bot ?? null) : createLurkingBot(),
	);
	if (options.allBots !== undefined) {
		(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(
			options.allBots,
		);
	}
	const botPostRepo = createMockBotPostRepository(
		options.botPostRecord ?? null,
	);
	const attackRepo = createMockAttackRepository(options.existingAttack ?? null);
	return new BotService(botRepo, botPostRepo, attackRepo);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("BotService", () => {
	// =========================================================================
	// isBot
	// =========================================================================

	describe("isBot()", () => {
		it("bot_posts にレコードが存在する場合、true を返す", async () => {
			// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
			const service = createService({
				botPostRecord: { postId: "post-001", botId: "bot-001" },
			});
			const result = await service.isBot("post-001");
			expect(result).toBe(true);
		});

		it("bot_posts にレコードが存在しない場合、false を返す", async () => {
			const service = createService({ botPostRecord: null });
			const result = await service.isBot("post-001");
			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// getBotByPostId
	// =========================================================================

	describe("getBotByPostId()", () => {
		it("bot_posts レコードが存在しない場合、null を返す", async () => {
			const service = createService({ botPostRecord: null });
			const result = await service.getBotByPostId("post-001");
			expect(result).toBeNull();
		});

		it("bot_posts レコードが存在し Bot が見つかった場合、BotInfo を返す", async () => {
			// See: docs/architecture/components/bot.md §2.4 ボットID逆引き
			const bot = createLurkingBot({ id: "bot-001", name: "荒らし役", hp: 10 });
			const botRepo = createMockBotRepository(bot);
			const botPostRepo = createMockBotPostRepository({
				postId: "post-001",
				botId: "bot-001",
			});
			const attackRepo = createMockAttackRepository();
			const service = new BotService(botRepo, botPostRepo, attackRepo);

			const result = await service.getBotByPostId("post-001");

			expect(result).not.toBeNull();
			expect(result?.botId).toBe("bot-001");
			expect(result?.name).toBe("荒らし役");
			expect(result?.hp).toBe(10);
			expect(result?.isActive).toBe(true);
			expect(result?.isRevealed).toBe(false);
		});

		it("bot_posts レコードは存在するが Bot が見つからない場合、null を返す", async () => {
			const botRepo = createMockBotRepository(null);
			const botPostRepo = createMockBotPostRepository({
				postId: "post-001",
				botId: "bot-999",
			});
			const attackRepo = createMockAttackRepository();
			const service = new BotService(botRepo, botPostRepo, attackRepo);

			const result = await service.getBotByPostId("post-001");
			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// revealBot
	// =========================================================================

	describe("revealBot()", () => {
		it("lurking 状態のボットに BOTマークを付与する", async () => {
			// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
			const bot = createLurkingBot({ id: "bot-001" });
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.revealBot("bot-001");

			expect(botRepo.reveal).toHaveBeenCalledWith("bot-001");
		});

		it("already revealed の場合は reveal を呼び出さない（冪等）", async () => {
			// See: docs/architecture/components/bot.md §2.6 BOTマーク付与 > 冪等
			const bot = createRevealedBot({ id: "bot-001" });
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.revealBot("bot-001");

			expect(botRepo.reveal).not.toHaveBeenCalled();
		});

		it("ボットが見つからない場合はエラーをスローする", async () => {
			const botRepo = createMockBotRepository(null);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await expect(service.revealBot("bot-999")).rejects.toThrow();
		});
	});

	// =========================================================================
	// canAttackToday
	// =========================================================================

	describe("canAttackToday()", () => {
		it("本日まだ攻撃していない場合、true を返す", async () => {
			// See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
			const service = createService({ existingAttack: null });
			const result = await service.canAttackToday("attacker-001", "bot-001");
			expect(result).toBe(true);
		});

		it("本日既に攻撃済みの場合、false を返す", async () => {
			const existingAttack: Attack = {
				id: "attack-001",
				attackerId: "attacker-001",
				botId: "bot-001",
				attackDate: "2026-03-16",
				postId: "post-001",
				damage: 10,
				createdAt: new Date(),
			};
			const service = createService({ existingAttack });
			const result = await service.canAttackToday("attacker-001", "bot-001");
			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// recordAttack
	// =========================================================================

	describe("recordAttack()", () => {
		it("攻撃記録を AttackRepository に保存する", async () => {
			// See: docs/architecture/components/bot.md §2.9 攻撃記録
			const attackRepo = createMockAttackRepository();
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				attackRepo,
			);

			await service.recordAttack("attacker-001", "bot-001", "post-001", 10);

			expect(attackRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					attackerId: "attacker-001",
					botId: "bot-001",
					postId: "post-001",
					damage: 10,
				}),
			);
		});

		it("attackDate が YYYY-MM-DD 形式で記録される", async () => {
			// See: docs/architecture/components/bot.md §5.2 attacks テーブル
			const attackRepo = createMockAttackRepository();
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				attackRepo,
			);

			await service.recordAttack("attacker-001", "bot-001", "post-001", 10);

			const callArg = (attackRepo.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			// YYYY-MM-DD 形式かどうかを確認
			expect(callArg.attackDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	// =========================================================================
	// applyDamage
	// =========================================================================

	describe("applyDamage()", () => {
		it("HPが十分な場合、HP を damage 分減少させ eliminated=false を返す", async () => {
			// See: docs/architecture/components/bot.md §2.2 HP更新・ダメージ処理
			const bot = createRevealedBot({
				id: "bot-001",
				hp: 20,
				maxHp: 20,
				timesAttacked: 0,
			});
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.applyDamage("bot-001", 10, "attacker-001");

			expect(result.previousHp).toBe(20);
			expect(result.remainingHp).toBe(10);
			expect(result.eliminated).toBe(false);
			expect(result.eliminatedBy).toBeNull();
			expect(result.reward).toBeNull();
		});

		it("ダメージ後 HP が 0 になった場合、eliminated=true を返す", async () => {
			// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
			const bot = createRevealedBot({
				id: "bot-001",
				hp: 10,
				maxHp: 10,
				survivalDays: 5,
				timesAttacked: 0,
				botProfileKey: "荒らし役",
			});
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.applyDamage("bot-001", 10, "attacker-001");

			expect(result.previousHp).toBe(10);
			expect(result.remainingHp).toBe(0);
			expect(result.eliminated).toBe(true);
			expect(result.eliminatedBy).toBe("attacker-001");
			expect(result.reward).not.toBeNull();
		});

		it("撃破時に報酬が正しく計算される（5日生存・被攻撃1回 -> 265）", async () => {
			// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
			// 計算: 10 + (5 * 50) + (1 * 5) = 265 (注: timesAttacked は incrementTimesAttacked 後の値)
			const bot = createRevealedBot({
				id: "bot-001",
				hp: 10,
				maxHp: 10,
				survivalDays: 5,
				timesAttacked: 0, // increment 後に 1 になる
				botProfileKey: "荒らし役",
			});
			const botRepo = createMockBotRepository(bot);
			// incrementTimesAttacked はモックのため実際には更新されないが、
			// applyDamage 内で timesAttacked + 1 を計算に使う
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.applyDamage("bot-001", 10, "attacker-001");

			// timesAttacked: 0 -> +1 = 1 として計算
			// reward: 10 + (5 * 50) + (1 * 5) = 265
			expect(result.reward).toBe(265);
		});

		it("撃破時に eliminate が呼ばれる", async () => {
			const bot = createRevealedBot({ id: "bot-001", hp: 10 });
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.applyDamage("bot-001", 10, "attacker-001");

			expect(botRepo.eliminate).toHaveBeenCalledWith("bot-001", "attacker-001");
		});

		it("times_attacked が incrementTimesAttacked により +1 される", async () => {
			const bot = createRevealedBot({
				id: "bot-001",
				hp: 20,
				timesAttacked: 3,
			});
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.applyDamage("bot-001", 10, "attacker-001");

			expect(botRepo.incrementTimesAttacked).toHaveBeenCalledWith("bot-001");
		});

		it("ボットが存在しない場合はエラーをスローする", async () => {
			const botRepo = createMockBotRepository(null);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await expect(
				service.applyDamage("bot-999", 10, "attacker-001"),
			).rejects.toThrow();
		});

		it("HP が 0 ちょうどで撃破になる（境界値）", async () => {
			const bot = createRevealedBot({ id: "bot-001", hp: 10 });
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.applyDamage("bot-001", 10, "attacker-001");

			expect(result.remainingHp).toBe(0);
			expect(result.eliminated).toBe(true);
		});

		it("ダメージが HP を超えても eliminated になる（オーバーキル）", async () => {
			const bot = createRevealedBot({ id: "bot-001", hp: 5 });
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.applyDamage("bot-001", 10, "attacker-001");

			expect(result.remainingHp).toBeLessThanOrEqual(0);
			expect(result.eliminated).toBe(true);
		});
	});

	// =========================================================================
	// calculateEliminationReward（公開メソッド版）
	// =========================================================================

	describe("calculateEliminationReward()", () => {
		it("bot_profiles.yaml のパラメータを使用して報酬を計算する", async () => {
			// See: docs/architecture/components/bot.md §2.7 撃破報酬計算
			// 荒らし役: base=10, daily=50, attack=5
			// 0日生存・1回攻撃: 10 + (0*50) + (1*5) = 15
			const bot = createLurkingBot({
				id: "bot-001",
				survivalDays: 0,
				timesAttacked: 1,
				botProfileKey: "荒らし役",
			});
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const reward = await service.calculateEliminationReward("bot-001");

			expect(reward).toBe(15);
		});

		it("botProfileKey が null の場合でもデフォルトパラメータで計算される", async () => {
			const bot = createLurkingBot({
				id: "bot-001",
				survivalDays: 0,
				timesAttacked: 0,
				botProfileKey: null,
			});
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const reward = await service.calculateEliminationReward("bot-001");

			// デフォルト: base=10, daily=50, attack=5 → 10 + 0 + 0 = 10
			expect(reward).toBe(10);
		});
	});

	// =========================================================================
	// getNextPostDelay
	// =========================================================================

	describe("getNextPostDelay()", () => {
		it("返値が 60 以上 120 以下の整数である", () => {
			// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
			const service = createService();
			const delay = service.getNextPostDelay();
			expect(delay).toBeGreaterThanOrEqual(60);
			expect(delay).toBeLessThanOrEqual(120);
			expect(Number.isInteger(delay)).toBe(true);
		});

		it("100回呼び出しても常に 60〜120 の範囲内である（境界値）", () => {
			// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
			const service = createService();
			for (let i = 0; i < 100; i++) {
				const delay = service.getNextPostDelay();
				expect(delay).toBeGreaterThanOrEqual(60);
				expect(delay).toBeLessThanOrEqual(120);
			}
		});

		it("複数回呼び出した場合、必ずしも同じ値ではない（ランダム性の確認）", () => {
			// 確率論的テスト: 100回中すべて同じ値になる確率は約 (1/61)^99 ≒ 0 なので実質安全
			const service = createService();
			const values = new Set<number>();
			for (let i = 0; i < 100; i++) {
				values.add(service.getNextPostDelay());
			}
			// 61種類の値のうち少なくとも2種類は出現するはず
			expect(values.size).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// selectTargetThread
	// =========================================================================

	describe("selectTargetThread()", () => {
		it("スレッド一覧の中からいずれかの threadId を返す（正常系）", async () => {
			// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
			const threads = [
				{ id: "thread-001" },
				{ id: "thread-002" },
				{ id: "thread-003" },
			];
			const threadRepo = createMockThreadRepository(threads);
			const botRepo = createMockBotRepository();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				threadRepo,
			);

			const result = await service.selectTargetThread("bot-001");

			expect(threads.map((t) => t.id)).toContain(result);
		});

		it("50件のスレッドから1件が選択される（BDDシナリオD対応）", async () => {
			// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
			const threads = Array.from({ length: 50 }, (_, i) => ({
				id: `thread-${String(i + 1).padStart(3, "0")}`,
			}));
			const threadRepo = createMockThreadRepository(threads);
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				threadRepo,
			);

			const result = await service.selectTargetThread("bot-001");

			expect(threads.map((t) => t.id)).toContain(result);
		});

		it("スレッドが0件の場合はエラーをスローする（異常系）", async () => {
			// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
			const threadRepo = createMockThreadRepository([]);
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				threadRepo,
			);

			await expect(service.selectTargetThread("bot-001")).rejects.toThrow();
		});

		it("threadRepository が未注入の場合はエラーをスローする", async () => {
			// threadRepository を渡さない場合
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await expect(service.selectTargetThread("bot-001")).rejects.toThrow(
				"threadRepository が未注入です",
			);
		});

		it("ボットが見つからない場合でもスレッド選択を継続する（HIGH-003: ファクトリ共通化）", async () => {
			// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
			// See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
			// Phase 2 では resolveStrategies の Bot 引数は未使用のため、
			// Bot が見つからない場合は createBotForStrategyResolution でフォールバックして処理を継続する。
			// ハードコード値を1箇所に集約することで保守性を確保する（HIGH-003 対応）。
			const botRepo = createMockBotRepository(null);
			const threads = [{ id: "thread-001" }, { id: "thread-002" }];
			const threadRepo = createMockThreadRepository(threads);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				threadRepo,
			);

			// エラーをスローせず、スレッドのいずれかが選択されること
			const result = await service.selectTargetThread("bot-nonexistent");
			expect(threads.map((t) => t.id)).toContain(result);
		});

		it("100回呼び出した場合、複数の異なるスレッドが選択される（ランダム性）", async () => {
			// 確率論的テスト: 10件のスレッドから100回選んでも毎回同じ確率は (1/10)^99 ≒ 0
			const threads = Array.from({ length: 10 }, (_, i) => ({
				id: `thread-${i + 1}`,
			}));
			const threadRepo = createMockThreadRepository(threads);
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				threadRepo,
			);

			const selected = new Set<string>();
			for (let i = 0; i < 100; i++) {
				selected.add(await service.selectTargetThread("bot-001"));
			}
			expect(selected.size).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// executeBotPost
	// =========================================================================

	describe("executeBotPost()", () => {
		it("固定文リストの本文で PostService が呼び出される（正常系）", async () => {
			// See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
			// See: docs/architecture/components/bot.md §2.1 書き込み実行
			const bot = createLurkingBot({
				id: "bot-001",
				botProfileKey: "荒らし役",
				dailyId: "FkBot01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(bot);
			const mockCreatePost = createMockCreatePostFn();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				mockCreatePost,
			);

			const result = await service.executeBotPost("bot-001", "thread-001");

			// null チェック: executeBotPost は null を返す可能性があるため型ガードを追加
			if (!result) throw new Error("result should not be null");
			expect(result.postId).toBe("post-001");
			expect(result.postNumber).toBe(1);
			expect(typeof result.dailyId).toBe("string");
			expect(mockCreatePost).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-001",
					isBotWrite: true,
					edgeToken: null,
				}),
			);
		});

		it("書き込み本文が荒らし役の固定文リストに含まれる", async () => {
			// See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
			const trollFixedMessages = [
				"なんJほんま覇権やな",
				"効いてて草",
				"貧乳なのにめちゃくちゃエロい",
				"【朗報】ワイ、参上",
				"ンゴンゴ",
				"草不可避",
				"せやな",
				"はえ〜すっごい",
				"それな",
				"ぐう畜",
				"まあ正直そうだよな",
				"どういうことだよ（困惑）",
				"ファ！？",
				"ンゴ...",
				"うーんこの",
			];
			const bot = createLurkingBot({
				id: "bot-001",
				botProfileKey: "荒らし役",
				dailyId: "FkBot01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(bot);
			const mockCreatePost = createMockCreatePostFn();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				mockCreatePost,
			);

			await service.executeBotPost("bot-001", "thread-001");

			const callArg = (mockCreatePost as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(trollFixedMessages).toContain(callArg.body);
		});

		it("PostService 成功後に botPostRepository.create が呼ばれる", async () => {
			// See: docs/architecture/components/bot.md §6.1 bot_posts INSERTのタイミングと失敗時の扱い
			const bot = createLurkingBot({
				id: "bot-001",
				botProfileKey: "荒らし役",
				dailyId: "FkBot01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(bot);
			const botPostRepo = createMockBotPostRepository();
			const service = new BotService(
				botRepo,
				botPostRepo,
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createMockCreatePostFn(),
			);

			await service.executeBotPost("bot-001", "thread-001");

			expect(botPostRepo.create).toHaveBeenCalledWith("post-001", "bot-001");
		});

		it("PostService が失敗した場合はエラーをスローする（異常系）", async () => {
			// See: docs/architecture/components/bot.md §2.1 書き込み実行
			const bot = createLurkingBot({
				id: "bot-001",
				botProfileKey: "荒らし役",
				dailyId: "FkBot01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(bot);
			const failingCreatePost = createMockCreatePostFn({
				success: false,
				error: "スレッドが見つかりません",
				code: "THREAD_NOT_FOUND",
			});
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				failingCreatePost,
			);

			await expect(
				service.executeBotPost("bot-001", "thread-001"),
			).rejects.toThrow("PostService.createPost が失敗しました");
		});

		it("createPostFn が未注入の場合はエラーをスローする", async () => {
			// createPostFn を渡さない場合
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await expect(
				service.executeBotPost("bot-001", "thread-001"),
			).rejects.toThrow("createPostFn が未注入です");
		});

		it("ボットが存在しない場合はエラーをスローする", async () => {
			const botRepo = createMockBotRepository(null);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createMockCreatePostFn(),
			);

			await expect(
				service.executeBotPost("bot-999", "thread-001"),
			).rejects.toThrow();
		});

		it("PostService 成功後に botRepository.incrementTotalPosts が1回呼ばれる", async () => {
			// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
			// See: tmp/workers/bdd-architect_ANALYSIS-TOTAL-POSTS/analysis.md §4.3
			const bot = createLurkingBot({
				id: "bot-001",
				botProfileKey: "荒らし役",
				dailyId: "FkBot01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(bot);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createMockCreatePostFn(),
			);

			await service.executeBotPost("bot-001", "thread-001");

			expect(botRepo.incrementTotalPosts).toHaveBeenCalledTimes(1);
			expect(botRepo.incrementTotalPosts).toHaveBeenCalledWith("bot-001");
		});

		it("botPostRepository.create が失敗した場合は incrementTotalPosts が呼ばれない", async () => {
			// See: tmp/workers/bdd-architect_ANALYSIS-TOTAL-POSTS/analysis.md §4.3
			// bot_posts INSERT 失敗時はボット投稿として認識しないため total_posts をカウントしない
			const bot = createLurkingBot({
				id: "bot-001",
				botProfileKey: "荒らし役",
				dailyId: "FkBot01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(bot);
			const failingBotPostRepo: IBotPostRepository = {
				findByPostId: vi.fn().mockResolvedValue(null),
				findByPostIds: vi.fn().mockResolvedValue([]),
				create: vi.fn().mockRejectedValue(new Error("DB接続エラー")),
			};
			const service = new BotService(
				botRepo,
				failingBotPostRepo,
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createMockCreatePostFn(),
			);

			// bot_posts INSERT 失敗はエラーを再スローしない（エラーログのみ）
			await service.executeBotPost("bot-001", "thread-001");

			expect(botRepo.incrementTotalPosts).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// performDailyReset
	// =========================================================================

	describe("performDailyReset()", () => {
		it("日次リセット結果（revealed解除数・復活数・ID再生成数）を返す", async () => {
			// See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
			// See: docs/architecture/components/bot.md §2.10 日次リセット処理
			const allBots = [
				createLurkingBot({ id: "bot-001" }),
				createRevealedBot({ id: "bot-002" }),
				createEliminatedBot({ id: "bot-003" }),
			];
			// インカーネーションモデル: 復活後は新 UUID を持つ新世代 Bot を返す
			const revivedBot = createLurkingBot({ id: "bot-003-new" });
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(allBots);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				1,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([revivedBot]);
			const attackRepo = createMockAttackRepository();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				attackRepo,
			);

			const result = await service.performDailyReset();

			expect(result.botsRevealed).toBe(1);
			expect(result.botsRevived).toBe(1);
			expect(typeof result.idsRegenerated).toBe("number");
		});

		it("日次リセット後に attacks テーブルのクリーンアップが実行される", async () => {
			// See: docs/architecture/components/bot.md §2.10 step 5
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				0,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([]);
			const attackRepo = createMockAttackRepository();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				attackRepo,
			);

			await service.performDailyReset();

			expect(attackRepo.deleteByDateBefore).toHaveBeenCalled();
		});

		it("lurking/revealed 状態のボットの survival_days が +1 される（バッチ処理）", async () => {
			// See: docs/specs/bot_state_transitions.yaml #daily_reset
			// TASK-355: 個別 incrementSurvivalDays ではなく bulkIncrementSurvivalDays を使用
			const bots = [
				createLurkingBot({ id: "bot-001" }),
				createRevealedBot({ id: "bot-002" }),
			];
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(bots);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				1,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([]);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// bulkIncrementSurvivalDays が呼ばれること（is_active=true をDB側で絞り込む）
			expect(botRepo.bulkIncrementSurvivalDays).toHaveBeenCalledTimes(1);
		});

		it("eliminated 状態のボットの survival_days はバッチ処理で除外される", async () => {
			// TASK-355: bulkIncrementSurvivalDays は is_active=true のBOTのみを対象とする。
			// eliminated のBOTが含まれる場合でも、bulk操作は呼ばれるが
			// DB側のWHERE条件で is_active=true のみ更新される。
			const bots = [createEliminatedBot({ id: "bot-003" })];
			const revivedBot = createLurkingBot({ id: "bot-003-new" });
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(bots);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				0,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([revivedBot]);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// bulkIncrementSurvivalDays が呼ばれることを確認（DB側でis_active=trueフィルタ）
			expect(botRepo.bulkIncrementSurvivalDays).toHaveBeenCalledTimes(1);
			// 個別の incrementSurvivalDays は呼ばれないこと
			expect(botRepo.incrementSurvivalDays).not.toHaveBeenCalled();
		});

		it("Step 1: bulkUpdateDailyIds がBOT数分のエントリで呼ばれる（個別 updateDailyId は呼ばれない）", async () => {
			// TASK-355: 逐次ループをバッチ操作に置き換え
			// See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
			const allBots = [
				createLurkingBot({ id: "bot-001" }),
				createRevealedBot({ id: "bot-002" }),
				createEliminatedBot({ id: "bot-003" }),
			];
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(allBots);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				0,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([]);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// bulkUpdateDailyIds がBOT数分のエントリで1回呼ばれること
			expect(botRepo.bulkUpdateDailyIds).toHaveBeenCalledTimes(1);
			const [entries, dailyIdDate] = (
				botRepo.bulkUpdateDailyIds as ReturnType<typeof vi.fn>
			).mock.calls[0];
			expect(entries).toHaveLength(3);
			expect(typeof dailyIdDate).toBe("string");
			// 各エントリが正しいbotIdと8文字の偽装IDを持つこと
			for (const entry of entries) {
				expect(typeof entry.botId).toBe("string");
				expect(typeof entry.dailyId).toBe("string");
				expect(entry.dailyId).toHaveLength(8);
			}
			// 個別の updateDailyId は呼ばれないこと
			expect(botRepo.updateDailyId).not.toHaveBeenCalled();
		});

		it("Step 3: bulkIncrementSurvivalDays が1回呼ばれる（個別 incrementSurvivalDays は呼ばれない）", async () => {
			// TASK-355: 逐次ループをバッチ操作に置き換え
			// See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる
			const bots = [
				createLurkingBot({ id: "bot-001" }),
				createRevealedBot({ id: "bot-002" }),
				createEliminatedBot({ id: "bot-003" }),
			];
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(bots);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				1,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([]);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			// bulkIncrementSurvivalDays が1回呼ばれること
			expect(botRepo.bulkIncrementSurvivalDays).toHaveBeenCalledTimes(1);
			// 個別の incrementSurvivalDays は呼ばれないこと
			expect(botRepo.incrementSurvivalDays).not.toHaveBeenCalled();
		});

		it("BOTが0件の場合も bulkUpdateDailyIds が空配列で安全に呼ばれる", async () => {
			// TASK-355: エッジケース（空配列）
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				0,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([]);
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			await service.performDailyReset();

			expect(botRepo.bulkUpdateDailyIds).toHaveBeenCalledTimes(1);
			const [entries] = (botRepo.bulkUpdateDailyIds as ReturnType<typeof vi.fn>)
				.mock.calls[0];
			expect(entries).toHaveLength(0);
		});

		it("日次リセット後に撃破済みチュートリアルBOTのクリーンアップが実行される", async () => {
			// See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
			// See: tmp/workers/bdd-architect_TASK-236/design.md §3.8
			const botRepo = createMockBotRepository();
			(botRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(botRepo.bulkResetRevealed as ReturnType<typeof vi.fn>).mockResolvedValue(
				0,
			);
			(
				botRepo.bulkReviveEliminated as ReturnType<typeof vi.fn>
			).mockResolvedValue([]);
			const attackRepo = createMockAttackRepository();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				attackRepo,
			);

			await service.performDailyReset();

			// deleteEliminatedTutorialBots が呼ばれていることを確認
			expect(botRepo.deleteEliminatedTutorialBots).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// processPendingTutorials
	// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
	// =========================================================================

	describe("processPendingTutorials()", () => {
		it("pending が0件の場合は何もせず processed:0 を返す", async () => {
			// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
			const pendingRepo = createMockPendingTutorialRepository([]);
			const botRepo = createMockBotRepository();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				createMockCreatePostFn(),
				undefined,
				pendingRepo,
			);

			const result = await service.processPendingTutorials();

			expect(result.processed).toBe(0);
			expect(result.results).toEqual([]);
			// BOT生成もpending削除も呼ばれない
			expect(botRepo.create).not.toHaveBeenCalled();
			expect(pendingRepo.deletePendingTutorial).not.toHaveBeenCalled();
		});

		it("pending が1件の場合: BOT生成 → executeBotPost → pending削除の一連フローが実行される", async () => {
			// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
			// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
			const pendingList = [
				{
					id: "pending-001",
					userId: "user-001",
					threadId: "thread-001",
					triggerPostNumber: 5,
					createdAt: new Date("2026-03-21T10:00:00Z"),
				},
			];
			const pendingRepo = createMockPendingTutorialRepository(pendingList);
			const tutorialBot = createLurkingBot({
				id: "tutorial-bot-001",
				botProfileKey: "tutorial",
				hp: 10,
				maxHp: 10,
				dailyId: "TutBt01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(tutorialBot);
			(botRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
				tutorialBot,
			);
			const mockCreatePost = createMockCreatePostFn();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				mockCreatePost,
				undefined,
				pendingRepo,
			);

			const result = await service.processPendingTutorials();

			// BOT生成が呼ばれている
			expect(botRepo.create).toHaveBeenCalledTimes(1);
			expect(botRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					botProfileKey: "tutorial",
					hp: 10,
					maxHp: 10,
					isActive: true,
					nextPostAt: null, // 使い切りBOT: cron に拾われないよう null (LL-013)
				}),
			);
			// pending削除が executeBotPost の直後に呼ばれている（updateNextPostAt より前）
			expect(pendingRepo.deletePendingTutorial).toHaveBeenCalledWith(
				"pending-001",
			);
			// 投稿後に nextPostAt が null にリセットされている（executeBotPost Step 9 の上書き対策）
			expect(botRepo.updateNextPostAt).toHaveBeenCalledWith(
				"tutorial-bot-001",
				null,
			);
			// 結果が正しい
			expect(result.processed).toBe(1);
			expect(result.results).toHaveLength(1);
			expect(result.results[0].pendingId).toBe("pending-001");
			expect(result.results[0].success).toBe(true);
		});

		it("pending が複数件の場合、全件が順次処理される", async () => {
			const pendingList = [
				{
					id: "pending-001",
					userId: "user-001",
					threadId: "thread-001",
					triggerPostNumber: 3,
					createdAt: new Date("2026-03-21T10:00:00Z"),
				},
				{
					id: "pending-002",
					userId: "user-002",
					threadId: "thread-002",
					triggerPostNumber: 7,
					createdAt: new Date("2026-03-21T10:01:00Z"),
				},
			];
			const pendingRepo = createMockPendingTutorialRepository(pendingList);
			const tutorialBot = createLurkingBot({
				id: "tutorial-bot-001",
				botProfileKey: "tutorial",
				dailyId: "TutBt01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(tutorialBot);
			(botRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
				tutorialBot,
			);
			const mockCreatePost = createMockCreatePostFn();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				mockCreatePost,
				undefined,
				pendingRepo,
			);

			const result = await service.processPendingTutorials();

			expect(botRepo.create).toHaveBeenCalledTimes(2);
			expect(pendingRepo.deletePendingTutorial).toHaveBeenCalledTimes(2);
			expect(result.processed).toBe(2);
			expect(result.results).toHaveLength(2);
		});

		it("executeBotPost がエラーをスローした場合、そのpendingは失敗として記録されるが他のpendingは処理を続行する", async () => {
			// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
			const pendingList = [
				{
					id: "pending-fail",
					userId: "user-fail",
					threadId: "thread-fail",
					triggerPostNumber: 1,
					createdAt: new Date("2026-03-21T10:00:00Z"),
				},
				{
					id: "pending-ok",
					userId: "user-ok",
					threadId: "thread-ok",
					triggerPostNumber: 2,
					createdAt: new Date("2026-03-21T10:01:00Z"),
				},
			];
			const pendingRepo = createMockPendingTutorialRepository(pendingList);
			const tutorialBot = createLurkingBot({
				id: "tutorial-bot-001",
				botProfileKey: "tutorial",
				dailyId: "TutBt01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(tutorialBot);
			(botRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
				tutorialBot,
			);
			// 1回目の createPost は失敗、2回目は成功
			const mockCreatePost = vi
				.fn()
				.mockRejectedValueOnce(new Error("PostService 失敗"))
				.mockResolvedValueOnce({
					success: true,
					postId: "post-002",
					postNumber: 2,
					systemMessages: [],
				}) as unknown as CreatePostFn;

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
				mockCreatePost,
				undefined,
				pendingRepo,
			);

			const result = await service.processPendingTutorials();

			expect(result.processed).toBe(2);
			expect(result.results[0].success).toBe(false);
			expect(result.results[0].error).toContain("PostService 失敗");
			expect(result.results[1].success).toBe(true);
			// 失敗したpendingは削除されない（リトライ可能にするため）
			expect(pendingRepo.deletePendingTutorial).toHaveBeenCalledTimes(1);
			expect(pendingRepo.deletePendingTutorial).toHaveBeenCalledWith(
				"pending-ok",
			);

			consoleSpy.mockRestore();
		});

		it("updateNextPostAt がエラーをスローしても pending は削除済みのため重複スポーンしない", async () => {
			// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
			// バグ修正確認: pending削除を updateNextPostAt より先に行うことで重複スポーンを防止する
			const pendingList = [
				{
					id: "pending-001",
					userId: "user-001",
					threadId: "thread-001",
					triggerPostNumber: 5,
					createdAt: new Date("2026-03-21T10:00:00Z"),
				},
			];
			const pendingRepo = createMockPendingTutorialRepository(pendingList);
			const tutorialBot = createLurkingBot({
				id: "tutorial-bot-001",
				botProfileKey: "tutorial",
				hp: 10,
				maxHp: 10,
				dailyId: "TutBt01",
				dailyIdDate: new Date(Date.now() + 9 * 3600000)
					.toISOString()
					.slice(0, 10),
			});
			const botRepo = createMockBotRepository(tutorialBot);
			(botRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
				tutorialBot,
			);
			// updateNextPostAt がエラーをスロー
			(botRepo.updateNextPostAt as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB接続エラー"),
			);

			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const mockCreatePost = createMockCreatePostFn();
			const service = new BotService(
				botRepo,
				createMockBotPostRepository(),
				createMockAttackRepository(),
				undefined,
				createMockThreadRepository(),
				mockCreatePost,
				undefined,
				pendingRepo,
			);

			const result = await service.processPendingTutorials();

			// updateNextPostAt でエラーが発生しているため処理は失敗
			expect(result.results[0].success).toBe(false);
			// しかし pending は削除されている（executeBotPost の後に削除したため）
			// → 次回 cron 実行時に同じ pending で再度 BOT がスポーンしない
			expect(pendingRepo.deletePendingTutorial).toHaveBeenCalledWith(
				"pending-001",
			);

			consoleSpy.mockRestore();
		});

		it("pendingTutorialRepository 未注入時は何もせず processed:0 を返す", async () => {
			// pendingTutorialRepository が省略された場合
			const service = new BotService(
				createMockBotRepository(),
				createMockBotPostRepository(),
				createMockAttackRepository(),
			);

			const result = await service.processPendingTutorials();

			expect(result.processed).toBe(0);
			expect(result.results).toEqual([]);
		});
	});
});
