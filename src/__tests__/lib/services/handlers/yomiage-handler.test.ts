/**
 * YomiageHandler 単体テスト
 *
 * !yomiage コマンドハンドラの振る舞いを検証する。
 * preValidate と execute の責務分離を前提に、対象必須・事前検証・pending INSERT を検証する。
 *
 * See: features/command_yomiage.feature
 * See: docs/architecture/components/command.md §5 通貨引き落としの順序と事前検証（preValidate）
 */

import { describe, expect, it, vi } from "vitest";
import { YOMIAGE_MODEL_ID } from "../../../../../config/yomiage";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	type IYomiagePendingRepository,
	type IYomiagePostRepository,
	type YomiageTargetPost,
	YomiageHandler,
} from "../../../../lib/services/handlers/yomiage-handler";

/** テスト用 CommandContext を生成する */
function createCtx(overrides: Partial<CommandContext> = {}): CommandContext {
	const args = overrides.args ?? [];
	return {
		args,
		rawArgs: overrides.rawArgs ?? args,
		postId: "post-invoker-001",
		threadId: "thread-001",
		userId: "invoker-user-001",
		dailyId: "Gz4nP7Xk",
		...overrides,
	};
}

/** モック PendingAsyncCommandRepository を生成する */
function createMockPendingRepository(): IYomiagePendingRepository {
	return {
		create: vi.fn().mockResolvedValue(undefined),
	};
}

/** モック PostRepository を生成する */
function createMockPostRepository(
	post: YomiageTargetPost | null = null,
): IYomiagePostRepository {
	return {
		findPostByNumber: vi.fn().mockResolvedValue(post),
	};
}

/** 通常レスのデフォルトモック */
function createNormalPost(): YomiageTargetPost {
	return {
		isDeleted: false,
		isSystemMessage: false,
	};
}

/** テスト用 YomiageHandler を生成する */
function createHandler(
	pendingRepo?: IYomiagePendingRepository,
	postRepo?: IYomiagePostRepository | null,
): {
	handler: YomiageHandler;
	pendingRepo: IYomiagePendingRepository;
	postRepo: IYomiagePostRepository | null;
} {
	const mockPendingRepo = pendingRepo ?? createMockPendingRepository();
	const mockPostRepo =
		postRepo !== undefined
			? postRepo
			: createMockPostRepository(createNormalPost());
	return {
		handler: new YomiageHandler(mockPendingRepo, mockPostRepo),
		pendingRepo: mockPendingRepo,
		postRepo: mockPostRepo,
	};
}

describe("YomiageHandler", () => {
	it("commandName が 'yomiage' である", () => {
		const { handler } = createHandler();
		expect(handler.commandName).toBe("yomiage");
	});

	describe("preValidate", () => {
		it("引数なしでは対象レス指定エラーを返す", async () => {
			const { handler, pendingRepo, postRepo } = createHandler();

			const result = await handler.preValidate(
				createCtx({ args: [], rawArgs: [] }),
			);

			expect(result).toEqual({
				success: false,
				systemMessage: "対象レスを指定してください",
			});
			expect(pendingRepo.create).not.toHaveBeenCalled();
			expect(
				(postRepo as IYomiagePostRepository).findPostByNumber,
			).not.toHaveBeenCalled();
		});

		it.each([">>abc", ">>0", ">>-1"])(
			"%s は無効なレス番号エラーを返す",
			async (arg) => {
				const { handler, pendingRepo } = createHandler();

				const result = await handler.preValidate(
					createCtx({ args: [arg], rawArgs: [arg] }),
				);

				expect(result).toEqual({
					success: false,
					systemMessage: "無効なレス番号です",
				});
				expect(pendingRepo.create).not.toHaveBeenCalled();
			},
		);

		it("削除済みレスを対象にするとエラーを返す", async () => {
			const deletedPost: YomiageTargetPost = {
				isDeleted: true,
				isSystemMessage: false,
			};
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(deletedPost),
			);

			const result = await handler.preValidate(
				createCtx({ args: [">>8"], rawArgs: [">>8"] }),
			);

			expect(result).toEqual({
				success: false,
				systemMessage: "削除されたレスは対象にできません",
			});
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it("システムメッセージを対象にするとエラーを返す", async () => {
			const systemPost: YomiageTargetPost = {
				isDeleted: false,
				isSystemMessage: true,
			};
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(systemPost),
			);

			const result = await handler.preValidate(
				createCtx({ args: [">>10"], rawArgs: [">>10"] }),
			);

			expect(result).toEqual({
				success: false,
				systemMessage: "システムメッセージは対象にできません",
			});
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it("正常な対象レスでは null を返す", async () => {
			const { handler, postRepo } = createHandler(
				undefined,
				createMockPostRepository(createNormalPost()),
			);

			const result = await handler.preValidate(
				createCtx({ args: [">>5"], rawArgs: [">>5"] }),
			);

			expect(result).toBeNull();
			expect(postRepo!.findPostByNumber).toHaveBeenCalledWith("thread-001", 5);
		});

		it("postRepository 未設定時は null を返す", async () => {
			const pendingRepo = createMockPendingRepository();
			const handler = new YomiageHandler(pendingRepo, null);

			const result = await handler.preValidate(
				createCtx({ args: [">>8"], rawArgs: [">>8"] }),
			);

			expect(result).toBeNull();
		});
	});

	describe("execute", () => {
		it("success: true と systemMessage: null を返す", async () => {
			const { handler } = createHandler();

			const result = await handler.execute(
				createCtx({ args: [">>5"], rawArgs: [">>5"] }),
			);

			expect(result).toEqual({
				success: true,
				systemMessage: null,
			});
		});

		it("pending_async_commands に正しいパラメータで INSERT される", async () => {
			const { handler, pendingRepo } = createHandler();

			await handler.execute(
				createCtx({
					args: ["resolved-post-id"],
					rawArgs: [">>5"],
					threadId: "thread-abc",
					userId: "user-xyz",
				}),
			);

			expect(pendingRepo.create).toHaveBeenCalledTimes(1);
			expect(pendingRepo.create).toHaveBeenCalledWith({
				commandType: "yomiage",
				threadId: "thread-abc",
				targetPostNumber: 5,
				invokerUserId: "user-xyz",
				payload: {
					model_id: YOMIAGE_MODEL_ID,
					targetPostNumber: 5,
				},
			});
		});

		it("preValidate 通過後に execute が pending INSERT を実行する", async () => {
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(createNormalPost()),
			);
			const ctx = createCtx({ args: [">>7"], rawArgs: [">>7"] });

			await expect(handler.preValidate(ctx)).resolves.toBeNull();
			await handler.execute(ctx);

			expect(pendingRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					commandType: "yomiage",
					targetPostNumber: 7,
				}),
			);
		});

		it("postRepository は execute では参照しない", async () => {
			const { handler, postRepo } = createHandler();

			await handler.execute(createCtx({ args: [">>5"], rawArgs: [">>5"] }));

			expect(
				(postRepo as IYomiagePostRepository).findPostByNumber,
			).not.toHaveBeenCalled();
		});

		it("preValidate を経ずに不正な引数で呼ぶと例外を投げる", async () => {
			const { handler, pendingRepo } = createHandler();

			await expect(
				handler.execute(createCtx({ args: [], rawArgs: [] })),
			).rejects.toThrow(
				"YomiageHandler.execute requires a validated >>postNumber argument",
			);
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it("pending INSERT がエラーを投げた場合、例外が伝播する", async () => {
			const pendingRepo = createMockPendingRepository();
			(pendingRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB connection error"),
			);
			const { handler } = createHandler(pendingRepo);

			await expect(
				handler.execute(createCtx({ args: [">>5"], rawArgs: [">>5"] })),
			).rejects.toThrow("DB connection error");
		});
	});
});
