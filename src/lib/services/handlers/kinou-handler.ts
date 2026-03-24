/**
 * CommandHandler 実装: !kinou（昨日のID）コマンド
 *
 * 対象ユーザーの昨日の日次リセットIDを調査し、
 * 独立システムレスに表示する。
 * BOT書き込み（authorId=null）にも dailyId ベースで同フォーマットで応答する。
 *
 * See: features/investigation.feature
 * See: features/investigation.feature @ボットの書き込みに !kinou を実行すると昨日のID情報が表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 * See: tmp/design_bot_leak_fix.md §3.5
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !kinou コマンドの仕様:
 *   - 引数: ">>postNumber" 形式でレスを指定する（例: "!kinou >>4"）
 *   - 通貨コスト: 20
 *   - 指定レスの authorId を対象ユーザーとして昨日の日次リセットIDを検索
 *   - BOT書き込み（authorId=null）の場合は getBotAuthorIdSeed で昨日の dailyId を計算
 *   - 昨日の書き込みがある場合: "ID:{今日のID} の昨日のID → ID:{昨日のID}"
 *   - 昨日の書き込みがない場合: "ID:{今日のID} は昨日の書き込みがありません"
 *   - 結果は独立システムレス（independentMessage）として返す
 *   - エラー時はインライン表示（systemMessage）
 *
 * バリデーション一覧:
 *   - 引数なし → エラー "対象レスを指定してください（例: !kinou >>3）"
 *   - システムメッセージ → エラー "システムメッセージは対象にできません"
 *   - 削除済みレス → エラー "削除されたレスは対象にできません"
 *   - authorId が null かつ bot_posts に記録なし → エラー "このレスは対象にできません"
 *   - authorId が null かつ BOT書き込み → BOT の昨日 dailyId を計算して応答
 */

import type { Post } from "../../domain/models/post";
import { generateDailyId } from "../../domain/rules/daily-id";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * !kinou の BOT 対応で使用するデフォルト板 ID。
 * BOT の dailyId は post-service の resolveAuth で
 * `generateDailyId("bot-{botId}", boardId, dateJst)` として生成される。
 * ここで使用する boardId は post-service と一致させる必要がある。
 *
 * See: tmp/design_bot_leak_fix.md §5.1
 * See: src/lib/services/post-service.ts > resolveAuth (isBotWrite 分岐)
 */
const DEFAULT_BOARD_ID = "livebot";

// ---------------------------------------------------------------------------
// 依存インターフェース（DI用）
// ---------------------------------------------------------------------------

/**
 * KinouHandler が使用する PostRepository のインターフェース。
 * 対象レスの取得・昨日の書き込み検索・dailyIdベース検索に使用する。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 * See: tmp/design_bot_leak_fix.md §3.3
 */
export interface IKinouPostRepository {
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
 * KinouHandler が使用する BotPostRepository のインターフェース。
 * BOT書き込みかどうかを判定し、botId を取得するために使用する。
 *
 * See: tmp/design_bot_leak_fix.md §3.5
 */
export interface IKinouBotPostRepository {
	/** postId に対応する BOT 紐付けレコードを取得する（BOTでなければ null） */
	findByPostId(postId: string): Promise<{ botId: string } | null>;
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
 *   3c'. authorId=null の場合: BotPostRepository で BOT判定
 *        BOTなら getBotAuthorIdSeed で昨日の dailyId を計算し findByDailyId で検索
 *        BOTでなければ "このレスは対象にできません" エラー
 *   4. 昨日の日付を計算（UTC基準）
 *   5. findByAuthorIdAndDate(authorId, 昨日の日付, { limit: 1 })
 *   6. メッセージ生成（書き込みあり/なしの2パターン）
 *   7. return { success: true, systemMessage: null, independentMessage: 生成メッセージ }
 *
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 * See: features/investigation.feature @ボットの書き込みに !kinou を実行すると昨日のID情報が表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 * See: tmp/design_bot_leak_fix.md §3.5
 */
export class KinouHandler implements CommandHandler {
	/** コマンド名（! を除いた名前）*/
	readonly commandName = "kinou";

	/**
	 * @param postRepository    - レス取得・著者の書き込み履歴検索・dailyId検索（DI）
	 * @param botPostRepository - BOT書き込み判定・botId取得（DI。省略時は BOT パス無効）
	 */
	constructor(
		private readonly postRepository: IKinouPostRepository,
		private readonly botPostRepository?: IKinouBotPostRepository,
	) {}

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

		// ステップ3c: authorId が null の場合 BOT 判定を行う
		// See: tmp/design_bot_leak_fix.md §3.5
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
			// BOT書き込み: BOTの昨日の dailyId を計算して応答
			// post-service の authorIdSeed 形式 "bot-{botId}" に従う
			// See: tmp/design_bot_leak_fix.md §3.5 §5.1
			const todayDailyId = targetPost.dailyId;
			const botAuthorIdSeed = getBotAuthorIdSeed(botPost.botId);
			const yesterdayJst = getYesterdayJst();
			const yesterdayDailyId = generateDailyId(
				botAuthorIdSeed,
				DEFAULT_BOARD_ID,
				yesterdayJst,
			);

			// 昨日の dailyId で実際の書き込みがあるか確認する（DB検索）
			const yesterdayPosts = await this.postRepository.findByDailyId(
				yesterdayDailyId,
				{ limit: 1 },
			);

			if (yesterdayPosts.length === 0) {
				return {
					success: true,
					systemMessage: null,
					independentMessage: `ID:${todayDailyId} は昨日の書き込みがありません`,
				};
			}
			return {
				success: true,
				systemMessage: null,
				independentMessage: `ID:${todayDailyId} の昨日のID → ID:${yesterdayDailyId}`,
			};
		}

		const authorId = targetPost.authorId;
		// 今日のID: 指定レスの dailyId を使用する
		// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2 「今日のID」の取得
		const todayDailyId = targetPost.dailyId;

		// ステップ4: 昨日の日付を計算（UTC基準）
		// findByAuthorIdAndDate は UTC の created_at で絞り込むため UTC で統一する
		// hissi-handler.ts の今日計算（UTC）と対称の方式
		// Date.now() を使用することで時刻スタブが正しく機能する
		// See: features/support/world.ts @setCurrentTime
		const yesterday = getYesterdayUtc();

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
 * 昨日の日付文字列（YYYY-MM-DD）を UTC 基準で生成する。
 * !kinou の「昨日のID」検索に使用する（人間パス）。
 *
 * findByAuthorIdAndDate（本番・InMemory 共通）が UTC 基準の日付で絞り込みを行うため、
 * 渡す日付は UTC 基準で統一する必要がある。
 * hissi-handler.ts の「今日」計算（UTC ベース）と対称になっている。
 *
 * Date.now() を使用することで BDD テストの時刻スタブが正しく機能する。
 *
 * See: features/support/world.ts @setCurrentTime
 * See: src/lib/services/handlers/hissi-handler.ts（今日の日付を UTC で計算する同方式）
 *
 * @returns UTC 昨日の日付文字列（YYYY-MM-DD 形式）
 */
function getYesterdayUtc(): string {
	// Date.now() を使用することで時刻スタブが反映される
	const now = new Date(Date.now());
	// UTC の 1日前
	now.setUTCDate(now.getUTCDate() - 1);
	return now.toISOString().slice(0, 10);
}

/**
 * 昨日の日付文字列（YYYY-MM-DD）を JST 基準で生成する。
 * BOT の昨日 dailyId 計算に使用する（BOTパス）。
 *
 * generateDailyId は JST 日付を入力とするため、JST 基準で昨日を計算する必要がある。
 * Date.now() を使用することで BDD テストの時刻スタブが正しく機能する。
 *
 * See: tmp/design_bot_leak_fix.md §3.5
 * See: src/lib/domain/rules/daily-id.ts
 *
 * @returns JST 昨日の日付文字列（YYYY-MM-DD 形式）
 */
function getYesterdayJst(): string {
	const jstOffset = 9 * 60 * 60 * 1000;
	const now = new Date(Date.now());
	const jstDate = new Date(now.getTime() + jstOffset);
	jstDate.setUTCDate(jstDate.getUTCDate() - 1);
	return jstDate.toISOString().slice(0, 10);
}

/**
 * BOT の authorIdSeed 文字列を生成する。
 * post-service.ts の resolveAuth（isBotWrite 分岐）で使用される形式と一致させる。
 *
 * 形式: "bot-{botId}"
 *
 * See: tmp/design_bot_leak_fix.md §5.1
 * See: src/lib/services/post-service.ts > resolveAuth (isBotWrite 分岐)
 * See: src/lib/services/bot-service.ts > executeBotPost (ipHash の生成)
 *
 * @param botId - BOT の UUID
 * @returns authorIdSeed 文字列（例: "bot-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"）
 */
export function getBotAuthorIdSeed(botId: string): string {
	return `bot-${botId}`;
}
