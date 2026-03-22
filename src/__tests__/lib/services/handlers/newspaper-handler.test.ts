/**
 * NewspaperHandler 単体テスト
 *
 * !newspaper コマンドハンドラの振る舞いを検証する。
 * 非同期キュー（pending_async_commands）への INSERT と
 * CategorySelector の DI を検証する。
 *
 * テスト方針:
 *   - INewspaperPendingRepository はモック化する
 *   - CategorySelector を DI して決定論的テスト
 *   - 正常系（pending INSERT + 非ステルス成功）を網羅する
 *   - 通貨チェックは CommandService の共通処理で完了済みのためハンドラ側はテストしない
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §2
 */

import { describe, expect, it, vi } from "vitest";
import { NEWSPAPER_CATEGORIES } from "../../../../../config/newspaper-categories";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	type CategorySelector,
	defaultCategorySelector,
	type INewspaperPendingRepository,
	NewspaperHandler,
} from "../../../../lib/services/handlers/newspaper-handler";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 CommandContext を生成する */
function createCtx(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		args: [],
		rawArgs: [],
		postId: "post-invoker-001",
		threadId: "thread-001",
		userId: "invoker-user-001",
		dailyId: "Gz4nP7Xk",
		...overrides,
	};
}

/** モック PendingAsyncCommandRepository を生成する */
function createMockRepository(): INewspaperPendingRepository {
	return {
		create: vi.fn().mockResolvedValue(undefined),
	};
}

/** 固定カテゴリを返す CategorySelector を生成する */
function createFixedCategorySelector(category: string): CategorySelector {
	return () => category;
}

/** テスト用 NewspaperHandler を生成する */
function createHandler(
	repo?: INewspaperPendingRepository,
	selector?: CategorySelector,
): {
	handler: NewspaperHandler;
	repo: INewspaperPendingRepository;
} {
	const mockRepo = repo ?? createMockRepository();
	return {
		handler: new NewspaperHandler(
			mockRepo,
			selector ?? createFixedCategorySelector("IT"),
		),
		repo: mockRepo,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("NewspaperHandler", () => {
	// =========================================================================
	// commandName
	// =========================================================================

	it("commandName が 'newspaper' である", () => {
		const { handler } = createHandler();
		expect(handler.commandName).toBe("newspaper");
	});

	// =========================================================================
	// 正常系: pending INSERT + 非ステルス成功
	// See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
	// =========================================================================

	describe("正常系: pending INSERT + 非ステルス成功", () => {
		it("success: true を返す", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(true);
		});

		it("systemMessage が null である（非同期コマンドは同期フェーズで出力しない）", async () => {
			// See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
			const { handler } = createHandler();
			const result = await handler.execute(createCtx());
			expect(result.systemMessage).toBeNull();
		});

		it("pending_async_commands に正しいパラメータで INSERT される", async () => {
			const { handler, repo } = createHandler(
				undefined,
				createFixedCategorySelector("スポーツ"),
			);
			await handler.execute(
				createCtx({
					threadId: "thread-abc",
					userId: "user-xyz",
				}),
			);

			expect(repo.create).toHaveBeenCalledTimes(1);
			expect(repo.create).toHaveBeenCalledWith({
				commandType: "newspaper",
				threadId: "thread-abc",
				targetPostNumber: 0, // !newspaper は >>N 引数を取らない
				invokerUserId: "user-xyz",
				payload: {
					category: "スポーツ",
					model_id: "gemini-3-flash-preview",
				},
			});
		});

		it("targetPostNumber は常に 0 である（特定レスを参照しない）", async () => {
			// See: tmp/workers/bdd-architect_271/newspaper_design.md §2.8
			const { handler, repo } = createHandler();
			await handler.execute(createCtx());
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({ targetPostNumber: 0 }),
			);
		});

		it("payload に category と model_id が含まれる", async () => {
			const { handler, repo } = createHandler(
				undefined,
				createFixedCategorySelector("経済"),
			);
			await handler.execute(createCtx());
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: {
						category: "経済",
						model_id: "gemini-3-flash-preview",
					},
				}),
			);
		});

		it("eliminationNotice を返さない", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx());
			expect(result.eliminationNotice).toBeUndefined();
		});

		it("independentMessage を返さない", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx());
			expect(result.independentMessage).toBeUndefined();
		});

		it("postFieldOverrides を返さない（ステルスではない）", async () => {
			// See: features/command_newspaper.feature "書き込み本文は ... がそのまま表示される"
			const { handler } = createHandler();
			const result = await handler.execute(createCtx());
			expect(result.postFieldOverrides).toBeUndefined();
		});
	});

	// =========================================================================
	// CategorySelector DI
	// See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
	// =========================================================================

	describe("CategorySelector DI", () => {
		it("注入した CategorySelector が呼ばれる", async () => {
			const mockSelector = vi.fn().mockReturnValue("World");
			const { handler, repo } = createHandler(undefined, mockSelector);
			await handler.execute(createCtx());

			expect(mockSelector).toHaveBeenCalledTimes(1);
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({ category: "World" }),
				}),
			);
		});

		it("各カテゴリを DI して INSERT できる", async () => {
			// すべての有効カテゴリが payload に設定できることを検証
			for (const category of NEWSPAPER_CATEGORIES) {
				const { handler, repo } = createHandler(
					undefined,
					createFixedCategorySelector(category),
				);
				await handler.execute(createCtx());
				expect(repo.create).toHaveBeenCalledWith(
					expect.objectContaining({
						payload: expect.objectContaining({ category }),
					}),
				);
			}
		});
	});

	// =========================================================================
	// defaultCategorySelector
	// See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
	// =========================================================================

	describe("defaultCategorySelector", () => {
		it("7 カテゴリのいずれかを返す", () => {
			// 複数回呼び出してすべて有効なカテゴリであることを確認
			for (let i = 0; i < 100; i++) {
				const category = defaultCategorySelector();
				expect(NEWSPAPER_CATEGORIES).toContain(category);
			}
		});

		it("DI なしで NewspaperHandler を作成すると defaultCategorySelector が使われる", async () => {
			const mockRepo = createMockRepository();
			const handler = new NewspaperHandler(mockRepo);
			const result = await handler.execute(createCtx());

			expect(result.success).toBe(true);
			expect(mockRepo.create).toHaveBeenCalledTimes(1);
			const callArgs = (mockRepo.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(NEWSPAPER_CATEGORIES).toContain(
				(callArgs.payload as { category: string }).category,
			);
		});
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("引数が渡されても無視する（!newspaper は引数を取らない）", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>5", "extraArg"] }),
			);
			// 引数は無視して成功する
			expect(result.success).toBe(true);
			expect(repo.create).toHaveBeenCalledTimes(1);
		});

		it("空文字列のカテゴリでも pending INSERT は成功する（CategorySelector の責務）", async () => {
			const { handler, repo } = createHandler(
				undefined,
				createFixedCategorySelector(""),
			);
			// NewspaperHandler はカテゴリバリデーションを行わない（CategorySelector の責務）
			const result = await handler.execute(createCtx());
			expect(result.success).toBe(true);
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({ category: "" }),
				}),
			);
		});
	});

	// =========================================================================
	// 異常系: リポジトリエラー
	// =========================================================================

	describe("リポジトリエラー", () => {
		it("pending INSERT がエラーを投げた場合、例外が伝播する", async () => {
			const repo = createMockRepository();
			(repo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB connection error"),
			);
			const { handler } = createHandler(repo);

			await expect(handler.execute(createCtx())).rejects.toThrow(
				"DB connection error",
			);
		});
	});
});
