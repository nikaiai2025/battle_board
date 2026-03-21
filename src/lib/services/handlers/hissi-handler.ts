/**
 * CommandHandler 実装: !hissi（必死チェッカー）コマンド
 *
 * 対象ユーザーの本日の書き込みを全スレッド横断で調査し、
 * 最新3件をヘッダ付きで独立システムレスに表示する。
 *
 * See: features/investigation.feature
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !hissi コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!hissi >>4"）
 *   - 通貨コスト: 20
 *   - 指定レスの authorId を対象ユーザーとして本日の書き込みを全スレッド横断で検索
 *   - 最新3件表示（4件以上の場合は "N件中3件表示" を付記）
 *   - 結果は独立システムレス（independentMessage）として返す
 *   - エラー時はインライン表示（systemMessage）
 *
 * バリデーション一覧:
 *   - 引数なし → エラー "対象レスを指定してください（例: !hissi >>3）"
 *   - システムメッセージ → エラー "システムメッセージは対象にできません"
 *   - 削除済みレス → エラー "削除されたレスは対象にできません"
 *   - authorId が null（ボット等） → エラー "このレスは対象にできません"
 */

import type { Post } from "../../domain/models/post";
import type { Thread } from "../../domain/models/thread";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * HissiHandler が使用する PostRepository のインターフェース。
 * 対象レスの取得・著者の書き込み履歴取得に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 */
export interface IHissiPostRepository {
	findById(id: string): Promise<Post | null>;
	findByAuthorIdAndDate(
		authorId: string,
		date: string,
		options?: { limit?: number },
	): Promise<Post[]>;
}

/**
 * HissiHandler が使用する ThreadRepository のインターフェース。
 * 書き込みが属するスレッド名の取得に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 */
export interface IHissiThreadRepository {
	findById(id: string): Promise<Thread | null>;
}

// ---------------------------------------------------------------------------
// HissiHandler クラス
// ---------------------------------------------------------------------------

/**
 * !hissi（必死チェッカー）ハンドラ。
 *
 * 処理フロー:
 *   1. 引数チェック（>>N 形式のUUIDが渡される）
 *   2. 対象レス取得（PostRepository.findById）
 *   3. バリデーション（システムメッセージ・削除済み・authorIdがnull）
 *   4. 今日の日付で全件検索（findByAuthorIdAndDate、limit なし）
 *   5. 今日の日付で最新3件検索（findByAuthorIdAndDate、limit=3）
 *   6. メッセージ生成（0件/1~3件/4件以上の3パターン）
 *   7. return { success: true, systemMessage: null, independentMessage: 生成メッセージ }
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 */
export class HissiHandler implements CommandHandler {
	/** コマンド名（! を除いた名前）*/
	readonly commandName = "hissi";

	/**
	 * @param postRepository   - レス取得・著者の書き込み履歴検索（DI）
	 * @param threadRepository - スレッド名取得（DI）
	 */
	constructor(
		private readonly postRepository: IHissiPostRepository,
		private readonly threadRepository: IHissiThreadRepository,
	) {}

	/**
	 * !hissi コマンドを実行する。
	 *
	 * See: features/investigation.feature §!hissi
	 *
	 * @param ctx - コマンド実行コンテキスト（ctx.args[0] は解決済みUUID）
	 * @returns コマンド実行結果（independentMessage に調査結果または systemMessage にエラー）
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// ステップ1: 引数チェック
		// See: features/investigation.feature @共通エラーケース
		const targetArg = ctx.args[0];
		if (!targetArg) {
			return {
				success: false,
				systemMessage: "対象レスを指定してください（例: !hissi >>3）",
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
		// See: features/investigation.feature @システムメッセージを対象に !hissi を実行するとエラーになる
		if (targetPost.isSystemMessage) {
			return {
				success: false,
				systemMessage: "システムメッセージは対象にできません",
			};
		}

		// ステップ3b: 削除済みレスチェック
		// See: features/investigation.feature @削除済みレスを対象に !hissi を実行するとエラーになる
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
		const dailyId = targetPost.dailyId;

		// ステップ4: 今日の日付を計算（UTC ベース。既存 countByDate と同方式）
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §6.1
		const today = new Date(Date.now()).toISOString().split("T")[0]; // YYYY-MM-DD

		// ステップ5a: 全件数取得（limit なし）
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1 §6.3
		const allPosts = await this.postRepository.findByAuthorIdAndDate(
			authorId,
			today,
		);
		const totalCount = allPosts.length;

		// ステップ5b: 表示用最新3件（全件取得済みのためsliceで代替。2回目のDBアクセス不要）
		// findByAuthorIdAndDate は created_at DESC ソート済みのため先頭3件が最新3件
		// See: src/lib/infrastructure/repositories/post-repository.ts（created_at DESC確認済み）
		const displayPosts = allPosts.slice(0, 3);

		// ステップ6: メッセージ生成
		if (totalCount === 0) {
			// 0件: シンプルなメッセージ
			// See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
			return {
				success: true,
				systemMessage: null,
				independentMessage: "本日の書き込みはありません",
			};
		}

		// 表示用レスを時系列順（ASC）に並べ替える
		// findByAuthorIdAndDate は created_at DESC で返すため反転する
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1 最新3件の定義
		const sortedPosts = [...displayPosts].reverse();

		// ヘッダ行の生成
		const countLabel =
			totalCount > 3 ? `${totalCount}件中3件表示` : `${totalCount}件`;
		const header = `ID:${dailyId} の本日の書き込み（${countLabel}）`;

		// 各レスのフォーマット
		// フォーマット: [スレッド名] >>N 表示名 ID:dailyId HH:MM:SS\n本文
		const postLines: string[] = [];
		for (const post of sortedPosts) {
			// スレッド名取得（取得失敗時は "不明なスレッド" とする）
			const thread = await this.threadRepository.findById(post.threadId);
			const threadTitle = thread?.title ?? "不明なスレッド";

			// 時刻フォーマット（HH:MM:SS）
			const timeStr = formatTime(post.createdAt);

			const postLine = `[${threadTitle}] >>${post.postNumber} ${post.displayName} ID:${post.dailyId} ${timeStr}\n${post.body}`;
			postLines.push(postLine);
		}

		const independentMessage = `${header}\n\n${postLines.join("\n\n")}`;

		return {
			success: true,
			systemMessage: null,
			independentMessage,
		};
	}
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * Date オブジェクトを HH:MM:SS 形式の文字列に変換する。
 * 日本時間（JST = UTC+9）で表示する。
 *
 * @param date - 変換対象の Date
 * @returns "HH:MM:SS" 形式の文字列
 */
function formatTime(date: Date): string {
	// JST = UTC+9
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstDate = new Date(date.getTime() + jstOffset);
	const h = String(jstDate.getUTCHours()).padStart(2, "0");
	const m = String(jstDate.getUTCMinutes()).padStart(2, "0");
	const s = String(jstDate.getUTCSeconds()).padStart(2, "0");
	return `${h}:${m}:${s}`;
}
