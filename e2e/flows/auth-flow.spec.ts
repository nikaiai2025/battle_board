/**
 * E2E フロー検証テスト: 認証UI連結フロー（ローカル限定）
 *
 * 未認証→401→AuthModal→認証コード入力→認証成功→操作リトライの連結フローが
 * 正常に動作することを検証する。
 *
 * 本番ではTurnstile制約により自動テスト不可能なため、ローカル限定テストとする。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.3.1 テストケースの環境分類
 * See: docs/architecture/bdd_test_strategy.md §10.3.3 auth-flow.spec.ts
 */

import { expect, test } from "../fixtures";
import { cleanupLocal } from "../fixtures/data.fixture";
import { completeAuth } from "../helpers/auth";
import { mockTurnstile } from "../helpers/turnstile";

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const TEST_THREAD_TITLE = `[E2E] 認証フローテスト_${Date.now()}`;
const TEST_THREAD_BODY = "E2E認証フローテストで作成したスレッドの1レス目です。";
const TEST_REPLY_BODY = "E2E認証フローテストで書き込んだレスです。";

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

test.describe("認証UI連結フロー（ローカル限定）", () => {
	// 本番環境ではスキップ（isProduction フィクスチャで判定）
	// See: docs/architecture/bdd_test_strategy.md §10.3.1 ローカル限定テスト
	test.skip(
		({ isProduction }) => isProduction,
		"本番では認証UIフローをテストしない",
	);

	test.beforeEach(async ({ page, request }) => {
		await mockTurnstile(page);
		await cleanupLocal(request);
	});

	/**
	 * 未認証→AuthModal→認証→スレッド作成→レス書き込みの完全フロー。
	 *
	 * 元 basic-flow.spec.ts「スレッド作成→認証→閲覧→レス書き込みの基本フローが完結する」
	 * を認証UI連結テストとして独立させたもの。
	 *
	 * See: docs/architecture/bdd_test_strategy.md §10.3.1 ローカル限定テスト
	 */
	test("未認証でスレッド作成→AuthModal認証→作成成功→レス書き込みが完結する", async ({
		page,
	}) => {
		// Step 1: トップページにアクセス
		await page.goto("/");
		await expect(page).toHaveTitle(/BattleBoard/i);
		await expect(page.locator("#thread-create-form")).toBeVisible();

		// Step 2: スレッド作成フォームに入力して送信（未認証）
		await page.locator("#thread-title-input").fill(TEST_THREAD_TITLE);
		await page.locator("#thread-body-input").fill(TEST_THREAD_BODY);
		await page.locator("#thread-submit-btn").click();

		// Step 3: 401 → AuthModal → 認証完了
		await completeAuth(page);

		// Step 4: スレッド作成リトライ成功 → 一覧に表示
		await expect(page.locator(`text=${TEST_THREAD_TITLE}`)).toBeVisible({
			timeout: 15_000,
		});

		// Step 5: スレッドを開く → 本文(>>1)表示
		await page.locator(`a:has-text("${TEST_THREAD_TITLE}")`).click();
		await page.waitForURL(/\/threads\/.+/);
		await expect(page.locator("#thread-title")).toHaveText(TEST_THREAD_TITLE);
		await expect(page.locator("#post-1")).toBeVisible();
		await expect(page.locator("#post-1")).toContainText(TEST_THREAD_BODY);

		// Step 6: レス書き込み（認証済みなので直接成功）
		await page.locator("#post-body-input").fill(TEST_REPLY_BODY);
		await page.locator("#post-submit-btn").click();

		// Step 7: レスが表示される
		await expect(page.locator(`text=${TEST_REPLY_BODY}`)).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("#post-2")).toBeVisible();
		await expect(page.locator("#post-2")).toContainText(TEST_REPLY_BODY);
	});
});
