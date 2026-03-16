/**
 * 単体テスト: accusation-rules（AI告発の判定純粋関数）
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2
 *
 * テスト方針:
 *   - 純粋関数のため外部依存なし。モック不要。
 *   - 全判定パスとエッジケースを網羅する。
 *   - ボーナス額は引数で渡される（ハードコード定数は削除済み）。
 *
 * カバレッジ対象:
 *   - checkAccusationAllowed: 自分自身の書き込みチェック / システムメッセージチェック
 *   - calculateBonus: hit時/miss時のボーナス額計算（引数ベース）
 *   - buildHitSystemMessage: hit時のシステムメッセージ生成
 *   - buildMissSystemMessage: miss時のシステムメッセージ生成
 */

import { describe, expect, it } from "vitest";
import {
	type AccusationCheckInput,
	buildHitSystemMessage,
	buildMissSystemMessage,
	calculateBonus,
	checkAccusationAllowed,
} from "../../../../lib/domain/rules/accusation-rules";

// ---------------------------------------------------------------------------
// テスト用定数（config/commands.yaml の値と一致）
// ---------------------------------------------------------------------------

/** 告発成功ボーナス（config/commands.yaml tell.hitBonus） */
const HIT_BONUS = 20;

/** 冤罪ボーナス（config/commands.yaml tell.falseAccusationBonus） */
const FALSE_ACCUSATION_BONUS = 10;

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
	it("hit（AIボット）の場合、告発者にhitBonusが付与される", () => {
		// See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
		const result = calculateBonus(true, HIT_BONUS, FALSE_ACCUSATION_BONUS);

		expect(result.accuserBonus).toBe(HIT_BONUS);
		expect(result.targetBonus).toBe(0);
	});

	it("miss（人間）の場合、被告発者にfalseAccusationBonusが付与される", () => {
		// See: features/phase2/ai_accusation.feature @AI告発に失敗すると冤罪ボーナスが被告発者に付与される
		const result = calculateBonus(false, HIT_BONUS, FALSE_ACCUSATION_BONUS);

		expect(result.accuserBonus).toBe(0);
		expect(result.targetBonus).toBe(FALSE_ACCUSATION_BONUS);
	});

	it("hit時のボーナス額が引数で渡した値（20）である", () => {
		const result = calculateBonus(true, 20, 10);

		expect(result.accuserBonus).toBe(20);
	});

	it("miss時の冤罪ボーナス額が引数で渡した値（10）である", () => {
		const result = calculateBonus(false, 20, 10);

		expect(result.targetBonus).toBe(10);
	});

	it("異なるボーナス値を渡した場合もそのまま使用される", () => {
		const result = calculateBonus(true, 999, 500);

		expect(result.accuserBonus).toBe(999);
		expect(result.targetBonus).toBe(0);
	});

	it("ボーナス値0を渡した場合もそのまま使用される（境界値）", () => {
		const resultHit = calculateBonus(true, 0, 0);
		expect(resultHit.accuserBonus).toBe(0);

		const resultMiss = calculateBonus(false, 0, 0);
		expect(resultMiss.targetBonus).toBe(0);
	});
});

// ===========================================================================
// buildHitSystemMessage
// ===========================================================================

describe("buildHitSystemMessage", () => {
	it("告発成功のシステムメッセージに告発者のdailyIdが含まれる", () => {
		// See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
		const message = buildHitSystemMessage("AbCd1234", 5, 20);

		expect(message).toContain("AbCd1234");
	});

	it("告発成功のシステムメッセージに対象レス番号が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 20);

		expect(message).toContain(">>5");
	});

	it("告発成功のシステムメッセージにボーナス額が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 20);

		expect(message).toContain("+20");
	});

	it("告発成功のシステムメッセージに[システム]ヘッダが含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 20);

		expect(message).toContain("[システム]");
	});

	it("告発成功のシステムメッセージにAI判定結果が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5, 20);

		expect(message).toContain("AIでした");
	});

	it("レス番号1の場合も正しくフォーマットされる（境界値）", () => {
		const message = buildHitSystemMessage("Test0001", 1, 20);

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
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("AbCd1234");
	});

	it("冤罪のシステムメッセージに被告発者のdailyIdが含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("XyZw5678");
	});

	it("冤罪のシステムメッセージに対象レス番号が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain(">>5");
	});

	it("冤罪のシステムメッセージに告発コスト額が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("-10");
	});

	it("冤罪のシステムメッセージに冤罪ボーナス額が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("+10");
	});

	it("冤罪のシステムメッセージに人間判定結果が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("人間でした");
	});

	it("冤罪のシステムメッセージに[システム]ヘッダが含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("[システム]");
	});

	it("冤罪のシステムメッセージに冤罪ボーナスの獲得メッセージが含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, "XyZw5678", 10, 10);

		expect(message).toContain("冤罪ボーナス");
	});
});
