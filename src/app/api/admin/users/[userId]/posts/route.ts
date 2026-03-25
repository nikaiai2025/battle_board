/**
 * GET /api/admin/users/[userId]/posts — ユーザー書き込み履歴取得
 *
 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
 * See: tmp/feature_plan_admin_expansion.md §4-b GET /api/admin/users/:id/posts
 *
 * 責務:
 *   - admin_session Cookie の検証
 *   - AdminService.getUserPosts への委譲
 *   - ページネーションパラメータの解釈
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { getUserPosts } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

/**
 * 指定ユーザーの書き込み履歴を取得する（created_at DESC）。
 *
 * Query params:
 *   - limit: 取得件数（デフォルト 50、最大 200）
 *   - offset: スキップ件数（デフォルト 0）
 *
 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
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

		// クエリパラメータ解釈
		const { searchParams } = new URL(request.url);
		const limit = Math.min(
			Number.parseInt(searchParams.get("limit") ?? "50", 10),
			200,
		);
		const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);

		const posts = await getUserPosts(userId, { limit, offset });

		return NextResponse.json({ posts, limit, offset });
	} catch (err) {
		// HIGH-001: 未処理例外を500レスポンスに変換する
		console.error(
			"[GET /api/admin/users/[userId]/posts] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}
