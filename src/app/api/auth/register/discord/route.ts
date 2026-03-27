/**
 * POST /api/auth/register/discord — Discord 本登録開始
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 * See: docs/architecture/components/user-registration.md §7.2 Discord連携
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * 責務:
 *   - edge-token Cookie から仮ユーザーを特定（AuthService.verifyEdgeToken()）
 *   - RegistrationService.registerWithDiscord() で Discord OAuth URL を取得
 *   - クライアントにリダイレクト URL を返す
 *
 * 設計上の判断:
 *   - Cookie操作はRoute Handlerが担当（RegistrationServiceはCookieを触らない）
 *   - redirectTo は `${origin}/api/auth/callback?flow=register&userId=${userId}` の形式
 *   - See: docs/architecture/components/user-registration.md §13
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
	EDGE_TOKEN_COOKIE,
	PKCE_STATE_COOKIE,
} from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/register/discord
 *
 * 仮ユーザーが Discord アカウントで本登録を開始する。
 * Discord 認可画面の URL を返す（クライアントがリダイレクトする）。
 *
 * リクエスト:
 *   Cookie: edge-token（認証済みの仮ユーザートークン）
 *
 * レスポンス:
 *   200: { success: true; redirectUrl: string }（Discord 認可 URL）
 *   401: { success: false; error: string }（未認証）
 *   500: { success: false; error: string }（サービスエラー）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- edge-token による認証確認 ---
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

	if (!edgeToken) {
		return NextResponse.json(
			{ success: false, error: "認証が必要です" },
			{ status: 401 },
		);
	}

	// verifyEdgeToken で仮ユーザーを特定（ipHash は未使用だが互換性のためダミーを渡す）
	// See: docs/architecture/components/user-registration.md §5.5 edge-token検証
	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");

	if (!authResult.valid) {
		return NextResponse.json(
			{ success: false, error: "認証が必要です。再度認証してください" },
			{ status: 401 },
		);
	}

	const { userId } = authResult;

	try {
		// --- Discord OAuth URL の取得 ---
		// redirectTo: コールバック URL に flow=register と userId を付与する
		// See: docs/architecture/components/user-registration.md §7.2 Discord連携
		const origin = req.nextUrl.origin;
		const redirectTo = `${origin}/api/auth/callback?flow=register&userId=${userId}`;

		const result = await RegistrationService.registerWithDiscord(redirectTo);

		// PKCE ストレージを Cookie に保存する（コールバック時に code_verifier を復元するため）
		// See: src/lib/infrastructure/supabase/client.ts createPkceOAuthClient()
		const response = NextResponse.json(
			{ success: true, redirectUrl: result.redirectUrl },
			{ status: 200 },
		);
		response.cookies.set(
			PKCE_STATE_COOKIE,
			JSON.stringify(result.pkceStorage),
			{
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				maxAge: 60 * 10, // 10分間有効（OAuth フロー完了までの猶予）
				path: "/",
			},
		);
		return response;
	} catch (err) {
		console.error("[POST /api/auth/register/discord] Error:", err);
		return NextResponse.json(
			{ success: false, error: "Discord本登録の開始に失敗しました" },
			{ status: 500 },
		);
	}
}
