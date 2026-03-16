/**
 * E2E テストヘルパー: Cloudflare Turnstile モック
 *
 * Turnstile をクライアント側でモックに差し替えるヘルパー。
 * basic-flow.spec.ts および navigation.spec.ts で共有する。
 *
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 */

import type { Page } from "@playwright/test";

/**
 * Cloudflare Turnstile をクライアント側でモックする。
 *
 * E2E テスト環境では以下の2段階でモックする:
 *
 * 1. クライアント側: Turnstile スクリプトの URL をインターセプトし、
 *    render() 呼び出し時に即座に callback でテストトークンを返すモックに差し替える。
 *
 * 2. サーバー側: TURNSTILE_SECRET_KEY 環境変数未設定により turnstile-client.ts が
 *    常に true を返す（playwright.config.ts の webServer.env で制御）。
 *
 * See: src/lib/infrastructure/external/turnstile-client.ts
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 *
 * @param page - Playwright の Page オブジェクト
 */
export async function mockTurnstile(page: Page): Promise<void> {
	// Cloudflare Turnstile スクリプトのリクエストをインターセプトしてモックに差し替える
	// ブラウザ→Cloudflare へのリクエストを捕捉（クライアント側モック）
	await page.route("**/challenges.cloudflare.com/turnstile/**", (route) => {
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
	});
}
