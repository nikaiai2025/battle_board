/**
 * FixedMessageContentStrategy — 語録プール対応 ContentStrategy 実装
 *
 * bot_profiles.yaml の fixed_messages リスト（管理者固定文）と
 * ユーザー語録（user_bot_vocabularies テーブル）をマージした「語録プール」から
 * ランダムに1件を選択して返す。
 *
 * 語録プール = 管理者固定文 + 有効なユーザー語録
 * ユーザー語録リポジトリが未注入の場合は従来通り固定文のみ（後方互換）。
 *
 * See: features/bot_system.feature @荒らし役ボットは語録プールからランダムに書き込む
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 * See: docs/architecture/components/bot.md §2.12.3 FixedMessageContentStrategy
 * See: docs/architecture/components/bot.md §6.3 荒らし役のAI API不使用
 * See: config/bot_profiles.yaml > fixed_messages
 */

import { botProfilesConfig } from "../../../../../config/bot-profiles";
import type { IUserBotVocabularyRepository } from "../../../infrastructure/repositories/user-bot-vocabulary-repository";
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
 * 管理者固定文（bot_profiles.yaml）とユーザー語録（DB）をマージした
 * 「語録プール」からランダムに1件選択して返す。
 *
 * See: features/bot_system.feature @荒らし役ボットは語録プールからランダムに書き込む
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 * See: docs/architecture/components/bot.md §2.12.3 FixedMessageContentStrategy
 */
export class FixedMessageContentStrategy implements ContentStrategy {
	/** bot_profiles.yaml の解析済みデータ（キャッシュ）*/
	private readonly botProfiles: BotProfilesYaml;

	/** ユーザー語録リポジトリ（オプショナル。未注入時は固定文のみ） */
	private readonly vocabRepo?: IUserBotVocabularyRepository;

	/**
	 * @param botProfiles - ボットプロファイルデータ（省略時は config/bot-profiles.ts の定数を使用）
	 *   テスト時は DI でモックデータを注入可能。
	 * @param vocabRepo - ユーザー語録リポジトリ（省略時は固定文のみで後方互換動作）
	 *   テスト時は InMemory 実装を注入可能。
	 *
	 * See: docs/architecture/components/bot.md §4 > 固定文リストの管理方法
	 */
	constructor(
		botProfiles?: BotProfilesYaml,
		vocabRepo?: IUserBotVocabularyRepository,
	) {
		// Cloudflare Workers 環境では fs.readFileSync が使えないため、
		// config/bot-profiles.ts の TS 定数をデフォルト値として使用する。
		this.botProfiles = botProfiles ?? botProfilesConfig;
		this.vocabRepo = vocabRepo;
	}

	/**
	 * 語録プール（管理者固定文 + ユーザー語録）からランダムに1件選択して返す。
	 *
	 * 語録プール構築:
	 *   1. botProfileKey に対応する固定文リストを取得
	 *   2. vocabRepo が注入されている場合、有効なユーザー語録を取得
	 *   3. 両者をマージして語録プールを構成
	 *   4. プールが空の場合はフォールバック文字列 "..." を返す
	 *
	 * See: features/bot_system.feature @荒らし役ボットは語録プールからランダムに書き込む
	 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
	 * See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
	 *
	 * @param context - コンテンツ生成コンテキスト
	 * @returns 選択された語録文字列
	 */
	async generateContent(context: ContentGenerationContext): Promise<string> {
		// Step 1: 管理者固定文を取得（フォールバックなし版。プールが空の場合は末尾で処理）
		const fixedMessages = this.getRawFixedMessages(context.botProfileKey);

		// Step 2: ユーザー語録を取得（vocabRepo 注入時のみ）
		// See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
		const userVocabs = this.vocabRepo
			? (await this.vocabRepo.findAllActive()).map((v) => v.content)
			: [];

		// Step 3: 語録プールを構築
		const pool = [...fixedMessages, ...userVocabs];

		// Step 4: プールが空の場合はフォールバック
		if (pool.length === 0) {
			return "...";
		}

		return pool[Math.floor(Math.random() * pool.length)];
	}

	/**
	 * プロファイルキーに対応する固定文リストを取得する公開メソッド。
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

	/**
	 * 固定文リストを取得する内部メソッド（フォールバックなし）。
	 * 語録プール構築時に使用する。プールが空の場合の処理は呼び出し元で行う。
	 */
	private getRawFixedMessages(botProfileKey: string | null): string[] {
		if (botProfileKey === null) return [];

		const profile = this.botProfiles[botProfileKey];
		if (!profile?.fixed_messages?.length) return [];

		return profile.fixed_messages;
	}
}
