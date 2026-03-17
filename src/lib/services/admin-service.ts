/**
 * AdminService — 管理者操作のユースケース実行サービス
 *
 * See: features/admin.feature
 * See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 * See: docs/architecture/components/posting.md §5 方式B: 独立システムレス
 * See: docs/architecture/architecture.md §3.2 AdminService
 *
 * 責務:
 *   - レスのソフトデリート（is_deleted = true）
 *   - スレッドとその全レスのソフトデリート
 *   - 管理者削除時の「★システム」名義の独立システムレス挿入
 *   - 管理者 ID（adminId）の受け取り（認証済み前提、再検証なし）
 *
 * 設計上の判断:
 *   - AdminService は adminId を信頼する（APIルートで検証済み）
 *   - 削除はソフトデリートのみ（物理削除禁止）
 *   - 削除済みレスの表示文字列はUIの責務（AdminServiceはフラグのみ）
 *   - 削除時のシステムレスは方式B（独立レス）で挿入する
 *
 * See: docs/architecture/components/admin.md §5 設計上の判断
 */

import type { IpBan } from "../infrastructure/repositories/ip-ban-repository";
import * as IpBanRepository from "../infrastructure/repositories/ip-ban-repository";
import * as PostRepository from "../infrastructure/repositories/post-repository";
import * as ThreadRepository from "../infrastructure/repositories/thread-repository";
import * as UserRepository from "../infrastructure/repositories/user-repository";
import { credit, getBalance } from "./currency-service";
import { createPost } from "./post-service";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * レス削除結果。
 * See: features/admin.feature @管理者が指定したレスを削除する
 * See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
 * See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
 */
export type DeletePostResult =
	| { success: true }
	| { success: false; reason: "not_found" };

/**
 * フォールバックメッセージのテンプレート。
 * {postNumber} は実際のレス番号で置換される。
 * See: features/admin.feature @管理者がコメントなしでレスを削除する
 */
const ADMIN_DELETE_FALLBACK_TEMPLATE =
	"🗑️ レス >>{postNumber} は管理者により削除されました";

/**
 * 管理者削除コメントのプレフィックス。
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 */
const ADMIN_DELETE_COMMENT_PREFIX = "🗑️ ";

/**
 * スレッド削除結果。
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 */
export type DeleteThreadResult =
	| { success: true }
	| { success: false; reason: "not_found" };

// ---------------------------------------------------------------------------
// AdminService 関数
// ---------------------------------------------------------------------------

/**
 * 指定したレスをソフトデリートする（is_deleted = true）。
 *
 * 削除後:
 *   - レスの表示位置には「このレスは削除されました」と表示される
 *   - 「★システム」名義の独立システムレスが挿入される（方式B）
 *   - comment が指定されている場合はその内容をシステムレス本文に表示
 *   - comment が未指定の場合はフォールバックメッセージを表示
 *
 * レス番号は欠番にならず保持される。
 * 表示文字列の置換はプレゼンテーション層（UIまたはDATアダプター）の責務。
 *
 * See: features/admin.feature @管理者が指定したレスを削除する
 * See: features/admin.feature @存在しないレスの削除を試みるとエラーになる
 * See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
 * See: features/command_system.feature @管理者がコメントなしでレス削除した場合はフォールバックメッセージで通知される
 * See: docs/architecture/components/admin.md §2 公開インターフェース > deletePost
 * See: docs/architecture/components/posting.md §5 方式B: 独立システムレス
 *
 * @param postId - 削除対象レスの UUID
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @param reason - 削除理由（任意、将来の監査ログ用）
 * @param comment - 削除コメント（任意、システムレス本文に表示する）
 * @returns 削除結果
 */
export async function deletePost(
	postId: string,
	adminId: string,
	reason?: string,
	comment?: string,
): Promise<DeletePostResult> {
	// レスの存在確認
	const post = await PostRepository.findById(postId);
	if (!post) {
		return { success: false, reason: "not_found" };
	}

	// ソフトデリート実行
	// See: docs/architecture/components/admin.md §3.1 依存先 > PostRepository
	await PostRepository.softDelete(postId);

	// 「★システム」名義の独立システムレスを挿入する（方式B）
	// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
	// See: docs/architecture/components/posting.md §5 方式B
	// コメント付き: 🗑️ {comment} / コメントなし: フォールバックテンプレートにレス番号を埋め込む
	// See: features/admin.feature @管理者がコメント付きでレスを削除する
	// See: features/admin.feature @管理者がコメントなしでレスを削除する
	const systemMessageBody = comment
		? `${ADMIN_DELETE_COMMENT_PREFIX}${comment}`
		: ADMIN_DELETE_FALLBACK_TEMPLATE.replace(
				"{postNumber}",
				String(post.postNumber),
			);
	try {
		await createPost({
			threadId: post.threadId,
			body: systemMessageBody,
			edgeToken: null,
			ipHash: "system",
			displayName: "★システム",
			isBotWrite: true, // 認証スキップ
			isSystemMessage: true, // コマンド解析・インセンティブをスキップ
		});
	} catch (err) {
		// システムレス挿入失敗は削除を巻き戻さない（削除自体は成功済み）
		console.error("[AdminService] システムレス挿入失敗:", err);
	}

	// 将来の監査ログ用（現在は簡易ログのみ）
	// See: docs/architecture/components/admin.md §3.1 依存先 > AuditLogRepository (将来)
	console.info(
		`[AdminService] deletePost: postId=${postId} adminId=${adminId} reason=${reason ?? "(なし)"} comment=${comment ?? "(なし)"}`,
	);

	return { success: true };
}

/**
 * 指定したスレッドとその全レスをソフトデリートする。
 *
 * スレッドの is_deleted = true にするとともに、
 * スレッド内の全レスも is_deleted = true にする。
 * スレッド一覧から消え、スレッド内のレスも閲覧不可になる。
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: docs/architecture/components/admin.md §2 公開インターフェース > deleteThread
 *
 * @param threadId - 削除対象スレッドの UUID
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @param reason - 削除理由（任意、将来の監査ログ用）
 * @returns 削除結果
 */
export async function deleteThread(
	threadId: string,
	adminId: string,
	reason?: string,
): Promise<DeleteThreadResult> {
	// スレッドの存在確認
	const thread = await ThreadRepository.findById(threadId);
	if (!thread) {
		return { success: false, reason: "not_found" };
	}

	// スレッドをソフトデリート
	// See: docs/architecture/components/admin.md §3.1 依存先 > ThreadRepository
	await ThreadRepository.softDelete(threadId);

	// スレッド内の全レスをソフトデリート
	// See: features/admin.feature @スレッドとその中の全レスが削除される
	const posts = await PostRepository.findByThreadId(threadId);
	await Promise.all(posts.map((post) => PostRepository.softDelete(post.id)));

	// 将来の監査ログ用（現在は簡易ログのみ）
	console.info(
		`[AdminService] deleteThread: threadId=${threadId} adminId=${adminId} reason=${reason ?? "(なし)"} postsDeleted=${posts.length}`,
	);

	return { success: true };
}

// ---------------------------------------------------------------------------
// BAN 操作
// See: features/admin.feature @ユーザーBAN / IP BAN シナリオ群
// See: tmp/feature_plan_admin_expansion.md §2 IP BAN
// ---------------------------------------------------------------------------

/**
 * ユーザーBAN 結果。
 * See: features/admin.feature @管理者がユーザーをBANする
 */
export type BanUserResult =
	| { success: true }
	| { success: false; reason: "not_found" };

/**
 * 指定ユーザーをBANする（users.is_banned = true）。
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 * See: tmp/feature_plan_admin_expansion.md §2-a BAN の二層構造
 *
 * @param userId - BANする対象ユーザーの UUID
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @returns BAN 結果
 */
export async function banUser(
	userId: string,
	adminId: string,
): Promise<BanUserResult> {
	const user = await UserRepository.findById(userId);
	if (!user) {
		return { success: false, reason: "not_found" };
	}

	await UserRepository.updateIsBanned(userId, true);

	console.info(`[AdminService] banUser: userId=${userId} adminId=${adminId}`);

	return { success: true };
}

/**
 * 指定ユーザーのBANを解除する（users.is_banned = false）。
 *
 * See: features/admin.feature @管理者がユーザーBANを解除する
 *
 * @param userId - BAN解除する対象ユーザーの UUID
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @returns BAN 解除結果
 */
export async function unbanUser(
	userId: string,
	adminId: string,
): Promise<BanUserResult> {
	const user = await UserRepository.findById(userId);
	if (!user) {
		return { success: false, reason: "not_found" };
	}

	await UserRepository.updateIsBanned(userId, false);

	console.info(`[AdminService] unbanUser: userId=${userId} adminId=${adminId}`);

	return { success: true };
}

/**
 * IP BAN 結果。
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 */
export type BanIpResult =
	| { success: true; ban: IpBan }
	| { success: false; reason: "not_found" | "no_ip_hash" };

/**
 * 指定ユーザーの現在のIPをBANする。
 * ユーザーの last_ip_hash を ip_bans テーブルに登録する。
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 * See: tmp/feature_plan_admin_expansion.md §2-d IP BAN 対象の特定方法
 *
 * @param userId - 対象ユーザーの UUID（last_ip_hash でIPを特定）
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @param reason - BAN理由（管理者メモ）。省略可
 * @returns IP BAN 結果（成功時は作成された IpBan を含む）
 */
export async function banIpByUserId(
	userId: string,
	adminId: string,
	reason?: string,
): Promise<BanIpResult> {
	const user = await UserRepository.findById(userId);
	if (!user) {
		return { success: false, reason: "not_found" };
	}

	if (!user.lastIpHash) {
		return { success: false, reason: "no_ip_hash" };
	}

	const ban = await IpBanRepository.create(
		user.lastIpHash,
		reason ?? null,
		adminId,
	);

	console.info(
		`[AdminService] banIpByUserId: userId=${userId} ipHash=***** adminId=${adminId}`,
	);

	return { success: true, ban };
}

/**
 * IP BAN 解除結果。
 * See: features/admin.feature @管理者がIP BANを解除する
 */
export type UnbanIpResult =
	| { success: true }
	| { success: false; reason: "not_found" };

/**
 * 指定 BAN ID の IP BAN を解除する（is_active = false）。
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 * See: tmp/feature_plan_admin_expansion.md §2-e deactivate
 *
 * @param banId - 解除する IP BAN レコードの UUID
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @returns IP BAN 解除結果
 */
export async function unbanIp(
	banId: string,
	adminId: string,
): Promise<UnbanIpResult> {
	const ban = await IpBanRepository.findById(banId);
	if (!ban) {
		return { success: false, reason: "not_found" };
	}

	await IpBanRepository.deactivate(banId);

	console.info(`[AdminService] unbanIp: banId=${banId} adminId=${adminId}`);

	return { success: true };
}

/**
 * 有効な IP BAN 一覧を取得する（管理画面用）。
 *
 * See: tmp/feature_plan_admin_expansion.md §2-g GET /api/admin/ip-bans
 *
 * @returns 有効な IpBan の配列
 */
export async function listActiveIpBans(): Promise<IpBan[]> {
	return IpBanRepository.listActive();
}

// ---------------------------------------------------------------------------
// 通貨付与
// See: features/admin.feature @通貨付与シナリオ群
// See: tmp/feature_plan_admin_expansion.md §3 通貨付与
// ---------------------------------------------------------------------------

/**
 * 通貨付与結果。
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 */
export type GrantCurrencyResult =
	| { success: true; newBalance: number }
	| { success: false; reason: "not_found" | "invalid_amount" };

/**
 * 指定ユーザーに通貨を付与する（admin_grant reason）。
 *
 * CurrencyService.credit を admin_grant reason で呼び出す。
 * amount は正の整数であること。
 *
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 * See: tmp/feature_plan_admin_expansion.md §3 通貨付与
 * See: src/lib/domain/models/currency.ts > CreditReason.admin_grant
 *
 * @param userId - 付与対象ユーザーの UUID
 * @param amount - 付与額（正の整数）
 * @param adminId - 操作を行う管理者の UUID（認証済み前提）
 * @returns 通貨付与結果（成功時は付与後残高を含む）
 */
export async function grantCurrency(
	userId: string,
	amount: number,
	adminId: string,
): Promise<GrantCurrencyResult> {
	// 付与額の検証（正の整数）
	if (!Number.isInteger(amount) || amount <= 0) {
		return { success: false, reason: "invalid_amount" };
	}

	// ユーザーの存在確認
	const user = await UserRepository.findById(userId);
	if (!user) {
		return { success: false, reason: "not_found" };
	}

	// CurrencyService.credit を admin_grant reason で呼び出す
	// See: src/lib/services/currency-service.ts > credit
	await credit(userId, amount, "admin_grant");

	// 付与後残高を取得する
	const newBalance = await getBalance(userId);

	console.info(
		`[AdminService] grantCurrency: userId=${userId} amount=${amount} adminId=${adminId} newBalance=${newBalance}`,
	);

	return { success: true, newBalance };
}
