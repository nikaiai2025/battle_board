/**
 * E2E スレッドUIインタラクションテスト
 *
 * アンカーポップアップ（@anchor_popup）とレス番号表示（@post_number_display）の
 * UIインタラクションをブラウザ上で検証する。
 * BDDサービス層では検証不可能なDOM操作（クリック→ポップアップ表示等）を
 * Playwright E2Eテストで代替検証する。
 *
 * 環境差分はフィクスチャが吸収するため、ローカル・本番の両環境で実行される。
 *
 * ライフサイクル:
 *   - beforeAll: スレッドを1回だけ作成（describe単位で共有）
 *   - afterAll: スレッドを1回だけ削除（管理者権限）
 *   - 各テスト: 共有スレッドを参照のみ（読み取り + DOM操作）
 *
 * @feature thread.feature
 * @scenario 本文中のアンカーをクリックすると参照先レスがポップアップ表示される
 * @scenario ポップアップ内のアンカーをクリックするとポップアップが重なる
 * @scenario ポップアップの外側をクリックすると最前面のポップアップが閉じる
 * @scenario 存在しないレスへのアンカーではポップアップが表示されない
 * @scenario レス番号が数字のみで表示される
 * @scenario レス番号をクリックすると返信テキストがフォームに挿入される
 * @scenario 入力済みのフォームにレス番号クリックで追記される
 *
 * See: docs/architecture/bdd_test_strategy.md 7.3.3
 */

import { expect, test } from "../fixtures";
import {
	cleanupLocal,
	cleanupProd,
	seedThreadWithAnchorPostsLocal,
	seedThreadWithAnchorPostsProd,
} from "../fixtures/data.fixture";

// ---------------------------------------------------------------------------
// ファイルスコープ共有変数（beforeAll でセット、全テストが参照）
// ---------------------------------------------------------------------------

/** 7テストで共有するスレッドID（本番cleanup用）*/
let sharedThreadId = "";
/** 7テストで共有するスレッドキー（ページURL構築用）*/
let sharedThreadKey = "";

// ---------------------------------------------------------------------------
// 環境判定ヘルパー
// isProduction: process.env.PROD_BASE_URL が設定されている場合は本番環境
// See: e2e/fixtures/index.ts の isProduction パターン
// See: e2e/flows/basic-flow.spec.ts の test.afterAll
// ---------------------------------------------------------------------------

const isProduction = Boolean(process.env.PROD_BASE_URL);
const baseURL = process.env.PROD_BASE_URL ?? "http://localhost:3000";
const edgeToken = process.env.PROD_SMOKE_EDGE_TOKEN ?? "";

// ---------------------------------------------------------------------------
// 共通セットアップ — describe単位で1スレッドを共有
// ---------------------------------------------------------------------------

/**
 * テスト開始前に1回だけスレッドを作成する。
 * beforeAll では カスタムフィクスチャが使えないため、seed関数を直接import して使用する。
 * See: docs/architecture/bdd_test_strategy.md §10.1.1
 */
test.beforeAll(async ({ request }) => {
	let result: { threadId: string; threadKey: string };
	if (isProduction) {
		result = await seedThreadWithAnchorPostsProd(request, baseURL, edgeToken);
	} else {
		result = await seedThreadWithAnchorPostsLocal(request);
	}
	sharedThreadId = result.threadId;
	sharedThreadKey = result.threadKey;
});

/**
 * 全テスト終了後に1回だけスレッドを削除する（管理者権限）。
 * beforeAll では カスタムフィクスチャが使えないため、cleanup関数を直接import して使用する。
 * See: docs/architecture/bdd_test_strategy.md §10.3.4
 */
test.afterAll(async ({ request }) => {
	if (isProduction) {
		// 本番: 管理者セッショントークンを取得してcleanupProdを呼ぶ
		const { adminLoginProd } = await import("../fixtures/auth.fixture");
		const adminSessionToken = await adminLoginProd(request, baseURL);
		await cleanupProd(request, baseURL, adminSessionToken, [
			sharedThreadId,
		]).catch((e) => console.warn("[afterAll cleanup] failed:", e));
	} else {
		// ローカル: 全件削除
		await cleanupLocal(request).catch((e) =>
			console.warn("[afterAll cleanup] failed:", e),
		);
	}
});

// ---------------------------------------------------------------------------
// @anchor_popup テスト（A-1 ~ A-4）
// See: features/thread.feature @anchor_popup
// ---------------------------------------------------------------------------

test.describe("アンカーポップアップ (@anchor_popup)", () => {
	/**
	 * A-1: 本文中のアンカーをクリックすると参照先レスがポップアップ表示される
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: 本文中のアンカーをクリックすると参照先レスがポップアップ表示される
	 */
	test("本文中のアンカーをクリックすると参照先レスがポップアップ表示される", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// スレッドページにアクセス
		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("#post-2")).toBeVisible();

		// レス2 の本文中の >>1 をクリック
		// AnchorLink は <span role="button"> でレンダリングされる
		// See: src/app/(web)/_components/AnchorLink.tsx
		await page.locator('#post-2 span[role="button"]:has-text(">>1")').click();

		// ポップアップが表示される
		// See: src/app/(web)/_components/AnchorPopup.tsx L87 data-testid="anchor-popup-0"
		const popup = page.locator('[data-testid="anchor-popup-0"]');
		await expect(popup).toBeVisible({ timeout: 5_000 });

		// ポップアップ内にレス1の本文 "こんにちは" が含まれる
		await expect(popup).toContainText("こんにちは");

		// ポップアップ内にレス番号・表示名・日次IDが含まれる
		await expect(popup).toContainText("1");
		await expect(popup).toContainText("名無しさん");

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * A-2: ポップアップ内のアンカーをクリックするとポップアップが重なる
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: ポップアップ内のアンカーをクリックするとポップアップが重なる
	 */
	test("ポップアップ内のアンカーをクリックするとポップアップが重なる", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("#post-3")).toBeVisible();

		// レス3 の >>2 をクリック → popup-0 表示
		await page.locator('#post-3 span[role="button"]:has-text(">>2")').click();
		const popup0 = page.locator('[data-testid="anchor-popup-0"]');
		await expect(popup0).toBeVisible({ timeout: 5_000 });

		// popup-0 内の >>1 をクリック → popup-1 表示
		await popup0.locator('span[role="button"]:has-text(">>1")').click();
		const popup1 = page.locator('[data-testid="anchor-popup-1"]');
		await expect(popup1).toBeVisible({ timeout: 5_000 });

		// 両方のポップアップが表示されている
		await expect(popup0).toBeVisible();
		await expect(popup1).toBeVisible();

		// popup-1 の z-index が popup-0 より大きい
		// See: src/app/(web)/_components/AnchorPopup.tsx L93 zIndex: Z_INDEX_BASE + stackIndex
		const z0 = await popup0.evaluate(
			(el) => Number(getComputedStyle(el).zIndex) || 0,
		);
		const z1 = await popup1.evaluate(
			(el) => Number(getComputedStyle(el).zIndex) || 0,
		);
		expect(z1).toBeGreaterThan(z0);

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * A-3: ポップアップの外側をクリックすると最前面のポップアップが閉じる
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: ポップアップの外側をクリックすると最前面のポップアップが閉じる
	 */
	test("ポップアップの外側をクリックすると最前面のポップアップが閉じる", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("#post-3")).toBeVisible();

		// 2つのポップアップが重なった状態を構築（A-2と同じ手順）
		await page.locator('#post-3 span[role="button"]:has-text(">>2")').click();
		const popup0 = page.locator('[data-testid="anchor-popup-0"]');
		await expect(popup0).toBeVisible({ timeout: 5_000 });

		await popup0.locator('span[role="button"]:has-text(">>1")').click();
		const popup1 = page.locator('[data-testid="anchor-popup-1"]');
		await expect(popup1).toBeVisible({ timeout: 5_000 });

		// ポップアップの外側をクリック
		// See: src/app/(web)/_components/AnchorPopup.tsx L64 handleDocumentClick
		await page.mouse.click(10, 10);

		// 最前面のポップアップ (popup-1) が閉じる
		await expect(popup1).not.toBeVisible({ timeout: 3_000 });

		// 背面のポップアップ (popup-0) は残る
		await expect(popup0).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * A-4: 存在しないレスへのアンカーではポップアップが表示されない
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: 存在しないレスへのアンカーではポップアップが表示されない
	 */
	test("存在しないレスへのアンカーではポップアップが表示されない", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// レス4 は body=">>999 テスト" を含む。>>999 は存在しないレス
		await expect(page.locator("#post-4")).toBeVisible();
		await page.locator('#post-4 span[role="button"]:has-text(">>999")').click();

		// ポップアップが表示されないことをアサート
		const popup = page.locator('[data-testid="anchor-popup-0"]');
		// 短い待機後、ポップアップが存在しないことを確認
		await expect(popup).not.toBeVisible({ timeout: 2_000 });

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// @post_number_display テスト（A-5 ~ A-7）
// See: features/thread.feature @post_number_display
// ---------------------------------------------------------------------------

test.describe("レス番号表示 (@post_number_display)", () => {
	/**
	 * A-5: レス番号が数字のみで表示される
	 *
	 * See: features/thread.feature @post_number_display
	 * シナリオ: レス番号が数字のみで表示される
	 */
	test("レス番号が数字のみで表示される", async ({ page }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// post_number=5 のレス番号ボタンを検証
		// See: src/app/(web)/_components/PostItem.tsx L258 data-testid="post-number-btn-5"
		const postNumberBtn = page.locator('[data-testid="post-number-btn-5"]');
		await expect(postNumberBtn).toBeVisible();

		// テキストが "5" であること
		await expect(postNumberBtn).toHaveText("5");

		// ">>" が含まれないこと（数字のみの表示）
		const text = await postNumberBtn.textContent();
		expect(text).not.toContain(">>");

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * A-6: レス番号をクリックすると返信テキストがフォームに挿入される
	 *
	 * See: features/thread.feature @post_number_display
	 * シナリオ: レス番号をクリックすると返信テキストがフォームに挿入される
	 */
	test("レス番号をクリックすると返信テキストがフォームに挿入される", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// フォームが空であることを確認
		// See: src/app/(web)/_components/PostForm.tsx > #post-body-input
		const input = page.locator("#post-body-input");
		await expect(input).toHaveValue("");

		// レス番号5をクリック
		await page.locator('[data-testid="post-number-btn-5"]').click();

		// フォームに ">>5" が挿入される
		await expect(input).toHaveValue(">>5");

		expect(jsErrors).toHaveLength(0);
	});

	/**
	 * A-7: 入力済みのフォームにレス番号クリックで追記される
	 *
	 * See: features/thread.feature @post_number_display
	 * シナリオ: 入力済みのフォームにレス番号クリックで追記される
	 */
	test("入力済みのフォームにレス番号クリックで追記される", async ({ page }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/livebot/${sharedThreadKey}/`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// フォームに "こんにちは" を入力
		const input = page.locator("#post-body-input");
		await input.fill("こんにちは");
		await expect(input).toHaveValue("こんにちは");

		// レス番号3をクリック
		await page.locator('[data-testid="post-number-btn-3"]').click();

		// フォーム内容が "こんにちは\n>>3" になる
		await expect(input).toHaveValue("こんにちは\n>>3");

		expect(jsErrors).toHaveLength(0);
	});
});
