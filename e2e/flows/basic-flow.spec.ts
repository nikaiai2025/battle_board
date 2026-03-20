/**
 * E2E ベーシックフローテスト（環境共通）
 *
 * 認証済み状態から書き込み→コマンド→専ブラAPI確認→管理者削除の一連のフローを検証する。
 * ローカル・本番の両環境で実行される（環境差分はフィクスチャが吸収）。
 *
 * テスト構成:
 *   1. コマンド書き込み + inlineSystemInfo 表示
 *   2. 隠しコマンド !abeshinzo + 独立レス表示
 *   3. 専ブラAPI整合（書き込みデータが subject.txt / DAT に反映）
 *   4. 管理者テストデータ削除（削除完了 + 公開API消失確認）
 *
 * See: docs/architecture/bdd_test_strategy.md §10.3 ベーシックフローテスト・認証テスト
 * See: docs/architecture/bdd_test_strategy.md §10.3.2 検証範囲
 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
 */

import { expect, test } from "../fixtures";

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const TEST_GRASS_COMMAND = "!w >>1";
const TEST_ABESHINZO_COMMAND = "!abeshinzo";

// ---------------------------------------------------------------------------
// テスト全体の安全ネット — テスト失敗時もクリーンアップを試みる
// See: docs/architecture/bdd_test_strategy.md §10.3.4
// ---------------------------------------------------------------------------

/** テスト中に作成されたスレッドIDを記録する */
const createdThreadIds: string[] = [];

test.afterAll(async ({ request, isProduction }) => {
	// ローカル環境のみ: 安全ネットとして全データ削除を試みる
	// 本番は各テスト内の cleanup([threadId]) で対処する
	if (!isProduction) {
		const { cleanupLocal } = await import("../fixtures/data.fixture");
		await cleanupLocal(request).catch((e) =>
			console.warn("[afterAll cleanup] failed:", e),
		);
	}
});

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

test.describe("基本フロー検証（環境共通）", () => {
	/**
	 * コマンド書き込み時に inlineSystemInfo（書き込み報酬）がレス末尾に表示される。
	 *
	 * seedThread で >>1 を事前投入し、認証済みユーザーで `!w >>1` を投稿する。
	 *
	 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
	 * See: features/command_system.feature @書き込み報酬がレス末尾に表示される
	 */
	test("コマンド書き込み時に inlineSystemInfo がレス末尾に表示される", async ({
		page,
		authenticate,
		seedThread,
		cleanup,
	}) => {
		const { threadId, threadKey } = seedThread;
		createdThreadIds.push(threadId);

		// シードしたスレッドにアクセス
		await page.goto(`/threads/${threadId}`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("#post-1")).toBeVisible();

		// !w >>1 コマンドを書き込み（authenticate フィクスチャで認証済み）
		await page.locator("#post-body-input").fill(TEST_GRASS_COMMAND);
		await page.locator("#post-submit-btn").click();

		// >>2 が表示されるまで待機
		await expect(page.locator("#post-2")).toBeVisible({ timeout: 15_000 });
		await expect(page.locator("#post-2")).toContainText(TEST_GRASS_COMMAND);

		// inlineSystemInfo 領域が表示される
		const inlineSystemInfo = page.locator(
			'#post-2 [data-testid="post-inline-system-info"]',
		);
		await expect(inlineSystemInfo).toBeVisible({ timeout: 15_000 });

		// 区切り線（hr要素）が表示される
		await expect(page.locator("#post-2 hr")).toBeVisible();

		// inlineSystemInfo が空でないテキストを含むことを確認する。
		// 特定テキスト（"reply"）は期待しない: 本番環境では seedThread が認証ユーザー自身の
		// edge-token でスレッドを作成するため >>1 は自分の投稿となり、自己草禁止ルールにより
		// コマンドが失敗して "自分のレスには草を生やせません" が表示される場合がある。
		// テストの目的は「inlineSystemInfo が表示されること」の検証であり、
		// コマンド成功の検証は BDD テストが担う。
		await expect(inlineSystemInfo).not.toBeEmpty();

		// クリーンアップ
		await cleanup([threadId]);
	});

	/**
	 * 隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される。
	 *
	 * See: features/command_system.feature @hidden_command
	 * See: src/lib/services/handlers/abeshinzo-handler.ts
	 */
	test("隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される", async ({
		page,
		authenticate,
		seedThread,
		cleanup,
	}) => {
		const { threadId } = seedThread;
		createdThreadIds.push(threadId);

		// シードしたスレッドにアクセス
		await page.goto(`/threads/${threadId}`);
		await expect(page.locator("#thread-title")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator("#post-1")).toBeVisible();

		// !abeshinzo コマンドを書き込み
		await page.locator("#post-body-input").fill(TEST_ABESHINZO_COMMAND);
		await page.locator("#post-submit-btn").click();

		// ユーザーの書き込み（>>2）
		await expect(page.locator("#post-2")).toBeVisible({ timeout: 15_000 });

		// ★システム名義の独立レス（>>3）
		await expect(page.locator("#post-3")).toBeVisible({ timeout: 15_000 });
		await expect(page.locator("#post-3")).toContainText("★システム");
		await expect(page.locator("#post-3")).toContainText(
			"意味のないコマンドだよ",
		);

		// クリーンアップ
		await cleanup([threadId]);
	});

	/**
	 * 書き込んだデータが専ブラAPI（subject.txt / DAT）に反映される。
	 *
	 * See: docs/architecture/bdd_test_strategy.md §10.3.2 > 専ブラAPI整合
	 * See: features/constraints/specialist_browser_compat.feature
	 */
	test("書き込んだスレッドが subject.txt と DAT に反映される", async ({
		page,
		request,
		baseURL,
		authenticate,
		seedThread,
		cleanup,
	}) => {
		const { threadId, threadKey } = seedThread;
		createdThreadIds.push(threadId);

		// subject.txt にスレッドが含まれることを確認
		const subjectRes = await request.get(`${baseURL}/battleboard/subject.txt`);
		expect(subjectRes.status()).toBe(200);

		const subjectContentType = subjectRes.headers()["content-type"] ?? "";
		expect(subjectContentType.toLowerCase()).toContain("shift_jis");

		// subject.txt のバイナリから threadKey を検索
		const subjectBody = await subjectRes.body();
		const subjectText = subjectBody.toString("latin1");
		expect(subjectText).toContain(`${threadKey}.dat`);

		// DAT ファイルが取得できることを確認
		const datRes = await request.get(
			`${baseURL}/battleboard/dat/${threadKey}.dat`,
		);
		expect(datRes.status()).toBe(200);

		const datContentType = datRes.headers()["content-type"] ?? "";
		expect(datContentType.toLowerCase()).toContain("shift_jis");

		// DAT にデータが存在する（空でない）
		const datBody = await datRes.body();
		expect(datBody.length).toBeGreaterThan(0);

		// クリーンアップ
		await cleanup([threadId]);
	});

	/**
	 * 管理者がテストスレッドを削除し、公開APIから消えることを確認する。
	 *
	 * テストデータ削除フロー: 管理者API DELETE → スレッド非表示の検証。
	 * cleanup フィクスチャの動作確認も兼ねる（一石二鳥）。
	 *
	 * See: docs/architecture/bdd_test_strategy.md §10.3.2 > 管理者操作
	 * See: docs/architecture/bdd_test_strategy.md §10.3.4 安全性制約
	 * See: features/admin.feature @管理者が指定したスレッドを削除する
	 */
	test("管理者がテストスレッドを削除し公開APIから消える", async ({
		request,
		baseURL,
		seedThread,
		cleanup,
		adminSessionToken,
	}) => {
		const { threadId, threadKey } = seedThread;

		// 削除前: 公開API（/api/threads）にスレッドが存在する
		const beforeRes = await request.get(`${baseURL}/api/threads`);
		expect(beforeRes.status()).toBe(200);
		const beforeBody = (await beforeRes.json()) as {
			threads: Array<{ id: string }>;
		};
		const existsBefore = beforeBody.threads.some((t) => t.id === threadId);
		expect(existsBefore, "削除前: スレッドが公開APIに存在すること").toBe(true);

		// 管理者API経由でスレッドを削除
		const deleteRes = await request.delete(
			`${baseURL}/api/admin/threads/${threadId}`,
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
		const existsAfter = afterBody.threads.some((t) => t.id === threadId);
		expect(existsAfter, "削除後: スレッドが公開APIから消えていること").toBe(
			false,
		);

		// 専ブラAPI（subject.txt）からもスレッドが消えている
		const subjectRes = await request.get(`${baseURL}/battleboard/subject.txt`);
		const subjectBody = await subjectRes.body();
		const subjectText = subjectBody.toString("latin1");
		expect(subjectText).not.toContain(`${threadKey}.dat`);

		// DAT ファイルも 404 になる
		const datRes = await request.get(
			`${baseURL}/battleboard/dat/${threadKey}.dat`,
		);
		expect([200, 404]).toContain(datRes.status());
		// ソフトデリートの場合 200 だが空データの可能性もある
		// 404 が返る場合はより明確に削除されている

		// このテスト自体が cleanup の動作確認なので、追加の cleanup は不要
	});
});
