/**
 * wikipedia.test.ts — WikipediaAdapter 単体テスト
 *
 * 本テストは Wikimedia REST API をモックした単体テストで、実 API は叩かない
 * （エスカレーション ESC-TASK-379-1 論点A の決定により実 API 統合テストは作らない）。
 *
 * カバレッジ対象:
 *   - 純粋関数6個: isMetaPage / buildApiUrl / getTargetDateUtc / buildUserAgent / articleToCollectedItem
 *   - WikipediaAdapter.collect(): 正常系・404フォールバック・異常系
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
 * See: tmp/workers/bdd-architect_TASK-379/test_strategy.md §3
 */

import { describe, expect, it, vi } from "vitest";
import {
	articleToCollectedItem,
	buildApiUrl,
	buildUserAgent,
	type FetchJsonFn,
	getTargetDateUtc,
	isMetaPage,
	WikipediaAdapter,
} from "../../../../lib/collection/adapters/wikipedia";

// JSONフィクスチャを import（tsconfig.json の resolveJsonModule: true 前提）
import fixture from "./fixtures/wikipedia_top_ja_2026_04_12.json";

// ---------------------------------------------------------------------------
// T1. isMetaPage のテスト
// See: test_strategy.md §3.1
// ---------------------------------------------------------------------------

describe("isMetaPage", () => {
	// See: features/curation_bot.feature @ソースごとの蓄積上限は6件である

	it("T1.1: 'メインページ' は true（完全一致）", () => {
		expect(isMetaPage("メインページ")).toBe(true);
	});

	it("T1.2: 'Main_Page' は true（完全一致）", () => {
		expect(isMetaPage("Main_Page")).toBe(true);
	});

	it("T1.3: '特別:検索' は true（プレフィックス）", () => {
		expect(isMetaPage("特別:検索")).toBe(true);
	});

	it("T1.4: 'Special:Search' は true（プレフィックス）", () => {
		expect(isMetaPage("Special:Search")).toBe(true);
	});

	it("T1.5: 'Wikipedia:井戸端' は true（プレフィックス）", () => {
		expect(isMetaPage("Wikipedia:井戸端")).toBe(true);
	});

	it("T1.6: 'Help:目次' は true（プレフィックス）", () => {
		expect(isMetaPage("Help:目次")).toBe(true);
	});

	it("T1.7: 'File:Example.png' は true（プレフィックス）", () => {
		expect(isMetaPage("File:Example.png")).toBe(true);
	});

	it("T1.8: 'Category:歴史' は true（プレフィックス）", () => {
		expect(isMetaPage("Category:歴史")).toBe(true);
	});

	it("T1.8b: 'カテゴリ:歴史' は true（プレフィックス日本語）", () => {
		expect(isMetaPage("カテゴリ:歴史")).toBe(true);
	});

	it("T1.8c: 'ノート:戦国時代' は true（プレフィックス日本語）", () => {
		expect(isMetaPage("ノート:戦国時代")).toBe(true);
	});

	it("T1.8d: 'Template:Navbox' は true（プレフィックス）", () => {
		expect(isMetaPage("Template:Navbox")).toBe(true);
	});

	it("T1.9: '田中敦子_(声優)' は false（通常記事）", () => {
		expect(isMetaPage("田中敦子_(声優)")).toBe(false);
	});

	it("T1.10: '浅井長政' は false（通常記事）", () => {
		expect(isMetaPage("浅井長政")).toBe(false);
	});

	it("T1.11: 空文字列は false（通常記事扱い）", () => {
		// 空名はAPI側で返らない前提だが、安全側の挙動として false を返す
		expect(isMetaPage("")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// T2. buildApiUrl のテスト
// See: test_strategy.md §3.2
// ---------------------------------------------------------------------------

describe("buildApiUrl", () => {
	const BASE_URL =
		"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access";

	it("T2.1: ベース URL と year/month/day を組み合わせて URL を生成する", () => {
		expect(buildApiUrl(BASE_URL, 2026, "04", "12")).toBe(
			`${BASE_URL}/2026/04/12`,
		);
	});

	it("T2.2: 末尾スラッシュありの baseUrl でもスラッシュ二重化しない", () => {
		expect(buildApiUrl(`${BASE_URL}/`, 2026, "04", "12")).toBe(
			`${BASE_URL}/2026/04/12`,
		);
	});

	it("T2.3: 月・日の 0 埋めを保持する", () => {
		expect(buildApiUrl(BASE_URL, 2026, "01", "05")).toBe(
			`${BASE_URL}/2026/01/05`,
		);
	});
});

// ---------------------------------------------------------------------------
// T3. getTargetDateUtc のテスト
// See: test_strategy.md §3.3
// ---------------------------------------------------------------------------

describe("getTargetDateUtc", () => {
	it("T3.1: 2026-04-14 12:00Z の2日前は 2026-04-12", () => {
		const nowUtcMs = Date.UTC(2026, 3, 14, 12, 0, 0); // 3=4月 (0-indexed)
		const result = getTargetDateUtc(nowUtcMs, 2);
		expect(result).toEqual({ year: 2026, month: "04", day: "12" });
	});

	it("T3.2: 2026-04-14 12:00Z の3日前は 2026-04-11", () => {
		const nowUtcMs = Date.UTC(2026, 3, 14, 12, 0, 0);
		const result = getTargetDateUtc(nowUtcMs, 3);
		expect(result).toEqual({ year: 2026, month: "04", day: "11" });
	});

	it("T3.3: 月境界（2026-03-02 00:00Z の2日前）は 2026-02-28", () => {
		const nowUtcMs = Date.UTC(2026, 2, 2, 0, 0, 0);
		const result = getTargetDateUtc(nowUtcMs, 2);
		expect(result).toEqual({ year: 2026, month: "02", day: "28" });
	});

	it("T3.4: 年境界（2026-01-01 00:00Z の2日前）は 2025-12-30", () => {
		const nowUtcMs = Date.UTC(2026, 0, 1, 0, 0, 0);
		const result = getTargetDateUtc(nowUtcMs, 2);
		expect(result).toEqual({ year: 2025, month: "12", day: "30" });
	});

	it("T3.5: 閏年（2024-03-02 00:00Z の2日前）は 2024-02-29", () => {
		const nowUtcMs = Date.UTC(2024, 2, 2, 0, 0, 0);
		const result = getTargetDateUtc(nowUtcMs, 2);
		expect(result).toEqual({ year: 2024, month: "02", day: "29" });
	});
});

// ---------------------------------------------------------------------------
// T4. buildUserAgent のテスト
// See: test_strategy.md §3.4
// ---------------------------------------------------------------------------

describe("buildUserAgent", () => {
	it("T4.1: 連絡先を指定するとその値が User-Agent に入る", () => {
		const ua = buildUserAgent("ops@foo.com");
		expect(ua).toContain("ops@foo.com");
		expect(ua).toContain("BattleBoard/1.0");
		expect(ua).toContain("curation-bot/1.0");
	});

	it("T4.2: undefined の場合はデフォルト連絡先（bot-ops@example.com）を使う", () => {
		const ua = buildUserAgent(undefined);
		expect(ua).toContain("bot-ops@example.com");
	});

	it("T4.3: null の場合はデフォルト連絡先を使う", () => {
		const ua = buildUserAgent(null);
		expect(ua).toContain("bot-ops@example.com");
	});

	it("T4.4: 空文字列の場合はデフォルト連絡先を使う", () => {
		const ua = buildUserAgent("");
		expect(ua).toContain("bot-ops@example.com");
	});

	it("T4.5: 前後に空白を含む場合は trim する", () => {
		const ua = buildUserAgent("  ops@foo.com  ");
		expect(ua).toContain("ops@foo.com");
		// trim 後、連続空白（"  ops@foo.com"）や末尾スペース（"ops@foo.com  "）が残らない
		expect(ua).not.toContain("  ops@foo.com");
		expect(ua).not.toContain("ops@foo.com  ");
		expect(ua).not.toContain("ops@foo.com )");
	});

	it("T4.6: 'bot' 文字列が含まれる（Wikimedia 推奨）", () => {
		const ua = buildUserAgent("ops@foo.com");
		expect(ua.toLowerCase()).toContain("bot");
	});
});

// ---------------------------------------------------------------------------
// T5. articleToCollectedItem のテスト
// See: test_strategy.md §3.5
// ---------------------------------------------------------------------------

describe("articleToCollectedItem", () => {
	it("T5.1: '田中敦子_(声優)' はタイトルがスペース化・URLはエンコード済みアンダースコア維持", () => {
		const item = articleToCollectedItem({
			article: "田中敦子_(声優)",
			views: 102175,
			rank: 2,
		});
		expect(item.articleTitle).toBe("田中敦子 (声優)");
		// URL にアンダースコアはそのまま残り、日本語はパーセントエンコードされる
		expect(item.sourceUrl).toBe(
			"https://ja.wikipedia.org/wiki/%E7%94%B0%E4%B8%AD%E6%95%A6%E5%AD%90_(%E5%A3%B0%E5%84%AA)",
		);
		expect(item.buzzScore).toBe(102175);
	});

	it("T5.2: '浅井長政' はパーセントエンコード済み URL", () => {
		const item = articleToCollectedItem({
			article: "浅井長政",
			views: 40851,
			rank: 9,
		});
		expect(item.articleTitle).toBe("浅井長政");
		expect(item.sourceUrl).toBe(
			"https://ja.wikipedia.org/wiki/%E6%B5%85%E4%BA%95%E9%95%B7%E6%94%BF",
		);
		expect(item.buzzScore).toBe(40851);
	});

	it("T5.3: '姉川の戦い' は正常にエンコードされる", () => {
		const item = articleToCollectedItem({
			article: "姉川の戦い",
			views: 38054,
			rank: 10,
		});
		expect(item.articleTitle).toBe("姉川の戦い");
		expect(item.sourceUrl).toContain("https://ja.wikipedia.org/wiki/");
		expect(item.buzzScore).toBe(38054);
	});

	it("T5.4: 'A_B_C' はタイトルが 'A B C'、URL はアンダースコア維持", () => {
		const item = articleToCollectedItem({
			article: "A_B_C",
			views: 100,
			rank: 1,
		});
		expect(item.articleTitle).toBe("A B C");
		expect(item.sourceUrl).toBe("https://ja.wikipedia.org/wiki/A_B_C");
		expect(item.buzzScore).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// T6. WikipediaAdapter.collect() のテスト
// See: test_strategy.md §3.6
// ---------------------------------------------------------------------------

describe("WikipediaAdapter.collect()", () => {
	const SOURCE_URL =
		"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access";

	// 2026-04-14 12:00:00 UTC（2日前=04-12、3日前=04-11）
	const FIXED_NOW_UTC_MS = Date.UTC(2026, 3, 14, 12, 0, 0);

	/**
	 * モック fetchJsonFn を作るヘルパー。
	 * URL ごとに異なるレスポンスを返せる。
	 */
	function makeMockFetchJson(
		responses: Record<string, { ok: boolean; status: number; body: unknown }>,
	) {
		return vi.fn<FetchJsonFn>().mockImplementation(async (url: string) => {
			const resp = responses[url];
			if (!resp) {
				// デフォルトは 500
				return { ok: false, status: 500, body: null };
			}
			// body が null の場合の型合わせ
			return resp as {
				ok: boolean;
				status: number;
				body: never;
			};
		});
	}

	it("T6.1: 正常系 — Top6 を降順（API順）で返す", async () => {
		// See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: true, status: 200, body: fixture },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		const result = await adapter.collect({
			sourceUrl: SOURCE_URL,
			monthly: false,
		});

		expect(result).toHaveLength(6);
		// 各要素が CollectedItem 型のプロパティを持つ
		for (const item of result) {
			expect(item).toHaveProperty("articleTitle");
			expect(item).toHaveProperty("sourceUrl");
			expect(item).toHaveProperty("buzzScore");
			expect(item.sourceUrl.startsWith("https://ja.wikipedia.org/wiki/")).toBe(
				true,
			);
		}
		// buzzScore は降順（API 順 = rank 順）を保持
		for (let i = 0; i < result.length - 1; i++) {
			expect(result[i].buzzScore).toBeGreaterThanOrEqual(
				result[i + 1].buzzScore,
			);
		}
	});

	it("T6.2: メタページ除外 — 'メインページ' と '特別:検索' は結果に含まれない", async () => {
		// See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: true, status: 200, body: fixture },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		const result = await adapter.collect({
			sourceUrl: SOURCE_URL,
			monthly: false,
		});

		const titles = result.map((item) => item.articleTitle);
		expect(titles).not.toContain("メインページ");
		expect(titles).not.toContain("特別:検索");
		// 先頭は rank 2 の通常記事（田中敦子（声優））から始まる
		expect(titles[0]).toBe("田中敦子 (声優)");
	});

	it("T6.3: フォールバック — 2日前 404、3日前 200 → 3日前のデータを返す", async () => {
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const url3d = `${SOURCE_URL}/2026/04/11`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: false, status: 404, body: null },
			[url3d]: { ok: true, status: 200, body: fixture },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		const result = await adapter.collect({
			sourceUrl: SOURCE_URL,
			monthly: false,
		});

		expect(result).toHaveLength(6);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockFetch).toHaveBeenNthCalledWith(1, url2d);
		expect(mockFetch).toHaveBeenNthCalledWith(2, url3d);
	});

	it("T6.4: 両日 404 — 例外スロー", async () => {
		// See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const url3d = `${SOURCE_URL}/2026/04/11`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: false, status: 404, body: null },
			[url3d]: { ok: false, status: 404, body: null },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		await expect(
			adapter.collect({ sourceUrl: SOURCE_URL, monthly: false }),
		).rejects.toThrow(/2日前・3日前ともデータ未生成/);
	});

	it("T6.5: 429 エラー — リトライせず即例外", async () => {
		// See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: false, status: 429, body: null },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		await expect(
			adapter.collect({ sourceUrl: SOURCE_URL, monthly: false }),
		).rejects.toThrow(/Wikimedia API error.*429/);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("T6.6: 500 系エラー — 例外スロー", async () => {
		// See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: false, status: 503, body: null },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		await expect(
			adapter.collect({ sourceUrl: SOURCE_URL, monthly: false }),
		).rejects.toThrow(/Wikimedia API error.*503/);
	});

	it("T6.7: レスポンス構造異常 — items[] が空", async () => {
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: true, status: 200, body: { items: [] } },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		await expect(
			adapter.collect({ sourceUrl: SOURCE_URL, monthly: false }),
		).rejects.toThrow(/予期しないレスポンス構造/);
	});

	it("T6.8: レスポンス構造異常 — articles フィールドが無い", async () => {
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: {
				ok: true,
				status: 200,
				body: {
					items: [
						{
							project: "ja.wikipedia",
							access: "all-access",
							year: "2026",
							month: "04",
							day: "12",
						},
					],
				},
			},
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		await expect(
			adapter.collect({ sourceUrl: SOURCE_URL, monthly: false }),
		).rejects.toThrow(/予期しないレスポンス構造/);
	});

	it("T6.9: 6件未満 — フィルタ後5件なら5件返す（エラーにならない）", async () => {
		const url2d = `${SOURCE_URL}/2026/04/12`;
		// メタページ + 通常記事5件のみのフィクスチャ
		const smallFixture = {
			items: [
				{
					project: "ja.wikipedia",
					access: "all-access",
					year: "2026",
					month: "04",
					day: "12",
					articles: [
						{ article: "メインページ", views: 100, rank: 1 },
						{ article: "特別:検索", views: 90, rank: 2 },
						{ article: "Wikipedia:井戸端", views: 80, rank: 3 },
						{ article: "Category:歴史", views: 70, rank: 4 },
						{ article: "記事A", views: 60, rank: 5 },
						{ article: "記事B", views: 50, rank: 6 },
						{ article: "記事C", views: 40, rank: 7 },
						{ article: "記事D", views: 30, rank: 8 },
						{ article: "記事E", views: 20, rank: 9 },
					],
				},
			],
		};
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: true, status: 200, body: smallFixture },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		const result = await adapter.collect({
			sourceUrl: SOURCE_URL,
			monthly: false,
		});

		expect(result).toHaveLength(5);
		expect(result[0].articleTitle).toBe("記事A");
	});

	it("T6.10: nowUtcMs 注入 — 指定日で URL が組まれる", async () => {
		// 2026-04-14 12:00Z の2日前は 2026-04-12
		const url2d = `${SOURCE_URL}/2026/04/12`;
		const mockFetch = makeMockFetchJson({
			[url2d]: { ok: true, status: 200, body: fixture },
		});

		const adapter = new WikipediaAdapter(mockFetch, () => FIXED_NOW_UTC_MS);
		await adapter.collect({ sourceUrl: SOURCE_URL, monthly: false });

		// fetchJsonFn が "/2026/04/12" を含む URL で呼ばれた
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("/2026/04/12"),
		);
	});

	it("T6.11: コンストラクタに引数なしで呼べる（デフォルト注入）", async () => {
		// defaultFetchJson を実際に呼ぶと外部 API リクエストが発生するため、
		// ここではコンストラクタの引数省略が型エラーにならないことのみ確認
		const adapter = new WikipediaAdapter();
		expect(adapter).toBeInstanceOf(WikipediaAdapter);
	});
});
