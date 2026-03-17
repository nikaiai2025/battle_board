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
 * ネタ師用の収集済みネタ情報。
 * Phase 3 実装時に詳細を追加する。
 * See: docs/architecture/components/bot.md §2.12.5 ネタ師の行動フロー
 */
export interface CollectedTopic {
	id: string;
	generatedTitle: string;
	generatedBody: string;
	genre: string;
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
	/** v6 拡張: コンテンツ生成方式（未指定時は 'fixed_message'）*/
	content_strategy?: "fixed_message" | "ai_topic" | "ai_conversation";
	/** v6 拡張: 行動パターン（未指定時は 'random_thread'）*/
	behavior_type?: "random_thread" | "create_thread" | "reply";
	/** v6 拡張: スケジュール設定（未指定時は fixed_interval）*/
	scheduling?: {
		type: string;
		min?: number;
		max?: number;
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
	/** ネタ師用: 収集済みのネタ情報（Phase 3）*/
	collectedTopic?: CollectedTopic;
	/** AI対話用: スレッドの直近レス（Phase 4）*/
	recentPosts?: RecentPostSummary[];
	/** ユーザー作成ボット用: サニタイズ済みプロンプト（Phase 4）*/
	sanitizedUserPrompt?: string;
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
}

/**
 * ボットの行動を表す判別共用体。
 * See: docs/architecture/components/bot.md §2.11 BotAction
 */
export type BotAction =
	| { type: "post_to_existing"; threadId: string }
	| { type: "create_thread"; title: string; body: string };

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
