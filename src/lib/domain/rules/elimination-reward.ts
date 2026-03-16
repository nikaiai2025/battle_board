/**
 * 撃破報酬計算の純粋関数
 *
 * See: features/未実装/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 * See: docs/specs/bot_state_transitions.yaml #elimination_reward
 * See: docs/architecture/components/bot.md §2.7 撃破報酬計算
 *
 * 計算式: base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus)
 * パラメータは config/bot_profiles.yaml からプロファイルごとに読み込む。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 撃破報酬計算に使用するパラメータ。
 * config/bot_profiles.yaml の reward セクションから読み込む。
 * See: config/bot_profiles.yaml
 * See: docs/specs/bot_state_transitions.yaml #phase2_bots > reward_parameters
 */
export interface RewardParams {
	/** 基本報酬（荒らし役デフォルト: 10） */
	baseReward: number;
	/** 生存日数ボーナス（荒らし役デフォルト: 50 / 日） */
	dailyBonus: number;
	/** 被攻撃ボーナス（荒らし役デフォルト: 5 / 回） */
	attackBonus: number;
}

/**
 * 撃破報酬計算の入力型。
 * BotService.applyDamage() → calculateEliminationReward() の呼び出し時に渡す。
 */
export interface RewardInput {
	/** 生存日数（JST 0:00 基準でカウント） */
	survivalDays: number;
	/** 被攻撃回数（日次リセット時に 0 にリセット） */
	timesAttacked: number;
}

// ---------------------------------------------------------------------------
// 純粋関数
// ---------------------------------------------------------------------------

/**
 * 撃破報酬を計算する。
 *
 * 計算式: base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus)
 *
 * See: features/未実装/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 * See: docs/specs/bot_state_transitions.yaml #elimination_reward > formula
 *
 * @param input - 撃破時のボット状態（生存日数・被攻撃回数）
 * @param params - 報酬パラメータ（プロファイルごとに異なる）
 * @returns 撃破報酬額（整数）
 */
export function calculateEliminationReward(
	input: RewardInput,
	params: RewardParams,
): number {
	return (
		params.baseReward +
		input.survivalDays * params.dailyBonus +
		input.timesAttacked * params.attackBonus
	);
}
