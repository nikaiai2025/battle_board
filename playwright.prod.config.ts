/**
 * Playwright 本番スモークテスト設定
 *
 * ローカルの playwright.config.ts と同一テストケースを本番環境で実行する。
 * 環境差分はフィクスチャの isProduction フラグで吸収される。
 *
 * 実行: npx playwright test --config=playwright.prod.config.ts
 *
 * See: docs/architecture/bdd_test_strategy.md §10-11
 * See: docs/architecture/bdd_test_strategy.md §11.1 本番実行固有の方針
 */

import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// .env.prod.smoke から本番用シークレットを読み込む
const envProdPath = path.resolve(__dirname, ".env.prod.smoke");
if (fs.existsSync(envProdPath)) {
	dotenv.config({ path: envProdPath });
}

export default defineConfig({
	testDir: "./e2e",
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
		baseURL:
			process.env.PROD_BASE_URL ?? "https://battle-board.shika.workers.dev",
		screenshot: "only-on-failure",
		trace: "on-first-retry",
	},

	projects: [
		{
			/** ナビゲーションテスト（本番） */
			name: "prod-smoke",
			testDir: "./e2e/smoke",
			use: {
				...devices["Desktop Chrome"],
				// カスタムフィクスチャオプション（e2e/fixtures/index.ts で定義）
				// Playwright の標準型には含まれないため型アサーションが必要
				isProduction: true,
			} as (typeof devices)["Desktop Chrome"] & { isProduction: boolean },
		},
		{
			/** ベーシックフローテスト（本番） */
			name: "prod-flows",
			testDir: "./e2e/flows",
			use: {
				...devices["Desktop Chrome"],
				isProduction: true,
			} as (typeof devices)["Desktop Chrome"] & { isProduction: boolean },
		},
	],

	// webServer なし（本番URLに直接アクセスする）
});
