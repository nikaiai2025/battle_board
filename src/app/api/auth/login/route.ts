/**
 * POST /api/auth/login — ログイン API エンドポイント
 *
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 * See: features/user_registration.feature @誤ったパスワードではログインできない
 * See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 * See: docs/architecture/components/user-registration.md §7.3 ログイン（新デバイス）
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - RegistrationService.loginWithEmail() への委譲
 *   - ログイン成功時に edge-token Cookie を設定
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - edge-token Cookie の設定は Route Handler が担当
 *   - ログインは新デバイスの edge-token を追加発行するだけ。既存トークンは影響なし
 *   - See: docs/architecture/components/user-registration.md §13 設計上の判断
 *     「ログイン時に追加のCookieは設けない」
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// リクエスト型
// ---------------------------------------------------------------------------

/** POST /api/auth/login リクエストボディ */
interface LoginRequest {
	/** メールアドレス */
	email: string;
	/** パスワード */
	password: string;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/login
 *
 * 本登録ユーザーがメールアドレスとパスワードでログインする。
 * 成功時に edge-token Cookie を設定する。
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { email: string; password: string }
 *
 * レスポンス:
 *   200: { success: true }（ログイン成功。edge-token Cookie を設定）
 *   400: { success: false; error: string }（リクエスト不正）
 *   401: { success: false; error: string }（認証失敗）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- リクエストボディのパース ---
	let body: LoginRequest;
	try {
		body = (await req.json()) as LoginRequest;
	} catch {
		return NextResponse.json(
			{ success: false, error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { email, password } = body;

	// --- バリデーション ---
	if (!email || typeof email !== "string") {
		return NextResponse.json(
			{ success: false, error: "メールアドレスが指定されていません" },
			{ status: 400 },
		);
	}

	if (!password || typeof password !== "string") {
		return NextResponse.json(
			{ success: false, error: "パスワードが指定されていません" },
			{ status: 400 },
		);
	}

	// --- RegistrationService への委譲 ---
	const result = await RegistrationService.loginWithEmail(email, password);

	if (!result.success) {
		if (result.reason === "invalid_credentials") {
			return NextResponse.json(
				{
					success: false,
					error: "メールアドレスまたはパスワードが正しくありません",
				},
				{ status: 401 },
			);
		}

		if (result.reason === "not_registered") {
			return NextResponse.json(
				{
					success: false,
					error: "本登録が完了していないアカウントです",
				},
				{ status: 401 },
			);
		}
	}

	// --- ログイン成功: edge-token Cookie を設定 ---
	// result.success === true の場合のみここに到達
	const successResult = result as Extract<typeof result, { success: true }>;

	const response = NextResponse.json({ success: true }, { status: 200 });

	// edge-token Cookie を設定（HttpOnly, SameSite=Lax, 365日）
	// See: docs/architecture/components/user-registration.md §13 ログイン時に追加のCookieは設けない
	// See: docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle > cookie_max_age
	response.cookies.set(EDGE_TOKEN_COOKIE, successResult.edgeToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		// 365日間有効（Web API・専ブラ統一）
		// See: docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle
		maxAge: 60 * 60 * 24 * 365,
		path: "/",
	});

	return response;
}
