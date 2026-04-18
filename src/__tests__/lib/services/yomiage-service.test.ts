/**
 * yomiage-service 単体テスト
 *
 * GH Actions worker からの完了通知を受け取り、★システムレス投稿・通貨返却・
 * pending 削除を行う completeYomiageCommand の振る舞いを検証する。
 *
 * See: features/command_yomiage.feature @コマンド実行後、非同期処理で★システムレスに音声URLが表示される
 * See: features/command_yomiage.feature @Gemini API呼び出しが失敗した場合は通貨返却・システム通知
 * See: features/command_yomiage.feature @軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される
 */

import { describe, expect, it, vi } from "vitest";

import {
	completeYomiageCommand,
	type IYomiageCompleteDeps,
} from "../../../lib/services/yomiage-service";

function createDeps(overrides: Partial<IYomiageCompleteDeps> = {}): {
	deps: IYomiageCompleteDeps;
	mocks: {
		deletePendingAsyncCommand: ReturnType<typeof vi.fn>;
		createPostFn: ReturnType<typeof vi.fn>;
		creditFn: ReturnType<typeof vi.fn>;
	};
} {
	const deletePendingAsyncCommand = vi.fn().mockResolvedValue(undefined);
	const createPostFn = vi.fn().mockResolvedValue({
		success: true,
		postId: "post-yomiage-001",
	});
	const creditFn = vi.fn().mockResolvedValue(undefined);

	return {
		deps: {
			pendingAsyncCommandRepository: { deletePendingAsyncCommand },
			createPostFn,
			creditFn,
			...overrides,
		},
		mocks: {
			deletePendingAsyncCommand,
			createPostFn,
			creditFn,
		},
	};
}

describe("completeYomiageCommand", () => {
	it("成功時に pending を削除し、対象レス番号と音声URLを含む★システムレスを投稿する", async () => {
		const { deps, mocks } = createDeps();

		await completeYomiageCommand(deps, {
			pendingId: "pending-001",
			threadId: "thread-001",
			invokerUserId: "user-001",
			targetPostNumber: 5,
			success: true,
			audioUrl: "https://example.com/audio.mp4",
			amount: 30,
		});

		expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith("pending-001");
		expect(mocks.createPostFn).toHaveBeenCalledWith({
			threadId: "thread-001",
			body: [
				">>5 の読み上げ音声ができたよ",
				"https://example.com/audio.mp4",
				"※ 音声は一定期間（約72時間）後に取得不可になります",
			].join("\n"),
			edgeToken: null,
			ipHash: "system",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});
		expect(mocks.creditFn).not.toHaveBeenCalled();
		expect(mocks.deletePendingAsyncCommand.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.createPostFn.mock.invocationCallOrder[0],
		);
	});

	it("失敗時に pending を削除し、通貨返却と失敗通知を行う", async () => {
		const { deps, mocks } = createDeps();

		await completeYomiageCommand(deps, {
			pendingId: "pending-002",
			threadId: "thread-002",
			invokerUserId: "user-002",
			targetPostNumber: 9,
			success: false,
			error: "upload failed",
			stage: "upload",
			amount: 30,
		});

		expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith("pending-002");
		expect(mocks.creditFn).toHaveBeenCalledWith(
			"user-002",
			30,
			"yomiage_async_failure",
		);
		expect(mocks.createPostFn).toHaveBeenCalledWith({
			threadId: "thread-002",
			body: ">>9 の読み上げに失敗しました。通貨は返却されました。",
			edgeToken: null,
			ipHash: "system",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});
		expect(mocks.deletePendingAsyncCommand.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.creditFn.mock.invocationCallOrder[0],
		);
		expect(mocks.creditFn.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.createPostFn.mock.invocationCallOrder[0],
		);
	});

	it("createPostFn が例外を投げた場合、そのままエラーを伝播する", async () => {
		const createPostError = new Error("createPost failed");
		const { deps, mocks } = createDeps({
			createPostFn: vi.fn().mockRejectedValue(createPostError),
		});

		await expect(
			completeYomiageCommand(deps, {
				pendingId: "pending-003",
				threadId: "thread-003",
				invokerUserId: "user-003",
				targetPostNumber: 3,
				success: true,
				audioUrl: "https://example.com/audio.mp4",
				amount: 30,
			}),
		).rejects.toThrow("createPost failed");

		expect(mocks.deletePendingAsyncCommand).toHaveBeenCalledWith("pending-003");
	});
});
