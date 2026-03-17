/**
 * GET /api/admin/dashboard/history — ダッシュボードの日次推移取得
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-d GET /api/admin/dashboard/history
 *
 * 責務:
 *   - admin_session Cookie の検証
 *   - AdminService.getDashboardHistory への委譲
 *   - 日付範囲パラメータの解釈
 *   - レスポンス整形
 *
 * 設計方針:
 *   daily_stats テーブルのスナップショットを返す。
 *   本日分はリアルタイム集計のため /dashboard を参照する。
 *   See: tmp/feature_plan_admin_expansion.md §5-e
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { getDashboardHistory } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

/**
 * ダッシュボードの日次推移を取得する（daily_stats スナップショット）。
 *
 * Query params:
 *   - days: 取得日数（デフォルト 7、最大 90）
 *   - fromDate: 開始日（YYYY-MM-DD）。省略時は today - days
 *   - toDate: 終了日（YYYY-MM-DD）。省略時は昨日
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
	const days = Math.min(
		Number.parseInt(searchParams.get("days") ?? "7", 10),
		90,
	);
	const fromDate = searchParams.get("fromDate") ?? undefined;
	const toDate = searchParams.get("toDate") ?? undefined;

	const history = await getDashboardHistory({ days, fromDate, toDate });

	return NextResponse.json({ history, days });
}
