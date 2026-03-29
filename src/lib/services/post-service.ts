/**
 * PostService — 書き込み・スレッド管理の統括サービス
 *
 * See: features/posting.feature
 * See: features/thread.feature
 * See: features/incentive.feature @PostService経由の統合
 * See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
 * See: docs/architecture/components/posting.md §2 公開インターフェース
 * See: docs/architecture/components/posting.md §5 システムメッセージの表示方式
 * See: docs/architecture/architecture.md §3.2 PostService
 * See: docs/architecture/architecture.md §7 投稿処理の原子性
 *
 * 責務:
 *   - 書き込み処理の統括（バリデーション → 認証検証 → コマンド解析 → コマンド実行 → インセンティブ → INSERT → スレッド更新）
 *   - スレッド作成（タイトルバリデーション → 認証 → スレッド生成 → 1レス目書き込み）
 *   - スレッド一覧・レス一覧の取得
 *
 * 設計上の判断:
 *   - CommandService: 書き込み本文からコマンドを検出し実行。結果を inlineSystemInfo に設定
 *   - IncentiveService は書き込み成功後に呼び出す（失敗しても書き込みを巻き戻さない）
 *   - システムメッセージ（isSystemMessage=true）にはコマンド解析・インセンティブ付与をスキップ
 *   - 表示名デフォルトは「名無しさん」（ユビキタス言語辞書準拠）
 *   - isBotWrite=true の場合は edge-token 検証をスキップする
 *   - 投稿時の IP 一致チェックは廃止（verifyEdgeToken が「存在 + is_verified」のみで判定する）
 *     See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 */

import type { PostWithBotMark } from "../../types/post-with-bot-mark";
import { DEFAULT_BOARD_ID } from "../domain/constants";
import type { PostContext } from "../domain/models/incentive";
import type { Post } from "../domain/models/post";
import type { Thread, ThreadInput } from "../domain/models/thread";
import { parseAnchors } from "../domain/rules/anchor-parser";
import { parseCommand } from "../domain/rules/command-parser";
import { generateDailyId } from "../domain/rules/daily-id";
import { calcMilestonePostBonus } from "../domain/rules/incentive-rules";
import {
	validatePostBody,
	validateThreadTitle,
} from "../domain/rules/validation";
import * as BotPostRepository from "../infrastructure/repositories/bot-post-repository";
import * as BotRepository from "../infrastructure/repositories/bot-repository";
import * as IncentiveLogRepository from "../infrastructure/repositories/incentive-log-repository";
import * as PendingTutorialRepository from "../infrastructure/repositories/pending-tutorial-repository";
import * as PostRepository from "../infrastructure/repositories/post-repository";
import * as ThreadRepository from "../infrastructure/repositories/thread-repository";
import * as UserRepository from "../infrastructure/repositories/user-repository";
import * as AuthService from "./auth-service";
import type {
	CommandExecutionResult,
	CommandService as CommandServiceType,
} from "./command-service";
import * as CurrencyService from "./currency-service";
import * as IncentiveService from "./incentive-service";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 書き込み入力型。
 * See: docs/architecture/components/posting.md §2.1 入力型（PostInput）
 */
export interface PostInput {
	/** 書き込み先スレッドの UUID */
	threadId: string;
	/** 書き込み本文（UTF-8） */
	body: string;
	/** edge-token（未認証時は null → 認証フロー起動） */
	edgeToken: string | null;
	/** 発行時 IP の SHA-512 ハッシュ */
	ipHash: string;
	/** 表示名（省略 → "名無しさん"） */
	displayName?: string;
	/** メール欄（省略 → ""） */
	email?: string;
	/** ボット書き込みフラグ（true の場合は認証スキップ） */
	isBotWrite: boolean;
	/**
	 * BOT書き込み時のコマンドパイプライン用ユーザーID（bots.id をそのまま使用）。
	 * isBotWrite=true かつ botUserId が指定された場合、コマンドパイプラインの userId にこの値を使用する。
	 * posts.author_id への代入は行わない（FK制約: posts.author_id は REFERENCES users(id)）。
	 * posts.author_id は常に NULL を維持し、BOTとの紐付けは bot_posts テーブルで管理する。
	 * See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	 * See: tmp/reports/2026-03-22_cf_error_investigation.md §問題1 修正方針 案A
	 */
	botUserId?: string;
	/**
	 * システムメッセージフラグ（true の場合はコマンド解析・インセンティブ付与をスキップ）。
	 * See: features/command_system.feature @システムメッセージ内のコマンド文字列は実行されない
	 * See: features/command_system.feature @システムメッセージは書き込み報酬の対象にならない
	 */
	isSystemMessage?: boolean;
}

/**
 * 書き込み結果型。
 * See: docs/architecture/components/posting.md §2.2 出力型（PostResult）
 */
// See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証ページが案内される
export type PostResult =
	| { success: true; postId: string; postNumber: number; systemMessages: [] }
	| { success: false; error: string; code: string }
	| { authRequired: true; edgeToken: string };

/**
 * スレッド作成結果型。
 * See: docs/architecture/components/posting.md §2.3 createThread
 */
// See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証ページが案内される
export interface CreateThreadResult {
	success: boolean;
	thread?: Thread;
	firstPost?: Post;
	error?: string;
	code?: string;
	authRequired?: { edgeToken: string };
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 表示名のデフォルト値。See: docs/requirements/ubiquitous_language.yaml #名無しさん */
const DEFAULT_DISPLAY_NAME = "名無しさん";

/** スレッド一覧の最大取得件数。See: features/thread.feature @最新50件 */
const THREAD_LIST_MAX_LIMIT = 50;

// ---------------------------------------------------------------------------
// CommandService インスタンス管理
// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
// See: docs/architecture/components/posting.md §3.1 依存先 > CommandService
// ---------------------------------------------------------------------------

/**
 * CommandService のシングルトンインスタンス。
 * getCommandService() で lazy 初期化される。
 * setCommandService() で外部から注入する（テスト時はモックを注入する）。
 * null の場合はコマンド解析をスキップする（Phase 1 互換）。
 */
let commandServiceInstance: CommandServiceType | null = null;

/**
 * lazy 初期化の完了フラグ。
 * true の場合は setCommandService() または getCommandService() による初期化が完了済み。
 * 初期化失敗時も true に設定し、再試行を防止する。
 */
let commandServiceAutoInitDone = false;

/**
 * CommandService インスタンスを取得する。
 * 初回呼び出し時に自動生成する（lazy 初期化）。
 * テスト時は setCommandService() でモックを事前注入することで自動生成をバイパスする。
 *
 * 依存モジュール（CommandService, CurrencyService）は動的 require で読み込む。
 * 静的 import にするとテスト環境でモジュールチェーン経由の Supabase 初期化が起きるため。
 *
 * See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
 * See: tmp/workers/bdd-architect_TASK-147/analysis.md §4.2 Step 3
 */
function getCommandService(): CommandServiceType | null {
	if (!commandServiceAutoInitDone && commandServiceInstance === null) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { CommandService } = require("./command-service");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const CurrencyService = require("./currency-service");
			commandServiceInstance = new CommandService(
				CurrencyService,
				null, // accusationService: デフォルト（CommandService 内部で生成）
				undefined, // commandsYamlOverride: デフォルト（config/commands.ts）
				undefined, // attackHandler: デフォルト（CommandService 内部で生成）
				undefined, // grassHandler: デフォルト（CommandService 内部で生成）
				PostRepository, // postNumberResolver: 本番用リゾルバ
			);
		} catch (err) {
			// 初期化失敗はエラーログのみ出力し、再試行しない
			// See: tmp/workers/bdd-architect_TASK-147/analysis.md §4.2 Step 3
			console.error("[PostService] CommandService lazy init failed:", err);
		}
		// 成功・失敗にかかわらずフラグを立てて再試行を防止する
		commandServiceAutoInitDone = true;
	}
	return commandServiceInstance;
}

/**
 * CommandService インスタンスを設定する（DI）。
 * テスト時にモックを注入するために使用する。
 * 本番では getCommandService() による lazy 初期化が使われる。
 * setCommandService(null) を呼び出した場合も commandServiceAutoInitDone=true とし、
 * 明示的な null 設定を尊重して lazy 初期化をバイパスする。
 *
 * See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
 * See: tmp/workers/bdd-architect_TASK-147/analysis.md §4.3 テスト互換性
 *
 * @param service - CommandService インスタンス。null でコマンド機能を無効化する
 */
export function setCommandService(service: CommandServiceType | null): void {
	commandServiceInstance = service;
	// lazy 初期化をバイパスする（null を明示的に設定した場合も含む）
	commandServiceAutoInitDone = true;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * JST 日付文字列（YYYY-MM-DD）を生成する。
 * 日次リセットID の生成に使用する。
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 */
function getTodayJst(): string {
	// Date.now() を使用することで時刻スタブ（BDDテスト）が正しく機能する
	// new Date() のみでは Date.now のスタブが反映されない環境があるため
	// See: features/support/world.ts @setCurrentTime
	const now = new Date(Date.now());
	// JST = UTC+9
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstDate = new Date(now.getTime() + jstOffset);
	return jstDate.toISOString().slice(0, 10);
}

/**
 * 認証フローを実行する。
 * edge-token が null または not_found の場合に新しい edge-token と認証レコードを作成する。
 * not_verified の場合は既存 edge-token を維持したまま認証を再要求する（G1 是正）。
 * IP チェックは廃止。verifyEdgeToken は「edge-token の存在 + is_verified=true」のみで判定する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 * See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
 *
 * @returns 認証成功時は userId と authorIdSeed、認証フロー起動時は authRequired 情報
 */
async function resolveAuth(
	edgeToken: string | null,
	ipHash: string,
	isBotWrite: boolean,
): Promise<
	| { authenticated: true; userId: string | null; authorIdSeed: string }
	| { authenticated: false; authRequired: { edgeToken: string } }
> {
	// ボット書き込みは認証スキップ
	// See: docs/architecture/components/posting.md §2.1 isBotWrite フラグの扱い
	if (isBotWrite) {
		return { authenticated: true, userId: null, authorIdSeed: ipHash };
	}

	// edge-token が null → 新規ユーザーとして edge-token と認証レコードを発行
	if (edgeToken === null) {
		const { token: newToken } = await AuthService.issueEdgeToken(ipHash);
		await AuthService.issueAuthCode(ipHash, newToken);
		return {
			authenticated: false,
			authRequired: { edgeToken: newToken },
		};
	}

	// edge-token を検証する（IP チェックなし: 存在 + is_verified のみ）
	const verifyResult = await AuthService.verifyEdgeToken(edgeToken, ipHash);

	if (!verifyResult.valid) {
		if (verifyResult.reason === "not_verified") {
			// 未検証（G1 是正）: Turnstile 未通過で再書き込みされた場合。
			// 新規 edge-token の発行は不要。既存の edge-token に紐づく認証レコードを再発行する。
			// See: features/authentication.feature @edge-token発行後、Turnstile未通過で再書き込みすると認証が再要求される
			// See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
			await AuthService.issueAuthCode(ipHash, edgeToken);
			return { authenticated: false, authRequired: { edgeToken } };
		}

		// not_found: 新規ユーザーとして認証フロー起動
		const { token: newToken } = await AuthService.issueEdgeToken(ipHash);
		await AuthService.issueAuthCode(ipHash, newToken);
		return {
			authenticated: false,
			authRequired: { edgeToken: newToken },
		};
	}

	return {
		authenticated: true,
		userId: verifyResult.userId,
		authorIdSeed: verifyResult.authorIdSeed,
	};
}

// ---------------------------------------------------------------------------
// 書き込み処理
// ---------------------------------------------------------------------------

/**
 * レスを書き込む。
 *
 * 処理フロー:
 *   1. 本文バリデーション（validatePostBody）
 *   2. isBotWrite=false の場合: edge-token 検証（AuthService.verifyEdgeToken）
 *      - 未認証/not_found: issueEdgeToken → issueAuthCode → authRequired 応答
 *   3. ユーザー情報取得（UserRepository.findById）
 *   4. 日次リセットID 生成（generateDailyId）
 *   4.5. 初回書き込み検出（ウェルカムシーケンス: ボーナス付与 + pendingフラグ）
 *   5. コマンド解析 → CommandService.executeCommand
 *   7. IncentiveService 呼び出し（書き込み報酬計算）
 *   8. inlineSystemInfo 構築（コマンド結果 + 書き込み報酬 + ウェルカムボーナス）
 *   9. レス番号の原子採番 + INSERT（PostRepository.createWithAtomicNumber / RPC 1回）
 *   9a. ウェルカムシーケンス後処理（pending_tutorials INSERT: 実際の postNumber を使用）
 *  10. スレッド更新（ThreadRepository.incrementPostCount + updateLastPostAt）
 *  11. IncentiveService 遅延評価ボーナス
 *  11.5. ウェルカムメッセージ投稿（welcomeMessagePending=true の場合）
 *  12. PostResult 返却
 *
 * See: features/posting.feature @無料ユーザーが書き込みを行う
 * See: features/posting.feature @有料ユーザーがユーザーネーム付きで書き込みを行う
 * See: docs/architecture/architecture.md §7.1 書き込み + コマンド実行の一体処理
 *
 * @param input - 書き込み入力データ
 * @returns PostResult（成功 / 失敗 / 認証要求）
 */
export async function createPost(input: PostInput): Promise<PostResult> {
	// Step 0: 固定スレッドへの書き込みガード
	// is_pinned=true のスレッドへの書き込みは一般ユーザー・ボットともに禁止する。
	// UI でフォームを非表示にしても API 直叩きで書き込み可能なため、サービス層でガードする。
	// See: features/thread.feature @固定スレッドには一般ユーザーが書き込みできない
	// See: tmp/feature_plan_pinned_thread_and_dev_board.md §2-e
	const targetThread = await ThreadRepository.findById(input.threadId);
	if (targetThread?.isPinned) {
		return {
			success: false,
			error: "固定スレッドには書き込みできません",
			code: "PINNED_THREAD",
		};
	}

	// Step 0b: IP BAN チェック（認証前）
	// BANされたIPからの書き込みを認証前に拒否する。
	// ボット書き込みは IP BAN チェックをスキップする（内部処理）。
	// See: features/admin.feature @BANされたIPからの書き込みが拒否される
	// See: tmp/feature_plan_admin_expansion.md §2-c BANチェックフロー ①
	if (!input.isBotWrite) {
		const ipBanned = await AuthService.isIpBanned(input.ipHash);
		if (ipBanned) {
			return {
				success: false,
				error: "このIPアドレスからの書き込みはできません",
				code: "IP_BANNED",
			};
		}
	}

	// Step 1: 本文バリデーション
	// See: docs/architecture/architecture.md §7.4 失敗時の方針（バリデーションエラー → 全体中止）
	const bodyValidation = validatePostBody(input.body);
	if (!bodyValidation.valid) {
		return {
			success: false,
			error: bodyValidation.reason,
			code: bodyValidation.code,
		};
	}

	// Step 2: 認証検証
	const authResult = await resolveAuth(
		input.edgeToken,
		input.ipHash,
		input.isBotWrite,
	);

	if (!authResult.authenticated) {
		// 認証フロー起動: authRequired 応答を返す
		return {
			authRequired: true,
			edgeToken: authResult.authRequired.edgeToken,
		};
	}

	// Step 3 (前倒し): ユーザー情報取得（表示名の解決 + BAN判定に使用）
	// S4-1 最適化: 従来の Step 2b (AuthService.isUserBanned) は UserRepository.findById を
	// 内部で呼ぶため、Step 3 と合わせて同一ユーザーに対し findById が2回実行されていた。
	// Step 3 を前倒しして findById 結果で BAN 判定も行い、1クエリ削減する。
	// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
	// See: tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md §5.1 S4-1
	let resolvedDisplayName = input.displayName ?? DEFAULT_DISPLAY_NAME;
	let resolvedAuthorId: string | null = null;

	if (authResult.userId && !input.isBotWrite) {
		const user = await UserRepository.findById(authResult.userId);
		if (user) {
			// Step 2b 代替: findById 結果から BAN 判定（-1クエリ）
			// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
			if (user.isBanned) {
				return {
					success: false,
					error: "このアカウントは書き込みが禁止されています",
					code: "USER_BANNED",
				};
			}
			resolvedAuthorId = user.id;
			// 有料ユーザーかつユーザーネームが設定されている場合は displayName を上書き
			// ただし明示的に displayName が渡された場合はそちらを優先する
			if (!input.displayName && user.isPremium && user.username) {
				resolvedDisplayName = user.username;
			}
		}
	}

	// Step 3a: BOT書き込み時の author_id は NULL のまま維持する
	// posts.author_id は REFERENCES users(id) の FK制約を持つため、
	// botsテーブルのIDをセットするとFK制約違反（posts_author_id_fkey）が発生する。
	// スキーマ設計の意図: BOTの author_id は NULL、BOTとの紐付けは bot_posts テーブルで管理する。
	// コマンドパイプラインに botUserId を渡す必要がある場合は Step 5 で input.botUserId を直接参照する。
	// See: features/welcome.feature @チュートリアルBOTが書き込みを行う
	// See: tmp/reports/2026-03-22_cf_error_investigation.md §問題1 修正方針 案A
	// See: sql/migrations/00001_create_tables.sql L60 コメント（author_id は人間書き込み時のみ設定）

	// Step 3b: last_ip_hash 更新（認証後・書き込み前）
	// 書き込みリクエストのたびに last_ip_hash を更新する。
	// 管理者が「このIPをBAN」する際の最新IP特定に使用する。
	// See: features/admin.feature @管理者がユーザーのIPをBANする
	// See: tmp/feature_plan_admin_expansion.md §2-c BANチェックフロー ④
	if (!input.isBotWrite && authResult.userId) {
		try {
			await UserRepository.updateLastIpHash(authResult.userId, input.ipHash);
		} catch (err) {
			// last_ip_hash 更新失敗は書き込みを巻き戻さない（副作用）
			console.error("[PostService] updateLastIpHash failed:", err);
		}
	}

	// Step 4: 日次リセットID 生成
	// システムメッセージの場合は "SYSTEM" 固定（モデル定義 post.ts L22 参照）。
	// 通常レスは authorIdSeed・boardId・日付のハッシュから生成する。
	// See: docs/architecture/architecture.md §5.2 日次リセットID生成
	// See: src/lib/domain/models/post.ts @dailyId
	const isSystemMessage = input.isSystemMessage ?? false;
	const dateJst = getTodayJst();
	const boardId = DEFAULT_BOARD_ID; // 現時点では固定。将来的にはスレッドから取得
	const authorIdSeed = authResult.authorIdSeed;
	// let 宣言: Step 5.5 のステルス処理で dailyId を上書きする可能性がある
	// See: features/command_iamsystem.feature @成功時に表示名とIDがシステム風に変更される
	let dailyId = isSystemMessage
		? "SYSTEM"
		: generateDailyId(authorIdSeed, boardId, dateJst);

	// Step 4.5: 初回書き込み検出（ウェルカムシーケンス）
	// 条件: ユーザー書き込み（!isSystemMessage && !isBotWrite）かつ認証済みユーザー（resolvedAuthorId != null）
	// - ① 初回書き込みボーナス +50（CurrencyService.credit）→ inlineSystemInfo に追加
	// - ② ウェルカムメッセージ pending フラグをセット（Step 11.5 で実際に投稿）
	// - ③ pending_tutorials に INSERT（原子INSERT後にRPC戻り値の postNumber で更新）
	//
	// ★ Step 5（コマンド実行）より前に実行する。
	// 初回書き込みにコマンドを含む場合、ボーナス付与前にコマンドの通貨チェックが走ると
	// 残高0で通貨不足エラーになるため、先にボーナスを付与してからコマンドを実行する。
	//
	// isSystemMessage=true の場合は条件を満たさないため、Step 11.5 での createPost 再帰呼び出しで
	// ウェルカムシーケンスは発動しない（無限ループ防止）。
	//
	// See: features/welcome.feature @仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する
	// See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
	// See: features/welcome.feature @初回書き込みにコマンドを含む場合もボーナスが先に付与されコマンドが成功する
	let welcomeBonusText: string | null = null;
	let welcomeMessagePending = false;

	if (!isSystemMessage && !input.isBotWrite && resolvedAuthorId != null) {
		try {
			const postCount = await PostRepository.countByAuthorId(resolvedAuthorId);
			if (postCount === 0) {
				// ① 初回書き込みボーナス +50
				await CurrencyService.credit(resolvedAuthorId, 50, "welcome_bonus");
				welcomeBonusText = "🎉 初回書き込みボーナス！ +50";

				// ② ウェルカムメッセージ（Step 11.5 で投稿）
				welcomeMessagePending = true;

				// ③ pending_tutorials INSERT は Step 9 の RPC 後に実行する
				// （triggerPostNumber に実際の postNumber が必要なため）
			}
		} catch (err) {
			// ウェルカムシーケンス失敗は書き込みを巻き戻さない
			console.error("[PostService] ウェルカムシーケンス処理失敗:", err);
		}
	}

	// Step 5: コマンド解析 → コマンド実行（方式A: レス内マージ）
	// システムメッセージにはコマンド解析をスキップする
	// See: features/command_system.feature @システムメッセージ内のコマンド文字列は実行されない
	// See: docs/architecture/components/posting.md §5 方式A
	let commandResult: CommandExecutionResult | null = null;

	// getCommandService() による lazy 初期化 (初回呼び出し時に自動生成)
	// See: tmp/workers/bdd-architect_TASK-147/analysis.md §4.2 Step 3
	const cmdService = getCommandService();
	if (!isSystemMessage && cmdService) {
		try {
			commandResult = await cmdService.executeCommand({
				rawCommand: input.body,
				postId: "", // postId は INSERT 前のためプレースホルダ（コマンド実行には不要）
				threadId: input.threadId,
				// BOT書き込み時: resolvedAuthorId は FK制約上 null を維持するため、
				// コマンドパイプライン用に input.botUserId を直接参照する。
				// 人間書き込み時: resolvedAuthorId（users.id）を使用する。
				// See: tmp/reports/2026-03-22_cf_error_investigation.md §問題1 修正方針 案A
				userId: input.botUserId ?? resolvedAuthorId ?? "",
				dailyId, // Step 4 で生成済み。ハンドラの表示文字列（"名無しさん(ID:xxx)"）に使用
				// BOT草付与フラグ: BOT書き込み時は grass_reactions INSERT をスキップさせる。
				// BOTのbotUserIdはusersテーブルに存在しないため、giver_idのFK制約違反を回避する。
				// See: tmp/reports/debug_TASK-DEBUG-119.md
				...(input.isBotWrite ? { isBotGiver: true } : {}),
			});
		} catch (err) {
			// コマンド実行失敗は書き込みを巻き戻さない
			// See: docs/architecture/components/posting.md §1 分割方針
			console.error("[PostService] CommandService.executeCommand failed:", err);
		}
	}

	// Step 5.5: ステルス処理（本文除去 + フィールド上書き）
	// ステルスコマンドの3原則を実装する:
	//   成功時: コマンド文字列を本文から除去し、フィールド上書きを適用する
	//   失敗時: コマンド文字列を残す（意図が露出するペナルティ）
	//   除去後の本文が空: 空文字列の書き込みとして投稿する
	// See: features/command_iamsystem.feature
	// See: docs/architecture/components/command.md §5 ステルスコマンドの設計原則
	let resolvedBody = input.body;

	if (
		commandResult?.isStealth &&
		commandResult.success &&
		commandResult.rawCommand
	) {
		// 成功時: コマンド文字列を本文から除去する
		resolvedBody = resolvedBody.replace(commandResult.rawCommand, "").trim();

		// フィールド上書きの適用
		if (commandResult.postFieldOverrides) {
			if (commandResult.postFieldOverrides.displayName !== undefined) {
				resolvedDisplayName = commandResult.postFieldOverrides.displayName;
			}
			if (commandResult.postFieldOverrides.dailyId !== undefined) {
				dailyId = commandResult.postFieldOverrides.dailyId;
			}
		}
	}
	// else: 失敗時 or 非ステルスコマンド → resolvedBody / resolvedDisplayName / dailyId は変更しない

	// Step 7: IncentiveService 同期ボーナス（Phase 1: INSERT前）
	// 同期ボーナス（daily_login, reply, new_thread_join, streak, milestone_post）のみ計算し、
	// 結果を inlineSystemInfo に含める。
	// 遅延評価ボーナス（hot_post, thread_revival, thread_growth）は INSERT + incrementPostCount 後に
	// Phase 2 として別途実行する（方針A: 二段階評価）。
	//
	// postNumber は RPC 前のため仮値 0 を使用する。IncentiveService は postNumber を
	// contextId の一部として使用するのみで、ボーナス計算自体には影響しない。
	//
	// See: features/command_system.feature @システムメッセージは書き込み報酬の対象にならない
	// See: docs/architecture/components/incentive.md §5 設計上の判断
	// See: features/incentive.feature @PostService経由の統合
	// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
	let incentiveGranted: { eventType: string; amount: number }[] = [];
	// INSERT 前のため仮 postId / postNumber を使用する
	const prePostId = `pre-${Date.now()}`;
	const preCreatedAt = new Date(Date.now());

	// PostContext を構築（同期・遅延の両方で再利用する）
	let postContext: PostContext | null = null;

	// S4-2: sync phase で取得したスレッド内レス一覧を保持し、deferred phase で再利用する
	// See: tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md §5.1 S4
	let cachedThreadPosts: Post[] | null = null;

	// BOT書き込み時は IncentiveService をスキップする
	// BOTの botUserId は users テーブルに存在しないため、FK制約違反を起こす無駄なクエリを防ぎ
	// Cloudflare Workers の subrequest 上限到達を回避する
	// See: features/bot_system.feature
	// See: tmp/reports/INCIDENT-CRON500.md
	if (!isSystemMessage && !input.isBotWrite) {
		try {
			// アンカー解析: 本文中の >>N を解析して最初のアンカー先レスを特定する
			// ステルス除去後の resolvedBody を使用する（コマンド文字列は除去済み）
			const anchors = parseAnchors(resolvedBody);
			let isReplyTo: string | undefined;

			if (anchors.length > 0) {
				// アンカー先レスの著者IDを取得（最初のアンカーのみ対象）
				// S4-2: 取得結果を cachedThreadPosts に保持して deferred phase で再利用する
				cachedThreadPosts = await PostRepository.findByThreadId(input.threadId);
				const targetPost = cachedThreadPosts.find(
					(p) => p.postNumber === anchors[0],
				);
				if (targetPost?.authorId) {
					// isReplyTo にはアンカー先レスのID（UUID）を設定する
					// See: src/lib/domain/models/incentive.ts PostContext.isReplyTo
					isReplyTo = targetPost.id;
				}
			}

			postContext = {
				postId: prePostId,
				threadId: input.threadId,
				userId: resolvedAuthorId ?? "",
				postNumber: 0, // 仮値: RPC後に実際の postNumber で上書きする
				createdAt: preCreatedAt,
				isReplyTo,
			};

			// Phase 1: 同期ボーナスのみ評価（INSERT前）
			const incentiveResult = await IncentiveService.evaluateOnPost(
				postContext,
				{ phase: "sync" },
			);
			incentiveGranted = incentiveResult.granted;
		} catch (err) {
			// インセンティブ失敗は書き込みを巻き戻さない
			// See: docs/architecture/components/incentive.md §5 インセンティブ失敗は書き込みを巻き戻さない
			console.error(
				"[PostService] IncentiveService.evaluateOnPost (sync) failed:",
				err,
			);
		}
	}

	// Step 8: inlineSystemInfo 構築
	// コマンド結果 + 書き込み報酬（同期ボーナスのみ）を合成する
	// 遅延評価ボーナスは他者への付与であり当該書き込みの inlineSystemInfo には含めない
	// See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
	// See: features/command_system.feature @書き込み報酬がレス末尾に表示される
	const inlineSystemInfoParts: string[] = [];

	// コマンド結果メッセージを追加
	if (commandResult?.systemMessage) {
		inlineSystemInfoParts.push(commandResult.systemMessage);
	}

	// 書き込み報酬メッセージを追加（同期ボーナスのみ）
	if (incentiveGranted.length > 0) {
		const rewardMessages = incentiveGranted.map(
			(g) => `📝 ${g.eventType} +${g.amount}`,
		);
		inlineSystemInfoParts.push(...rewardMessages);
	}

	// ウェルカムボーナスメッセージを追加（Step 4.5 で設定された場合）
	// See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
	// See: tmp/workers/bdd-architect_TASK-236/design.md §2.5 inlineSystemInfo へのボーナス表示統合
	if (welcomeBonusText != null) {
		inlineSystemInfoParts.push(welcomeBonusText);
	}

	// inlineSystemInfo を結合（改行区切り）
	const inlineSystemInfo =
		inlineSystemInfoParts.length > 0 ? inlineSystemInfoParts.join("\n") : null;

	// Step 9: レス番号の原子採番 + INSERT（RPC 1回で完結）
	// 従来の Step 6 (getNextPostNumber) と Step 9 (create) を統合。
	// DB 側の insert_post_with_next_number で threads 行ロック (FOR UPDATE) を取得し、
	// 採番と INSERT を単一トランザクション内で原子的に実行する。
	// これにより採番〜INSERT間の TOCTOU 競合を解消する。
	// ステルス処理済みの resolvedBody / resolvedDisplayName / dailyId を使用する。
	//
	// See: docs/architecture/architecture.md §7.2 同時実行制御（レス番号採番）
	// See: supabase/migrations/00031_insert_post_with_next_number.sql
	// See: features/command_iamsystem.feature
	const createdPost = await PostRepository.createWithAtomicNumber({
		threadId: input.threadId,
		authorId: resolvedAuthorId,
		displayName: resolvedDisplayName,
		dailyId,
		body: resolvedBody,
		inlineSystemInfo,
		isSystemMessage,
	});

	// Step 9a: ウェルカムシーケンスの後処理（pending_tutorials INSERT）
	// RPC 戻り値の postNumber を使って triggerPostNumber を正確に設定する。
	// See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
	if (welcomeMessagePending && resolvedAuthorId != null) {
		try {
			await PendingTutorialRepository.create({
				userId: resolvedAuthorId,
				threadId: input.threadId,
				triggerPostNumber: createdPost.postNumber,
			});
		} catch (err) {
			// pending_tutorials INSERT 失敗は書き込みを巻き戻さない
			console.error("[PostService] pending_tutorials INSERT 失敗:", err);
		}
	}

	// Step 9b: 独立システムレス投稿（共通）
	// eliminationNotice（撃破通知）または independentMessage（調査結果等）がある場合、
	// ★システム名義の独立レスとして投稿する。
	// eliminationNotice を優先し、なければ independentMessage を使用する。
	// AdminService の削除通知と同パターンを採用する。
	// 投稿失敗は元レスの成功を巻き戻さない（try-catch で保護）。
	// 元レスの INSERT（Step 9）より後に実行する必要がある。
	// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
	// See: features/investigation.feature
	// See: src/lib/services/admin-service.ts L117-138（先行パターン）
	// See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.5
	const independentBody =
		commandResult?.eliminationNotice ??
		commandResult?.independentMessage ??
		null;

	if (independentBody) {
		try {
			await createPost({
				threadId: input.threadId,
				body: independentBody,
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});
		} catch (err) {
			// 独立システムレス挿入失敗は元レスの成功を巻き戻さない
			console.error("[PostService] 独立システムレス挿入失敗:", err);
		}
	}

	// Step 9c: ラストボットボーナス祝福メッセージ投稿
	// lastBotBonusNotice がある場合、eliminationNotice とは別の独立レスとして投稿する。
	// See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
	const lastBotBonusBody = commandResult?.lastBotBonusNotice ?? null;
	if (lastBotBonusBody) {
		try {
			await createPost({
				threadId: input.threadId,
				body: lastBotBonusBody,
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});
		} catch (err) {
			// 祝福メッセージ挿入失敗は元レスの成功を巻き戻さない
			console.error(
				"[PostService] ラストボットボーナス祝福メッセージ挿入失敗:",
				err,
			);
		}
	}

	// Step 9d: キリ番ボーナス（milestone_post）の遅延評価
	// milestone_post は postNumber に依存するが、TOCTOU 修正により postNumber は
	// RPC 戻り値でしか確定しない。Phase 1 (sync) では仮値 0 を渡すため発火しない。
	// そのため RPC 後に postNumber 確定値を使って直接評価する。
	// IncentiveService の sync フェーズから独立させることで、
	// IncentiveService を変更せずに正しい postNumber でキリ番判定を実行する。
	//
	// See: features/incentive.feature Rule: スレッド内のレス番号が100の倍数のとき書き込んだユーザーにボーナス
	// See: docs/architecture/architecture.md §7.2 同時実行制御（レス番号採番）
	if (!isSystemMessage && !input.isBotWrite && resolvedAuthorId) {
		try {
			const milestoneAmount = calcMilestonePostBonus(createdPost.postNumber);
			if (milestoneAmount > 0) {
				const contextDate = getTodayJst();
				const log = await IncentiveLogRepository.create({
					userId: resolvedAuthorId,
					eventType: "milestone_post",
					amount: milestoneAmount,
					contextId: createdPost.id,
					contextDate,
				});
				if (log !== null) {
					await CurrencyService.credit(
						resolvedAuthorId,
						milestoneAmount,
						"incentive_milestone_post",
					);
				}
			}
		} catch (err) {
			// キリ番ボーナス失敗は書き込みを巻き戻さない
			console.error(
				"[PostService] milestone_post ボーナス付与中にエラー:",
				err,
			);
		}
	}

	// Step 10: スレッド更新
	// See: docs/architecture/architecture.md §7.1 Step 2
	await ThreadRepository.incrementPostCount(input.threadId);
	await ThreadRepository.updateLastPostAt(input.threadId, new Date(Date.now()));

	// Step 10b: 休眠管理（D-07 §7.1 step 2b, D-08 posting.md §5）
	// Step 10（last_post_at更新）の後に実行する。
	// 処理順序:
	//   1. 対象スレッドが休眠中（isDormant=true）の場合、is_dormant=false に更新（復活）
	//   2. アクティブスレッド数が上限（50件）を超える場合、末尾スレッドを休眠化
	// 失敗時は例外を上位に伝搬させる（try-catch で握りつぶさない）。
	// See: docs/specs/thread_state_transitions.yaml #transitions
	// See: docs/architecture/components/posting.md §5 休眠管理の責務
	if (targetThread?.isDormant === true) {
		// 休眠中スレッドへの書き込み → 復活させる
		// sage 等のメール欄に関わらず無条件に復活する（TDR-012）
		// See: docs/specs/thread_state_transitions.yaml #transitions unlisted→listed
		await ThreadRepository.wakeThread(input.threadId);
	}
	// アクティブスレッド数が上限を超えた場合、末尾スレッドを休眠化する
	// targetThread は Step 0 のスナップショットを使うが、countActiveThreads は最新のDB状態を参照する
	const activeCount = await ThreadRepository.countActiveThreads(
		targetThread?.boardId ?? DEFAULT_BOARD_ID,
	);
	if (activeCount > THREAD_LIST_MAX_LIMIT) {
		// アクティブ非固定スレッドの中で last_post_at が最古のものを休眠化する
		// See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted
		await ThreadRepository.demoteOldestActiveThread(
			targetThread?.boardId ?? DEFAULT_BOARD_ID,
		);
	}

	// Step 11: IncentiveService 遅延評価ボーナス（Phase 2: INSERT + incrementPostCount後）
	// 対象: hot_post, thread_revival, thread_growth
	// これらは「スレッド全体のレス一覧」「postCount」を参照する必要があるため、
	// INSERT + incrementPostCount の後に実行する。
	// inlineSystemInfo には含めない（他者への付与であり当該書き込みに表示不要）。
	// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
	// BOT書き込み時は遅延評価ボーナスもスキップする（同期ボーナスと同理由）
	// See: features/bot_system.feature
	// See: tmp/reports/INCIDENT-CRON500.md
	if (!isSystemMessage && !input.isBotWrite && postContext) {
		try {
			// postContext の postId を実際の createdPost.id に更新する
			// （遅延評価ボーナスでは INSERT 済みのレスが threadPosts に含まれるため、
			//  実際の postId を使って正しく除外判定等ができるようにする）
			// postContext の postId/postNumber を実際の値に更新する
			const deferredContext: PostContext = {
				...postContext,
				postId: createdPost.id,
				postNumber: createdPost.postNumber,
			};

			// S4-2: sync phase で取得済みの threadPosts を deferred phase に渡し、重複クエリを削減
			// See: tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md §5.1 S4
			// 注: S4-3 (cachedThread) は locked_files 外テストとの互換性のため見送り
			const deferredOptions: IncentiveService.EvaluateOnPostOptions = {
				phase: "deferred" as const,
			};
			// S4-2: cachedThreadPosts に新規レスを追加して渡す（-1クエリ）
			if (cachedThreadPosts) {
				deferredOptions.cachedThreadPosts = [...cachedThreadPosts, createdPost];
			}

			await IncentiveService.evaluateOnPost(deferredContext, deferredOptions);
		} catch (err) {
			// インセンティブ失敗は書き込みを巻き戻さない
			console.error(
				"[PostService] IncentiveService.evaluateOnPost (deferred) failed:",
				err,
			);
		}
	}

	// Step 11.5: ウェルカムメッセージ投稿（初回書き込み時のみ）
	// Step 4.5 で welcomeMessagePending=true になった場合、「★システム」名義の独立システムレスを投稿する。
	// isBotWrite=true は「認証スキップ」の意味で使用している（設計上の判断は design.md §2.1 参照）。
	// isSystemMessage=true により Step 4.5 の条件（!isSystemMessage）を満たさず、無限ループにならない。
	// 投稿失敗は元レスの成功を巻き戻さない（try-catch で保護）。
	//
	// See: features/welcome.feature @初回書き込みの直後にウェルカムメッセージが独立システムレスで表示される
	// See: tmp/workers/bdd-architect_TASK-236/design.md §2.1 Step 11.5
	if (welcomeMessagePending) {
		try {
			await createPost({
				threadId: input.threadId,
				body: `>>${createdPost.postNumber} Welcome to Underground...\nここはBOTと人間が入り混じる対戦型掲示板です`,
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});
		} catch (err) {
			// ウェルカムメッセージ投稿失敗は元レスの成功を巻き戻さない
			console.error("[PostService] ウェルカムメッセージ投稿失敗:", err);
		}
	}

	return {
		success: true,
		postId: createdPost.id,
		postNumber: createdPost.postNumber,
		systemMessages: [],
	};
}

// ---------------------------------------------------------------------------
// スレッド作成
// ---------------------------------------------------------------------------

/**
 * スレッドを作成し、1レス目を書き込む。
 *
 * 処理フロー:
 *   1. タイトルバリデーション（validateThreadTitle）+ 本文バリデーション
 *   2. 認証検証（createPost と同様のフロー）
 *   3. threadKey 生成（UNIX タイムスタンプ 10 桁）
 *   4. スレッド作成（ThreadRepository.create）
 *   5. 1レス目を createPost のロジックで書き込み
 *   6. 結果返却
 *
 * See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
 * See: docs/architecture/components/posting.md §2.3 createThread
 *
 * @param input - スレッド作成入力データ
 * @param edgeToken - edge-token（Cookie から取得。未認証時は null）
 * @param ipHash - クライアント IP の SHA-512 ハッシュ
 * @param isBotWrite - BOT書き込みフラグ（true の場合は認証スキップ）。デフォルト false。
 *   createPost と同じパターンで、BOT書き込み時は resolveAuth をスキップする。
 *   See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
 * @returns CreateThreadResult
 */
export async function createThread(
	input: ThreadInput,
	edgeToken: string | null,
	ipHash: string,
	isBotWrite = false,
): Promise<CreateThreadResult> {
	// Step 1: タイトルバリデーション
	// See: features/thread.feature @スレッドタイトルが空の場合はスレッドが作成されない
	const titleValidation = validateThreadTitle(input.title);
	if (!titleValidation.valid) {
		return {
			success: false,
			error: titleValidation.reason,
			code: titleValidation.code,
		};
	}

	// Step 1b: 1レス目本文バリデーション
	const bodyValidation = validatePostBody(input.firstPostBody);
	if (!bodyValidation.valid) {
		return {
			success: false,
			error: bodyValidation.reason,
			code: bodyValidation.code,
		};
	}

	// Step 2: 認証検証
	// BOT書き込み時（isBotWrite=true）は resolveAuth をスキップし、createPost と同じパターンで処理する。
	// See: docs/architecture/components/posting.md §2.1 isBotWrite フラグの扱い
	const authResult = await resolveAuth(edgeToken, ipHash, isBotWrite);

	if (!authResult.authenticated) {
		// 認証フロー起動
		return {
			success: false,
			error: "認証が必要です",
			authRequired: {
				edgeToken: authResult.authRequired.edgeToken,
			},
		};
	}

	// Step 3: threadKey 生成（10 桁 UNIX タイムスタンプ）
	// See: タスク指示書 > 補足・制約 > threadKey は Math.floor(Date.now() / 1000).toString()
	const threadKey = Math.floor(Date.now() / 1000).toString();

	// createdBy の決定
	const createdBy = authResult.userId ?? "system";

	// Step 4: スレッド作成
	const thread = await ThreadRepository.create({
		threadKey,
		boardId: input.boardId,
		title: input.title,
		createdBy,
		isPinned: false,
	});

	// Step 5: 1レス目を createPost のロジックで書き込み
	// BOT書き込み時は isBotWrite フラグを伝播させる。
	// See: features/thread.feature @1件目のレスとして本文が書き込まれる
	const postResult = await createPost({
		threadId: thread.id,
		body: input.firstPostBody,
		edgeToken,
		ipHash,
		isBotWrite,
	});

	// createPost が成功しない場合は createThread も失敗扱いとする
	if ("authRequired" in postResult) {
		// 認証が必要（通常はスレッド作成前に検証済みのため到達しないはずだが念のため）
		return {
			success: false,
			error: "認証が必要です",
			authRequired: {
				edgeToken: postResult.edgeToken,
			},
		};
	}

	if (!postResult.success) {
		return {
			success: false,
			error: postResult.error,
			code: postResult.code,
		};
	}

	// スレッド作成後に作成した Post を取得するため、postId を使って Post を返す
	// PostRepository に findById があるが、createPost の戻り値から postNumber を取得済み
	// firstPost を返すために postId から Post を復元する
	// 簡易実装: createPost が返した情報でミニマルな Post オブジェクトを構築する
	const firstPostCreatedAt = new Date(Date.now());
	const firstPost: Post = {
		id: postResult.postId,
		threadId: thread.id,
		postNumber: postResult.postNumber,
		authorId: authResult.userId,
		displayName: DEFAULT_DISPLAY_NAME,
		dailyId: "unknown", // テスト・UI では使わない（スレッド作成成功の確認に使用）
		body: input.firstPostBody,
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: firstPostCreatedAt,
	};

	// Step 6: スレッド作成ボーナス — IncentiveService 呼び出し（isThreadCreation=true）
	// createPost 内でも evaluateOnPost が呼ばれるが、スレッド作成ボーナスは別途付与が必要
	// IncentiveService 側の重複ガード（ON CONFLICT DO NOTHING）により二重付与は発生しない
	// See: features/incentive.feature @スレッド作成時のボーナス
	// See: docs/architecture/components/incentive.md §5 インセンティブ失敗は書き込みを巻き戻さない
	try {
		const threadCreationContext: PostContext = {
			postId: postResult.postId,
			threadId: thread.id,
			userId: authResult.userId ?? "",
			postNumber: postResult.postNumber,
			createdAt: firstPostCreatedAt,
		};
		await IncentiveService.evaluateOnPost(threadCreationContext, {
			isThreadCreation: true,
		});
	} catch (err) {
		// インセンティブ失敗は書き込みを巻き戻さない
		console.error(
			"[PostService] IncentiveService.evaluateOnPost (thread_creation) failed:",
			err,
		);
	}

	return {
		success: true,
		thread,
		firstPost,
	};
}

// ---------------------------------------------------------------------------
// 読み取り操作
// ---------------------------------------------------------------------------

/**
 * スレッド一覧を取得する（アクティブスレッドのみ、last_post_at DESC）。
 * LIMIT 方式から onlyActive 方式に移行済み。
 * スレッド数の制御は書き込み時の休眠管理（Step 10b）で行われる。
 *
 * See: features/thread.feature @スレッド一覧には最新50件のみ表示される
 * See: docs/architecture/components/posting.md §2.3 getThreadList
 * See: docs/specs/thread_state_transitions.yaml #listing_rules LIMIT不使用
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 * @returns Thread 配列（last_post_at DESC ソート済み、is_dormant=false のみ）
 */
export async function getThreadList(boardId: string): Promise<Thread[]> {
	return ThreadRepository.findByBoardId(boardId, { onlyActive: true });
}

/**
 * レス一覧取得オプション型。
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.4 PostService改修
 */
export interface PostListOptions {
	/** ポーリング用差分取得: この番号以降のレスを取得する */
	fromPostNumber?: number;
	/** 範囲指定: start 〜 end のレスを取得する */
	range?: { start: number; end: number };
	/** 最新N件: 最新 latestCount 件を取得する */
	latestCount?: number;
}

/**
 * スレッド内のレス一覧を取得する（post_number ASC）。
 * range / latestCount オプションによりページネーション範囲指定に対応する。
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/thread.feature @pagination
 * See: docs/architecture/components/posting.md §2.3 getPostList
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.4
 *
 * @param threadId - スレッドの UUID
 * @param options - 取得オプション（fromPostNumber / range / latestCount）
 * @returns Post 配列（post_number ASC ソート済み）
 */
export async function getPostList(
	threadId: string,
	options?: PostListOptions,
): Promise<Post[]> {
	return PostRepository.findByThreadId(threadId, options ?? {});
}

/**
 * スレッドを ID で取得する。
 *
 * See: features/thread.feature @一覧外のスレッドにURLで直接アクセスできる
 * See: docs/architecture/components/posting.md §2.3 getThread
 *
 * @param threadId - スレッドの UUID
 * @returns Thread、存在しない場合は null
 */
export async function getThread(threadId: string): Promise<Thread | null> {
	return ThreadRepository.findById(threadId);
}

/**
 * スレッドを threadKey で取得する。
 * 新URL形式 /{boardId}/{threadKey}/ でのスレッド閲覧に使用する。
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.4
 *
 * @param threadKey - 専ブラ互換キー（10桁 UNIX タイムスタンプ）
 * @returns Thread、存在しない場合は null
 */
export async function getThreadByThreadKey(
	threadKey: string,
): Promise<Thread | null> {
	return ThreadRepository.findByThreadKey(threadKey);
}

/**
 * レス一覧にbotMark情報を合成して返却する。
 * 撃破済み（is_active=false）のBOTの書き込みにのみbotMarkを付与する。
 * 活動中（is_active=true）のBOTの情報は一切含めない（セキュリティ上の必須制約）。
 *
 * 合成ロジック:
 *   1. posts = PostRepository.findByThreadId(threadId, options)
 *   2. postIds = posts.map(p => p.id)
 *   3. botPosts = BotPostRepository.findByPostIds(postIds)
 *   4. botIds = unique(botPosts.map(bp => bp.botId))
 *   5. bots = BotRepository.findByIds(botIds)
 *   6. eliminatedBotIds = Set(bots.filter(b => !b.isActive).map(b => b.id))
 *   7. botPostMap = Map(botPosts postId -> botId)（撃破済みBOTのみ）
 *   8. posts に botMark を合成して返却
 *
 * セキュリティ制約:
 *   is_active=true のBOTの書き込みにbotMarkを付与してはならない。
 *   これはゲームの根幹「AIか人間か分からない」を破壊するため。
 *
 * See: features/bot_system.feature @撃破済みボットのレスはWebブラウザで目立たない表示になる
 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.4 合成ロジック
 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.5 セキュリティ
 *
 * @param threadId スレッドのUUID
 * @param options PostListOptions
 * @returns botMark付きPost配列
 */
export async function getPostListWithBotMark(
	threadId: string,
	options?: PostListOptions,
): Promise<PostWithBotMark[]> {
	// Step 1: レス一覧取得
	const posts = await PostRepository.findByThreadId(threadId, options ?? {});

	if (posts.length === 0) {
		return [];
	}

	// Step 2: post_id 一覧を抽出
	const postIds = posts.map((p) => p.id);

	// Step 3: bot_posts 紐付けレコードを一括取得（N+1回避）
	const botPosts = await BotPostRepository.findByPostIds(postIds);

	if (botPosts.length === 0) {
		// BOTの書き込みが一件もない場合、全レスのbotMarkをnullにして返却
		return posts.map((p) => ({ ...p, botMark: null }));
	}

	// Step 4: 重複なしのbot_id一覧を抽出
	const botIdSet = [...new Set(botPosts.map((bp) => bp.botId))];

	// Step 5: ボット情報を一括取得
	const bots = await BotRepository.findByIds(botIdSet);

	// Step 6: 撃破済みBOT（is_active=false）のid一覧を Set で管理
	// セキュリティ: is_active=true のBOTはeliminatedBotIdsに含めない
	const eliminatedBotIds = new Set(
		bots.filter((b) => !b.isActive).map((b) => b.id),
	);

	// Step 7: postId -> botId のマップを構築（撃破済みBOTのものだけフィルタ）
	const botPostMap = new Map<string, string>();
	for (const bp of botPosts) {
		if (eliminatedBotIds.has(bp.botId)) {
			botPostMap.set(bp.postId, bp.botId);
		}
	}

	// Step 8: posts に botMark を合成
	return posts.map((p) => {
		const botId = botPostMap.get(p.id);
		if (botId) {
			const bot = bots.find((b) => b.id === botId);
			if (bot) {
				return { ...p, botMark: { hp: bot.hp, maxHp: bot.maxHp } };
			}
		}
		return { ...p, botMark: null };
	});
}
