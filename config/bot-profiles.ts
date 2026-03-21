/**
 * config/bot-profiles.ts — ボットプロファイル設定定数
 *
 * NOTE: このファイルは config/bot_profiles.yaml の内容と同期を保つこと。
 *       将来的には YAML → TS の自動生成スクリプトを導入する。
 *       ボットプロファイル設定を変更する場合は bot_profiles.yaml（正本）を先に編集し、
 *       本ファイルに手動で反映すること。
 *
 * See: config/bot_profiles.yaml (正本)
 * See: docs/architecture/components/bot.md §2.12.7 bot_profiles.yaml 拡張スキーマ
 */

import type { BotProfile } from "../src/lib/services/bot-strategies/types";

/** bot_profiles.yaml のルート型エイリアス */
type BotProfilesYaml = Record<string, BotProfile>;

/**
 * ボットプロファイル設定定数。
 * Cloudflare Workers 環境では fs.readFileSync が動作しないため、
 * YAML ファイルをビルド時に TypeScript 定数として取り込む。
 *
 * See: config/bot_profiles.yaml (正本)
 * See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 */
export const botProfilesConfig: BotProfilesYaml = {
	// チュートリアルBOT: 撃破報酬固定 +20（daily_bonus=0, attack_bonus=0 により常に base_reward=20 が返る）
	// See: features/welcome.feature @チュートリアルBOTを撃破すると固定20枚の報酬を得る
	// See: config/bot_profiles.yaml (正本)
	tutorial: {
		hp: 10,
		max_hp: 10,
		reward: {
			base_reward: 20,
			daily_bonus: 0,
			attack_bonus: 0,
		},
		fixed_messages: [], // チュートリアルBOTは固定文を使わない（本文はスポーン時に動的生成）
	},
	荒らし役: {
		hp: 10,
		max_hp: 10,
		reward: {
			base_reward: 10,
			daily_bonus: 50,
			attack_bonus: 5,
		},
		fixed_messages: [
			"なんJほんま覇権やな",
			"効いてて草",
			"貧乳なのにめちゃくちゃエロい",
			"【朗報】ワイ、参上",
			"ンゴンゴ",
			"草不可避",
			"せやな",
			"はえ〜すっごい",
			"それな",
			"ぐう畜",
			"まあ正直そうだよな",
			"どういうことだよ（困惑）",
			"ファ！？",
			"ンゴ...",
			"うーんこの",
		],
	},
};
