/**
 * E2E カスタムフィクスチャ — 環境抽象化レイヤー
 *
 * specファイルは本ファイルの `test` と `expect` を import する。
 * `@playwright/test` を直接 import しないこと（ローカル限定の auth-flow.spec.ts を除く）。
 *
 * 環境切替: playwright.config.ts の use.isProduction で制御する。
 * - ローカル: isProduction = false（デフォルト）
 * - 本番:     isProduction = true（playwright.prod.config.ts で設定）
 *
 * See: docs/architecture/bdd_test_strategy.md §10.1.1 環境抽象化フィクスチャ
 * See: docs/architecture/bdd_test_strategy.md §10.3.3 ファイル構成
 */

import { test as base, expect } from "@playwright/test";
import {
	adminLoginProd,
	authenticateLocal,
	authenticateProd,
	ensureAdminAndLogin,
} from "./auth.fixture";
import {
	cleanupLocal,
	cleanupProd,
	seedThreadLocal,
	seedThreadProd,
} from "./data.fixture";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type SeedResult = { threadId: string; threadKey: string };

/**
 * カスタムフィクスチャの型定義。
 *
 * See: docs/architecture/bdd_test_strategy.md §10.1.1 フィクスチャ表
 */
type TestFixtures = {
	/**
	 * 認証済み状態を作る。
	 * テストで `authenticate` を引数に取ると自動的に認証が完了した状態になる。
	 */
	authenticate: { userId: string; edgeToken: string };

	/**
	 * 管理者セッショントークンを取得する。
	 * 管理者操作テストで明示的に使用する。
	 */
	adminSessionToken: string;

	/**
	 * テスト用スレッドをシードする。
	 * 戻り値の threadId / threadKey でテスト内からアクセスできる。
	 */
	seedThread: SeedResult;

	/**
	 * テストデータを削除する関数。
	 *
	 * - 引数なし: ローカル=全件削除、本番=noop
	 * - threadIds指定: 本番=管理者API経由で個別削除、ローカル=全件削除
	 *
	 * adminSessionToken は必要時に遅延取得する。
	 * ナビゲーションテスト等で cleanup() を呼んでも不要な管理者認証が走らない。
	 */
	cleanup: (threadIds?: string[]) => Promise<void>;
};

type TestOptions = {
	/** 本番環境フラグ。playwright.config.ts の use.isProduction で注入する。 */
	isProduction: boolean;
};

// ---------------------------------------------------------------------------
// フィクスチャ実装
// ---------------------------------------------------------------------------

export const test = base.extend<TestFixtures & TestOptions>({
	// --- オプション ---
	isProduction: [false, { option: true }],

	// --- authenticate ---
	authenticate: async ({ request, context, isProduction, baseURL }, use) => {
		if (isProduction) {
			await authenticateProd(context, baseURL!);
			// See: docs/operations/runbooks/seed-smoke-user.md
			await use({
				userId:
					process.env.PROD_SMOKE_USER_ID ??
					(() => {
						throw new Error(
							"PROD_SMOKE_USER_ID is not set in .env.prod.smoke. " +
								"See: docs/operations/runbooks/seed-smoke-user.md",
						);
					})(),
				edgeToken: process.env.PROD_SMOKE_EDGE_TOKEN ?? "",
			});
		} else {
			const result = await authenticateLocal(
				request,
				context,
				baseURL ?? "http://localhost:3000",
			);
			await use(result);
		}
	},

	// --- adminSessionToken ---
	adminSessionToken: async ({ request, isProduction, baseURL }, use) => {
		let token: string;
		if (isProduction) {
			token = await adminLoginProd(request, baseURL!);
		} else {
			token = await ensureAdminAndLogin(
				request,
				baseURL ?? "http://localhost:3000",
			);
		}
		await use(token);
	},

	// --- seedThread ---
	seedThread: async ({ request, isProduction, baseURL, authenticate }, use) => {
		let result: SeedResult;
		if (isProduction) {
			result = await seedThreadProd(request, baseURL!, authenticate.edgeToken);
		} else {
			result = await seedThreadLocal(request);
		}
		await use(result);
	},

	// --- cleanup ---
	// adminSessionToken に依存しない（遅延取得パターン）。
	// ナビゲーションテストの beforeEach で cleanup() を呼んでも
	// 不要な管理者ユーザー作成・ログインが走らないようにする。
	cleanup: async ({ request, isProduction, baseURL }, use) => {
		let cachedAdminToken: string | null = null;

		const getAdminToken = async (): Promise<string> => {
			if (cachedAdminToken) return cachedAdminToken;
			if (isProduction) {
				cachedAdminToken = await adminLoginProd(request, baseURL!);
			} else {
				cachedAdminToken = await ensureAdminAndLogin(
					request,
					baseURL ?? "http://localhost:3000",
				);
			}
			return cachedAdminToken;
		};

		const cleanupFn = async (threadIds?: string[]) => {
			if (isProduction) {
				if (!threadIds || threadIds.length === 0) return;
				const token = await getAdminToken();
				await cleanupProd(request, baseURL!, token, threadIds);
			} else {
				await cleanupLocal(request);
			}
		};
		await use(cleanupFn);
	},
});

export { expect };
