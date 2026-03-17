/**
 * CommandHandler 実装: !w（草）コマンド
 *
 * See: features/reactions.feature
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4 GrassHandler 契約
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !w コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!w >>3"）
 *   - 通貨コスト: 0（無料コマンド）
 *   - 対象レスの書き込み主（ユーザー）の草カウントを +1 する
 *   - システムメッセージ形式: ">>N (ID:xxxxxxxx) に草 ICON(計M本)"
 *   - ボットの書き込みへの草: MVP では記録のみ（草カウント非加算）
 *
 * バリデーション一覧（詳細は §3.3 参照）:
 *   - 引数なし → エラー "対象レスを指定してください（例: !w >>3）"
 *   - 存在しないレス → エラー "指定されたレスが見つかりません"
 *   - 削除済みレス → エラー "削除されたレスには草を生やせません"
 *   - システムメッセージ → エラー "システムメッセージには草を生やせません"
 *   - 自己草 → エラー "自分のレスには草を生やせません"
 *   - 同日重複 → エラー "今日は既にこのユーザーに草を生やしています"
 */

import type { Post } from "../../domain/models/post";
import { formatGrassMessage } from "../../domain/rules/grass-icon";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * GrassHandler が使用する PostRepository のインターフェース。
 * 対象レスの存在確認・authorId・dailyId 取得に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §2.2
 */
export interface IGrassPostRepository {
	findById(id: string): Promise<Post | null>;
}

/**
 * GrassHandler が使用する GrassRepository のインターフェース。
 * 草記録の作成・重複チェック・草カウント加算に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §2.1
 */
export interface IGrassRepository {
	existsForToday(
		giverId: string,
		receiverId: string | null,
		receiverBotId: string | null,
		date: string,
	): Promise<boolean>;
	create(params: {
		giverId: string;
		receiverId: string | null;
		receiverBotId: string | null;
		targetPostId: string;
		threadId: string;
		givenDate: string;
	}): Promise<{ id: string } | null>;
	incrementGrassCount(userId: string): Promise<number>;
}

/**
 * GrassHandler が使用する BotPostRepository のインターフェース（読み取り専用）。
 * authorId が null のレスに対してボット判定を行うために使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.4
 */
export interface IGrassBotPostRepository {
	findByPostId(postId: string): Promise<{ botId: string } | null>;
}

// ---------------------------------------------------------------------------
// GrassHandler クラス
// ---------------------------------------------------------------------------

/**
 * !w（草）ハンドラ。
 *
 * 処理フロー:
 *   1. 引数チェック（>>N 形式）
 *   2. 対象レス取得（PostRepository.findById）
 *   3. バリデーション（存在・削除・システムメッセージ）
 *   4. 自己草チェック
 *   5. 受領者（対象レスの authorId）の特定
 *      - authorId != null → 人間ユーザー (receiverId)
 *      - authorId == null → botPostRepository.findByPostId() でボット判定 (receiverBotId)
 *   6. 重複チェック（GrassRepository.existsForToday）
 *   7. 草記録作成（GrassRepository.create）
 *   8. 草カウント加算（GrassRepository.incrementGrassCount）※ボットの場合はスキップ
 *   9. システムメッセージ生成（formatGrassMessage）
 *
 * See: features/reactions.feature
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.1
 * See: docs/architecture/components/command.md §2.2
 */
export class GrassHandler implements CommandHandler {
	/** コマンド名（! を除いた名前）*/
	readonly commandName = "w";

	/**
	 * @param postRepository    - 対象レス取得（DI）
	 * @param grassRepository   - 草記録CRUD・草カウント加算（DI）
	 * @param botPostRepository - ボット判定（DI）
	 */
	constructor(
		private readonly postRepository: IGrassPostRepository,
		private readonly grassRepository: IGrassRepository,
		private readonly botPostRepository: IGrassBotPostRepository,
	) {}

	/**
	 * !w コマンドを実行する。
	 *
	 * See: features/reactions.feature §基本機能
	 * See: features/reactions.feature §重複制限
	 * See: features/reactions.feature §エラーケース
	 *
	 * @param ctx - コマンド実行コンテキスト
	 * @returns コマンド実行結果（systemMessage にシステム情報または エラー内容）
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// ステップ1: 引数チェック
		// See: features/reactions.feature @対象レス番号を指定せずに !w を実行するとエラーになる
		const targetArg = ctx.args[0];
		if (!targetArg) {
			return {
				success: false,
				systemMessage: "対象レスを指定してください（例: !w >>3）",
			};
		}

		// ステップ2: 対象レス取得
		// See: features/reactions.feature @存在しないレスに草を生やそうとするとエラーになる
		const targetPost = await this.postRepository.findById(targetArg);
		if (!targetPost) {
			return {
				success: false,
				systemMessage: "指定されたレスが見つかりません",
			};
		}

		// ステップ3a: 削除済みレスチェック
		// See: features/reactions.feature @削除済みレスには草を生やせない
		if (targetPost.isDeleted) {
			return {
				success: false,
				systemMessage: "削除されたレスには草を生やせません",
			};
		}

		// ステップ3b: システムメッセージチェック
		// See: features/reactions.feature @システムメッセージには草を生やせない
		if (targetPost.isSystemMessage) {
			return {
				success: false,
				systemMessage: "システムメッセージには草を生やせません",
			};
		}

		// ステップ4: 自己草チェック
		// authorId が null のレス（ボット書き込み）への自己草は有り得ないため、
		// authorId が自分自身と一致する場合のみチェックする
		// See: features/reactions.feature @自分が書いたレスには草を生やせない
		if (targetPost.authorId !== null && targetPost.authorId === ctx.userId) {
			return {
				success: false,
				systemMessage: "自分のレスには草を生やせません",
			};
		}

		// ステップ5: 受領者の特定
		// authorId が存在する → 人間ユーザー
		// authorId が null → ボットの書き込みか判定する
		// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.3 ボットへの草対応
		let receiverId: string | null = null;
		let receiverBotId: string | null = null;
		let isBot = false;

		if (targetPost.authorId !== null) {
			// 人間ユーザーへの草
			receiverId = targetPost.authorId;
			isBot = false;
		} else {
			// authorId が null: ボット書き込みを確認する
			// See: features/reactions.feature @ボットの書き込みに草を生やせる
			const botPost = await this.botPostRepository.findByPostId(targetArg);
			if (botPost) {
				receiverBotId = botPost.botId;
				isBot = true;
			} else {
				// ボットでも人間でもない authorId=null のレス（通常は発生しない）
				return {
					success: false,
					systemMessage: "このレスには草を生やせません",
				};
			}
		}

		// ステップ6: 同日重複チェック
		// See: features/reactions.feature @同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
		const today = new Date(Date.now()).toISOString().split("T")[0]; // YYYY-MM-DD
		const alreadyGiven = await this.grassRepository.existsForToday(
			ctx.userId,
			receiverId,
			receiverBotId,
			today,
		);
		if (alreadyGiven) {
			return {
				success: false,
				systemMessage: "今日は既にこのユーザーに草を生やしています",
			};
		}

		// ステップ7: 草記録作成
		// UNIQUE制約違反の場合は null が返る（existsForToday で事前チェック済みだが二重防御）
		await this.grassRepository.create({
			giverId: ctx.userId,
			receiverId,
			receiverBotId,
			targetPostId: targetArg,
			threadId: ctx.threadId,
			givenDate: today,
		});

		// ステップ8: 草カウント加算（ボットの場合はスキップ — Phase 4 で実装）
		// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.3 ボットへの草 最終推奨
		// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §8 D-3
		let newGrassCount = 0;
		if (!isBot && receiverId !== null) {
			newGrassCount =
				await this.grassRepository.incrementGrassCount(receiverId);
		}

		// ステップ9: システムメッセージ生成
		// ボットへの草の場合は草カウント 0 のまま（MVP: カウント非加算）
		// See: features/reactions.feature §草を生やした結果がレス末尾にマージ表示される
		const systemMessage = formatGrassMessage(
			targetPost.postNumber,
			targetPost.dailyId,
			newGrassCount,
		);

		return {
			success: true,
			systemMessage,
		};
	}
}
