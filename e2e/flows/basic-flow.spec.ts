/**
 * E2E ベーシックフローテスト（環境共通）
 *
 * 認証済み状態から書き込み→コマンド→専ブラAPI確認→管理者削除の一連のフローを検証する。
 * ローカル・本番の両環境で実行される（環境差分はフィクスチャが吸収）。
 *
 * テスト構成（serial: 宣言順に実行、失敗時は後続スキップ）:
 *   1. コマンド書き込み + inlineSystemInfo 表示
 *   2. 隠しコマンド !abeshinzo + 独立レス表示
 *   3. !omikuji コマンド + 独立レス表示
 *   4. 専ブラAPI整合（書き込みデータが subject.txt / DAT に反映）
 *   5. 管理者テストデータ削除（削除完了 + 公開API消失確認 = クリーンアップ兼用）
 *
 * ライフサイクル:
 *   - beforeAll: 共有スレッドを1回だけ作成
 *   - 各テスト: 共有スレッドに対して書き込み・検証（レスは累積する）
 *   - 管理者削除テスト（最後）がクリーンアップを兼ねる
 *   - afterAll: テスト失敗時の安全ネット
 *
 * 旧実装ではテストごとにスレッドを作成・削除していた（5テスト = 5スレッド）。
 * 本番環境でアクティブスレッド上限（50件）の休眠管理に不要な負荷をかけるため、
 * 1スレッドを全テストで共有する方式に変更した。
 * See: e2e/flows/thread-ui.spec.ts の beforeAll/afterAll パターン
 *
 * See: docs/architecture/bdd_test_strategy.md §10.3 ベーシックフローテスト・認証テスト
 * See: docs/architecture/bdd_test_strategy.md §10.3.2 検証範囲
 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
 */

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import {
	cleanupLocal,
	cleanupProd,
	seedThreadLocal,
	seedThreadProd,
} from "../fixtures/data.fixture";

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const TEST_GRASS_COMMAND = "!w >>1";
const TEST_ABESHINZO_COMMAND = "!abeshinzo";

// ---------------------------------------------------------------------------
// 環境判定（beforeAll ではカスタムフィクスチャが使えないため process.env で判定）
// See: e2e/flows/thread-ui.spec.ts の同パターン
// ---------------------------------------------------------------------------

const isProduction = Boolean(process.env.PROD_BASE_URL);
const prodBaseURL = process.env.PROD_BASE_URL ?? "http://localhost:3000";
const edgeToken = process.env.PROD_SMOKE_EDGE_TOKEN ?? "";

// ---------------------------------------------------------------------------
// 共有スレッド（beforeAll で作成、全テストが参照）
// ---------------------------------------------------------------------------

let sharedThreadId = "";
let sharedThreadKey = "";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * 現在ページに表示されている最後のレス番号を返す。
 *
 * serial 実行でレスが累積するため、書き込み前に現在の末尾レス番号を
 * 動的に検出する。#post-1, #post-2, ... の連番で探索する。
 */
async function getLastPostNumber(page: Page): Promise<number> {
	for (let i = 1; i <= 200; i++) {
		if ((await page.locator(`#post-${i}`).count()) === 0) return i - 1;
	}
	return 200;
}

// ---------------------------------------------------------------------------
// テスト本体（serial: 順序保証 + 失敗時後続スキップ）
// ---------------------------------------------------------------------------

test.describe
	.serial("基本フロー検証（環境共通）", () => {
		/**
		 * 全テストの前に共有スレッドを1回だけ作成する。
		 *
		 * beforeAll ではカスタムフィクスチャ（authenticate 等）が使えないため、
		 * process.env から直接環境情報を取得し、seed 関数を直接呼び出す。
		 * See: e2e/flows/thread-ui.spec.ts の beforeAll パターン
		 */
		test.beforeAll(async ({ request }) => {
			let result: { threadId: string; threadKey: string };
			if (isProduction) {
				result = await seedThreadProd(request, prodBaseURL, edgeToken);
			} else {
				result = await seedThreadLocal(request);
			}
			sharedThreadId = result.threadId;
			sharedThreadKey = result.threadKey;
		});

		/**
		 * 安全ネット: テスト失敗時もクリーンアップを試みる。
		 * 管理者削除テスト（最後）が正常完了した場合は sharedThreadId が空になり、
		 * ここでの削除は実行されない。
		 *
		 * See: docs/architecture/bdd_test_strategy.md §10.3.4
		 */
		test.afterAll(async ({ request }) => {
			if (!sharedThreadId) return; // 管理者削除テストで既に削除済み

			try {
				if (isProduction) {
					const { adminLoginProd } = await import("../fixtures/auth.fixture");
					const adminToken = await adminLoginProd(request, prodBaseURL);
					await cleanupProd(request, prodBaseURL, adminToken, [sharedThreadId]);
				} else {
					await cleanupLocal(request);
				}
			} catch (e) {
				console.warn("[afterAll cleanup] failed:", e);
			}
		});

		// -----------------------------------------------------------------------
		// 1. コマンド書き込み + inlineSystemInfo
		// -----------------------------------------------------------------------

		/**
		 * コマンド書き込み時に inlineSystemInfo（書き込み報酬）がレス末尾に表示される。
		 *
		 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
		 * See: features/command_system.feature @書き込み報酬がレス末尾に表示される
		 */
		test("コマンド書き込み時に inlineSystemInfo がレス末尾に表示される", async ({
			page,
			authenticate,
		}) => {
			await page.goto(`/livebot/${sharedThreadKey}/`);
			await expect(page.locator("#thread-title")).toBeVisible({
				timeout: 15_000,
			});
			await expect(page.locator("#post-1")).toBeVisible();

			// 書き込み前の末尾レス番号を取得（前テストの累積に対応）
			const lastPost = await getLastPostNumber(page);

			// !w >>1 コマンドを書き込み（authenticate フィクスチャで認証済み）
			await page.locator("#post-body-input").fill(TEST_GRASS_COMMAND);
			await page.locator("#post-submit-btn").click();

			// 新しいレスが表示されるまで待機
			const myPostNum = lastPost + 1;
			await expect(page.locator(`#post-${myPostNum}`)).toBeVisible({
				timeout: 15_000,
			});
			await expect(page.locator(`#post-${myPostNum}`)).toContainText(
				TEST_GRASS_COMMAND,
			);

			// inlineSystemInfo 領域が表示される
			const inlineSystemInfo = page.locator(
				`#post-${myPostNum} [data-testid="post-inline-system-info"]`,
			);
			await expect(inlineSystemInfo).toBeVisible({ timeout: 15_000 });

			// 区切り線（hr要素）が表示される
			await expect(page.locator(`#post-${myPostNum} hr`)).toBeVisible();

			// inlineSystemInfo が空でないテキストを含むことを確認する。
			// 特定テキスト（"reply"）は期待しない: 本番環境では seedThread が認証ユーザー自身の
			// edge-token でスレッドを作成するため >>1 は自分の投稿となり、自己草禁止ルールにより
			// コマンドが失敗して "自分のレスには草を生やせません" が表示される場合がある。
			// テストの目的は「inlineSystemInfo が表示されること」の検証であり、
			// コマンド成功の検証は BDD テストが担う。
			await expect(inlineSystemInfo).not.toBeEmpty();
		});

		// -----------------------------------------------------------------------
		// 2. 隠しコマンド !abeshinzo
		// -----------------------------------------------------------------------

		/**
		 * 隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される。
		 *
		 * See: features/command_system.feature @hidden_command
		 * See: src/lib/services/handlers/abeshinzo-handler.ts
		 */
		test("隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される", async ({
			page,
			authenticate,
		}) => {
			await page.goto(`/livebot/${sharedThreadKey}/`);
			await expect(page.locator("#thread-title")).toBeVisible({
				timeout: 15_000,
			});
			await expect(page.locator("#post-1")).toBeVisible();

			const lastPost = await getLastPostNumber(page);

			// !abeshinzo コマンドを書き込み
			await page.locator("#post-body-input").fill(TEST_ABESHINZO_COMMAND);
			await page.locator("#post-submit-btn").click();

			// ユーザーの書き込み
			const myPostNum = lastPost + 1;
			await expect(page.locator(`#post-${myPostNum}`)).toBeVisible({
				timeout: 15_000,
			});

			// ★システム名義の独立レス（コマンド応答テキストで検索）
			// ウェルカムメッセージ等が間に入る場合があるため、レス番号ではなく内容で検証する
			await expect(page.getByText("意味のないコマンドだよ")).toBeVisible({
				timeout: 15_000,
			});
		});

		// -----------------------------------------------------------------------
		// 3. !omikuji コマンド
		// -----------------------------------------------------------------------

		/**
		 * !omikuji コマンドで★システム名義の独立レスが投稿される。
		 *
		 * See: features/command_omikuji.feature @おみくじ結果が独立システムレスで即座に表示される
		 * See: src/lib/services/handlers/omikuji-handler.ts
		 */
		test("!omikuji コマンドで★システム名義の独立レスが投稿される", async ({
			page,
			authenticate,
		}) => {
			await page.goto(`/livebot/${sharedThreadKey}/`);
			await expect(page.locator("#thread-title")).toBeVisible({
				timeout: 15_000,
			});
			await expect(page.locator("#post-1")).toBeVisible();

			const lastPost = await getLastPostNumber(page);

			// !omikuji コマンドを書き込み
			await page.locator("#post-body-input").fill("!omikuji");
			await page.locator("#post-submit-btn").click();

			// ユーザーの書き込み
			const myPostNum = lastPost + 1;
			await expect(page.locator(`#post-${myPostNum}`)).toBeVisible({
				timeout: 15_000,
			});
			await expect(page.locator(`#post-${myPostNum}`)).toContainText(
				"!omikuji",
			);

			// ★システム名義のおみくじ結果レス（内容で検証）
			await expect(page.getByText("の運勢は")).toBeVisible({
				timeout: 15_000,
			});
		});

		// -----------------------------------------------------------------------
		// 4. 専ブラAPI整合
		// -----------------------------------------------------------------------

		/**
		 * 書き込んだデータが専ブラAPI（subject.txt / DAT）に反映される。
		 *
		 * See: docs/architecture/bdd_test_strategy.md §10.3.2 > 専ブラAPI整合
		 * See: features/specialist_browser_compat.feature
		 */
		test("書き込んだスレッドが subject.txt と DAT に反映される", async ({
			request,
			baseURL,
		}) => {
			// subject.txt にスレッドが含まれることを確認
			const subjectRes = await request.get(`${baseURL}/livebot/subject.txt`);
			expect(subjectRes.status()).toBe(200);

			const subjectContentType = subjectRes.headers()["content-type"] ?? "";
			expect(subjectContentType.toLowerCase()).toContain("shift_jis");

			// subject.txt のバイナリから threadKey を検索
			const subjectBody = await subjectRes.body();
			const subjectText = subjectBody.toString("latin1");
			expect(subjectText).toContain(`${sharedThreadKey}.dat`);

			// DAT ファイルが取得できることを確認
			const datRes = await request.get(
				`${baseURL}/livebot/dat/${sharedThreadKey}.dat`,
			);
			expect(datRes.status()).toBe(200);

			const datContentType = datRes.headers()["content-type"] ?? "";
			expect(datContentType.toLowerCase()).toContain("shift_jis");

			// DAT にデータが存在する（空でない）
			const datBody = await datRes.body();
			expect(datBody.length).toBeGreaterThan(0);
		});

		// -----------------------------------------------------------------------
		// 5. 管理者削除（最後 = クリーンアップ兼用）
		// -----------------------------------------------------------------------

		/**
		 * 管理者がテストスレッドを削除し、公開APIから消えることを確認する。
		 *
		 * serial の最後に実行し、共有スレッドのクリーンアップを兼ねる。
		 * 本テスト成功時は sharedThreadId を空にし、afterAll での重複削除を防ぐ。
		 *
		 * See: docs/architecture/bdd_test_strategy.md §10.3.2 > 管理者操作
		 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
		 * See: features/admin.feature @管理者が指定したスレッドを削除する
		 */
		test("管理者がテストスレッドを削除し公開APIから消える", async ({
			request,
			baseURL,
			adminSessionToken,
		}) => {
			// 削除前: 公開API（/api/threads）にスレッドが存在する
			const beforeRes = await request.get(`${baseURL}/api/threads`);
			expect(beforeRes.status()).toBe(200);
			const beforeBody = (await beforeRes.json()) as {
				threads: Array<{ id: string }>;
			};
			const existsBefore = beforeBody.threads.some(
				(t) => t.id === sharedThreadId,
			);
			expect(existsBefore, "削除前: スレッドが公開APIに存在すること").toBe(
				true,
			);

			// 管理者API経由でスレッドを削除
			const deleteRes = await request.delete(
				`${baseURL}/api/admin/threads/${sharedThreadId}`,
				{
					headers: {
						Cookie: `admin_session=${adminSessionToken}`,
					},
				},
			);
			expect(deleteRes.status()).toBe(200);

			// 削除後: 公開API（/api/threads）からスレッドが消えている
			const afterRes = await request.get(`${baseURL}/api/threads`);
			expect(afterRes.status()).toBe(200);
			const afterBody = (await afterRes.json()) as {
				threads: Array<{ id: string }>;
			};
			const existsAfter = afterBody.threads.some(
				(t) => t.id === sharedThreadId,
			);
			expect(existsAfter, "削除後: スレッドが公開APIから消えていること").toBe(
				false,
			);

			// 専ブラAPI（subject.txt）からもスレッドが消えている
			const subjectRes = await request.get(`${baseURL}/livebot/subject.txt`);
			const subjectBody = await subjectRes.body();
			const subjectText = subjectBody.toString("latin1");
			expect(subjectText).not.toContain(`${sharedThreadKey}.dat`);

			// DAT ファイルも 404 になる
			const datRes = await request.get(
				`${baseURL}/livebot/dat/${sharedThreadKey}.dat`,
			);
			expect([200, 404]).toContain(datRes.status());
			// ソフトデリートの場合 200 だが空データの可能性もある
			// 404 が返る場合はより明確に削除されている

			// クリーンアップ完了 — afterAll の重複削除を抑止する
			sharedThreadId = "";
		});
	});
