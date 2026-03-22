/**
 * LivingBotHandler 単体テスト
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §2, §6
 *
 * v2: スレッド内カウントを追加。出力フォーマットを変更。
 */

import { describe, expect, it } from "vitest";
import type { CommandContext } from "../../../../lib/services/command-service";
import {
	type ILivingBotBotRepository,
	LivingBotHandler,
} from "../../../../lib/services/handlers/livingbot-handler";

// ---------------------------------------------------------------------------
// モックリポジトリファクトリ
// ---------------------------------------------------------------------------

/**
 * テスト用の ILivingBotBotRepository モックを生成する。
 */
function createMockRepository(
	boardCount: number,
	threadCount: number,
): ILivingBotBotRepository {
	return {
		countLivingBots: async () => boardCount,
		countLivingBotsInThread: async (_threadId: string) => threadCount,
	};
}

/**
 * テスト用の CommandContext を生成する。
 */
function createMockContext(
	overrides?: Partial<CommandContext>,
): CommandContext {
	return {
		args: [],
		postId: "00000000-0000-0000-0000-000000000001",
		threadId: "00000000-0000-0000-0000-000000000002",
		userId: "00000000-0000-0000-0000-000000000003",
		dailyId: "testDlyI",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("LivingBotHandler", () => {
	// See: features/command_livingbot.feature @掲示板全体とスレッド内の生存BOT数がマージ表示される
	it("commandName が 'livingbot' である", () => {
		const handler = new LivingBotHandler(createMockRepository(0, 0));
		expect(handler.commandName).toBe("livingbot");
	});

	// See: features/command_livingbot.feature @掲示板全体とスレッド内の生存BOT数がマージ表示される
	it("v2フォーマットで掲示板全体とスレッド内のカウントを返す", async () => {
		const handler = new LivingBotHandler(createMockRepository(5, 2));
		const result = await handler.execute(createMockContext());

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe(
			"🤖 生存BOT — 掲示板全体: 5体 / このスレッド: 2体",
		);
	});

	// See: features/command_livingbot.feature @全BOTが撃破済みの場合は0体と表示される
	it("掲示板全体0体・スレッド内0体の場合", async () => {
		const handler = new LivingBotHandler(createMockRepository(0, 0));
		const result = await handler.execute(createMockContext());

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe(
			"🤖 生存BOT — 掲示板全体: 0体 / このスレッド: 0体",
		);
	});

	// See: features/command_livingbot.feature @スレッド内にBOTの書き込みがない場合は0体と表示される
	it("掲示板全体に存在するがスレッド内には0体の場合", async () => {
		const handler = new LivingBotHandler(createMockRepository(10, 0));
		const result = await handler.execute(createMockContext());

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe(
			"🤖 生存BOT — 掲示板全体: 10体 / このスレッド: 0体",
		);
	});

	// See: features/command_livingbot.feature @撃破済みBOTはスレッド内カウントにも含まれない
	it("スレッド内カウントが掲示板全体より小さい場合", async () => {
		const handler = new LivingBotHandler(createMockRepository(7, 3));
		const result = await handler.execute(createMockContext());

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe(
			"🤖 生存BOT — 掲示板全体: 7体 / このスレッド: 3体",
		);
	});

	// See: features/command_livingbot.feature @掲示板全体のカウントはどのスレッドから実行しても同じ結果になる
	it("ctx.threadId がリポジトリに渡される", async () => {
		let capturedThreadId = "";
		const mockRepo: ILivingBotBotRepository = {
			countLivingBots: async () => 5,
			countLivingBotsInThread: async (threadId: string) => {
				capturedThreadId = threadId;
				return 2;
			},
		};

		const handler = new LivingBotHandler(mockRepo);
		const ctx = createMockContext({
			threadId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		});
		await handler.execute(ctx);

		expect(capturedThreadId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
	});

	// 境界値: 大きな数値
	it("大きなカウント値でもフォーマットが正しい", async () => {
		const handler = new LivingBotHandler(createMockRepository(10000, 999));
		const result = await handler.execute(createMockContext());

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe(
			"🤖 生存BOT — 掲示板全体: 10000体 / このスレッド: 999体",
		);
	});
});
