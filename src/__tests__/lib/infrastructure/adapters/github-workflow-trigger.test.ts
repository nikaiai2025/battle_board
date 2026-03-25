/**
 * github-workflow-trigger アダプタ — 単体テスト
 *
 * テスト対象:
 *   - triggerWorkflow: GitHub workflow_dispatch API 呼び出し
 *   - withWorkflowTrigger: pending リポジトリのデコレータ
 *
 * See: docs/architecture/architecture.md TDR-017
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	triggerWorkflow,
	withWorkflowTrigger,
} from "../../../../lib/infrastructure/adapters/github-workflow-trigger";

// ---------------------------------------------------------------------------
// triggerWorkflow テスト
// ---------------------------------------------------------------------------

describe("triggerWorkflow", () => {
	// fetch をモック化
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	describe("GITHUB_PAT 未設定時", () => {
		it("warn ログを出力し、fetch を呼ばずに正常終了すること", async () => {
			// GITHUB_PAT を未設定にする
			vi.stubEnv("GITHUB_PAT", "");
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await expect(
				triggerWorkflow("newspaper-scheduler.yml"),
			).resolves.toBeUndefined();
			expect(fetchMock).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("GITHUB_PAT is not set"),
			);
		});
	});

	describe("GITHUB_PAT 設定時", () => {
		beforeEach(() => {
			vi.stubEnv("GITHUB_PAT", "ghp_test_token_123");
		});

		it("正しい URL・ヘッダ・ボディで fetch が呼ばれること", async () => {
			vi.stubEnv("GITHUB_REPOSITORY", "testowner/testrepo");
			fetchMock.mockResolvedValue({ ok: true, status: 204 });

			await triggerWorkflow("newspaper-scheduler.yml");

			expect(fetchMock).toHaveBeenCalledOnce();
			const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];

			// URL の検証
			expect(url).toBe(
				"https://api.github.com/repos/testowner/testrepo/actions/workflows/newspaper-scheduler.yml/dispatches",
			);

			// ヘッダの検証
			expect(options.method).toBe("POST");
			const headers = options.headers as Record<string, string>;
			expect(headers.Authorization).toBe("Bearer ghp_test_token_123");
			expect(headers.Accept).toBe("application/vnd.github+json");
			expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
			// GitHub API は User-Agent ヘッダを必須とする。未設定時は HTTP 403 になる
			expect(headers["User-Agent"]).toBeTruthy();

			// ボディの検証
			expect(JSON.parse(options.body as string)).toEqual({ ref: "main" });
		});

		it("GITHUB_REPOSITORY 未設定時にデフォルトリポジトリへフォールバックすること", async () => {
			// GITHUB_REPOSITORY を完全に未設定にする（vi.stubEnv では undefined にできないため delete を使用）
			const original = process.env.GITHUB_REPOSITORY;
			delete process.env.GITHUB_REPOSITORY;
			fetchMock.mockResolvedValue({ ok: true, status: 204 });

			try {
				await triggerWorkflow("newspaper-scheduler.yml");
				const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
				expect(url).toContain("nikaiai2025/battle_board");
			} finally {
				// 元の値を復元
				if (original !== undefined) {
					process.env.GITHUB_REPOSITORY = original;
				}
			}
		});

		it("GitHub API がエラーレスポンスを返した場合に Error を throw すること", async () => {
			vi.stubEnv("GITHUB_REPOSITORY", "testowner/testrepo");
			fetchMock.mockResolvedValue({
				ok: false,
				status: 403,
				text: async () =>
					'{"message":"Resource not accessible by integration"}',
			});

			await expect(triggerWorkflow("newspaper-scheduler.yml")).rejects.toThrow(
				/workflow_dispatch failed: HTTP 403/,
			);
		});

		it("ネットワークエラー時に例外がバブルアップすること", async () => {
			vi.stubEnv("GITHUB_REPOSITORY", "testowner/testrepo");
			fetchMock.mockRejectedValue(new Error("network error"));

			await expect(triggerWorkflow("newspaper-scheduler.yml")).rejects.toThrow(
				"network error",
			);
		});
	});
});

// ---------------------------------------------------------------------------
// withWorkflowTrigger テスト
// ---------------------------------------------------------------------------

describe("withWorkflowTrigger", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	/** テスト用の最小 pending リポジトリ */
	function makeFakeRepo() {
		return {
			create: vi.fn().mockResolvedValue(undefined),
			findByCommandType: vi.fn().mockResolvedValue([]),
			deletePendingAsyncCommand: vi.fn().mockResolvedValue(undefined),
		};
	}

	it("対象 commandType の create 時に triggerFn が呼ばれること", async () => {
		const repo = makeFakeRepo();
		const triggerFn = vi.fn().mockResolvedValue(undefined);
		const decorated = withWorkflowTrigger(
			repo,
			new Set(["newspaper"]),
			triggerFn,
		);

		await decorated.create({
			commandType: "newspaper",
			threadId: "thread-1",
			targetPostNumber: 0,
			invokerUserId: "user-1",
		});

		expect(repo.create).toHaveBeenCalledOnce();
		// fire-and-forget のため少し待つ
		await vi.waitFor(() => expect(triggerFn).toHaveBeenCalledOnce());
	});

	it("対象外 commandType の create 時に triggerFn が呼ばれないこと", async () => {
		const repo = makeFakeRepo();
		const triggerFn = vi.fn().mockResolvedValue(undefined);
		const decorated = withWorkflowTrigger(
			repo,
			new Set(["newspaper"]),
			triggerFn,
		);

		await decorated.create({
			commandType: "aori",
			threadId: "thread-1",
			targetPostNumber: 1,
			invokerUserId: "user-1",
		});

		expect(repo.create).toHaveBeenCalledOnce();
		// trigger は呼ばれないこと（非同期タスクがキューに入ることもない）
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(triggerFn).not.toHaveBeenCalled();
	});

	it("triggerFn が失敗しても create 自体は成功すること（fire-and-forget）", async () => {
		const repo = makeFakeRepo();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const triggerFn = vi.fn().mockRejectedValue(new Error("trigger failed"));
		const decorated = withWorkflowTrigger(
			repo,
			new Set(["newspaper"]),
			triggerFn,
		);

		// create は正常終了すること
		await expect(
			decorated.create({
				commandType: "newspaper",
				threadId: "thread-1",
				targetPostNumber: 0,
				invokerUserId: "user-1",
			}),
		).resolves.toBeUndefined();

		// エラーログが出力されること（fire-and-forget の catch ブロック）
		await vi.waitFor(() =>
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to trigger workflow"),
				expect.any(Error),
			),
		);
	});

	it("create 以外のメソッド（findByCommandType 等）がそのまま委譲されること", async () => {
		const repo = makeFakeRepo();
		const triggerFn = vi.fn().mockResolvedValue(undefined);
		const decorated = withWorkflowTrigger(
			repo,
			new Set(["newspaper"]),
			triggerFn,
		);

		// findByCommandType の委譲確認
		await decorated.findByCommandType("newspaper");
		expect(repo.findByCommandType).toHaveBeenCalledWith("newspaper");

		// deletePendingAsyncCommand の委譲確認
		await decorated.deletePendingAsyncCommand("cmd-id-1");
		expect(repo.deletePendingAsyncCommand).toHaveBeenCalledWith("cmd-id-1");

		// トリガーは呼ばれないこと
		expect(triggerFn).not.toHaveBeenCalled();
	});

	it("複数の対象 commandType を Set に含める場合、いずれもトリガーされること", async () => {
		const repo = makeFakeRepo();
		const triggerFn = vi.fn().mockResolvedValue(undefined);
		const decorated = withWorkflowTrigger(
			repo,
			new Set(["newspaper", "future_cmd"]),
			triggerFn,
		);

		await decorated.create({
			commandType: "newspaper",
			threadId: "t",
			targetPostNumber: 0,
			invokerUserId: "u",
		});
		await vi.waitFor(() => expect(triggerFn).toHaveBeenCalledTimes(1));

		await decorated.create({
			commandType: "future_cmd",
			threadId: "t",
			targetPostNumber: 0,
			invokerUserId: "u",
		});
		await vi.waitFor(() => expect(triggerFn).toHaveBeenCalledTimes(2));
	});

	it("元の repo.create が失敗した場合、Error がバブルアップし triggerFn は呼ばれないこと", async () => {
		const repo = makeFakeRepo();
		repo.create.mockRejectedValue(new Error("DB error"));
		const triggerFn = vi.fn().mockResolvedValue(undefined);
		const decorated = withWorkflowTrigger(
			repo,
			new Set(["newspaper"]),
			triggerFn,
		);

		await expect(
			decorated.create({
				commandType: "newspaper",
				threadId: "thread-1",
				targetPostNumber: 0,
				invokerUserId: "user-1",
			}),
		).rejects.toThrow("DB error");

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(triggerFn).not.toHaveBeenCalled();
	});
});
