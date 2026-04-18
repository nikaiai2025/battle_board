/**
 * HiroyukiHandler 単体テスト
 *
 * !hiroyuki コマンドハンドラの振る舞いを検証する。
 * preValidate と execute の責務分離を前提に、ターゲット任意・事前検証・pending INSERT を検証する。
 *
 * See: features/command_hiroyuki.feature
 * See: docs/architecture/components/command.md §5 通貨引き落としの順序と事前検証（preValidate）
 */

import { describe, expect, it, vi } from "vitest";
import { HIROYUKI_MODEL_ID } from "../../../../../config/hiroyuki-prompt";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	HiroyukiHandler,
	type HiroyukiTargetPost,
	type IHiroyukiPendingRepository,
	type IHiroyukiPostRepository,
} from "../../../../lib/services/handlers/hiroyuki-handler";

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
function createMockPendingRepository(): IHiroyukiPendingRepository {
	return {
		create: vi.fn().mockResolvedValue(undefined),
	};
}

/** モック PostRepository を生成する */
function createMockPostRepository(
	post: HiroyukiTargetPost | null = null,
): IHiroyukiPostRepository {
	return {
		findPostByNumber: vi.fn().mockResolvedValue(post),
	};
}

/** 通常レスのデフォルトモック */
function createNormalPost(): HiroyukiTargetPost {
	return {
		isDeleted: false,
		isSystemMessage: false,
	};
}

/** テスト用 HiroyukiHandler を生成する */
function createHandler(
	pendingRepo?: IHiroyukiPendingRepository,
	postRepo?: IHiroyukiPostRepository | null,
): {
	handler: HiroyukiHandler;
	pendingRepo: IHiroyukiPendingRepository;
	postRepo: IHiroyukiPostRepository | null;
} {
	const mockPendingRepo = pendingRepo ?? createMockPendingRepository();
	const mockPostRepo =
		postRepo !== undefined
			? postRepo
			: createMockPostRepository(createNormalPost());
	return {
		handler: new HiroyukiHandler(mockPendingRepo, mockPostRepo),
		pendingRepo: mockPendingRepo,
		postRepo: mockPostRepo,
	};
}

describe("HiroyukiHandler", () => {
	it("commandName が 'hiroyuki' である", () => {
		const { handler } = createHandler();
		expect(handler.commandName).toBe("hiroyuki");
	});

	describe("preValidate", () => {
		it("引数なしでは null を返す", async () => {
			const { handler, postRepo } = createHandler();

			const result = await handler.preValidate(
				createCtx({ args: [], rawArgs: [] }),
			);

			expect(result).toBeNull();
			expect(
				(postRepo as IHiroyukiPostRepository).findPostByNumber,
			).not.toHaveBeenCalled();
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
			const handler = new HiroyukiHandler(pendingRepo, null);

			const result = await handler.preValidate(
				createCtx({ args: [">>8"], rawArgs: [">>8"] }),
			);

			expect(result).toBeNull();
		});

		it("削除済みレスを対象にするとエラーを返す", async () => {
			const deletedPost: HiroyukiTargetPost = {
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
			const systemPost: HiroyukiTargetPost = {
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

		it(">>0 は無効なレス番号としてエラーを返す", async () => {
			const { handler } = createHandler();

			const result = await handler.preValidate(
				createCtx({ args: [">>0"], rawArgs: [">>0"] }),
			);

			expect(result).toEqual({
				success: false,
				systemMessage: "無効なレス番号です",
			});
		});

		it(">>abc は無効なレス番号としてエラーを返す", async () => {
			const { handler } = createHandler();

			const result = await handler.preValidate(
				createCtx({ args: [">>abc"], rawArgs: [">>abc"] }),
			);

			expect(result).toEqual({
				success: false,
				systemMessage: "無効なレス番号です",
			});
		});

		it("postRepository.findPostByNumber がエラーを投げた場合、例外が伝播する", async () => {
			const pendingRepo = createMockPendingRepository();
			const postRepo = createMockPostRepository();
			(postRepo.findPostByNumber as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB lookup error"),
			);
			const handler = new HiroyukiHandler(pendingRepo, postRepo);

			await expect(
				handler.preValidate(
					createCtx({ args: [">>5"], rawArgs: [">>5"] }),
				),
			).rejects.toThrow("DB lookup error");
		});
	});

	describe("execute", () => {
		it("ターゲット指定ありで success: true を返す", async () => {
			const { handler } = createHandler();

			const result = await handler.execute(
				createCtx({ args: [">>5"], rawArgs: [">>5"] }),
			);

			expect(result.success).toBe(true);
			expect(result.systemMessage).toBeNull();
		});

		it("pending_async_commands に targetPostNumber を含む正しいパラメータで INSERT される", async () => {
			const { handler, pendingRepo } = createHandler();

			await handler.execute(
				createCtx({
					args: [">>5"],
					rawArgs: [">>5"],
					threadId: "thread-abc",
					userId: "user-xyz",
				}),
			);

			expect(pendingRepo.create).toHaveBeenCalledTimes(1);
			expect(pendingRepo.create).toHaveBeenCalledWith({
				commandType: "hiroyuki",
				threadId: "thread-abc",
				targetPostNumber: 5,
				invokerUserId: "user-xyz",
				payload: {
					model_id: HIROYUKI_MODEL_ID,
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
					commandType: "hiroyuki",
					targetPostNumber: 7,
				}),
			);
		});

		it("ターゲット指定なしでは targetPostNumber=0 で INSERT される", async () => {
			const { handler, pendingRepo } = createHandler();

			await handler.execute(
				createCtx({
					args: [],
					rawArgs: [],
					threadId: "thread-abc",
					userId: "user-xyz",
				}),
			);

			expect(pendingRepo.create).toHaveBeenCalledTimes(1);
			expect(pendingRepo.create).toHaveBeenCalledWith({
				commandType: "hiroyuki",
				threadId: "thread-abc",
				targetPostNumber: 0,
				invokerUserId: "user-xyz",
				payload: {
					model_id: HIROYUKI_MODEL_ID,
					targetPostNumber: 0,
				},
			});
		});

		it("preValidate を経ずに無効なレス番号で直接呼ばれても 0 にフォールバックする", async () => {
			const { handler, pendingRepo } = createHandler();

			await handler.execute(
				createCtx({ args: [">>abc"], rawArgs: [">>abc"] }),
			);

			expect(pendingRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					targetPostNumber: 0,
					payload: {
						model_id: HIROYUKI_MODEL_ID,
						targetPostNumber: 0,
					},
				}),
			);
		});

		it("postRepository は execute では参照しない", async () => {
			const { handler, postRepo } = createHandler();

			await handler.execute(createCtx({ args: [], rawArgs: [] }));

			expect(
				(postRepo as IHiroyukiPostRepository).findPostByNumber,
			).not.toHaveBeenCalled();
		});

		it("eliminationNotice / independentMessage / postFieldOverrides を返さない", async () => {
			const { handler } = createHandler();

			const result = await handler.execute(createCtx());

			expect(result.eliminationNotice).toBeUndefined();
			expect(result.independentMessage).toBeUndefined();
			expect(result.postFieldOverrides).toBeUndefined();
		});

		it("pending INSERT がエラーを投げた場合、例外が伝播する", async () => {
			const pendingRepo = createMockPendingRepository();
			(pendingRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB connection error"),
			);
			const { handler } = createHandler(pendingRepo);

			await expect(
				handler.execute(createCtx({ args: [], rawArgs: [] })),
			).rejects.toThrow("DB connection error");
		});
	});
});
