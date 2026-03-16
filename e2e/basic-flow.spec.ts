/**
 * E2E テスト: Phase 1 基本フロー縦断テスト
 *
 * 「通常の掲示板として使用可能であること」を自動検証する卒業試験的なテスト。
 * Supabase Local 実 DB に対して実行する（InMemory ではない）。
 *
 * 検証するフロー:
 * 1. トップページアクセス → スレッド一覧表示
 * 2. スレッド作成 → 未認証 401 → AuthModal 表示
 * 3. AuthModal から認証コード読み取り → 認証成功
 * 4. スレッド作成リトライ成功 → 一覧に表示
 * 5. スレッドを開く → 本文(>>1)表示
 * 6. レス書き込み（認証済み）→ レス表示
 *
 * See: docs/architecture/bdd_test_strategy.md §10 E2Eテスト方針
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 */

import { expect, test } from "@playwright/test";
import { completeAuth } from "./helpers/auth";
import { cleanupDatabase } from "./helpers/database";
import { mockTurnstile } from "./helpers/turnstile";

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const TEST_THREAD_TITLE = `E2Eテスト用スレッド_${Date.now()}`;
const TEST_THREAD_BODY = "これはE2Eテストで作成したスレッドの1レス目です。";
const TEST_REPLY_BODY = "これはE2Eテストで書き込んだレスです。";

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

test.describe("Phase 1 基本フロー縦断テスト", () => {
	/**
	 * 各テスト前にDBをクリーンアップして独立性を保証する。
	 * また Turnstile をモックに差し替えてオフライン環境でも認証フローが通るようにする。
	 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
	 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
	 */
	test.beforeEach(async ({ page, request }) => {
		// Turnstile モックを設定（ページへの最初のリクエスト前に登録する必要がある）
		await mockTurnstile(page);
		await cleanupDatabase(request);
	});

	test("スレッド作成→認証→閲覧→レス書き込みの基本フローが完結する", async ({
		page,
	}) => {
		// ------------------------------------------------------------------
		// Step 1: トップページにアクセス → スレッド一覧ページが表示される
		// ------------------------------------------------------------------
		await page.goto("/");

		// ページタイトル "BattleBoard" が含まれることを確認
		await expect(page).toHaveTitle(/BattleBoard/i);

		// スレッド作成フォームが表示されること
		// See: src/app/(web)/_components/ThreadCreateForm.tsx > #thread-create-form
		await expect(page.locator("#thread-create-form")).toBeVisible();

		// ------------------------------------------------------------------
		// Step 2: スレッド作成フォームにタイトルと本文を入力して送信
		// ------------------------------------------------------------------

		// タイトルを入力
		// See: src/app/(web)/_components/ThreadCreateForm.tsx > #thread-title-input
		await page.locator("#thread-title-input").fill(TEST_THREAD_TITLE);

		// 本文を入力
		// See: src/app/(web)/_components/ThreadCreateForm.tsx > #thread-body-input
		await page.locator("#thread-body-input").fill(TEST_THREAD_BODY);

		// スレッド作成ボタンをクリック
		// See: src/app/(web)/_components/ThreadCreateForm.tsx > #thread-submit-btn
		await page.locator("#thread-submit-btn").click();

		// ------------------------------------------------------------------
		// Step 3: 未認証のため 401 → AuthModal が表示される
		// ------------------------------------------------------------------
		// Step 4: AuthModal に表示された認証コードを読み取り入力して認証
		// ------------------------------------------------------------------
		// See: e2e/helpers/auth.ts > completeAuth
		await completeAuth(page);

		// ------------------------------------------------------------------
		// Step 5: 認証成功 → スレッド作成がリトライされ成功する
		// Step 6: 作成したスレッドが一覧に表示される
		// ------------------------------------------------------------------

		// スレッド一覧にリダイレクトされるか、フォームがリセットされて一覧が更新される
		// ThreadCreateForm.onCreated → ThreadListPage の再取得（Client Component の場合は router.refresh）
		// 作成したスレッドタイトルが一覧に表示されるまで待機
		await expect(page.locator(`text=${TEST_THREAD_TITLE}`)).toBeVisible({
			timeout: 15_000,
		});

		// ------------------------------------------------------------------
		// Step 7: スレッドをクリックして開く → 本文（>>1）が表示される
		// ------------------------------------------------------------------

		// スレッドタイトルリンクをクリック
		// See: src/app/(web)/_components/ThreadCard.tsx > #thread-title (Link)
		await page.locator(`a:has-text("${TEST_THREAD_TITLE}")`).click();

		// スレッドページに遷移するのを待つ
		await page.waitForURL(/\/threads\/.+/);

		// スレッドタイトルが表示されること
		// See: src/app/(web)/threads/[threadId]/page.tsx > #thread-title
		await expect(page.locator("#thread-title")).toHaveText(TEST_THREAD_TITLE);

		// >>1 （最初のレス）の本文が表示されること
		// See: src/app/(web)/_components/PostItem.tsx > #post-1
		await expect(page.locator("#post-1")).toBeVisible();
		await expect(page.locator("#post-1")).toContainText(TEST_THREAD_BODY);

		// ------------------------------------------------------------------
		// Step 8: レス書き込みフォームに本文を入力して送信（認証済みなので直接成功）
		// ------------------------------------------------------------------

		// レス本文を入力
		// See: src/app/(web)/_components/PostForm.tsx > #post-body-input
		await page.locator("#post-body-input").fill(TEST_REPLY_BODY);

		// 書き込みボタンをクリック
		// See: src/app/(web)/_components/PostForm.tsx > #post-submit-btn
		await page.locator("#post-submit-btn").click();

		// ------------------------------------------------------------------
		// Step 9: 書き込んだレスが表示される
		// ------------------------------------------------------------------

		// 書き込んだレスの本文が表示されるまで待機
		// router.refresh() によりページが更新されてレスが表示される
		// See: src/app/(web)/_components/PostForm.tsx > handleSubmit > router.refresh()
		await expect(page.locator(`text=${TEST_REPLY_BODY}`)).toBeVisible({
			timeout: 15_000,
		});

		// レス番号 >>2 が表示されること（スレッド作成時の >>1 + 書き込み = >>2）
		await expect(page.locator("#post-2")).toBeVisible();
		await expect(page.locator("#post-2")).toContainText(TEST_REPLY_BODY);
	});
});
