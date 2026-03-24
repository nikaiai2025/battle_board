/**
 * PUT    /api/admin/users/{userId}/premium — ユーザーを有料ステータスに変更
 * DELETE /api/admin/users/{userId}/premium — ユーザーを無料ステータスに変更
 *
 * 課金トラブル対応用の管理機能。
 * BAN APIと同じパターンで実装する（POST/DELETE → PUT/DELETE）。
 *
 * See: features/admin.feature @管理者がユーザーを有料ステータスに変更する
 * See: features/admin.feature @管理者がユーザーを無料ステータスに変更する
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - AdminService.setPremiumStatus への委譲
 *   - レスポンス整形
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { setPremiumStatus } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// PUT /api/admin/users/{userId}/premium — ユーザーを有料ステータスに変更
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーを有料ステータスに変更する。
 *
 * See: features/admin.feature @管理者がユーザーを有料ステータスに変更する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: userId（対象ユーザーの UUID）
 *
 * レスポンス:
 *   200: 有料ステータス変更成功
 *   403: 管理者権限なし
 *   404: ユーザーが存在しない
 */
export async function PUT(
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

		// AdminService に委譲して有料ステータスに変更する
		// See: src/lib/services/admin-service.ts > setPremiumStatus
		const result = await setPremiumStatus(userId, true, adminSession.userId);

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
			"[PUT /api/admin/users/[userId]/premium] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/{userId}/premium — ユーザーを無料ステータスに変更
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーを無料ステータスに変更する。
 *
 * 無料への変更時のテーマ・フォント影響は resolveTheme/resolveFont による
 * 動的フォールバックで対応済みのため、このエンドポイントではフラグ更新のみを行う。
 *
 * See: features/admin.feature @管理者がユーザーを無料ステータスに変更する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: userId（対象ユーザーの UUID）
 *
 * レスポンス:
 *   200: 無料ステータス変更成功
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

		// AdminService に委譲して無料ステータスに変更する
		// See: src/lib/services/admin-service.ts > setPremiumStatus
		const result = await setPremiumStatus(userId, false, adminSession.userId);

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
			"[DELETE /api/admin/users/[userId]/premium] Unhandled error:",
			err,
		);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}
}
