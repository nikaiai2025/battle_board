/**
 * subject-txt.test.ts — SubjectTxtAdapter 単体テスト
 *
 * テスト対象:
 *   - parseSubjectTxt(): subject.txt のパース処理
 *   - calculateBuzzScore(): バズスコア算出
 *   - extractFirstPostBody(): DAT >>1 本文抽出
 *   - SubjectTxtAdapter.collect(): モック fetchTextFn を注入したテスト
 *
 * NOTE: SubjectTxtAdapter は本番環境で Shift_JIS デコードを行うが、テスト環境では
 *       fetchTextFn コンストラクタ引数で UTF-8 文字列を直接返すモックを注入する。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @投稿内容の取得に失敗した場合は元ネタURLのみ保存する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 */

import { describe, expect, it, vi } from "vitest";
import {
	calculateBuzzScore,
	extractFirstPostBody,
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
// extractFirstPostBody のテスト
// ---------------------------------------------------------------------------

describe("extractFirstPostBody", () => {
	// See: docs/architecture/components/bot.md §2.13.5 DAT >>1 本文抽出

	it("正常な DAT 1行目から本文を抽出する", () => {
		const datLine =
			"名無しさん<>sage<>2024/01/01(月) 12:00:00.00 ID:test<>これが本文です<>スレタイ";
		expect(extractFirstPostBody(datLine)).toBe("これが本文です");
	});

	it("HTML タグを除去する", () => {
		const datLine = "名前<><>日付<><b>太字テキスト</b>と<br>改行<>";
		expect(extractFirstPostBody(datLine)).toBe("太字テキストと改行");
	});

	it("本文が空文字の場合は null を返す", () => {
		const datLine = "名前<>メール<>日付<><>スレタイ";
		expect(extractFirstPostBody(datLine)).toBeNull();
	});

	it("フィールド数が4未満の場合は null を返す", () => {
		const datLine = "名前<>メール<>日付";
		expect(extractFirstPostBody(datLine)).toBeNull();
	});

	it("空文字列の場合は null を返す", () => {
		expect(extractFirstPostBody("")).toBeNull();
	});

	it("本文の前後の空白をtrimする", () => {
		const datLine = "名前<><>日付<>  前後スペース  <>";
		expect(extractFirstPostBody(datLine)).toBe("前後スペース");
	});

	it("HTML タグのみの場合は null を返す", () => {
		const datLine = "名前<><>日付<><br><br><>";
		expect(extractFirstPostBody(datLine)).toBeNull();
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
	 * subject.txt リクエストには subjectTxtContent を、DAT リクエストには datContent を返す。
	 *
	 * @param subjectTxtContent - subject.txt の内容（UTF-8 文字列）
	 * @param datContent - DAT ファイルの内容（UTF-8 文字列）。省略時は標準テスト用文字列
	 * @param datShouldFail - true の場合 DAT リクエストで例外をスロー
	 */
	function createMockFetchText(
		subjectTxtContent: string,
		datContent?: string,
		datShouldFail?: boolean,
	) {
		return vi.fn().mockImplementation((url: string) => {
			if (url.endsWith("subject.txt")) {
				return Promise.resolve(subjectTxtContent);
			}
			// DAT リクエスト
			if (datShouldFail) {
				return Promise.reject(new Error(`fetch failed: ${url} (404)`));
			}
			return Promise.resolve(
				datContent ?? "名前<><>日付<>テスト本文<>スレタイ",
			);
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

	it("DAT 取得に失敗した場合は content = null で返す", async () => {
		// See: features/curation_bot.feature @投稿内容の取得に失敗した場合は元ネタURLのみ保存する
		const now = Math.floor(Date.now() / 1000);
		const subjectTxt = `${now - 100}.dat<>スレA (100)`;

		const adapter = new SubjectTxtAdapter(
			createMockFetchText(subjectTxt, undefined, true /* datShouldFail */),
		);
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result).toHaveLength(1);
		expect(result[0].content).toBeNull();
		expect(result[0].sourceUrl).toBeTruthy();
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
			`https://test.5ch.io/board/${threadNumber}`,
		);
		expect(typeof result[0].buzzScore).toBe("number");
		expect(result[0].buzzScore).toBeGreaterThan(0);
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

	it("DAT 本文に HTML タグが含まれる場合は除去される", async () => {
		const now = Math.floor(Date.now() / 1000);
		const subjectTxt = `${now - 100}.dat<>スレタイ (10)`;
		const datContent =
			"名無し<><>日付<><b>太字テキスト</b>と普通テキスト<>スレタイ";

		const adapter = new SubjectTxtAdapter(
			createMockFetchText(subjectTxt, datContent),
		);
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result[0].content).toBe("太字テキストと普通テキスト");
	});

	it("1件の DAT 失敗が他のアイテムに影響しない", async () => {
		const now = Math.floor(Date.now() / 1000);
		const subjectTxt = [
			`${now - 100}.dat<>スレA (200)`,
			`${now - 200}.dat<>スレB (150)`,
		].join("\n");

		let datCallCount = 0;
		const mockFetchText = vi.fn().mockImplementation((url: string) => {
			if (url.endsWith("subject.txt")) {
				return Promise.resolve(subjectTxt);
			}
			// DAT リクエスト: 最初の1件は失敗、2件目は成功
			datCallCount++;
			if (datCallCount === 1) {
				return Promise.reject(new Error(`fetch failed: ${url} (404)`));
			}
			return Promise.resolve("名前<><>日付<>成功した本文<>");
		});

		const adapter = new SubjectTxtAdapter(mockFetchText);
		const result = await adapter.collect({
			sourceUrl: "https://example.5ch.io/test/subject.txt",
			monthly: false,
		});

		expect(result).toHaveLength(2);
		// 1件は null、もう1件は正常に取得
		const nullItems = result.filter((r) => r.content === null);
		const contentItems = result.filter((r) => r.content !== null);
		expect(nullItems).toHaveLength(1);
		expect(contentItems).toHaveLength(1);
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
