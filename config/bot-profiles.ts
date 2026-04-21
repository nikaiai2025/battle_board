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
	// 人間模倣ボット: AI が事前生成した reply_candidates 在庫から既存スレッドへ返信する。
	// HP / 報酬 / 投稿間隔 / 復活ロジックは荒らし役と同一。
	// See: features/human_mimic_bot.feature
	human_mimic: {
		hp: 10,
		max_hp: 10,
		reward: {
			base_reward: 10,
			daily_bonus: 50,
			attack_bonus: 5,
		},
		content_strategy: "stored_reply_candidate",
		behavior_type: "reply",
		scheduling: {
			type: "fixed_interval",
			min: 60,
			max: 120,
		},
		fixed_messages: [],
	},
	// TASK-270: 煽りBOT（!aori コマンドで召喚される使い切りBOT）
	// 撃破報酬固定 +10（daily_bonus=0, attack_bonus=0 により常に base_reward=10 が返る）
	// ファーミング防止: 召喚-10 + 攻撃-5 + 報酬+10 = -5（自作自演は赤字）
	// See: features/command_aori.feature @煽りBOTを!attackで撃破すると報酬を得る
	aori: {
		hp: 10,
		max_hp: 10,
		reward: {
			base_reward: 10,
			daily_bonus: 0,
			attack_bonus: 0,
		},
		fixed_messages: [], // 煽り文句は aori-taunts.ts で管理（BOT プロファイルと分離）
	},
	// TASK-334: hiroyukiBOT（!hiroyuki コマンドで召喚される使い切りBOT）
	// 撃破報酬固定 +10（daily_bonus=0, attack_bonus=0 により常に base_reward=10 が返る）
	// ファーミング防止: 召喚-10 + 攻撃-5 + 報酬+10 = -5（自作自演は赤字）
	// ひろゆき風テキストは Gemini API で動的生成（固定文なし）
	// See: features/command_hiroyuki.feature
	// See: config/bot_profiles.yaml (正本)
	hiroyuki: {
		hp: 10,
		max_hp: 10,
		reward: {
			base_reward: 10,
			daily_bonus: 0,
			attack_bonus: 0,
		},
		fixed_messages: [], // ひろゆき風テキストは Gemini API で動的生成（固定文なし）
	},
	// コピペボット: !copipe コマンドを実行するHP:100の運営ボット
	// See: features/bot_system.feature @コピペボット
	// See: config/bot_profiles.yaml (正本)
	コピペ: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		fixed_messages: ["!copipe"],
	},
	// Phase 3: 速報+速報ボット（キュレーションBOT Phase A）
	// 5chニュース速報+のバズスレッドをキュレーションして転載する。
	// 報酬パラメータはコピペBOT（同HP:100）と同等。
	// See: features/curation_bot.feature
	// See: config/bot_profiles.yaml (正本)
	curation_newsplus: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		behavior_type: "create_thread",
		scheduling: {
			type: "topic_driven",
			min_interval_minutes: 720,
			max_interval_minutes: 1440,
		},
		collection: {
			adapter: "subject_txt",
			source_url: "https://asahi.5ch.io/newsplus/subject.txt",
		},
		fixed_messages: [],
	},
	// Phase B: Wikipedia速報ボット（キュレーションBOT Phase B）
	// 日本語Wikipedia の日次急上昇記事をキュレーションして転載する運営ボット。
	// データソース: Wikimedia REST API (pageviews top)
	//   https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access/{YYYY}/{MM}/{DD}
	// 報酬パラメータはコピペBOT（同HP:100）と同等。
	// 投稿間隔: 720〜1440分（12〜24時間、ランダム）
	// メタページ（メインページ / 特別:検索 等）は WikipediaAdapter 内で除外
	// See: features/curation_bot.feature
	// See: config/bot_profiles.yaml (正本)
	// See: tmp/workers/bdd-architect_TASK-379/design.md
	curation_wikipedia: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		behavior_type: "create_thread",
		scheduling: {
			type: "topic_driven",
			min_interval_minutes: 720,
			max_interval_minutes: 1440,
		},
		collection: {
			adapter: "wikipedia",
			// source_url は API ベースURL。日付以下（/YYYY/MM/DD）は WikipediaAdapter が動的構築する
			source_url:
				"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access",
		},
		fixed_messages: [],
	},
	// Phase C Step 1: 嫌儲速報ボット（キュレーションBOT Phase C Step 1）
	// 5ch嫌儲（poverty）のバズスレッドをキュレーションして転載する運営ボット。
	// subject_txt 方式（SubjectTxtAdapter）を流用する。
	// 報酬パラメータ・スケジューリングは curation_newsplus と同等。
	// See: features/curation_bot.feature
	curation_poverty: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		behavior_type: "create_thread",
		scheduling: {
			type: "topic_driven",
			min_interval_minutes: 720,
			max_interval_minutes: 1440,
		},
		collection: {
			adapter: "subject_txt",
			source_url: "https://greta.5ch.io/poverty/subject.txt",
		},
		fixed_messages: [],
	},
	// Phase C Step 1: 芸スポ速報ボット（キュレーションBOT Phase C Step 1）
	// 5ch芸スポ速報+（mnewsplus）のバズスレッドをキュレーションして転載する運営ボット。
	// subject_txt 方式（SubjectTxtAdapter）を流用する。
	// 報酬パラメータ・スケジューリングは curation_newsplus と同等。
	// See: features/curation_bot.feature
	curation_mnewsplus: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		behavior_type: "create_thread",
		scheduling: {
			type: "topic_driven",
			min_interval_minutes: 720,
			max_interval_minutes: 1440,
		},
		collection: {
			adapter: "subject_txt",
			source_url: "https://hayabusa9.5ch.io/mnewsplus/subject.txt",
		},
		fixed_messages: [],
	},
	// Phase C Step 1: VIP速報ボット（キュレーションBOT Phase C Step 1）
	// 5ch VIP（news4vip）のバズスレッドをキュレーションして転載する運営ボット。
	// subject_txt 方式（SubjectTxtAdapter）を流用する。
	// 報酬パラメータ・スケジューリングは curation_newsplus と同等。
	// See: features/curation_bot.feature
	curation_news4vip: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		behavior_type: "create_thread",
		scheduling: {
			type: "topic_driven",
			min_interval_minutes: 720,
			max_interval_minutes: 1440,
		},
		collection: {
			adapter: "subject_txt",
			source_url: "https://mi.5ch.io/news4vip/subject.txt",
		},
		fixed_messages: [],
	},
	// Phase C Step 1: liveedge速報ボット（キュレーションBOT Phase C Step 1）
	// liveedge（eddibb.cc/liveedge）のバズスレッドをキュレーションして転載する運営ボット。
	// subject_txt 方式（SubjectTxtAdapter）を流用する。
	// 報酬パラメータ・スケジューリングは curation_newsplus と同等。
	// See: features/curation_bot.feature
	curation_liveedge: {
		hp: 100,
		max_hp: 100,
		reward: {
			base_reward: 50,
			daily_bonus: 20,
			attack_bonus: 3,
		},
		behavior_type: "create_thread",
		scheduling: {
			type: "topic_driven",
			min_interval_minutes: 720,
			max_interval_minutes: 1440,
		},
		collection: {
			adapter: "subject_txt",
			source_url: "https://bbs.eddibb.cc/liveedge/subject.txt",
		},
		fixed_messages: [],
	},
};
