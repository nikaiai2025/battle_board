/**
 * GET /api/internal/yomiage/target -- !yomiage 対象レス取得 Internal API
 *
 * GH Actions yomiage-worker が対象レス本文を都度取得するために使用する。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: docs/architecture/components/yomiage.md §5.1
 * See: docs/architecture/components/yomiage.md §6.1
 */

import { NextResponse } from "next/server";
import * as PostRepo from "@/lib/infrastructure/repositories/post-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";

/**
 * 指定スレッド・レス番号の本文と状態を返す。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 */
export async function GET(request: Request): Promise<NextResponse> {
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const url = new URL(request.url);
		const threadId = url.searchParams.get("threadId");
		const postNumberParam = url.searchParams.get("postNumber");
		const postNumber = Number.parseInt(postNumberParam ?? "", 10);

		if (!threadId || Number.isNaN(postNumber) || postNumber <= 0) {
			return NextResponse.json(
				{
					error: "BAD_REQUEST",
					message: "threadId と postNumber を正しく指定してください",
				},
				{ status: 400 },
			);
		}

		const post = await PostRepo.findByThreadIdAndPostNumber(threadId, postNumber);

		if (!post) {
			return NextResponse.json({ post: null });
		}

		return NextResponse.json({
			post: {
				body: post.body,
				isDeleted: post.isDeleted,
				isSystemMessage: post.isSystemMessage,
			},
		});
	} catch (err) {
		console.error("[GET /api/internal/yomiage/target] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "対象レス取得中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
