/**
 * POST /api/auth/verify -- Turnstile 認証検証 API エンドポイント
 *
 * 6桁認証コードは廃止済み（Sprint-110: 認証フロー簡素化）。
 * edge-token (Cookie) + Turnstile トークンのみで認証を行う。
 *
 * See: features/authentication.feature @Turnstile通過で認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: docs/specs/openapi.yaml > /api/auth/verify
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - Cookie から edge-token と IP を読み取る
 *   - AuthService.verifyAuth() への委譲
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
 * POST /api/auth/verify リクエストボディ
 * See: docs/specs/openapi.yaml > VerifyAuthRequest
 */
interface VerifyAuthRequest {
	/** Turnstile チャレンジレスポンストークン */
	turnstileToken: string;
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
 * POST /api/auth/verify
 *
 * Turnstile トークンを検証し、edge-token を有効化する。
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { turnstileToken: string }
 *   Cookie: edge-token（edge-token 発行時に発行済みのトークン）
 *
 * レスポンス:
 *   200: { success: true; writeToken?: string }（認証成功。writeToken は専ブラ向け認証橋渡しトークン）
 *   400: { success: false; error: string }（リクエスト不正）
 *   401: { success: false; error: string }（認証失敗）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- リクエストボディのパース ---
	let body: VerifyAuthRequest;
	try {
		body = (await req.json()) as VerifyAuthRequest;
	} catch {
		return NextResponse.json(
			{ success: false, error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { turnstileToken } = body;

	// --- バリデーション ---
	if (!turnstileToken || typeof turnstileToken !== "string") {
		return NextResponse.json(
			{ success: false, error: "Turnstile トークンが指定されていません" },
			{ status: 400 },
		);
	}

	// --- edge-token の取得 ---
	// Cookie から取得する
	// See: docs/architecture/components/authentication.md §5 > Cookie 命名規則
	// See: src/lib/constants/cookie-names.ts
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

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
	// See: src/lib/services/auth-service.ts > verifyAuth
	const result = await AuthService.verifyAuth(
		edgeToken,
		turnstileToken,
		ipHash,
	);

	if (!result.success) {
		return NextResponse.json(
			{ success: false, error: "認証に失敗しました。再度お試しください" },
			{ status: 401 },
		);
	}

	// --- 認証成功: レスポンスを返す ---
	// Cookie の edge-token は既に発行済みのものをそのまま使用する
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
