/**
 * テーマ解決ルール 単体テスト
 * See: features/theme.feature
 * See: src/lib/domain/rules/theme-rules.ts
 */

import { describe, expect, it } from "vitest";
import {
	resolveFont,
	resolveTheme,
	validateThemeSelection,
} from "../../../../lib/domain/rules/theme-rules";

// ---------------------------------------------------------------------------
// resolveTheme
// ---------------------------------------------------------------------------

describe("resolveTheme", () => {
	it("null はデフォルトにフォールバック", () => {
		const result = resolveTheme(null, false);
		expect(result.id).toBe("default");
	});

	it("無料テーマ(dark)は無料ユーザーでも適用可", () => {
		const result = resolveTheme("dark", false);
		expect(result.id).toBe("dark");
		expect(result.cssClass).toBe("dark");
	});

	it("有料テーマ(ocean)は有料ユーザーなら適用可", () => {
		const result = resolveTheme("ocean", true);
		expect(result.id).toBe("ocean");
	});

	it("有料テーマ(ocean)は無料ユーザーでフォールバック", () => {
		const result = resolveTheme("ocean", false);
		expect(result.id).toBe("default");
	});

	it("不正IDはフォールバック", () => {
		const result = resolveTheme("nonexistent", false);
		expect(result.id).toBe("default");
	});

	it("空文字はデフォルトにフォールバック", () => {
		const result = resolveTheme("", false);
		expect(result.id).toBe("default");
	});
});

// ---------------------------------------------------------------------------
// resolveFont
// ---------------------------------------------------------------------------

describe("resolveFont", () => {
	it("null はデフォルト(gothic)にフォールバック", () => {
		const result = resolveFont(null, false);
		expect(result.id).toBe("gothic");
	});

	it("無料フォント(gothic)は無料ユーザーでも適用可", () => {
		const result = resolveFont("gothic", false);
		expect(result.id).toBe("gothic");
	});

	it("有料フォント(mincho)は有料ユーザーなら適用可", () => {
		const result = resolveFont("mincho", true);
		expect(result.id).toBe("mincho");
	});

	it("有料フォント(mincho)は無料ユーザーでフォールバック", () => {
		const result = resolveFont("mincho", false);
		expect(result.id).toBe("gothic");
	});

	it("不正IDはフォールバック", () => {
		const result = resolveFont("nonexistent", false);
		expect(result.id).toBe("gothic");
	});

	it("空文字はデフォルトにフォールバック", () => {
		const result = resolveFont("", false);
		expect(result.id).toBe("gothic");
	});
});

// ---------------------------------------------------------------------------
// validateThemeSelection
// ---------------------------------------------------------------------------

describe("validateThemeSelection", () => {
	it("無料の組み合わせは valid", () => {
		const result = validateThemeSelection("dark", "gothic", false);
		expect(result.valid).toBe(true);
	});

	it("有料テーマ + 無料ユーザー は PREMIUM_REQUIRED", () => {
		const result = validateThemeSelection("ocean", "gothic", false);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.code).toBe("PREMIUM_REQUIRED");
		}
	});

	it("有料フォント + 無料ユーザー は PREMIUM_REQUIRED", () => {
		const result = validateThemeSelection("default", "mincho", false);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.code).toBe("PREMIUM_REQUIRED");
		}
	});

	it("不正テーマID は INVALID_THEME", () => {
		const result = validateThemeSelection("xxx", "gothic", false);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.code).toBe("INVALID_THEME");
		}
	});

	it("不正フォントID は INVALID_FONT", () => {
		const result = validateThemeSelection("dark", "yyy", false);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.code).toBe("INVALID_FONT");
		}
	});

	it("有料テーマ + 有料ユーザー は valid", () => {
		const result = validateThemeSelection("ocean", "mincho", true);
		expect(result.valid).toBe(true);
	});

	it("default + gothic は常に valid", () => {
		const result = validateThemeSelection("default", "gothic", false);
		expect(result.valid).toBe(true);
	});
});
