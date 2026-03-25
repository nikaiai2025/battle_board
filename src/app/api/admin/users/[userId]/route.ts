/**
 * GET /api/admin/users/[userId] — ユーザー詳細取得
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 * See: tmp/feature_plan_admin_expansion.md §4-b GET /api/admin/users/:id
 *
 * 責務:
 *   - admin_session Cookie の検証
 *   - AdminService.getUserDetail への委譲
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { getUserDetail } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

/**
 * 指定ユーザーの詳細情報を取得する。
 * 基本情報・通貨残高・書き込み履歴（最新50件）を含む。
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
	try {
		// 管理者セッション検証
		const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
		if (!sessionToken) {
			return NextResponse.json(
				{ error: "FORBIDDEN", message: "管理者権限が必要です" },
				{ status: 403 },
			);
		}

		const admin = await verifyAdminSession(sessionToken);
		if (!admin) {
			return NextResponse.json(
				{ error: "FORBIDDEN", message: "管理者権限が必要です" },
				{ status: 403 },
			);
		}

		const { userId } = await params;
		if (!userId) {
			return NextResponse.json(
				{ error: "userId is required" },
				{ status: 400 },
			);
		}

		const detail = await getUserDetail(userId);
		if (!detail) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		return NextResponse.json(detail);
	} catch (err) {
		// HIGH-001: 未処理例外を500レスポンスに変換する
		console.error("[GET /api/admin/users/[userId]] Unhandled error:", err);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}
