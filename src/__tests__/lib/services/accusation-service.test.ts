/**
 * 単体テスト: AccusationService（AI告発サービス）
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 *
 * テスト方針:
 *   - PostRepository, BotPostRepository, AccusationRepository, CurrencyService は全てモック化する
 *   - 各判定パス（hit/miss/重複/自分自身/システムメッセージ/存在しないレス）を網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - hit（AIボット確認）: ボーナス付与 + システムメッセージ生成
 *   - miss（人間確認）: 冤罪ボーナス付与 + システムメッセージ生成
 *   - 重複告発: alreadyAccused=true を返す
 *   - 存在しないレス: エラーメッセージを返す
 *   - 自分自身の書き込みへの告発: エラーメッセージを返す
 *   - システムメッセージへの告発: エラーメッセージを返す
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../../../lib/domain/models/post";
import {
	ACCUSATION_HIT_BONUS,
	FALSE_ACCUSATION_BONUS,
} from "../../../lib/domain/rules/accusation-rules";
import {
	type AccusationInput,
	AccusationService,
	type IAccusationRepository,
	type IBotPostRepository,
	type ICurrencyService,
	type IPostRepository,
} from "../../../lib/services/accusation-service";

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
		body: "[システム] テストメッセージ",
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

/** モック CurrencyService を生成する */
function createMockCurrencyService(): ICurrencyService {
	return {
		credit: vi.fn().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AccusationService", () => {
	// =========================================================================
	// 正常系: hit（AIボット確認）
	// =========================================================================

	describe("hit（AIボット確認）", () => {
		it("対象がAIボットの場合、result='hit'を返す", async () => {
			// See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
			const botPost = createBotPost();
			const service = new AccusationService(
				createMockPostRepository(botPost),
				createMockBotPostRepository(true),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.result).toBe("hit");
			expect(result.alreadyAccused).toBe(false);
		});

		it("hit時に告発者にACCUSATION_HIT_BONUSが付与される", async () => {
			// See: features/phase2/ai_accusation.feature @告発成功ボーナスが告発者に付与される
			const botPost = createBotPost();
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(botPost),
				createMockBotPostRepository(true),
				createMockAccusationRepository(),
				currencyService,
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.bonusAmount).toBe(ACCUSATION_HIT_BONUS);
			expect(currencyService.credit).toHaveBeenCalledWith(
				"accuser-user-001",
				ACCUSATION_HIT_BONUS,
				"accusation_hit",
			);
		});

		it("hit時のシステムメッセージにAI判定結果が含まれる", async () => {
			const botPost = createBotPost();
			const service = new AccusationService(
				createMockPostRepository(botPost),
				createMockBotPostRepository(true),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain("AIでした");
			expect(result.systemMessage).toContain("[システム]");
		});

		it("hit時にAccusationRepositoryにrecordが保存される", async () => {
			const botPost = createBotPost();
			const accusationRepo = createMockAccusationRepository();
			const service = new AccusationService(
				createMockPostRepository(botPost),
				createMockBotPostRepository(true),
				accusationRepo,
				createMockCurrencyService(),
			);

			await service.accuse(createAccusationInput());

			expect(accusationRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					accuserId: "accuser-user-001",
					targetPostId: "target-post-001",
					threadId: "thread-001",
					result: "hit",
					bonusAmount: ACCUSATION_HIT_BONUS,
				}),
			);
		});
	});

	// =========================================================================
	// 正常系: miss（人間確認）
	// =========================================================================

	describe("miss（人間確認）", () => {
		it("対象が人間の場合、result='miss'を返す", async () => {
			// See: features/phase2/ai_accusation.feature @AI告発に失敗すると冤罪ボーナスが被告発者に付与される
			const humanPost = createHumanPost();
			const service = new AccusationService(
				createMockPostRepository(humanPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.result).toBe("miss");
			expect(result.alreadyAccused).toBe(false);
		});

		it("miss時に被告発者にFALSE_ACCUSATION_BONUSが付与される", async () => {
			// See: features/phase2/ai_accusation.feature @被告発者に冤罪ボーナスが付与される
			const humanPost = createHumanPost();
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(humanPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				currencyService,
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.bonusAmount).toBe(FALSE_ACCUSATION_BONUS);
			expect(currencyService.credit).toHaveBeenCalledWith(
				"target-user-001",
				FALSE_ACCUSATION_BONUS,
				"false_accusation_bonus",
			);
		});

		it("miss時のシステムメッセージに人間判定結果が含まれる", async () => {
			const humanPost = createHumanPost();
			const service = new AccusationService(
				createMockPostRepository(humanPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain("人間でした");
			expect(result.systemMessage).toContain("冤罪ボーナス");
		});

		it("miss時にAccusationRepositoryにrecordが保存される", async () => {
			const humanPost = createHumanPost();
			const accusationRepo = createMockAccusationRepository();
			const service = new AccusationService(
				createMockPostRepository(humanPost),
				createMockBotPostRepository(false),
				accusationRepo,
				createMockCurrencyService(),
			);

			await service.accuse(createAccusationInput());

			expect(accusationRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					result: "miss",
					bonusAmount: FALSE_ACCUSATION_BONUS,
				}),
			);
		});
	});

	// =========================================================================
	// 重複告発
	// =========================================================================

	describe("重複告発", () => {
		it("同一ユーザーが同一レスに対して再度告発するとalreadyAccused=trueが返される", async () => {
			// See: features/phase2/ai_accusation.feature @同一ユーザーが同一レスに対して再度告発を試みると拒否される
			const service = new AccusationService(
				createMockPostRepository(),
				createMockBotPostRepository(false),
				createMockAccusationRepository(true), // 既に告発済み
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.alreadyAccused).toBe(true);
			expect(result.systemMessage).toContain("既に告発済み");
		});

		it("重複告発時はボーナスが0である", async () => {
			const service = new AccusationService(
				createMockPostRepository(),
				createMockBotPostRepository(false),
				createMockAccusationRepository(true),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.bonusAmount).toBe(0);
		});

		it("重複告発時はCurrencyService.creditが呼ばれない", async () => {
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(),
				createMockBotPostRepository(false),
				createMockAccusationRepository(true),
				currencyService,
			);

			await service.accuse(createAccusationInput());

			expect(currencyService.credit).not.toHaveBeenCalled();
		});

		it("重複告発時はAccusationRepository.createが呼ばれない", async () => {
			const accusationRepo = createMockAccusationRepository(true);
			const service = new AccusationService(
				createMockPostRepository(),
				createMockBotPostRepository(false),
				accusationRepo,
				createMockCurrencyService(),
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
			// See: features/phase2/ai_accusation.feature @存在しないレスに対してAI告発を試みるとエラーになる
			const service = new AccusationService(
				createMockPostRepository(null), // レスが見つからない
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain("見つかりません");
			expect(result.bonusAmount).toBe(0);
			expect(result.alreadyAccused).toBe(false);
		});

		it("存在しないレスへの告発時はCurrencyService.creditが呼ばれない", async () => {
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(null),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				currencyService,
			);

			await service.accuse(createAccusationInput());

			expect(currencyService.credit).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 自分自身の書き込みへの告発
	// =========================================================================

	describe("自分自身の書き込みへの告発", () => {
		it("自分の書き込みに対して告発するとエラーメッセージを返す", async () => {
			// See: features/phase2/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
			const myPost = createHumanPost({ authorId: "accuser-user-001" });
			const service = new AccusationService(
				createMockPostRepository(myPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain(
				"自分の書き込みに対して告発することはできません",
			);
			expect(result.bonusAmount).toBe(0);
			expect(result.alreadyAccused).toBe(false);
		});

		it("自分自身への告発時はCurrencyService.creditが呼ばれない", async () => {
			const myPost = createHumanPost({ authorId: "accuser-user-001" });
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(myPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				currencyService,
			);

			await service.accuse(createAccusationInput());

			expect(currencyService.credit).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// システムメッセージへの告発
	// =========================================================================

	describe("システムメッセージへの告発", () => {
		it("システムメッセージに対して告発するとエラーメッセージを返す", async () => {
			// See: features/phase2/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
			const systemPost = createSystemPost();
			const service = new AccusationService(
				createMockPostRepository(systemPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.systemMessage).toContain(
				"システムメッセージに対して告発することはできません",
			);
			expect(result.bonusAmount).toBe(0);
			expect(result.alreadyAccused).toBe(false);
		});

		it("システムメッセージへの告発時はCurrencyService.creditが呼ばれない", async () => {
			const systemPost = createSystemPost();
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(systemPost),
				createMockBotPostRepository(false),
				createMockAccusationRepository(),
				currencyService,
			);

			await service.accuse(createAccusationInput());

			expect(currencyService.credit).not.toHaveBeenCalled();
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
				createMockAccusationRepository(true), // 重複あり
				createMockCurrencyService(),
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
				createMockCurrencyService(),
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
			// ボット書き込みは authorId=null。BotPostRepository でhit判定。
			const botPost = createBotPost();
			const service = new AccusationService(
				createMockPostRepository(botPost),
				createMockBotPostRepository(true),
				createMockAccusationRepository(),
				createMockCurrencyService(),
			);

			const result = await service.accuse(createAccusationInput());

			expect(result.result).toBe("hit");
		});

		it("miss時にtargetPost.authorIdがnullの場合はcreditが呼ばれない", async () => {
			// authorId=null の非システムメッセージかつ非ボットという理論的ケース
			const strangePost = createHumanPost({
				authorId: null,
				isSystemMessage: false,
			});
			const currencyService = createMockCurrencyService();
			const service = new AccusationService(
				createMockPostRepository(strangePost),
				createMockBotPostRepository(false), // ボットでもない
				createMockAccusationRepository(),
				currencyService,
			);

			const result = await service.accuse(createAccusationInput());

			// miss だが authorId=null なので冤罪ボーナスは付与されない
			expect(result.result).toBe("miss");
			expect(currencyService.credit).not.toHaveBeenCalled();
		});
	});
});
