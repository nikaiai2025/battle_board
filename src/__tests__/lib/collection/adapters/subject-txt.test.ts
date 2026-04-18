/**
 * subject-txt.test.ts — SubjectTxtAdapter 単体テスト
 *
 * テスト対象:
 *   - parseSubjectTxt(): subject.txt のパース処理
 *   - calculateBuzzScore(): バズスコア算出
 *   - SubjectTxtAdapter.collect(): モック fetchTextFn を注入したテスト
 *
 * NOTE: SubjectTxtAdapter は本番環境で Shift_JIS デコードを行うが、テスト環境では
 *       fetchTextFn コンストラクタ引数で UTF-8 文字列を直接返すモックを注入する。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 */

import { describe, expect, it, vi } from "vitest";
import {
	calculateBuzzScore,
	parseSubjectTxt,
	SubjectTxtAdapter,
} from "../../../../lib/collection/adapters/subject-txt";

// ---------------------------------------------------------------------------
// parseSubjectTxt のテスト
// ---------------------------------------------------------------------------

describe("parseSubjectTxt", () => {
	// See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する

	it("正常な1行をパースしてエントリを返す", () => {
		const text = "1711612345.dat<>【速報】テスト記事 (150)";
		const result = parseSubjectTxt(text);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			threadNumber: "1711612345",
			title: "【速報】テスト記事",
			resCount: 150,
			createdUnixTime: 1711612345,
		});
	});

	it("複数行をすべてパースする", () => {
		const text = [
			"1711612345.dat<>スレタイA (100)",
			"1711699999.dat<>スレタイB (200)",
		].join("\n");

		const result = parseSubjectTxt(text);
		expect(result).toHaveLength(2);
		expect(result[0].title).toBe("スレタイA");
		expect(result[1].title).toBe("スレタイB");
	});

	it("空行をスキップする", () => {
		const text = "1711612345.dat<>スレタイ (50)\n\n  \n";
		const result = parseSubjectTxt(text);
		expect(result).toHaveLength(1);
	});

	it("空文字列の場合は空配列を返す", () => {
		expect(parseSubjectTxt("")).toHaveLength(0);
	});

	it("フォーマット不正な行をスキップする（エラーにしない）", () => {
		const text = [
			"1711612345.dat<>正常行 (100)",
			"invalid line without dat format",
			"1711699999.dat<>別の正常行 (200)",
			"",
		].join("\n");

		const result = parseSubjectTxt(text);
		expect(result).toHaveLength(2);
		expect(result[0].title).toBe("正常行");
		expect(result[1].title).toBe("別の正常行");
	});

	it("スレタイの前後の空白をtrimする", () => {
		const text = "1711612345.dat<>  スペースあり  (10)";
		const result = parseSubjectTxt(text);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("スペースあり");
	});

	it("スレタイに特殊文字・絵文字が含まれる場合もパースする", () => {
		const text = "1711612345.dat<>【😀速報】テスト'記事\"& (99)";
		const result = parseSubjectTxt(text);
		expect(result).toHaveLength(1);
		expect(result[0].resCount).toBe(99);
	});

	it("レス数0のスレッドをパースする（境界値）", () => {
		const text = "1711612345.dat<>新規スレ (0)";
		const result = parseSubjectTxt(text);
		expect(result[0].resCount).toBe(0);
	});

	it("大量行（1000行）を正常にパースする（パフォーマンス）", () => {
		const lines = Array.from(
			{ length: 1000 },
			(_, i) => `${1711612345 + i}.dat<>スレタイ${i} (${i + 1})`,
		).join("\n");

		const result = parseSubjectTxt(lines);
		expect(result).toHaveLength(1000);
	});
});

// ---------------------------------------------------------------------------
// calculateBuzzScore のテスト
// ---------------------------------------------------------------------------

describe("calculateBuzzScore", () => {
	// See: features/curation_bot.feature ヘッダコメント（バズスコア算出式）

	it("レス数100、経過2時間のスコアを正しく計算する", () => {
		// buzzScore = 100 / (2 + 2)^1.5 = 100 / 8 = 12.5
		const now = Date.now();
		const created = now / 1000 - 2 * 3600; // 2時間前
		const score = calculateBuzzScore(100, created, now);
		expect(score).toBeCloseTo(12.5, 1);
	});

	it("経過0時間でもゼロ除算にならない（+2によるゼロ除算防止）", () => {
		const now = Date.now();
		const created = now / 1000; // 今（経過0時間）
		const score = calculateBuzzScore(100, created, now);
		// buzzScore = 100 / (0 + 2)^1.5 = 100 / 2.828... ≈ 35.36
		expect(score).toBeGreaterThan(0);
		expect(Number.isFinite(score)).toBe(true);
	});

	it("レス数0の場合はスコア0（境界値）", () => {
		const now = Date.now();
		const created = now / 1000 - 3600;
		expect(calculateBuzzScore(0, created, now)).toBe(0);
	});

	it("古いスレッドほどスコアが低い", () => {
		const now = Date.now();
		const newThread = now / 1000 - 1 * 3600; // 1時間前
		const oldThread = now / 1000 - 24 * 3600; // 24時間前

		const newScore = calculateBuzzScore(100, newThread, now);
		const oldScore = calculateBuzzScore(100, oldThread, now);

		expect(newScore).toBeGreaterThan(oldScore);
	});

	it("レス数が多いほどスコアが高い（同経過時間）", () => {
		const now = Date.now();
		const created = now / 1000 - 2 * 3600;

		const lowScore = calculateBuzzScore(50, created, now);
		const highScore = calculateBuzzScore(200, created, now);

		expect(highScore).toBeGreaterThan(lowScore);
	});
});

// ---------------------------------------------------------------------------
// SubjectTxtAdapter.collect() のテスト
// テスト環境では fetchTextFn コンストラクタ引数で UTF-8 文字列を直接返すモックを注入する。
// Shift_JIS デコードは本番環境（GitHub Actions）でのみ動作する機能のため、
// テストでは文字コード変換をバイパスする。
// ---------------------------------------------------------------------------

describe("SubjectTxtAdapter.collect()", () => {
	// See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
	// See: features/curation_bot.feature @ソースごとの蓄積上限は6件である

	/**
	 * テスト用の fetchTextFn モックを作成するヘルパー。
	 * subject.txt のテキストを直接返す。v3 ではDATアクセスを行わないため、
	 * subject.txt リクエストのみに対応する。
	 *
	 * @param subjectTxtContent - subject.txt の内容（UTF-8 文字列）
	 */
	function createMockFetchText(subjectTxtContent: string) {
		return vi.fn().mockImplementation((_url: string) => {
			return Promise.resolve(subjectTxtContent);
		});
	}

	it("subject.txt をパースしてバズスコア降順で返す", async () => {
		const now = Math.floor(Date.now() / 1000);
		const subjectTxt = [
			`${now - 100}.dat<>スレA (200)`,
			`${now - 200}.dat<>スレB (100)`,
			`${now - 300}.dat<>スレC (150)`,
		].join("\n");

		const adapter = new SubjectTxtAdapter(createMockFetchText(subjectTxt));
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result).toHaveLength(3);
		// buzzScore 降順であることを確認（ソート済み）
		expect(result[0].buzzScore).toBeGreaterThanOrEqual(result[1].buzzScore);
		expect(result[1].buzzScore).toBeGreaterThanOrEqual(result[2].buzzScore);
	});

	it("アイテムが6件を超える場合は上位6件のみ返す", async () => {
		// See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
		const now = Math.floor(Date.now() / 1000);
		const lines = Array.from(
			{ length: 10 },
			(_, i) => `${now - (i + 1) * 100}.dat<>スレ${i} (${(10 - i) * 100})`,
		).join("\n");

		const adapter = new SubjectTxtAdapter(createMockFetchText(lines));
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result).toHaveLength(6);
	});

	it("sourceUrl に articleTitle・sourceUrl・buzzScore が含まれる", async () => {
		const now = Math.floor(Date.now() / 1000);
		const threadNumber = `${now - 3600}`;
		const subjectTxt = `${threadNumber}.dat<>テスト記事タイトル (50)`;

		const adapter = new SubjectTxtAdapter(createMockFetchText(subjectTxt));
		const result = await adapter.collect({
			sourceUrl: "https://test.5ch.io/board/subject.txt",
			monthly: false,
		});

		expect(result[0].articleTitle).toBe("テスト記事タイトル");
		expect(result[0].sourceUrl).toBe(
			`https://test.5ch.io/test/read.cgi/board/${threadNumber}`,
		);
		expect(typeof result[0].buzzScore).toBe("number");
		expect(result[0].buzzScore).toBeGreaterThan(0);
	});

	it("5ch系 subject.txt からスレッドURLを /test/read.cgi/ 形式で構築する", async () => {
		const now = Math.floor(Date.now() / 1000);
		const threadNumber = `${now - 7200}`;
		const subjectTxt = `${threadNumber}.dat<>ニュース速報スレ (80)`;

		const adapter = new SubjectTxtAdapter(createMockFetchText(subjectTxt));
		const result = await adapter.collect({
			sourceUrl: "https://asahi.5ch.io/newsplus/subject.txt",
			monthly: false,
		});

		expect(result[0].sourceUrl).toBe(
			`https://asahi.5ch.io/test/read.cgi/newsplus/${threadNumber}`,
		);
	});

	it("subject.txt が空の場合は空配列を返す", async () => {
		const adapter = new SubjectTxtAdapter(createMockFetchText(""));
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result).toHaveLength(0);
	});

	it("subject.txt のフェッチが失敗した場合は例外をスロー", async () => {
		const failingFetch = vi
			.fn()
			.mockRejectedValue(
				new Error(
					"fetch failed: https://example.5ch.io/test/subject.txt (500)",
				),
			);

		const adapter = new SubjectTxtAdapter(failingFetch);
		await expect(
			adapter.collect({
				sourceUrl: "https://example.5ch.io/test/subject.txt",
				monthly: false,
			}),
		).rejects.toThrow("fetch failed");
	});

	it("fetchText は subject.txt のみ呼ばれる（DATアクセスなし）", async () => {
		const now = Math.floor(Date.now() / 1000);
		const subjectTxt = [
			`${now - 100}.dat<>スレA (200)`,
			`${now - 200}.dat<>スレB (150)`,
		].join("\n");

		const mockFetchText = createMockFetchText(subjectTxt);
		const adapter = new SubjectTxtAdapter(mockFetchText);
		await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		// subject.txt の1回だけ呼ばれること（DAT アクセスなし）
		expect(mockFetchText).toHaveBeenCalledTimes(1);
		expect(mockFetchText).toHaveBeenCalledWith(
			"https://example.5ch.io/test/subject.txt",
		);
	});

	it("スレタイに日本語・特殊文字が含まれる場合も正常動作する", async () => {
		const now = Math.floor(Date.now() / 1000);
		const subjectTxt = `${now - 100}.dat<>【緊急】日本語タイトル！？★ (42)`;

		const adapter = new SubjectTxtAdapter(createMockFetchText(subjectTxt));
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result[0].articleTitle).toBe("【緊急】日本語タイトル！？★");
	});
});
