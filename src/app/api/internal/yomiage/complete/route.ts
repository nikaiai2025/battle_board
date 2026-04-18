/**
 * POST /api/internal/yomiage/complete -- !yomiage 完了通知 Internal API
 *
 * GH Actions yomiage-worker から呼ばれる。
 * 音声生成成功時はURLを投稿し、失敗時は通貨返却と失敗通知を行う。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 * See: features/command_yomiage.feature @軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される
 * See: docs/architecture/components/yomiage.md §2.3
 */

import { NextResponse } from "next/server";
import type { CreditReason } from "@/lib/domain/models/currency";
import * as PendingAsyncCommandRepo from "@/lib/infrastructure/repositories/pending-async-command-repository";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import { credit } from "@/lib/services/currency-service";
import { createPost, type PostInput } from "@/lib/services/post-service";
import { completeYomiageCommand } from "@/lib/services/yomiage-service";

/**
 * !yomiage の完了通知を受け取り、掲示板へ反映する。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 */
export async function POST(request: Request): Promise<NextResponse> {
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			pendingId,
			threadId,
			invokerUserId,
			targetPostNumber,
			success,
			audioUrl,
			error,
			stage,
			amount,
		} = body as {
			pendingId: string;
			threadId: string;
			invokerUserId: string;
			targetPostNumber: number;
			success: boolean;
			audioUrl?: string;
			error?: string;
			stage?: "tts" | "compress" | "upload";
			amount: number;
		};

		await completeYomiageCommand(
			{
				pendingAsyncCommandRepository: PendingAsyncCommandRepo,
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
				creditFn: (userId, creditAmount, reason) =>
					credit(userId, creditAmount, reason as CreditReason),
			},
			{
				pendingId,
				threadId,
				invokerUserId,
				targetPostNumber,
				success,
				audioUrl,
				error,
				stage,
				amount,
			},
		);

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error(
			"[POST /api/internal/yomiage/complete] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "yomiage完了処理中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
