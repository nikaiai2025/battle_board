/**
 * GET /api/admin/users — ユーザー一覧取得（ページネーション付き）
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 * See: tmp/feature_plan_admin_expansion.md §4-b GET /api/admin/users
 *
 * 責務:
 *   - admin_session Cookie の検証
 *   - AdminService.getUserList への委譲
 *   - ページネーションパラメータの解釈
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { getUserList } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

/**
 * ユーザー一覧を取得する。
 *
 * Query params:
 *   - limit: 取得件数（デフォルト 50、最大 200）
 *   - offset: スキップ件数（デフォルト 0）
 *   - orderBy: ソート順（created_at | last_post_date）
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	try {
		// 管理者セッション検証
		const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
		if (!sessionToken) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const admin = await verifyAdminSession(sessionToken);
		if (!admin) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// クエリパラメータ解釈
		const { searchParams } = new URL(request.url);
		const limit = Math.min(
			Number.parseInt(searchParams.get("limit") ?? "50", 10),
			200,
		);
		const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
		const orderByRaw = searchParams.get("orderBy");
		const orderBy =
			orderByRaw === "last_post_date" ? "last_post_date" : "created_at";

		const result = await getUserList({ limit, offset, orderBy });

		return NextResponse.json({
			users: result.users,
			total: result.total,
			limit,
			offset,
		});
	} catch (err) {
		// HIGH-001: 未処理例外を500レスポンスに変換する
		console.error("[GET /api/admin/users] Unhandled error:", err);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}
