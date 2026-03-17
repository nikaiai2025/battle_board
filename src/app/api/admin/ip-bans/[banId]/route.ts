/**
 * DELETE /api/admin/ip-bans/{banId} — IP BAN 解除
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 * See: tmp/feature_plan_admin_expansion.md §2-g 管理者API
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - AdminService.unbanIp への委譲
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { unbanIp } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// DELETE /api/admin/ip-bans/{banId} — IP BAN 解除
// ---------------------------------------------------------------------------

/**
 * 指定 BAN ID の IP BAN を解除する。
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: banId（解除する IP BAN レコードの UUID）
 *
 * レスポンス:
 *   200: IP BAN 解除成功
 *   403: 管理者権限なし
 *   404: 指定された IP BAN が存在しない
 */
export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ banId: string }> },
): Promise<NextResponse> {
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

	const { banId } = await params;

	const result = await unbanIp(banId, adminSession.userId);

	if (!result.success) {
		if (result.reason === "not_found") {
			return NextResponse.json(
				{ error: "指定された IP BAN が見つかりません" },
				{ status: 404 },
			);
		}
	}

	return NextResponse.json({ success: true });
}
