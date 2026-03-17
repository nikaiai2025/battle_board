/**
 * POST /api/admin/ip-bans — IP BAN 追加
 * GET  /api/admin/ip-bans — IP BAN 一覧
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 * See: tmp/feature_plan_admin_expansion.md §2-g 管理者API
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - AdminService.banIpByUserId / listActiveIpBans への委譲
 *   - レスポンス整形
 *
 * セキュリティ注意:
 *   - 管理者に IP ハッシュを直接扱わせない
 *   - UI では「BAN済み / 未BAN」の状態表示のみ
 *   - See: tmp/feature_plan_admin_expansion.md §2-g
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { banIpByUserId, listActiveIpBans } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// POST /api/admin/ip-bans — IP BAN 追加
// ---------------------------------------------------------------------------

/**
 * ユーザーの現在のIPをBANする。
 * ユーザーの last_ip_hash を ip_bans テーブルに登録する。
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 * See: tmp/feature_plan_admin_expansion.md §2-d IP BAN 対象の特定方法
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Body: { userId: string, reason?: string }
 *
 * レスポンス:
 *   200: IP BAN 成功（banId を返す）
 *   400: userId が未指定、または last_ip_hash が未設定
 *   403: 管理者権限なし
 *   404: ユーザーが存在しない
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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

	let body: { userId?: string; reason?: string };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	if (!body.userId) {
		return NextResponse.json({ error: "userId が必要です" }, { status: 400 });
	}

	const result = await banIpByUserId(
		body.userId,
		adminSession.userId,
		body.reason,
	);

	if (!result.success) {
		if (result.reason === "not_found") {
			return NextResponse.json(
				{ error: "指定されたユーザーが見つかりません" },
				{ status: 404 },
			);
		}
		if (result.reason === "no_ip_hash") {
			return NextResponse.json(
				{ error: "このユーザーのIPハッシュが記録されていません" },
				{ status: 400 },
			);
		}
	}

	if (!result.success) {
		return NextResponse.json(
			{ error: "IP BAN に失敗しました" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ success: true, banId: result.ban.id });
}

// ---------------------------------------------------------------------------
// GET /api/admin/ip-bans — IP BAN 一覧
// ---------------------------------------------------------------------------

/**
 * 有効な IP BAN 一覧を取得する。
 *
 * See: tmp/feature_plan_admin_expansion.md §2-g GET /api/admin/ip-bans
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *
 * レスポンス:
 *   200: IP BAN 一覧（id, reason, bannedAt, expiresAt のみ。ipHash は返さない）
 *   403: 管理者権限なし
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
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

	const bans = await listActiveIpBans();

	// セキュリティ: ipHash は返さない（管理者にハッシュ値を直接扱わせない）
	// See: tmp/feature_plan_admin_expansion.md §2-g
	const sanitizedBans = bans.map(({ id, reason, bannedAt, expiresAt }) => ({
		id,
		reason,
		bannedAt,
		expiresAt,
	}));

	return NextResponse.json({ bans: sanitizedBans });
}
