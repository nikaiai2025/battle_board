/**
 * D-08 Domain Model: Bot（AIボット）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > bots
 * See: docs/requirements/ubiquitous_language.yaml #AIボット #運営ボット #HP #BOTマーク
 * See: docs/architecture/components/bot.md §5.1 bots テーブル変更
 */

/** AIボットエンティティ。運営ボットを表す。 */
export interface Bot {
	/** 内部識別子 (UUID) */
	id: string;
	/** ボット名（内部管理用。例:「荒らし役」） */
	name: string;
	/**
	 * ペルソナ定義（プロンプトテンプレート）
	 * See: docs/requirements/ubiquitous_language.yaml #ペルソナ
	 */
	persona: string;
	/** 現在HP */
	hp: number;
	/** 最大HP */
	maxHp: number;
	/** 当日の偽装日次リセットID（8文字） */
	dailyId: string;
	/** 偽装IDの発行日 (YYYY-MM-DD) */
	dailyIdDate: string;
	/** 活動中フラグ（撃破されると false） */
	isActive: boolean;
	/**
	 * BOTマーク表示中フラグ。
	 * AI告発（!tell）成功により true になる。翌日リセット。
	 * See: docs/requirements/ubiquitous_language.yaml #BOTマーク
	 */
	isRevealed: boolean;
	/** BOTマークが付与された日時 */
	revealedAt: Date | null;
	/** 生存日数 */
	survivalDays: number;
	/** 総書き込み数 */
	totalPosts: number;
	/** 被告発回数 */
	accusedCount: number;
	/**
	 * 被攻撃回数。撃破報酬計算式に使用する。
	 * 日次リセット（eliminated -> lurking）時に 0 にリセットされる。
	 * See: docs/specs/bot_state_transitions.yaml #elimination_reward
	 * See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
	 */
	timesAttacked: number;
	/**
	 * config/bot_profiles.yaml 内のプロファイルキー。
	 * 固定文リスト・報酬パラメータの参照キーとして使用する。
	 * 例: '荒らし役'
	 * See: docs/architecture/components/bot.md §5.1
	 */
	botProfileKey: string | null;
	/**
	 * 次回投稿予定時刻。
	 * 投稿完了時に NOW() + SchedulingStrategy.getNextPostDelay() で設定する。
	 * cron 起動時は WHERE is_active = true AND next_post_at <= NOW() で投稿対象を判定する。
	 * See: docs/architecture/architecture.md §13 TDR-010
	 * See: docs/architecture/components/bot.md §5.1
	 */
	nextPostAt: Date | null;
	/** 撃破日時 */
	eliminatedAt: Date | null;
	/** 撃破者の user_id */
	eliminatedBy: string | null;
	/** 作成日時 */
	createdAt: Date;
}
