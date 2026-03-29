/**
 * Bot Strategy パターン — インターフェース定義
 *
 * See: docs/architecture/components/bot.md §2.12.1 Strategy インターフェース
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 *
 * 3つの関心事を独立したインターフェースとして定義する:
 *   - ContentStrategy  : 「何を書くか」を決定する
 *   - BehaviorStrategy : 「どこに書くか」を決定する
 *   - SchedulingStrategy: 「いつ書くか」を決定する
 */

// ---------------------------------------------------------------------------
// 補助型定義（Phase 3 / 4 向けの拡張ポイント）
// ---------------------------------------------------------------------------

/**
 * キュレーションBOTが収集したバズ情報。
 * See: docs/architecture/components/bot.md §2.13.5, §5.5 collected_topics
 */
export interface CollectedTopic {
	id: string;
	articleTitle: string;
	sourceUrl: string;
	buzzScore: number;
	collectedDate: string; // DATE (JST)
}

/**
 * 収集アダプターが返すバズ情報。DBに保存前の中間型（id なし）。
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.5
 */
export interface CollectedItem {
	articleTitle: string;
	sourceUrl: string;
	buzzScore: number;
}

/**
 * CollectedTopicRepository の依存インターフェース。
 * ThreadCreatorBehaviorStrategy が投稿候補を検索するために使用する。
 * collection-job.ts が収集結果を保存するために使用する。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §5.5
 */
export interface ICollectedTopicRepository {
	/**
	 * 収集結果を保存する。
	 * 同一 (source_bot_id, collected_date, source_url) のデータが既に存在する場合は
	 * INSERT をスキップする（ON CONFLICT DO NOTHING）。
	 * これにより、取得失敗時のリトライで前回データが上書きされない。
	 *
	 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
	 */
	save(
		items: CollectedItem[],
		botId: string,
		collectedDate: string,
	): Promise<void>;

	/**
	 * 指定BOT・指定日の未投稿候補を取得する。
	 * is_posted = false のレコードを返す。
	 *
	 * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
	 */
	findUnpostedByBotId(botId: string, date: string): Promise<CollectedTopic[]>;

	/**
	 * 指定トピックを投稿済みにマークする。
	 * is_posted = true, posted_at = postedAt に更新する。
	 *
	 * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
	 */
	markAsPosted(topicId: string, postedAt: Date): Promise<void>;
}

/**
 * AI対話用スレッドの直近レス情報。
 * Phase 4 実装時に詳細を追加する。
 * See: docs/architecture/components/bot.md §2.12.3 AiConversationContentStrategy
 */
export interface RecentPostSummary {
	postId: string;
	body: string;
	authorDailyId: string;
}

// ---------------------------------------------------------------------------
// BotProfile 型（bot_profiles.yaml の個別プロファイル）
// ---------------------------------------------------------------------------

/** bot_profiles.yaml の報酬セクション型 */
export interface BotProfileReward {
	base_reward: number;
	daily_bonus: number;
	attack_bonus: number;
}

/**
 * bot_profiles.yaml の個別プロファイル型。
 * v6 拡張フィールドはオプショナル（未指定時はデフォルトにフォールバック）。
 * See: docs/architecture/components/bot.md §2.12.7 bot_profiles.yaml 拡張スキーマ
 */
export interface BotProfile {
	hp: number;
	max_hp: number;
	reward: BotProfileReward;
	fixed_messages: string[];
	/** v6 拡張: コンテンツ生成方式（未指定時は 'fixed_message'。create_thread 系は不使用）*/
	content_strategy?: "fixed_message" | "ai_conversation";
	/** v6 拡張: 行動パターン（未指定時は 'random_thread'）*/
	behavior_type?: "random_thread" | "create_thread" | "reply";
	/** v6 拡張: スケジュール設定（未指定時は fixed_interval）*/
	scheduling?: {
		type: string;
		/** 既存フィールド（後方互換）*/
		min?: number;
		/** 既存フィールド（後方互換）*/
		max?: number;
		/** Phase 3 追加: 最小投稿間隔（分）。キュレーションBOT用 */
		min_interval_minutes?: number;
		/** Phase 3 追加: 最大投稿間隔（分）。キュレーションBOT用 */
		max_interval_minutes?: number;
	};
	/** Phase 3 追加: 収集設定（キュレーションBOT用）*/
	collection?: {
		/** 収集アダプター識別子（例: 'subject_txt'）*/
		adapter: string;
		/** 収集元URL */
		source_url: string;
		/** 月次収集フラグ（未指定時は日次）*/
		monthly?: boolean;
	};
}

// ---------------------------------------------------------------------------
// ContentStrategy — 「何を書くか」を決定する
// ---------------------------------------------------------------------------

/**
 * コンテンツ生成戦略のコンテキスト。
 * See: docs/architecture/components/bot.md §2.12.1 ContentGenerationContext
 */
export interface ContentGenerationContext {
	botId: string;
	botProfileKey: string | null;
	threadId: string;
	/** キュレーションBOT用: 収集済みのネタ情報（Phase 3）*/
	collectedTopic?: CollectedTopic;
	/** AI対話用: スレッドの直近レス（Phase 4）*/
	recentPosts?: RecentPostSummary[];
	/** ユーザー作成ボット用: サニタイズ済みプロンプト（Phase 4）*/
	sanitizedUserPrompt?: string;
	/** チュートリアルBOT用: ターゲットレス番号（Phase C）*/
	tutorialTargetPostNumber?: number;
}

/**
 * コンテンツ生成戦略インターフェース。
 * 「何を書くか」を決定する。
 * See: docs/architecture/components/bot.md §2.12.1 ContentStrategy
 */
export interface ContentStrategy {
	generateContent(context: ContentGenerationContext): Promise<string>;
}

// ---------------------------------------------------------------------------
// BehaviorStrategy — 「どこに書くか」を決定する
// ---------------------------------------------------------------------------

/**
 * 行動パターン戦略のコンテキスト。
 * See: docs/architecture/components/bot.md §2.12.1 BehaviorContext
 */
export interface BehaviorContext {
	botId: string;
	botProfileKey: string | null;
	boardId: string;
	/** チュートリアルBOT用: ターゲットスレッドID（Phase C）*/
	tutorialThreadId?: string;
}

/**
 * ボットの行動を表す判別共用体。
 * See: docs/architecture/components/bot.md §2.11 BotAction
 */
export type BotAction =
	| { type: "post_to_existing"; threadId: string }
	| {
			type: "create_thread";
			title: string;
			body: string;
			/** Phase 3: ThreadCreatorBehaviorStrategy が markAsPosted の遅延呼び出しのために返す内部フィールド */
			_selectedTopicId?: string;
	  }
	| { type: "skip" }; // 投稿候補なし（キュレーションBOTのデータ枯渇時等）

/**
 * 行動パターン戦略インターフェース。
 * 「どこに書くか」を決定する。
 * See: docs/architecture/components/bot.md §2.12.1 BehaviorStrategy
 */
export interface BehaviorStrategy {
	decideAction(context: BehaviorContext): Promise<BotAction>;
}

// ---------------------------------------------------------------------------
// SchedulingStrategy — 「いつ書くか」を決定する
// ---------------------------------------------------------------------------

/**
 * スケジュール戦略のコンテキスト。
 * See: docs/architecture/components/bot.md §2.12.1 SchedulingContext
 */
export interface SchedulingContext {
	botId: string;
	botProfileKey: string | null;
}

/**
 * スケジュール戦略インターフェース。
 * 「いつ書くか」を決定する。
 * See: docs/architecture/components/bot.md §2.12.1 SchedulingStrategy
 */
export interface SchedulingStrategy {
	/** 次回書き込みまでの遅延時間を分単位で返す */
	getNextPostDelay(context: SchedulingContext): number;
}

// ---------------------------------------------------------------------------
// IThreadRepository — スレッド取得リポジトリ（DI用）
// ---------------------------------------------------------------------------

/**
 * ThreadRepository の依存インターフェース（最小）。
 * selectTargetThread でボット書き込み先スレッド選択に使用する。
 * Strategy 実装（RandomThreadBehaviorStrategy）が依存するため、
 * 逆依存を避けるために bot-service.ts ではなく types.ts に配置する。
 *
 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
 */
export interface IThreadRepository {
	findByBoardId(
		boardId: string,
		options?: { limit?: number },
	): Promise<{ id: string; isPinned?: boolean }[]>;
}

// ---------------------------------------------------------------------------
// BotStrategies — 3つの Strategy をまとめる型
// ---------------------------------------------------------------------------

/**
 * ボットに適用される3つの Strategy をまとめた型。
 * resolveStrategies の返り値として使用する。
 * See: docs/architecture/components/bot.md §2.12.2 BotStrategies
 */
export interface BotStrategies {
	content: ContentStrategy;
	behavior: BehaviorStrategy;
	scheduling: SchedulingStrategy;
}
