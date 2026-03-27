/**
 * HiroyukiHandler 単体テスト
 *
 * !hiroyuki コマンドハンドラの振る舞いを検証する。
 * ターゲット任意（>>N あり/なし）・ターゲットバリデーション・pending INSERT を検証する。
 *
 * テスト方針:
 *   - IHiroyukiPendingRepository はモック化する
 *   - IHiroyukiPostRepository はモック化する（ターゲットバリデーション用）
 *   - ターゲットあり/なし両方の正常系、削除済み・システムメッセージ異常系を網羅する
 *   - 通貨チェックは CommandService の共通処理で完了済みのためハンドラ側はテストしない
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/orchestrator/memo_hiroyuki_command.md §2〜§8
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

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("HiroyukiHandler", () => {
	// =========================================================================
	// commandName
	// =========================================================================

	it("commandName が 'hiroyuki' である", () => {
		const { handler } = createHandler();
		expect(handler.commandName).toBe("hiroyuki");
	});

	// =========================================================================
	// 正常系: ターゲット指定あり
	// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
	// =========================================================================

	describe("ターゲット指定あり（>>N）", () => {
		it("success: true を返す", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>5"], rawArgs: [">>5"] }),
			);
			expect(result.success).toBe(true);
		});

		it("systemMessage が null である（非同期コマンドは同期フェーズで出力しない）", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>5"], rawArgs: [">>5"] }),
			);
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

		it(">>1 のような小さいレス番号でも成功する", async () => {
			const { handler, pendingRepo } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>1"], rawArgs: [">>1"] }),
			);
			expect(result.success).toBe(true);
			expect(pendingRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ targetPostNumber: 1 }),
			);
		});

		it(">>999 のような大きいレス番号でも成功する", async () => {
			const { handler, pendingRepo } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>999"], rawArgs: [">>999"] }),
			);
			expect(result.success).toBe(true);
			expect(pendingRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ targetPostNumber: 999 }),
			);
		});

		it("payload に model_id と targetPostNumber が含まれる", async () => {
			const { handler, pendingRepo } = createHandler();
			await handler.execute(createCtx({ args: [">>7"], rawArgs: [">>7"] }));
			expect(pendingRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: {
						model_id: HIROYUKI_MODEL_ID,
						targetPostNumber: 7,
					},
				}),
			);
		});
	});

	// =========================================================================
	// 正常系: ターゲット指定なし
	// See: features/command_hiroyuki.feature @ターゲット指定なしではBOTがスレッド全体への感想を投稿する
	// =========================================================================

	describe("ターゲット指定なし（引数なし）", () => {
		it("success: true を返す", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [], rawArgs: [] }),
			);
			expect(result.success).toBe(true);
		});

		it("systemMessage が null である", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [], rawArgs: [] }),
			);
			expect(result.systemMessage).toBeNull();
		});

		it("pending_async_commands に targetPostNumber=0 で INSERT される", async () => {
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

		it("targetPostNumber は 0 である（スレッド全体モード）", async () => {
			const { handler, pendingRepo } = createHandler();
			await handler.execute(createCtx({ args: [], rawArgs: [] }));
			expect(pendingRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ targetPostNumber: 0 }),
			);
		});

		it("ターゲットなし時、postRepository.findPostByNumber は呼ばれない", async () => {
			const { handler, postRepo } = createHandler();
			await handler.execute(createCtx({ args: [], rawArgs: [] }));
			expect(
				(postRepo as IHiroyukiPostRepository).findPostByNumber,
			).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// ターゲットバリデーション: 削除済みレス
	// See: features/command_hiroyuki.feature @削除済みレスを対象に指定するとエラーになる
	// =========================================================================

	describe("削除済みレスを対象に指定するとエラーになる", () => {
		it("削除済みレスを対象にすると success: false とエラーメッセージを返す", async () => {
			const deletedPost: HiroyukiTargetPost = {
				isDeleted: true,
				isSystemMessage: false,
			};
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(deletedPost),
			);
			const result = await handler.execute(
				createCtx({ args: [">>8"], rawArgs: [">>8"] }),
			);
			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe("削除されたレスは対象にできません");
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it("削除済みレスの場合、通貨は消費されない（pending INSERT なし）", async () => {
			const deletedPost: HiroyukiTargetPost = {
				isDeleted: true,
				isSystemMessage: false,
			};
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(deletedPost),
			);
			await handler.execute(createCtx({ args: [">>8"], rawArgs: [">>8"] }));
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// ターゲットバリデーション: システムメッセージ
	// See: features/command_hiroyuki.feature @システムメッセージを対象に指定するとエラーになる
	// =========================================================================

	describe("システムメッセージを対象に指定するとエラーになる", () => {
		it("システムメッセージを対象にすると success: false とエラーメッセージを返す", async () => {
			const systemPost: HiroyukiTargetPost = {
				isDeleted: false,
				isSystemMessage: true,
			};
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(systemPost),
			);
			const result = await handler.execute(
				createCtx({ args: [">>10"], rawArgs: [">>10"] }),
			);
			expect(result.success).toBe(false);
			expect(result.systemMessage).toBe("システムメッセージは対象にできません");
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it("システムメッセージの場合、通貨は消費されない（pending INSERT なし）", async () => {
			const systemPost: HiroyukiTargetPost = {
				isDeleted: false,
				isSystemMessage: true,
			};
			const { handler, pendingRepo } = createHandler(
				undefined,
				createMockPostRepository(systemPost),
			);
			await handler.execute(createCtx({ args: [">>10"], rawArgs: [">>10"] }));
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// エラーケース: 無効なレス番号
	// =========================================================================

	describe("無効なレス番号", () => {
		it(">>0 は無効なレス番号としてエラーを返す", async () => {
			const { handler, pendingRepo } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>0"], rawArgs: [">>0"] }),
			);
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("無効なレス番号");
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it(">>-1 は無効なレス番号としてエラーを返す", async () => {
			const { handler, pendingRepo } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>-1"], rawArgs: [">>-1"] }),
			);
			expect(result.success).toBe(false);
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});

		it(">>abc は無効なレス番号としてエラーを返す", async () => {
			const { handler, pendingRepo } = createHandler();
			const result = await handler.execute(
				createCtx({ args: [">>abc"], rawArgs: [">>abc"] }),
			);
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("無効なレス番号");
			expect(pendingRepo.create).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// ターゲットバリデーション: postRepository が null の場合
	// =========================================================================

	describe("postRepository が null の場合、バリデーションをスキップする", () => {
		it("postRepository なしでターゲット指定ありでも pending INSERT が成功する", async () => {
			const pendingRepo = createMockPendingRepository();
			const handler = new HiroyukiHandler(pendingRepo, null);
			const result = await handler.execute(
				createCtx({ args: [">>5"], rawArgs: [">>5"] }),
			);
			expect(result.success).toBe(true);
			expect(pendingRepo.create).toHaveBeenCalledTimes(1);
		});
	});

	// =========================================================================
	// 付帯フィールド検証
	// =========================================================================

	describe("付帯フィールド", () => {
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

		it("postFieldOverrides を返さない（非ステルス）", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx());
			expect(result.postFieldOverrides).toBeUndefined();
		});
	});

	// =========================================================================
	// 異常系: リポジトリエラー
	// =========================================================================

	describe("リポジトリエラー", () => {
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

		it("postRepository.findPostByNumber がエラーを投げた場合、例外が伝播する", async () => {
			const pendingRepo = createMockPendingRepository();
			const postRepo = createMockPostRepository();
			(postRepo.findPostByNumber as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("DB lookup error"),
			);
			const handler = new HiroyukiHandler(pendingRepo, postRepo);

			await expect(
				handler.execute(createCtx({ args: [">>5"], rawArgs: [">>5"] })),
			).rejects.toThrow("DB lookup error");
		});
	});
});
