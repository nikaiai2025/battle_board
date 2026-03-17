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
 *   - CurrencyService への撃破報酬付与は AttackHandler 側で行う（循環依存回避）
 *   - bot_profiles.yaml の読み込みはコンストラクタで行い、キャッシュする
 */

import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type { Bot } from "../domain/models/bot";
import {
	calculateEliminationReward,
	type RewardParams,
} from "../domain/rules/elimination-reward";
import type { Attack } from "../infrastructure/repositories/attack-repository";

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
	updateDailyId(
		botId: string,
		dailyId: string,
		dailyIdDate: string,
	): Promise<void>;
	bulkResetRevealed(): Promise<number>;
	bulkReviveEliminated(): Promise<number>;
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
 * ThreadRepository の依存インターフェース（最小）。
 * selectTargetThread でボット書き込み先スレッド選択に使用する。
 *
 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
 */
export interface IThreadRepository {
	findByBoardId(
		boardId: string,
		options?: { limit?: number },
	): Promise<{ id: string }[]>;
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

// ---------------------------------------------------------------------------
// ボット書き込みデフォルト定数
// ---------------------------------------------------------------------------

/**
 * selectTargetThread のデフォルト板ID。
 * 本番では config や環境変数から取得する想定だが、MVP では固定値を使用する。
 *
 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
 */
const BOT_DEFAULT_BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// bot_profiles.yaml 型定義
// ---------------------------------------------------------------------------

/** bot_profiles.yaml の報酬セクション型 */
interface BotProfileReward {
	base_reward: number;
	daily_bonus: number;
	attack_bonus: number;
}

/** bot_profiles.yaml の個別プロファイル型 */
interface BotProfile {
	hp: number;
	max_hp: number;
	reward: BotProfileReward;
	fixed_messages: string[];
}

/** bot_profiles.yaml のルート型 */
type BotProfilesYaml = Record<string, BotProfile>;

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
 * See: features/bot_system.feature
 * See: docs/architecture/components/bot.md §2 公開インターフェース
 * See: docs/architecture/components/bot.md §6.4 CurrencyService への撃破報酬付与の責務配置
 */
export class BotService {
	/** bot_profiles.yaml の解析済みデータ（キャッシュ） */
	private readonly botProfiles: BotProfilesYaml;

	/**
	 * @param botRepository - ボット情報の CRUD（DI）
	 * @param botPostRepository - ボット書き込み紐付けの検索・INSERT（DI）
	 * @param attackRepository - 攻撃記録の管理（DI）
	 * @param botProfilesYamlPath - bot_profiles.yaml のパス（省略時はデフォルトパス）
	 * @param threadRepository - スレッド一覧取得（DI・省略可）
	 * @param createPostFn - PostService.createPost の関数参照（DI・省略可）
	 */
	constructor(
		private readonly botRepository: IBotRepository,
		private readonly botPostRepository: IBotPostRepository,
		private readonly attackRepository: IAttackRepository,
		botProfilesYamlPath?: string,
		private readonly threadRepository?: IThreadRepository,
		private readonly createPostFn?: CreatePostFn,
	) {
		// bot_profiles.yaml を読み込みキャッシュする
		// See: docs/architecture/components/bot.md §4 隠蔽する実装詳細 > 撃破報酬パラメータのconfig読み込みとキャッシュ戦略
		const yamlPath =
			botProfilesYamlPath ??
			path.resolve(process.cwd(), "config/bot_profiles.yaml");
		const yamlContent = fs.readFileSync(yamlPath, "utf-8");
		this.botProfiles = parseYaml(yamlContent) as BotProfilesYaml;
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
	 * @param postId - 攻撃が含まれたレスID
	 * @param damage - 与ダメージ
	 */
	async recordAttack(
		attackerId: string,
		botId: string,
		postId: string,
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
	// §2.10 日次リセット処理
	// ---------------------------------------------------------------------------

	/**
	 * 日次リセット処理を実行する（JST 0:00 に GitHub Actions から呼ばれる）。
	 *
	 * 処理内容:
	 *   1. 全ボットの偽装 ID を再生成
	 *   2. revealed -> lurking（BOTマーク解除）
	 *   3. lurking/revealed ボットの survival_days +1
	 *   4. eliminated -> lurking（HP 初期値復帰、survival_days=0、times_attacked=0）
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

		// Step 5: attacks テーブルの前日分レコードをクリーンアップ
		// 当日以前のレコードを削除する（今日の攻撃記録は維持）
		// See: docs/specs/bot_state_transitions.yaml #daily_reset > attacks テーブル
		await this.attackRepository.deleteByDateBefore(today);

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
	 * ボットに書き込みを実行させる。
	 *
	 * 処理フロー:
	 *   1. bot_profiles.yaml の fixed_messages からランダムに1件選択
	 *   2. getDailyId(botId) で偽装IDを取得
	 *   3. createPostFn を isBotWrite=true で呼び出す
	 *   4. 成功したら botPostRepository.create(postId, botId) で紐付け INSERT
	 *   5. { postId, postNumber, dailyId } を返す
	 *
	 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行
	 *
	 * @param botId - ボットID
	 * @param threadId - 書き込み先スレッドID
	 * @returns 書き込み結果
	 */
	async executeBotPost(
		botId: string,
		threadId: string,
	): Promise<{ postId: string; postNumber: number; dailyId: string }> {
		if (!this.createPostFn) {
			throw new Error(
				"executeBotPost: createPostFn が未注入です。コンストラクタに PostService.createPost を渡してください",
			);
		}

		// Step 1: ボットプロファイルの固定文リストからランダムに1件選択
		// See: docs/architecture/components/bot.md §4 > 荒らし役のAI API不使用
		const bot = await this.botRepository.findById(botId);
		if (!bot) {
			throw new Error(
				`BotService.executeBotPost: ボットが見つかりません (botId=${botId})`,
			);
		}
		const fixedMessages = this.getFixedMessages(bot.botProfileKey);
		const body =
			fixedMessages[Math.floor(Math.random() * fixedMessages.length)];

		// Step 2: 偽装日次リセットIDを取得
		const dailyId = await this.getDailyId(botId);

		// Step 3: PostService.createPost を isBotWrite=true で呼び出す
		// See: docs/architecture/components/bot.md §3.1 依存先 > PostService
		const result = await this.createPostFn({
			threadId,
			body,
			edgeToken: null,
			ipHash: `bot-${botId}`,
			displayName: "名無しさん",
			isBotWrite: true,
		});

		if (!("success" in result) || result.success !== true) {
			const errMsg = "error" in result ? result.error : "不明なエラー";
			throw new Error(
				`BotService.executeBotPost: PostService.createPost が失敗しました: ${errMsg}`,
			);
		}

		// Step 4: bot_posts に { postId, botId } を INSERT
		// See: docs/architecture/components/bot.md §6.1 bot_posts INSERTのタイミングと失敗時の扱い
		try {
			await this.botPostRepository.create(result.postId, botId);
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

		// Step 5: 結果を返す
		return {
			postId: result.postId,
			postNumber: result.postNumber,
			dailyId,
		};
	}

	// ---------------------------------------------------------------------------
	// §2.11 書き込み先スレッド選択
	// ---------------------------------------------------------------------------

	/**
	 * ボットの書き込み先スレッドをランダムに選択する。
	 *
	 * threadRepository.findByBoardId で非削除スレッドを取得し、
	 * ランダムに1件選択して thread.id を返す。
	 *
	 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
	 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
	 *
	 * @param botId - ボットID（将来の重み付け選択拡張のために引数として保持）
	 * @returns 選択されたスレッドID
	 */
	async selectTargetThread(botId: string): Promise<string> {
		if (!this.threadRepository) {
			throw new Error(
				"selectTargetThread: threadRepository が未注入です。コンストラクタに IThreadRepository を渡してください",
			);
		}

		// 既存スレッド一覧を取得（非削除スレッドのみ）
		// See: docs/architecture/components/bot.md §4 > 書き込み先スレッド選択のランダムアルゴリズム
		const threads =
			await this.threadRepository.findByBoardId(BOT_DEFAULT_BOARD_ID);

		if (threads.length === 0) {
			throw new Error(
				`BotService.selectTargetThread: 書き込み先スレッドが存在しません (boardId=${BOT_DEFAULT_BOARD_ID}, botId=${botId})`,
			);
		}

		// 均等分布でランダムに1件選択
		const selected = threads[Math.floor(Math.random() * threads.length)];
		return selected.id;
	}

	// ---------------------------------------------------------------------------
	// §2.12 書き込み間隔決定
	// ---------------------------------------------------------------------------

	/**
	 * 次回書き込みまでの遅延時間を返す（分単位）。
	 *
	 * 一斉書き込みによるBOT発覚を防ぐため、60〜120分のランダムな値を返す。
	 * GitHub Actions の cron ジョブから参照される。
	 *
	 * See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
	 * See: docs/architecture/components/bot.md §2.1 書き込み実行（GitHub Actionsから呼び出し）
	 *
	 * @returns 60〜120 の整数（分単位）
	 */
	getNextPostDelay(): number {
		// 60分以上120分以下のランダムな整数を返す
		// Math.random() は [0, 1) なので、60 + floor(random * 61) は [60, 120] を網羅する
		return 60 + Math.floor(Math.random() * 61);
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
	 * bot_profiles.yaml からプロファイルキーに対応する固定文リストを取得する。
	 * プロファイルが見つからない場合、または固定文リストが空の場合はフォールバック文字列を返す。
	 *
	 * See: docs/architecture/components/bot.md §4 隠蔽する実装詳細 > 固定文リストの管理方法
	 * See: config/bot_profiles.yaml > fixed_messages
	 */
	private getFixedMessages(botProfileKey: string | null): string[] {
		const fallback = ["..."];
		if (botProfileKey === null) return fallback;

		const profile = this.botProfiles[botProfileKey];
		if (!profile?.fixed_messages?.length) return fallback;

		return profile.fixed_messages;
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
 * See: docs/architecture/bdd_test_strategy.md §7-12 モック戦略
 */
export function createBotService(): BotService {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const BotRepository = require("../infrastructure/repositories/bot-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const BotPostRepository = require("../infrastructure/repositories/bot-post-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const AttackRepository = require("../infrastructure/repositories/attack-repository");

	return new BotService(BotRepository, BotPostRepository, AttackRepository);
}
