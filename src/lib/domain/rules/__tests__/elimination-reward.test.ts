/**
 * 単体テスト: elimination-reward（撃破報酬計算）
 *
 * See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 * See: docs/specs/bot_state_transitions.yaml #elimination_reward
 * See: docs/architecture/components/bot.md §2.7 撃破報酬計算
 */

import { describe, expect, it } from "vitest";
import {
	calculateEliminationReward,
	type RewardParams,
} from "../elimination-reward";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** 荒らし役のデフォルト報酬パラメータ（bot_profiles.yaml の値に準拠） */
const TROLLBOT_PARAMS: RewardParams = {
	baseReward: 10,
	dailyBonus: 50,
	attackBonus: 5,
};

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("calculateEliminationReward", () => {
	// =========================================================================
	// 基本計算式の検証
	// See: bot_state_transitions.yaml #elimination_reward > formula
	// =========================================================================

	describe("計算式の検証: base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus)", () => {
		it("初日撃破（生存0日、被攻撃1回）の場合、報酬は 15 である", () => {
			// See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
			// 計算: 10 + (0 * 50) + (1 * 5) = 15
			const reward = calculateEliminationReward(
				{ survivalDays: 0, timesAttacked: 1 },
				TROLLBOT_PARAMS,
			);
			expect(reward).toBe(15);
		});

		it("5日生存・被攻撃3回の場合、報酬は 275 である", () => {
			// See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
			// 計算: 10 + (5 * 50) + (3 * 5) = 275
			const reward = calculateEliminationReward(
				{ survivalDays: 5, timesAttacked: 3 },
				TROLLBOT_PARAMS,
			);
			expect(reward).toBe(275);
		});

		it("5日生存・被攻撃1回の場合、報酬は 265 である", () => {
			// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
			// 計算: 10 + (5 * 50) + (1 * 5) = 265
			const reward = calculateEliminationReward(
				{ survivalDays: 5, timesAttacked: 1 },
				TROLLBOT_PARAMS,
			);
			expect(reward).toBe(265);
		});

		it("生存0日・被攻撃0回の場合、基本報酬のみ（10）が返る", () => {
			// 計算: 10 + (0 * 50) + (0 * 5) = 10
			const reward = calculateEliminationReward(
				{ survivalDays: 0, timesAttacked: 0 },
				TROLLBOT_PARAMS,
			);
			expect(reward).toBe(10);
		});
	});

	// =========================================================================
	// 各パラメータの独立検証
	// =========================================================================

	describe("各パラメータの独立検証", () => {
		it("survival_days のみが増加した場合、daily_bonus 分だけ報酬が増加する", () => {
			const rewardDay0 = calculateEliminationReward(
				{ survivalDays: 0, timesAttacked: 0 },
				TROLLBOT_PARAMS,
			);
			const rewardDay1 = calculateEliminationReward(
				{ survivalDays: 1, timesAttacked: 0 },
				TROLLBOT_PARAMS,
			);
			expect(rewardDay1 - rewardDay0).toBe(TROLLBOT_PARAMS.dailyBonus);
		});

		it("times_attacked のみが増加した場合、attack_bonus 分だけ報酬が増加する", () => {
			const reward0 = calculateEliminationReward(
				{ survivalDays: 0, timesAttacked: 0 },
				TROLLBOT_PARAMS,
			);
			const reward1 = calculateEliminationReward(
				{ survivalDays: 0, timesAttacked: 1 },
				TROLLBOT_PARAMS,
			);
			expect(reward1 - reward0).toBe(TROLLBOT_PARAMS.attackBonus);
		});
	});

	// =========================================================================
	// カスタム報酬パラメータ（将来のレイドボス等）
	// =========================================================================

	describe("カスタム報酬パラメータ", () => {
		it("カスタムパラメータで計算が正しく行われる", () => {
			const customParams: RewardParams = {
				baseReward: 100,
				dailyBonus: 200,
				attackBonus: 50,
			};
			// 3日生存・被攻撃2回: 100 + (3 * 200) + (2 * 50) = 800
			const reward = calculateEliminationReward(
				{ survivalDays: 3, timesAttacked: 2 },
				customParams,
			);
			expect(reward).toBe(800);
		});
	});

	// =========================================================================
	// 境界値・エッジケース
	// =========================================================================

	describe("境界値・エッジケース", () => {
		it("大きな生存日数（365日）でも正しく計算される", () => {
			// 365日生存・被攻撃0回: 10 + (365 * 50) + (0 * 5) = 18260
			const reward = calculateEliminationReward(
				{ survivalDays: 365, timesAttacked: 0 },
				TROLLBOT_PARAMS,
			);
			expect(reward).toBe(18260);
		});

		it("大きな被攻撃回数（100回）でも正しく計算される", () => {
			// 0日生存・被攻撃100回: 10 + (0 * 50) + (100 * 5) = 510
			const reward = calculateEliminationReward(
				{ survivalDays: 0, timesAttacked: 100 },
				TROLLBOT_PARAMS,
			);
			expect(reward).toBe(510);
		});

		it("base_reward が 0 のパラメータでも計算される", () => {
			const zeroBaseParams: RewardParams = {
				baseReward: 0,
				dailyBonus: 50,
				attackBonus: 5,
			};
			const reward = calculateEliminationReward(
				{ survivalDays: 1, timesAttacked: 1 },
				zeroBaseParams,
			);
			expect(reward).toBe(55);
		});

		it("全パラメータが 0 の場合、報酬は 0 である", () => {
			const allZeroParams: RewardParams = {
				baseReward: 0,
				dailyBonus: 0,
				attackBonus: 0,
			};
			const reward = calculateEliminationReward(
				{ survivalDays: 10, timesAttacked: 10 },
				allZeroParams,
			);
			expect(reward).toBe(0);
		});

		it("報酬は常に整数値を返す", () => {
			const reward = calculateEliminationReward(
				{ survivalDays: 5, timesAttacked: 3 },
				TROLLBOT_PARAMS,
			);
			expect(Number.isInteger(reward)).toBe(true);
		});
	});
});
