/**
 * 単体テスト: pagination-parser（ページネーション範囲パーサー）
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.3 範囲パーサー（純粋関数）
 *
 * テスト方針:
 *   - 純粋関数のため外部依存なし。モック不要。
 *   - 全パースパターン（default / range / latest）を網羅する。
 *   - エッジケース（0, 負数, 範囲逆転, 文字列不正, 空文字, 大量数値等）を網羅する。
 *
 * カバレッジ対象:
 *   - parsePaginationRange: undefined / range形式 / latest形式 / 不正値のフォールバック
 */

import { describe, expect, it } from "vitest";
import {
	type PaginationRange,
	parsePaginationRange,
} from "../../../../lib/domain/rules/pagination-parser";

// ===========================================================================
// undefined 入力 → default
// ===========================================================================

describe("parsePaginationRange: undefined入力", () => {
	// See: features/thread.feature @pagination
	// See: design.md §2.3 - undefined → { type: 'default' }（最新50件）

	it("undefined を渡すと type='default' を返す", () => {
		const result = parsePaginationRange(undefined);
		expect(result).toEqual({ type: "default" });
	});

	it("引数を省略すると type='default' を返す", () => {
		const result = parsePaginationRange();
		expect(result).toEqual({ type: "default" });
	});
});

// ===========================================================================
// range 形式（"N-M"）
// ===========================================================================

describe("parsePaginationRange: range形式", () => {
	// See: features/thread.feature @pagination - /{boardId}/{threadKey}/1-100 にアクセスする
	// See: design.md §2.3 - "1-100" → { type: 'range', start: 1, end: 100 }

	it('"1-100" → { type: range, start: 1, end: 100 }', () => {
		const result = parsePaginationRange("1-100");
		expect(result).toEqual({ type: "range", start: 1, end: 100 });
	});

	it('"101-200" → { type: range, start: 101, end: 200 }', () => {
		const result = parsePaginationRange("101-200");
		expect(result).toEqual({ type: "range", start: 101, end: 200 });
	});

	it('"201-250" → { type: range, start: 201, end: 250 }', () => {
		const result = parsePaginationRange("201-250");
		expect(result).toEqual({ type: "range", start: 201, end: 250 });
	});

	it("start と end が同じ値でも有効な range を返す", () => {
		const result = parsePaginationRange("5-5");
		expect(result).toEqual({ type: "range", start: 5, end: 5 });
	});

	it("大きな番号の range を正しくパースする", () => {
		const result = parsePaginationRange("9999-10000");
		expect(result).toEqual({ type: "range", start: 9999, end: 10000 });
	});
});

// ===========================================================================
// latest 形式（"lN"）
// ===========================================================================

describe("parsePaginationRange: latest形式", () => {
	// See: features/thread.feature @pagination - /{boardId}/{threadKey}/l100 にアクセスする
	// See: design.md §2.3 - "l100" → { type: 'latest', count: 100 }

	it('"l100" → { type: latest, count: 100 }', () => {
		const result = parsePaginationRange("l100");
		expect(result).toEqual({ type: "latest", count: 100 });
	});

	it('"l50" → { type: latest, count: 50 }', () => {
		const result = parsePaginationRange("l50");
		expect(result).toEqual({ type: "latest", count: 50 });
	});

	it('"l1" → { type: latest, count: 1 }', () => {
		const result = parsePaginationRange("l1");
		expect(result).toEqual({ type: "latest", count: 1 });
	});

	it('"l1000" → { type: latest, count: 1000 }', () => {
		const result = parsePaginationRange("l1000");
		expect(result).toEqual({ type: "latest", count: 1000 });
	});

	it('大文字の "L100" はフォールバックになる（小文字のみ有効）', () => {
		const result = parsePaginationRange("L100");
		expect(result).toEqual({ type: "default" });
	});
});

// ===========================================================================
// エッジケース: 不正な値 → default フォールバック
// ===========================================================================

describe("parsePaginationRange: 不正値のフォールバック", () => {
	// See: design.md §2.3 - 不正な値 → { type: 'default' } にフォールバック

	it("空文字列はフォールバックになる", () => {
		const result = parsePaginationRange("");
		expect(result).toEqual({ type: "default" });
	});

	it("数字だけはフォールバックになる（range形式でない）", () => {
		const result = parsePaginationRange("100");
		expect(result).toEqual({ type: "default" });
	});

	it("ランダムな文字列はフォールバックになる", () => {
		const result = parsePaginationRange("abc");
		expect(result).toEqual({ type: "default" });
	});

	it("ハイフンだけはフォールバックになる", () => {
		const result = parsePaginationRange("-");
		expect(result).toEqual({ type: "default" });
	});

	it('"l" だけ（数値なし）はフォールバックになる', () => {
		const result = parsePaginationRange("l");
		expect(result).toEqual({ type: "default" });
	});

	it('"l0" （最新0件）はフォールバックになる', () => {
		// count=0 は意味がない
		const result = parsePaginationRange("l0");
		expect(result).toEqual({ type: "default" });
	});

	it("範囲逆転（start > end）はフォールバックになる", () => {
		const result = parsePaginationRange("100-1");
		expect(result).toEqual({ type: "default" });
	});

	it("start が 0 の range はフォールバックになる", () => {
		// レス番号は1始まり
		const result = parsePaginationRange("0-100");
		expect(result).toEqual({ type: "default" });
	});

	it("start が負数の range はフォールバックになる", () => {
		const result = parsePaginationRange("-1-100");
		expect(result).toEqual({ type: "default" });
	});

	it("end が 0 の range はフォールバックになる", () => {
		const result = parsePaginationRange("1-0");
		expect(result).toEqual({ type: "default" });
	});

	it("小数点を含む range はフォールバックになる", () => {
		const result = parsePaginationRange("1.5-100");
		expect(result).toEqual({ type: "default" });
	});

	it("スペースを含む文字列はフォールバックになる", () => {
		const result = parsePaginationRange("1 - 100");
		expect(result).toEqual({ type: "default" });
	});

	it("複数ハイフンはフォールバックになる", () => {
		const result = parsePaginationRange("1-2-3");
		expect(result).toEqual({ type: "default" });
	});

	it("l に文字列が続く場合はフォールバックになる", () => {
		const result = parsePaginationRange("labc");
		expect(result).toEqual({ type: "default" });
	});

	it("l の後に負数はフォールバックになる", () => {
		const result = parsePaginationRange("l-10");
		expect(result).toEqual({ type: "default" });
	});

	it("特殊文字はフォールバックになる", () => {
		const result = parsePaginationRange("1-100; DROP TABLE posts;");
		expect(result).toEqual({ type: "default" });
	});

	it("Unicode文字はフォールバックになる", () => {
		const result = parsePaginationRange("１−１００");
		expect(result).toEqual({ type: "default" });
	});
});

// ===========================================================================
// 返り値の型整合性
// ===========================================================================

describe("parsePaginationRange: 返り値の型整合性", () => {
	it("default型には start / end / count が含まれない", () => {
		const result: PaginationRange = parsePaginationRange(undefined);
		expect(result.type).toBe("default");
		expect(result.start).toBeUndefined();
		expect(result.end).toBeUndefined();
		expect(result.count).toBeUndefined();
	});

	it("range型には start と end が含まれ count は含まれない", () => {
		const result: PaginationRange = parsePaginationRange("1-100");
		expect(result.type).toBe("range");
		expect(result.start).toBe(1);
		expect(result.end).toBe(100);
		expect(result.count).toBeUndefined();
	});

	it("latest型には count が含まれ start / end は含まれない", () => {
		const result: PaginationRange = parsePaginationRange("l100");
		expect(result.type).toBe("latest");
		expect(result.count).toBe(100);
		expect(result.start).toBeUndefined();
		expect(result.end).toBeUndefined();
	});
});
