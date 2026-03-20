/**
 * CommandHandler 実装: !kinou（昨日のID）コマンド
 *
 * 対象ユーザーの昨日の日次リセットIDを調査し、
 * 独立システムレスに表示する。
 *
 * See: features/investigation.feature
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !kinou コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!kinou >>4"）
 *   - 通貨コスト: 20
 *   - 指定レスの authorId を対象ユーザーとして昨日の日次リセットIDを検索
 *   - 昨日の書き込みがある場合: "ID:{今日のID} の昨日のID → ID:{昨日のID}"
 *   - 昨日の書き込みがない場合: "ID:{今日のID} は昨日の書き込みがありません"
 *   - 結果は独立システムレス（independentMessage）として返す
 *   - エラー時はインライン表示（systemMessage）
 *
 * バリデーション一覧:
 *   - 引数なし → エラー "対象レスを指定してください（例: !kinou >>3）"
 *   - システムメッセージ → エラー "システムメッセージは対象にできません"
 *   - 削除済みレス → エラー "削除されたレスは対象にできません"
 *   - authorId が null（ボット等） → エラー "このレスは対象にできません"
 */

import type { Post } from "../../domain/models/post";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * KinouHandler が使用する PostRepository のインターフェース。
 * 対象レスの取得・昨日の書き込み検索に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 */
export interface IKinouPostRepository {
	findById(id: string): Promise<Post | null>;
	findByAuthorIdAndDate(
		authorId: string,
		date: string,
		options?: { limit?: number },
	): Promise<Post[]>;
}

// ---------------------------------------------------------------------------
// KinouHandler クラス
// ---------------------------------------------------------------------------

/**
 * !kinou（昨日のID）ハンドラ。
 *
 * 処理フロー:
 *   1. 引数チェック（>>N 形式のUUIDが渡される）
 *   2. 対象レス取得（PostRepository.findById）
 *   3. バリデーション（システムメッセージ・削除済み・authorIdがnull）
 *   4. 昨日の日付を計算（JST基準）
 *   5. findByAuthorIdAndDate(authorId, 昨日の日付, { limit: 1 })
 *   6. メッセージ生成（書き込みあり/なしの2パターン）
 *   7. return { success: true, systemMessage: null, independentMessage: 生成メッセージ }
 *
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 */
export class KinouHandler implements CommandHandler {
	/** コマンド名（! を除いた名前）*/
	readonly commandName = "kinou";

	/**
	 * @param postRepository - レス取得・著者の書き込み履歴検索（DI）
	 */
	constructor(private readonly postRepository: IKinouPostRepository) {}

	/**
	 * !kinou コマンドを実行する。
	 *
	 * See: features/investigation.feature §!kinou
	 *
	 * @param ctx - コマンド実行コンテキスト（ctx.args[0] は解決済みUUID）
	 * @returns コマンド実行結果（independentMessage に昨日のID情報または systemMessage にエラー）
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// ステップ1: 引数チェック
		// See: features/investigation.feature @共通エラーケース
		const targetArg = ctx.args[0];
		if (!targetArg) {
			return {
				success: false,
				systemMessage: "対象レスを指定してください（例: !kinou >>3）",
			};
		}

		// ステップ2: 対象レス取得
		// CommandService の Step 1.5 で >>N → UUID に解決済み
		const targetPost = await this.postRepository.findById(targetArg);
		if (!targetPost) {
			return {
				success: false,
				systemMessage: "指定されたレスが見つかりません",
			};
		}

		// ステップ3a: システムメッセージチェック
		// See: features/investigation.feature @システムメッセージを対象に !kinou を実行するとエラーになる
		if (targetPost.isSystemMessage) {
			return {
				success: false,
				systemMessage: "システムメッセージは対象にできません",
			};
		}

		// ステップ3b: 削除済みレスチェック
		// See: features/investigation.feature @削除済みレスを対象に !kinou を実行するとエラーになる
		if (targetPost.isDeleted) {
			return {
				success: false,
				systemMessage: "削除されたレスは対象にできません",
			};
		}

		// ステップ3c: authorId が null のレスは対象外（ボット書き込み等）
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §6.2
		if (targetPost.authorId === null) {
			return {
				success: false,
				systemMessage: "このレスは対象にできません",
			};
		}

		const authorId = targetPost.authorId;
		// 今日のID: 指定レスの dailyId を使用する
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2 「今日のID」の取得
		const todayDailyId = targetPost.dailyId;

		// ステップ4: 昨日の日付を計算（JST基準）
		// Date.now() を使用することで時刻スタブが正しく機能する
		// See: features/support/world.ts @setCurrentTime
		const yesterday = getYesterdayJst();

		// ステップ5: 昨日の書き込みから dailyId を取得（limit=1 で最新1件のみ）
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §1.2 案B
		const yesterdayPosts = await this.postRepository.findByAuthorIdAndDate(
			authorId,
			yesterday,
			{ limit: 1 },
		);

		// ステップ6: メッセージ生成
		if (yesterdayPosts.length === 0) {
			// 昨日の書き込みなし
			// See: features/investigation.feature @対象ユーザーが昨日書き込みをしていない場合
			return {
				success: true,
				systemMessage: null,
				independentMessage: `ID:${todayDailyId} は昨日の書き込みがありません`,
			};
		}

		// 昨日の書き込みあり: 昨日の dailyId を取得
		// See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
		const yesterdayDailyId = yesterdayPosts[0].dailyId;
		return {
			success: true,
			systemMessage: null,
			independentMessage: `ID:${todayDailyId} の昨日のID → ID:${yesterdayDailyId}`,
		};
	}
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 昨日の日付文字列（YYYY-MM-DD）を JST 基準で生成する。
 * !kinou の「昨日のID」検索に使用する。
 * Date.now() を使用することで BDD テストの時刻スタブが正しく機能する。
 *
 * See: features/support/world.ts @setCurrentTime
 *
 * @returns JST 昨日の日付文字列（YYYY-MM-DD 形式）
 */
function getYesterdayJst(): string {
	// Date.now() を使用することで時刻スタブが反映される
	const now = new Date(Date.now());
	// JST = UTC+9
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstDate = new Date(now.getTime() + jstOffset);
	// 1日前に戻す
	jstDate.setUTCDate(jstDate.getUTCDate() - 1);
	return jstDate.toISOString().slice(0, 10);
}
