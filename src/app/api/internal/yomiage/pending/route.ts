/**
 * GET /api/internal/yomiage/pending -- !yomiage 未処理キュー取得 Internal API
 *
 * GH Actions yomiage-worker から呼ばれる。
 * pending_async_commands から commandType="yomiage" のエントリを返す。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: docs/architecture/components/yomiage.md §2.3
 * See: docs/architecture/components/yomiage.md §5.1
 * See: docs/architecture/components/yomiage.md §6.1
 */

import { NextResponse } from "next/server";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";

/**
 * !yomiage の pending リストを返す。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 */
export async function GET(request: Request): Promise<NextResponse> {
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const pendingList =
			await PendingAsyncCommandRepo.findByCommandType("yomiage");
		return NextResponse.json({ pendingList });
	} catch (err) {
		console.error("[GET /api/internal/yomiage/pending] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "pending取得中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
