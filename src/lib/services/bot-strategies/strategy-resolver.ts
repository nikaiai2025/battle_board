/**
 * Strategy リゾルバー — resolveStrategies() の実装
 *
 * bot と profile の情報から適切な3つの Strategy を解決して返す。
 * 現時点では Phase 2 デフォルト解決のみ実装（荒らし役の3 Strategy を返す）。
 * Phase 3 / 4 の解決ルールは TODO コメントで拡張ポイントを示す。
 *
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 * See: docs/architecture/components/bot.md §2.12.8 ファイル配置計画
 */

import type { Bot } from "../../domain/models/bot";
import { RandomThreadBehaviorStrategy } from "./behavior/random-thread";
import { FixedMessageContentStrategy } from "./content/fixed-message";
import { FixedIntervalSchedulingStrategy } from "./scheduling/fixed-interval";
import type { BotProfile, BotStrategies, IThreadRepository } from "./types";

/** bot_profiles.yaml のルート型エイリアス（strategy-resolver.ts 内部用） */
type BotProfilesYaml = Record<string, BotProfile>;

/**
 * resolveStrategies のオプション引数。
 * Strategy 実装が必要とする依存関係を渡すために使用する。
 */
export interface ResolveStrategiesOptions {
	/** RandomThreadBehaviorStrategy が必要とする IThreadRepository */
	threadRepository: IThreadRepository;
	/** ボットプロファイルデータ（省略時は config/bot-profiles.ts の定数を使用）*/
	botProfiles?: BotProfilesYaml;
}

/**
 * ボットに適用する3つの Strategy を解決して返す。
 *
 * 解決の優先順位:
 *   1. bot_profiles.yaml の content_strategy / behavior_type / scheduling フィールドで明示指定
 *      TODO: Phase 3 実装時に yaml 指定の解析を追加する
 *   2. ユーザー作成ボット判定（owner_id が存在）-> 専用 Strategy 組（Phase 4）
 *      TODO: Phase 4 実装時に owner_id による分岐を追加する
 *   3. デフォルト: FixedMessageContentStrategy + RandomThreadBehaviorStrategy + FixedIntervalSchedulingStrategy
 *
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 *
 * @param _bot - ボットエンティティ（Phase 3/4 の分岐で使用予定）
 * @param _profile - bot_profiles.yaml のプロファイル（Phase 3/4 の分岐で使用予定）
 * @param options - Strategy 実装が必要とする依存関係
 * @returns 解決された BotStrategies
 */
export function resolveStrategies(
	_bot: Bot,
	_profile: BotProfile | null,
	options: ResolveStrategiesOptions,
): BotStrategies {
	// TODO: Phase 3 対応: _profile?.content_strategy === 'ai_topic' の場合 AiTopicContentStrategy を返す
	// TODO: Phase 3 対応: _profile?.behavior_type === 'create_thread' の場合 ThreadCreatorBehaviorStrategy を返す
	// TODO: Phase 4 対応: _bot.owner_id が存在する場合 UserPromptContentStrategy / ConfigurableBehaviorStrategy を返す

	// デフォルト解決: Phase 2 荒らし役の3 Strategy を返す
	// See: docs/architecture/components/bot.md §2.12.2 解決の優先順位 > 3. デフォルト
	const content = new FixedMessageContentStrategy(options.botProfiles);
	const behavior = new RandomThreadBehaviorStrategy(options.threadRepository);
	const scheduling = new FixedIntervalSchedulingStrategy();

	return { content, behavior, scheduling };
}
