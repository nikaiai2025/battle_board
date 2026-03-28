/**
 * GET /api/admin/bots — BOT一覧取得（管理者）
 *
 * See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - status クエリパラメータに基づくBOT一覧の取得
 *   - レスポンス整形（status に応じたフィールド選定）
 *
 * クエリパラメータ:
 *   - status: "active" | "eliminated"（必須）
 *
 * 設計上の判断:
 *   - 単純なCRUD読み取りのため、route.ts から Repository を直接呼び出す
 *   - 管理者セッション未検証の場合は 403 を返す
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import {
	findActive,
	findEliminated,
} from "@/lib/infrastructure/repositories/bot-repository";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/bots — BOT一覧取得
 *
 * See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Query: status=active | status=eliminated
 *
 * レスポンス:
 *   200: { bots: Bot[] }
 *     - active: id, name, botProfileKey, hp, maxHp, survivalDays, totalPosts, accusedCount
 *     - eliminated: id, name, botProfileKey, survivalDays, eliminatedAt, eliminatedBy
 *   400: status パラメータが未指定または不正
 *   403: 管理者権限なし
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	// --- admin_session Cookie の検証 ---
	const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
	if (!sessionToken) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	const adminSession = await verifyAdminSession(sessionToken);
	if (!adminSession) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	// --- status クエリパラメータの検証 ---
	const status = req.nextUrl.searchParams.get("status");
	if (!status || !["active", "eliminated"].includes(status)) {
		return NextResponse.json(
			{
				error: "BAD_REQUEST",
				message:
					"status パラメータは 'active' または 'eliminated' を指定してください",
			},
			{ status: 400 },
		);
	}

	// --- BOT一覧の取得とレスポンス整形 ---
	if (status === "active") {
		// 活動中BOT: findActive() で取得し、管理画面に必要なフィールドのみ返す
		const bots = await findActive();
		const response = bots.map((bot) => ({
			id: bot.id,
			name: bot.name,
			botProfileKey: bot.botProfileKey,
			hp: bot.hp,
			maxHp: bot.maxHp,
			survivalDays: bot.survivalDays,
			totalPosts: bot.totalPosts,
			accusedCount: bot.accusedCount,
		}));
		return NextResponse.json({ bots: response }, { status: 200 });
	}

	// status === "eliminated"
	// 撃破済みBOT: findEliminated() で取得し、管理画面に必要なフィールドのみ返す
	const bots = await findEliminated();
	const response = bots.map((bot) => ({
		id: bot.id,
		name: bot.name,
		botProfileKey: bot.botProfileKey,
		survivalDays: bot.survivalDays,
		eliminatedAt: bot.eliminatedAt,
		eliminatedBy: bot.eliminatedBy,
	}));
	return NextResponse.json({ bots: response }, { status: 200 });
}
