/**
 * AccusationService — AI告発（!tell コマンド）の統括サービス
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 * See: docs/architecture/components/accusation.md §3 依存関係
 *
 * 責務:
 *   - !tell コマンドの告発フロー全体を統括する
 *   - 重複チェック → 存在チェック → 告発ルール判定 → isBot判定 → ボーナス付与 → DB記録 → メッセージ生成
 *   - システムメッセージ文字列を返す（DB挿入はしない。PostService/CommandService が担当）
 *
 * DI設計:
 *   - PostRepository, BotPostRepository, CurrencyService, AccusationRepository を注入可能にする
 *   - テスト時はモックを注入し、外部DB依存を排除する
 *
 * Note: BotService は未実装のため、直接 BotPostRepository を使用する。
 *   Phase 3 で BotService 実装時にリファクタリングする。
 *   See: task_TASK-078.md §補足・制約
 */

import type { AccusationResult } from "../domain/models/accusation";
import type { CreditReason } from "../domain/models/currency";
import type { Post } from "../domain/models/post";
import {
	ACCUSATION_HIT_BONUS,
	buildHitSystemMessage,
	buildMissSystemMessage,
	calculateBonus,
	checkAccusationAllowed,
	FALSE_ACCUSATION_BONUS,
} from "../domain/rules/accusation-rules";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * !tell コマンドの告発コスト。
 * config/commands.yaml の tell.cost と同値。
 * See: config/commands.yaml
 */
const TELL_COST = 50;

// ---------------------------------------------------------------------------
// 公開インターフェース型定義
// ---------------------------------------------------------------------------

/**
 * AccusationService.accuse() の入力型。
 * See: docs/architecture/components/accusation.md §2 AccusationInput
 */
export interface AccusationInput {
	/** 告発者の userId（UUID） */
	accuserId: string;
	/** 告発対象の postId（UUID） */
	targetPostId: string;
	/** スレッドID（UUID） */
	threadId: string;
	/** 告発者の日次ID（表示用。SystemMessage生成に使用） */
	accuserDailyId: string;
}

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * PostRepository の依存インターフェース。
 * AccusationService が使用する最小限のインターフェース。
 */
export interface IPostRepository {
	findById(id: string): Promise<Post | null>;
}

/**
 * BotPostRepository の依存インターフェース。
 * isBot 判定のみに使用する。
 * See: task_TASK-078.md §補足・制約 > BotService未実装につき直接アクセスを許容
 */
export interface IBotPostRepository {
	findByPostId(
		postId: string,
	): Promise<{ postId: string; botId: string } | null>;
}

/**
 * AccusationRepository の依存インターフェース。
 */
export interface IAccusationRepository {
	findByAccuserAndTarget(
		accuserId: string,
		targetPostId: string,
	): Promise<unknown>;
	create(accusation: {
		accuserId: string;
		targetPostId: string;
		threadId: string;
		result: "hit" | "miss";
		bonusAmount: number;
	}): Promise<{ id: string }>;
}

/**
 * CurrencyService の依存インターフェース。
 * AccusationService が使用する最小限のインターフェース（credit のみ）。
 */
export interface ICurrencyService {
	credit(userId: string, amount: number, reason: CreditReason): Promise<void>;
}

// ---------------------------------------------------------------------------
// AccusationService クラス
// ---------------------------------------------------------------------------

/**
 * AccusationService — AI告発の統括サービス。
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 */
export class AccusationService {
	constructor(
		/** レスの取得に使用するリポジトリ */
		private readonly postRepository: IPostRepository,
		/** isBot 判定に使用するリポジトリ（BotService未実装のため直接使用） */
		private readonly botPostRepository: IBotPostRepository,
		/** 告発記録の重複チェック・作成に使用するリポジトリ */
		private readonly accusationRepository: IAccusationRepository,
		/** ボーナス付与に使用する通貨サービス */
		private readonly currencyService: ICurrencyService,
	) {}

	/**
	 * AI告発を実行する。
	 *
	 * 処理フロー（D-08 accusation.md §2 準拠）:
	 *   1. 重複チェック → alreadyAccused: true を返す
	 *   2. 対象レス存在チェック → エラーを返す
	 *   3. 自分の書き込みチェック → エラーを返す（accusation-rules 使用）
	 *   4. システムメッセージチェック → エラーを返す（accusation-rules 使用）
	 *   5. isBot判定 → hit or miss を決定
	 *   6. ボーナス計算 → accusation-rules 使用
	 *   7. ボーナス付与 → CurrencyService.credit
	 *   8. DB記録 → AccusationRepository.create
	 *   9. システムメッセージ文字列生成 → 返却
	 *
	 * See: features/phase2/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
	 * See: features/phase2/ai_accusation.feature @AI告発に失敗すると冤罪ボーナスが被告発者に付与される
	 * See: features/phase2/ai_accusation.feature @同一ユーザーが同一レスに対して再度告発を試みると拒否される
	 * See: features/phase2/ai_accusation.feature @存在しないレスに対してAI告発を試みるとエラーになる
	 * See: features/phase2/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
	 * See: features/phase2/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
	 *
	 * @param input - 告発入力
	 * @returns 告発結果（alreadyAccused: true の場合は実行されない）
	 */
	async accuse(input: AccusationInput): Promise<AccusationResult> {
		// Step 1: 重複チェック
		// 同一 accuser × 同一 targetPost の告発が既に存在する場合は alreadyAccused: true を返す
		// See: docs/architecture/components/accusation.md §2 > 重複告発
		// See: features/phase2/ai_accusation.feature @同一ユーザーが同一レスに対して再度告発を試みると拒否される
		const existingAccusation =
			await this.accusationRepository.findByAccuserAndTarget(
				input.accuserId,
				input.targetPostId,
			);

		if (existingAccusation) {
			return {
				result: "miss", // alreadyAccused 時は result の実際の値は使われない
				bonusAmount: 0,
				systemMessage: "既に告発済みです",
				alreadyAccused: true,
			};
		}

		// Step 2: 対象レス存在チェック
		// See: features/phase2/ai_accusation.feature @存在しないレスに対してAI告発を試みるとエラーになる
		const targetPost = await this.postRepository.findById(input.targetPostId);

		if (!targetPost) {
			return {
				result: "miss",
				bonusAmount: 0,
				systemMessage: "指定されたレスが見つかりません",
				alreadyAccused: false,
			};
		}

		// Step 3 & 4: 自分の書き込みチェック / システムメッセージチェック（accusation-rules 使用）
		// See: features/phase2/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
		// See: features/phase2/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
		const checkResult = checkAccusationAllowed({
			accuserId: input.accuserId,
			targetAuthorId: targetPost.authorId,
			targetIsSystemMessage: targetPost.isSystemMessage,
		});

		if (!checkResult.ok) {
			const message =
				checkResult.reason === "self_accusation"
					? "自分の書き込みに対して告発することはできません"
					: "システムメッセージに対して告発することはできません";

			return {
				result: "miss",
				bonusAmount: 0,
				systemMessage: message,
				alreadyAccused: false,
			};
		}

		// Step 5: isBot 判定
		// BotPostRepository.findByPostId: ボットの書き込みなら値あり、人間の書き込みなら null
		// See: src/lib/infrastructure/repositories/bot-post-repository.ts > findByPostId
		const botRecord = await this.botPostRepository.findByPostId(
			input.targetPostId,
		);
		const isBot = botRecord !== null;

		// Step 6: ボーナス計算（accusation-rules 使用）
		// See: features/phase2/ai_accusation.feature @告発成功ボーナスが告発者に付与される
		// See: features/phase2/ai_accusation.feature @被告発者に冤罪ボーナスが付与される
		const bonus = calculateBonus(isBot);

		// Step 7: ボーナス付与 → CurrencyService.credit
		if (isBot) {
			// hit: 告発者にボーナスを付与する
			if (bonus.accuserBonus > 0) {
				await this.currencyService.credit(
					input.accuserId,
					bonus.accuserBonus,
					"accusation_hit",
				);
			}
		} else {
			// miss: 被告発者に冤罪ボーナスを付与する
			// targetPost.authorId は Step 3 で自分自身チェック済みのため、
			// ここでは null チェックのみ行う（システムメッセージへの告発は Step 4 で排除済み）
			if (bonus.targetBonus > 0 && targetPost.authorId !== null) {
				await this.currencyService.credit(
					targetPost.authorId,
					bonus.targetBonus,
					"false_accusation_bonus",
				);
			}
		}

		// Step 8: DB記録 → AccusationRepository.create
		const bonusAmount = isBot ? bonus.accuserBonus : bonus.targetBonus;
		await this.accusationRepository.create({
			accuserId: input.accuserId,
			targetPostId: input.targetPostId,
			threadId: input.threadId,
			result: isBot ? "hit" : "miss",
			bonusAmount,
		});

		// Step 9: システムメッセージ文字列生成 → 返却
		// See: docs/architecture/components/accusation.md §5 > システムメッセージ文字列の生成責任
		let systemMessage: string;
		if (isBot) {
			// hit: 告発成功メッセージ
			systemMessage = buildHitSystemMessage(
				input.accuserDailyId,
				targetPost.postNumber,
				bonus.accuserBonus,
			);
		} else {
			// miss: 冤罪ボーナスメッセージ
			// 被告発者の dailyId を取得するため targetPost.dailyId を使用する
			systemMessage = buildMissSystemMessage(
				input.accuserDailyId,
				targetPost.postNumber,
				targetPost.dailyId,
				TELL_COST,
				bonus.targetBonus,
			);
		}

		return {
			result: isBot ? "hit" : "miss",
			bonusAmount,
			systemMessage,
			alreadyAccused: false,
		};
	}
}

// ---------------------------------------------------------------------------
// デフォルトエクスポート（ファクトリ関数）
// ---------------------------------------------------------------------------

/**
 * 本番用 AccusationService インスタンスを生成するファクトリ関数。
 * 本番コードでは実際のリポジトリ・サービスを使用する。
 * テストコードでは AccusationService コンストラクタを直接使用してモックを注入する。
 *
 * See: docs/architecture/bdd_test_strategy.md §7-12 モック戦略
 */
export function createAccusationService(): AccusationService {
	// 動的インポートを避けるため、ここで直接インポートする
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const PostRepository = require("../infrastructure/repositories/post-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const BotPostRepository = require("../infrastructure/repositories/bot-post-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const AccusationRepository = require("../infrastructure/repositories/accusation-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const CurrencyService = require("./currency-service");

	return new AccusationService(
		PostRepository,
		BotPostRepository,
		AccusationRepository,
		CurrencyService,
	);
}
