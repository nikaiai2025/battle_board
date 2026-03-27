/**
 * GET /api/auth/callback — OAuth コールバック（Discord 本登録/ログイン）
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md §7.2, §7.3 フロー詳細
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 *
 * 責務:
 *   - Discord本登録フロー（flow=register + userId）の処理
 *   - Discordログインフロー（flow=login または flow なし）の処理
 *   - handleOAuthCallback の呼び出しと edge-token Cookie 設定
 *   - 成功時: /mypage へリダイレクト
 *   - 失敗時: /auth/error へリダイレクト
 *
 * 注: メール確認フロー（email_confirm）は /api/auth/confirm に移行済み。
 * See: src/app/api/auth/confirm/route.ts
 *
 * 設計上の判断:
 *   - GETメソッド（ブラウザリダイレクトで呼ばれるため）
 *   - Cookie設定は login/route.ts と同パターン（HttpOnly, SameSite=Lax, 365日, path=/）
 *   - See: docs/architecture/components/user-registration.md §13
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	EDGE_TOKEN_COOKIE,
	PKCE_STATE_COOKIE,
} from "@/lib/constants/cookie-names";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/callback
 *
 * Supabase Auth の OAuth フロー（Discord）完了後のリダイレクト先。
 * 2つのフローを処理する:
 *
 * 1. Discord本登録フロー: flow=register かつ userId あり
 * 2. Discordログインフロー: flow=login または flow なし
 *
 * 注: メール確認フローは /api/auth/confirm で処理する（verifyOtp パターン）。
 *
 * クエリパラメータ:
 *   - code: Supabase Auth コールバックコード（必須）
 *   - flow: フロー種別（"register" | "login" | なし）
 *   - userId: Discord本登録フローの仮ユーザーID（flow=register 時）
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

	// --- PKCE ストレージを Cookie から復元する ---
	// OAuth開始時（/api/auth/login/discord または /api/auth/register/discord）に
	// 設定した bb-pkce-state Cookie から code_verifier を復元する。
	// See: src/lib/infrastructure/supabase/client.ts createPkceOAuthClient()
	const pkceStateCookie = req.cookies.get(PKCE_STATE_COOKIE)?.value;
	let pkceStorage: Record<string, string> | undefined;
	if (pkceStateCookie) {
		try {
			pkceStorage = JSON.parse(pkceStateCookie) as Record<string, string>;
		} catch {
			// 不正なCookie値は無視（フォールバック: pkceStorageなしで進む）
		}
	}

	let result: Awaited<
		ReturnType<typeof RegistrationService.handleOAuthCallback>
	>;

	// --- フロー判定 ---
	if (flow === "register" && userId) {
		// フロー1: Discord本登録フロー（flow=register + userId あり）
		// See: docs/architecture/components/user-registration.md §7.2 Discord連携
		result = await RegistrationService.handleOAuthCallback(
			code,
			userId,
			"discord",
			pkceStorage,
		);
	} else {
		// フロー2: Discordログインフロー（flow=login または flow なし）
		// See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
		result = await RegistrationService.handleOAuthCallback(
			code,
			undefined,
			"discord",
			pkceStorage,
		);
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

	// PKCE ストレージ Cookie を削除（使い捨て；セキュリティ上の後片付け）
	response.cookies.delete(PKCE_STATE_COOKIE);

	return response;
}
