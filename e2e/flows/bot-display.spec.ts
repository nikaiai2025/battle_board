/**
 * E2E 撃破済みBOT表示テスト（ローカル限定）
 *
 * 撃破済みBOTのレスが目立たない表示になることと、
 * トグルで表示/非表示を切り替えられることを検証する。
 *
 * 現時点ではPostItem.tsxに撃破済みBOT用の表示分岐が未実装のため、
 * test.fixme() でスキップ扱いとする。UIコンポーネント実装完了後にGREENになる。
 *
 * ローカルのみ: 撃破済みBOTのDBシードが本番では不可能なためスキップ。
 *
 * @feature bot_system.feature
 * @scenario 撃破済みボットのレスはWebブラウザで目立たない表示になる
 * @scenario 撃破済みボットのレス表示をトグルで切り替えられる
 *
 * See: docs/architecture/bdd_test_strategy.md 7.3.3
 */

import { expect, test } from "../fixtures";
import {
	cleanupLocal,
	seedEliminatedBotThreadLocal,
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

test.describe("撃破済みBOT表示（ローカル限定）", () => {
	// 本番環境ではスキップ
	// See: docs/architecture/bdd_test_strategy.md §10.3.1 ローカル限定テスト
	test.skip(
		({ isProduction }) => isProduction,
		"本番では撃破済みBOTのDBシードが不可能なためスキップ",
	);

	test.beforeEach(async ({ request }) => {
		await cleanupLocal(request);
	});

	/**
	 * B-3: 撃破済みボットのレスはWebブラウザで目立たない表示になる
	 *
	 * See: features/bot_system.feature
	 * シナリオ: 撃破済みボットのレスはWebブラウザで目立たない表示になる
	 * See: tmp/workers/bdd-architect_TASK-219/design.md §5.2 E2Eテスト
	 */
	test("撃破済みBOTのレスが目立たない表示になる", async ({ page, request }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const { threadKey, botPostNumber } =
			await seedEliminatedBotThreadLocal(request);

		// スレッドページにアクセス
		await page.goto(`/battleboard/${threadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// BOTのレスが表示されることを確認
		const botPost = page.locator(`#post-${botPostNumber}`);
		await expect(botPost).toBeVisible();

		// 撃破済みBOTのレスに「目立たない」CSSが適用されていることをアサート
		// 実装に依存: opacity低下、text-gray-400等のCSS class を確認
		const opacity = await botPost.evaluate(
			(el) => getComputedStyle(el).opacity,
		);
		expect(Number(opacity)).toBeLessThan(1);

		// 通常レスのopacityは1であることを対照確認
		const normalPost = page.locator("#post-1");
		const normalOpacity = await normalPost.evaluate(
			(el) => getComputedStyle(el).opacity,
		);
		expect(Number(normalOpacity)).toBe(1);

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * B-4: 撃破済みボットのレス表示をトグルで切り替えられる
	 *
	 * See: features/bot_system.feature
	 * シナリオ: 撃破済みボットのレス表示をトグルで切り替えられる
	 * See: tmp/workers/bdd-architect_TASK-219/design.md §5.2 E2Eテスト
	 */
	test("撃破済みBOTのレス表示をトグルで切り替えられる", async ({
		page,
		request,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const { threadKey, botPostNumber } =
			await seedEliminatedBotThreadLocal(request);

		// スレッドページにアクセス
		await page.goto(`/battleboard/${threadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// BOTレスが表示されていることを確認
		const botPost = page.locator(`#post-${botPostNumber}`);
		await expect(botPost).toBeVisible();

		// 「撃破済みBOTレス表示」トグルを探してクリック（OFF）
		// BDDシナリオ: 全体メニューの「撃破済みBOTレス表示」トグル
		const toggle = page.locator('[data-testid="eliminated-bot-toggle"]');
		await toggle.click();

		// BOTレスが非表示になることをアサート
		await expect(botPost).not.toBeVisible({ timeout: 3_000 });

		// トグルを再クリック（ON）
		await toggle.click();

		// BOTレスが再表示されることをアサート
		await expect(botPost).toBeVisible({ timeout: 3_000 });

		expect(jsErrors).toHaveLength(0);
	});
});
