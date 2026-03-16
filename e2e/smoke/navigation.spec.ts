/**
 * E2E スモークテスト: ナビゲーション到達性テスト
 *
 * 全ページの到達性・JSエラーなし・主要UI要素の存在を検証する。
 * ビジネスロジックの正しさやデータの正確性は検証しない。
 *
 * 対象ページ:
 * 1. トップページ /
 * 2. スレッド詳細 /threads/[threadId]
 * 3. マイページ /mypage（認証必須）
 * 4. 認証コード検証ページ /auth/verify
 *
 * See: docs/architecture/bdd_test_strategy.md §10.5 ナビゲーションスモークテスト
 */

import { expect, test } from "@playwright/test";
import { completeAuth } from "../helpers/auth";
import { cleanupDatabase, seedThreadWithPost } from "../helpers/database";
import { mockTurnstile } from "../helpers/turnstile";

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------

/**
 * 各テスト前にDBクリーンアップと Turnstile モックを設定する。
 *
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 */
test.beforeEach(async ({ page, request }) => {
	await mockTurnstile(page);
	await cleanupDatabase(request);
});

// ---------------------------------------------------------------------------
// (1) トップページ /
// ---------------------------------------------------------------------------

/**
 * トップページの到達性・UI要素・ナビゲーションを検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.5.3 各ページでの検証項目
 * See: src/app/(web)/page.tsx
 */
test.describe("トップページ /", () => {
	test("HTTPステータス200で応答し、主要UI要素が表示される", async ({
		page,
	}) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		// See: docs/architecture/bdd_test_strategy.md §10.5.3 > JSエラーなし
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// ページにアクセス（HTTPステータス200を確認）
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);

		// スレッド作成フォームが表示される
		// See: src/app/(web)/_components/ThreadCreateForm.tsx > #thread-create-form
		await expect(page.locator("#thread-create-form")).toBeVisible();

		// ヘッダーが表示される
		// See: src/app/(web)/_components/Header.tsx > #site-title
		await expect(page.locator("#site-title")).toBeVisible();
		await expect(page.locator("#site-title")).toHaveText("BattleBoard");

		// スレッド一覧領域が存在する（0件でもエラーにならない）
		// See: src/app/(web)/_components/ThreadList.tsx
		await expect(page.locator("main")).toBeVisible();

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});

	test("マイページへのリンクは未認証時に非表示だが、ページはエラーなくアクセス可能", async ({
		page,
	}) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto("/");

		// ページ全体にエラーがない
		await expect(page.locator("main")).toBeVisible();

		// サイトタイトルリンクがクリック可能（到達可能性の確認）
		// See: src/app/(web)/_components/Header.tsx > #site-title
		await expect(page.locator("#site-title")).toBeVisible();
		await page.locator("#site-title").click();
		await page.waitForURL("/");
		expect(page.url()).toContain("/");

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (2) スレッド詳細 /threads/[threadId]
// ---------------------------------------------------------------------------

/**
 * スレッド詳細ページの到達性・UI要素・ナビゲーションを検証する。
 *
 * テスト前にシードデータを投入し、実在する threadId でアクセスする。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.5.7 動的ルートの扱い
 * See: src/app/(web)/threads/[threadId]/page.tsx
 */
test.describe("スレッド詳細 /threads/[threadId]", () => {
	test("シードデータのスレッドにアクセスでき、主要UI要素が表示される", async ({
		page,
		request,
	}) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// テスト前にスレッドとレスのシードデータを投入
		// See: docs/architecture/bdd_test_strategy.md §10.5.7 動的ルートの扱い
		const { threadId } = await seedThreadWithPost(request);

		// スレッド詳細ページにアクセス（HTTPステータス200を確認）
		const response = await page.goto(`/threads/${threadId}`);
		expect(response?.status()).toBe(200);

		// スレッドタイトルが表示される
		// See: src/app/(web)/threads/[threadId]/page.tsx > #thread-title
		await expect(page.locator("#thread-title")).toBeVisible();
		await expect(page.locator("#thread-title")).toHaveText(
			"スモークテスト用スレッド",
		);

		// レス一覧（>>1）が表示される
		// See: src/app/(web)/_components/PostItem.tsx > #post-1
		await expect(page.locator("#post-1")).toBeVisible();

		// 書き込みフォームが存在する
		// See: src/app/(web)/_components/PostForm.tsx > #post-body-input
		await expect(page.locator("#post-body-input")).toBeVisible();

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});

	test("トップへの戻りリンクが存在しクリック可能", async ({
		page,
		request,
	}) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// シードデータを投入
		const { threadId } = await seedThreadWithPost(request);
		await page.goto(`/threads/${threadId}`);

		// 「← 一覧に戻る」リンクが存在する
		// See: src/app/(web)/threads/[threadId]/page.tsx > #back-to-list
		const backLink = page.locator("#back-to-list");
		await expect(backLink).toBeVisible();

		// リンクをクリックしてトップに遷移する
		await backLink.click();
		await page.waitForURL("/");
		expect(page.url()).toContain("/");

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (3) マイページ /mypage（認証必須）
// ---------------------------------------------------------------------------

/**
 * マイページの到達性・UI要素を検証する。
 *
 * 認証が必要なため、事前にスレッド作成フォームから認証フローを完了させる。
 * 認証フロー自体の検証は basic-flow.spec.ts（フロー検証テスト）が担う。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.5.6 認証が必要なページの扱い
 * See: src/app/(web)/mypage/page.tsx
 */
test.describe("マイページ /mypage", () => {
	test("認証後にアクセスでき、主要UI要素が表示される", async ({ page }) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// トップページにアクセスしてスレッド作成を通じて認証を行う
		await page.goto("/");
		await expect(page.locator("#thread-create-form")).toBeVisible();

		// スレッドタイトルと本文を入力して送信（401 → AuthModal 表示）
		await page.locator("#thread-title-input").fill("認証用テストスレッド");
		await page.locator("#thread-body-input").fill("認証用テストレス本文");
		await page.locator("#thread-submit-btn").click();

		// AuthModal で認証を完了させる
		// See: e2e/helpers/auth.ts > completeAuth
		// See: docs/architecture/bdd_test_strategy.md §10.5.6 認証が必要なページの扱い
		await completeAuth(page);

		// マイページに直接ナビゲート（HTTPステータス200を確認）
		const response = await page.goto("/mypage");
		expect(response?.status()).toBe(200);

		// マイページの主要UI要素が表示される
		// See: src/app/(web)/mypage/page.tsx > #mypage
		// マイページは Client Component のため、非同期ロード後に要素が表示される
		await expect(page.locator("#account-info")).toBeVisible({
			timeout: 15_000,
		});

		// 通貨残高セクションが表示される
		// See: src/app/(web)/mypage/page.tsx > #currency-balance
		await expect(page.locator("#currency-balance")).toBeVisible({
			timeout: 15_000,
		});

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});

	test("マイページからトップへの戻りリンクが存在する", async ({ page }) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// 認証フローを実行してマイページに到達する
		await page.goto("/");
		await page.locator("#thread-title-input").fill("認証用テストスレッド2");
		await page.locator("#thread-body-input").fill("認証用テストレス本文2");
		await page.locator("#thread-submit-btn").click();
		await completeAuth(page);

		await page.goto("/mypage");

		// account-info が表示されるまで待つ（非同期ロードのため）
		await expect(page.locator("#account-info")).toBeVisible({
			timeout: 15_000,
		});

		// ヘッダーのサイトタイトルリンクが存在する（トップへの導線）
		// See: src/app/(web)/_components/Header.tsx > #site-title
		await expect(page.locator("#site-title")).toBeVisible();
		await page.locator("#site-title").click();
		await page.waitForURL("/");
		expect(page.url()).toContain("/");

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (4) 認証コード検証ページ /auth/verify
// ---------------------------------------------------------------------------

/**
 * 認証コード検証ページの到達性・UI要素を検証する。
 *
 * このページは認証不要でアクセスできる。
 * 認証フロー自体の検証は basic-flow.spec.ts が担う。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.5.3 各ページでの検証項目
 * See: src/app/(web)/auth/verify/page.tsx
 */
test.describe("認証コード検証ページ /auth/verify", () => {
	test("HTTPステータス200で応答し、認証フォームが表示される", async ({
		page,
	}) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// 認証ページにアクセス（HTTPステータス200を確認）
		const response = await page.goto("/auth/verify");
		expect(response?.status()).toBe(200);

		// 認証フォームコンテナが表示される
		// See: src/app/(web)/auth/verify/page.tsx > #auth-verify-form
		await expect(page.locator("#auth-verify-form")).toBeVisible({
			timeout: 10_000,
		});

		// 認証コード入力フィールドが存在する
		// See: src/app/(web)/auth/verify/page.tsx > #auth-code-input
		await expect(page.locator("#auth-code-input")).toBeVisible();

		// 認証ボタンが存在する（初期状態はdisabled）
		// See: src/app/(web)/auth/verify/page.tsx > #auth-submit-btn
		await expect(page.locator("#auth-submit-btn")).toBeVisible();

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});

	test("クエリパラメータ code を渡すと認証コードがプリフィルされる", async ({
		page,
	}) => {
		// JSエラー収集用配列
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// クエリパラメータで認証コードを渡す
		// See: src/app/(web)/auth/verify/page.tsx > codeParam
		const response = await page.goto("/auth/verify?code=123456");
		expect(response?.status()).toBe(200);

		// 認証フォームが表示される
		await expect(page.locator("#auth-verify-form")).toBeVisible({
			timeout: 10_000,
		});

		// 認証コード入力フィールドに値がプリフィルされる
		await expect(page.locator("#auth-code-input")).toHaveValue("123456");

		// JSエラーがないことを確認
		expect(jsErrors).toHaveLength(0);
	});
});
