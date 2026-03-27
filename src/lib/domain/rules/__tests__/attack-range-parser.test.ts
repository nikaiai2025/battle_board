/**
 * 単体テスト: attack-range-parser（攻撃ターゲットパーサー）
 *
 * See: features/bot_system.feature @複数ターゲット攻撃
 * See: src/lib/domain/rules/attack-range-parser.ts
 */

import { describe, expect, it } from "vitest";
import {
	isMultiTargetFormat,
	MAX_ATTACK_TARGETS,
	parseAttackRange,
} from "../attack-range-parser";

describe("parseAttackRange", () => {
	// =========================================================================
	// 正常系: 連続範囲（>>N-M）
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
	// 正常系: カンマ区切り（>>N,M）
	// =========================================================================

	it(">>4,6 を [4, 6] にパースする", () => {
		const result = parseAttackRange(">>4,6");
		expect(result).toEqual({
			success: true,
			postNumbers: [4, 6],
		});
	});

	it(">>1,3,5,7 を [1, 3, 5, 7] にパースする", () => {
		const result = parseAttackRange(">>1,3,5,7");
		expect(result).toEqual({
			success: true,
			postNumbers: [1, 3, 5, 7],
		});
	});

	it(">>6,4 を昇順ソートして [4, 6] にする", () => {
		const result = parseAttackRange(">>6,4");
		expect(result).toEqual({
			success: true,
			postNumbers: [4, 6],
		});
	});

	// =========================================================================
	// 正常系: 混合（>>N,M-O,P）
	// =========================================================================

	it(">>4,6,10-13 を [4, 6, 10, 11, 12, 13] にパースする", () => {
		const result = parseAttackRange(">>4,6,10-13");
		expect(result).toEqual({
			success: true,
			postNumbers: [4, 6, 10, 11, 12, 13],
		});
	});

	it(">>1-3,7,9-10 を [1, 2, 3, 7, 9, 10] にパースする", () => {
		const result = parseAttackRange(">>1-3,7,9-10");
		expect(result).toEqual({
			success: true,
			postNumbers: [1, 2, 3, 7, 9, 10],
		});
	});

	// =========================================================================
	// 正常系: 重複除去
	// =========================================================================

	it(">>4,4 の重複を除去して [4] にする", () => {
		const result = parseAttackRange(">>4,4");
		expect(result).toEqual({
			success: true,
			postNumbers: [4],
		});
	});

	it(">>3-6,4 の重複を除去して [3, 4, 5, 6] にする", () => {
		const result = parseAttackRange(">>3-6,4");
		expect(result).toEqual({
			success: true,
			postNumbers: [3, 4, 5, 6],
		});
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

	it("混合形式内の範囲でも開始 > 終了 でエラーになる", () => {
		const result = parseAttackRange(">>4,13-10");
		expect(result.success).toBe(false);
	});

	it("上限超過でエラーになる", () => {
		const result = parseAttackRange(">>1-20");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain(`最大${MAX_ATTACK_TARGETS}`);
		}
	});

	it("カンマ区切りでも上限超過でエラーになる", () => {
		const result = parseAttackRange(">>1,2,3,4,5,6,7,8,9,10,11");
		expect(result.success).toBe(false);
	});

	it("不正な形式でエラーになる", () => {
		expect(parseAttackRange("10-13").success).toBe(false);
		expect(parseAttackRange(">>abc").success).toBe(false);
		expect(parseAttackRange("").success).toBe(false);
		expect(parseAttackRange(">>10-").success).toBe(false);
		expect(parseAttackRange(">>-13").success).toBe(false);
		expect(parseAttackRange(">>4,").success).toBe(false);
		expect(parseAttackRange(">>,4").success).toBe(false);
	});

	it("単一ターゲット >>N 形式はマッチしない", () => {
		// >>N は CommandService の PostNumberResolver が解決するため、
		// このパーサーの対象外
		const result = parseAttackRange(">>5");
		expect(result.success).toBe(false);
	});
});

describe("isMultiTargetFormat", () => {
	it(">>N-M を true と判定する", () => {
		expect(isMultiTargetFormat(">>10-13")).toBe(true);
		expect(isMultiTargetFormat(">>1-1")).toBe(true);
	});

	it(">>N,M を true と判定する", () => {
		expect(isMultiTargetFormat(">>4,6")).toBe(true);
		expect(isMultiTargetFormat(">>1,3,5")).toBe(true);
	});

	it(">>N,M-O を true と判定する", () => {
		expect(isMultiTargetFormat(">>4,6,10-13")).toBe(true);
	});

	it(">>N（単一ターゲット）を false と判定する", () => {
		expect(isMultiTargetFormat(">>5")).toBe(false);
	});

	it("UUID を false と判定する", () => {
		expect(isMultiTargetFormat("abc-123-def")).toBe(false);
	});
});
