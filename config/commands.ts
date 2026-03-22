/**
 * config/commands.ts — コマンド設定定数
 *
 * NOTE: このファイルは config/commands.yaml の内容と同期を保つこと。
 *       将来的には YAML → TS の自動生成スクリプトを導入する。
 *       コマンド設定を変更する場合は commands.yaml（正本）を先に編集し、
 *       本ファイルに手動で反映すること。
 *
 * See: config/commands.yaml (正本)
 * See: docs/architecture/components/command.md §2.2
 */

import type { CommandsYaml } from "../src/lib/services/command-service";

/**
 * コマンド設定定数。
 * Cloudflare Workers 環境では fs.readFileSync が動作しないため、
 * YAML ファイルをビルド時に TypeScript 定数として取り込む。
 *
 * See: config/commands.yaml (正本)
 * See: tmp/workers/bdd-architect_TASK-147/analysis.md §4.1
 */
export const commandsConfig: CommandsYaml = {
	commands: {
		tell: {
			description: "指定レスをAIだと告発する",
			cost: 10,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
		attack: {
			description: "指定レスに攻撃する",
			cost: 5,
			damage: 10,
			compensation_multiplier: 3,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
		w: {
			description: "指定レスに草を生やす",
			cost: 0,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
		abeshinzo: {
			description: "意味のないコマンド",
			cost: 0,
			targetFormat: null,
			enabled: true,
			stealth: false,
			hidden: true,
		},
		hissi: {
			description: "対象ユーザーの本日の書き込みを表示",
			cost: 20,
			targetFormat: ">>postNumber",
			responseType: "independent",
			enabled: true,
			stealth: false,
		},
		kinou: {
			description: "対象ユーザーの昨日の日次リセットIDを表示",
			cost: 20,
			targetFormat: ">>postNumber",
			responseType: "independent",
			enabled: true,
			stealth: false,
		},
		// TASK-264: !omikuji コマンド追加（ターゲット任意パターン）
		// See: features/command_omikuji.feature
		omikuji: {
			description: "おみくじで運勢を占う（>>N 指定で対象レスの人の運勢を占う）",
			cost: 0,
			targetFormat: null,
			responseType: "independent",
			enabled: true,
			stealth: false,
		},
		// TASK-266: !iamsystem コマンド追加（ステルスでシステム偽装）
		// See: features/command_iamsystem.feature
		iamsystem: {
			description: "表示名が★システムになる",
			cost: 5,
			targetFormat: null,
			enabled: true,
			stealth: true,
		},
		// TASK-270: !aori コマンド追加（煽りBOT召喚・ステルス）
		// See: features/command_aori.feature
		aori: {
			description: "煽りBOTを召喚する",
			cost: 10,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: true,
		},
		// TASK-272: !newspaper コマンド追加（AIニュース取得・非ステルス）
		// See: features/command_newspaper.feature
		newspaper: {
			description: "最新ニュースを取得する",
			cost: 10,
			targetFormat: null,
			responseType: "independent" as const,
			enabled: true,
			stealth: false,
		},
		// TASK-278: !livingbot コマンド追加（生存BOT数表示）
		// See: features/command_livingbot.feature
		livingbot: {
			description: "掲示板全体の生存BOT数を表示する",
			cost: 5,
			targetFormat: null,
			enabled: true,
			stealth: false,
		},
	},
};
