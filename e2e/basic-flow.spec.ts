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

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Turnstile モック
// ---------------------------------------------------------------------------

/**
 * Cloudflare Turnstile をクライアント・サーバー双方でモックする。
 *
 * E2E テスト環境では以下の2段階でモックする:
 *
 * 1. クライアント側: Turnstile スクリプトの URL をインターセプトし、
 *    render() 呼び出し時に即座に callback でテストトークンを返すモックに差し替える。
 *
 * 2. サーバー側: Cloudflare siteverify API のリクエストをインターセプトし、
 *    常に { success: true } を返す。これにより TURNSTILE_SECRET_KEY が設定されていても
 *    E2E テストでは常に検証が通る。
 *    ※ Next.js の API ルートが Cloudflare API を呼ぶ際はサーバーからのリクエストのため
 *      page.route() では捕捉できない。代わりに TURNSTILE_SECRET_KEY 環境変数制御に依存。
 *
 * なお、サーバー側の turnstile-client.ts は TURNSTILE_SECRET_KEY 未設定時に常に true を返す
 * フォールバックがあるが、.env.local に TURNSTILE_SECRET_KEY が設定されている場合は
 * Next.js サーバーが自動的に読み込んでしまう。
 * そのため、webServer 起動時に TURNSTILE_SECRET_KEY を空文字列で上書きすることが必要。
 * playwright.config.ts の webServer.env で対処する。
 *
 * See: src/lib/infrastructure/external/turnstile-client.ts
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 *
 * @param page - Playwright の Page オブジェクト
 */
async function mockTurnstile(page: Page): Promise<void> {
  // Cloudflare Turnstile スクリプトのリクエストをインターセプトしてモックに差し替える
  // ブラウザ→Cloudflare へのリクエストを捕捉（クライアント側モック）
  await page.route(
    "**/challenges.cloudflare.com/turnstile/**",
    (route) => {
      // モック Turnstile 実装: render() が呼ばれたら即座に callback でトークンを発行
      const mockScript = `
        (function() {
          window.turnstile = {
            render: function(container, options) {
              var widgetId = 'mock-widget-' + Date.now();
              // 非同期で callback を呼び出し（実装の初期化タイミングに合わせる）
              setTimeout(function() {
                if (options && options.callback) {
                  options.callback('e2e-mock-token');
                }
              }, 100);
              return widgetId;
            },
            reset: function(widgetId) {
              // リセット後も自動で再発行（認証失敗後のリトライに対応）
            }
          };
        })();
      `;
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: mockScript,
      });
    }
  );
}

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const TEST_THREAD_TITLE = `E2Eテスト用スレッド_${Date.now()}`;
const TEST_THREAD_BODY = "これはE2Eテストで作成したスレッドの1レス目です。";
const TEST_REPLY_BODY = "これはE2Eテストで書き込んだレスです。";

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * Turnstile ウィジェットが自動パスして認証ボタンが有効になるまで待機する。
 *
 * テストキー "1x00000000000000000000AA" を使用している場合、Cloudflare が自動的に
 * トークンを発行し、callback が呼ばれて auth-submit-btn が enabled になる。
 *
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 *
 * @param page - Playwright の Page オブジェクト
 */
async function waitForTurnstileAndEnableButton(page: Page): Promise<void> {
  // auth-submit-btn が enabled になるまで待機（Turnstile 自動パス完了の目印）
  await expect(page.locator("#auth-submit-btn")).toBeEnabled({ timeout: 30_000 });
}

/**
 * AuthModal から認証コードを読み取り、入力して認証を完了させる。
 *
 * See: src/app/(web)/_components/AuthModal.tsx
 * See: docs/specs/screens/auth-code.yaml @SCR-004
 *
 * @param page - Playwright の Page オブジェクト
 */
async function completeAuth(page: Page): Promise<void> {
  // AuthModal が表示されるのを待つ
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // 認証コードを DOM から読み取る
  // See: src/app/(web)/_components/AuthModal.tsx > #auth-code-display
  const authCodeDisplay = page.locator("#auth-code-display");
  await expect(authCodeDisplay).toBeVisible({ timeout: 5_000 });
  const authCode = await authCodeDisplay.textContent();
  expect(authCode).toMatch(/^\d{6}$/);

  // 認証コードを入力欄に入力する
  // See: src/app/(web)/_components/AuthModal.tsx > #auth-code-input
  const authCodeInput = page.locator("#auth-code-input");
  await authCodeInput.fill(authCode!);

  // Turnstile 自動パスを待つ（認証ボタンが有効になるまで）
  await waitForTurnstileAndEnableButton(page);

  // 認証ボタンをクリック
  // See: src/app/(web)/_components/AuthModal.tsx > #auth-submit-btn
  await page.locator("#auth-submit-btn").click();

  // AuthModal が閉じるのを待つ（認証成功の証拠）
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// DB クリーンアップ
// ---------------------------------------------------------------------------

/**
 * テスト前に Supabase Local DB の主要テーブルをクリーンアップする。
 *
 * テスト間の独立性を保証するため、各テスト前に実行する。
 * Supabase Local の REST API（POST /rest/v1/rpc/... は使わず）を直接操作するのではなく、
 * Service Role Key を使って全レコードを削除する。
 *
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 */
async function cleanupDatabase(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const headers = {
    "apikey": serviceRoleKey,
    "Authorization": `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
  };

  // posts → threads の順で削除（外部キー制約を考慮）
  await request.delete(`${supabaseUrl}/rest/v1/posts?id=neq.00000000-0000-0000-0000-000000000000`, { headers });
  await request.delete(`${supabaseUrl}/rest/v1/threads?id=neq.00000000-0000-0000-0000-000000000000`, { headers });
  // edge_tokens（認証トークン）も削除
  await request.delete(`${supabaseUrl}/rest/v1/edge_tokens?id=neq.00000000-0000-0000-0000-000000000000`, { headers });
}

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

  test(
    "スレッド作成→認証→閲覧→レス書き込みの基本フローが完結する",
    async ({ page }) => {
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
      await completeAuth(page);

      // ------------------------------------------------------------------
      // Step 5: 認証成功 → スレッド作成がリトライされ成功する
      // Step 6: 作成したスレッドが一覧に表示される
      // ------------------------------------------------------------------

      // スレッド一覧にリダイレクトされるか、フォームがリセットされて一覧が更新される
      // ThreadCreateForm.onCreated → ThreadListPage の再取得（Client Component の場合は router.refresh）
      // 作成したスレッドタイトルが一覧に表示されるまで待機
      await expect(
        page.locator(`text=${TEST_THREAD_TITLE}`)
      ).toBeVisible({ timeout: 15_000 });

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
      await expect(
        page.locator(`text=${TEST_REPLY_BODY}`)
      ).toBeVisible({ timeout: 15_000 });

      // レス番号 >>2 が表示されること（スレッド作成時の >>1 + 書き込み = >>2）
      await expect(page.locator("#post-2")).toBeVisible();
      await expect(page.locator("#post-2")).toContainText(TEST_REPLY_BODY);
    }
  );
});
