/**
 * 単体テスト: accusation-rules（AI告発の判定純粋関数）
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2
 *
 * テスト方針:
 *   - 純粋関数のため外部依存なし。モック不要。
 *   - 全判定パスとエッジケースを網羅する。
 *
 * カバレッジ対象:
 *   - checkAccusationAllowed: 自分自身の書き込みチェック / システムメッセージチェック
 *   - calculateBonus: hit時/miss時のボーナス額計算
 *   - buildHitSystemMessage: hit時のシステムメッセージ生成
 *   - buildMissSystemMessage: miss時のシステムメッセージ生成
 */

import { describe, expect, it } from "vitest";
import {
	ACCUSATION_HIT_BONUS,
	type AccusationCheckInput,
	buildHitSystemMessage,
	buildMissSystemMessage,
	calculateBonus,
	checkAccusationAllowed,
	FALSE_ACCUSATION_BONUS,
} from "../../../../lib/domain/rules/accusation-rules";

// ===========================================================================
// checkAccusationAllowed
// ===========================================================================

describe("checkAccusationAllowed", () => {
	// -----------------------------------------------------------------------
	// 正常系: 告発が許可されるケース
	// -----------------------------------------------------------------------

	it("他人の通常レスへの告発は許可される", () => {
		// See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
		const input: AccusationCheckInput = {
			accuserId: "user-001",
			targetAuthorId: "user-002",
			targetIsSystemMessage: false,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(true);
	});

	it("ボットの書き込み（authorId=null、isSystemMessage=false）への告発は許可される", () => {
		// ボット書き込みは authorId=null だが、告発の主目的なので許可する
		const input: AccusationCheckInput = {
			accuserId: "user-001",
			targetAuthorId: null,
			targetIsSystemMessage: false,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(true);
	});

	// -----------------------------------------------------------------------
	// 異常系: 自分自身の書き込みへの告発
	// -----------------------------------------------------------------------

	it("自分自身の書き込みへの告発は拒否される", () => {
		// See: features/phase2/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
		const input: AccusationCheckInput = {
			accuserId: "user-001",
			targetAuthorId: "user-001",
			targetIsSystemMessage: false,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("self_accusation");
		}
	});

	// -----------------------------------------------------------------------
	// 異常系: システムメッセージへの告発
	// -----------------------------------------------------------------------

	it("システムメッセージへの告発は拒否される", () => {
		// See: features/phase2/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
		const input: AccusationCheckInput = {
			accuserId: "user-001",
			targetAuthorId: null,
			targetIsSystemMessage: true,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("system_message");
		}
	});

	it("authorIdがあるシステムメッセージへの告発も拒否される", () => {
		// 理論上ありえないが防御的にチェック
		const input: AccusationCheckInput = {
			accuserId: "user-001",
			targetAuthorId: "user-002",
			targetIsSystemMessage: true,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("system_message");
		}
	});

	// -----------------------------------------------------------------------
	// エッジケース
	// -----------------------------------------------------------------------

	it("システムメッセージかつ自分のauthorIdの場合はsystem_messageが優先される", () => {
		// 両方の条件に該当する場合、system_message チェックが先に実行される
		const input: AccusationCheckInput = {
			accuserId: "user-001",
			targetAuthorId: "user-001",
			targetIsSystemMessage: true,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("system_message");
		}
	});

	it("空文字列のaccuserIdとtargetAuthorIdが同じ場合は自己告発として拒否される", () => {
		const input: AccusationCheckInput = {
			accuserId: "",
			targetAuthorId: "",
			targetIsSystemMessage: false,
		};

		const result = checkAccusationAllowed(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("self_accusation");
		}
	});
});

// ===========================================================================
// calculateBonus
// ===========================================================================

describe("calculateBonus", () => {
	it("hit（AIボット）の場合、告発者にACCUSATION_HIT_BONUSが付与される", () => {
		// See: features/phase2/ai_accusation.feature @告発成功ボーナスが告発者に付与される
		const result = calculateBonus(true);

		expect(result.accuserBonus).toBe(ACCUSATION_HIT_BONUS);
		expect(result.targetBonus).toBe(0);
	});

	it("miss（人間）の場合、被告発者にFALSE_ACCUSATION_BONUSが付与される", () => {
		// See: features/phase2/ai_accusation.feature @被告発者に冤罪ボーナスが付与される
		const result = calculateBonus(false);

		expect(result.accuserBonus).toBe(0);
		expect(result.targetBonus).toBe(FALSE_ACCUSATION_BONUS);
	});

	it("hit時のボーナス額が告発コストの2倍（100）である", () => {
		const result = calculateBonus(true);

		expect(result.accuserBonus).toBe(100);
	});

	it("miss時の冤罪ボーナス額が告発コストと同額（50）である", () => {
		const result = calculateBonus(false);

		expect(result.targetBonus).toBe(50);
	});
});

// ===========================================================================
// buildHitSystemMessage
// ===========================================================================

describe("buildHitSystemMessage", () => {
	it("告発成功のシステムメッセージに告発者のdailyIdが含まれる", () => {
		// See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
		const message = buildHitSystemMessage("AbCd1234", 5, 100);

		expect(message).toContain("AbCd1234");
	});

	it("告発成功のシステムメッセージに対象レス番号が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 100);

		expect(message).toContain(">>5");
	});

	it("告発成功のシステムメッセージにボーナス額が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 100);

		expect(message).toContain("+100");
	});

	it("告発成功のシステムメッセージに[システム]ヘッダが含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 100);

		expect(message).toContain("[システム]");
	});

	it("告発成功のシステムメッセージにAI判定結果が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 100);

		expect(message).toContain("AIでした");
	});

	it("レス番号1の場合も正しくフォーマットされる（境界値）", () => {
		const message = buildHitSystemMessage("Test0001", 1, 100);

		expect(message).toContain(">>1");
	});

	it("ボーナス額0の場合も正しくフォーマットされる（境界値）", () => {
		const message = buildHitSystemMessage("Test0001", 5, 0);

		expect(message).toContain("+0");
	});
});

// ===========================================================================
// buildMissSystemMessage
// ===========================================================================

describe("buildMissSystemMessage", () => {
	it("冤罪のシステムメッセージに告発者のdailyIdが含まれる", () => {
		// See: features/phase2/ai_accusation.feature @AI告発に失敗すると冤罪ボーナスが被告発者に付与される
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("AbCd1234");
	});

	it("冤罪のシステムメッセージに被告発者のdailyIdが含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("XyZw5678");
	});

	it("冤罪のシステムメッセージに対象レス番号が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain(">>5");
	});

	it("冤罪のシステムメッセージに告発コスト額が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("-50");
	});

	it("冤罪のシステムメッセージに冤罪ボーナス額が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("+50");
	});

	it("冤罪のシステムメッセージに人間判定結果が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("人間でした");
	});

	it("冤罪のシステムメッセージに[システム]ヘッダが含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("[システム]");
	});

	it("冤罪のシステムメッセージに冤罪ボーナスの獲得メッセージが含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 50, 50);

		expect(message).toContain("冤罪ボーナス");
	});
});

// ===========================================================================
// 定数値の検証
// ===========================================================================

describe("ボーナス定数", () => {
	it("ACCUSATION_HIT_BONUS は正の整数である", () => {
		expect(ACCUSATION_HIT_BONUS).toBeGreaterThan(0);
		expect(Number.isInteger(ACCUSATION_HIT_BONUS)).toBe(true);
	});

	it("FALSE_ACCUSATION_BONUS は正の整数である", () => {
		expect(FALSE_ACCUSATION_BONUS).toBeGreaterThan(0);
		expect(Number.isInteger(FALSE_ACCUSATION_BONUS)).toBe(true);
	});

	it("ACCUSATION_HIT_BONUS は FALSE_ACCUSATION_BONUS より大きい（告発成功のインセンティブが冤罪ボーナスを上回る）", () => {
		expect(ACCUSATION_HIT_BONUS).toBeGreaterThan(FALSE_ACCUSATION_BONUS);
	});
});
