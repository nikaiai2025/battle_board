/**
 * 本番スモークテスト（読み取り専用）
 *
 * Cloudflare Workers 本番環境に対してブラウザで巡回し、
 * ページの到達性・JSエラーなし・主要UI要素の表示を確認する。
 * DB書き込み・認証操作は一切行わない。
 *
 * 実行: npx playwright test --project=prod
 *
 * 安全性:
 * - 全テストが GET のみ（POST/PUT/DELETE なし）
 * - DB操作ヘルパー（cleanupDatabase 等）を使用しない
 * - 認証フローを実行しない（Turnstile が必要な操作はスキップ）
 *
 * baseURL は playwright.config.ts の prod プロジェクトで設定:
 *   https://battle-board.shika.workers.dev
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Phase A: ページ到達性（認証不要・読み取り専用）
// ---------------------------------------------------------------------------

test.describe("本番スモーク: Phase A（認証不要ページ）", () => {
	test("A-1: トップページが表示される", async ({ page, baseURL }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => jsErrors.push(err.message));

		const response = await page.goto("/", { waitUntil: "networkidle" });

		await page.screenshot({ path: "ゴミ箱/prod_A1_top.png", fullPage: true });

		expect(response?.status()).toBe(200);

		// サイトタイトル
		await expect(page.locator("#site-title")).toBeVisible();
		console.log(
			"[A-1] site-title:",
			await page.locator("#site-title").textContent(),
		);

		// スレッド作成フォーム
		const threadForm = page.locator("#thread-create-form");
		if ((await threadForm.count()) > 0) {
			console.log("[A-1] thread-create-form: visible");
		}

		// main 要素
		await expect(page.locator("main")).toBeVisible();

		// JS エラーなし
		if (jsErrors.length > 0) console.log("[A-1] JS Errors:", jsErrors);
		expect(jsErrors).toHaveLength(0);
	});

	test("A-2: スレッド一覧からスレッド詳細に遷移できる", async ({ page }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => jsErrors.push(err.message));

		await page.goto("/", { waitUntil: "networkidle" });

		const threadLinks = page.locator('a[href*="/threads/"]');
		const count = await threadLinks.count();
		console.log(`[A-2] Found ${count} thread links`);

		if (count > 0) {
			const firstLink = threadLinks.first();
			const href = await firstLink.getAttribute("href");
			console.log(`[A-2] Navigating to: ${href}`);
			await firstLink.click();
			await page.waitForURL(/\/threads\/.+/);
			await page.waitForLoadState("domcontentloaded");

			await page.screenshot({
				path: "ゴミ箱/prod_A2_thread_detail.png",
				fullPage: true,
			});

			console.log("[A-2] Current URL:", page.url());

			// レス >>1
			const post1 = page.locator("#post-1");
			if ((await post1.count()) > 0) {
				console.log("[A-2] post-1: visible");
			} else {
				console.log("[A-2] #post-1 not found");
			}

			// 書き込みフォーム
			const postForm = page.locator("#post-body-input");
			if ((await postForm.count()) > 0) {
				console.log("[A-2] post-body-input: visible");
			}
		} else {
			console.log("[A-2] No thread links found (empty board)");
			await page.screenshot({ path: "ゴミ箱/prod_A2_no_threads.png" });
		}

		if (jsErrors.length > 0) console.log("[A-2] JS Errors:", jsErrors);
		expect(jsErrors).toHaveLength(0);
	});

	test("A-3: 専ブラ互換 subject.txt", async ({ request, baseURL }) => {
		const response = await request.get(`${baseURL}/battleboard/subject.txt`);
		console.log(
			`[A-3] subject.txt: HTTP ${response.status()}, ${(await response.body()).length} bytes`,
		);

		expect(response.status()).toBe(200);
		const contentType = response.headers()["content-type"] ?? "";
		console.log(`[A-3] Content-Type: ${contentType}`);
		expect(contentType.toLowerCase()).toContain("shift_jis");
	});

	test("A-4: 専ブラ互換 bbsmenu.html", async ({ request, baseURL }) => {
		const response = await request.get(`${baseURL}/bbsmenu.html`);
		console.log(
			`[A-4] bbsmenu.html: HTTP ${response.status()}, ${(await response.body()).length} bytes`,
		);

		expect(response.status()).toBe(200);
		const contentType = response.headers()["content-type"] ?? "";
		console.log(`[A-4] Content-Type: ${contentType}`);
		expect(contentType.toLowerCase()).toContain("shift_jis");
	});

	test("A-5: 専ブラ互換 bbsmenu.json", async ({ request, baseURL }) => {
		const response = await request.get(`${baseURL}/bbsmenu.json`);
		console.log(`[A-5] bbsmenu.json: HTTP ${response.status()}`);

		expect(response.status()).toBe(200);
		const contentType = response.headers()["content-type"] ?? "";
		expect(contentType).toContain("application/json");

		const body = await response.json();
		console.log(`[A-5] menu_list categories: ${body.menu_list?.length}`);
		expect(body.menu_list).toBeTruthy();
	});

	test("A-6: 専ブラ互換 SETTING.TXT", async ({ request, baseURL }) => {
		const response = await request.get(`${baseURL}/battleboard/SETTING.TXT`);
		console.log(
			`[A-6] SETTING.TXT: HTTP ${response.status()}, ${(await response.body()).length} bytes`,
		);

		expect(response.status()).toBe(200);
		const contentType = response.headers()["content-type"] ?? "";
		expect(contentType.toLowerCase()).toContain("shift_jis");
	});

	test("A-7: JSON API /api/threads が正常応答", async ({
		request,
		baseURL,
	}) => {
		const response = await request.get(`${baseURL}/api/threads`);
		expect(response.status()).toBe(200);

		const body = await response.json();
		console.log(`[A-7] threads count: ${body.threads?.length}`);
		expect(body.threads).toBeTruthy();
		expect(Array.isArray(body.threads)).toBe(true);
	});

	test("A-8: 存在しない DAT ファイルで 500 にならない", async ({
		request,
		baseURL,
	}) => {
		const response = await request.get(
			`${baseURL}/battleboard/dat/9999999999.dat`,
		);
		console.log(`[A-8] non-existent dat: HTTP ${response.status()}`);

		expect(response.status()).not.toBe(500);
		expect([200, 404]).toContain(response.status());
	});

	test("A-9: 既存スレッドの DAT ファイルが取得できる", async ({
		request,
		baseURL,
	}) => {
		const threadsResp = await request.get(`${baseURL}/api/threads`);
		const { threads } = await threadsResp.json();

		if (threads.length === 0) {
			console.log("[A-9] No threads to test DAT file");
			return;
		}

		const threadKey = threads[0].threadKey;
		console.log(`[A-9] Testing DAT for threadKey: ${threadKey}`);

		const response = await request.get(
			`${baseURL}/battleboard/dat/${threadKey}.dat`,
		);
		console.log(
			`[A-9] DAT: HTTP ${response.status()}, ${(await response.body()).length} bytes`,
		);

		expect(response.status()).toBe(200);
		const contentType = response.headers()["content-type"] ?? "";
		expect(contentType.toLowerCase()).toContain("shift_jis");
	});

	test("A-10: 認証ページ /auth/verify が表示される", async ({ page }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => jsErrors.push(err.message));

		// Turnstile が polling するため networkidle ではなく domcontentloaded を使う
		const response = await page.goto("/auth/verify", {
			waitUntil: "domcontentloaded",
		});
		await page.screenshot({ path: "ゴミ箱/prod_A10_auth_verify.png" });

		expect(response?.status()).toBe(200);

		const form = page.locator("#auth-verify-form");
		if ((await form.count()) > 0) {
			console.log("[A-10] auth-verify-form: visible");
		} else {
			console.log("[A-10] #auth-verify-form not found");
			const bodyText = await page.locator("body").textContent();
			console.log("[A-10] body preview:", bodyText?.slice(0, 200));
		}

		if (jsErrors.length > 0) console.log("[A-10] JS Errors:", jsErrors);
		expect(jsErrors).toHaveLength(0);
	});

	test("A-11: マイページ /mypage が 500 にならない（未認証）", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => jsErrors.push(err.message));

		const response = await page.goto("/mypage", {
			waitUntil: "networkidle",
		});
		await page.screenshot({ path: "ゴミ箱/prod_A11_mypage.png" });

		const status = response?.status() ?? 0;
		console.log(`[A-11] mypage: HTTP ${status}`);
		expect(status).not.toBe(500);

		if (jsErrors.length > 0) {
			console.warn(
				"[A-11] WARNING: JS errors on mypage (unauthenticated):",
				jsErrors,
			);
		}
	});
});
