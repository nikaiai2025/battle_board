/**
 * Strategy リゾルバー — resolveStrategies() の実装
 *
 * bot と profile の情報から適切な3つの Strategy を解決して返す。
 * Phase 2 デフォルト解決（荒らし役）と Phase 3 キュレーションBOT解決を実装する。
 * Phase 4 の解決ルールは TODO コメントで拡張ポイントを示す。
 *
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 * See: docs/architecture/components/bot.md §2.12.8 ファイル配置計画
 */

import type { Bot } from "../../domain/models/bot";
import type { IUserBotVocabularyRepository } from "../../infrastructure/repositories/user-bot-vocabulary-repository";
import { CandidateStockBehaviorStrategy } from "./behavior/candidate-stock";
import { RandomThreadBehaviorStrategy } from "./behavior/random-thread";
import { ThreadCreatorBehaviorStrategy } from "./behavior/thread-creator";
import { TutorialBehaviorStrategy } from "./behavior/tutorial";
import { FixedMessageContentStrategy } from "./content/fixed-message";
import { NoOpContentStrategy } from "./content/noop";
import { StoredReplyCandidateContentStrategy } from "./content/stored-reply-candidate";
import { TutorialContentStrategy } from "./content/tutorial";
import { FixedIntervalSchedulingStrategy } from "./scheduling/fixed-interval";
import { ImmediateSchedulingStrategy } from "./scheduling/immediate";
import { TopicDrivenSchedulingStrategy } from "./scheduling/topic-driven";
import type {
	BotProfile,
	BotStrategies,
	ICollectedTopicRepository,
	IReplyCandidateRepository,
	IThreadRepository,
} from "./types";

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
	/** Phase 3: ThreadCreatorBehaviorStrategy が必要とする ICollectedTopicRepository */
	collectedTopicRepository?: ICollectedTopicRepository;
	/** 人間模倣ボット用 reply_candidates リポジトリ */
	replyCandidateRepository?: IReplyCandidateRepository;
	/** ユーザー語録リポジトリ（語録プール構築に使用。省略時は固定文のみで後方互換動作） */
	vocabRepo?: IUserBotVocabularyRepository;
}

/**
 * ボットに適用する3つの Strategy を解決して返す。
 *
 * 解決の優先順位:
 *   0. チュートリアルBOT（bot_profile_key === "tutorial"）: チュートリアル専用 Strategy を返す
 *   1. Phase 3: behavior_type === 'create_thread' → NoOpContentStrategy + ThreadCreatorBehaviorStrategy + TopicDrivenSchedulingStrategy
 *   2. ユーザー作成ボット判定（owner_id が存在）-> 専用 Strategy 組（Phase 4）
 *      TODO: Phase 4 実装時に owner_id による分岐を追加する
 *   3. デフォルト: FixedMessageContentStrategy + RandomThreadBehaviorStrategy + FixedIntervalSchedulingStrategy
 *
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
 *
 * @param bot - ボットエンティティ
 * @param _profile - bot_profiles.yaml のプロファイル（Phase 3: create_thread 分岐で使用）
 * @param options - Strategy 実装が必要とする依存関係
 * @returns 解決された BotStrategies
 */
export function resolveStrategies(
	bot: Bot,
	_profile: BotProfile | null,
	options: ResolveStrategiesOptions,
): BotStrategies {
	// チュートリアルBOT判定: bot_profile_key === "tutorial" の場合はチュートリアル専用 Strategy を返す
	// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.3 resolveStrategies の拡張
	if (bot.botProfileKey === "tutorial") {
		return {
			content: new TutorialContentStrategy(),
			behavior: new TutorialBehaviorStrategy(),
			scheduling: new ImmediateSchedulingStrategy(),
		};
	}

	// Phase 3 対応: behavior_type === 'create_thread' の場合はキュレーションBOT専用 Strategy を返す
	// See: features/curation_bot.feature
	// See: docs/architecture/components/bot.md §2.13.3
	if (_profile?.behavior_type === "create_thread") {
		const collectedTopicRepo = options.collectedTopicRepository;
		if (!collectedTopicRepo) {
			throw new Error(
				"resolveStrategies: behavior_type='create_thread' には collectedTopicRepository が必要です",
			);
		}

		const minMinutes =
			_profile.scheduling?.min_interval_minutes ??
			_profile.scheduling?.min ??
			720;
		const maxMinutes =
			_profile.scheduling?.max_interval_minutes ??
			_profile.scheduling?.max ??
			1440;

		return {
			content: new NoOpContentStrategy(),
			behavior: new ThreadCreatorBehaviorStrategy(collectedTopicRepo),
			scheduling: new TopicDrivenSchedulingStrategy(minMinutes, maxMinutes),
		};
	}

	if (
		_profile?.behavior_type === "reply" &&
		_profile.content_strategy === "stored_reply_candidate"
	) {
		const replyCandidateRepo = options.replyCandidateRepository;
		if (!replyCandidateRepo) {
			throw new Error(
				"resolveStrategies: human_mimic には replyCandidateRepository が必要です",
			);
		}

		const minMinutes = _profile.scheduling?.min ?? 60;
		const maxMinutes = _profile.scheduling?.max ?? 120;

		return {
			content: new StoredReplyCandidateContentStrategy(replyCandidateRepo),
			behavior: new CandidateStockBehaviorStrategy(
				options.threadRepository,
				replyCandidateRepo,
			),
			scheduling: new FixedIntervalSchedulingStrategy(minMinutes, maxMinutes),
		};
	}

	// TODO: Phase 4 対応: bot.owner_id が存在する場合 UserPromptContentStrategy / ConfigurableBehaviorStrategy を返す

	// デフォルト解決: Phase 2 荒らし役の3 Strategy を返す
	// See: docs/architecture/components/bot.md §2.12.2 解決の優先順位 > 3. デフォルト
	// See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
	const content = new FixedMessageContentStrategy(
		options.botProfiles,
		options.vocabRepo,
	);
	const behavior = new RandomThreadBehaviorStrategy(options.threadRepository);
	const scheduling = new FixedIntervalSchedulingStrategy();

	return { content, behavior, scheduling };
}
