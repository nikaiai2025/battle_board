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

import type { PostContext } from "../domain/models/incentive";
import type { Post } from "../domain/models/post";
import type { Thread, ThreadInput } from "../domain/models/thread";
import { parseAnchors } from "../domain/rules/anchor-parser";
import { parseCommand } from "../domain/rules/command-parser";
import { generateDailyId } from "../domain/rules/daily-id";
import {
	validatePostBody,
	validateThreadTitle,
} from "../domain/rules/validation";
import * as PostRepository from "../infrastructure/repositories/post-repository";
import * as ThreadRepository from "../infrastructure/repositories/thread-repository";
import * as UserRepository from "../infrastructure/repositories/user-repository";
import * as AuthService from "./auth-service";
import type {
	CommandExecutionResult,
	CommandService as CommandServiceType,
} from "./command-service";
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
export type PostResult =
	| { success: true; postId: string; postNumber: number; systemMessages: [] }
	| { success: false; error: string; code: string }
	| { authRequired: true; code: string; edgeToken: string };

/**
 * スレッド作成結果型。
 * See: docs/architecture/components/posting.md §2.3 createThread
 */
export interface CreateThreadResult {
	success: boolean;
	thread?: Thread;
	firstPost?: Post;
	error?: string;
	code?: string;
	authRequired?: { code: string; edgeToken: string };
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
 * edge-token が null または not_found の場合に新しい edge-token と認証コードを発行する。
 * not_verified の場合は既存 edge-token を維持したまま認証コードを再発行する（G1 是正）。
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
	| { authenticated: false; authRequired: { code: string; edgeToken: string } }
> {
	// ボット書き込みは認証スキップ
	// See: docs/architecture/components/posting.md §2.1 isBotWrite フラグの扱い
	if (isBotWrite) {
		return { authenticated: true, userId: null, authorIdSeed: ipHash };
	}

	// edge-token が null → 新規ユーザーとして edge-token と認証コードを発行
	if (edgeToken === null) {
		const { token: newToken } = await AuthService.issueEdgeToken(ipHash);
		const { code } = await AuthService.issueAuthCode(ipHash, newToken);
		return {
			authenticated: false,
			authRequired: { code, edgeToken: newToken },
		};
	}

	// edge-token を検証する（IP チェックなし: 存在 + is_verified のみ）
	const verifyResult = await AuthService.verifyEdgeToken(edgeToken, ipHash);

	if (!verifyResult.valid) {
		if (verifyResult.reason === "not_verified") {
			// 未検証（G1 是正）: 認証コード未入力で再書き込みされた場合。
			// 新規 edge-token の発行は不要。既存の edge-token に紐づく認証コードを再発行する。
			// See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
			// See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
			const { code } = await AuthService.issueAuthCode(ipHash, edgeToken);
			return { authenticated: false, authRequired: { code, edgeToken } };
		}

		// not_found: 新規ユーザーとして認証フロー起動
		const { token: newToken } = await AuthService.issueEdgeToken(ipHash);
		const { code } = await AuthService.issueAuthCode(ipHash, newToken);
		return {
			authenticated: false,
			authRequired: { code, edgeToken: newToken },
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
 *   5. コマンド解析 → CommandService.executeCommand
 *   6. レス番号採番（PostRepository.getNextPostNumber）
 *   7. IncentiveService 呼び出し（書き込み報酬計算）
 *   8. inlineSystemInfo 構築（コマンド結果 + 書き込み報酬）
 *   9. レス作成（PostRepository.create）
 *  10. スレッド更新（ThreadRepository.incrementPostCount + updateLastPostAt）
 *  11. PostResult 返却
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
			code: authResult.authRequired.code,
			edgeToken: authResult.authRequired.edgeToken,
		};
	}

	// Step 2b: ユーザーBAN チェック（認証後）
	// BANされたユーザーの書き込みを認証後に拒否する。
	// ボット書き込みはユーザーBAN チェックをスキップする（内部処理）。
	// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
	// See: tmp/feature_plan_admin_expansion.md §2-c BANチェックフロー ③
	if (!input.isBotWrite && authResult.userId) {
		const userBanned = await AuthService.isUserBanned(authResult.userId);
		if (userBanned) {
			return {
				success: false,
				error: "このアカウントは書き込みが禁止されています",
				code: "USER_BANNED",
			};
		}
	}

	// Step 3: ユーザー情報取得（表示名の解決に使用）
	let resolvedDisplayName = input.displayName ?? DEFAULT_DISPLAY_NAME;
	let resolvedAuthorId: string | null = null;

	if (authResult.userId && !input.isBotWrite) {
		const user = await UserRepository.findById(authResult.userId);
		if (user) {
			resolvedAuthorId = user.id;
			// 有料ユーザーかつユーザーネームが設定されている場合は displayName を上書き
			// ただし明示的に displayName が渡された場合はそちらを優先する
			if (!input.displayName && user.isPremium && user.username) {
				resolvedDisplayName = user.username;
			}
		}
	}

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
	// See: docs/architecture/architecture.md §5.2 日次リセットID生成
	const dateJst = getTodayJst();
	const boardId = "battleboard"; // 現時点では固定。将来的にはスレッドから取得
	const authorIdSeed = authResult.authorIdSeed;
	const dailyId = generateDailyId(authorIdSeed, boardId, dateJst);

	// Step 5: コマンド解析 → コマンド実行（方式A: レス内マージ）
	// システムメッセージにはコマンド解析をスキップする
	// See: features/command_system.feature @システムメッセージ内のコマンド文字列は実行されない
	// See: docs/architecture/components/posting.md §5 方式A
	let commandResult: CommandExecutionResult | null = null;
	const isSystemMessage = input.isSystemMessage ?? false;

	// getCommandService() による lazy 初期化 (初回呼び出し時に自動生成)
	// See: tmp/workers/bdd-architect_TASK-147/analysis.md §4.2 Step 3
	const cmdService = getCommandService();
	if (!isSystemMessage && cmdService) {
		try {
			commandResult = await cmdService.executeCommand({
				rawCommand: input.body,
				postId: "", // postId は INSERT 前のためプレースホルダ（コマンド実行には不要）
				threadId: input.threadId,
				userId: resolvedAuthorId ?? "",
			});
		} catch (err) {
			// コマンド実行失敗は書き込みを巻き戻さない
			// See: docs/architecture/components/posting.md §1 分割方針
			console.error("[PostService] CommandService.executeCommand failed:", err);
		}
	}

	// Step 6: レス番号採番
	// See: docs/architecture/architecture.md §7.2 同時実行制御（レス番号採番）
	const postNumber = await PostRepository.getNextPostNumber(input.threadId);

	// Step 7: IncentiveService 同期ボーナス（Phase 1: INSERT前）
	// 同期ボーナス（daily_login, reply, new_thread_join, streak, milestone_post）のみ計算し、
	// 結果を inlineSystemInfo に含める。
	// 遅延評価ボーナス（hot_post, thread_revival, thread_growth）は INSERT + incrementPostCount 後に
	// Phase 2 として別途実行する（方針A: 二段階評価）。
	// See: features/command_system.feature @システムメッセージは書き込み報酬の対象にならない
	// See: docs/architecture/components/incentive.md §5 設計上の判断
	// See: features/incentive.feature @PostService経由の統合
	// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
	let incentiveGranted: { eventType: string; amount: number }[] = [];
	// INSERT 前のため仮 postId を生成する（IncentiveService 内で incentive_log の contextId に使用される）
	const prePostId = `pre-${Date.now()}-${postNumber}`;
	const preCreatedAt = new Date(Date.now());

	// PostContext を構築（同期・遅延の両方で再利用する）
	let postContext: PostContext | null = null;

	if (!isSystemMessage) {
		try {
			// アンカー解析: 本文中の >>N を解析して最初のアンカー先レスを特定する
			const anchors = parseAnchors(input.body);
			let isReplyTo: string | undefined;

			if (anchors.length > 0) {
				// アンカー先レスの著者IDを取得（最初のアンカーのみ対象）
				const targetPosts = await PostRepository.findByThreadId(input.threadId);
				const targetPost = targetPosts.find((p) => p.postNumber === anchors[0]);
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
				postNumber,
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

	// inlineSystemInfo を結合（改行区切り）
	const inlineSystemInfo =
		inlineSystemInfoParts.length > 0 ? inlineSystemInfoParts.join("\n") : null;

	// Step 9: レス作成
	const createdPost = await PostRepository.create({
		threadId: input.threadId,
		postNumber,
		authorId: resolvedAuthorId,
		displayName: resolvedDisplayName,
		dailyId,
		body: input.body,
		inlineSystemInfo,
		isSystemMessage,
	});

	// Step 10: スレッド更新
	// See: docs/architecture/architecture.md §7.1 Step 2
	await ThreadRepository.incrementPostCount(input.threadId);
	await ThreadRepository.updateLastPostAt(input.threadId, new Date(Date.now()));

	// Step 11: IncentiveService 遅延評価ボーナス（Phase 2: INSERT + incrementPostCount後）
	// 対象: hot_post, thread_revival, thread_growth
	// これらは「スレッド全体のレス一覧」「postCount」を参照する必要があるため、
	// INSERT + incrementPostCount の後に実行する。
	// inlineSystemInfo には含めない（他者への付与であり当該書き込みに表示不要）。
	// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
	if (!isSystemMessage && postContext) {
		try {
			// postContext の postId を実際の createdPost.id に更新する
			// （遅延評価ボーナスでは INSERT 済みのレスが threadPosts に含まれるため、
			//  実際の postId を使って正しく除外判定等ができるようにする）
			const deferredContext: PostContext = {
				...postContext,
				postId: createdPost.id,
			};
			await IncentiveService.evaluateOnPost(deferredContext, {
				phase: "deferred",
			});
		} catch (err) {
			// インセンティブ失敗は書き込みを巻き戻さない
			console.error(
				"[PostService] IncentiveService.evaluateOnPost (deferred) failed:",
				err,
			);
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
 * @returns CreateThreadResult
 */
export async function createThread(
	input: ThreadInput,
	edgeToken: string | null,
	ipHash: string,
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

	// Step 2: 認証検証（ボット書き込みは false 固定）
	const authResult = await resolveAuth(edgeToken, ipHash, false);

	if (!authResult.authenticated) {
		// 認証フロー起動
		return {
			success: false,
			authRequired: {
				code: authResult.authRequired.code,
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
	// See: features/thread.feature @1件目のレスとして本文が書き込まれる
	const postResult = await createPost({
		threadId: thread.id,
		body: input.firstPostBody,
		edgeToken,
		ipHash,
		isBotWrite: false,
	});

	// createPost が成功しない場合は createThread も失敗扱いとする
	if ("authRequired" in postResult) {
		// 認証が必要（通常はスレッド作成前に検証済みのため到達しないはずだが念のため）
		return {
			success: false,
			authRequired: {
				code: postResult.code,
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
 * スレッド一覧を取得する（最大50件、last_post_at DESC）。
 *
 * See: features/thread.feature @スレッド一覧には最新50件のみ表示される
 * See: docs/architecture/components/posting.md §2.3 getThreadList
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 * @param limit - 取得件数（デフォルト 50）
 * @returns Thread 配列（last_post_at DESC ソート済み）
 */
export async function getThreadList(
	boardId: string,
	limit?: number,
): Promise<Thread[]> {
	const resolvedLimit = limit ?? THREAD_LIST_MAX_LIMIT;
	return ThreadRepository.findByBoardId(boardId, { limit: resolvedLimit });
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
