/**
 * 単体テスト: AttackHandler（!attack コマンドハンドラ）
 *
 * See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
 * See: docs/architecture/components/attack.md §3 処理フロー
 *
 * テスト方針:
 *   - BotService, CurrencyService, PostRepository はすべてモック化する
 *   - フローB（対象がBOT）・フローC（対象が人間）・エラーケースを網羅する
 *   - D-08 attack.md §6.2: 全エラーケースでコストは消費されない
 */

import { describe, expect, it, vi } from "vitest";
import type { DeductResult } from "../../../../lib/domain/models/currency";
import type { Post } from "../../../../lib/domain/models/post";
import type {
	BotInfo,
	DamageResult,
} from "../../../../lib/services/bot-service";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	AttackHandler,
	type IAttackBotService,
	type IAttackCurrencyService,
	type IAttackPostRepository,
} from "../../../../lib/services/handlers/attack-handler";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** デフォルト攻撃コスト */
const DEFAULT_COST = 5;
/** デフォルトダメージ */
const DEFAULT_DAMAGE = 10;
/** 賠償金倍率 */
const COMPENSATION_MULTIPLIER = 3;

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 CommandContext を生成する */
function createCtx(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		args: [">>5"],
		postId: "post-attacker-001",
		threadId: "thread-001",
		userId: "attacker-user-001",
		dailyId: "Gz4nP7Xk",
		...overrides,
	};
}

/** テスト用の通常レス（人間の書き込み）を生成する */
function createHumanPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-target-001",
		threadId: "thread-001",
		postNumber: 5,
		authorId: "target-user-001",
		displayName: "名無しさん",
		dailyId: "TgtDly01",
		body: "テスト書き込み",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-16T12:00:00Z"),
		...overrides,
	};
}

/** テスト用のシステムメッセージを生成する */
function createSystemPost(): Post {
	return createHumanPost({
		id: "post-system-001",
		authorId: null,
		isSystemMessage: true,
		displayName: "★システム",
	});
}

/** テスト用 BotInfo を生成する */
function createBotInfo(overrides: Partial<BotInfo> = {}): BotInfo {
	return {
		botId: "bot-001",
		name: "荒らし役",
		hp: 10,
		maxHp: 10,
		isActive: true,
		isRevealed: false,
		survivalDays: 0,
		totalPosts: 5,
		accusedCount: 0,
		timesAttacked: 0,
		...overrides,
	};
}

/** テスト用 DamageResult（撃破なし）を生成する */
function createDamageResultNotEliminated(
	overrides: Partial<DamageResult> = {},
): DamageResult {
	return {
		previousHp: 20,
		remainingHp: 10,
		eliminated: false,
		eliminatedBy: null,
		reward: null,
		...overrides,
	};
}

/** テスト用 DamageResult（撃破）を生成する */
function createDamageResultEliminated(
	overrides: Partial<DamageResult> = {},
): DamageResult {
	return {
		previousHp: 10,
		remainingHp: 0,
		eliminated: true,
		eliminatedBy: "attacker-user-001",
		reward: 265,
		...overrides,
	};
}

/** モック BotService を生成する */
function createMockBotService(
	options: {
		isBot?: boolean;
		botInfo?: BotInfo | null;
		canAttack?: boolean;
		damageResult?: DamageResult;
	} = {},
): IAttackBotService {
	return {
		isBot: vi.fn().mockResolvedValue(options.isBot ?? false),
		getBotByPostId: vi.fn().mockResolvedValue(options.botInfo ?? null),
		revealBot: vi.fn().mockResolvedValue(undefined),
		applyDamage: vi
			.fn()
			.mockResolvedValue(
				options.damageResult ?? createDamageResultNotEliminated(),
			),
		canAttackToday: vi.fn().mockResolvedValue(options.canAttack ?? true),
		recordAttack: vi.fn().mockResolvedValue(undefined),
		// ラストボットボーナス判定（デフォルト: 発火しない）
		// See: features/command_livingbot.feature @ラストボットボーナス
		checkLastBotBonus: vi.fn().mockResolvedValue({ triggered: false }),
	};
}

/** モック CurrencyService を生成する */
function createMockCurrencyService(balance = 100): IAttackCurrencyService {
	return {
		getBalance: vi.fn().mockResolvedValue(balance),
		debit: vi
			.fn()
			.mockResolvedValue({ success: true, newBalance: balance - DEFAULT_COST }),
		credit: vi.fn().mockResolvedValue(undefined),
	};
}

/** モック PostRepository を生成する */
function createMockPostRepository(
	post: Post | null = createHumanPost(),
): IAttackPostRepository {
	return {
		findById: vi.fn().mockResolvedValue(post),
		findByThreadIdAndPostNumber: vi.fn().mockResolvedValue(post),
	};
}

/** テスト用 AttackHandler を生成する */
function createHandler(
	options: {
		isBot?: boolean;
		botInfo?: BotInfo | null;
		canAttack?: boolean;
		damageResult?: DamageResult;
		post?: Post | null;
		balance?: number;
		cost?: number;
		damage?: number;
		compensationMultiplier?: number;
	} = {},
): AttackHandler {
	const botService = createMockBotService({
		isBot: options.isBot ?? false,
		botInfo: options.botInfo ?? (options.isBot ? createBotInfo() : null),
		canAttack: options.canAttack ?? true,
		damageResult: options.damageResult ?? createDamageResultNotEliminated(),
	});
	const currencyService = createMockCurrencyService(options.balance ?? 100);
	const postRepository = createMockPostRepository(
		"post" in options ? (options.post ?? null) : createHumanPost(),
	);
	return new AttackHandler(
		botService,
		currencyService,
		postRepository,
		options.cost ?? DEFAULT_COST,
		options.damage ?? DEFAULT_DAMAGE,
		options.compensationMultiplier ?? COMPENSATION_MULTIPLIER,
	);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AttackHandler", () => {
	// =========================================================================
	// commandName
	// =========================================================================

	it("commandName が 'attack' である", () => {
		const handler = createHandler();
		expect(handler.commandName).toBe("attack");
	});

	// =========================================================================
	// エラーケース: 引数なし
	// =========================================================================

	describe("引数なし", () => {
		it("引数がない場合、エラーメッセージを返す", async () => {
			const handler = createHandler();
			const result = await handler.execute(createCtx({ args: [] }));
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("使い方");
		});
	});

	// =========================================================================
	// エラーケース: 対象レスが存在しない
	// See: features/bot_system.feature @存在しないレスへの攻撃はエラーになる
	// =========================================================================

	describe("対象レスが存在しない", () => {
		it("対象レスが存在しない場合、success=false でエラーメッセージを返す", async () => {
			const handler = createHandler({ post: null });
			const result = await handler.execute(createCtx({ args: [">>999"] }));
			expect(result.success).toBe(false);
			expect(result.systemMessage).toBeTruthy();
		});

		it("対象レスが存在しない場合、BotService.isBot は呼ばれない", async () => {
			const botService = createMockBotService();
			const handler = new AttackHandler(
				botService,
				createMockCurrencyService(),
				createMockPostRepository(null),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx({ args: [">>999"] }));
			expect(botService.isBot).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// エラーケース: 自己攻撃
	// See: features/bot_system.feature @自分の書き込みに対して攻撃を試みると拒否される
	// =========================================================================

	describe("自己攻撃", () => {
		it("自分の書き込みへの攻撃は拒否される", async () => {
			const post = createHumanPost({ authorId: "attacker-user-001" });
			const handler = createHandler({ post });
			const result = await handler.execute(
				createCtx({ userId: "attacker-user-001" }),
			);
			expect(result.success).toBe(false);
		});
	});

	// =========================================================================
	// エラーケース: システムメッセージへの攻撃
	// See: features/bot_system.feature @システムメッセージに対して攻撃を試みると拒否される
	// =========================================================================

	describe("システムメッセージへの攻撃", () => {
		it("システムメッセージへの攻撃は拒否される", async () => {
			const handler = createHandler({ post: createSystemPost() });
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(false);
		});
	});

	// =========================================================================
	// フローB: 対象がBOTの場合
	// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
	// =========================================================================

	describe("フローB: 対象がBOT", () => {
		it("BOT攻撃成功時、success=true を返す", async () => {
			// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
			const handler = createHandler({
				isBot: true,
				botInfo: createBotInfo({ isActive: true, isRevealed: true }),
				damageResult: createDamageResultNotEliminated({
					previousHp: 10,
					remainingHp: 0,
					eliminated: false,
				}),
			});
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(true);
		});

		it("BOT攻撃成功時、システムメッセージにHP変化が含まれる", async () => {
			// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
			// "⚔ 名無しさん(ID:Ax8kP2) → 🤖荒らし役 に攻撃！ HP:10→0"
			const handler = createHandler({
				isBot: true,
				botInfo: createBotInfo({
					isActive: true,
					isRevealed: true,
					hp: 10,
					name: "荒らし役",
				}),
				damageResult: createDamageResultNotEliminated({
					previousHp: 10,
					remainingHp: 0,
				}),
			});
			const result = await handler.execute(createCtx());
			expect(result.systemMessage).toContain("HP:");
			expect(result.systemMessage).toContain("荒らし役");
		});

		it("撃破済みボットへの攻撃は拒否される（コスト消費なし）", async () => {
			// See: features/bot_system.feature @撃破済みボットへの攻撃は拒否される
			const handler = createHandler({
				isBot: true,
				botInfo: createBotInfo({ isActive: false, hp: 0 }),
			});
			const currencyService = handler[
				"currencyService"
			] as IAttackCurrencyService;
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("撃破");
			expect(currencyService.debit).not.toHaveBeenCalled();
		});

		it("同日2回目の攻撃は拒否される（コスト消費なし）", async () => {
			// See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
			const handler = createHandler({
				isBot: true,
				botInfo: createBotInfo({ isActive: true }),
				canAttack: false,
			});
			const currencyService = handler[
				"currencyService"
			] as IAttackCurrencyService;
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("1日1回");
			expect(currencyService.debit).not.toHaveBeenCalled();
		});

		it("lurking状態のBOT攻撃時にrevealBotが呼ばれる（不意打ち）", async () => {
			// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
			// See: docs/architecture/components/bot.md §6.6 不意打ち攻撃時の遷移連鎖
			const botService = createMockBotService({
				isBot: true,
				botInfo: createBotInfo({ isActive: true, isRevealed: false }),
				canAttack: true,
				damageResult: createDamageResultEliminated(),
			});
			const handler = new AttackHandler(
				botService,
				createMockCurrencyService(100),
				createMockPostRepository(),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx());
			expect(botService.revealBot).toHaveBeenCalledWith("bot-001");
		});

		it("revealed状態のBOT攻撃時はrevealBotが呼ばれない", async () => {
			// See: docs/architecture/components/attack.md §3.3 フローB B5
			const botService = createMockBotService({
				isBot: true,
				botInfo: createBotInfo({ isActive: true, isRevealed: true }),
				canAttack: true,
				damageResult: createDamageResultNotEliminated(),
			});
			const handler = new AttackHandler(
				botService,
				createMockCurrencyService(100),
				createMockPostRepository(),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx());
			expect(botService.revealBot).not.toHaveBeenCalled();
		});

		it("BOT撃破時に eliminationNotice が設定される", async () => {
			// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
			// See: docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md 案A
			// systemMessage はインライン表示（HP変化）のみ。
			// eliminationNotice に★システム名義の独立レス本文が設定される。
			const handler = createHandler({
				isBot: true,
				botInfo: createBotInfo({
					isActive: true,
					isRevealed: true,
					name: "荒らし役",
					survivalDays: 5,
					accusedCount: 3,
					totalPosts: 42,
				}),
				damageResult: createDamageResultEliminated({ reward: 265 }),
			});
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(true);
			// systemMessage はインライン表示（HP変化）のみを含む
			expect(result.systemMessage).toContain("HP:");
			expect(result.systemMessage).not.toContain("撃破されました");
			// eliminationNotice に撃破通知が設定されることを確認する
			expect(result.eliminationNotice).toBeTruthy();
			expect(result.eliminationNotice).toContain("撃破");
			expect(result.eliminationNotice).toContain("+265");
			expect(result.eliminationNotice).toContain("荒らし役");
		});

		it("BOT攻撃成功時にrecordAttackが呼ばれる", async () => {
			// See: docs/architecture/components/attack.md §3.3 フローB B7
			const botService = createMockBotService({
				isBot: true,
				botInfo: createBotInfo({ isActive: true, isRevealed: true }),
				canAttack: true,
				damageResult: createDamageResultNotEliminated(),
			});
			const handler = new AttackHandler(
				botService,
				createMockCurrencyService(100),
				createMockPostRepository(),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx());
			expect(botService.recordAttack).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// フローC: 対象が人間の場合
	// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
	// =========================================================================

	describe("フローC: 対象が人間", () => {
		it("人間攻撃時、攻撃コスト(5)が消費される", async () => {
			// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
			const currencyService = createMockCurrencyService(100);
			const handler = new AttackHandler(
				createMockBotService({ isBot: false }),
				currencyService,
				createMockPostRepository(
					createHumanPost({ authorId: "target-user-001" }),
				),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx({ userId: "attacker-user-001" }));
			// debit は 2 回呼ばれる（コスト消費 + 賠償金）
			expect(currencyService.debit).toHaveBeenCalledWith(
				"attacker-user-001",
				DEFAULT_COST,
				"command_attack",
			);
		});

		it("人間攻撃時、賠償金(15)が攻撃者から差し引かれる", async () => {
			// 攻撃コスト消費後の残高 = 95
			// 賠償金 = min(15, 95) = 15
			const currencyService = createMockCurrencyService(100);
			(currencyService.debit as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({ success: true, newBalance: 95 }) // コスト消費
				.mockResolvedValueOnce({ success: true, newBalance: 80 }); // 賠償金
			(
				currencyService.getBalance as ReturnType<typeof vi.fn>
			).mockResolvedValue(95);

			const handler = new AttackHandler(
				createMockBotService({ isBot: false }),
				currencyService,
				createMockPostRepository(
					createHumanPost({ authorId: "target-user-001" }),
				),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx({ userId: "attacker-user-001" }));
			// 2回目の debit が賠償金（15）であることを確認
			expect(currencyService.debit).toHaveBeenNthCalledWith(
				2,
				"attacker-user-001",
				15,
				expect.any(String),
			);
		});

		it("人間攻撃時、賠償金が被攻撃者に支払われる", async () => {
			// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
			const currencyService = createMockCurrencyService(100);
			(currencyService.debit as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({ success: true, newBalance: 95 })
				.mockResolvedValueOnce({ success: true, newBalance: 80 });
			(
				currencyService.getBalance as ReturnType<typeof vi.fn>
			).mockResolvedValue(95);

			const handler = new AttackHandler(
				createMockBotService({ isBot: false }),
				currencyService,
				createMockPostRepository(
					createHumanPost({ authorId: "target-user-001" }),
				),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx({ userId: "attacker-user-001" }));
			expect(currencyService.credit).toHaveBeenCalledWith(
				"target-user-001",
				15,
				expect.any(String),
			);
		});

		it("残高不足時は全額支払い（残高 8 の場合: コスト5消費後 3 を賠償金として支払い）", async () => {
			// See: features/bot_system.feature @人間への攻撃時に賠償金の残高が不足している場合は全額支払い
			// 攻撃者残高: 8 → コスト5消費 → 残高3 → 賠償金として3全額支払い
			const currencyService = createMockCurrencyService(8);
			(currencyService.debit as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({ success: true, newBalance: 3 }) // コスト消費
				.mockResolvedValueOnce({ success: true, newBalance: 0 }); // 全額賠償
			(
				currencyService.getBalance as ReturnType<typeof vi.fn>
			).mockResolvedValue(3);

			const handler = new AttackHandler(
				createMockBotService({ isBot: false }),
				currencyService,
				createMockPostRepository(
					createHumanPost({ authorId: "target-user-001" }),
				),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx({ userId: "attacker-user-001" }));
			// 賠償金 = min(15, 3) = 3
			expect(currencyService.debit).toHaveBeenNthCalledWith(
				2,
				"attacker-user-001",
				3,
				expect.any(String),
			);
			expect(currencyService.credit).toHaveBeenCalledWith(
				"target-user-001",
				3,
				expect.any(String),
			);
		});

		it("残高不足時の全額支払い時、特殊メッセージが含まれる", async () => {
			// See: features/bot_system.feature @人間への攻撃時に賠償金の残高が不足している場合は全額支払い
			const currencyService = createMockCurrencyService(8);
			(currencyService.debit as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({ success: true, newBalance: 3 })
				.mockResolvedValueOnce({ success: true, newBalance: 0 });
			(
				currencyService.getBalance as ReturnType<typeof vi.fn>
			).mockResolvedValue(3);

			const handler = new AttackHandler(
				createMockBotService({ isBot: false }),
				currencyService,
				createMockPostRepository(
					createHumanPost({ authorId: "target-user-001" }),
				),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			const result = await handler.execute(
				createCtx({ userId: "attacker-user-001" }),
			);
			expect(result.systemMessage).toContain("チッ、これで勘弁してやるよ");
		});

		it("人間攻撃時、authorIdがnullのレスはエラーになる（システムメッセージ同等扱い）", async () => {
			// See: docs/architecture/components/attack.md §6.5 システムメッセージへの攻撃
			const post = createHumanPost({ authorId: null, isSystemMessage: false });
			const handler = createHandler({ post });
			// authorId=null かつ isSystemMessage=false のレスは human でも bot でもない
			// -> システムメッセージと同様に拒否する
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(false);
		});
	});

	// =========================================================================
	// コスト消費タイミングの検証
	// See: docs/architecture/components/attack.md §6.2 エラーケースでのコスト不消費
	// =========================================================================

	describe("コスト消費タイミング", () => {
		it("存在しないレスへの攻撃ではdebitが呼ばれない", async () => {
			const currencyService = createMockCurrencyService(100);
			const handler = new AttackHandler(
				createMockBotService(),
				currencyService,
				createMockPostRepository(null),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx({ args: [">>999"] }));
			expect(currencyService.debit).not.toHaveBeenCalled();
		});

		it("撃破済みボットへの攻撃ではdebitが呼ばれない", async () => {
			const currencyService = createMockCurrencyService(100);
			const botService = createMockBotService({
				isBot: true,
				botInfo: createBotInfo({ isActive: false }),
			});
			const handler = new AttackHandler(
				botService,
				currencyService,
				createMockPostRepository(),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx());
			expect(currencyService.debit).not.toHaveBeenCalled();
		});

		it("同日2回目の攻撃ではdebitが呼ばれない", async () => {
			const currencyService = createMockCurrencyService(100);
			const botService = createMockBotService({
				isBot: true,
				botInfo: createBotInfo({ isActive: true }),
				canAttack: false,
			});
			const handler = new AttackHandler(
				botService,
				currencyService,
				createMockPostRepository(),
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);
			await handler.execute(createCtx());
			expect(currencyService.debit).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 複数ターゲット攻撃（>>N-M 形式）
	// See: features/bot_system.feature @複数ターゲット攻撃
	// =========================================================================

	describe("複数ターゲット攻撃", () => {
		/**
		 * マルチターゲット用の AttackHandler を生成する。
		 * findByThreadIdAndPostNumber のモックを柔軟に設定可能。
		 */
		function createMultiTargetHandler(options: {
			postsByNumber: Map<number, Post | null>;
			isBotByPostId: Map<string, boolean>;
			botInfoByPostId?: Map<string, BotInfo>;
			canAttackByBotId?: Map<string, boolean>;
			damageResultByBotId?: Map<string, DamageResult>;
			balance?: number;
		}) {
			const balance = options.balance ?? 100;
			let currentBalance = balance;

			const botService: IAttackBotService = {
				isBot: vi.fn().mockImplementation((postId: string) => {
					return Promise.resolve(options.isBotByPostId.get(postId) ?? false);
				}),
				getBotByPostId: vi.fn().mockImplementation((postId: string) => {
					return Promise.resolve(options.botInfoByPostId?.get(postId) ?? null);
				}),
				revealBot: vi.fn().mockResolvedValue(undefined),
				applyDamage: vi.fn().mockImplementation((botId: string) => {
					const result =
						options.damageResultByBotId?.get(botId) ??
						createDamageResultEliminated();
					return Promise.resolve(result);
				}),
				canAttackToday: vi
					.fn()
					.mockImplementation((_attackerId: string, botId: string) => {
						return Promise.resolve(
							options.canAttackByBotId?.get(botId) ?? true,
						);
					}),
				recordAttack: vi.fn().mockResolvedValue(undefined),
				checkLastBotBonus: vi.fn().mockResolvedValue({ triggered: false }),
			};

			const currencyService: IAttackCurrencyService = {
				getBalance: vi.fn().mockImplementation(() => {
					return Promise.resolve(currentBalance);
				}),
				debit: vi
					.fn()
					.mockImplementation(
						(_userId: string, amount: number): Promise<DeductResult> => {
							if (currentBalance < amount) {
								return Promise.resolve({
									success: false as const,
									reason: "insufficient_balance" as const,
								});
							}
							currentBalance -= amount;
							return Promise.resolve({
								success: true,
								newBalance: currentBalance,
							});
						},
					),
				credit: vi.fn().mockResolvedValue(undefined),
			};

			const postRepository: IAttackPostRepository = {
				findById: vi.fn().mockResolvedValue(null),
				findByThreadIdAndPostNumber: vi
					.fn()
					.mockImplementation((_threadId: string, postNumber: number) => {
						return Promise.resolve(
							options.postsByNumber.get(postNumber) ?? null,
						);
					}),
			};

			const handler = new AttackHandler(
				botService,
				currencyService,
				postRepository,
				DEFAULT_COST,
				DEFAULT_DAMAGE,
				COMPENSATION_MULTIPLIER,
			);

			return {
				handler,
				botService,
				currencyService,
				postRepository,
				getBalance: () => currentBalance,
			};
		}

		it("範囲指定で複数のボットを順番に攻撃する", async () => {
			// See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
			const botPostA = createHumanPost({
				id: "post-a",
				postNumber: 10,
				authorId: "bot-author-a",
			});
			const botPostB = createHumanPost({
				id: "post-b",
				postNumber: 11,
				authorId: "bot-author-b",
			});

			const { handler, botService, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, botPostA],
					[11, botPostB],
				]),
				isBotByPostId: new Map([
					["post-a", true],
					["post-b", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-a",
						createBotInfo({
							botId: "bot-a",
							name: "荒らし役A",
							hp: 10,
							isActive: true,
						}),
					],
					[
						"post-b",
						createBotInfo({
							botId: "bot-b",
							name: "荒らし役B",
							hp: 10,
							isActive: true,
						}),
					],
				]),
				damageResultByBotId: new Map([
					[
						"bot-a",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
					[
						"bot-b",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
				]),
				balance: 100,
			});

			const result = await handler.execute(createCtx({ args: [">>10-11"] }));

			expect(result.success).toBe(true);
			expect(result.systemMessage).toContain("連続攻撃");
			expect(result.systemMessage).toContain(">>10:");
			expect(result.systemMessage).toContain(">>11:");
			expect(result.systemMessage).toContain("荒らし役A");
			expect(result.systemMessage).toContain("荒らし役B");
			// コスト: 2 × 5 = 10
			expect(getBalance()).toBe(100 - 10);
			expect(botService.applyDamage).toHaveBeenCalledTimes(2);
		});

		it("コイン不足のため全体が失敗する", async () => {
			// See: features/bot_system.feature @範囲指定でコイン不足のため全体が失敗する
			const botPost = createHumanPost({
				id: "post-a",
				postNumber: 10,
				authorId: "bot-author-a",
			});

			const { handler, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, botPost],
					[11, botPost],
					[12, botPost],
					[13, botPost],
				]),
				isBotByPostId: new Map([["post-a", true]]),
				botInfoByPostId: new Map([
					[
						"post-a",
						createBotInfo({
							botId: "bot-a",
							isActive: true,
						}),
					],
				]),
				balance: 15, // 必要: 4 × 5 = 20（※同一ボット重複で有効1件→5で足りるはずだが...）
			});

			// 同一ボットの重複で有効1件のみ → コスト5は足りる
			// 別ボットで4件とも有効にするテストに修正
			const botPostA = createHumanPost({
				id: "post-a",
				postNumber: 10,
			});
			const botPostB = createHumanPost({
				id: "post-b",
				postNumber: 11,
			});
			const botPostC = createHumanPost({
				id: "post-c",
				postNumber: 12,
			});
			const botPostD = createHumanPost({
				id: "post-d",
				postNumber: 13,
			});

			const { handler: h2, getBalance: gb2 } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, botPostA],
					[11, botPostB],
					[12, botPostC],
					[13, botPostD],
				]),
				isBotByPostId: new Map([
					["post-a", true],
					["post-b", true],
					["post-c", true],
					["post-d", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-a",
						createBotInfo({
							botId: "bot-a",
							isActive: true,
						}),
					],
					[
						"post-b",
						createBotInfo({
							botId: "bot-b",
							isActive: true,
						}),
					],
					[
						"post-c",
						createBotInfo({
							botId: "bot-c",
							isActive: true,
						}),
					],
					[
						"post-d",
						createBotInfo({
							botId: "bot-d",
							isActive: true,
						}),
					],
				]),
				balance: 15, // 必要: 4 × 5 = 20
			});

			const result = await h2.execute(createCtx({ args: [">>10-13"] }));

			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("通貨が不足しています");
			expect(gb2()).toBe(15); // 消費なし
		});

		it("範囲内に無効なターゲットがある場合はスキップして続行する", async () => {
			// See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
			const botPost10 = createHumanPost({
				id: "post-10",
				postNumber: 10,
			});
			const systemPost = createHumanPost({
				id: "post-12",
				postNumber: 12,
				isSystemMessage: true,
				authorId: null,
			});
			const botPost13 = createHumanPost({
				id: "post-13",
				postNumber: 13,
			});

			const { handler, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, botPost10],
					[11, null], // 存在しない
					[12, systemPost], // システムメッセージ
					[13, botPost13],
				]),
				isBotByPostId: new Map([
					["post-10", true],
					["post-13", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-10",
						createBotInfo({
							botId: "bot-10",
							isActive: true,
						}),
					],
					[
						"post-13",
						createBotInfo({
							botId: "bot-13",
							isActive: true,
						}),
					],
				]),
				damageResultByBotId: new Map([
					[
						"bot-10",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
					[
						"bot-13",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
				]),
				balance: 100,
			});

			const result = await handler.execute(createCtx({ args: [">>10-13"] }));

			expect(result.success).toBe(true);
			expect(result.systemMessage).toContain(">>11:");
			expect(result.systemMessage).toContain("スキップ");
			expect(result.systemMessage).toContain(">>12:");
			expect(result.systemMessage).toContain("スキップ");
			// 有効2件 × 5 = 10
			expect(getBalance()).toBe(100 - 10);
		});

		it("範囲内の全ターゲットが無効の場合はエラーになる", async () => {
			// See: features/bot_system.feature @範囲内の全ターゲットが無効の場合はエラーになる
			const { handler } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, null],
					[11, null],
					[12, null],
				]),
				isBotByPostId: new Map(),
				balance: 100,
			});

			const result = await handler.execute(createCtx({ args: [">>10-12"] }));

			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("攻撃対象がありません");
		});

		it("賠償金で途中で残高不足になると残りの攻撃が中断される", async () => {
			// See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
			const botPost10 = createHumanPost({
				id: "post-10",
				postNumber: 10,
			});
			const humanPost11 = createHumanPost({
				id: "post-11",
				postNumber: 11,
				authorId: "human-target",
			});
			const botPost12 = createHumanPost({
				id: "post-12",
				postNumber: 12,
			});

			const { handler, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, botPost10],
					[11, humanPost11],
					[12, botPost12],
				]),
				isBotByPostId: new Map([
					["post-10", true],
					["post-11", false],
					["post-12", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-10",
						createBotInfo({
							botId: "bot-10",
							isActive: true,
						}),
					],
					[
						"post-12",
						createBotInfo({
							botId: "bot-12",
							isActive: true,
						}),
					],
				]),
				damageResultByBotId: new Map([
					[
						"bot-10",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
				]),
				balance: 25, // >>10: -5, >>11: -5-15(compensation)=0, >>12: 中断
			});

			const result = await handler.execute(createCtx({ args: [">>10-12"] }));

			expect(result.success).toBe(true);
			expect(result.systemMessage).toContain(">>10:");
			expect(result.systemMessage).toContain(">>11:");
			expect(result.systemMessage).toContain(">>12:");
			expect(result.systemMessage).toContain("中断");
			expect(getBalance()).toBe(0);
		});

		it("範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる", async () => {
			// See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
			const botPost10 = createHumanPost({
				id: "post-10",
				postNumber: 10,
			});
			const humanPost11 = createHumanPost({
				id: "post-11",
				postNumber: 11,
				authorId: "human-target",
			});
			const botPost12 = createHumanPost({
				id: "post-12",
				postNumber: 12,
			}); // 同じボット

			const { handler, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[10, botPost10],
					[11, humanPost11],
					[12, botPost12],
				]),
				isBotByPostId: new Map([
					["post-10", true],
					["post-11", false],
					["post-12", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-10",
						createBotInfo({
							botId: "same-bot",
							name: "荒らし役",
							isActive: true,
						}),
					],
					[
						"post-12",
						createBotInfo({
							botId: "same-bot",
							name: "荒らし役",
							isActive: true,
						}),
					],
				]),
				damageResultByBotId: new Map([
					[
						"same-bot",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
				]),
				balance: 100,
			});

			const result = await handler.execute(createCtx({ args: [">>10-12"] }));

			expect(result.success).toBe(true);
			expect(result.systemMessage).toContain(">>12:");
			expect(result.systemMessage).toContain("スキップ");
			// 有効2件（BOT1 + 人間1）: コスト 10 + 賠償金 15 = 25
			expect(getBalance()).toBe(100 - 25);
		});

		it("範囲上限（10ターゲット）を超えるとエラーになる", async () => {
			// See: features/bot_system.feature @範囲上限（10ターゲット）を超えるとエラーになる
			const handler = createHandler();
			const result = await handler.execute(createCtx({ args: [">>1-20"] }));

			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("最大10");
		});

		it("カンマ区切りで飛び地のボットを攻撃する", async () => {
			// See: features/bot_system.feature @カンマ区切りで飛び地のボットを攻撃する
			const botPost4 = createHumanPost({
				id: "post-4",
				postNumber: 4,
			});
			const botPost6 = createHumanPost({
				id: "post-6",
				postNumber: 6,
			});

			const { handler, botService, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[4, botPost4],
					[6, botPost6],
				]),
				isBotByPostId: new Map([
					["post-4", true],
					["post-6", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-4",
						createBotInfo({
							botId: "bot-a",
							name: "荒らし役A",
							isActive: true,
						}),
					],
					[
						"post-6",
						createBotInfo({
							botId: "bot-b",
							name: "荒らし役B",
							isActive: true,
						}),
					],
				]),
				damageResultByBotId: new Map([
					[
						"bot-a",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
					[
						"bot-b",
						createDamageResultEliminated({
							previousHp: 10,
							remainingHp: 0,
							reward: 15,
						}),
					],
				]),
				balance: 100,
			});

			const result = await handler.execute(createCtx({ args: [">>4,6"] }));

			expect(result.success).toBe(true);
			expect(result.systemMessage).toContain("連続攻撃");
			expect(result.systemMessage).toContain(">>4:");
			expect(result.systemMessage).toContain(">>6:");
			expect(result.systemMessage).toContain("荒らし役A");
			expect(result.systemMessage).toContain("荒らし役B");
			// レス5は含まれない（飛び地）
			expect(result.systemMessage).not.toContain(">>5:");
			// コスト: 2 × 5 = 10
			expect(getBalance()).toBe(100 - 10);
			expect(botService.applyDamage).toHaveBeenCalledTimes(2);
		});

		it("カンマ区切りと連続範囲の混合で攻撃する", async () => {
			// See: features/bot_system.feature @カンマ区切りと連続範囲の混合で複数ボットを攻撃する
			const botPost4 = createHumanPost({
				id: "post-4",
				postNumber: 4,
			});
			const botPost6 = createHumanPost({
				id: "post-6",
				postNumber: 6,
			});
			const botPost10 = createHumanPost({
				id: "post-10",
				postNumber: 10,
			});
			const botPost11 = createHumanPost({
				id: "post-11",
				postNumber: 11,
			});

			const { handler, getBalance } = createMultiTargetHandler({
				postsByNumber: new Map([
					[4, botPost4],
					[6, botPost6],
					[10, botPost10],
					[11, botPost11],
				]),
				isBotByPostId: new Map([
					["post-4", true],
					["post-6", true],
					["post-10", true],
					["post-11", true],
				]),
				botInfoByPostId: new Map([
					[
						"post-4",
						createBotInfo({
							botId: "bot-a",
							isActive: true,
						}),
					],
					[
						"post-6",
						createBotInfo({
							botId: "bot-b",
							isActive: true,
						}),
					],
					[
						"post-10",
						createBotInfo({
							botId: "bot-c",
							isActive: true,
						}),
					],
					[
						"post-11",
						createBotInfo({
							botId: "bot-d",
							isActive: true,
						}),
					],
				]),
				damageResultByBotId: new Map([
					["bot-a", createDamageResultEliminated({ reward: 15 })],
					["bot-b", createDamageResultEliminated({ reward: 15 })],
					["bot-c", createDamageResultEliminated({ reward: 15 })],
					["bot-d", createDamageResultEliminated({ reward: 15 })],
				]),
				balance: 100,
			});

			const result = await handler.execute(
				createCtx({ args: [">>4,6,10-11"] }),
			);

			expect(result.success).toBe(true);
			expect(result.systemMessage).toContain(">>4:");
			expect(result.systemMessage).toContain(">>6:");
			expect(result.systemMessage).toContain(">>10:");
			expect(result.systemMessage).toContain(">>11:");
			// 4件 × 5 = 20
			expect(getBalance()).toBe(100 - 20);
		});
	});
});
