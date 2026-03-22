/**
 * GET /api/internal/newspaper/pending — !newspaper 未処理キュー取得 Internal API
 *
 * GitHub Actions newspaper-worker から呼ばれる。
 * pending_async_commands から "newspaper" エントリを全件返す。
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §2.2
 */

import { NextResponse } from "next/server";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";

/**
 * !newspaper の pending リストを返す。
 *
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §2.2
 */
export async function GET(request: Request): Promise<NextResponse> {
	// Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const pendingList =
			await PendingAsyncCommandRepo.findByCommandType("newspaper");

		return NextResponse.json({ pendingList });
	} catch (err) {
		console.error(
			"[GET /api/internal/newspaper/pending] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "pending取得中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
