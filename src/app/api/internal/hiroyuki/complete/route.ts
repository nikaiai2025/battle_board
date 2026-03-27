/**
 * POST /api/internal/hiroyuki/complete -- !hiroyuki 処理結果書き込み Internal API
 *
 * GitHub Actions hiroyuki-worker から呼ばれる。
 * AI 生成結果（成功 or 失敗）を受け取り、BOT 生成 + 投稿（成功時）
 * または通貨返却 + エラー通知（失敗時）を行う。
 *
 * リクエストボディ（成功時）:
 *   { pendingId, threadId, invokerUserId, success: true, generatedText, targetPostNumber }
 *
 * リクエストボディ（失敗時）:
 *   { pendingId, threadId, invokerUserId, success: false, error }
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/tasks/task_TASK-335.md §2b
 */

import { NextResponse } from "next/server";
import type { CreditReason } from "@/lib/domain/models/currency";
import * as BotPostRepo from "@/lib/infrastructure/repositories/bot-post-repository";
import * as BotRepo from "@/lib/infrastructure/repositories/bot-repository";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { credit } from "@/lib/services/currency-service";
import { completeHiroyukiCommand } from "@/lib/services/hiroyuki-service";
import type { PostInput } from "@/lib/services/post-service";
import { createPost } from "@/lib/services/post-service";

/**
 * !hiroyuki の AI 生成結果を受け取り、BOT 生成 + 投稿を行う。
 *
 * See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
 * See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
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
			targetPostNumber,
		} = body as {
			pendingId: string;
			threadId: string;
			invokerUserId: string;
			success: boolean;
			generatedText?: string;
			error?: string;
			targetPostNumber?: number;
		};

		// completeHiroyukiCommand を呼び出して BOT 生成 + 投稿（または通貨返却）を実行する
		const result = await completeHiroyukiCommand(
			{
				pendingAsyncCommandRepository: PendingAsyncCommandRepo,
				// BOT エンティティ作成
				createBotFn: (botData) => BotRepo.create(botData),
				// bot_posts 紐付け作成
				createBotPostFn: (postId, botId) => BotPostRepo.create(postId, botId),
				// total_posts インクリメント
				incrementTotalPostsFn: (botId) => BotRepo.incrementTotalPosts(botId),
				// レス投稿（PostInput の型に合わせてアダプター）
				createPostFn: async (params) => {
					const postInput: PostInput = {
						threadId: params.threadId,
						body: params.body,
						edgeToken: params.edgeToken,
						ipHash: params.ipHash,
						displayName: params.displayName,
						isBotWrite: params.isBotWrite,
						botUserId: params.botUserId,
						isSystemMessage: params.isSystemMessage,
					};
					const postResult = await createPost(postInput);
					if ("success" in postResult && postResult.success) {
						return {
							success: true,
							postId: postResult.postId,
							postNumber: postResult.postNumber,
							systemMessages: postResult.systemMessages,
						};
					}
					throw new Error(
						"error" in postResult ? postResult.error : "createPost failed",
					);
				},
				// 通貨加算（CreditReason 型制約）
				creditFn: (userId, amount, reason) =>
					credit(userId, amount, reason as CreditReason),
			},
			{
				pendingId,
				threadId,
				invokerUserId,
				success,
				generatedText,
				error,
				targetPostNumber: targetPostNumber ?? 0,
			},
		);

		return NextResponse.json({ result });
	} catch (err) {
		console.error(
			"[POST /api/internal/hiroyuki/complete] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "hiroyuki完了処理中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
