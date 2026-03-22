/**
 * POST /api/internal/newspaper/complete — !newspaper 処理結果書き込み Internal API
 *
 * GitHub Actions newspaper-worker から呼ばれる。
 * AI 生成結果（成功 or 失敗）を受け取り、DB 書き込み（投稿・通貨返却・pending 削除）を行う。
 *
 * リクエストボディ (成功時):
 *   { pendingId, threadId, invokerUserId, success: true, generatedText }
 *
 * リクエストボディ (失敗時):
 *   { pendingId, threadId, invokerUserId, success: false, error }
 *
 * レスポンス:
 *   { result: { pendingId, success, postId? } }
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §2.3
 */

import { NextResponse } from "next/server";
import type { CreditReason } from "@/lib/domain/models/currency";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { credit } from "@/lib/services/currency-service";
import { completeNewspaperCommand } from "@/lib/services/newspaper-service";
import type { PostInput } from "@/lib/services/post-service";
import { createPost } from "@/lib/services/post-service";

/**
 * !newspaper の AI 生成結果を受け取り、DB に書き込む。
 *
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §2.3
 */
export async function POST(request: Request): Promise<NextResponse> {
	// Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			pendingId,
			threadId,
			invokerUserId,
			success,
			generatedText,
			error,
		} = body as {
			pendingId: string;
			threadId: string;
			invokerUserId: string;
			success: boolean;
			generatedText?: string;
			error?: string;
		};

		// completeNewspaperCommand を呼び出して DB 書き込みを実行する
		const result = await completeNewspaperCommand(
			{
				pendingAsyncCommandRepository: PendingAsyncCommandRepo,
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
			},
			{ pendingId, threadId, invokerUserId, success, generatedText, error },
		);

		return NextResponse.json({ result });
	} catch (err) {
		console.error(
			"[POST /api/internal/newspaper/complete] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "newspaper完了処理中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
