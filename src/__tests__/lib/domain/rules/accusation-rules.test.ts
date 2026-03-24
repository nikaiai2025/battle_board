/**
 * 単体テスト: accusation-rules（AI告発の判定純粋関数）
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2
 *
 * テスト方針:
 *   - 純粋関数のため外部依存なし。モック不要。
 *   - 全判定パスとエッジケースを網羅する。
 *   - v4: ボーナス廃止。calculateBonus は削除済み。
 *
 * カバレッジ対象:
 *   - checkAccusationAllowed: 自分自身の書き込みチェック / システムメッセージチェック
 *   - buildHitSystemMessage: hit時のシステムメッセージ生成（ボーナス付与なし）
 *   - buildMissSystemMessage: miss時のシステムメッセージ生成（冤罪ボーナスなし）
 */

import { describe, expect, it } from "vitest";
import {
	type AccusationCheckInput,
	buildHitSystemMessage,
	buildMissSystemMessage,
	checkAccusationAllowed,
} from "../../../../lib/domain/rules/accusation-rules";

// ===========================================================================
// checkAccusationAllowed
// ===========================================================================

describe("checkAccusationAllowed", () => {
	// -----------------------------------------------------------------------
	// 正常系: 告発が許可されるケース
	// -----------------------------------------------------------------------

	it("他人の通常レスへの告発は許可される", () => {
		// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
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
		// See: features/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
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
		// See: features/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
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
// buildHitSystemMessage
// ===========================================================================

describe("buildHitSystemMessage", () => {
	it("告発成功のシステムメッセージに告発者のdailyIdが含まれる", () => {
		// See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
		const message = buildHitSystemMessage("AbCd1234", 5);

		expect(message).toContain("AbCd1234");
	});

	it("告発成功のシステムメッセージに対象レス番号が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5);

		expect(message).toContain(">>5");
	});

	it("告発成功のシステムメッセージに告発行動の記述が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5);

		expect(message).toContain("をAI告発");
	});

	it("告発成功のシステムメッセージにAI判定結果が含まれる", () => {
		const message = buildHitSystemMessage("AbCd1234", 5);

		expect(message).toContain("AIでした");
	});

	it("告発成功のシステムメッセージにボーナス付与行が含まれない", () => {
		// See: features/ai_accusation.feature @告発者に通貨報酬は付与されない
		const message = buildHitSystemMessage("AbCd1234", 5);

		expect(message).not.toContain("通貨 +");
	});

	it("レス番号1の場合も正しくフォーマットされる（境界値）", () => {
		const message = buildHitSystemMessage("Test0001", 1);

		expect(message).toContain(">>1");
	});
});

// ===========================================================================
// buildMissSystemMessage
// ===========================================================================

describe("buildMissSystemMessage", () => {
	it("告発失敗のシステムメッセージに告発者のdailyIdが含まれる", () => {
		// See: features/ai_accusation.feature @AI告発に失敗するとコストのみ消費される
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		expect(message).toContain("AbCd1234");
	});

	it("告発失敗のシステムメッセージに対象レス番号が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		expect(message).toContain(">>5");
	});

	it("告発失敗のシステムメッセージに告発コスト額が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		expect(message).toContain("-10");
	});

	it("告発失敗のシステムメッセージに人間判定結果が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		expect(message).toContain("人間でした");
	});

	it("告発失敗のシステムメッセージに告発行動の記述が含まれる", () => {
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		expect(message).toContain("をAI告発");
	});

	it("告発失敗のシステムメッセージに冤罪ボーナス関連文言が含まれない", () => {
		// See: features/ai_accusation.feature @被告発者に通貨は付与されない
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		expect(message).not.toContain("冤罪ボーナス");
	});

	it("告発失敗のシステムメッセージに被告発者のdailyIdが含まれない", () => {
		// v4: 被告発者への言及なし（冤罪ボーナス廃止のため）
		const message = buildMissSystemMessage("AbCd1234", 5, 10);

		// メッセージに告発者のID以外のIDが含まれないことを確認
		// （buildMissSystemMessage は被告発者のdailyIdを引数に取らなくなった）
		expect(message).not.toContain("XyZw5678");
	});
});
