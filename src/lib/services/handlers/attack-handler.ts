/**
 * CommandHandler 実装: !attack（攻撃）コマンド
 *
 * See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
 * See: docs/architecture/components/attack.md §3 処理フロー
 * See: docs/architecture/components/attack.md §6 設計上の判断
 *
 * !attack コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!attack >>5"）
 *   - 通貨コスト: 5（config/commands.yaml の attack.cost）
 *   - ダメージ: 10（config/commands.yaml の attack.damage）
 *   - 対象がBOT → BOTマーク付与（未付与なら）+ HP減少 + 攻撃記録
 *   - 対象が人間 → コスト消費 + 賠償金（cost * multiplier = 15）
 *
 * 設計上の重要な注意事項:
 *   - D-08 attack.md §3.1: CommandService の通貨チェック（残高 >= cost）は外側で行う
 *   - 実際の debit は AttackHandler 内で行う（エラーケースではコストを消費しない）
 *   - D-08 attack.md §6.2: 全エラーケース（撃破済み・同日2回目等）でコスト不消費
 */

import type {
	CreditReason,
	DeductReason,
	DeductResult,
} from "../../domain/models/currency";
import type { Post } from "../../domain/models/post";
import type { BotInfo, DamageResult } from "../bot-service";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * AttackHandler が使用する BotService のインターフェース。
 * See: docs/architecture/components/attack.md §4.1 依存先 > BotService
 */
export interface IAttackBotService {
	isBot(postId: string): Promise<boolean>;
	getBotByPostId(postId: string): Promise<BotInfo | null>;
	revealBot(botId: string): Promise<void>;
	applyDamage(
		botId: string,
		damage: number,
		attackerId: string,
	): Promise<DamageResult>;
	canAttackToday(attackerId: string, botId: string): Promise<boolean>;
	recordAttack(
		attackerId: string,
		botId: string,
		postId: string | null,
		damage: number,
	): Promise<void>;
}

/**
 * AttackHandler が使用する CurrencyService のインターフェース。
 * See: docs/architecture/components/attack.md §4.1 依存先 > CurrencyService
 */
export interface IAttackCurrencyService {
	getBalance(userId: string): Promise<number>;
	debit(
		userId: string,
		amount: number,
		reason: DeductReason,
	): Promise<DeductResult>;
	credit(userId: string, amount: number, reason: CreditReason): Promise<void>;
}

/**
 * AttackHandler が使用する PostRepository のインターフェース。
 * 対象レスの存在確認・author_id 取得に使用する。
 * See: docs/architecture/components/attack.md §4.1 依存先 > PostRepository
 */
export interface IAttackPostRepository {
	findById(id: string): Promise<Post | null>;
}

// ---------------------------------------------------------------------------
// AttackHandler クラス
// ---------------------------------------------------------------------------

/**
 * !attack（攻撃）ハンドラ。
 *
 * D-08 attack.md §3 の処理フローを実装する:
 *   - 共通前処理: 対象レス存在チェック・自己攻撃拒否・システムメッセージ拒否
 *   - フローB: 対象がBOTの場合（BOTマーク付与 + HP減少 + 撃破報酬）
 *   - フローC: 対象が人間の場合（賠償金支払い）
 *
 * See: features/bot_system.feature
 * See: docs/architecture/components/attack.md §2.1 AttackHandler
 * See: docs/architecture/components/attack.md §6.1 AttackHandlerを独立コンポーネントとした理由
 */
export class AttackHandler implements CommandHandler {
	/** コマンド名（! を除いた名前） */
	readonly commandName = "attack";

	/**
	 * @param botService - ボット判定・HP操作・攻撃記録（DI）
	 * @param currencyService - 通貨消費・付与（DI）
	 * @param postRepository - 対象レス取得（DI）
	 * @param cost - 攻撃コスト（config/commands.yaml の attack.cost）
	 * @param damage - 1回の攻撃ダメージ（config/commands.yaml の attack.damage）
	 * @param compensationMultiplier - 賠償金倍率（config/commands.yaml の attack.compensation_multiplier）
	 */
	constructor(
		private readonly botService: IAttackBotService,
		private readonly currencyService: IAttackCurrencyService,
		private readonly postRepository: IAttackPostRepository,
		private readonly cost: number,
		private readonly damage: number,
		private readonly compensationMultiplier: number,
	) {}

	/**
	 * !attack コマンドを実行する。
	 *
	 * D-08 attack.md §3 の処理フローに忠実に実装する。
	 * CommandService は通貨残高チェック（>=cost）のみ行い、
	 * 実際のdebitはこのメソッド内で行う（エラーケースでのコスト不消費を保証）。
	 *
	 * See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
	 * See: docs/architecture/components/attack.md §3 処理フロー
	 *
	 * @param ctx - コマンド実行コンテキスト
	 * @returns コマンド実行結果（systemMessage に表示内容）
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// 引数チェック
		const targetArg = ctx.args[0];
		if (!targetArg) {
			return {
				success: false,
				systemMessage: "使い方: !attack >>レス番号",
			};
		}

		// 共通前処理: 対象レスの存在チェック
		// See: docs/architecture/components/attack.md §3.1 共通前処理 step 4
		const targetPost = await this.postRepository.findById(targetArg);
		if (!targetPost) {
			return {
				success: false,
				systemMessage: "指定されたレスが見つかりません",
			};
		}

		// 共通前処理: 自己攻撃チェック
		// See: docs/architecture/components/attack.md §6.4 自分自身への攻撃
		if (targetPost.authorId === ctx.userId) {
			return {
				success: false,
				systemMessage: "自分の書き込みに対して攻撃することはできません",
			};
		}

		// 共通前処理: システムメッセージへの攻撃チェック
		// See: docs/architecture/components/attack.md §6.5 システムメッセージへの攻撃
		if (targetPost.isSystemMessage) {
			return {
				success: false,
				systemMessage: "システムメッセージに対して攻撃することはできません",
			};
		}

		// BOT判定（フローB / フローC の分岐）
		// See: docs/architecture/components/attack.md §3.2 AttackHandler 内部フロー
		const isBot = await this.botService.isBot(targetArg);

		if (isBot) {
			return await this.executeFlowB(ctx, targetArg);
		}

		// フローC: 対象が人間（ただし authorId=null かつ非システムメッセージは拒否）
		// See: docs/architecture/components/attack.md §6.5
		if (targetPost.authorId === null) {
			return {
				success: false,
				systemMessage: "このレスへの攻撃はできません",
			};
		}

		return await this.executeFlowC(ctx, targetPost.authorId);
	}

	// ---------------------------------------------------------------------------
	// フローB: 対象がBOTの場合
	// See: docs/architecture/components/attack.md §3.3 フローB
	// ---------------------------------------------------------------------------

	/**
	 * フローB: 対象がBOTの場合の処理。
	 *
	 * B1. ボット情報取得
	 * B2. 撃破済みチェック → コスト消費なしでエラー
	 * B3. 1日1回チェック → コスト消費なしでエラー
	 * B4. コスト消費
	 * B5. 不意打ち（lurking）なら revealBot
	 * B6. HP減少（applyDamage）
	 * B7. 攻撃記録（recordAttack）
	 * B8. 撃破なら撃破報酬付与 + 撃破通知
	 * B9. インライン・システム情報生成
	 *
	 * See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
	 * See: docs/architecture/components/attack.md §3.3 フローB
	 */
	private async executeFlowB(
		ctx: CommandContext,
		targetPostId: string,
	): Promise<CommandHandlerResult> {
		// B1: ボット情報取得
		const botInfo = await this.botService.getBotByPostId(targetPostId);
		if (!botInfo) {
			return {
				success: false,
				systemMessage: "ボット情報の取得に失敗しました",
			};
		}

		// B2: 撃破済みチェック（コスト消費なし）
		// See: features/bot_system.feature @撃破済みボットへの攻撃は拒否される
		// See: docs/architecture/components/attack.md §3.5 エラーケース一覧
		if (!botInfo.isActive) {
			return {
				success: false,
				systemMessage: "このボットは既に撃破されています",
			};
		}

		// B3: 1日1回制限チェック（コスト消費なし）
		// See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
		// See: docs/architecture/components/bot.md §2.8 攻撃制限チェック
		const canAttack = await this.botService.canAttackToday(
			ctx.userId,
			botInfo.botId,
		);
		if (!canAttack) {
			return {
				success: false,
				systemMessage: "同じボットには1日1回しか攻撃できません",
			};
		}

		// B4: コスト消費
		// See: docs/architecture/components/attack.md §3.3 B4
		const deductResult = await this.currencyService.debit(
			ctx.userId,
			this.cost,
			"command_attack",
		);
		if (!deductResult.success) {
			// 楽観的ロックによる残高不足（通常は CommandService の事前チェックで防ぐ）
			return {
				success: false,
				systemMessage: "通貨が不足しています",
			};
		}

		// B5: 不意打ちの場合（lurking状態）→ revealBot
		// See: docs/architecture/components/attack.md §3.3 B5
		// See: docs/architecture/components/bot.md §6.6 不意打ち攻撃時の遷移連鎖
		if (!botInfo.isRevealed) {
			await this.botService.revealBot(botInfo.botId);
		}

		// B6: HP減少
		// See: docs/architecture/components/attack.md §3.3 B6
		const damageResult = await this.botService.applyDamage(
			botInfo.botId,
			this.damage,
			ctx.userId,
		);

		// B7: 攻撃記録
		// See: docs/architecture/components/attack.md §3.3 B7
		// ctx.postId はコマンド実行時点でレス未作成のため空文字の場合がある。
		// attacks.post_id は nullable のため、空文字を null に変換して渡す。
		// See: supabase/migrations/00020_attacks_post_id_nullable.sql
		await this.botService.recordAttack(
			ctx.userId,
			botInfo.botId,
			ctx.postId || null,
			this.damage,
		);

		// B9: インライン・システム情報生成
		// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
		// "⚔ 名無しさん(ID:{attackerDailyId}) → 🤖{botName} に攻撃！ HP:{prev}→{remaining}"
		const inlineMsg = `⚔ 名無しさん(ID:${ctx.dailyId}) → 🤖${botInfo.name} に攻撃！ HP:${damageResult.previousHp}→${damageResult.remainingHp}`;

		if (damageResult.eliminated && damageResult.reward !== null) {
			// B8: 撃破時 → 撃破報酬付与 + 撃破通知
			// See: docs/architecture/components/attack.md §3.3 B8
			// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
			await this.currencyService.credit(
				ctx.userId,
				damageResult.reward,
				"bot_elimination",
			);

			// 撃破通知（★システム名義の独立レス）
			// systemMessage: インライン表示用（攻撃レス末尾にマージ）
			// eliminationNotice: PostService が独立レスとして投稿する本文
			// See: docs/specs/bot_state_transitions.yaml #battle_record > display_format
			// See: docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md 案A
			const eliminationNoticeBody = [
				`⚔️ ボット「${botInfo.name}」が撃破されました！`,
				`生存日数：${botInfo.survivalDays}日 / 総書き込み：${botInfo.totalPosts}件 / 被告発：${botInfo.accusedCount}回`,
				`撃破者：名無しさん(ID:${ctx.dailyId}) に撃破報酬 +${damageResult.reward}`,
			].join("\n");

			return {
				success: true,
				// systemMessage にはインライン表示（HP変化）のみを設定する
				systemMessage: inlineMsg,
				// eliminationNotice を PostService に伝播して独立レスを投稿させる
				eliminationNotice: eliminationNoticeBody,
			};
		}

		return {
			success: true,
			systemMessage: inlineMsg,
		};
	}

	// ---------------------------------------------------------------------------
	// フローC: 対象が人間の場合
	// See: docs/architecture/components/attack.md §3.4 フローC
	// ---------------------------------------------------------------------------

	/**
	 * フローC: 対象が人間の場合の処理（賠償金発生）。
	 *
	 * C1. コスト消費（5）
	 * C2. 賠償金額計算: min(cost * multiplier, 攻撃者残高)
	 * C3. 賠償金差し引き（攻撃者）
	 * C4. 賠償金付与（被攻撃者）
	 * C5. インライン・システム情報生成（残高不足時は特殊メッセージ）
	 *
	 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
	 * See: features/bot_system.feature @人間への攻撃時に賠償金の残高が不足している場合は全額支払い
	 * See: docs/architecture/components/attack.md §3.4 フローC
	 * See: docs/architecture/components/attack.md §6.3 賠償金の残高不足時の処理
	 */
	private async executeFlowC(
		ctx: CommandContext,
		targetUserId: string,
	): Promise<CommandHandlerResult> {
		// C1: コスト消費（5）
		// See: docs/architecture/components/attack.md §3.4 C1
		const deductResult = await this.currencyService.debit(
			ctx.userId,
			this.cost,
			"command_attack",
		);
		if (!deductResult.success) {
			return {
				success: false,
				systemMessage: "通貨が不足しています",
			};
		}

		// C2: 賠償金額計算（攻撃コスト消費後の残高を取得）
		// See: docs/architecture/components/attack.md §3.4 C2
		// See: docs/architecture/components/attack.md §6.3 賠償金の残高不足時の処理
		const compensationAmount = this.cost * this.compensationMultiplier;
		const attackerBalance = await this.currencyService.getBalance(ctx.userId);
		const actualCompensation = Math.min(compensationAmount, attackerBalance);
		const isFullPayment = actualCompensation < compensationAmount;

		// C3: 賠償金差し引き（攻撃者）
		// See: docs/architecture/components/attack.md §3.4 C3
		if (actualCompensation > 0) {
			await this.currencyService.debit(
				ctx.userId,
				actualCompensation,
				"command_attack",
			);
		}

		// C4: 賠償金付与（被攻撃者）
		// See: docs/architecture/components/attack.md §3.4 C4
		await this.currencyService.credit(
			targetUserId,
			actualCompensation,
			"bot_elimination",
		);

		// C5: インライン・システム情報生成
		// See: docs/architecture/components/attack.md §3.4 C5
		// See: features/bot_system.feature @人間への攻撃時に賠償金の残高が不足している場合は全額支払い
		let systemMessage: string;
		if (isFullPayment) {
			// 残高不足で全額支払い → 特殊メッセージ
			systemMessage = "チッ、これで勘弁してやるよ🤞😏";
		} else {
			systemMessage = `人間への攻撃！ コスト ${this.cost} 消費・賠償金 ${actualCompensation} 支払い`;
		}

		return {
			success: true,
			systemMessage,
		};
	}
}
