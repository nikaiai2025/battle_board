/**
 * CommandHandler 実装: !hissi（必死チェッカー）コマンド
 *
 * 対象ユーザーの本日の書き込みを全スレッド横断で調査し、
 * 最新3件をヘッダ付きで独立システムレスに表示する。
 * BOT書き込み（authorId=null）にも dailyId ベースで同フォーマットで応答する。
 *
 * See: features/investigation.feature
 * See: features/investigation.feature @ボットの書き込みに !hissi を実行すると書き込み履歴が表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 * See: tmp/design_bot_leak_fix.md §3.4
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !hissi コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!hissi >>4"）
 *   - 通貨コスト: 20
 *   - 指定レスの authorId を対象ユーザーとして本日の書き込みを全スレッド横断で検索
 *   - BOT書き込み（authorId=null）の場合は dailyId で検索（人間と同フォーマットで応答）
 *   - 最新3件表示（4件以上の場合は "N件中3件表示" を付記）
 *   - 結果は独立システムレス（independentMessage）として返す
 *   - エラー時はインライン表示（systemMessage）
 *
 * バリデーション一覧:
 *   - 引数なし → エラー "対象レスを指定してください（例: !hissi >>3）"
 *   - システムメッセージ → エラー "システムメッセージは対象にできません"
 *   - 削除済みレス → エラー "削除されたレスは対象にできません"
 *   - authorId が null かつ bot_posts に記録なし → エラー "このレスは対象にできません"
 *   - authorId が null かつ BOT書き込み → dailyId で検索し書き込み履歴を返す
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
 * 対象レスの取得・著者の書き込み履歴取得・dailyIdベース検索に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 * See: tmp/design_bot_leak_fix.md §3.3
 */
export interface IHissiPostRepository {
	findById(id: string): Promise<Post | null>;
	findByAuthorIdAndDate(
		authorId: string,
		date: string,
		options?: { limit?: number },
	): Promise<Post[]>;
	/** BOT書き込み対応: dailyId でレス一覧を取得する */
	findByDailyId(dailyId: string, options?: { limit?: number }): Promise<Post[]>;
}

/**
 * HissiHandler が使用する BotPostRepository のインターフェース。
 * BOT書き込みかどうかを判定するために使用する。
 *
 * See: tmp/design_bot_leak_fix.md §3.4
 */
export interface IHissiBotPostRepository {
	/** postId に対応する BOT 紐付けレコードを取得する（BOTでなければ null） */
	findByPostId(postId: string): Promise<{ botId: string } | null>;
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
 *   3c'. authorId=null の場合: BotPostRepository で BOT判定
 *        BOTなら dailyId で検索し人間と同フォーマットで応答
 *        BOTでなければ "このレスは対象にできません" エラー
 *   4. 今日の日付で全件検索（findByAuthorIdAndDate、limit なし）
 *   5. 今日の日付で最新3件検索（findByAuthorIdAndDate、limit=3）
 *   6. メッセージ生成（0件/1~3件/4件以上の3パターン）
 *   7. return { success: true, systemMessage: null, independentMessage: 生成メッセージ }
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: features/investigation.feature @ボットの書き込みに !hissi を実行すると書き込み履歴が表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 * See: tmp/design_bot_leak_fix.md §3.4
 */
export class HissiHandler implements CommandHandler {
	/** コマンド名（! を除いた名前）*/
	readonly commandName = "hissi";

	/**
	 * @param postRepository    - レス取得・著者の書き込み履歴検索・dailyId検索（DI）
	 * @param threadRepository  - スレッド名取得（DI）
	 * @param botPostRepository - BOT書き込み判定（DI。省略時は BOT パス無効）
	 */
	constructor(
		private readonly postRepository: IHissiPostRepository,
		private readonly threadRepository: IHissiThreadRepository,
		private readonly botPostRepository?: IHissiBotPostRepository,
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

		// ステップ3c: authorId が null の場合 BOT 判定を行う
		// See: tmp/design_bot_leak_fix.md §3.4
		if (targetPost.authorId === null) {
			// BotPostRepository が DI されていない場合、または BOT でない場合はエラー
			if (!this.botPostRepository) {
				return {
					success: false,
					systemMessage: "このレスは対象にできません",
				};
			}
			const botPost = await this.botPostRepository.findByPostId(targetArg);
			if (!botPost) {
				// authorId=null かつ bot_posts にも記録なし → 対象外
				return {
					success: false,
					systemMessage: "このレスは対象にできません",
				};
			}
			// BOT書き込み: dailyId ベースで書き込み履歴を取得し人間と同フォーマットで応答
			// See: tmp/design_bot_leak_fix.md §3.2 §3.4
			const botDailyId = targetPost.dailyId;
			const botAllPosts = await this.postRepository.findByDailyId(botDailyId);
			return buildHissiResult(botDailyId, botAllPosts, this.threadRepository);
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

		// ステップ6: メッセージ生成（共通ヘルパーで人間・BOT両パスを統一）
		return buildHissiResult(dailyId, allPosts, this.threadRepository);
	}
}

// ---------------------------------------------------------------------------
// 共通メッセージ生成ヘルパー
// ---------------------------------------------------------------------------

/**
 * 書き込み一覧（created_at DESC ソート済み）から !hissi の結果メッセージを生成する。
 * 人間パス・BOTパス両方で使用する共通ロジック。
 *
 * @param dailyId         - 対象ユーザー/BOTの日次リセットID（ヘッダ表示用）
 * @param allPostsDesc    - 全書き込み一覧（created_at DESC ソート済み）
 * @param threadRepository - スレッド名取得に使用するリポジトリ
 * @returns CommandHandlerResult
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: features/investigation.feature @ボットの書き込みに !hissi を実行すると書き込み履歴が表示される
 */
async function buildHissiResult(
	dailyId: string,
	allPostsDesc: Post[],
	threadRepository: IHissiThreadRepository,
): Promise<CommandHandlerResult> {
	const totalCount = allPostsDesc.length;

	// 0件: シンプルなメッセージ
	// See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
	if (totalCount === 0) {
		return {
			success: true,
			systemMessage: null,
			independentMessage: "本日の書き込みはありません",
		};
	}

	// 表示用最新3件（DESC の先頭3件が最新3件）
	const displayPosts = allPostsDesc.slice(0, 3);

	// 表示用レスを時系列順（ASC）に並べ替える
	// findByAuthorIdAndDate / findByDailyId は created_at DESC で返すため反転する
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
		const thread = await threadRepository.findById(post.threadId);
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
