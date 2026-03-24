/**
 * GET /api/auth/confirm --- メール確認トークン検証ハンドラ
 *
 * Supabase のカスタムメールテンプレートから直接リンクされるエンドポイント。
 * Supabase デフォルトの /auth/v1/verify リダイレクト（implicit フロー）を経由せず、
 * token_hash を受け取り verifyOtp() でサーバーサイド検証する。
 *
 * メールテンプレート（Supabase ダッシュボードで設定）:
 *   <a href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 * See: https://supabase.com/docs/guides/auth/server-side/email-based-auth-with-pkce-flow-for-ssr
 * See: docs/architecture/components/user-registration.md §7.1 メール認証
 *
 * 責務:
 *   - token_hash + type で Supabase Auth verifyOtp() を呼び出す
 *   - user_metadata から battleboard_user_id（仮ユーザーID）を復元する
 *   - handleEmailConfirmCallback() で本登録完了 + edge-token 発行
 *   - 成功時: /mypage へリダイレクト（edge-token Cookie 設定）
 *   - 失敗時: /auth/error へリダイレクト
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import { createAuthOnlyClient } from "@/lib/infrastructure/supabase/client";
import * as RegistrationService from "@/lib/services/registration-service";

/**
 * GET /api/auth/confirm
 *
 * クエリパラメータ:
 *   - token_hash: Supabase メール確認トークンハッシュ（必須）
 *   - type: OTP 種別 "email" | "signup" 等（必須）
 *   - next: 確認後のリダイレクト先パス（省略時: /mypage）
 *
 * リダイレクト先:
 *   - 成功時: next パラメータの値（デフォルト /mypage）
 *   - 失敗時: /auth/error
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	const { searchParams } = req.nextUrl;
	const tokenHash = searchParams.get("token_hash");
	const type = searchParams.get("type") as EmailOtpType | null;
	const next = searchParams.get("next") ?? "/mypage";

	// --- 必須パラメータチェック ---
	if (!tokenHash || !type) {
		return NextResponse.redirect(new URL("/auth/error", req.nextUrl.origin));
	}

	// --- verifyOtp でメール確認トークンを検証 ---
	// 使い捨てクライアントを使用（supabaseAdmin のセッション状態を汚染しない）
	// See: src/lib/services/registration-service.ts loginWithEmail()（同一パターン）
	const authClient = createAuthOnlyClient();
	const { data, error } = await authClient.auth.verifyOtp({
		type,
		token_hash: tokenHash,
	});

	if (error || !data.user) {
		return NextResponse.redirect(new URL("/auth/error", req.nextUrl.origin));
	}

	// --- user_metadata から battleboard_user_id を復元 ---
	// signUp() 時に options.data.battleboard_user_id として格納済み
	// See: src/lib/services/registration-service.ts registerWithEmail()
	const userId = data.user.user_metadata?.battleboard_user_id as
		| string
		| undefined;
	if (!userId) {
		return NextResponse.redirect(new URL("/auth/error", req.nextUrl.origin));
	}

	// --- 本登録完了 + edge-token 発行 ---
	const result = await RegistrationService.handleEmailConfirmCallback(
		data.user.id,
		userId,
	);

	if (!result.success) {
		return NextResponse.redirect(new URL("/auth/error", req.nextUrl.origin));
	}

	// --- 成功: edge-token Cookie を設定してリダイレクト ---
	const response = NextResponse.redirect(new URL(next, req.nextUrl.origin));

	response.cookies.set(EDGE_TOKEN_COOKIE, result.edgeToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 60 * 60 * 24 * 365,
		path: "/",
	});

	return response;
}
