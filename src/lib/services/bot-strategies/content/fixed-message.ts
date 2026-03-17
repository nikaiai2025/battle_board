/**
 * FixedMessageContentStrategy — 固定文ランダム選択 ContentStrategy 実装（Phase 2）
 *
 * bot_profiles.yaml の fixed_messages リストからランダムに1件を選択して返す。
 * 荒らし役ボットに適用される ContentStrategy の Phase 2 実装。
 *
 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
 * See: docs/architecture/components/bot.md §2.12.3 FixedMessageContentStrategy
 * See: docs/architecture/components/bot.md §6.3 荒らし役のAI API不使用
 * See: config/bot_profiles.yaml > fixed_messages
 */

import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type {
	BotProfile,
	ContentGenerationContext,
	ContentStrategy,
} from "../types";

/** bot_profiles.yaml のルート型（FixedMessageContentStrategy 内部用） */
type BotProfilesYaml = Record<string, BotProfile>;

/**
 * FixedMessageContentStrategy クラス。
 *
 * bot_profiles.yaml からプロファイルキーに対応する fixed_messages リストを取得し、
 * generateContent() でランダムに1件選択して返す。
 *
 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
 * See: docs/architecture/components/bot.md §2.12.3 FixedMessageContentStrategy
 */
export class FixedMessageContentStrategy implements ContentStrategy {
	/** bot_profiles.yaml の解析済みデータ（キャッシュ）*/
	private readonly botProfiles: BotProfilesYaml;

	/**
	 * @param botProfilesYamlPath - bot_profiles.yaml のパス（省略時はデフォルトパス）
	 *
	 * See: docs/architecture/components/bot.md §4 > 固定文リストの管理方法
	 */
	constructor(botProfilesYamlPath?: string) {
		const yamlPath =
			botProfilesYamlPath ??
			path.resolve(process.cwd(), "config/bot_profiles.yaml");
		const yamlContent = fs.readFileSync(yamlPath, "utf-8");
		this.botProfiles = parseYaml(yamlContent) as BotProfilesYaml;
	}

	/**
	 * 固定文リストからランダムに1件選択して返す。
	 *
	 * botProfileKey が null、またはプロファイルが見つからない場合、
	 * fixed_messages が空の場合はフォールバック文字列 "..." を返す。
	 *
	 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行 Step 1
	 *
	 * @param context - コンテンツ生成コンテキスト
	 * @returns 選択された固定文
	 */
	async generateContent(context: ContentGenerationContext): Promise<string> {
		const messages = this.getFixedMessages(context.botProfileKey);
		return messages[Math.floor(Math.random() * messages.length)];
	}

	/**
	 * プロファイルキーに対応する固定文リストを取得する内部メソッド。
	 *
	 * プロファイルが存在しない、または fixed_messages が空の場合は
	 * フォールバック文字列 ["..."] を返す。
	 *
	 * See: docs/architecture/components/bot.md §4 > 固定文リストの管理方法
	 */
	getFixedMessages(botProfileKey: string | null): string[] {
		const fallback = ["..."];
		if (botProfileKey === null) return fallback;

		const profile = this.botProfiles[botProfileKey];
		if (!profile?.fixed_messages?.length) return fallback;

		return profile.fixed_messages;
	}
}
