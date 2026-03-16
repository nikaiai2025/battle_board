/**
 * 単体テスト: grass-icon.ts（草アイコン決定・メッセージ生成）
 *
 * See: features/reactions.feature §成長ビジュアル（10刻みループ）
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §3.1 アイコン決定関数
 *
 * テスト方針:
 *   - getGrassIcon は純粋関数であり、全アイコンパターン（0-9, 10-19, 20-29, 30-39, 40-49, ループ）を網羅する
 *   - formatGrassMessage は出力フォーマットの正確性を検証する
 *   - エッジケース: 0本、ループ境界、大きな値を含む
 */

import { describe, expect, it } from "vitest";
import {
	formatGrassMessage,
	getGrassIcon,
} from "../../../../lib/domain/rules/grass-icon";

// ---------------------------------------------------------------------------
// getGrassIcon のテスト
// ---------------------------------------------------------------------------

describe("getGrassIcon", () => {
	// ---
	// 基本パターン（各段階の代表値）
	// See: features/reactions.feature §草カウント 1〜9 本では 🌱 が表示される
	// ---

	describe("基本アイコンパターン", () => {
		it("草カウント 0 では 🌱 が返る", () => {
			expect(getGrassIcon(0)).toBe("🌱");
		});

		it("草カウント 1〜9 では 🌱 が返る", () => {
			for (let count = 1; count <= 9; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🌱");
			}
		});

		it("草カウント 10〜19 では 🌿 が返る", () => {
			// See: features/reactions.feature @草カウントが 10 本に達すると 🌿 に変化する
			for (let count = 10; count <= 19; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🌿");
			}
		});

		it("草カウント 20〜29 では 🌳 が返る", () => {
			// See: features/reactions.feature @草カウントが 20 本に達すると 🌳 に変化する
			for (let count = 20; count <= 29; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🌳");
			}
		});

		it("草カウント 30〜39 では 🍎 が返る", () => {
			// See: features/reactions.feature @草カウントが 30 本に達すると 🍎 に変化する
			for (let count = 30; count <= 39; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🍎");
			}
		});

		it("草カウント 40〜49 では 🫘 が返る", () => {
			// See: features/reactions.feature @草カウントが 40 本に達すると 🫘 に変化する
			for (let count = 40; count <= 49; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🫘");
			}
		});
	});

	// ---
	// ループ動作（50本で 🌱 に戻る）
	// See: features/reactions.feature @草カウントが 50 本に達すると 🌱 に戻りループする
	// ---

	describe("50本ループ動作", () => {
		it("草カウント 50 では 🌱 に戻る", () => {
			expect(getGrassIcon(50)).toBe("🌱");
		});

		it("草カウント 50〜59 では 🌱 が返る（ループ）", () => {
			for (let count = 50; count <= 59; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🌱");
			}
		});

		it("草カウント 60〜69 では 🌿 が返る（ループ2周目）", () => {
			for (let count = 60; count <= 69; count++) {
				expect(getGrassIcon(count), `count=${count}`).toBe("🌿");
			}
		});

		it("草カウント 100 では 🌱 が返る（ループ境界）", () => {
			expect(getGrassIcon(100)).toBe("🌱");
		});

		it("草カウント 150 では 🌱 が返る（大きな値）", () => {
			expect(getGrassIcon(150)).toBe("🌱");
		});
	});

	// ---
	// 段階の境界値テスト
	// ---

	describe("段階の境界値", () => {
		it("草カウント 9 → 10 でアイコンが変わる（🌱 → 🌿）", () => {
			expect(getGrassIcon(9)).toBe("🌱");
			expect(getGrassIcon(10)).toBe("🌿");
		});

		it("草カウント 19 → 20 でアイコンが変わる（🌿 → 🌳）", () => {
			expect(getGrassIcon(19)).toBe("🌿");
			expect(getGrassIcon(20)).toBe("🌳");
		});

		it("草カウント 29 → 30 でアイコンが変わる（🌳 → 🍎）", () => {
			expect(getGrassIcon(29)).toBe("🌳");
			expect(getGrassIcon(30)).toBe("🍎");
		});

		it("草カウント 39 → 40 でアイコンが変わる（🍎 → 🫘）", () => {
			expect(getGrassIcon(39)).toBe("🍎");
			expect(getGrassIcon(40)).toBe("🫘");
		});

		it("草カウント 49 → 50 でアイコンが変わる（🫘 → 🌱 ループ）", () => {
			expect(getGrassIcon(49)).toBe("🫘");
			expect(getGrassIcon(50)).toBe("🌱");
		});
	});

	// ---
	// 大量データ・特殊値テスト
	// ---

	describe("特殊値・大きな値", () => {
		it("草カウント 1000 でも正しくアイコンが返る（1000 % 50 = 0 → 🌱）", () => {
			expect(getGrassIcon(1000)).toBe("🌱");
		});

		it("草カウント 10000 でも正しくアイコンが返る（10000 % 50 = 0 → 🌱）", () => {
			expect(getGrassIcon(10000)).toBe("🌱");
		});

		it("草カウント 10015 では 🌿 が返る（10015 % 50 = 15）", () => {
			expect(getGrassIcon(10015)).toBe("🌿");
		});
	});
});

// ---------------------------------------------------------------------------
// formatGrassMessage のテスト
// ---------------------------------------------------------------------------

describe("formatGrassMessage", () => {
	// ---
	// 基本フォーマット
	// See: features/reactions.feature §草を生やした結果がレス末尾にマージ表示される
	// ---

	describe("基本フォーマット", () => {
		it("「>>N (ID:xxxxxxxx) に草 ICON(計M本)」形式で返す", () => {
			const result = formatGrassMessage(3, "Ax8kP2", 5);
			expect(result).toBe(">>3 (ID:Ax8kP2) に草 🌱(計5本)");
		});

		it("草カウント 10 のとき 🌿 が含まれる", () => {
			// See: features/reactions.feature @草カウントが 10 本に達すると 🌿 に変化する
			const result = formatGrassMessage(3, "Ax8kP2", 10);
			expect(result).toBe(">>3 (ID:Ax8kP2) に草 🌿(計10本)");
		});

		it("草カウント 20 のとき 🌳 が含まれる", () => {
			const result = formatGrassMessage(5, "Bx9kQ3", 20);
			expect(result).toBe(">>5 (ID:Bx9kQ3) に草 🌳(計20本)");
		});

		it("草カウント 30 のとき 🍎 が含まれる", () => {
			const result = formatGrassMessage(7, "Cx0kR4", 30);
			expect(result).toBe(">>7 (ID:Cx0kR4) に草 🍎(計30本)");
		});

		it("草カウント 40 のとき 🫘 が含まれる", () => {
			const result = formatGrassMessage(10, "Dx1kS5", 40);
			expect(result).toBe(">>10 (ID:Dx1kS5) に草 🫘(計40本)");
		});

		it("草カウント 50（ループ後）のとき 🌱 が含まれる", () => {
			// See: features/reactions.feature @草カウントが 50 本に達すると 🌱 に戻りループする
			const result = formatGrassMessage(3, "Ax8kP2", 50);
			expect(result).toBe(">>3 (ID:Ax8kP2) に草 🌱(計50本)");
		});
	});

	// ---
	// メッセージ構成要素の確認
	// ---

	describe("メッセージ構成要素", () => {
		it("レス番号が含まれる", () => {
			const result = formatGrassMessage(99, "TestId1", 1);
			expect(result).toContain(">>99");
		});

		it("dailyId が (ID:xxx) 形式で含まれる", () => {
			const result = formatGrassMessage(3, "Ax8kP2", 1);
			expect(result).toContain("(ID:Ax8kP2)");
		});

		it("草カウントが「計N本」形式で含まれる", () => {
			const result = formatGrassMessage(3, "Ax8kP2", 5);
			expect(result).toContain("(計5本)");
		});

		it("アイコンと本数が連結されて「ICON(計N本)」形式になる", () => {
			const result = formatGrassMessage(3, "Ax8kP2", 5);
			expect(result).toContain("🌱(計5本)");
		});
	});

	// ---
	// BDD シナリオ直接対応
	// See: features/reactions.feature §草を生やした結果がレス末尾にマージ表示される
	// ---

	describe("BDDシナリオ対応", () => {
		it("UserA(ID:Ax8kP2)の草カウントが4 → 草付与後 5本: 「>>3 (ID:Ax8kP2) に草 🌱(計5本)」", () => {
			// UserA の草カウントが 4 であり、草付与後に 5 になる
			const result = formatGrassMessage(3, "Ax8kP2", 5);
			expect(result).toBe(">>3 (ID:Ax8kP2) に草 🌱(計5本)");
		});
	});
});
