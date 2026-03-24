/**
 * 単体テスト: AccusationService（AI告発サービス）
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 *
 * テスト方針:
 *   - PostRepository, BotPostRepository, AccusationRepository は全てモック化する
 *   - 各判定パス（hit/miss/重複/自分自身/システムメッセージ/存在しないレス）を網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - v4: ボーナス廃止。ICurrencyService 依存を削除。bonusAmount は常に 0。
 *
 * カバレッジ対象:
 *   - hit（AIボット確認）: bonusAmount=0 + システムメッセージ生成（ボーナスなし）
 *   - miss（人間確認）: bonusAmount=0 + システムメッセージ生成（冤罪ボーナスなし）
 *   - 重複告発: alreadyAccused=true を返す
 *   - 存在しないレス: エラーメッセージを返す
 *   - 自分自身の書き込みへの告発: エラーメッセージを返す
 *   - システムメッセージへの告発: エラーメッセージを返す
 */

import { describe, expect, it, vi } from "vitest";
import type { Post } from "../../../lib/domain/models/post";
import {
	type AccusationBonusConfig,
	type AccusationInput,
	AccusationService,
	type IAccusationBotRepository,
	type IAccusationRepository,
	type IBotPostRepository,
	type IPostRepository,
} from "../../../lib/services/accusation-service";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** テスト用告発設定（config/commands.yaml の tell コマンド設定に準拠） */
const TEST_BONUS_CONFIG: AccusationBonusConfig = {
	cost: 10,
};

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用の通常レス（人間の書き込み）を生成する */
function createHumanPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "target-post-001",
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

/** テスト用のボット書き込みレス（authorId=null）を生成する */
function createBotPost(overrides: Partial<Post> = {}): Post {
	return createHumanPost({
		authorId: null,
		displayName: "名無しさん",
		dailyId: "BotDly01",
		...overrides,
	});
}

/** テスト用のシステムメッセージレスを生成する */
function createSystemPost(overrides: Partial<Post> = {}): Post {
	return createHumanPost({
		authorId: null,
		displayName: "★システム",
		dailyId: "SYSTEM",
		isSystemMessage: true,
		body: "テストメッセージ",
		...overrides,
	});
}

/** モック PostRepository を生成する */
function createMockPostRepository(
	post: Post | null = createHumanPost(),
): IPostRepository {
	return {
		findById: vi.fn().mockResolvedValue(post),
	};
}

/** モック BotPostRepository を生成する（isBot判定） */
function createMockBotPostRepository(isBot: boolean): IBotPostRepository {
	return {
		findByPostId: vi
			.fn()
			.mockResolvedValue(
				isBot ? { postId: "target-post-001", botId: "bot-001" } : null,
			),
	};
}

/** モック AccusationRepository を生成する */
function createMockAccusationRepository(
	alreadyExists: boolean = false,
): IAccusationRepository {
	return {
		findByAccuserAndTarget: vi
			.fn()
			.mockResolvedValue(alreadyExists ? { id: "existing-accusation" } : null),
		create: vi.fn().mockResolvedValue({ id: "new-accusation-001" }),
	};
}

/** モック IAccusationBotRepository を生成する */
function createMockBotRepository(): IAccusationBotRepository {
	return {
		incrementAccusedCount: vi.fn().mockResolvedValue(undefined),
	};
}

/** デフォルトのAccusationInputを生成する */
function createAccusationInput(
	overrides: Partial<AccusationInput> = {},
): AccusationInput {
	return {
		accuserId: "accuser-user-001",
		targetPostId: "target-post-001",
		threadId: "thread-001",
		accuserDailyId: "AccDly01",
		...overrides,
	};
}

/** テスト用 AccusationService を生成するヘルパー */
function createService(options: {
	post?: Post | null;
	isBot?: boolean;
	alreadyExists?: boolean;
	bonusConfig?: AccusationBonusConfig;
	botRepository?: IAccusationBotRepository;
}): AccusationService {
	// post が明示的に null を渡された場合は null を使う（存在しないレスのテスト用）
	const post = "post" in options ? options.post! : createHumanPost();
	return new AccusationService(
		createMockPostRepository(post),
		createMockBotPostRepository(options.isBot ?? false),
		createMockAccusationRepository(options.alreadyExists ?? false),
		options.bonusConfig ?? TEST_BONUS_CONFIG,
		options.botRepository,
	);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AccusationService", () => {
	// =========================================================================
	// 正常系: hit（AIボット確認）
	// =========================================================================

	describe("hit（AIボット確認）", () => {
		it("対象がAIボットの場合、result='hit'を返す", async () => {
			// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
			const service = createService({
				post: createBotPost(),
				isBot: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.result).toBe("hit");
			expect(result.alreadyAccused).toBe(false);
		});

		it("hit時にbonusAmountが0である（v4ボーナス廃止）", async () => {
			// See: features/ai_accusation.feature @告発者に通貨報酬は付与されない
			const service = createService({
				post: createBotPost(),
				isBot: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.bonusAmount).toBe(0);
		});

		it("hit時のシステムメッセージにAI判定結果が含まれる", async () => {
			const service = createService({
				post: createBotPost(),
				isBot: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain("AIでした");
			expect(result.systemMessage).toContain("をAI告発");
		});

		it("hit時のシステムメッセージにボーナス付与行が含まれない", async () => {
			// See: features/ai_accusation.feature @告発者に通貨報酬は付与されない
			const service = createService({
				post: createBotPost(),
				isBot: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).not.toContain("通貨 +");
		});

		it("hit時にAccusationRepositoryにbonusAmount=0でrecordが保存される", async () => {
			const accusationRepo = createMockAccusationRepository();
			const service = new AccusationService(
				createMockPostRepository(createBotPost()),
				createMockBotPostRepository(true),
				accusationRepo,
				TEST_BONUS_CONFIG,
			);

			await service.accuse(createAccusationInput());

			expect(accusationRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					accuserId: "accuser-user-001",
					targetPostId: "target-post-001",
					threadId: "thread-001",
					result: "hit",
					bonusAmount: 0,
				}),
			);
		});

		it("告発成功時に botRepository.incrementAccusedCount が1回呼ばれる", async () => {
			// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
			// See: LL-010 派生カウンタは書き込み経路上の単体テストで保護する
			const botRepo = createMockBotRepository();
			const service = new AccusationService(
				createMockPostRepository(createBotPost()),
				createMockBotPostRepository(true),
				createMockAccusationRepository(),
				TEST_BONUS_CONFIG,
				botRepo,
			);

			await service.accuse(createAccusationInput());

			expect(botRepo.incrementAccusedCount).toHaveBeenCalledTimes(1);
			expect(botRepo.incrementAccusedCount).toHaveBeenCalledWith("bot-001");
		});
	});

	// =========================================================================
	// 正常系: miss（人間確認）
	// =========================================================================

	describe("miss（人間確認）", () => {
		it("対象が人間の場合、result='miss'を返す", async () => {
			// See: features/ai_accusation.feature @AI告発に失敗するとコストのみ消費される
			const service = createService({
				post: createHumanPost(),
				isBot: false,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.result).toBe("miss");
			expect(result.alreadyAccused).toBe(false);
		});

		it("miss時にbonusAmountが0である（v4ボーナス廃止）", async () => {
			// See: features/ai_accusation.feature @被告発者に通貨は付与されない
			const service = createService({
				post: createHumanPost(),
				isBot: false,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.bonusAmount).toBe(0);
		});

		it("miss時のシステムメッセージに人間判定結果が含まれる", async () => {
			const service = createService({
				post: createHumanPost(),
				isBot: false,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain("人間でした");
		});

		it("miss時のシステムメッセージに冤罪ボーナス関連文言が含まれない", async () => {
			// See: features/ai_accusation.feature @被告発者に通貨は付与されない
			const service = createService({
				post: createHumanPost(),
				isBot: false,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).not.toContain("冤罪ボーナス");
		});

		it("miss時にAccusationRepositoryにbonusAmount=0でrecordが保存される", async () => {
			const accusationRepo = createMockAccusationRepository();
			const service = new AccusationService(
				createMockPostRepository(createHumanPost()),
				createMockBotPostRepository(false),
				accusationRepo,
				TEST_BONUS_CONFIG,
			);

			await service.accuse(createAccusationInput());

			expect(accusationRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					result: "miss",
					bonusAmount: 0,
				}),
			);
		});

		it("告発失敗時（人間）は botRepository.incrementAccusedCount が呼ばれない", async () => {
			// See: LL-010 派生カウンタは書き込み経路上の単体テストで保護する
			// miss（人間だった場合）では accused_count をインクリメントしない
			const botRepo = createMockBotRepository();
			const service = new AccusationService(
				createMockPostRepository(createHumanPost()),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				TEST_BONUS_CONFIG,
				botRepo,
			);

			await service.accuse(createAccusationInput());

			expect(botRepo.incrementAccusedCount).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 重複告発
	// =========================================================================

	describe("重複告発", () => {
		it("同一ユーザーが同一レスに対して再度告発するとalreadyAccused=trueが返される", async () => {
			// See: features/ai_accusation.feature @同一ユーザーが同一レスに対して再度告発を試みると拒否される
			const service = createService({
				alreadyExists: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.alreadyAccused).toBe(true);
			expect(result.systemMessage).toContain("既に告発済み");
		});

		it("重複告発時はボーナスが0である", async () => {
			const service = createService({
				alreadyExists: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.bonusAmount).toBe(0);
		});

		it("重複告発時はAccusationRepository.createが呼ばれない", async () => {
			const accusationRepo = createMockAccusationRepository(true);
			const service = new AccusationService(
				createMockPostRepository(),
				createMockBotPostRepository(false),
				accusationRepo,
				TEST_BONUS_CONFIG,
			);

			await service.accuse(createAccusationInput());

			expect(accusationRepo.create).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 存在しないレス
	// =========================================================================

	describe("存在しないレス", () => {
		it("対象レスが存在しない場合はエラーメッセージを返す", async () => {
			// See: features/ai_accusation.feature @存在しないレスに対してAI告発を試みるとエラーになる
			const service = createService({
				post: null,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain("見つかりません");
			expect(result.bonusAmount).toBe(0);
			expect(result.alreadyAccused).toBe(false);
		});
	});

	// =========================================================================
	// 自分自身の書き込みへの告発
	// =========================================================================

	describe("自分自身の書き込みへの告発", () => {
		it("自分の書き込みに対して告発するとエラーメッセージを返す", async () => {
			// See: features/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
			const service = createService({
				post: createHumanPost({ authorId: "accuser-user-001" }),
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain(
				"自分の書き込みに対して告発することはできません",
			);
			expect(result.bonusAmount).toBe(0);
			expect(result.alreadyAccused).toBe(false);
		});
	});

	// =========================================================================
	// システムメッセージへの告発
	// =========================================================================

	describe("システムメッセージへの告発", () => {
		it("システムメッセージに対して告発するとエラーメッセージを返す", async () => {
			// See: features/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
			const service = createService({
				post: createSystemPost(),
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain(
				"システムメッセージに対して告発することはできません",
			);
			expect(result.bonusAmount).toBe(0);
			expect(result.alreadyAccused).toBe(false);
		});
	});

	// =========================================================================
	// 処理順序の検証
	// =========================================================================

	describe("処理順序", () => {
		it("重複チェックは対象レス存在チェックより先に実行される", async () => {
			// 重複がある場合、PostRepository.findById は呼ばれない
			const postRepo = createMockPostRepository(null);
			const service = new AccusationService(
				postRepo,
				createMockBotPostRepository(false),
				createMockAccusationRepository(true),
				TEST_BONUS_CONFIG,
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.alreadyAccused).toBe(true);
			expect(postRepo.findById).not.toHaveBeenCalled();
		});

		it("isBot判定はaccusation-rulesチェック後に実行される", async () => {
			// 自分自身への告発の場合、BotPostRepository は呼ばれない
			const myPost = createHumanPost({ authorId: "accuser-user-001" });
			const botPostRepo = createMockBotPostRepository(false);
			const service = new AccusationService(
				createMockPostRepository(myPost),
				botPostRepo,
				createMockAccusationRepository(),
				TEST_BONUS_CONFIG,
			);

			await service.accuse(createAccusationInput());

			expect(botPostRepo.findByPostId).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("ボットの書き込み（authorId=null）でもhit判定される", async () => {
			const service = createService({
				post: createBotPost(),
				isBot: true,
			});

			const result = await service.accuse(createAccusationInput());

			expect(result.result).toBe("hit");
		});

		it("miss時にtargetPost.authorIdがnullの場合もbonusAmount=0で正常に動作する", async () => {
			// authorId=null の非システムメッセージかつ非ボットという理論的ケース
			const service = createService({
				post: createHumanPost({ authorId: null, isSystemMessage: false }),
				isBot: false,
			});

			const result = await service.accuse(createAccusationInput());

			// miss で bonusAmount=0（v4: ボーナス廃止）
			expect(result.result).toBe("miss");
			expect(result.bonusAmount).toBe(0);
		});
	});
});
