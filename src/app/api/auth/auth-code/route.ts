/**
 * POST /api/auth/auth-code — 認証コード検証 API エンドポイント
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: features/authentication.feature @期限切れ認証コードでは認証できない
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: docs/specs/openapi.yaml > /api/auth/auth-code
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - Cookie から edge-token と IP を読み取る
 *   - AuthService.verifyAuthCode() への委譲
 *   - レスポンス整形
 *   - Cookie 操作（edge-token の更新は Route Handler で行う）
 *
 * 設計上の判断:
 *   - AuthService は Cookie を直接操作しない（authentication.md §5）
 *   - ビジネスロジックを含まず、AuthService への委譲のみ行う
 */

import { cookies, headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import { hashIp } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// リクエスト・レスポンス型
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/auth-code リクエストボディ
 */
interface AuthCodeRequest {
	/** ユーザーが入力した6桁認証コード */
	code: string;
	/** Turnstile チャレンジレスポンストークン */
	turnstileToken: string;
	/** edge-token（専ブラWebView等、Cookieが共有されない環境向けフォールバック） */
	edgeToken?: string;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * リクエストからクライアント IP を取得し、ハッシュ化して返す。
 * Vercel の x-forwarded-for ヘッダを優先的に使用する。
 *
 * @param req - Next.js リクエストオブジェクト
 * @returns クライアント IP の SHA-512 ハッシュ
 */
async function getIpHash(req: NextRequest): Promise<string> {
	const headersList = await headers();
	const forwarded = headersList.get("x-forwarded-for");
	// x-forwarded-for は "client, proxy1, proxy2" の形式のため先頭を使用する
	const ip = forwarded?.split(",")[0].trim() ?? "127.0.0.1";
	return hashIp(ip);
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/auth-code
 *
 * 認証コードと Turnstile トークンを検証し、edge-token を有効化する。
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { code: string; turnstileToken: string }
 *   Cookie: edge-token（認証コード発行時に発行済みのトークン）
 *
 * レスポンス:
 *   200: { success: true; writeToken?: string }（認証成功。writeToken は専ブラ向け認証橋渡しトークン）
 *   400: { success: false; error: string }（リクエスト不正）
 *   401: { success: false; error: string }（認証失敗）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- リクエストボディのパース ---
	let body: AuthCodeRequest;
	try {
		body = (await req.json()) as AuthCodeRequest;
	} catch {
		return NextResponse.json(
			{ success: false, error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { code, turnstileToken } = body;

	// --- バリデーション ---
	if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
		return NextResponse.json(
			{ success: false, error: "認証コードは6桁の数字で入力してください" },
			{ status: 400 },
		);
	}

	if (!turnstileToken || typeof turnstileToken !== "string") {
		return NextResponse.json(
			{ success: false, error: "Turnstile トークンが指定されていません" },
			{ status: 400 },
		);
	}

	// --- edge-token の取得 ---
	// 優先順位: Cookie > リクエストボディ（専ブラWebView等のCookie非共有環境向けフォールバック）
	// See: docs/architecture/components/authentication.md §5 > Cookie 命名規則
	// See: src/lib/constants/cookie-names.ts
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value ?? body.edgeToken;

	if (!edgeToken) {
		return NextResponse.json(
			{
				success: false,
				error:
					"edge-token が存在しません。書き込みフォームから認証を開始してください",
			},
			{ status: 400 },
		);
	}

	// --- IP ハッシュの取得 ---
	const ipHash = await getIpHash(req);

	// --- AuthService への委譲 ---
	// ビジネスロジックは AuthService が担う
	// TASK-041 より verifyAuthCode は { success: boolean, writeToken?: string } を返す
	// See: src/lib/services/auth-service.ts > verifyAuthCode
	const result = await AuthService.verifyAuthCode(code, turnstileToken, ipHash);

	if (!result.success) {
		return NextResponse.json(
			{ success: false, error: "認証コードが無効または期限切れです" },
			{ status: 401 },
		);
	}

	// --- 認証成功: レスポンスを返す ---
	// Cookie の edge-token は既に発行済みのものをそのまま使用する
	// （AuthService は Cookie を操作しない設計。token の有効化は AuthCodeRepository.markVerified で完了）
	// write_token は専ブラ向け認証橋渡しトークン。オプショナルフィールドとしてレスポンスに含める
	// See: tmp/auth_spec_review_report.md §3.2 write_token 方式
	// See: features/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
	const responseBody: { success: boolean; writeToken?: string } = {
		success: true,
	};
	if (result.writeToken) {
		responseBody.writeToken = result.writeToken;
	}
	const response = NextResponse.json(responseBody, { status: 200 });

	// edge-token Cookie を更新（HttpOnly, Secure, SameSite=Lax）
	// 認証成功時に明示的に Cookie を設定し直す（有効期限の更新等）
	// See: src/lib/constants/cookie-names.ts
	response.cookies.set(EDGE_TOKEN_COOKIE, edgeToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		// 365日間有効（専ブラ bbs.cgi と統一）
		maxAge: 60 * 60 * 24 * 365,
		path: "/",
	});

	return response;
}
