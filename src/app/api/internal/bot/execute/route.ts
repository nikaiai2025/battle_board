/**
 * POST /api/internal/bot/execute — BOT投稿実行 Internal API
 *
 * Cloudflare Workers の scheduled ハンドラと GitHub Actions bot-scheduler から呼ばれる。
 * 投稿対象のBOT（is_active=true AND next_post_at <= NOW()）を取得し、
 * 各BOTに対して executeBotPost() を実行する。あわせてチュートリアルBOT pending と
 * `!aori` pending も処理する。
 *
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: docs/architecture/components/bot.md §2.1 書き込み実行
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 *
 * 制約: Vercel Hobby のタイムアウトは 10 秒。
 *        投稿対象BOT数が多い場合は上限を設けて制限する。
 */

import { NextResponse } from "next/server";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { createBotService } from "@/lib/services/bot-service";

/** 1回のAPI呼び出しで処理するBOTの上限数（Vercel 10秒タイムアウト対策） */
const MAX_BOTS_PER_EXECUTION = 5;

/**
 * BOT投稿を実行する。
 *
 * 処理フロー:
 *   1. Bearer 認証チェック
 *   2. getActiveBotsDueForPost() で投稿対象BOTを取得
 *   3. 上限数まで各BOTに executeBotPost() を実行
 *   4. processPendingTutorials() でチュートリアルBOT pending を処理
 *   5. 結果をJSONで返す
 *
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
 */
export async function POST(request: Request): Promise<NextResponse> {
	// Step 1: Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Step 2: BotService を生成して投稿対象BOTを取得
		const botService = createBotService();
		const dueBots = await botService.getActiveBotsDueForPost();

		// Step 3: 上限数まで処理（Vercel タイムアウト対策）
		const botsToProcess = dueBots.slice(0, MAX_BOTS_PER_EXECUTION);
		const results: Array<{
			botId: string;
			success: boolean;
			postId?: string;
			postNumber?: number;
			skipped?: boolean;
			error?: string;
		}> = [];

		let successCount = 0;
		let failureCount = 0;
		let skippedCount = 0;

		for (const bot of botsToProcess) {
			try {
				const result = await botService.executeBotPost(bot.id);
				if (result === null) {
					// next_post_at 未到達でスキップされた
					results.push({ botId: bot.id, success: true, skipped: true });
					skippedCount++;
				} else {
					results.push({
						botId: bot.id,
						success: true,
						postId: result.postId,
						postNumber: result.postNumber,
					});
					successCount++;
				}
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				results.push({
					botId: bot.id,
					success: false,
					error: errorMessage,
				});
				failureCount++;
			}
		}

		// Step 4: チュートリアルBOT pending 処理
		// subrequest 上限超過でも BOT投稿の成功分が500にならないよう個別 try-catch で囲む
		// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
		// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
		// See: tmp/reports/INCIDENT-CRON500.md
		let tutorialResult: Awaited<
			ReturnType<typeof botService.processPendingTutorials>
		> | null = null;
		try {
			tutorialResult = await botService.processPendingTutorials();
		} catch (tutorialErr) {
			// チュートリアル処理の失敗はBOT投稿結果に影響させない
			console.error(
				"[POST /api/internal/bot/execute] processPendingTutorials failed:",
				tutorialErr,
			);
		}

		// Step 5: 煽りBOT pending 処理
		// Step 4 と同じ個別 try-catch パターン（INCIDENT-CRON500 対応）
		// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
		let aoriResult: Awaited<
			ReturnType<typeof botService.processAoriCommands>
		> | null = null;
		try {
			aoriResult = await botService.processAoriCommands();
		} catch (aoriErr) {
			console.error(
				"[POST /api/internal/bot/execute] processAoriCommands failed:",
				aoriErr,
			);
		}

		// Step 6: 結果をJSONで返す
		return NextResponse.json({
			totalDue: dueBots.length,
			processed: botsToProcess.length,
			successCount,
			failureCount,
			skippedCount,
			results,
			tutorials: tutorialResult,
			aori: aoriResult,
		});
	} catch (err) {
		console.error("[POST /api/internal/bot/execute] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "BOT投稿実行中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
