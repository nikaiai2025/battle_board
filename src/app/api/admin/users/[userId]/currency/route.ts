/**
 * POST /api/admin/users/{userId}/currency — 通貨付与
 *
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 * See: features/admin.feature @管理者でないユーザーが通貨付与を試みると権限エラーになる
 * See: tmp/feature_plan_admin_expansion.md §3 通貨付与
 * See: tmp/feature_plan_admin_expansion.md §3-a 管理者API
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - AdminService.grantCurrency への委譲
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { grantCurrency } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// POST /api/admin/users/{userId}/currency — 通貨付与
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーに通貨を付与する。
 *
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: userId（付与対象ユーザーの UUID）
 *   Body: { amount: number }（付与額。正の整数）
 *
 * レスポンス:
 *   200: 付与成功 { success: true, newBalance: number }
 *   400: 不正なリクエスト（amount が不正）
 *   403: 管理者権限なし
 *   404: ユーザーが存在しない
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
	// 管理者セッション検証
	// See: src/lib/services/auth-service.ts > verifyAdminSession
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

	// リクエストボディのパース
	let amount: number;
	try {
		const body = await req.json();
		amount = body.amount;
	} catch {
		return NextResponse.json(
			{ error: "リクエストボディの解析に失敗しました" },
			{ status: 400 },
		);
	}

	// amount の簡易バリデーション
	if (typeof amount !== "number") {
		return NextResponse.json(
			{ error: "amount は数値で指定してください" },
			{ status: 400 },
		);
	}

	const { userId } = await params;

	// AdminService.grantCurrency に委譲
	// See: src/lib/services/admin-service.ts > grantCurrency
	const result = await grantCurrency(userId, amount, adminSession.userId);

	if (!result.success) {
		if (result.reason === "not_found") {
			return NextResponse.json(
				{ error: "指定されたユーザーが見つかりません" },
				{ status: 404 },
			);
		}
		if (result.reason === "invalid_amount") {
			return NextResponse.json(
				{ error: "amount は正の整数で指定してください" },
				{ status: 400 },
			);
		}
	}

	return NextResponse.json({
		success: true,
		newBalance: (result as { success: true; newBalance: number }).newBalance,
	});
}
