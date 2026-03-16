/**
 * 単体テスト: GrassHandler（!w 草コマンドハンドラ）
 *
 * See: features/reactions.feature
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4 GrassHandler 契約
 *
 * テスト方針:
 *   - PostRepository, GrassRepository, BotPostRepository はすべてモック化する
 *   - バリデーション6種（引数なし・存在しない・自己草・システムメッセージ・削除済み・重複）を網羅する
 *   - 正常系: 人間への草・ボットへの草（MVP対応）を検証する
 *   - アイコン変化の代表ケースを検証する
 */

import { describe, expect, it, vi } from "vitest";
import type { Post } from "../../../../lib/domain/models/post";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	GrassHandler,
	type IGrassBotPostRepository,
	type IGrassPostRepository,
	type IGrassRepository,
} from "../../../../lib/services/handlers/grass-handler";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 CommandContext を生成する */
function createCtx(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		args: ["post-target-001"],
		postId: "post-caller-001",
		threadId: "thread-001",
		userId: "user-b-001",
		...overrides,
	};
}

/** テスト用の通常レス（人間の書き込み）を生成する */
function createHumanPost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-target-001",
		threadId: "thread-001",
		postNumber: 3,
		authorId: "user-a-001",
		displayName: "名無しさん",
		dailyId: "Ax8kP2",
		body: "テスト書き込み",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-17T10:00:00Z"),
		...overrides,
	};
}

/** テスト用のシステムメッセージレスを生成する */
function createSystemPost(): Post {
	return createHumanPost({
		id: "post-system-001",
		authorId: null,
		isSystemMessage: true,
		displayName: "★システム",
		dailyId: "SYSTEM",
	});
}

/** テスト用の削除済みレスを生成する */
function createDeletedPost(): Post {
	return createHumanPost({
		id: "post-deleted-001",
		isDeleted: true,
	});
}

/** テスト用のボット書き込みレスを生成する */
function createBotPost(): Post {
	return createHumanPost({
		id: "post-bot-001",
		authorId: null, // ボットは authorId が null
		isSystemMessage: false,
		displayName: "名無しさん", // ボットは人間に偽装
		dailyId: "BotDly01",
	});
}

// ---------------------------------------------------------------------------
// モックファクトリ
// ---------------------------------------------------------------------------

/** 正常系の PostRepository モック（人間のレスを返す） */
function createMockPostRepository(
	post: Post | null = createHumanPost(),
): IGrassPostRepository {
	return {
		findById: vi.fn().mockResolvedValue(post),
	};
}

/** 正常系の GrassRepository モック */
function createMockGrassRepository(
	overrides: Partial<IGrassRepository> = {},
): IGrassRepository {
	return {
		existsForToday: vi.fn().mockResolvedValue(false),
		create: vi.fn().mockResolvedValue({ id: "grass-001" }),
		incrementGrassCount: vi.fn().mockResolvedValue(1),
		...overrides,
	};
}

/** BotPostRepository モック（ボット判定なし）*/
function createMockBotPostRepository(
	result: { botId: string } | null = null,
): IGrassBotPostRepository {
	return {
		findByPostId: vi.fn().mockResolvedValue(result),
	};
}

/** GrassHandler インスタンスを生成する */
function createHandler(
	postRepo: IGrassPostRepository = createMockPostRepository(),
	grassRepo: IGrassRepository = createMockGrassRepository(),
	botPostRepo: IGrassBotPostRepository = createMockBotPostRepository(),
): GrassHandler {
	return new GrassHandler(postRepo, grassRepo, botPostRepo);
}

// ---------------------------------------------------------------------------
// バリデーションテスト
// ---------------------------------------------------------------------------

describe("GrassHandler バリデーション", () => {
	// ---
	// 引数なし
	// See: features/reactions.feature @対象レス番号を指定せずに !w を実行するとエラーになる
	// ---
	describe("引数なし", () => {
		it("args が空のとき失敗してエラーメッセージを返す", async () => {
			const handler = createHandler();
			const ctx = createCtx({ args: [] });
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe(
				"対象レスを指定してください（例: !w >>3）",
			);
		});

		it("args[0] が undefined のとき失敗してエラーメッセージを返す", async () => {
			const handler = createHandler();
			const ctx = createCtx({ args: [undefined as unknown as string] });
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe(
				"対象レスを指定してください（例: !w >>3）",
			);
		});
	});

	// ---
	// 存在しないレス
	// See: features/reactions.feature @存在しないレスに草を生やそうとするとエラーになる
	// ---
	describe("存在しないレス", () => {
		it("PostRepository が null を返す場合、失敗してエラーメッセージを返す", async () => {
			const handler = createHandler(createMockPostRepository(null));
			const ctx = createCtx({ args: ["post-nonexistent"] });
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe("指定されたレスが見つかりません");
		});
	});

	// ---
	// 削除済みレス
	// See: features/reactions.feature @削除済みレスには草を生やせない
	// ---
	describe("削除済みレス", () => {
		it("isDeleted=true のレスに草を生やそうとすると失敗してエラーメッセージを返す", async () => {
			const handler = createHandler(
				createMockPostRepository(createDeletedPost()),
			);
			const ctx = createCtx();
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe("削除されたレスには草を生やせません");
		});
	});

	// ---
	// システムメッセージ
	// See: features/reactions.feature @システムメッセージには草を生やせない
	// ---
	describe("システムメッセージ", () => {
		it("isSystemMessage=true のレスに草を生やそうとすると失敗してエラーメッセージを返す", async () => {
			const handler = createHandler(
				createMockPostRepository(createSystemPost()),
			);
			const ctx = createCtx();
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe(
				"システムメッセージには草を生やせません",
			);
		});
	});

	// ---
	// 自己草
	// See: features/reactions.feature @自分が書いたレスには草を生やせない
	// ---
	describe("自己草", () => {
		it("自分のレスに草を生やそうとすると失敗してエラーメッセージを返す", async () => {
			const post = createHumanPost({ authorId: "user-b-001" }); // ctx.userId と同一
			const handler = createHandler(createMockPostRepository(post));
			const ctx = createCtx({ userId: "user-b-001" });
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe("自分のレスには草を生やせません");
		});

		it("authorId が null のレス（ボット）への自己草は自己草チェックを通過する", async () => {
			// ボットのレスは authorId = null なので自己草チェックにかからない
			const botPost = createBotPost();
			const grassRepo = createMockGrassRepository();
			const botPostRepo = createMockBotPostRepository({ botId: "bot-001" });
			const handler = createHandler(
				createMockPostRepository(botPost),
				grassRepo,
				botPostRepo,
			);
			const ctx = createCtx({ userId: "user-b-001" });
			const result = await handler.execute(ctx);

			// ボットへの草は成功する（MVPではカウント非加算）
			expect(result.success).toBe(true);
		});
	});

	// ---
	// 同日重複
	// See: features/reactions.feature @同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
	// ---
	describe("同日重複", () => {
		it("同日に同一受領者に既に草を生やしている場合、失敗してエラーメッセージを返す", async () => {
			const grassRepo = createMockGrassRepository({
				existsForToday: vi.fn().mockResolvedValue(true), // 重複あり
			});
			const handler = createHandler(createMockPostRepository(), grassRepo);
			const ctx = createCtx();
			const result = await handler.execute(ctx);

			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe(
				"今日は既にこのユーザーに草を生やしています",
			);
		});

		it("重複がある場合 incrementGrassCount は呼ばれない", async () => {
			const grassRepo = createMockGrassRepository({
				existsForToday: vi.fn().mockResolvedValue(true),
			});
			const handler = createHandler(createMockPostRepository(), grassRepo);
			await handler.execute(createCtx());

			expect(grassRepo.incrementGrassCount).not.toHaveBeenCalled();
		});
	});
});

// ---------------------------------------------------------------------------
// 正常系テスト
// ---------------------------------------------------------------------------

describe("GrassHandler 正常系", () => {
	// ---
	// 人間ユーザーへの草
	// See: features/reactions.feature §基本機能
	// ---
	describe("人間ユーザーへの草", () => {
		it("草付与に成功すると success=true を返す", async () => {
			const grassRepo = createMockGrassRepository({
				incrementGrassCount: vi.fn().mockResolvedValue(1),
			});
			const handler = createHandler(createMockPostRepository(), grassRepo);
			const result = await handler.execute(createCtx());

			expect(result.success).toBe(true);
		});

		it("草付与後にシステムメッセージを返す（形式: >>N (ID:xxx) に草 ICON(計M本)）", async () => {
			// See: features/reactions.feature §草を生やした結果がレス末尾にマージ表示される
			const post = createHumanPost({
				postNumber: 3,
				dailyId: "Ax8kP2",
				authorId: "user-a-001",
			});
			const grassRepo = createMockGrassRepository({
				incrementGrassCount: vi.fn().mockResolvedValue(5), // 新しい草カウント
			});
			const handler = createHandler(createMockPostRepository(post), grassRepo);
			const ctx = createCtx({ userId: "user-b-001" });
			const result = await handler.execute(ctx);

			expect(result.success).toBe(true);
			expect(result.systemMessage).toBe(">>3 (ID:Ax8kP2) に草 🌱(計5本)");
		});

		it("草付与時に GrassRepository.create が呼ばれる", async () => {
			const grassRepo = createMockGrassRepository();
			const handler = createHandler(createMockPostRepository(), grassRepo);
			await handler.execute(createCtx());

			expect(grassRepo.create).toHaveBeenCalledOnce();
		});

		it("草付与時に GrassRepository.incrementGrassCount が呼ばれる", async () => {
			const grassRepo = createMockGrassRepository();
			const handler = createHandler(createMockPostRepository(), grassRepo);
			await handler.execute(createCtx());

			expect(grassRepo.incrementGrassCount).toHaveBeenCalledWith("user-a-001");
		});

		it("草付与時に GrassRepository.create に正しい receiver_id が渡される", async () => {
			const post = createHumanPost({ authorId: "user-a-001" });
			const grassRepo = createMockGrassRepository();
			const handler = createHandler(createMockPostRepository(post), grassRepo);
			const ctx = createCtx({ userId: "user-b-001", threadId: "thread-001" });
			await handler.execute(ctx);

			expect(grassRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					giverId: "user-b-001",
					receiverId: "user-a-001",
					receiverBotId: null,
					threadId: "thread-001",
				}),
			);
		});
	});

	// ---
	// アイコン変化の検証
	// See: features/reactions.feature §成長ビジュアル（10刻みループ）
	// ---
	describe("アイコン変化", () => {
		it("草カウント 9 → 付与後 10: 🌿(計10本) が含まれる", async () => {
			const post = createHumanPost({
				postNumber: 3,
				dailyId: "Ax8kP2",
				authorId: "user-a-001",
			});
			const grassRepo = createMockGrassRepository({
				incrementGrassCount: vi.fn().mockResolvedValue(10),
			});
			const handler = createHandler(createMockPostRepository(post), grassRepo);
			const result = await handler.execute(createCtx());

			expect(result.systemMessage).toContain("🌿(計10本)");
		});

		it("草カウント 49 → 付与後 50: 🌱(計50本) が含まれる（ループ）", async () => {
			// See: features/reactions.feature @草カウントが 50 本に達すると 🌱 に戻りループする
			const post = createHumanPost({
				postNumber: 3,
				dailyId: "Ax8kP2",
				authorId: "user-a-001",
			});
			const grassRepo = createMockGrassRepository({
				incrementGrassCount: vi.fn().mockResolvedValue(50),
			});
			const handler = createHandler(createMockPostRepository(post), grassRepo);
			const result = await handler.execute(createCtx());

			expect(result.systemMessage).toContain("🌱(計50本)");
		});
	});

	// ---
	// ボットへの草（MVP: 記録のみ・カウント非加算）
	// See: features/reactions.feature @ボットの書き込みに草を生やせる
	// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.3 ボットへの草 最終推奨
	// ---
	describe("ボットへの草（MVP）", () => {
		it("ボットのレスへの草に成功する", async () => {
			const botPost = createBotPost();
			const grassRepo = createMockGrassRepository();
			const botPostRepo = createMockBotPostRepository({ botId: "bot-001" });
			const handler = createHandler(
				createMockPostRepository(botPost),
				grassRepo,
				botPostRepo,
			);
			const result = await handler.execute(createCtx());

			expect(result.success).toBe(true);
		});

		it("ボットへの草では incrementGrassCount が呼ばれない（MVPではボットのカウント非加算）", async () => {
			const botPost = createBotPost();
			const grassRepo = createMockGrassRepository();
			const botPostRepo = createMockBotPostRepository({ botId: "bot-001" });
			const handler = createHandler(
				createMockPostRepository(botPost),
				grassRepo,
				botPostRepo,
			);
			await handler.execute(createCtx());

			expect(grassRepo.incrementGrassCount).not.toHaveBeenCalled();
		});

		it("ボットへの草では GrassRepository.create に receiverBotId が渡される", async () => {
			const botPost = createBotPost();
			const grassRepo = createMockGrassRepository();
			const botPostRepo = createMockBotPostRepository({ botId: "bot-001" });
			const handler = createHandler(
				createMockPostRepository(botPost),
				grassRepo,
				botPostRepo,
			);
			await handler.execute(createCtx());

			expect(grassRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					receiverId: null,
					receiverBotId: "bot-001",
				}),
			);
		});

		it("ボットへの草: commandName は 'w'", () => {
			const handler = createHandler();
			expect(handler.commandName).toBe("w");
		});
	});

	// ---
	// 重複チェックの引数検証
	// ---
	describe("重複チェック（existsForToday の呼び出し）", () => {
		it("人間への草のとき existsForToday は receiverId を渡す", async () => {
			const post = createHumanPost({ authorId: "user-a-001" });
			const grassRepo = createMockGrassRepository();
			const handler = createHandler(createMockPostRepository(post), grassRepo);
			const ctx = createCtx({ userId: "user-b-001" });
			await handler.execute(ctx);

			expect(grassRepo.existsForToday).toHaveBeenCalledWith(
				"user-b-001",
				"user-a-001",
				null,
				expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
			);
		});

		it("ボットへの草のとき existsForToday は receiverBotId を渡す", async () => {
			const botPost = createBotPost();
			const grassRepo = createMockGrassRepository();
			const botPostRepo = createMockBotPostRepository({ botId: "bot-001" });
			const handler = createHandler(
				createMockPostRepository(botPost),
				grassRepo,
				botPostRepo,
			);
			const ctx = createCtx({ userId: "user-b-001" });
			await handler.execute(ctx);

			expect(grassRepo.existsForToday).toHaveBeenCalledWith(
				"user-b-001",
				null,
				"bot-001",
				expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// エッジケーステスト
// ---------------------------------------------------------------------------

describe("GrassHandler エッジケース", () => {
	it("authorId が null かつボットでもない場合はエラーを返す", async () => {
		// authorId=null かつ BotPostRepository も null を返す（通常は発生しない）
		const unknownPost = createHumanPost({
			authorId: null,
			isSystemMessage: false,
		});
		const botPostRepo = createMockBotPostRepository(null); // ボットでも人間でもない
		const handler = createHandler(
			createMockPostRepository(unknownPost),
			createMockGrassRepository(),
			botPostRepo,
		);
		const result = await handler.execute(createCtx());

		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("このレスには草を生やせません");
	});

	it("削除済みレスのチェックはシステムメッセージチェックより先に行う", async () => {
		// isDeleted=true かつ isSystemMessage=true の場合、削除済みメッセージが返る
		const post = createHumanPost({ isDeleted: true, isSystemMessage: true });
		const handler = createHandler(createMockPostRepository(post));
		const result = await handler.execute(createCtx());

		expect(result.systemMessage).toBe("削除されたレスには草を生やせません");
	});

	it("空文字列の args[0] は引数なしとして扱う", async () => {
		const handler = createHandler();
		const ctx = createCtx({ args: [""] });
		const result = await handler.execute(ctx);

		// 空文字は falsy なので引数なしエラー
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe(
			"対象レスを指定してください（例: !w >>3）",
		);
	});
});
