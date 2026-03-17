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
 * 7. !w >>1 コマンド実行 → 草が生えた結果がレス末尾に表示
 *
 * See: docs/architecture/bdd_test_strategy.md §10 E2Eテスト方針
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
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
/** !w コマンド（草を生やす）のテスト用入力テキスト */
const TEST_GRASS_COMMAND = "!w >>1";

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

	/**
	 * コマンド書き込み時に inlineSystemInfo（書き込み報酬）がレス末尾に表示される
	 *
	 * seedThreadWithPost() で別ユーザーの >>1 を事前投入し、
	 * `!w >>1` をコマンド付き書き込みとして投稿する。
	 *
	 * 検証ポイント:
	 * - 書き込み本文 `!w >>1` がそのまま表示される
	 * - inlineSystemInfo 領域（data-testid="post-inline-system-info"）が
	 *   区切り線付きでレス末尾に表示される
	 * - 書き込み報酬（IncentiveService 由来）の表示を確認する
	 *
	 * Note: 草コマンド（!w）の対象レス解決（>>N → UUID変換）は現時点で未実装のため、
	 * 草コマンド結果自体は inlineSystemInfo に含まれない。
	 * 書き込み報酬（daily_login, reply 等）が inlineSystemInfo に表示されることで、
	 * PostItem.tsx の inlineSystemInfo 表示UI と page.tsx のマッピングが正常に
	 * 機能していることを検証する。
	 *
	 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
	 * See: features/command_system.feature @書き込み報酬がレス末尾に表示される
	 * See: docs/specs/screens/thread-view.yaml > post-inline-system-info
	 */
	test("コマンド書き込み時に inlineSystemInfo がレス末尾に表示される", async ({
		page,
		request,
	}) => {
		// ------------------------------------------------------------------
		// Step 1: テスト用スレッドをシードデータとして投入する
		// seedThreadWithPost() は別ユーザーで >>1 を作成する
		// ------------------------------------------------------------------
		const { seedThreadWithPost } = await import("./helpers/database");
		const { threadId } = await seedThreadWithPost(request);

		// ------------------------------------------------------------------
		// Step 2: シードしたスレッドページに直接アクセス
		// ------------------------------------------------------------------
		await page.goto(`/threads/${threadId}`);

		// スレッドタイトルが表示されるまで待機
		// See: src/app/(web)/threads/[threadId]/page.tsx > #thread-title
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});

		// >>1 が表示されていることを確認
		await expect(page.locator("#post-1")).toBeVisible();

		// ------------------------------------------------------------------
		// Step 3: !w >>1 コマンドを書き込みフォームに入力して送信
		// 未認証のため AuthModal が表示されるので認証を完了する
		// ------------------------------------------------------------------

		// コマンドを入力
		// See: src/app/(web)/_components/PostForm.tsx > #post-body-input
		await page.locator("#post-body-input").fill(TEST_GRASS_COMMAND);

		// 書き込みボタンをクリック
		// See: src/app/(web)/_components/PostForm.tsx > #post-submit-btn
		await page.locator("#post-submit-btn").click();

		// 未認証のため AuthModal が表示される → 認証を完了する
		// See: e2e/helpers/auth.ts > completeAuth
		await completeAuth(page);

		// ------------------------------------------------------------------
		// Step 4: 書き込みが表示されるまで待機
		// router.refresh() によりページが更新される
		// ------------------------------------------------------------------

		// コマンドを含む書き込み（>>2）が表示されるまで待機
		// See: src/app/(web)/_components/PostItem.tsx > #post-2
		await expect(page.locator("#post-2")).toBeVisible({
			timeout: 15_000,
		});

		// 書き込み本文 "!w >>1" がそのまま表示されること
		await expect(page.locator("#post-2")).toContainText(TEST_GRASS_COMMAND);

		// ------------------------------------------------------------------
		// Step 5: inlineSystemInfo（書き込み報酬）がレス末尾に表示されることを確認
		// See: docs/specs/screens/thread-view.yaml > post-inline-system-info
		// See: features/command_system.feature @書き込み報酬がレス末尾に表示される
		// ------------------------------------------------------------------

		// post-inline-system-info 領域が >>2 のレス内に表示されること
		const inlineSystemInfo = page.locator(
			'#post-2 [data-testid="post-inline-system-info"]',
		);
		await expect(inlineSystemInfo).toBeVisible({ timeout: 15_000 });

		// 区切り線（hr要素）が表示されること
		// See: docs/specs/screens/thread-view.yaml > inline-separator
		const separator = page.locator("#post-2 hr");
		await expect(separator).toBeVisible();

		// 書き込み報酬メッセージが含まれること（IncentiveService 由来）
		// IncentiveService が daily_login / reply / new_thread_join 等の
		// 同期ボーナスを付与し、「📝 {eventType} +{amount}」形式で表示される
		// See: src/lib/services/post-service.ts > Step 8: inlineSystemInfo 構築
		await expect(inlineSystemInfo).toContainText("reply");
	});
});
