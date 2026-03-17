/**
 * POST   /api/admin/users/{userId}/ban — ユーザーBAN
 * DELETE /api/admin/users/{userId}/ban — ユーザーBAN 解除
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 * See: features/admin.feature @管理者がユーザーBANを解除する
 * See: tmp/feature_plan_admin_expansion.md §2-g 管理者API
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - AdminService.banUser / unbanUser への委譲
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { banUser, unbanUser } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// POST /api/admin/users/{userId}/ban — ユーザーBAN
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーをBANする。
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: userId（BAN対象ユーザーの UUID）
 *   Body: { reason?: string }（BAN理由。省略可）
 *
 * レスポンス:
 *   200: BAN 成功
 *   403: 管理者権限なし
 *   404: ユーザーが存在しない
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
	try {
		// 管理者セッション検証
		const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
		if (!sessionToken) {
			return NextResponse.json(
				{ error: "管理者セッションが必要です" },
				{ status: 403 },
			);
		}

		const adminSession = await verifyAdminSession(sessionToken);
		if (!adminSession) {
			return NextResponse.json(
				{ error: "管理者権限がありません" },
				{ status: 403 },
			);
		}

		const { userId } = await params;

		const result = await banUser(userId, adminSession.userId);

		if (!result.success) {
			if (result.reason === "not_found") {
				return NextResponse.json(
					{ error: "指定されたユーザーが見つかりません" },
					{ status: 404 },
				);
			}
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		// HIGH-001: 未処理例外を500レスポンスに変換する
		console.error("[POST /api/admin/users/[userId]/ban] Unhandled error:", err);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/{userId}/ban — ユーザーBAN 解除
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーのBANを解除する。
 *
 * See: features/admin.feature @管理者がユーザーBANを解除する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: userId（BAN解除対象ユーザーの UUID）
 *
 * レスポンス:
 *   200: BAN 解除成功
 *   403: 管理者権限なし
 *   404: ユーザーが存在しない
 */
export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
	try {
		// 管理者セッション検証
		const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
		if (!sessionToken) {
			return NextResponse.json(
				{ error: "管理者セッションが必要です" },
				{ status: 403 },
			);
		}

		const adminSession = await verifyAdminSession(sessionToken);
		if (!adminSession) {
			return NextResponse.json(
				{ error: "管理者権限がありません" },
				{ status: 403 },
			);
		}

		const { userId } = await params;

		const result = await unbanUser(userId, adminSession.userId);

		if (!result.success) {
			if (result.reason === "not_found") {
				return NextResponse.json(
					{ error: "指定されたユーザーが見つかりません" },
					{ status: 404 },
				);
			}
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		// HIGH-001: 未処理例外を500レスポンスに変換する
		console.error(
			"[DELETE /api/admin/users/[userId]/ban] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}
