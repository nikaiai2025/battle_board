/**
 * E2E ポーリング検証テスト（ローカル限定）
 *
 * 最新ページ表示時のポーリング有効化と、過去ページ表示時の非更新を検証する。
 * テスト中にDB直接INSERTで新レスを追加し、ポーリングによる検知を確認する。
 *
 * ローカルのみ: テスト中にDB直接INSERTが必要なため本番では実行不可。
 *
 * @feature thread.feature
 * @scenario 最新ページ表示時のみポーリングで新着レスを検知する
 * @scenario 過去ページ表示時はポーリングが無効である
 *
 * See: docs/architecture/bdd_test_strategy.md 7.3.3
 * See: src/app/(web)/_components/PostListLiveWrapper.tsx
 */

import { expect, test } from "../fixtures";
import {
	cleanupLocal,
	insertPostLocal,
	seedThreadWithManyPostsLocal,
} from "../fixtures/data.fixture";

// ---------------------------------------------------------------------------
// テスト全体の安全ネット
// See: docs/architecture/bdd_test_strategy.md §10.3.4
// ---------------------------------------------------------------------------

test.afterAll(async ({ request, isProduction }) => {
	if (!isProduction) {
		await cleanupLocal(request).catch((e) =>
			console.warn("[afterAll cleanup] failed:", e),
		);
	}
});

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

test.describe("ポーリング検証（ローカル限定）", () => {
	// 本番環境ではスキップ
	// See: docs/architecture/bdd_test_strategy.md §10.3.1 ローカル限定テスト
	test.skip(
		({ isProduction }) => isProduction,
		"本番ではDB直接操作が不可能なためスキップ",
	);

	test.beforeEach(async ({ request }) => {
		await cleanupLocal(request);
	});

	/**
	 * B-1: 最新ページ表示時のみポーリングで新着レスを検知する
	 *
	 * page.waitForResponse でポーリングリクエストを直接待機するフォールバック方式を採用。
	 * page.clock API は fetch との干渉リスクがあるため、
	 * 設計書 §3.2 のフォールバック計画に従い waitForResponse を使用する。
	 *
	 * See: features/thread.feature @pagination
	 * シナリオ: 最新ページ表示時のみポーリングで新着レスを検知する
	 */
	test("最新ページ表示時のみポーリングで新着レスを検知する", async ({
		page,
		request,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// スレッドをシード（レス1件のみ。最新ページ = 唯一のページ）
		const { threadId, threadKey, seedUserId } =
			await seedThreadWithManyPostsLocal(request, 1);

		// スレッドにアクセス
		await page.goto(`/livebot/${threadKey}/`);
		await expect(page.locator("#post-1")).toBeVisible({ timeout: 15_000 });

		// DB直接INSERTで新レスを追加
		await insertPostLocal(
			request,
			threadId,
			2,
			seedUserId,
			"ポーリングで検知されるレス",
		);

		// ポーリングリクエスト完了を待機（最大35秒）
		// PostListLiveWrapper の POLLING_INTERVAL_MS=30_000 を待つ
		await page.waitForResponse(
			(res) => res.url().includes("/api/threads/") && res.status() === 200,
			{ timeout: 35_000 },
		);

		// 新レスが画面に追加されることを確認
		await expect(page.locator("#post-2")).toBeVisible({ timeout: 10_000 });
		await expect(page.locator("#post-2")).toContainText(
			"ポーリングで検知されるレス",
		);

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * B-2: 過去ページ表示時はポーリングが無効である
	 *
	 * 100件超のレスを持つスレッドで過去ページ（1-50）にアクセスし、
	 * 新レスがDB追加後も画面に表示されないことを確認する。
	 *
	 * See: features/thread.feature @pagination
	 * シナリオ: 過去ページ表示時はポーリングが無効である
	 */
	test("過去ページ表示時はポーリングが無効である", async ({
		page,
		request,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// 60件のレスを含むスレッドをシード（ページ分割が発生する最小構成）
		const { threadId, threadKey, seedUserId } =
			await seedThreadWithManyPostsLocal(request, 60);

		// 過去ページ（1-50）にアクセス
		await page.goto(`/livebot/${threadKey}/1-50`);
		await expect(page.locator("#post-1")).toBeVisible({ timeout: 15_000 });

		// DB直接INSERTで新レスを追加
		await insertPostLocal(
			request,
			threadId,
			61,
			seedUserId,
			"過去ページでは検知されないレス",
		);

		// 十分な待機時間後、新レスが表示されないことを確認
		// ポーリング間隔30秒 + マージンの35秒待機
		await page.waitForTimeout(35_000);

		// 新レスが画面に追加されないことを確認
		// 過去ページでは pollingEnabled=false のため PostListLiveWrapper はポーリングしない
		await expect(page.locator("#post-61")).not.toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});
});
