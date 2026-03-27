/**
 * getJstDateString の単体テスト
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5 日付境界はJST 0:00
 */
import { describe, expect, it } from "vitest";
import { getJstDateString } from "../../../../lib/domain/rules/jst-date";

describe("getJstDateString", () => {
	it("UTC 2025-01-01 15:00:00 はJST 2025-01-02 になる", () => {
		// UTC 15:00 + 9h = JST 翌日 00:00
		const utcDate = new Date("2025-01-01T15:00:00.000Z");
		expect(getJstDateString(utcDate)).toBe("2025-01-02");
	});

	it("UTC 2025-01-01 14:59:59 はJST 2025-01-01 になる", () => {
		// UTC 14:59 + 9h = JST 23:59（まだ同日）
		const utcDate = new Date("2025-01-01T14:59:59.999Z");
		expect(getJstDateString(utcDate)).toBe("2025-01-01");
	});

	it("UTC 2025-01-01 00:00:00 はJST 2025-01-01 09:00:00 = YYYY-MM-DD 2025-01-01", () => {
		const utcDate = new Date("2025-01-01T00:00:00.000Z");
		expect(getJstDateString(utcDate)).toBe("2025-01-01");
	});

	it("UTC 2024-12-31 15:00:00 はJST 2025-01-01 になる（年またぎ）", () => {
		const utcDate = new Date("2024-12-31T15:00:00.000Z");
		expect(getJstDateString(utcDate)).toBe("2025-01-01");
	});

	it("JST 0:00 ちょうど（UTC 前日 15:00）でも翌日の日付を返す", () => {
		// UTC 2025-06-15 15:00:00 = JST 2025-06-16 00:00:00
		const utcDate = new Date("2025-06-15T15:00:00.000Z");
		expect(getJstDateString(utcDate)).toBe("2025-06-16");
	});

	it("返り値の形式は YYYY-MM-DD の10文字", () => {
		const date = new Date("2025-03-28T10:00:00.000Z");
		const result = getJstDateString(date);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result.length).toBe(10);
	});
});
