/**
 * E2E ナビゲーションテスト: 全ページの到達性検証
 *
 * 全ページの到達性・JSエラーなし・主要UI要素の存在を検証する。
 * ビジネスロジックの正しさやデータの正確性は検証しない。
 *
 * 環境差分はフィクスチャが吸収するため、ローカル・本番の両環境で実行される。
 *
 * 対象ページ:
 * 1. トップページ /
 * 2. 板トップページ /battleboard/
 * 3. スレッドページ /battleboard/{threadKey}/
 * 4. マイページ /mypage（認証必須）
 * 5. 認証コード検証ページ /auth/verify
 * 6. 開発連絡板 /dev
 * 7. メール本登録ページ /register/email（仮ユーザー認証必須）
 * 8. Discord本登録ページ /register/discord（仮ユーザー認証必須）
 * 9. 管理ダッシュボード /admin（管理者認証必須）
 * 10. 管理ユーザー一覧 /admin/users（管理者認証必須）
 * 11. 管理ユーザー詳細 /admin/users/[userId]（管理者認証必須）
 * 12. IP BAN管理 /admin/ip-bans（管理者認証必須）
 * 13. 旧スレッドURLリダイレクト /threads/[threadId]
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2 ナビゲーションテスト
 * See: docs/architecture/bdd_test_strategy.md §10.2.5 増減基準
 */

import { expect, test } from "../fixtures";

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------

/**
 * 各テスト前にDBをクリーンアップする。
 * - ローカル: Supabase REST で全件削除（クリーンな状態で検証）
 * - 本番: noop（引数なしのため）
 *
 * See: docs/architecture/bdd_test_strategy.md §10.1.1
 */
test.beforeEach(async ({ cleanup }) => {
	await cleanup();
});

// ---------------------------------------------------------------------------
// (1) トップページ /
// ---------------------------------------------------------------------------

/**
 * トップページの到達性・UI要素・ナビゲーションを検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.3 各ページでの検証項目
 * See: src/app/(web)/page.tsx
 */
test.describe("トップページ /", () => {
	test("HTTPステータス200で応答し、主要UI要素が表示される", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const response = await page.goto("/");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/_components/ThreadCreateForm.tsx > #thread-create-form
		await expect(page.locator("#thread-create-form")).toBeVisible();

		// See: src/app/(web)/_components/Header.tsx > #site-title
		await expect(page.locator("#site-title")).toBeVisible();
		await expect(page.locator("#site-title")).toHaveText("BattleBoard");

		await expect(page.locator("main")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});

	test("サイトタイトルリンクがクリック可能", async ({ page }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto("/");
		await expect(page.locator("main")).toBeVisible();

		await expect(page.locator("#site-title")).toBeVisible();
		await page.locator("#site-title").click();
		await page.waitForURL("/");
		expect(page.url()).toContain("/");

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (2) 板トップページ /battleboard/
// ---------------------------------------------------------------------------

/**
 * 板トップページの到達性・UI要素を検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.3 各ページでの検証項目
 * See: src/app/(web)/[boardId]/page.tsx
 * See: features/thread.feature @url_structure
 */
test.describe("板トップページ /battleboard/", () => {
	test("HTTPステータス200で応答し、スレッド一覧が表示される", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const response = await page.goto("/battleboard/");
		expect(response?.status()).toBe(200);

		await expect(page.locator("main")).toBeVisible();
		await expect(page.locator("#thread-create-form")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});

	test("板トップページからサイトタイトルリンクが操作可能", async ({ page }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto("/battleboard/");
		await expect(page.locator("main")).toBeVisible();
		await expect(page.locator("#site-title")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (3) スレッドページ /battleboard/{threadKey}/
// ---------------------------------------------------------------------------

/**
 * スレッドページの到達性・UI要素・ナビゲーションを検証する。
 *
 * seedThread フィクスチャでテストデータを投入し、実在する threadKey でアクセスする。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.7 動的ルートの扱い
 * See: src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx
 * See: features/thread.feature @url_structure
 */
test.describe("スレッドページ /battleboard/{threadKey}/", () => {
	test("シードデータのスレッドにアクセスでき、主要UI要素が表示される", async ({
		page,
		seedThread,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const { threadKey } = seedThread;

		const response = await page.goto(`/battleboard/${threadKey}/`);
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx > #thread-title
		await expect(page.locator("#thread-title")).toBeVisible();

		// See: src/app/(web)/_components/PostItem.tsx > #post-1
		await expect(page.locator("#post-1")).toBeVisible();

		// See: src/app/(web)/_components/PostForm.tsx > #post-body-input
		await expect(page.locator("#post-body-input")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});

	test("一覧に戻るリンクが存在しクリック可能", async ({ page, seedThread }) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto(`/battleboard/${seedThread.threadKey}/`);

		// See: src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx > #back-to-list
		const backLink = page.locator("#back-to-list");
		await expect(backLink).toBeVisible();

		await backLink.click();
		await page.waitForURL("**/battleboard");
		expect(page.url()).toContain("/battleboard");

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (4) マイページ /mypage（認証必須）
// ---------------------------------------------------------------------------

/**
 * マイページの到達性・UI要素を検証する。
 *
 * authenticate フィクスチャで認証済み状態を作り、直接 /mypage にアクセスする。
 * 認証フロー自体の検証は auth-flow.spec.ts（ローカル限定テスト）が担う。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/mypage/page.tsx
 */
test.describe("マイページ /mypage", () => {
	test("認証後にアクセスでき、主要UI要素が表示される", async ({
		page,
		authenticate,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// authenticate フィクスチャで Cookie 設定済み → 直接アクセス
		const response = await page.goto("/mypage");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/mypage/page.tsx > #account-info
		await expect(page.locator("#account-info")).toBeVisible({
			timeout: 15_000,
		});

		// See: src/app/(web)/mypage/page.tsx > #currency-balance
		await expect(page.locator("#currency-balance")).toBeVisible({
			timeout: 15_000,
		});

		expect(jsErrors).toHaveLength(0);
	});

	test("仮ユーザー状態で本登録リンクが表示され、遷移先が404/500でない", async ({
		page,
		authenticate,
	}) => {
		// See: docs/architecture/bdd_test_strategy.md §10.2.8 pendingシナリオのUI到達性
		// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// authenticate フィクスチャは is_verified=false のユーザーを作成（仮ユーザー状態）
		await page.goto("/mypage");
		await expect(page.locator("#account-info")).toBeVisible({
			timeout: 15_000,
		});

		// 本登録案内の登録ボタンが表示される
		// See: src/app/(web)/mypage/page.tsx > data-testid="register-email-button"
		// See: src/app/(web)/mypage/page.tsx > data-testid="register-discord-button"
		const emailBtn = page.locator('[data-testid="register-email-button"]');
		const discordBtn = page.locator('[data-testid="register-discord-button"]');
		await expect(emailBtn).toBeVisible();
		await expect(discordBtn).toBeVisible();

		// 各リンク先が404/500でないことを検証
		// See: docs/architecture/bdd_test_strategy.md §10.2.3 > リンク・ボタンの操作可能性
		for (const btn of [emailBtn, discordBtn]) {
			const href = await btn.getAttribute("href");
			expect(href).toBeTruthy();
			const res = await page.request.get(href!);
			expect(
				res.status(),
				`${href} が ${res.status()} を返した（200を期待）`,
			).toBe(200);
		}

		expect(jsErrors).toHaveLength(0);
	});

	test("マイページからトップへの戻りリンクが存在する", async ({
		page,
		authenticate,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		await page.goto("/mypage");
		await expect(page.locator("#account-info")).toBeVisible({
			timeout: 15_000,
		});

		// See: src/app/(web)/_components/Header.tsx > #site-title
		await expect(page.locator("#site-title")).toBeVisible();
		await page.locator("#site-title").click();
		await page.waitForURL("/");
		expect(page.url()).toContain("/");

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (5) 認証コード検証ページ /auth/verify
// ---------------------------------------------------------------------------

/**
 * 認証コード検証ページの到達性・UI要素を検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.3 各ページでの検証項目
 * See: src/app/(web)/auth/verify/page.tsx
 */
test.describe("認証コード検証ページ /auth/verify", () => {
	test("HTTPステータス200で応答し、認証フォームが表示される", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const response = await page.goto("/auth/verify");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/auth/verify/page.tsx > #auth-verify-form
		await expect(page.locator("#auth-verify-form")).toBeVisible({
			timeout: 10_000,
		});

		// See: src/app/(web)/auth/verify/page.tsx > #auth-code-input
		await expect(page.locator("#auth-code-input")).toBeVisible();

		// See: src/app/(web)/auth/verify/page.tsx > #auth-submit-btn
		await expect(page.locator("#auth-submit-btn")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});

	test("クエリパラメータ code を渡すと認証コードがプリフィルされる", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const response = await page.goto("/auth/verify?code=123456");
		expect(response?.status()).toBe(200);

		await expect(page.locator("#auth-verify-form")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.locator("#auth-code-input")).toHaveValue("123456");

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (6) 開発連絡板 /dev
// ---------------------------------------------------------------------------

/**
 * 開発連絡板の到達性・UI要素を検証する。
 *
 * 認証不要のページ。既存の非認証テストと同パターン。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.3 各ページでの検証項目
 * See: src/app/(web)/dev/page.tsx
 * See: features/thread.feature @url_structure
 */
test.describe("開発連絡板 /dev", () => {
	test("HTTPステータス200で応答し、主要UI要素が表示される", async ({
		page,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const response = await page.goto("/dev");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/dev/page.tsx > #thread-create-form（ThreadCreateForm で boardId="dev"）
		await expect(page.locator("#thread-create-form")).toBeVisible();

		// See: src/app/(web)/dev/page.tsx > #auth-prompt
		await expect(page.locator("#auth-prompt")).toBeVisible();

		await expect(page.locator("main")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (7) メール本登録ページ /register/email（仮ユーザー認証必須）
// ---------------------------------------------------------------------------

/**
 * メール本登録ページの到達性・UI要素を検証する。
 *
 * authenticate フィクスチャは is_verified=false の仮ユーザーを作成するため、
 * 本ページ（仮ユーザー向け）が正常表示されることを検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/register/email/page.tsx
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 */
test.describe("メール本登録ページ /register/email", () => {
	test("認証後にアクセスでき、登録フォームが表示される", async ({
		page,
		authenticate,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// authenticate フィクスチャで仮ユーザーとして Cookie 設定済み → 直接アクセス
		// See: e2e/fixtures/auth.fixture.ts > authenticateLocal (is_verified=false)
		const response = await page.goto("/register/email");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/register/email/page.tsx > #register-email-form
		await expect(page.locator("#register-email-form")).toBeVisible({
			timeout: 10_000,
		});

		// See: src/app/(web)/register/email/page.tsx > #register-email-input
		await expect(page.locator("#register-email-input")).toBeVisible();

		// See: src/app/(web)/register/email/page.tsx > #register-email-submit-btn
		await expect(page.locator("#register-email-submit-btn")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (8) Discord本登録ページ /register/discord（仮ユーザー認証必須）
// ---------------------------------------------------------------------------

/**
 * Discord本登録ページの到達性・UI要素を検証する。
 *
 * authenticate フィクスチャは is_verified=false の仮ユーザーを作成するため、
 * 本ページ（仮ユーザー向け）が正常表示されることを検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/register/discord/page.tsx
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 */
test.describe("Discord本登録ページ /register/discord", () => {
	test("認証後にアクセスでき、Discord登録ボタンが表示される", async ({
		page,
		authenticate,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// authenticate フィクスチャで仮ユーザーとして Cookie 設定済み → 直接アクセス
		// See: e2e/fixtures/auth.fixture.ts > authenticateLocal (is_verified=false)
		const response = await page.goto("/register/discord");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/register/discord/page.tsx > #register-discord-page
		await expect(page.locator("#register-discord-page")).toBeVisible({
			timeout: 10_000,
		});

		// See: src/app/(web)/register/discord/page.tsx > #register-discord-btn
		await expect(page.locator("#register-discord-btn")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (9) 管理ダッシュボード /admin（管理者認証必須）
// ---------------------------------------------------------------------------

/**
 * 管理ダッシュボードの到達性・UI要素を検証する。
 *
 * adminSessionToken フィクスチャで管理者セッショントークンを取得し、
 * admin_session Cookie を設定してからページにアクセスする。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/admin/page.tsx
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
test.describe("管理ダッシュボード /admin", () => {
	test("管理者認証後にアクセスでき、ダッシュボード要素が表示される", async ({
		page,
		adminSessionToken,
		context,
		baseURL,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// admin_session Cookie を設定してから /admin にアクセスする
		// See: src/lib/constants/cookie-names.ts > ADMIN_SESSION_COOKIE = 'admin_session'
		// See: src/app/(web)/admin/layout.tsx > admin_session ガード
		await context.addCookies([
			{
				name: "admin_session",
				value: adminSessionToken,
				url: baseURL,
			},
		]);

		const response = await page.goto("/admin");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/admin/layout.tsx > #admin-nav（サイドナビゲーション）
		await expect(page.locator("#admin-nav")).toBeVisible({
			timeout: 15_000,
		});

		// See: src/app/(web)/admin/page.tsx > #stats-cards（統計カードグリッド）
		await expect(page.locator("#stats-cards")).toBeVisible({
			timeout: 15_000,
		});

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (10) 管理ユーザー一覧 /admin/users（管理者認証必須）
// ---------------------------------------------------------------------------

/**
 * 管理ユーザー一覧ページの到達性・UI要素を検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/admin/users/page.tsx
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
test.describe("管理ユーザー一覧 /admin/users", () => {
	test("管理者認証後にアクセスでき、ユーザーテーブルが表示される", async ({
		page,
		adminSessionToken,
		context,
		baseURL,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// admin_session Cookie を設定してから /admin/users にアクセスする
		// See: src/lib/constants/cookie-names.ts > ADMIN_SESSION_COOKIE = 'admin_session'
		await context.addCookies([
			{
				name: "admin_session",
				value: adminSessionToken,
				url: baseURL,
			},
		]);

		const response = await page.goto("/admin/users");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/admin/layout.tsx > #admin-nav（サイドナビゲーション）
		await expect(page.locator("#admin-nav")).toBeVisible({
			timeout: 15_000,
		});

		// See: src/app/(web)/admin/users/page.tsx > #user-list-table（ユーザーテーブル）
		await expect(page.locator("#user-list-table")).toBeVisible({
			timeout: 15_000,
		});

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (11) 管理ユーザー詳細 /admin/users/[userId]（管理者認証必須）
// ---------------------------------------------------------------------------

/**
 * 管理ユーザー詳細ページの到達性・UI要素を検証する。
 *
 * authenticate フィクスチャでテストユーザーを作成し、そのユーザーIDでアクセスする。
 * 管理者認証は adminSessionToken フィクスチャで取得した Cookie で行う。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/admin/users/[userId]/page.tsx
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
test.describe("管理ユーザー詳細 /admin/users/[userId]", () => {
	test("管理者認証後にユーザー詳細にアクセスでき、基本情報が表示される", async ({
		page,
		adminSessionToken,
		authenticate,
		context,
		baseURL,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// authenticate フィクスチャでテストユーザーを作成し userId を取得
		// See: e2e/fixtures/auth.fixture.ts > authenticateLocal
		const { userId } = authenticate;

		// admin_session Cookie を設定してから /admin/users/{userId} にアクセスする
		// See: src/lib/constants/cookie-names.ts > ADMIN_SESSION_COOKIE = 'admin_session'
		await context.addCookies([
			{
				name: "admin_session",
				value: adminSessionToken,
				url: baseURL,
			},
		]);

		const response = await page.goto(`/admin/users/${userId}`);
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/admin/layout.tsx > #admin-nav（サイドナビゲーション）
		await expect(page.locator("#admin-nav")).toBeVisible({
			timeout: 15_000,
		});

		// See: src/app/(web)/admin/users/[userId]/page.tsx > #user-basic-info（基本情報セクション）
		await expect(page.locator("#user-basic-info")).toBeVisible({
			timeout: 15_000,
		});

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (12) IP BAN管理 /admin/ip-bans（管理者認証必須）
// ---------------------------------------------------------------------------

/**
 * IP BAN管理ページの到達性・UI要素を検証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.6 認証が必要なページの扱い
 * See: src/app/(web)/admin/ip-bans/page.tsx
 * See: features/admin.feature @管理者がIP BANを解除する
 */
test.describe("IP BAN管理 /admin/ip-bans", () => {
	test("管理者認証後にアクセスでき、IP BANテーブルが表示される", async ({
		page,
		adminSessionToken,
		context,
		baseURL,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		// admin_session Cookie を設定してから /admin/ip-bans にアクセスする
		// See: src/lib/constants/cookie-names.ts > ADMIN_SESSION_COOKIE = 'admin_session'
		await context.addCookies([
			{
				name: "admin_session",
				value: adminSessionToken,
				url: baseURL,
			},
		]);

		const response = await page.goto("/admin/ip-bans");
		expect(response?.status()).toBe(200);

		// See: src/app/(web)/admin/layout.tsx > #admin-nav（サイドナビゲーション）
		await expect(page.locator("#admin-nav")).toBeVisible({
			timeout: 15_000,
		});

		// See: src/app/(web)/admin/ip-bans/page.tsx > #ip-ban-list-table（IP BANテーブル）
		await expect(page.locator("#ip-ban-list-table")).toBeVisible({
			timeout: 15_000,
		});

		expect(jsErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (13) 旧スレッドURLリダイレクト /threads/[threadId]
// ---------------------------------------------------------------------------

/**
 * 旧スレッドURL `/threads/{UUID}` が新URLへリダイレクトされることを検証する。
 *
 * seedThread フィクスチャでスレッドを作成し、そのスレッドIDでアクセスする。
 * Playwright の page.goto() はデフォルトでリダイレクトを追跡するため、
 * 最終URLが `/{boardId}/{threadKey}/` 形式になることを確認する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.7 動的ルートの扱い
 * See: src/app/(web)/threads/[threadId]/page.tsx
 * See: features/thread.feature @url_structure
 */
test.describe("旧スレッドURLリダイレクト /threads/[threadId]", () => {
	test("旧スレッドURLにアクセスすると新URLへリダイレクトされる", async ({
		page,
		seedThread,
	}) => {
		const jsErrors: string[] = [];
		page.on("pageerror", (err) => {
			jsErrors.push(err.message);
		});

		const { threadId, threadKey } = seedThread;

		// page.goto() はリダイレクトを追跡し最終ページのレスポンスを返す
		// See: src/app/(web)/threads/[threadId]/page.tsx > redirect(`/${boardId}/${threadKey}/`)
		const response = await page.goto(`/threads/${threadId}`);
		expect(response?.status()).toBe(200);

		// 最終 URL に threadKey が含まれていることを確認する。
		// Next.js のトレイリングスラッシュ正規化により末尾スラッシュが除去される場合があるため
		// threadKey を含む /{boardId}/{threadKey} 形式のパスで検証する。
		// See: features/thread.feature @url_structure
		expect(page.url()).toContain(`/${threadKey}`);

		// スレッドページの主要 UI 要素が表示されていること
		// See: src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx > #thread-title
		await expect(page.locator("#thread-title")).toBeVisible();

		expect(jsErrors).toHaveLength(0);
	});
});
