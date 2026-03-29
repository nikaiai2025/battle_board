/**
 * !help コマンドハンドラの単体テスト
 *
 * See: src/lib/services/handlers/help-handler.ts
 * See: features/command_system.feature @hidden_command
 */

import { describe, expect, it } from "vitest";
import type {
	CommandContext,
	CommandsYaml,
} from "../../../../lib/services/command-service";
import { HelpHandler } from "../../../../lib/services/handlers/help-handler";

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

/** 最小限のコマンド設定 */
const testConfig: CommandsYaml = {
	commands: {
		tell: {
			description: "指定レスをAIだと告発する",
			cost: 10,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
		w: {
			description: "指定レスに草を生やす",
			cost: 0,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
		abeshinzo: {
			description: "意味のないコマンド",
			cost: 0,
			targetFormat: null,
			enabled: true,
			stealth: false,
			hidden: true,
		},
		help: {
			description: "案内板の内容を表示",
			cost: 0,
			targetFormat: null,
			enabled: true,
			stealth: false,
		},
		disabled_cmd: {
			description: "無効コマンド",
			cost: 5,
			targetFormat: null,
			enabled: false,
			stealth: false,
		},
	},
};

/** ダミーコンテキスト */
const dummyCtx: CommandContext = {
	args: [],
	postId: "post-1",
	threadId: "thread-1",
	userId: "user-1",
	dailyId: "test-daily-id",
};

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("HelpHandler", () => {
	it("commandName が 'help' である", () => {
		const handler = new HelpHandler(testConfig);
		expect(handler.commandName).toBe("help");
	});

	it("実行結果が success=true で eliminationNotice に案内テキストを含む", async () => {
		const handler = new HelpHandler(testConfig);
		const result = await handler.execute(dummyCtx);

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.eliminationNotice).toBeDefined();
		expect(result.eliminationNotice).toContain("ボットちゃんねる 案内板");
	});

	it("有効な非隠しコマンドのみが案内テキストに含まれる", async () => {
		const handler = new HelpHandler(testConfig);
		const result = await handler.execute(dummyCtx);
		const body = result.eliminationNotice!;

		// 有効・非隠しコマンドは含まれる
		expect(body).toContain("!tell");
		expect(body).toContain("!w");

		// 公開コマンド !help 自身も含まれる
		expect(body).toContain("!help");

		// 隠しコマンドは含まれない
		expect(body).not.toContain("!abeshinzo");

		// 無効コマンドは含まれない
		expect(body).not.toContain("!disabled_cmd");
	});

	it("コスト0のコマンドは「無料」と表示される", async () => {
		const handler = new HelpHandler(testConfig);
		const result = await handler.execute(dummyCtx);
		const body = result.eliminationNotice!;

		expect(body).toContain("無料");
	});

	it("コスト10のコマンドは「10コイン」と表示される", async () => {
		const handler = new HelpHandler(testConfig);
		const result = await handler.execute(dummyCtx);
		const body = result.eliminationNotice!;

		expect(body).toContain("10コイン");
	});

	it("/mypage リンクが含まれる", async () => {
		const handler = new HelpHandler(testConfig);
		const result = await handler.execute(dummyCtx);

		expect(result.eliminationNotice).toContain("/mypage");
	});
});
