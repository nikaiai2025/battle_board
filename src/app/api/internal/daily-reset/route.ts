/**
 * POST /api/internal/daily-reset — 日次リセット Internal API
 *
 * GitHub Actions cron ジョブ（daily-maintenance）から呼ばれる。
 * BotService.performDailyReset() を実行し、結果をJSONで返す。
 *
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
 * See: docs/specs/bot_state_transitions.yaml #daily_reset
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 */

import { NextResponse } from "next/server";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { createBotService } from "@/lib/services/bot-service";

/**
 * 日次リセットを実行する。
 *
 * 処理フロー:
 *   1. Bearer 認証チェック
 *   2. BotService.performDailyReset() を実行
 *   3. 結果をJSONで返す
 *
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
 */
export async function POST(request: Request): Promise<NextResponse> {
	// Step 1: Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Step 2: BotService を生成して日次リセットを実行
		const botService = createBotService();
		const result = await botService.performDailyReset();

		// Step 3: 結果をJSONで返す
		return NextResponse.json({
			success: true,
			botsRevealed: result.botsRevealed,
			botsRevived: result.botsRevived,
			idsRegenerated: result.idsRegenerated,
		});
	} catch (err) {
		console.error("[POST /api/internal/daily-reset] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "日次リセット実行中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
