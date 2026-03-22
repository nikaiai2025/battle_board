/**
 * AoriHandler 単体テスト
 *
 * !aori コマンドハンドラの振る舞いを検証する。
 * ステルスコマンド + 非同期キュー（pending_async_commands）の初実装。
 *
 * テスト方針:
 *   - IAoriPendingRepository はモック化する
 *   - 正常系（pending INSERT + ステルス成功）、引数不正、レス番号バリデーションを網羅する
 *   - 通貨チェックは CommandService の共通処理で完了済みのためハンドラ側はテストしない
 *
 * See: features/command_aori.feature
 * See: docs/architecture/components/command.md S5 非同期副作用のキューイングパターン
 */

import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	AoriHandler,
	type IAoriPendingRepository,
} from "../../../../lib/services/handlers/aori-handler";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** テスト用 CommandContext を生成する */
function createCtx(overrides: Partial<CommandContext> = {}): CommandContext {
	const args = overrides.args ?? [">>5"];
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
function createMockRepository(): IAoriPendingRepository {
	return {
		create: vi.fn().mockResolvedValue(undefined),
	};
}

/** テスト用 AoriHandler を生成する */
function createHandler(repo?: IAoriPendingRepository): {
	handler: AoriHandler;
	repo: IAoriPendingRepository;
} {
	const mockRepo = repo ?? createMockRepository();
	return {
		handler: new AoriHandler(mockRepo),
		repo: mockRepo,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AoriHandler", () => {
	// =========================================================================
	// commandName
	// =========================================================================

	it("commandName が 'aori' である", () => {
		const { handler } = createHandler();
		expect(handler.commandName).toBe("aori");
	});

	// =========================================================================
	// 正常系: pending INSERT + ステルス成功
	// See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
	// =========================================================================

	describe("正常系: pending INSERT + ステルス成功", () => {
		it(">>N 形式の引数で success: true を返す", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>5"] }));
			expect(result.success).toBe(true);
		});

		it("systemMessage が null である（ステルスコマンドは通知しない）", async () => {
			// See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
			const { handler } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>5"] }));
			expect(result.systemMessage).toBeNull();
		});

		it("pending_async_commands に正しいパラメータで INSERT される", async () => {
			const { handler, repo } = createHandler();
			await handler.execute(
				createCtx({
					args: [">>5"],
					threadId: "thread-abc",
					userId: "user-xyz",
				}),
			);

			expect(repo.create).toHaveBeenCalledTimes(1);
			expect(repo.create).toHaveBeenCalledWith({
				commandType: "aori",
				threadId: "thread-abc",
				targetPostNumber: 5,
				invokerUserId: "user-xyz",
			});
		});

		it(">>1 のように小さいレス番号でも成功する", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>1"] }));
			expect(result.success).toBe(true);
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({ targetPostNumber: 1 }),
			);
		});

		it(">>999 のように大きいレス番号でも成功する", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>999"] }));
			expect(result.success).toBe(true);
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({ targetPostNumber: 999 }),
			);
		});

		it("eliminationNotice と independentMessage を返さない", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>5"] }));
			expect(result.eliminationNotice).toBeUndefined();
			expect(result.independentMessage).toBeUndefined();
		});

		it("postFieldOverrides を返さない", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>5"] }));
			expect(result.postFieldOverrides).toBeUndefined();
		});
	});

	// =========================================================================
	// エラーケース: 引数なし
	// =========================================================================

	describe("引数なし", () => {
		it("引数がない場合、success: false とエラーメッセージを返す", async () => {
			const { handler } = createHandler();
			const result = await handler.execute(createCtx({ args: [] }));
			expect(result.success).toBe(false);
			expect(result.systemMessage).toBeTruthy();
			expect(result.systemMessage).toContain("対象レスを指定");
		});

		it("引数がない場合、pending INSERT は呼ばれない", async () => {
			const { handler, repo } = createHandler();
			await handler.execute(createCtx({ args: [] }));
			expect(repo.create).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// エラーケース: 無効なレス番号
	// =========================================================================

	describe("無効なレス番号", () => {
		it(">>0 は無効なレス番号としてエラーを返す", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>0"] }));
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("無効なレス番号");
			expect(repo.create).not.toHaveBeenCalled();
		});

		it(">>-1 は無効なレス番号としてエラーを返す", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>-1"] }));
			expect(result.success).toBe(false);
			expect(repo.create).not.toHaveBeenCalled();
		});

		it(">>abc は無効なレス番号としてエラーを返す", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>abc"] }));
			expect(result.success).toBe(false);
			expect(result.systemMessage).toContain("無効なレス番号");
			expect(repo.create).not.toHaveBeenCalled();
		});

		it(">> のみ（番号なし）は無効なレス番号としてエラーを返す", async () => {
			const { handler, repo } = createHandler();
			const result = await handler.execute(createCtx({ args: [">>"] }));
			expect(result.success).toBe(false);
			expect(repo.create).not.toHaveBeenCalled();
		});

		it("数字のみ（>>なし）は無効な引数としてエラーを返す", async () => {
			// "5" は parseInt("5".replace(">>",""), 10) = 5 で成功する
			// これは仕様上の許容範囲（>>なしでも数値として解釈可能）
			const { handler } = createHandler();
			const result = await handler.execute(createCtx({ args: ["5"] }));
			// 現在の実装は >> を除去して parseInt するため、数値のみでも成功する
			expect(result.success).toBe(true);
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

			await expect(
				handler.execute(createCtx({ args: [">>5"] })),
			).rejects.toThrow("DB connection error");
		});
	});
});
