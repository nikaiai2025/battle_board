/**
 * IamsystemHandler 単体テスト
 *
 * !iamsystem コマンドハンドラの振る舞いを検証する。
 * ステルスコマンドの初実装であり、postFieldOverrides を返す唯一のハンドラ。
 *
 * See: features/command_iamsystem.feature
 * See: docs/architecture/components/command.md S5 ステルスコマンドの設計原則
 */

import { describe, expect, it } from "vitest";
import type { CommandContext } from "../../../../lib/services/command-service";
import { IamsystemHandler } from "../../../../lib/services/handlers/iamsystem-handler";

describe("IamsystemHandler", () => {
	const handler = new IamsystemHandler();

	// --- 基本プロパティ ---

	it("commandName が 'iamsystem' である", () => {
		expect(handler.commandName).toBe("iamsystem");
	});

	// --- 成功時の振る舞い ---
	// See: features/command_iamsystem.feature @成功時に表示名とIDがシステム風に変更される

	it("成功時に postFieldOverrides で表示名を★システムに設定する", async () => {
		const ctx: CommandContext = {
			args: [],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		};

		const result = await handler.execute(ctx);

		expect(result.success).toBe(true);
		expect(result.postFieldOverrides).toBeDefined();
		expect(result.postFieldOverrides?.displayName).toBe("★システム");
	});

	it("成功時に postFieldOverrides で dailyId を SYSTEM に設定する", async () => {
		const ctx: CommandContext = {
			args: [],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		};

		const result = await handler.execute(ctx);

		expect(result.postFieldOverrides?.dailyId).toBe("SYSTEM");
	});

	// --- systemMessage ---
	// ステルスコマンドはインラインメッセージを出さない

	it("systemMessage が null である（ステルスコマンドは通知しない）", async () => {
		const ctx: CommandContext = {
			args: [],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		};

		const result = await handler.execute(ctx);

		expect(result.systemMessage).toBeNull();
	});

	// --- 常に成功する ---
	// 通貨チェックは CommandService の共通処理で完了済み

	it("常に success: true を返す", async () => {
		const ctx: CommandContext = {
			args: [],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		};

		const result = await handler.execute(ctx);

		expect(result.success).toBe(true);
	});

	// --- 引数の無視 ---

	it("引数があっても無視して同じ結果を返す", async () => {
		const ctx: CommandContext = {
			args: [">>5", "extra"],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		};

		const result = await handler.execute(ctx);

		expect(result.success).toBe(true);
		expect(result.postFieldOverrides?.displayName).toBe("★システム");
		expect(result.postFieldOverrides?.dailyId).toBe("SYSTEM");
	});

	// --- eliminationNotice / independentMessage が無い ---

	it("eliminationNotice と independentMessage を返さない", async () => {
		const ctx: CommandContext = {
			args: [],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		};

		const result = await handler.execute(ctx);

		expect(result.eliminationNotice).toBeUndefined();
		expect(result.independentMessage).toBeUndefined();
	});
});
