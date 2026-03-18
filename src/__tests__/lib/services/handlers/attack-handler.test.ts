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
});
