/**
 * YomiageService -- !yomiage コマンドの完了反映サービス
 *
 * GH Actions worker からの完了通知を受け取り、★システムレス投稿・
 * 失敗時の通貨返却・pending 削除を行う。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 * See: features/command_yomiage.feature @軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される
 * See: docs/architecture/components/yomiage.md §2.2
 * See: docs/architecture/components/yomiage.md §6.3
 */

type CreatePostParams = {
	threadId: string;
	body: string;
	edgeToken: null;
	ipHash: string;
	displayName: string;
	isBotWrite: true;
	isSystemMessage: true;
};

/**
 * completeYomiageCommand の DI インターフェース。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 */
export interface IYomiageCompleteDeps {
	pendingAsyncCommandRepository: {
		deletePendingAsyncCommand(id: string): Promise<void>;
	};
	createPostFn: (
		params: CreatePostParams,
	) => Promise<{ success: boolean; postId: string }>;
	creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}

/**
 * ★システムレス投稿の共通パラメータを構築する。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 */
function buildSystemPostParams(
	threadId: string,
	body: string,
): CreatePostParams {
	return {
		threadId,
		body,
		edgeToken: null,
		ipHash: "system",
		displayName: "★システム",
		isBotWrite: true,
		isSystemMessage: true,
	};
}

/**
 * 音声生成結果を掲示板に反映する。
 *
 * 成功時:
 *   1. pending 削除
 *   2. 音声URLを含む★システムレス投稿
 *
 * 失敗時:
 *   1. pending 削除
 *   2. 通貨返却
 *   3. 失敗通知の★システムレス投稿
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 * See: features/command_yomiage.feature @軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される
 */
export async function completeYomiageCommand(
	deps: IYomiageCompleteDeps,
	params: {
		pendingId: string;
		threadId: string;
		invokerUserId: string;
		targetPostNumber: number;
		success: boolean;
		audioUrl?: string;
		error?: string;
		stage?: "tts" | "compress" | "upload";
		amount: number;
	},
): Promise<void> {
	const {
		pendingId,
		threadId,
		invokerUserId,
		targetPostNumber,
		success,
		audioUrl,
		amount,
	} = params;

	await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(pendingId);

	if (success && audioUrl) {
		await deps.createPostFn(
			buildSystemPostParams(
				threadId,
				[
					`>>${targetPostNumber} の読み上げ音声ができたよ`,
					audioUrl,
					"※ 音声は一定期間（約72時間）後に取得不可になります",
				].join("\n"),
			),
		);
		return;
	}

	await deps.creditFn(invokerUserId, amount, "yomiage_async_failure");
	await deps.createPostFn(
		buildSystemPostParams(
			threadId,
			`>>${targetPostNumber} の読み上げに失敗しました。通貨は返却されました。`,
		),
	);
}
