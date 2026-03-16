/**
 * POST /api/auth/logout — ログアウト API エンドポイント
 *
 * See: features/未実装/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 * See: docs/architecture/components/user-registration.md §5.3 ログアウト
 *
 * 責務:
 *   - Cookie から edge-token を読み取る
 *   - RegistrationService.logout() への委譲（edge_tokens テーブルから削除）
 *   - edge-token Cookie を削除
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ログアウトは当該デバイスのみに影響する（他デバイスの edge-token は有効のまま）
 *   - edge-token Cookie の削除は Route Handler が担当
 *   - edge-token が存在しない場合（未ログイン状態）でも 200 を返す（冪等性）
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/logout
 *
 * ログアウト処理。当該デバイスのセッション（edge-token）を破棄する。
 *
 * リクエスト:
 *   Cookie: edge-token（オプション。ない場合は何もせず200を返す）
 *
 * レスポンス:
 *   200: { success: true }（ログアウト完了、または既にログアウト済み）
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
	// --- edge-token の取得 ---
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

	// edge-token がない場合はすでにログアウト済みとして 200 を返す（冪等性）
	if (edgeToken) {
		// --- RegistrationService への委譲 ---
		// edge_tokens テーブルから当該トークンの行を削除する
		await RegistrationService.logout(edgeToken);
	}

	// --- edge-token Cookie を削除 ---
	const response = NextResponse.json({ success: true }, { status: 200 });
	response.cookies.delete(EDGE_TOKEN_COOKIE);

	return response;
}
