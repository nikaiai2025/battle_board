/**
 * AdminService — 管理者操作のユースケース実行サービス
 *
 * See: features/phase1/admin.feature
 * See: features/phase2/command_system.feature @管理者のレス削除がシステムレスとして通知される
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

import * as PostRepository from "../infrastructure/repositories/post-repository";
import * as ThreadRepository from "../infrastructure/repositories/thread-repository";
import { createPost } from "./post-service";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * レス削除結果。
 * See: features/phase1/admin.feature @管理者が指定したレスを削除する
 * See: features/phase1/admin.feature @存在しないレスの削除を試みるとエラーになる
 * See: features/phase2/command_system.feature @管理者のレス削除がシステムレスとして通知される
 */
export type DeletePostResult =
	| { success: true }
	| { success: false; reason: "not_found" };

/**
 * フォールバックメッセージのテンプレート。
 * {postNumber} は実際のレス番号で置換される。
 * See: features/phase1/admin.feature @管理者がコメントなしでレスを削除する
 */
const ADMIN_DELETE_FALLBACK_TEMPLATE =
	"🗑️ レス >>{postNumber} は管理者により削除されました";

/**
 * 管理者削除コメントのプレフィックス。
 * See: features/phase1/admin.feature @管理者がコメント付きでレスを削除する
 */
const ADMIN_DELETE_COMMENT_PREFIX = "🗑️ ";

/**
 * スレッド削除結果。
 * See: features/phase1/admin.feature @管理者が指定したスレッドを削除する
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
 * See: features/phase1/admin.feature @管理者が指定したレスを削除する
 * See: features/phase1/admin.feature @存在しないレスの削除を試みるとエラーになる
 * See: features/phase2/command_system.feature @管理者のレス削除がシステムレスとして通知される
 * See: features/phase2/command_system.feature @管理者がコメントなしでレス削除した場合はフォールバックメッセージで通知される
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
	// See: features/phase2/command_system.feature @管理者のレス削除がシステムレスとして通知される
	// See: docs/architecture/components/posting.md §5 方式B
	// コメント付き: 🗑️ {comment} / コメントなし: フォールバックテンプレートにレス番号を埋め込む
	// See: features/phase1/admin.feature @管理者がコメント付きでレスを削除する
	// See: features/phase1/admin.feature @管理者がコメントなしでレスを削除する
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
 * See: features/phase1/admin.feature @管理者が指定したスレッドを削除する
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
	// See: features/phase1/admin.feature @スレッドとその中の全レスが削除される
	const posts = await PostRepository.findByThreadId(threadId);
	await Promise.all(posts.map((post) => PostRepository.softDelete(post.id)));

	// 将来の監査ログ用（現在は簡易ログのみ）
	console.info(
		`[AdminService] deleteThread: threadId=${threadId} adminId=${adminId} reason=${reason ?? "(なし)"} postsDeleted=${posts.length}`,
	);

	return { success: true };
}
