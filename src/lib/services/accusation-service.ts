/**
 * AccusationService — AI告発（!tell コマンド）の統括サービス
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 * See: docs/architecture/components/accusation.md §3 依存関係
 *
 * 責務:
 *   - !tell コマンドの告発フロー全体を統括する
 *   - 重複チェック → 存在チェック → 告発ルール判定 → isBot判定 → DB記録 → メッセージ生成
 *   - システムメッセージ文字列を返す（DB挿入はしない。PostService/CommandService が担当）
 *
 * DI設計:
 *   - PostRepository, BotPostRepository, AccusationRepository を注入可能にする
 *   - テスト時はモックを注入し、外部DB依存を排除する
 *
 * v4変更: ボーナス廃止。!tell はコスト消費のみ・報酬なしの偵察専用コマンド。
 *   - hitBonus / falseAccusationBonus を削除
 *   - ICurrencyService 依存を削除（通貨付与が不要になったため）
 *   - bonusConfig は cost のみ保持（システムメッセージ表示用）
 *
 * Note: BotService は未実装のため、直接 BotPostRepository を使用する。
 *   Phase 3 で BotService 実装時にリファクタリングする。
 *   See: task_TASK-078.md §補足・制約
 */

import type { AccusationResult } from "../domain/models/accusation";
import type { Post } from "../domain/models/post";
import {
	buildHitSystemMessage,
	buildMissSystemMessage,
	checkAccusationAllowed,
} from "../domain/rules/accusation-rules";

// ---------------------------------------------------------------------------
// 告発設定型（config/commands.yaml から注入される）
// ---------------------------------------------------------------------------

/**
 * 告発経済パラメータ。config/commands.yaml の tell コマンド設定から注入される。
 * v4: ボーナス廃止。cost のみ保持。
 * See: config/commands.yaml > tell.cost
 */
export interface AccusationBonusConfig {
	/** 告発コスト（システムメッセージ表示用） */
	cost: number;
}

/**
 * デフォルトの告発設定。
 * config/commands.yaml から値が渡されない場合のフォールバック。
 * See: config/commands.yaml
 */
const DEFAULT_BONUS_CONFIG: AccusationBonusConfig = {
	cost: 10,
};

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

// ---------------------------------------------------------------------------
// AccusationService クラス
// ---------------------------------------------------------------------------

/**
 * AccusationService — AI告発の統括サービス。
 *
 * v4: ボーナス廃止。!tell はコスト消費のみ・報酬なしの偵察専用コマンド。
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 */
export class AccusationService {
	/** 告発経済パラメータ（config/commands.yaml から注入） */
	private readonly bonusConfig: AccusationBonusConfig;

	constructor(
		/** レスの取得に使用するリポジトリ */
		private readonly postRepository: IPostRepository,
		/** isBot 判定に使用するリポジトリ（BotService未実装のため直接使用） */
		private readonly botPostRepository: IBotPostRepository,
		/** 告発記録の重複チェック・作成に使用するリポジトリ */
		private readonly accusationRepository: IAccusationRepository,
		/** 告発設定（config/commands.yaml から注入。省略時はデフォルト値） */
		bonusConfig?: AccusationBonusConfig,
	) {
		this.bonusConfig = bonusConfig ?? DEFAULT_BONUS_CONFIG;
	}

	/**
	 * AI告発を実行する。
	 *
	 * 処理フロー（D-08 accusation.md §2 準拠、v4ボーナス廃止版）:
	 *   1. 重複チェック → alreadyAccused: true を返す
	 *   2. 対象レス存在チェック → エラーを返す
	 *   3. 自分の書き込みチェック → エラーを返す（accusation-rules 使用）
	 *   4. システムメッセージチェック → エラーを返す（accusation-rules 使用）
	 *   5. isBot判定 → hit or miss を決定
	 *   6. DB記録 → AccusationRepository.create（bonusAmount: 0 固定）
	 *   7. システムメッセージ文字列生成 → 返却
	 *
	 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
	 * See: features/ai_accusation.feature @AI告発に失敗するとコストのみ消費される
	 * See: features/ai_accusation.feature @同一ユーザーが同一レスに対して再度告発を試みると拒否される
	 * See: features/ai_accusation.feature @存在しないレスに対してAI告発を試みるとエラーになる
	 * See: features/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
	 * See: features/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
	 *
	 * @param input - 告発入力
	 * @returns 告発結果（alreadyAccused: true の場合は実行されない）
	 */
	async accuse(input: AccusationInput): Promise<AccusationResult> {
		// Step 1: 重複チェック
		// See: features/ai_accusation.feature @同一ユーザーが同一レスに対して再度告発を試みると拒否される
		const existingAccusation =
			await this.accusationRepository.findByAccuserAndTarget(
				input.accuserId,
				input.targetPostId,
			);

		if (existingAccusation) {
			return {
				result: "miss",
				bonusAmount: 0,
				systemMessage: "既に告発済みです",
				alreadyAccused: true,
			};
		}

		// Step 2: 対象レス存在チェック
		// See: features/ai_accusation.feature @存在しないレスに対してAI告発を試みるとエラーになる
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
		const botRecord = await this.botPostRepository.findByPostId(
			input.targetPostId,
		);
		const isBot = botRecord !== null;

		// Step 6: DB記録 → AccusationRepository.create（bonusAmount: 0 固定）
		// v4: ボーナス廃止。bonusAmount は互換性のため常に 0 を記録する。
		await this.accusationRepository.create({
			accuserId: input.accuserId,
			targetPostId: input.targetPostId,
			threadId: input.threadId,
			result: isBot ? "hit" : "miss",
			bonusAmount: 0,
		});

		// Step 7: システムメッセージ文字列生成 → 返却
		// v4: ボーナス関連文言を除去した簡素なメッセージ
		let systemMessage: string;
		if (isBot) {
			// hit: 告発成功メッセージ（ボーナス付与なし）
			systemMessage = buildHitSystemMessage(
				input.accuserDailyId,
				targetPost.postNumber,
			);
		} else {
			// miss: コスト消費のみのメッセージ（冤罪ボーナスなし）
			systemMessage = buildMissSystemMessage(
				input.accuserDailyId,
				targetPost.postNumber,
				this.bonusConfig.cost,
			);
		}

		return {
			result: isBot ? "hit" : "miss",
			bonusAmount: 0,
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
 * @param bonusConfig - 告発設定（省略時はデフォルト値）
 *
 * See: docs/architecture/bdd_test_strategy.md §7-12 モック戦略
 */
export function createAccusationService(
	bonusConfig?: AccusationBonusConfig,
): AccusationService {
	// 動的インポートを避けるため、ここで直接インポートする
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const PostRepository = require("../infrastructure/repositories/post-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const BotPostRepository = require("../infrastructure/repositories/bot-post-repository");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const AccusationRepository = require("../infrastructure/repositories/accusation-repository");

	return new AccusationService(
		PostRepository,
		BotPostRepository,
		AccusationRepository,
		bonusConfig,
	);
}
