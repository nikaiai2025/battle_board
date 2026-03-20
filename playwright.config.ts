/**
 * Playwright E2E テスト設定
 *
 * - Supabase Local 実 DB を使用（モックなし）
 * - Chromium のみで実行（CI 統合は別タスク）
 * - Next.js 開発サーバーを自動起動・終了する
 * - Turnstile 本番キーを環境変数から除去し、テストキー自動フォールバックを利用
 *
 * See: docs/architecture/bdd_test_strategy.md §10 E2Eテスト方針
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 */

import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// 環境変数の構築
// ---------------------------------------------------------------------------

// .env.local をベースとして読み込む
const envLocalPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
	dotenv.config({ path: envLocalPath });
}

// Turnstile キーを除去してテストキー自動フォールバックを有効にする。
// - クライアント側: NEXT_PUBLIC_TURNSTILE_SITE_KEY 未設定 → AuthModal.tsx が
//   フォールバックキー "1x00000000000000000000AA"（常に自動パス）を使用
// - サーバー側: TURNSTILE_SECRET_KEY 未設定 → turnstile-client.ts が常に true を返す
// See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;

// ---------------------------------------------------------------------------
// Playwright 設定
// ---------------------------------------------------------------------------

export default defineConfig({
	/** E2E テストファイルの配置ディレクトリ */
	testDir: "./e2e",

	/** テストファイルのパターン */
	testMatch: "**/*.spec.ts",

	/** 各テストのタイムアウト（ms）。Turnstile の自動パスを含む認証フローに時間がかかるため長めに設定 */
	timeout: 60_000,

	/** expect() のタイムアウト（ms） */
	expect: {
		timeout: 15_000,
	},

	/** 失敗時のリトライ回数 */
	retries: 0,

	/** テストの並列実行を無効化（DBの状態変更が競合しないよう直列実行） */
	workers: 1,

	/** テスト成果物（トレース・スクリーンショット等）の出力先 — git管理不要のためゴミ箱配下 */
	outputDir: "ゴミ箱/test-results",

	/** テスト結果レポーター */
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "ゴミ箱/playwright-report" }],
	],

	/** 全テストに共通の設定 */
	use: {
		/** テスト対象の URL */
		baseURL: "http://localhost:3000",

		/** テスト失敗時にスクリーンショットを保存 */
		screenshot: "only-on-failure",

		/** テスト失敗時にトレースを保存 */
		trace: "on-first-retry",
	},

	/**
	 * テストプロジェクトの定義。
	 *
	 * - e2e: ベーシックフローテスト + 認証テスト（e2e/flows/ 配下）
	 * - smoke: ナビゲーションテスト（e2e/smoke/ 配下）
	 * - api: HTTPレベルAPIテスト（e2e/api/ 配下）
	 *
	 * 除外:
	 * - cf-smoke: 常設プロジェクトから除外。npm run test:cf-smoke で手動実行
	 * - 本番: playwright.prod.config.ts で同一テストを isProduction=true で実行
	 *
	 * 実行方法:
	 *   全テスト(ローカル): npx playwright test
	 *   フローのみ:     npx playwright test --project=e2e
	 *   Smokeのみ:      npx playwright test --project=smoke
	 *   APIのみ:        npx playwright test --project=api
	 *   CF Smoke:       npm run test:cf-smoke（wrangler dev 事前起動が必要）
	 *   本番:           npx playwright test --config=playwright.prod.config.ts
	 *
	 * See: docs/architecture/bdd_test_strategy.md §10 E2Eテスト方針
	 * See: docs/architecture/bdd_test_strategy.md §10.3.3 ファイル構成
	 */
	projects: [
		{
			name: "e2e",
			testDir: "./e2e/flows",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "smoke",
			testDir: "./e2e/smoke",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "api",
			testDir: "./e2e/api",
			use: {
				baseURL: "http://localhost:3000",
			},
		},
		// CF Smokeテスト（cf-smoke）は常設プロジェクトから除外。
		//   npm run test:cf-smoke  (wrangler dev 事前起動が必要)
		// See: docs/architecture/bdd_test_strategy.md §14 CF Smokeテスト（技術検証）
	],

	/**
	 * Next.js 開発サーバーを自動起動する。
	 * webServer はテスト開始前に起動され、テスト終了後に停止される。
	 *
	 * 環境変数の渡し方:
	 * - Turnstile キーは上記で削除済みのため process.env から引き継がれない
	 * - NEXT_PUBLIC_BASE_URL を設定することで Server Component の fetchThreads が
	 *   正しく内部 API を絶対 URL で呼び出せるようにする
	 * See: src/app/(web)/page.tsx > fetchThreads
	 */
	webServer: {
		command: "npm run dev",
		url: "http://localhost:3000",
		timeout: 120_000,
		reuseExistingServer: true,
		env: {
			// Supabase Local 接続情報（.env.local から引き継ぎ）
			SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
			SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
			SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
			// Bot API キー
			BOT_API_KEY: process.env.BOT_API_KEY ?? "",
			// ベース URL（Server Component が内部 API を絶対 URL で呼ぶ際に使用）
			NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
			// Turnstile キーを空文字列で上書きしてテストフォールバックを有効にする。
			// - NEXT_PUBLIC_TURNSTILE_SITE_KEY: 空 → AuthModal が "1x00000000000000000000AA" を使用
			// - TURNSTILE_SECRET_KEY: 空 → turnstile-client.ts が !secretKey 判定で常に true を返す
			// .env.local に値が設定されていても Next.js サーバーに渡されないよう空文字列で上書きする。
			// See: src/lib/infrastructure/external/turnstile-client.ts > if (!secretKey) → return true
			NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
			TURNSTILE_SECRET_KEY: "",
		},
	},
});
