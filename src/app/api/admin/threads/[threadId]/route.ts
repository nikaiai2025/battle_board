/**
 * GET  /api/admin/threads/{threadId} — スレッド詳細 + レス一覧取得（管理者）
 * DELETE /api/admin/threads/{threadId} — スレッド削除（管理者）
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
 * See: docs/specs/openapi.yaml > /api/admin/threads/{threadId}
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 * See: docs/architecture/components/admin.md §5 設計上の判断 > 認証と認可の分離
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - GET: スレッド詳細 + 全レス（削除済み含む）の返却
 *   - DELETE: AdminService.deleteThread への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、Service/Repository への委譲のみ行う
 *   - 管理者セッション未検証の場合は 403 を返す
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { findByThreadId as findPostsByThreadId } from "@/lib/infrastructure/repositories/post-repository";
import { findById as findThreadById } from "@/lib/infrastructure/repositories/thread-repository";
import { deleteThread } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// 認証ヘルパー
// ---------------------------------------------------------------------------

/**
 * admin_session Cookie を検証し、セッション情報を返す。
 * 無効な場合は null を返す。
 * See: docs/architecture/components/admin.md §5 > 認証と認可の分離
 */
async function verifySession(req: NextRequest) {
	const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
	if (!sessionToken) return null;
	return verifyAdminSession(sessionToken);
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/threads/{threadId} — スレッド詳細 + レス一覧取得（管理者）
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: threadId（対象スレッドの UUID）
 *
 * レスポンス:
 *   200: { thread: Thread, posts: Post[] }（削除済みレス含む、post_number ASC）
 *   403: 管理者権限なし（admin_session が無効）
 *   404: スレッドが存在しない
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
	const { threadId } = await params;

	// --- admin_session Cookie の検証 ---
	const adminSession = await verifySession(req);
	if (!adminSession) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	// --- スレッド取得 ---
	// See: src/lib/infrastructure/repositories/thread-repository.ts > findById
	const thread = await findThreadById(threadId);
	if (!thread) {
		return NextResponse.json(
			{ error: "NOT_FOUND", message: "指定されたスレッドが見つかりません" },
			{ status: 404 },
		);
	}

	// --- レス一覧取得（削除済み含む、post_number ASC）---
	// See: src/lib/infrastructure/repositories/post-repository.ts > findByThreadId
	const posts = await findPostsByThreadId(threadId);

	return NextResponse.json({ thread, posts }, { status: 200 });
}

/**
 * DELETE /api/admin/threads/{threadId} — スレッド削除（管理者）
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: docs/specs/openapi.yaml > /api/admin/threads/{threadId}
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: threadId（削除対象スレッドの UUID）
 *
 * レスポンス:
 *   200: 削除成功（スレッドと全レスが削除）
 *   403: 管理者権限なし（admin_session が無効）
 *   404: スレッドが存在しない
 */
export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
	const { threadId } = await params;

	// --- admin_session Cookie の検証 ---
	// See: docs/architecture/components/admin.md §5 > 認証と認可の分離
	// See: src/lib/constants/cookie-names.ts
	const adminSession = await verifySession(req);
	if (!adminSession) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	// --- AdminService へ委譲 ---
	const result = await deleteThread(threadId, adminSession.userId);

	// --- レスポンス整形 ---
	if (!result.success) {
		if (result.reason === "not_found") {
			return NextResponse.json(
				{ error: "NOT_FOUND", message: "指定されたスレッドが見つかりません" },
				{ status: 404 },
			);
		}
	}

	return NextResponse.json({ message: "削除しました" }, { status: 200 });
}
