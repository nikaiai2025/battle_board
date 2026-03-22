/**
 * POST /api/internal/newspaper/process — !newspaper 非同期処理 Internal API
 *
 * GitHub Actions Cron ジョブ（newspaper-scheduler）から呼ばれる。
 * pending_async_commands から "newspaper" エントリを取得し、
 * AI API でニュースを取得して★システムレスとして投稿する。
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §3.3
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 * タイムアウト対策: MAX_PROCESS_PER_EXECUTION=1（newspaper-service.ts 内で制御）
 */

import { NextResponse } from "next/server";
import type { CreditReason } from "@/lib/domain/models/currency";
import { GoogleAiAdapter } from "@/lib/infrastructure/adapters/google-ai-adapter";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { credit } from "@/lib/services/currency-service";
import { processNewspaperCommands } from "@/lib/services/newspaper-service";
import type { PostInput } from "@/lib/services/post-service";
import { createPost } from "@/lib/services/post-service";

/**
 * !newspaper pending 処理を実行する。
 *
 * 処理フロー:
 *   1. Bearer 認証チェック
 *   2. GoogleAiAdapter を初期化
 *   3. processNewspaperCommands を実行
 *   4. 結果を JSON で返す
 *
 * See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
 */
export async function POST(request: Request): Promise<NextResponse> {
	// Step 1: Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Step 2: GoogleAiAdapter を初期化（GEMINI_API_KEY は Vercel 環境変数で設定）
		const googleAiAdapter = new GoogleAiAdapter(
			process.env.GEMINI_API_KEY ?? "",
		);

		// Step 3: newspaper pending 処理を実行
		const result = await processNewspaperCommands({
			pendingAsyncCommandRepository: PendingAsyncCommandRepo,
			googleAiAdapter,
			// createPost の戻り型を DI インターフェースに合わせてアダプター
			createPostFn: async (params) => {
				const postInput: PostInput = {
					threadId: params.threadId,
					body: params.body,
					edgeToken: params.edgeToken,
					ipHash: params.ipHash,
					displayName: params.displayName,
					isBotWrite: params.isBotWrite,
					isSystemMessage: params.isSystemMessage,
				};
				const postResult = await createPost(postInput);
				if ("success" in postResult && postResult.success) {
					return { success: true, postId: postResult.postId };
				}
				throw new Error(
					"error" in postResult ? postResult.error : "createPost failed",
				);
			},
			// CreditReason の型制約を満たすためキャスト
			creditFn: (userId, amount, reason) =>
				credit(userId, amount, reason as CreditReason),
		});

		return NextResponse.json(result);
	} catch (err) {
		console.error(
			"[POST /api/internal/newspaper/process] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "newspaper処理中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
