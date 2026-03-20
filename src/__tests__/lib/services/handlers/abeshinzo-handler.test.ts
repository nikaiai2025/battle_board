import { describe, expect, it } from "vitest";
import { AbeshinzoHandler } from "../../../../lib/services/handlers/abeshinzo-handler";

describe("AbeshinzoHandler", () => {
	const handler = new AbeshinzoHandler();

	it("commandName が 'abeshinzo' である", () => {
		expect(handler.commandName).toBe("abeshinzo");
	});

	it("固定メッセージを eliminationNotice（独立システムレス）として返す", async () => {
		const result = await handler.execute({
			args: [],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		});

		expect(result).toEqual({
			success: true,
			systemMessage: null,
			eliminationNotice: "意味のないコマンドだよ",
		});
	});

	it("引数があっても無視して同じ結果を返す", async () => {
		const result = await handler.execute({
			args: [">>5", "extra"],
			postId: "post-1",
			threadId: "thread-1",
			userId: "user-1",
			dailyId: "test-daily-id",
		});

		expect(result.eliminationNotice).toBe("意味のないコマンドだよ");
	});
});
