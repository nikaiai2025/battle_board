/**
 * newspaper-service 単体テスト
 *
 * processNewspaperCommands:
 *   !newspaper コマンドの Cron 処理（非同期フェーズ）を検証する。
 *   AI API 呼び出し → ★システムレス投稿 → pending 削除のフロー、
 *   エラー時の通貨返却・システム通知を確認する。
 *
 * completeNewspaperCommand:
 *   GH Actions から AI 生成結果を受け取り、DB 書き込みを行う関数を検証する。
 *   成功時の投稿・pending 削除、失敗時の通貨返却・エラー通知・pending 削除を確認する。
 *
 * テスト方針:
 *   - 全依存は DI でモック化する
 *   - 正常系・AI API 失敗・通貨返却を網羅する
 *   - MAX_PROCESS_PER_EXECUTION=1 の挙動を検証する
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.2
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §3.2
 */

import { describe, expect, it, vi } from "vitest";
import { NEWSPAPER_SYSTEM_PROMPT } from "../../../../config/newspaper-prompt";
// Note: config/ はプロジェクトルートにある（src/ の兄弟ディレクトリ）
import type { IGoogleAiAdapter } from "../../../lib/infrastructure/adapters/google-ai-adapter";
import {
	completeNewspaperCommand,
	type INewspaperCompleteDeps,
	type INewspaperServiceDeps,
	processNewspaperCommands,
} from "../../../lib/services/newspaper-service";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 PendingAsyncCommand を生成する */
function createPending(
	overrides: Partial<{
		id: string;
		commandType: string;
		threadId: string;
		targetPostNumber: number;
		invokerUserId: string;
		payload: Record<string, unknown> | null;
		createdAt: Date;
	}> = {},
) {
	return {
		id: "pending-001",
		commandType: "newspaper",
		threadId: "thread-001",
		targetPostNumber: 0,
		invokerUserId: "user-001",
		payload: { category: "IT", model_id: "gemini-3-flash-preview" },
		createdAt: new Date(),
		...overrides,
	};
}

/** テスト用モック依存を生成する */
function createDeps(overrides: Partial<INewspaperServiceDeps> = {}): {
	deps: INewspaperServiceDeps;
	mocks: {
		findByCommandType: ReturnType<typeof vi.fn>;
		deletePendingAsyncCommand: ReturnType<typeof vi.fn>;
		generateWithSearch: ReturnType<typeof vi.fn>;
		createPostFn: ReturnType<typeof vi.fn>;
		creditFn: ReturnType<typeof vi.fn>;
	};
} {
	const findByCommandType = vi.fn().mockResolvedValue([]);
	const deletePendingAsyncCommand = vi.fn().mockResolvedValue(undefined);
	const generateWithSearch = vi.fn().mockResolvedValue({
		text: "【ITニュース速報】\nテスト記事\n\nソース: テスト",
		searchQueries: ["テスト検索"],
	});
	const createPostFn = vi
		.fn()
		.mockResolvedValue({ success: true, postId: "post-system-001" });
	const creditFn = vi.fn().mockResolvedValue(undefined);

	const deps: INewspaperServiceDeps = {
		pendingAsyncCommandRepository: {
			findByCommandType,
			deletePendingAsyncCommand,
		},
		googleAiAdapter: { generateWithSearch } as IGoogleAiAdapter,
		createPostFn,
		creditFn,
		...overrides,
	};

	return {
		deps,
		mocks: {
			findByCommandType,
			deletePendingAsyncCommand,
			generateWithSearch,
			createPostFn,
			creditFn,
		},
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("processNewspaperCommands", () => {
	// =========================================================================
	// 基本動作: pending なし
	// =========================================================================

	describe("pending が 0 件の場合", () => {
		it("processed=0, results=[] を返す", async () => {
			const { deps } = createDeps();
			const result = await processNewspaperCommands(deps);
			expect(result).toEqual({ processed: 0, results: [] });
		});

		it("AI API を呼び出さない", async () => {
			const { deps, mocks } = createDeps();
			await processNewspaperCommands(deps);
			expect(mocks.generateWithSearch).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 正常系: pending 1 件の処理
	// See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
	// =========================================================================

	describe("正常系: pending 1 件の処理", () => {
		it("processed=1, success=true を返す", async () => {
			const pending = createPending();
			const { deps } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			const result = await processNewspaperCommands(deps);
			expect(result.processed).toBe(1);
			expect(result.results[0].success).toBe(true);
		});

		it("AI API に NEWSPAPER_SYSTEM_PROMPT が渡される", async () => {
			const pending = createPending({
				payload: { category: "スポーツ", model_id: "gemini-3-flash-preview" },
			});
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			await processNewspaperCommands(deps);
			expect(mocks.generateWithSearch).toHaveBeenCalledWith(
				expect.objectContaining({ systemPrompt: NEWSPAPER_SYSTEM_PROMPT }),
			);
		});

		it("AI API にカテゴリが含まれるユーザープロンプトが渡される", async () => {
			const pending = createPending({
				payload: { category: "経済", model_id: "gemini-3-flash-preview" },
			});
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			await processNewspaperCommands(deps);
			const call = mocks.generateWithSearch.mock.calls[0][0];
			expect(call.userPrompt).toContain("経済");
		});

		it("★システム名義で createPostFn が呼ばれる", async () => {
			const pending = createPending({ threadId: "thread-xyz" });
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			await processNewspaperCommands(deps);
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-xyz",
					displayName: "★システム",
					isBotWrite: true,
					isSystemMessage: true,
				}),
			);
		});

		it("成功後に pending が削除される", async () => {
			const pending = createPending({ id: "pending-to-delete" });
			const deleteFn = vi.fn().mockResolvedValue(undefined);
			const { deps } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: deleteFn,
				},
			});
			await processNewspaperCommands(deps);
			expect(deleteFn).toHaveBeenCalledWith("pending-to-delete");
		});

		it("成功結果に postId が含まれる", async () => {
			const pending = createPending();
			const { deps } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			const result = await processNewspaperCommands(deps);
			expect(result.results[0].postId).toBe("post-system-001");
		});
	});

	// =========================================================================
	// MAX_PROCESS_PER_EXECUTION: 1 件のみ処理
	// See: tmp/workers/bdd-architect_271/newspaper_design.md §3.5
	// =========================================================================

	describe("MAX_PROCESS_PER_EXECUTION の制限", () => {
		it("pending が 2 件でも 1 件のみ処理する", async () => {
			const pending1 = createPending({ id: "pending-001" });
			const pending2 = createPending({ id: "pending-002" });
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending1, pending2]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			const result = await processNewspaperCommands(deps);
			// 処理件数は1件のみ
			expect(result.processed).toBe(1);
			expect(result.results.length).toBe(1);
			// AI API は1回のみ呼ばれる
			expect(mocks.generateWithSearch).toHaveBeenCalledTimes(1);
		});
	});

	// =========================================================================
	// AI API 失敗時のエラーハンドリング
	// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
	// =========================================================================

	describe("AI API 失敗時のエラーハンドリング", () => {
		it("AI API 失敗時に通貨返却が呼ばれる", async () => {
			const pending = createPending({ invokerUserId: "user-to-refund" });
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
				googleAiAdapter: {
					generateWithSearch: vi.fn().mockRejectedValue(new Error("API Error")),
				},
			});
			await processNewspaperCommands(deps);
			expect(mocks.creditFn).toHaveBeenCalledWith(
				"user-to-refund",
				10,
				"newspaper_api_failure",
			);
		});

		it("AI API 失敗時にエラー通知が★システム名義で投稿される", async () => {
			const pending = createPending({ threadId: "thread-error" });
			const createPostFn = vi
				.fn()
				.mockResolvedValue({ success: true, postId: "post-error-001" });
			const { deps } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
				googleAiAdapter: {
					generateWithSearch: vi.fn().mockRejectedValue(new Error("API Error")),
				},
				createPostFn,
			});
			await processNewspaperCommands(deps);
			expect(createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-error",
					body: expect.stringContaining("ニュースの取得に失敗しました"),
					displayName: "★システム",
				}),
			);
		});

		it("AI API 失敗時に pending が削除される（無限リトライ防止）", async () => {
			const pending = createPending({ id: "pending-fail" });
			const deleteFn = vi.fn().mockResolvedValue(undefined);
			const { deps } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: deleteFn,
				},
				googleAiAdapter: {
					generateWithSearch: vi.fn().mockRejectedValue(new Error("API Error")),
				},
			});
			await processNewspaperCommands(deps);
			expect(deleteFn).toHaveBeenCalledWith("pending-fail");
		});

		it("AI API 失敗時に success: false を返す", async () => {
			const pending = createPending();
			const { deps } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
				googleAiAdapter: {
					generateWithSearch: vi
						.fn()
						.mockRejectedValue(new Error("Network timeout")),
				},
			});
			const result = await processNewspaperCommands(deps);
			expect(result.results[0].success).toBe(false);
			expect(result.results[0].error).toContain("Network timeout");
		});
	});

	// =========================================================================
	// ペイロードのフォールバック
	// =========================================================================

	describe("ペイロードのフォールバック", () => {
		it("payload が null の場合、カテゴリは 'IT' にフォールバックする", async () => {
			const pending = createPending({ payload: null });
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			await processNewspaperCommands(deps);
			const call = mocks.generateWithSearch.mock.calls[0][0];
			expect(call.userPrompt).toContain("IT");
		});

		it("payload に model_id がない場合、'gemini-3-flash-preview' にフォールバックする", async () => {
			const pending = createPending({ payload: { category: "科学" } });
			const { deps, mocks } = createDeps({
				pendingAsyncCommandRepository: {
					findByCommandType: vi.fn().mockResolvedValue([pending]),
					deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
				},
			});
			await processNewspaperCommands(deps);
			const call = mocks.generateWithSearch.mock.calls[0][0];
			expect(call.modelId).toBe("gemini-3-flash-preview");
		});
	});
});

// ---------------------------------------------------------------------------
// completeNewspaperCommand テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用 completeNewspaperCommand 依存モックを生成する */
function createCompleteDeps(overrides: Partial<INewspaperCompleteDeps> = {}): {
	deps: INewspaperCompleteDeps;
	mocks: {
		deletePendingAsyncCommand: ReturnType<typeof vi.fn>;
		createPostFn: ReturnType<typeof vi.fn>;
		creditFn: ReturnType<typeof vi.fn>;
	};
} {
	const deletePendingAsyncCommand = vi.fn().mockResolvedValue(undefined);
	const createPostFn = vi
		.fn()
		.mockResolvedValue({ success: true, postId: "post-complete-001" });
	const creditFn = vi.fn().mockResolvedValue(undefined);

	const deps: INewspaperCompleteDeps = {
		pendingAsyncCommandRepository: { deletePendingAsyncCommand },
		createPostFn,
		creditFn,
		...overrides,
	};

	return { deps, mocks: { deletePendingAsyncCommand, createPostFn, creditFn } };
}

// ---------------------------------------------------------------------------
// completeNewspaperCommand テストスイート
// ---------------------------------------------------------------------------

describe("completeNewspaperCommand", () => {
	// =========================================================================
	// 成功時フロー
	// See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
	// =========================================================================

	describe("成功時フロー (success: true)", () => {
		it("success=true, postId を返す", async () => {
			const { deps } = createCompleteDeps();
			const result = await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "【ITニュース速報】テスト記事",
			});
			expect(result.success).toBe(true);
			expect(result.postId).toBe("post-complete-001");
			expect(result.pendingId).toBe("pending-001");
		});

		it("★システム名義で createPostFn が呼ばれる", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-xyz",
				invokerUserId: "user-001",
				success: true,
				generatedText: "【ITニュース速報】テスト記事",
			});
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-xyz",
					body: "【ITニュース速報】テスト記事",
					displayName: "★システム",
					isBotWrite: true,
					isSystemMessage: true,
				}),
			);
		});

		it("成功後に pending が削除される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeNewspaperCommand(deps, {
				pendingId: "pending-to-delete",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
			});
			expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith(
				"pending-to-delete",
			);
		});

		it("成功時に creditFn は呼ばれない", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				generatedText: "テスト",
			});
			expect(mocks.creditFn).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// 失敗時フロー
	// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
	// =========================================================================

	describe("失敗時フロー (success: false)", () => {
		it("success=false, error を返す", async () => {
			const { deps } = createCompleteDeps();
			const result = await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
				error: "API rate limit exceeded",
			});
			expect(result.success).toBe(false);
			expect(result.error).toBe("API rate limit exceeded");
			expect(result.pendingId).toBe("pending-001");
		});

		it("失敗時に通貨返却が呼ばれる", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-to-refund",
				success: false,
				error: "timeout",
			});
			expect(mocks.creditFn).toHaveBeenCalledWith(
				"user-to-refund",
				10,
				"newspaper_api_failure",
			);
		});

		it("失敗時にエラー通知が★システム名義で投稿される", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-error",
				invokerUserId: "user-001",
				success: false,
				error: "timeout",
			});
			expect(mocks.createPostFn).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: "thread-error",
					body: expect.stringContaining("ニュースの取得に失敗しました"),
					displayName: "★システム",
				}),
			);
		});

		it("失敗時に pending が削除される（無限リトライ防止）", async () => {
			const { deps, mocks } = createCompleteDeps();
			await completeNewspaperCommand(deps, {
				pendingId: "pending-fail",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
				error: "some error",
			});
			expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith(
				"pending-fail",
			);
		});

		it("error が undefined の場合、'Unknown error' にフォールバックする", async () => {
			const { deps } = createCompleteDeps();
			const result = await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: false,
			});
			expect(result.error).toBe("Unknown error");
		});
	});

	// =========================================================================
	// エッジケース: success: true だが generatedText が空/undefined
	// =========================================================================

	describe("エッジケース", () => {
		it("success: true でも generatedText が undefined の場合は失敗フローを実行する", async () => {
			const { deps, mocks } = createCompleteDeps();
			const result = await completeNewspaperCommand(deps, {
				pendingId: "pending-001",
				threadId: "thread-001",
				invokerUserId: "user-001",
				success: true,
				// generatedText を省略
			});
			// generatedText がなければ失敗パスへ
			expect(result.success).toBe(false);
			expect(mocks.creditFn).toHaveBeenCalled();
		});
	});
});
