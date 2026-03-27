/**
 * GET /api/internal/hiroyuki/pending -- !hiroyuki 未処理キュー取得 Internal API
 *
 * GitHub Actions hiroyuki-worker から呼ばれる。
 * pending_async_commands から "hiroyuki" エントリを全件返す。
 * 各 pending の threadId に対応するスレッド全レスも返却する
 * （worker がスレッドコンテキストを構築するために必要）。
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/tasks/task_TASK-335.md §2a
 */

import { NextResponse } from "next/server";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import * as PostRepo from "@/lib/infrastructure/repositories/post-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";

/**
 * !hiroyuki の pending リストを返す。
 * 各 pending に対応するスレッドの全レスも含めて返却する。
 *
 * See: features/command_hiroyuki.feature @ターゲット指定時、対象ユーザーの全レスがAI APIに渡される
 */
export async function GET(request: Request): Promise<NextResponse> {
	// Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const pendingList =
			await PendingAsyncCommandRepo.findByCommandType("hiroyuki");

		// 各 pending の threadId に対応するスレッド全レスを取得
		// Worker がプロンプト構築に使用する
		// See: features/command_hiroyuki.feature @AI APIにスレッドの全レステキストがコンテキストとして渡される
		const threadPostsMap: Record<
			string,
			Array<{
				postNumber: number;
				authorId: string | null;
				dailyId: string;
				body: string;
				displayName: string;
				isSystemMessage: boolean;
				isDeleted: boolean;
			}>
		> = {};

		// 重複スレッドIDの取得を防ぐ
		const uniqueThreadIds = [...new Set(pendingList.map((p) => p.threadId))];

		for (const threadId of uniqueThreadIds) {
			const posts = await PostRepo.findByThreadId(threadId);
			threadPostsMap[threadId] = posts.map((p) => ({
				postNumber: p.postNumber,
				authorId: p.authorId,
				dailyId: p.dailyId,
				body: p.body,
				displayName: p.displayName,
				isSystemMessage: p.isSystemMessage,
				isDeleted: p.isDeleted,
			}));
		}

		return NextResponse.json({ pendingList, threadPostsMap });
	} catch (err) {
		console.error("[GET /api/internal/hiroyuki/pending] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "pending取得中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
