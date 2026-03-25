/**
 * GET /api/admin/dashboard — ダッシュボードのリアルタイムサマリー取得
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-c GET /api/admin/dashboard
 *
 * 責務:
 *   - admin_session Cookie の検証
 *   - AdminService.getDashboard への委譲
 *   - レスポンス整形
 *
 * 設計方針（リアルタイム集計 vs スナップショット）:
 *   本日分は UserRepository / PostRepository / CurrencyRepository から
 *   直接集計する（リアルタイム）。過去分は /dashboard/history を参照する。
 *   See: tmp/feature_plan_admin_expansion.md §5-e
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { getDashboard } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

/**
 * ダッシュボードのリアルタイムサマリーを取得する。
 *
 * Query params:
 *   - today: 本日日付（YYYY-MM-DD）。省略時はサーバー現在日付
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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

		const { searchParams } = new URL(request.url);
		const today = searchParams.get("today") ?? undefined;

		const summary = await getDashboard({ today });

		return NextResponse.json(summary);
	} catch (err) {
		// HIGH-001: 未処理例外を500レスポンスに変換する
		console.error("[GET /api/admin/dashboard] Unhandled error:", err);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}
