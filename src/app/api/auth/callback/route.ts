/**
 * GET /api/auth/callback — OAuth / メール確認共通コールバック
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md §7.1, §7.2, §7.3 フロー詳細
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * 責務:
 *   - Discord本登録フロー（flow=register + userId）の処理
 *   - Discordログインフロー（flow=login または flow なし）の処理
 *   - メール確認フロー（flow=email_confirm + userId）の処理
 *   - handleOAuthCallback の呼び出しと edge-token Cookie 設定
 *   - 成功時: /mypage へリダイレクト
 *   - 失敗時: /auth/error へリダイレクト
 *
 * 設計上の判断:
 *   - GETメソッド（ブラウザリダイレクトで呼ばれるため）
 *   - Cookie設定は login/route.ts と同パターン（HttpOnly, SameSite=Lax, 365日, path=/）
 *   - See: docs/architecture/components/user-registration.md §13
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/callback
 *
 * Supabase Auth の OAuth フローおよびメール確認完了後のリダイレクト先。
 * 3つのフローを処理する:
 *
 * 1. Discord本登録フロー: flow=register かつ userId あり
 * 2. Discord/メールログインフロー: flow=login または flow なし
 * 3. メール確認フロー: flow=email_confirm かつ userId あり
 *
 * クエリパラメータ:
 *   - code: Supabase Auth コールバックコード（必須）
 *   - flow: フロー種別（"register" | "login" | "email_confirm" | なし）
 *   - userId: 本登録フローの仮ユーザーID（flow=register / flow=email_confirm 時）
 *
 * リダイレクト先:
 *   - 成功時: /mypage
 *   - 失敗時: /auth/error
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	const { searchParams } = req.nextUrl;
	const code = searchParams.get("code");
	const flow = searchParams.get("flow");
	const userId = searchParams.get("userId");

	// --- code パラメータ必須チェック ---
	if (!code) {
		return NextResponse.redirect(new URL("/auth/error", req.nextUrl.origin));
	}

	let result: Awaited<
		ReturnType<typeof RegistrationService.handleOAuthCallback>
	>;

	// --- フロー判定 ---
	if (flow === "register" && userId) {
		// フロー1: Discord本登録フロー（flow=register + userId あり）
		// See: docs/architecture/components/user-registration.md §7.2 Discord連携
		result = await RegistrationService.handleOAuthCallback(code, userId);
	} else if (flow === "email_confirm" && userId) {
		// フロー3: メール確認フロー（flow=email_confirm + userId）
		// Discord 本登録フローと同パターン: userId は URL パラメータから取得
		// （Gmailアプリ等 Cookie 非共有環境でも動作する）
		// See: docs/architecture/components/user-registration.md §7.1 メール認証
		result = await RegistrationService.handleOAuthCallback(
			code,
			userId,
			"email",
		);
	} else {
		// フロー2: Discord/メールログインフロー（flow=login または flow なし）
		// See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
		result = await RegistrationService.handleOAuthCallback(code);
	}

	// --- 結果処理 ---
	if (!result.success) {
		return NextResponse.redirect(new URL("/auth/error", req.nextUrl.origin));
	}

	// --- 成功: edge-token Cookie を設定して /mypage にリダイレクト ---
	const response = NextResponse.redirect(
		new URL("/mypage", req.nextUrl.origin),
	);

	// edge-token Cookie を設定（HttpOnly, SameSite=Lax, 365日）
	// See: src/app/api/auth/login/route.ts と同パターン
	// See: docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle
	response.cookies.set(EDGE_TOKEN_COOKIE, result.edgeToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		// 365日間有効（Web API・専ブラ統一）
		maxAge: 60 * 60 * 24 * 365,
		path: "/",
	});

	return response;
}
