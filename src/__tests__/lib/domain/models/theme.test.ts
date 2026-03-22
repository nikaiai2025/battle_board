/**
 * テーマカタログ定数 単体テスト
 * See: features/theme.feature
 * See: src/lib/domain/models/theme.ts
 */

import { describe, expect, it } from "vitest";
import {
	FONT_CATALOG,
	findFont,
	findTheme,
	getDefaultFont,
	getDefaultTheme,
	THEME_CATALOG,
} from "../../../../lib/domain/models/theme";

describe("THEME_CATALOG", () => {
	it("default と dark が含まれる", () => {
		const ids = THEME_CATALOG.map((t) => t.id);
		expect(ids).toContain("default");
		expect(ids).toContain("dark");
	});

	it("default の cssClass は空文字", () => {
		const defaultTheme = THEME_CATALOG.find((t) => t.id === "default");
		expect(defaultTheme?.cssClass).toBe("");
	});

	it("dark の cssClass は 'dark'", () => {
		const darkTheme = THEME_CATALOG.find((t) => t.id === "dark");
		expect(darkTheme?.cssClass).toBe("dark");
	});

	it("default と dark は無料", () => {
		expect(THEME_CATALOG.find((t) => t.id === "default")?.isFree).toBe(true);
		expect(THEME_CATALOG.find((t) => t.id === "dark")?.isFree).toBe(true);
	});
});

describe("FONT_CATALOG", () => {
	it("gothic が含まれる", () => {
		const ids = FONT_CATALOG.map((f) => f.id);
		expect(ids).toContain("gothic");
	});

	it("gothic は無料", () => {
		expect(FONT_CATALOG.find((f) => f.id === "gothic")?.isFree).toBe(true);
	});
});

describe("findTheme", () => {
	it("dark を正しく返す", () => {
		const entry = findTheme("dark");
		expect(entry).not.toBeNull();
		expect(entry?.id).toBe("dark");
		expect(entry?.name).toBe("ダーク");
	});

	it("存在しないIDは null を返す", () => {
		expect(findTheme("nonexistent")).toBeNull();
	});
});

describe("findFont", () => {
	it("gothic を正しく返す", () => {
		const entry = findFont("gothic");
		expect(entry).not.toBeNull();
		expect(entry?.id).toBe("gothic");
	});

	it("存在しないIDは null を返す", () => {
		expect(findFont("nonexistent")).toBeNull();
	});
});

describe("getDefaultTheme", () => {
	it("default を返す", () => {
		expect(getDefaultTheme().id).toBe("default");
	});
});

describe("getDefaultFont", () => {
	it("gothic を返す", () => {
		expect(getDefaultFont().id).toBe("gothic");
	});
});
