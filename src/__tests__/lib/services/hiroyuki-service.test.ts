/**
 * hiroyuki-service 単体テスト
 *
 * completeHiroyukiCommand:
 *   GH Actions から AI 生成結果を受け取り、BOT 生成 + 投稿 + pending 削除を行う。
 *   成功時・失敗時・ターゲットあり/なしの各パスを検証する。
 *
 * getHiroyukiPendings:
 *   pending_async_commands から commandType="hiroyuki" を取得する。
 *
 * テスト方針:
 *   - 全依存は DI でモック化する
 *   - 正常系（BOT生成+投稿+pending削除）
 *   - ターゲットあり返信構成（>>N 形式）
 *   - AI API 失敗時（通貨返却+システム通知+pending削除）
 *   - エッジケース（空テキスト、null等）
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/orchestrator/memo_hiroyuki_command.md §1〜§8
 */

import { describe, expect, it, vi } from "vitest";

import {
	completeHiroyukiCommand,
	getHiroyukiPendings,
	type IHiroyukiCompleteDeps,
	type IHiroyukiPendingsDeps,
} from "../../../lib/services/hiroyuki-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 completeHiroyukiCommand 依存モックを生成する */
function createCompleteDeps(overrides: Partial<IHiroyukiCompleteDeps> = {}): {
	deps: IHiroyukiCompleteDeps;
	mocks: {
		deletePendingAsyncCommand: ReturnType<typeof vi.fn>;
		createBotFn: ReturnType<typeof vi.fn>;
		createBotPostFn: ReturnType<typeof vi.fn>;
		incrementTotalPostsFn: ReturnType<typeof vi.fn>;
		createPostFn: ReturnType<typeof vi.fn>;
		creditFn: ReturnType<typeof vi.fn>;
	};
} {
	const deletePendingAsyncCommand = vi.fn().mockResolvedValue(undefined);
	const createBotFn = vi.fn().mockResolvedValue({
		id: "bot-hiroyuki-001",
		name: "名無しさん",
		persona: "ひろゆき",
		hp: 10,
		maxHp: 10,
		dailyId: "FakeId1",
		dailyIdDate: "2026-03-27",
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		botProfileKey: "hiroyuki",
		nextPostAt: null,
		createdAt: new Date(),
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		eliminatedAt: null,
		eliminatedBy: null,
	});
	const createBotPostFn = vi.fn().mockResolvedValue(undefined);
	const incrementTotalPostsFn = vi.fn().mockResolvedValue(undefined);
	const createPostFn = vi.fn().mockResolvedValue({
		success: true,
		postId: "post-hiroyuki-001",
		postNumber: 10,
		systemMessages: [],
	});
	const creditFn = vi.fn().mockResolvedValue(undefined);

	const deps: IHiroyukiCompleteDeps = {
		pendingAsyncCommandRepository: { deletePendingAsyncCommand },
		createBotFn,
		createBotPostFn,
		incrementTotalPostsFn,
		createPostFn,
		creditFn,
		...overrides,
	};

	return {
		deps,
		mocks: {
			deletePendingAsyncCommand,
			createBotFn,
			createBotPostFn,
			incrementTotalPostsFn,
			createPostFn,
			creditFn,
		},
	};
}

// ---------------------------------------------------------------------------
// completeHiroyukiCommand テストスイート
// ---------------------------------------------------------------------------

describe("completeHiroyukiCommand", () => {
	// =========================================================================
	// 成功パス: BOT生成 + 投稿 + pending削除
	// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
	// =========================================================================

	describe("成功パス（ターゲットなし）", () => {
		it("success=true, botId, postId を返す", async () => {
			const { deps } = createCompleteDeps();
			const result = await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "なんだろう、それってあなたの感想ですよね？",
				targetPostNumber: 0,
			});
			expect(result.success).toBe(true);
			expect(result.botId).toBe("bot-hiroyuki-001");
			expect(result.postId).toBe("post-hiroyuki-001");
			expect(result.pendingId).toBe("pending-001");
		});

		it("BOTが HP:10 で新規作成される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
				targetPostNumber: 0,
			});
			expect(mocks.createBotFn).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "名無しさん",
					hp: 10,
					maxHp: 10,
					botProfileKey: "hiroyuki",
					isActive: true,
					nextPostAt: null,
				}),
			);
		});

		it("AI生成テキストが「名無しさん」名義でBOT書き込みとして投稿される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-xyz",
				invokerUserId: "user-001",
				success: true,
				generatedText: "要は、データがないんすよ",
				targetPostNumber: 0,
			});
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-xyz",
					body: "要は、データがないんすよ",
					displayName: "名無しさん",
					isBotWrite: true,
				}),
			);
		});

		it("bot_posts 紐付けが作成される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
				targetPostNumber: 0,
			});
			expect(mocks.createBotPostFn).toHaveBeenCalledWith(
				"post-hiroyuki-001",
				"bot-hiroyuki-001",
			);
		});

		it("total_posts がインクリメントされる", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
				targetPostNumber: 0,
			});
			expect(mocks.incrementTotalPostsFn).toHaveBeenCalledWith(
				"bot-hiroyuki-001",
			);
		});

		it("成功後に pending が削除される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-to-delete",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
				targetPostNumber: 0,
			});
			expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith(
				"pending-to-delete",
			);
		});

		it("成功時に creditFn は呼ばれない", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
				targetPostNumber: 0,
			});
			expect(mocks.creditFn).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 成功パス: ターゲットあり返信構成
	// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
	// =========================================================================

	describe("成功パス（ターゲットあり）", () => {
		it("ターゲット指定時、本文が >>N 返信形式で投稿される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "それってあなたの感想ですよね？",
				targetPostNumber: 5,
			});
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					body: ">>5\nそれってあなたの感想ですよね？",
				}),
			);
		});

		it("ターゲットなし(0)の場合、>>N プレフィックスなしで投稿される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "なんかこのスレッド面白いっすね",
				targetPostNumber: 0,
			});
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					body: "なんかこのスレッド面白いっすね",
				}),
			);
		});
	});

	// =========================================================================
	// 失敗パス: 通貨返却 + システム通知 + pending削除
	// See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
	// =========================================================================

	describe("失敗パス (success: false)", () => {
		it("success=false, error を返す", async () => {
			const { deps } = createCompleteDeps();
			const result = await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
				error: "AI API timeout",
				targetPostNumber: 0,
			});
			expect(result.success).toBe(false);
			expect(result.error).toBe("AI API timeout");
			expect(result.pendingId).toBe("pending-001");
		});

		it("失敗時にBOTは生成されない", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
				error: "timeout",
				targetPostNumber: 0,
			});
			expect(mocks.createBotFn).not.toHaveBeenCalled();
		});

		it("失敗時に通貨返却（10）が呼ばれる", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-to-refund",
				success: false,
				error: "timeout",
				targetPostNumber: 0,
			});
			expect(mocks.creditFn).toHaveBeenCalledWith(
				"user-to-refund",
				10,
				"hiroyuki_api_failure",
			);
		});

		it("失敗時にエラー通知が★システム名義で投稿される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-error",
				invokerUserId: "user-001",
				success: false,
				error: "timeout",
				targetPostNumber: 0,
			});
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-error",
					body: expect.stringContaining("ひろゆきの召喚に失敗しました"),
					displayName: "★システム",
					isBotWrite: true,
					isSystemMessage: true,
				}),
			);
		});

		it("失敗時に pending が削除される（無限リトライ防止）", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeHiroyukiCommand(deps, {
				pendingId: "pending-fail",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
				error: "some error",
				targetPostNumber: 0,
			});
			expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith(
				"pending-fail",
			);
		});

		it("error が undefined の場合、'Unknown error' にフォールバックする", async () => {
			const { deps } = createCompleteDeps();
			const result = await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
				targetPostNumber: 0,
			});
			expect(result.error).toBe("Unknown error");
		});
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("success: true でも generatedText が undefined の場合は失敗フローを実行する", async () => {
			const { deps, mocks } = createCompleteDeps();
			const result = await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				targetPostNumber: 0,
				// generatedText を省略
			});
			expect(result.success).toBe(false);
			expect(mocks.creditFn).toHaveBeenCalled();
			expect(mocks.createBotFn).not.toHaveBeenCalled();
		});

		it("success: true でも generatedText が空文字の場合は失敗フローを実行する", async () => {
			const { deps, mocks } = createCompleteDeps();
			const result = await completeHiroyukiCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "",
				targetPostNumber: 0,
			});
			expect(result.success).toBe(false);
			expect(mocks.creditFn).toHaveBeenCalled();
			expect(mocks.createBotFn).not.toHaveBeenCalled();
		});
	});
});

// ---------------------------------------------------------------------------
// getHiroyukiPendings テストスイート
// ---------------------------------------------------------------------------

describe("getHiroyukiPendings", () => {
	it("commandType='hiroyuki' で findByCommandType を呼ぶ", async () => {
		const findByCommandType = vi.fn().mockResolvedValue([]);
		const deps: IHiroyukiPendingsDeps = {
			pendingAsyncCommandRepository: { findByCommandType },
		};
		await getHiroyukiPendings(deps);
		expect(findByCommandType).toHaveBeenCalledWith("hiroyuki");
	});

	it("pending リストをそのまま返す", async () => {
		const mockPendings = [
			{
				id: "pending-001",
				commandType: "hiroyuki",
				threadId: "thread-001",
				targetPostNumber: 5,
				invokerUserId: "user-001",
				payload: { model_id: "gemini-3-flash-preview", targetPostNumber: 5 },
				createdAt: new Date(),
			},
		];
		const findByCommandType = vi.fn().mockResolvedValue(mockPendings);
		const deps: IHiroyukiPendingsDeps = {
			pendingAsyncCommandRepository: { findByCommandType },
		};
		const result = await getHiroyukiPendings(deps);
		expect(result).toEqual(mockPendings);
	});
});
