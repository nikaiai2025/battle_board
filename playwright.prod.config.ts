/**
 * Playwright 本番スモークテスト設定
 *
 * Cloudflare Workers 本番環境に対する読み取り専用の到達性テスト。
 * DB書き込み・認証操作は一切行わない。webServer 不要（本番URLに直接アクセス）。
 *
 * 実行: npx playwright test --config=playwright.prod.config.ts
 *
 * ローカルの playwright.config.ts とは完全に分離されており、
 * 「npx playwright test」（デフォルト）では実行されない。
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e/prod",
	testMatch: "**/*.spec.ts",

	timeout: 60_000,
	expect: { timeout: 15_000 },
	retries: 0,
	workers: 1,

	outputDir: "ゴミ箱/test-results-prod",

	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "ゴミ箱/playwright-report-prod" }],
	],

	use: {
		baseURL: "https://battle-board.shika.workers.dev",
		screenshot: "only-on-failure",
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "prod",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	// webServer なし（本番URLに直接アクセスする）
});
