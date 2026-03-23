/**
 * BotService — AIボットシステムのサービス層
 *
 * See: features/bot_system.feature
 * See: docs/architecture/components/bot.md §2 公開インターフェース
 * See: docs/specs/bot_state_transitions.yaml
 *
 * 責務:
 *   - ボットの HP 管理・ダメージ処理・撃破
 *   - BOTマーク付与（revealBot）
 *   - 日次攻撃制限チェック（canAttackToday）・攻撃記録（recordAttack）
 *   - 撃破報酬計算（calculateEliminationReward）
 *   - 日次リセット処理（performDailyReset）
 *   - 正体判定（isBot）・ボット情報逆引き（getBotByPostId）
 *
 * 設計方針:
 *   - AttackHandler からの呼び出しを想定した「ボット側の操作 API」として設計する
 *   - CurrencyService には依存しない（撃破報酬付与は AttackHandler が行う）
 *   - bot_profiles.yaml の読み込みはコンストラクタで行い、キャッシュする
 *   - v6: executeBotPost / selectTargetThread / getNextPostDelay を Strategy 委譲に変更
 *         See: docs/architecture/components/bot.md §2.12 Strategy パターン設計
 */

import { selectRandomTaunt } from "../../../config/aori-taunts";
import { botProfilesConfig } from "../../../config/bot-profiles";
import { DEFAULT_BOARD_ID } from "../domain/constants";
import type { Bot } from "../domain/models/bot";
import {
	calculateEliminationReward,
	type RewardParams,
} from "../domain/rules/elimination-reward";
import type { Attack } from "../infrastructure/repositories/attack-repository";
import { resolveStrategies as defaultResolveStrategies } from "./bot-strategies/strategy-resolver";
import type {
	BehaviorContext,
	BotProfile,
	BotStrategies,
	ContentGenerationContext,
	IThreadRepository,
	SchedulingContext,
} from "./bot-strategies/types";

// IThreadRepository は types.ts からインポートし、後方互換のため re-export する
// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
export type { IThreadRepository };

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * HP更新・ダメージ処理の結果型。
 * See: docs/architecture/components/bot.md §2.2 DamageResult
 */
export interface DamageResult {
	/** ダメージ適用前の HP */
	previousHp: number;
	/** ダメージ適用後の HP */
	remainingHp: number;
	/** 撃破されたかどうか */
	eliminated: boolean;
	/** 撃破者のユーザーID（非撃破時は null） */
	eliminatedBy: string | null;
	/** 撃破報酬額（非撃破時は null） */
	reward: number | null;
}

/**
 * ボット情報型（getBotByPostId の返り値）。
 * See: docs/architecture/components/bot.md §2.4 BotInfo
 */
export interface BotInfo {
	botId: string;
	name: string;
	hp: number;
	maxHp: number;
	isActive: boolean;
	isRevealed: boolean;
	survivalDays: number;
	totalPosts: number;
	accusedCount: number;
	timesAttacked: number;
}

/**
 * 日次リセット処理の結果型。
 * See: docs/architecture/components/bot.md §2.10 DailyResetResult
 */
export interface DailyResetResult {
	/** lurking に戻したボット数（revealed -> lurking） */
	botsRevealed: number;
	/** lurking に復活させたボット数（eliminated -> lurking） */
	botsRevived: number;
	/** 偽装ID再生成したボット数 */
	idsRegenerated: number;
}

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * BotRepository の依存インターフェース。
 * BotService が使用する最小限のインターフェース。
 */
export interface IBotRepository {
	findById(id: string): Promise<Bot | null>;
	findAll(): Promise<Bot[]>;
	updateHp(botId: string, hp: number): Promise<void>;
	eliminate(botId: string, eliminatedBy: string): Promise<void>;
	reveal(botId: string): Promise<void>;
	incrementTimesAttacked(botId: string): Promise<void>;
	incrementSurvivalDays(botId: string): Promise<void>;
	/**
	 * ボットの総書き込み数（total_posts）を 1 インクリメントする。
	 * executeBotPost の bot_posts INSERT 成功直後に呼び出す。
	 * See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
	 */
	incrementTotalPosts(botId: string): Promise<void>;
	/**
	 * ボットの被告発回数（accused_count）を 1 インクリメントする。
	 * AccusationService.accuse() の告発成功（isBot=true）後に呼び出す。
	 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
	 */
	incrementAccusedCount(botId: string): Promise<void>;
	updateDailyId(
		botId: string,
		dailyId: string,
		dailyIdDate: string,
	): Promise<void>;
	bulkResetRevealed(): Promise<number>;
	bulkReviveEliminated(): Promise<number>;
	/**
	 * 撃破済みチュートリアルBOT および7日経過の未撃破チュートリアルBOTを削除する。
	 * performDailyReset() の末尾で呼び出す。
	 * See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
	 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.8
	 */
	deleteEliminatedTutorialBots(): Promise<number>;
	/**
	 * 掲示板全体の生存BOT数をカウントする。
	 * See: features/command_livingbot.feature
	 * See: tmp/workers/bdd-architect_277/livingbot_design.md §1.3
	 */
	countLivingBots(): Promise<number>;
	/**
	 * 次回投稿予定時刻を更新する。
	 * See: docs/architecture/architecture.md §13 TDR-010
	 */
	updateNextPostAt(botId: string, nextPostAt: Date): Promise<void>;
	/**
	 * 投稿対象のBOT一覧を取得する（is_active=true AND next_post_at <= NOW()）。
	 * See: docs/architecture/architecture.md §13 TDR-010
	 */
	findDueForPost(): Promise<Bot[]>;
	/**
	 * 新規ボットを作成する。
	 * processPendingTutorials でチュートリアルBOTのスポーン時に使用する。
	 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
	 */
	create(
		bot: Omit<
			Bot,
			| "id"
			| "createdAt"
			| "survivalDays"
			| "totalPosts"
			| "accusedCount"
			| "timesAttacked"
			| "eliminatedAt"
			| "eliminatedBy"
		>,
	): Promise<Bot>;
}

/**
 * BotPostRepository の依存インターフェース。
 * isBot 判定・ボット情報逆引き・ボット書き込み紐付け INSERT に使用する。
 */
export interface IBotPostRepository {
	findByPostId(
		postId: string,
	): Promise<{ postId: string; botId: string } | null>;
	/** ボット書き込み紐付けレコードを作成する（executeBotPost で使用）。 */
	create(postId: string, botId: string): Promise<void>;
}

/**
 * PostService.createPost の関数型（DI用）。
 * BotService は PostService モジュール全体に依存せず、関数参照のみ受け取る。
 *
 * See: docs/architecture/components/bot.md §2.1 書き込み実行
 * See: src/lib/services/post-service.ts > createPost
 */
export type CreatePostFn = (input: {
	threadId: string;
	body: string;
	edgeToken: string | null;
	ipHash: string;
	displayName?: string;
	isBotWrite: boolean;
	/** BOT書き込み時のコマンド実行用ユーザーID（botId をそのまま使用）。PostInput.botUserId に対応。 */
	botUserId?: string;
}) => Promise<
	| { success: true; postId: string; postNumber: number; systemMessages: [] }
	| { success: false; error: string; code: string }
	| { authRequired: true; code: string; edgeToken: string }
>;

/**
 * AttackRepository の依存インターフェース。
 * 攻撃記録・1日1回制限チェックに使用する。
 */
export interface IAttackRepository {
	findByAttackerAndBotAndDate(
		attackerId: string,
		botId: string,
		attackDate: string,
	): Promise<Attack | null>;
	create(attack: Omit<Attack, "id" | "createdAt">): Promise<Attack>;
	deleteByDateBefore(beforeDate: string): Promise<number>;
}

/**
 * PendingTutorialRepository の依存インターフェース。
 * チュートリアルBOTスポーン待ちキューの取得・削除に使用する。
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
 */
export interface IPendingTutorialRepository {
	findAll(): Promise<
		Array<{
			id: string;
			userId: string;
			threadId: string;
			triggerPostNumber: number;
			createdAt: Date;
		}>
	>;
	deletePendingTutorial(id: string): Promise<void>;
}

/**
 * チュートリアルBOTスポーン処理の個別結果型。
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
 */
export interface TutorialResult {
	pendingId: string;
	success: boolean;
	botId?: string;
	postId?: string;
	postNumber?: number;
	error?: string;
}

/**
 * PendingAsyncCommandRepository の依存インターフェース。
 * processAoriCommands で使用する。
 * See: features/command_aori.feature
 */
export interface IPendingAsyncCommandRepository {
	findByCommandType(commandType: string): Promise<
		Array<{
			id: string;
			commandType: string;
			threadId: string;
			targetPostNumber: number;
			invokerUserId: string;
			payload: Record<string, unknown> | null;
			createdAt: Date;
		}>
	>;
	deletePendingAsyncCommand(id: string): Promise<void>;
}

/**
 * DailyEventRepository の依存インターフェース。
 * checkLastBotBonus で使用する。
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §3.4
 */
export interface IDailyEventRepository {
	existsForToday(eventType: string, dateJst: string): Promise<boolean>;
	create(
		eventType: string,
		dateJst: string,
		triggeredBy: string,
	): Promise<{ id: string }>;
}

/**
 * 煽りBOT Cron 処理の個別結果型。
 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
 */
export interface AoriResult {
	pendingId: string;
	success: boolean;
	botId?: string;
	postId?: string;
	error?: string;
}

/**
 * Strategy 解決関数の型（DI用）。
 * テスト時にモックの Strategy を注入するために使用する。
 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
 */
export type ResolveStrategiesFn = (
	bot: Bot,
	profile: BotProfile | null,
	options: {
		threadRepository: IThreadRepository;
		botProfiles?: BotProfilesYaml;
	},
) => BotStrategies;

// ---------------------------------------------------------------------------
// bot_profiles.yaml 型定義
// ---------------------------------------------------------------------------

/**
 * bot_profiles.yaml のルート型。
 * 個別プロファイルの型は bot-strategies/types.ts の BotProfile を使用する。
 * config/bot-profiles.ts からも参照できるよう export する。
 * See: docs/architecture/components/bot.md §2.12.7 bot_profiles.yaml 拡張スキーマ
 */
export type BotProfilesYaml = Record<string, BotProfile>;

// ---------------------------------------------------------------------------
// デフォルト報酬パラメータ（bot_profiles.yaml に値がない場合のフォールバック）
// ---------------------------------------------------------------------------

/** 荒らし役デフォルトの報酬パラメータ。 */
const DEFAULT_REWARD_PARAMS: RewardParams = {
	baseReward: 10,
	dailyBonus: 50,
	attackBonus: 5,
};

// ---------------------------------------------------------------------------
// BotService クラス
// ---------------------------------------------------------------------------

/**
 * BotService — AIボットシステムの統括サービス。
 *
 * AttackHandler からの呼び出しを受け付ける「ボット側の操作 API」。
 * CurrencyService には依存しない（撃破報酬付与は AttackHandler が行う）。
 *
 * v6 以降、executeBotPost / selectTargetThread / getNextPostDelay は
 * Strategy パターンに委譲する（TDR-008）。
 *
 * See: features/bot_system.feature
 * See: docs/architecture/components/bot.md §2 公開インターフェース
 * See: docs/architecture/components/bot.md §6.4 CurrencyService への撃破報酬付与の責務配置
 * See: docs/architecture/components/bot.md §2.12 Strategy パターン設計
 */
export class BotService {
	/** bot_profiles.yaml の解析済みデータ（キャッシュ） */
	private readonly botProfiles: BotProfilesYaml;

	/**
	 * @param botRepository - ボット情報の CRUD（DI）
	 * @param botPostRepository - ボット書き込み紐付けの検索・INSERT（DI）
	 * @param attackRepository - 攻撃記録の管理（DI）
	 * @param botProfiles - ボットプロファイルデータ（省略時は config/bot-profiles.ts の定数を使用）
	 *   テスト時は DI でモックデータを注入可能。
	 *   See: docs/architecture/components/bot.md §4 隠蔽する実装詳細 > 撃破報酬パラメータのconfig読み込みとキャッシュ戦略
	 * @param threadRepository - スレッド一覧取得（DI・省略可）
	 * @param createPostFn - PostService.createPost の関数参照（DI・省略可）
	 * @param resolveStrategiesFn - Strategy 解決関数（DI・省略時はデフォルト resolveStrategies）
	 *   テスト時にモックの Strategy を注入するために使用する。
	 *   See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
	 * @param pendingTutorialRepository - チュートリアルBOTスポーン待ちキュー（DI・省略可）
	 *   See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	 * @param pendingAsyncCommandRepository - 非同期コマンドキュー（DI・省略可）
	 *   See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
	 * @param dailyEventRepository - 日次イベントリポジトリ（DI・省略可）
	 *   See: features/command_livingbot.feature @ラストボットボーナス
	 */
	constructor(
		private readonly botRepository: IBotRepository,
		private readonly botPostRepository: IBotPostRepository,
		private readonly attackRepository: IAttackRepository,
		private readonly botProfilesData?: BotProfilesYaml,
		private readonly threadRepository?: IThreadRepository,
		private readonly createPostFn?: CreatePostFn,
		private readonly resolveStrategiesFn?: ResolveStrategiesFn,
		private readonly pendingTutorialRepository?: IPendingTutorialRepository,
		private readonly pendingAsyncCommandRepository?: IPendingAsyncCommandRepository,
		private readonly dailyEventRepository?: IDailyEventRepository,
	) {
		// ボットプロファイルデータをキャッシュする
		// Cloudflare Workers 環境では fs.readFileSync が使えないため、
		// config/bot-profiles.ts の TS 定数をデフォルト値として使用する。
		// See: docs/architecture/components/bot.md §4 隠蔽する実装詳細 > 撃破報酬パラメータのconfig読み込みとキャッシュ戦略
		this.botProfiles = botProfilesData ?? botProfilesConfig;
	}

	// ---------------------------------------------------------------------------
	// 投稿対象BOT取得（TDR-010）
	// ---------------------------------------------------------------------------

	/**
	 * 投稿対象のBOT一覧を取得する。
	 *
	 * is_active = true かつ next_post_at <= NOW() の条件で絞り込む。
	 * Internal API の POST /api/internal/bot/execute から呼ばれる。
	 *
	 * See: docs/architecture/architecture.md §13 TDR-010
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行
	 *
	 * @returns 投稿対象のボット配列
	 */
	async getActiveBotsDueForPost(): Promise<Bot[]> {
		return this.botRepository.findDueForPost();
	}

	// ---------------------------------------------------------------------------
	// §2.3 正体判定
	// ---------------------------------------------------------------------------

	/**
	 * 指定した postId の書き込みがボットのものかどうかを判定する。
	 *
	 * bot_posts に postId のレコードが存在するかを検索する。
	 * AccusationService・AttackHandler はこのメソッドを通じてのみボット判定を行う。
	 *
	 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
	 * See: docs/architecture/components/bot.md §2.3 正体判定
	 *
	 * @param postId - 判定対象のレスID
	 * @returns ボットの書き込みであれば true
	 */
	async isBot(postId: string): Promise<boolean> {
		const record = await this.botPostRepository.findByPostId(postId);
		return record !== null;
	}

	// ---------------------------------------------------------------------------
	// §2.4 ボットID逆引き
	// ---------------------------------------------------------------------------

	/**
	 * postId からボット情報を逆引きする。
	 *
	 * bot_posts -> bots を結合して対象ボットの全情報を返す。
	 * isBot() が true の場合に攻撃処理で必要なボット情報を取得するために使用する。
	 *
	 * See: docs/architecture/components/bot.md §2.4 ボットID逆引き
	 *
	 * @param postId - 対象レスID
	 * @returns BotInfo、または存在しない場合は null
	 */
	async getBotByPostId(postId: string): Promise<BotInfo | null> {
		const record = await this.botPostRepository.findByPostId(postId);
		if (!record) return null;

		const bot = await this.botRepository.findById(record.botId);
		if (!bot) return null;

		return {
			botId: bot.id,
			name: bot.name,
			hp: bot.hp,
			maxHp: bot.maxHp,
			isActive: bot.isActive,
			isRevealed: bot.isRevealed,
			survivalDays: bot.survivalDays,
			totalPosts: bot.totalPosts,
			accusedCount: bot.accusedCount,
			timesAttacked: bot.timesAttacked,
		};
	}

	// ---------------------------------------------------------------------------
	// §2.6 BOTマーク付与
	// ---------------------------------------------------------------------------

	/**
	 * ボットに BOTマークを付与する（lurking -> revealed）。
	 *
	 * 既に revealed の場合は何もしない（冪等）。
	 * !attack による不意打ち成功時、または !tell 成功時に呼ばれる。
	 *
	 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
	 * See: docs/architecture/components/bot.md §2.6 BOTマーク付与
	 *
	 * @param botId - ボットID
	 */
	async revealBot(botId: string): Promise<void> {
		const bot = await this.botRepository.findById(botId);
		if (!bot) {
			throw new Error(
				`BotService.revealBot: ボットが見つかりません (botId=${botId})`,
			);
		}

		// 冪等: 既に revealed なら何もしない
		if (bot.isRevealed) return;

		await this.botRepository.reveal(botId);
	}

	// ---------------------------------------------------------------------------
	// §2.2 HP更新・ダメージ処理
	// ---------------------------------------------------------------------------

	/**
	 * ボットにダメージを与え、HP を減少させる。
	 *
	 * HP <= 0 になった場合は撃破処理を実行し、撃破報酬を計算して返す。
	 * CurrencyService への報酬付与は AttackHandler 側で行う（循環依存回避）。
	 *
	 * See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
	 * See: docs/architecture/components/bot.md §2.2 HP更新・ダメージ処理
	 * See: docs/architecture/components/bot.md §6.4 CurrencyService への撃破報酬付与の責務配置
	 *
	 * @param botId - ボットID
	 * @param damage - 与えるダメージ量
	 * @param attackerId - 攻撃者のユーザーID
	 * @returns ダメージ処理結果
	 */
	async applyDamage(
		botId: string,
		damage: number,
		attackerId: string,
	): Promise<DamageResult> {
		const bot = await this.botRepository.findById(botId);
		if (!bot) {
			throw new Error(
				`BotService.applyDamage: ボットが見つかりません (botId=${botId})`,
			);
		}

		const previousHp = bot.hp;
		const remainingHp = previousHp - damage;

		// times_attacked を +1（撃破報酬計算で使用するため先に実行）
		// See: docs/architecture/components/bot.md §2.2 処理: 3. times_attacked を +1
		await this.botRepository.incrementTimesAttacked(botId);
		const newTimesAttacked = bot.timesAttacked + 1;

		if (remainingHp <= 0) {
			// 撃破処理
			// See: docs/specs/bot_state_transitions.yaml #transitions > revealed -> eliminated
			await this.botRepository.updateHp(botId, 0);
			await this.botRepository.eliminate(botId, attackerId);

			// 撃破報酬を計算（incrementTimesAttacked 後の値を使用）
			const rewardParams = this.getRewardParams(bot.botProfileKey);
			const reward = calculateEliminationReward(
				{ survivalDays: bot.survivalDays, timesAttacked: newTimesAttacked },
				rewardParams,
			);

			return {
				previousHp,
				remainingHp: 0,
				eliminated: true,
				eliminatedBy: attackerId,
				reward,
			};
		}

		// HP 減少（撃破なし）
		await this.botRepository.updateHp(botId, remainingHp);

		return {
			previousHp,
			remainingHp,
			eliminated: false,
			eliminatedBy: null,
			reward: null,
		};
	}

	// ---------------------------------------------------------------------------
	// §2.7 撃破報酬計算
	// ---------------------------------------------------------------------------

	/**
	 * 指定ボットの撃破報酬を計算する。
	 *
	 * bot_profiles.yaml のプロファイルキーからパラメータを取得して計算する。
	 * See: docs/architecture/components/bot.md §2.7 撃破報酬計算
	 * See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
	 *
	 * @param botId - ボットID
	 * @returns 撃破報酬額
	 */
	async calculateEliminationReward(botId: string): Promise<number> {
		const bot = await this.botRepository.findById(botId);
		if (!bot) {
			throw new Error(
				`BotService.calculateEliminationReward: ボットが見つかりません (botId=${botId})`,
			);
		}

		const rewardParams = this.getRewardParams(bot.botProfileKey);
		return calculateEliminationReward(
			{ survivalDays: bot.survivalDays, timesAttacked: bot.timesAttacked },
			rewardParams,
		);
	}

	// ---------------------------------------------------------------------------
	// §2.8 攻撃制限チェック
	// ---------------------------------------------------------------------------

	/**
	 * 同一ユーザーが同一ボットに本日既に攻撃済みかどうかを判定する。
	 *
	 * attacks テーブルを参照して 1日1回制限をチェックする。
	 * JST 日付（YYYY-MM-DD）で管理する。
	 *
	 * See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
	 * See: docs/architecture/components/bot.md §2.8 攻撃制限チェック
	 * See: docs/specs/bot_state_transitions.yaml #attack_limits
	 *
	 * @param attackerId - 攻撃者のユーザーID
	 * @param botId - 攻撃対象ボットID
	 * @returns 本日未攻撃なら true（攻撃可能）、攻撃済みなら false
	 */
	async canAttackToday(attackerId: string, botId: string): Promise<boolean> {
		const today = this.getTodayJst();
		const existing = await this.attackRepository.findByAttackerAndBotAndDate(
			attackerId,
			botId,
			today,
		);
		return existing === null;
	}

	// ---------------------------------------------------------------------------
	// §2.9 攻撃記録
	// ---------------------------------------------------------------------------

	/**
	 * 攻撃記録を attacks テーブルに INSERT する。
	 *
	 * 1日1回攻撃制限の管理に使用。
	 * See: docs/architecture/components/bot.md §2.9 攻撃記録
	 *
	 * @param attackerId - 攻撃者のユーザーID
	 * @param botId - 攻撃対象ボットID
	 * @param postId - 攻撃が含まれたレスID（コマンド実行時点でレス未作成のため null の場合がある）
	 * @param damage - 与ダメージ
	 */
	async recordAttack(
		attackerId: string,
		botId: string,
		postId: string | null,
		damage: number,
	): Promise<void> {
		const today = this.getTodayJst();
		await this.attackRepository.create({
			attackerId,
			botId,
			attackDate: today,
			postId,
			damage,
		});
	}

	// ---------------------------------------------------------------------------
	// §ラストボットボーナス判定
	// See: features/command_livingbot.feature @ラストボットボーナス
	// See: tmp/workers/bdd-architect_277/livingbot_design.md §3.5
	// ---------------------------------------------------------------------------

	/**
	 * ラストボットボーナスの発火条件を判定する。
	 *
	 * 発火条件:
	 *   1. countLivingBots() === 0（全BOT撃破後）
	 *   2. 当日のラストボットボーナスが未発生（1日1回制限）
	 *
	 * See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
	 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
	 *
	 * @param attackerId - 撃破者のユーザーID
	 * @returns triggered=true の場合はラストボットボーナスを付与すべき
	 */
	async checkLastBotBonus(attackerId: string): Promise<{ triggered: boolean }> {
		if (!this.dailyEventRepository) {
			return { triggered: false };
		}

		const livingCount = await this.botRepository.countLivingBots();
		if (livingCount > 0) return { triggered: false };

		const today = this.getTodayJst();
		const alreadyTriggered = await this.dailyEventRepository.existsForToday(
			"last_bot_bonus",
			today,
		);
		if (alreadyTriggered) return { triggered: false };

		await this.dailyEventRepository.create("last_bot_bonus", today, attackerId);
		return { triggered: true };
	}

	// ---------------------------------------------------------------------------
	// §2.10 日次リセット処理
	// ---------------------------------------------------------------------------

	/**
	 * 日次リセット処理を実行する（JST 0:00 に GitHub Actions から呼ばれる）。
	 *
	 * 処理内容:
	 *   1. 全ボットの偽装 ID を再生成
	 *   2. revealed -> lurking（BOTマーク解除）
	 *   3. lurking/revealed ボットの survival_days +1
	 *   4. eliminated -> lurking（HP 復帰・survival_days=0・times_attacked=0）
	 *   5. attacks テーブルの前日分レコードをクリーンアップ
	 *
	 * See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
	 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
	 * See: docs/specs/bot_state_transitions.yaml #daily_reset
	 *
	 * @returns リセット処理の結果サマリー
	 */
	async performDailyReset(): Promise<DailyResetResult> {
		const today = this.getTodayJst();

		// Step 1: 全ボットを取得して偽装 ID を再生成
		const allBots = await this.botRepository.findAll();
		let idsRegenerated = 0;

		for (const bot of allBots) {
			const newDailyId = this.generateFakeDailyId();
			await this.botRepository.updateDailyId(bot.id, newDailyId, today);
			idsRegenerated++;
		}

		// Step 2: revealed -> lurking（BOTマーク一括解除）
		// See: docs/specs/bot_state_transitions.yaml #daily_reset > revealed -> lurking
		const botsRevealed = await this.botRepository.bulkResetRevealed();

		// Step 3: lurking/revealed ボット（is_active=true）の survival_days +1
		// eliminated（is_active=false）は +1 しない
		// See: docs/specs/bot_state_transitions.yaml #daily_reset
		for (const bot of allBots) {
			if (bot.isActive) {
				await this.botRepository.incrementSurvivalDays(bot.id);
			}
		}

		// Step 4: eliminated -> lurking（HP 復帰・survival_days=0・times_attacked=0）
		// See: docs/specs/bot_state_transitions.yaml #transitions > eliminated -> lurking
		const botsRevived = await this.botRepository.bulkReviveEliminated();

		// Step 4.5: 復活したBOTの next_post_at を再設定（TDR-010）
		// 復活したBOTは next_post_at を再設定して投稿サイクルを再開する。
		// bulkReviveEliminated は内部でBOTを復活させるが、next_post_at は更新しないため
		// ここで改めて設定する。
		// See: docs/architecture/architecture.md §13 TDR-010 > 撃破との整合性
		// See: docs/architecture/components/bot.md §2.10 日次リセット処理
		if (botsRevived > 0) {
			// 復活したBOTを再取得して next_post_at を設定する
			const allBotsAfterRevive = await this.botRepository.findAll();
			for (const bot of allBotsAfterRevive) {
				// 復活したBOT = is_active=true かつ survival_days=0 かつ
				// 元のallBots取得時にis_active=falseだったBOT
				const wasEliminated = allBots.some(
					(original) => original.id === bot.id && !original.isActive,
				);
				if (wasEliminated && bot.isActive) {
					const delayMinutes = this.getNextPostDelay(bot.id, bot.botProfileKey);
					const nextPostAt = new Date(Date.now() + delayMinutes * 60 * 1000);
					await this.botRepository.updateNextPostAt(bot.id, nextPostAt);
				}
			}
		}

		// Step 5: attacks テーブルの前日分レコードをクリーンアップ
		// 当日以前のレコードを削除する（今日の攻撃記録は維持）
		// See: docs/specs/bot_state_transitions.yaml #daily_reset > attacks テーブル
		await this.attackRepository.deleteByDateBefore(today);

		// Step 6: 撃破済みチュートリアルBOTのクリーンアップ
		// 撃破済みチュートリアルBOTおよび7日経過の未撃破チュートリアルBOTを削除する。
		// See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
		// See: tmp/workers/bdd-architect_TASK-236/design.md §3.8
		await this.botRepository.deleteEliminatedTutorialBots();

		return {
			botsRevealed,
			botsRevived,
			idsRegenerated,
		};
	}

	// ---------------------------------------------------------------------------
	// §2.1 書き込み実行
	// ---------------------------------------------------------------------------

	/**
	 * ボットに書き込みを実行させる（Strategy 委譲版 v6）。
	 *
	 * 処理フロー（Strategy 委譲版）:
	 *   1. resolveStrategies() で3つの Strategy を解決
	 *   2. behavior.decideAction(context) で投稿先を決定（BotAction を取得）
	 *      - threadId 引数が渡された場合は後方互換として post_to_existing に固定
	 *   3. BotAction.type に応じて分岐:
	 *      - post_to_existing: content.generateContent(context) で本文生成 -> PostService.createPost
	 *      - create_thread: BehaviorStrategy が返した title/body を使用 -> PostService.createThread（Phase 3以降）
	 *   4. 成功したら botPostRepository.create(postId, botId) で紐付け INSERT
	 *   5. { postId, postNumber, dailyId } を返す
	 *
	 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行（Strategy 委譲版）
	 * See: docs/architecture/components/bot.md §2.12 Strategy パターン設計
	 *
	 * @param botId - ボットID
	 * @param threadId - 書き込み先スレッドID（省略時は BehaviorStrategy が決定）
	 * @param contextOverrides - チュートリアルBOT用コンテキストオーバーライド（省略可）
	 *   See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	 *   See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
	 * @returns 書き込み結果
	 */
	async executeBotPost(
		botId: string,
		threadId?: string,
		contextOverrides?: {
			tutorialTargetPostNumber?: number;
			tutorialThreadId?: string;
		},
	): Promise<{
		postId: string;
		postNumber: number;
		dailyId: string;
	} | null> {
		if (!this.createPostFn) {
			throw new Error(
				"executeBotPost: createPostFn が未注入です。コンストラクタに PostService.createPost を渡してください",
			);
		}

		// Step 1: ボット情報取得
		const bot = await this.botRepository.findById(botId);
		if (!bot) {
			throw new Error(
				`BotService.executeBotPost: ボットが見つかりません (botId=${botId})`,
			);
		}

		// Step 1.5: next_post_at 判定（TDR-010: cron駆動時の投稿対象フィルタリング）
		// next_post_at が設定されていて、まだ投稿予定時刻に達していなければスキップする。
		// See: docs/architecture/architecture.md §13 TDR-010
		// See: docs/architecture/components/bot.md §2.1 書き込み実行
		if (bot.nextPostAt !== null && bot.nextPostAt.getTime() > Date.now()) {
			return null;
		}

		// Step 2: bot_profiles.yaml からプロファイルを取得
		const profile = this.getBotProfileForStrategy(bot.botProfileKey);

		// Step 3: resolveStrategies() で3つの Strategy を解決
		// See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
		const strategies = this.resolveStrategiesForBot(bot, profile);

		// Step 4: BehaviorStrategy で投稿先を決定
		// threadId 引数が渡された場合は後方互換として post_to_existing に固定する
		// See: docs/architecture/components/bot.md §2.1 > 外部インターフェースの互換性
		let resolvedThreadId: string;

		if (threadId !== undefined) {
			// 後方互換: 呼び出し元が threadId を指定した場合はそちらを優先
			resolvedThreadId = threadId;
		} else {
			// v6 新規フロー: BehaviorStrategy に投稿先を委譲する
			// See: docs/architecture/components/bot.md §2.1 Strategy 委譲版フロー
			// チュートリアルBOT用: contextOverrides.tutorialThreadId が指定されていればBehaviorContextに渡す
			// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
			const behaviorContext: BehaviorContext = {
				botId,
				botProfileKey: bot.botProfileKey,
				boardId: DEFAULT_BOARD_ID,
				...(contextOverrides?.tutorialThreadId && {
					tutorialThreadId: contextOverrides.tutorialThreadId,
				}),
			};
			const action = await strategies.behavior.decideAction(behaviorContext);

			if (action.type === "create_thread") {
				// Phase 3 以降: スレッド作成処理（現時点では未実装）
				// See: docs/architecture/components/bot.md §2.12.5 ネタ師の行動フロー
				throw new Error(
					"BotService.executeBotPost: create_thread アクションは Phase 3 以降に対応予定です",
				);
			}

			resolvedThreadId = action.threadId;
		}

		// Step 5: ContentStrategy で本文生成
		// チュートリアルBOT用: contextOverrides.tutorialTargetPostNumber を ContentGenerationContext に渡す
		// See: docs/architecture/components/bot.md §2.1 Strategy 委譲版フロー Step 3
		// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
		const contentContext: ContentGenerationContext = {
			botId,
			botProfileKey: bot.botProfileKey,
			threadId: resolvedThreadId,
			...(contextOverrides?.tutorialTargetPostNumber !== undefined && {
				tutorialTargetPostNumber: contextOverrides.tutorialTargetPostNumber,
			}),
		};
		const body = await strategies.content.generateContent(contentContext);

		// Step 6: 偽装日次リセットIDを取得
		const dailyId = await this.getDailyId(botId);

		// Step 7: PostService.createPost を isBotWrite=true で呼び出す
		// botUserId: botId を渡すことで、コマンドパイプライン（!w 等）が正常に動作する。
		// See: docs/architecture/components/bot.md §3.1 依存先 > PostService
		// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
		// See: tmp/workers/bdd-architect_TASK-236/design.md §3.5 PostInput.botUserId 方式
		const result = await this.createPostFn({
			threadId: resolvedThreadId,
			body,
			edgeToken: null,
			ipHash: `bot-${botId}`,
			displayName: "名無しさん",
			isBotWrite: true,
			botUserId: botId,
		});

		if (!("success" in result) || result.success !== true) {
			const errMsg = "error" in result ? result.error : "不明なエラー";
			throw new Error(
				`BotService.executeBotPost: PostService.createPost が失敗しました: ${errMsg}`,
			);
		}

		// Step 8: bot_posts に { postId, botId } を INSERT し、total_posts をインクリメントする
		// See: docs/architecture/components/bot.md §6.1 bot_posts INSERTのタイミングと失敗時の扱い
		// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
		try {
			await this.botPostRepository.create(result.postId, botId);
			// bot_posts INSERT 成功後に total_posts をインクリメントする。
			// INSERT 失敗時はその投稿をボット投稿として認識しないため、カウントしない。
			await this.botRepository.incrementTotalPosts(botId);
		} catch (err) {
			// bot_posts INSERTに失敗してもpostレコードは残る。
			// この不整合はゲーム上「ボットが人間として扱われる」方向に作用するため、
			// エラーログに記録するのみで例外は再スローしない。
			// See: docs/architecture/components/bot.md §6.1 bot_posts INSERTのタイミングと失敗時の扱い
			console.error(
				`BotService.executeBotPost: bot_posts INSERT に失敗（postId=${result.postId}, botId=${botId}）`,
				err,
			);
		}

		// Step 9: next_post_at を更新（TDR-010: 次回投稿予定時刻の設定）
		// See: docs/architecture/architecture.md §13 TDR-010
		// See: docs/architecture/components/bot.md §2.1 書き込み実行 Step 6
		try {
			const delayMinutes = strategies.scheduling.getNextPostDelay({
				botId,
				botProfileKey: bot.botProfileKey,
			});
			const nextPostAt = new Date(Date.now() + delayMinutes * 60 * 1000);
			await this.botRepository.updateNextPostAt(botId, nextPostAt);
		} catch (err) {
			// next_post_at の更新失敗は致命的ではない（次回cronで再度投稿対象になる）
			console.error(
				`BotService.executeBotPost: next_post_at 更新に失敗（botId=${botId}）`,
				err,
			);
		}

		// Step 10: 結果を返す
		return {
			postId: result.postId,
			postNumber: result.postNumber,
			dailyId,
		};
	}

	// ---------------------------------------------------------------------------
	// チュートリアルBOT pending 処理
	// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
	// ---------------------------------------------------------------------------

	/**
	 * チュートリアルBOTのスポーン待ちキューを処理する。
	 *
	 * 処理フロー:
	 *   1. PendingTutorialRepository.findAll() で未処理の pending を取得
	 *   2. 各 pending に対して:
	 *      a. BotRepository.create() でチュートリアルBOTを新規作成
	 *      b. executeBotPost(newBotId, undefined, contextOverrides) で書き込み実行
	 *      c. PendingTutorialRepository.delete(pendingId) で pending を削除
	 *   3. 結果を返す
	 *
	 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.4
	 *
	 * @returns 処理件数と各pendingの個別結果
	 */
	async processPendingTutorials(): Promise<{
		processed: number;
		results: TutorialResult[];
	}> {
		// pendingTutorialRepository が未注入の場合は何もしない
		if (!this.pendingTutorialRepository) {
			return { processed: 0, results: [] };
		}

		const pendingList = await this.pendingTutorialRepository.findAll();

		if (pendingList.length === 0) {
			return { processed: 0, results: [] };
		}

		const results: TutorialResult[] = [];

		for (const pending of pendingList) {
			try {
				// Step 2a: チュートリアルBOT新規作成
				// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4 > step 3.b.i
				const today = this.getTodayJst();
				const newBot = await this.botRepository.create({
					name: "名無しさん",
					persona: "チュートリアル",
					hp: 10,
					maxHp: 10,
					dailyId: this.generateFakeDailyId(),
					dailyIdDate: today,
					isActive: true,
					isRevealed: false,
					revealedAt: null,
					botProfileKey: "tutorial",
					nextPostAt: new Date(),
				});

				// Step 2b: executeBotPost で書き込み実行（contextOverrides 付き）
				// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4 > step 3.b.ii
				const postResult = await this.executeBotPost(newBot.id, undefined, {
					tutorialTargetPostNumber: pending.triggerPostNumber,
					tutorialThreadId: pending.threadId,
				});

				// Step 2c: pending 削除
				// See: tmp/workers/bdd-architect_TASK-236/design.md §3.4 > step 3.b.iii
				await this.pendingTutorialRepository.deletePendingTutorial(pending.id);

				results.push({
					pendingId: pending.id,
					success: true,
					botId: newBot.id,
					postId: postResult?.postId,
					postNumber: postResult?.postNumber,
				});
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				console.error(
					`BotService.processPendingTutorials: pending=${pending.id} の処理に失敗`,
					err,
				);
				results.push({
					pendingId: pending.id,
					success: false,
					error: errorMessage,
				});
			}
		}

		return { processed: pendingList.length, results };
	}

	// ---------------------------------------------------------------------------
	// 煽りBOT pending 処理
	// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
	// ---------------------------------------------------------------------------

	/**
	 * pending_async_commands テーブルから command_type='aori' のエントリを処理する。
	 *
	 * 処理フロー（エントリごと）:
	 *   1. 煽り BOT を新規作成（使い切り設定）
	 *   2. 煽り文句セットからランダム選択
	 *   3. BOT として書き込み（">>{target} {煽り文句}" 形式）
	 *   4. pending エントリを削除
	 *
	 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
	 */
	async processAoriCommands(): Promise<{
		processed: number;
		results: AoriResult[];
	}> {
		// pendingAsyncCommandRepository が未注入の場合は何もしない
		if (!this.pendingAsyncCommandRepository) {
			return { processed: 0, results: [] };
		}

		const pendingList =
			await this.pendingAsyncCommandRepository.findByCommandType("aori");

		if (pendingList.length === 0) {
			return { processed: 0, results: [] };
		}

		const results: AoriResult[] = [];

		for (const pending of pendingList) {
			try {
				// Step 1: 煽り BOT 新規作成（使い切り設定）
				// isActive: true + nextPostAt: null で「攻撃可能だが定期投稿しない」状態にする。
				// findDueForPost は isActive && nextPostAt <= now でフィルタするため、
				// nextPostAt=null なら定期投稿対象にならない。
				// AttackHandler は !isActive を「撃破済み」と判定するため isActive=true が必要。
				// See: features/command_aori.feature @煽りBOTは1回だけ書き込み、定期書き込みを行わない
				const today = this.getTodayJst();
				const newBot = await this.botRepository.create({
					name: "名無しさん",
					persona: "煽り",
					hp: 10,
					maxHp: 10,
					dailyId: this.generateFakeDailyId(),
					dailyIdDate: today,
					isActive: true,
					isRevealed: false,
					revealedAt: null,
					botProfileKey: "aori",
					nextPostAt: null,
				});

				// Step 2: 煽り文句をランダム選択
				const taunt = selectRandomTaunt();

				// Step 3: BOT として書き込み
				// See: features/command_aori.feature @BOTが煽り文句セット（100件）から1つを選択して投稿する
				const body = `>>${pending.targetPostNumber} ${taunt}`;
				const postResult = await this.createPostFn!({
					threadId: pending.threadId,
					body: body,
					edgeToken: null,
					ipHash: "bot-aori",
					displayName: "名無しさん",
					isBotWrite: true,
					botUserId: newBot.id,
				});

				if (postResult && "success" in postResult && postResult.success) {
					// bot_posts 紐付け + total_posts インクリメント
					await this.botPostRepository.create(postResult.postId, newBot.id);
					await this.botRepository.incrementTotalPosts(newBot.id);
				}

				// Step 4: pending 削除
				await this.pendingAsyncCommandRepository.deletePendingAsyncCommand(
					pending.id,
				);

				results.push({
					pendingId: pending.id,
					success: true,
					botId: newBot.id,
					postId:
						postResult && "success" in postResult && postResult.success
							? postResult.postId
							: undefined,
				});
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				console.error(
					`BotService.processAoriCommands: pending=${pending.id} failed`,
					err,
				);

				// pending 削除（エラー時も削除して無限リトライを防ぐ）
				// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
				try {
					await this.pendingAsyncCommandRepository!.deletePendingAsyncCommand(
						pending.id,
					);
				} catch (deleteErr) {
					console.error(
						`BotService.processAoriCommands: pending削除失敗 id=${pending.id}`,
						deleteErr,
					);
				}

				results.push({
					pendingId: pending.id,
					success: false,
					error: errorMessage,
				});
			}
		}

		return { processed: pendingList.length, results };
	}

	// ---------------------------------------------------------------------------
	// §2.11 書き込み先スレッド選択（後方互換ラッパー）
	// ---------------------------------------------------------------------------

	/**
	 * ボットの書き込み先スレッドをランダムに選択する（後方互換ラッパー）。
	 *
	 * v6 以降、投稿先の決定は BehaviorStrategy.decideAction() に委譲される。
	 * このメソッドは後方互換のためラッパーとして残し、
	 * 内部で RandomThreadBehaviorStrategy.decideAction() を呼び出す。
	 *
	 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
	 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択（後方互換ラッパー）
	 *
	 * @param botId - ボットID
	 * @returns 選択されたスレッドID
	 */
	async selectTargetThread(botId: string): Promise<string> {
		if (!this.threadRepository) {
			throw new Error(
				"selectTargetThread: threadRepository が未注入です。コンストラクタに IThreadRepository を渡してください",
			);
		}

		// ボット情報を取得して Strategy を解決する
		// ボットが見つからない場合は共通ファクトリで最小 Bot を生成して処理を継続する。
		// Phase 2 時点では resolveStrategies の Bot 引数は未使用のため、
		// Bot の存在確認はブロッキング要因にならない。
		// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
		// See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
		const bot = await this.botRepository.findById(botId);
		const resolvedBot = bot ?? this.createBotForStrategyResolution(botId, null);
		const profile = bot
			? this.getBotProfileForStrategy(bot.botProfileKey)
			: null;

		// BehaviorStrategy.decideAction() を呼び出してスレッドIDを取得する
		// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
		const strategies = this.resolveStrategiesForBot(resolvedBot, profile);
		const behaviorContext: BehaviorContext = {
			botId,
			botProfileKey: bot?.botProfileKey ?? null,
			boardId: DEFAULT_BOARD_ID,
		};

		const action = await strategies.behavior.decideAction(behaviorContext);

		if (action.type !== "post_to_existing") {
			throw new Error(
				`BotService.selectTargetThread: post_to_existing 以外のアクションは対応していません (type=${action.type})`,
			);
		}

		return action.threadId;
	}

	// ---------------------------------------------------------------------------
	// §2.12 書き込み間隔決定（Strategy 委譲版）
	// ---------------------------------------------------------------------------

	/**
	 * 次回書き込みまでの遅延時間を返す（分単位）。
	 *
	 * v6 以降、SchedulingStrategy.getNextPostDelay() に委譲する。
	 * 荒らし役は FixedIntervalSchedulingStrategy（60〜120分）が適用される。
	 * GitHub Actions の cron ジョブから参照される。
	 *
	 * See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行（GitHub Actionsから呼び出し）
	 * See: docs/architecture/components/bot.md §2.12.3 FixedIntervalSchedulingStrategy
	 *
	 * @param botId - ボットID（将来の種別別スケジューリング拡張のために引数として保持）
	 * @param botProfileKey - プロファイルキー（省略時は null）
	 * @returns 次回書き込みまでの遅延時間（分単位）
	 */
	getNextPostDelay(botId?: string, botProfileKey?: string | null): number {
		// Strategy を解決してスケジューリング戦略に委譲する
		// getNextPostDelay はスケジュール計算にボットエンティティの詳細情報を必要としない。
		// resolveStrategies の第1引数 Bot は Phase 3/4 向けの拡張ポイントであり現時点では未使用。
		// 呼び出し用の最小 Bot を共通ファクトリで生成する（ハードコード値の散在を防ぐ）。
		// See: docs/architecture/components/bot.md §2.12.1 SchedulingStrategy
		const resolvedBotId = botId ?? "scheduling-context";
		const resolvedProfileKey = botProfileKey ?? null;
		const contextBot = this.createBotForStrategyResolution(
			resolvedBotId,
			resolvedProfileKey,
		);
		const profile = this.getBotProfileForStrategy(resolvedProfileKey);
		const strategies = this.resolveStrategiesForBot(contextBot, profile);

		const schedulingContext: SchedulingContext = {
			botId: resolvedBotId,
			botProfileKey: resolvedProfileKey,
		};

		// SchedulingStrategy に委譲する
		// See: docs/architecture/components/bot.md §2.12.1 SchedulingStrategy
		return strategies.scheduling.getNextPostDelay(schedulingContext);
	}

	// ---------------------------------------------------------------------------
	// §2.5 偽装ID取得
	// ---------------------------------------------------------------------------

	/**
	 * ボットの当日分偽装日次リセットIDを取得する。
	 *
	 * 当日分であればそのまま返す。日付が古ければ再生成してDBを更新してから返す。
	 * See: docs/architecture/components/bot.md §2.5 偽装ID取得
	 *
	 * @param botId - ボットID
	 * @returns 当日有効な偽装日次リセットID
	 */
	async getDailyId(botId: string): Promise<string> {
		const bot = await this.botRepository.findById(botId);
		if (!bot) {
			throw new Error(
				`BotService.getDailyId: ボットが見つかりません (botId=${botId})`,
			);
		}

		const today = this.getTodayJst();

		if (bot.dailyIdDate === today) {
			// 当日分はそのまま返す
			return bot.dailyId;
		}

		// 日付が古ければ再生成して DB を更新する
		const newDailyId = this.generateFakeDailyId();
		await this.botRepository.updateDailyId(botId, newDailyId, today);
		return newDailyId;
	}

	// ---------------------------------------------------------------------------
	// プライベートメソッド
	// ---------------------------------------------------------------------------

	/**
	 * bot_profiles.yaml からプロファイルキーに対応する BotProfile を取得する。
	 * Strategy 解決用に使用する。
	 * プロファイルが見つからない場合は null を返す。
	 *
	 * BotProfilesYaml の型が BotProfile（bot-strategies/types.ts）と同一のため、
	 * 変換処理なしにそのまま返す（HIGH-002 型重複解消による簡素化）。
	 *
	 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
	 * See: config/bot_profiles.yaml
	 */
	private getBotProfileForStrategy(
		botProfileKey: string | null,
	): BotProfile | null {
		if (botProfileKey === null) return null;
		return this.botProfiles[botProfileKey] ?? null;
	}

	/**
	 * ボットに適用する3つの Strategy を解決する。
	 *
	 * resolveStrategiesFn が注入されている場合はそちらを使用する（テスト用）。
	 * 未注入の場合は bot-strategies/strategy-resolver.ts の resolveStrategies を使用する。
	 *
	 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
	 */
	private resolveStrategiesForBot(
		bot: Bot,
		profile: BotProfile | null,
	): BotStrategies {
		if (this.resolveStrategiesFn) {
			// テスト用モック関数が注入されている場合はそちらを使用する
			return this.resolveStrategiesFn(bot, profile, {
				threadRepository:
					this.threadRepository ?? this.createFallbackThreadRepository(),
				botProfiles: this.botProfiles,
			});
		}

		// デフォルト: strategy-resolver.ts の resolveStrategies を使用する
		// See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
		return defaultResolveStrategies(bot, profile, {
			threadRepository:
				this.threadRepository ?? this.createFallbackThreadRepository(),
			botProfiles: this.botProfiles,
		});
	}

	/**
	 * threadRepository が未注入の場合のフォールバック。
	 * 常にエラーをスローする空のリポジトリを返す。
	 */
	private createFallbackThreadRepository(): IThreadRepository {
		return {
			findByBoardId: async (_boardId: string) => {
				throw new Error(
					"threadRepository が未注入です。コンストラクタに IThreadRepository を渡してください",
				);
			},
		};
	}

	/**
	 * Strategy 解決専用の最小 Bot オブジェクトを生成する共通ファクトリ。
	 *
	 * getNextPostDelay のようにボットエンティティ詳細が不要な呼び出しで使用する。
	 * resolveStrategies の Bot 引数は Phase 3/4 向けの拡張ポイントであり、
	 * Phase 2 時点では未使用のため、最小限の値で生成する。
	 * ハードコード値をこの1箇所に集約することで、フィールド追加時の更新漏れを防ぐ。
	 *
	 * See: docs/architecture/components/bot.md §2.12.2 resolveStrategies 解決ルール
	 */
	private createBotForStrategyResolution(
		botId: string,
		botProfileKey: string | null,
	): Bot {
		return {
			id: botId,
			name: "",
			persona: "",
			hp: 0,
			maxHp: 0,
			dailyId: "",
			dailyIdDate: "",
			isActive: true,
			isRevealed: false,
			revealedAt: null,
			survivalDays: 0,
			totalPosts: 0,
			accusedCount: 0,
			timesAttacked: 0,
			botProfileKey,
			nextPostAt: null,
			eliminatedAt: null,
			eliminatedBy: null,
			createdAt: new Date(),
		};
	}

	/**
	 * bot_profiles.yaml からプロファイルキーに対応する報酬パラメータを取得する。
	 * プロファイルが見つからない場合はデフォルト値を返す。
	 *
	 * See: docs/architecture/components/bot.md §4 隠蔽する実装詳細 > 撃破報酬パラメータのconfig読み込みとキャッシュ戦略
	 */
	private getRewardParams(botProfileKey: string | null): RewardParams {
		if (botProfileKey === null) {
			return DEFAULT_REWARD_PARAMS;
		}

		const profile = this.botProfiles[botProfileKey];
		if (!profile?.reward) {
			return DEFAULT_REWARD_PARAMS;
		}

		return {
			baseReward: profile.reward.base_reward,
			dailyBonus: profile.reward.daily_bonus,
			attackBonus: profile.reward.attack_bonus,
		};
	}

	/**
	 * 今日の JST 日付を YYYY-MM-DD 形式で返す。
	 *
	 * attacks テーブルの attack_date カラムに使用する。
	 * See: docs/architecture/components/bot.md §5.2 attacks テーブル > attack_date
	 */
	private getTodayJst(): string {
		// JST = UTC+9 のため 9*60 分を加算する
		const now = new Date(Date.now());
		const jstOffset = 9 * 60 * 60 * 1000;
		const jstDate = new Date(now.getTime() + jstOffset);
		return jstDate.toISOString().slice(0, 10);
	}

	/**
	 * ランダムな偽装日次リセットIDを生成する。
	 *
	 * 人間の daily_id と同じ形式（英数字8文字）を使用する。
	 * See: docs/specs/bot_state_transitions.yaml #fake_daily_id > generation
	 */
	private generateFakeDailyId(): string {
		const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
		let result = "";
		for (let i = 0; i < 8; i++) {
			result += chars[Math.floor(Math.random() * chars.length)];
		}
		return result;
	}
}

// ---------------------------------------------------------------------------
// ファクトリ関数（本番用）
// ---------------------------------------------------------------------------

/**
 * 本番用 BotService インスタンスを生成するファクトリ関数。
 * 本番コードでは実際のリポジトリを使用する。
 * テストコードでは BotService コンストラクタを直接使用してモックを注入する。
 *
 * require() による遅延評価で循環依存を回避する（post-service ↔ bot-service の依存関係）。
 *
 * See: docs/architecture/bdd_test_strategy.md §7-12 モック戦略
 * See: docs/architecture/components/bot.md §3.1 依存先 > PostService
 */
export function createBotService(): BotService {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const BotRepository = require("../infrastructure/repositories/bot-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const BotPostRepository = require("../infrastructure/repositories/bot-post-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const AttackRepository = require("../infrastructure/repositories/attack-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const ThreadRepository = require("../infrastructure/repositories/thread-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { createPost } = require("./post-service");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const PendingTutorialRepository = require("../infrastructure/repositories/pending-tutorial-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const PendingAsyncCommandRepository = require("../infrastructure/repositories/pending-async-command-repository");

	// IThreadRepository アダプタ: ThreadRepository.findByBoardId を IBotService.IThreadRepository に適合させる
	// findByBoardId は options 引数が省略可能なため、boardId のみ渡すシグネチャで適合する
	// See: src/lib/infrastructure/repositories/thread-repository.ts > findByBoardId
	const threadRepository: IThreadRepository = {
		findByBoardId: (boardId: string) => ThreadRepository.findByBoardId(boardId),
	};

	// IPendingTutorialRepository アダプタ
	// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	const pendingTutorialRepository: IPendingTutorialRepository = {
		findAll: () => PendingTutorialRepository.findAll(),
		deletePendingTutorial: (id: string) =>
			PendingTutorialRepository.deletePendingTutorial(id),
	};

	// IPendingAsyncCommandRepository アダプタ
	// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
	const pendingAsyncCommandRepository: IPendingAsyncCommandRepository = {
		findByCommandType: (commandType: string) =>
			PendingAsyncCommandRepository.findByCommandType(commandType),
		deletePendingAsyncCommand: (id: string) =>
			PendingAsyncCommandRepository.deletePendingAsyncCommand(id),
	};

	return new BotService(
		BotRepository,
		BotPostRepository,
		AttackRepository,
		undefined, // botProfilesData（省略 → コンストラクタ内で botProfilesConfig をデフォルト使用）
		threadRepository, // executeBotPost の BehaviorStrategy でスレッド選択に使用
		createPost, // executeBotPost で PostService.createPost を呼び出すために使用
		undefined, // resolveStrategiesFn（省略 → デフォルトの resolveStrategies を使用）
		pendingTutorialRepository, // processPendingTutorials で使用
		pendingAsyncCommandRepository, // processAoriCommands で使用
	);
}
