/**
 * GET /api/admin/threads — 管理者用スレッド一覧取得
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 *
 * 責務:
 *   - admin_session Cookie の検証（verifyAdminSession 経由）
 *   - 削除済みを含む全スレッドの取得（findAllForAdmin 経由）
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、Repository への委譲のみ行う（薄いラッパー）
 *   - 管理者セッション未検証の場合は 403 を返す
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { findAllForAdmin } from "@/lib/infrastructure/repositories/thread-repository";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/threads — 管理者用スレッド一覧取得
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *
 * レスポンス:
 *   200: { threads: Thread[] }（削除済みを含む全スレッド、last_post_at DESC）
 *   403: 管理者権限なし（admin_session が無効）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	// --- admin_session Cookie の検証 ---
	// See: docs/architecture/components/admin.md §5 > 認証と認可の分離
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

	// --- 全スレッドを取得（削除済み含む） ---
	// See: src/lib/infrastructure/repositories/thread-repository.ts > findAllForAdmin
	const threads = await findAllForAdmin();

	return NextResponse.json({ threads }, { status: 200 });
}
