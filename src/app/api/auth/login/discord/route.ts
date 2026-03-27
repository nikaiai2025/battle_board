/**
 * POST /api/auth/login/discord — Discord ログイン開始
 *
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 * See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * 責務:
 *   - RegistrationService.loginWithDiscord() で Discord OAuth URL を取得
 *   - クライアントにリダイレクト URL を返す
 *
 * 設計上の判断:
 *   - ログインは新デバイス（edge-token なし）のケースが多いため、認証チェックは不要
 *   - redirectTo は `${origin}/api/auth/callback?flow=login` の形式
 *   - See: docs/architecture/components/user-registration.md §13
 */

import { type NextRequest, NextResponse } from "next/server";
import { PKCE_STATE_COOKIE } from "@/lib/constants/cookie-names";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/login/discord
 *
 * Discord アカウントでのログインを開始する。
 * Discord 認可画面の URL を返す（クライアントがリダイレクトする）。
 *
 * リクエスト:
 *   （認証不要）
 *
 * レスポンス:
 *   200: { success: true; redirectUrl: string }（Discord 認可 URL）
 *   500: { success: false; error: string }（サービスエラー）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	try {
		// --- Discord OAuth URL の取得 ---
		// redirectTo: コールバック URL に flow=login を付与する
		// See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
		const origin = req.nextUrl.origin;
		const redirectTo = `${origin}/api/auth/callback?flow=login`;

		const result = RegistrationService.loginWithDiscord(redirectTo);

		// PKCE code_verifier を Cookie に保存する（コールバック時に code exchange で使用）
		const response = NextResponse.json(
			{ success: true, redirectUrl: result.redirectUrl },
			{ status: 200 },
		);
		response.cookies.set(PKCE_STATE_COOKIE, result.codeVerifier, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 60 * 10, // 10分間有効（OAuth フロー完了までの猶予）
			path: "/",
		});
		return response;
	} catch (err) {
		console.error("[POST /api/auth/login/discord] Error:", err);
		return NextResponse.json(
			{ success: false, error: "Discord認証の開始に失敗しました" },
			{ status: 500 },
		);
	}
}
