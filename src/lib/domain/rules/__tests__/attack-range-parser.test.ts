/**
 * 単体テスト: attack-range-parser（攻撃範囲パーサー）
 *
 * See: features/bot_system.feature @複数ターゲット攻撃
 * See: src/lib/domain/rules/attack-range-parser.ts
 */

import { describe, expect, it } from "vitest";
import {
	isRangeFormat,
	MAX_ATTACK_TARGETS,
	parseAttackRange,
} from "../attack-range-parser";

describe("parseAttackRange", () => {
	// =========================================================================
	// 正常系: 範囲指定
	// =========================================================================

	it(">>10-13 を [10, 11, 12, 13] にパースする", () => {
		const result = parseAttackRange(">>10-13");
		expect(result).toEqual({
			success: true,
			postNumbers: [10, 11, 12, 13],
		});
	});

	it(">>5-5 を [5] にパースする（範囲1件）", () => {
		const result = parseAttackRange(">>5-5");
		expect(result).toEqual({
			success: true,
			postNumbers: [5],
		});
	});

	it(">>1-10 を 10件にパースする（上限ちょうど）", () => {
		const result = parseAttackRange(">>1-10");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.postNumbers).toHaveLength(10);
			expect(result.postNumbers[0]).toBe(1);
			expect(result.postNumbers[9]).toBe(10);
		}
	});

	// =========================================================================
	// エラー系
	// =========================================================================

	it("開始 > 終了 でエラーになる", () => {
		const result = parseAttackRange(">>13-10");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("範囲指定が不正");
		}
	});

	it("上限超過でエラーになる", () => {
		const result = parseAttackRange(">>1-20");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain(`最大${MAX_ATTACK_TARGETS}`);
		}
	});

	it("不正な形式でエラーになる", () => {
		expect(parseAttackRange("10-13").success).toBe(false);
		expect(parseAttackRange(">>abc").success).toBe(false);
		expect(parseAttackRange("").success).toBe(false);
		expect(parseAttackRange(">>10-").success).toBe(false);
		expect(parseAttackRange(">>-13").success).toBe(false);
	});

	it("単一ターゲット >>N 形式はマッチしない", () => {
		// >>N は CommandService の PostNumberResolver が解決するため、
		// このパーサーは >>N-M 形式のみ受け付ける
		const result = parseAttackRange(">>5");
		expect(result.success).toBe(false);
	});
});

describe("isRangeFormat", () => {
	it(">>N-M を true と判定する", () => {
		expect(isRangeFormat(">>10-13")).toBe(true);
		expect(isRangeFormat(">>1-1")).toBe(true);
	});

	it(">>N を false と判定する", () => {
		expect(isRangeFormat(">>5")).toBe(false);
	});

	it("UUID を false と判定する", () => {
		expect(isRangeFormat("abc-123-def")).toBe(false);
	});
});
