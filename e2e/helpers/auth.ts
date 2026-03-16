/**
 * E2E テストヘルパー: 認証ヘルパー関数
 *
 * AuthModal を通じた認証フローのヘルパー関数。
 * basic-flow.spec.ts および navigation.spec.ts で共有する。
 *
 * See: docs/architecture/bdd_test_strategy.md §10 E2Eテスト方針
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 */

import { expect, type Page } from "@playwright/test";

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
export async function waitForTurnstileAndEnableButton(
	page: Page,
): Promise<void> {
	// auth-submit-btn が enabled になるまで待機（Turnstile 自動パス完了の目印）
	await expect(page.locator("#auth-submit-btn")).toBeEnabled({
		timeout: 30_000,
	});
}

/**
 * AuthModal から認証コードを読み取り、入力して認証を完了させる。
 *
 * See: src/app/(web)/_components/AuthModal.tsx
 * See: docs/specs/screens/auth-code.yaml @SCR-004
 *
 * @param page - Playwright の Page オブジェクト
 */
export async function completeAuth(page: Page): Promise<void> {
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
