/**
 * POST /api/auth/verify -- Turnstile 認証検証 API エンドポイント
 *
 * 6桁認証コードは廃止済み（Sprint-110: 認証フロー簡素化）。
 * edge-token (Cookie またはリクエストボディ) + Turnstile トークンで認証を行う。
 *
 * See: features/authentication.feature @Turnstile通過で認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: docs/specs/openapi.yaml > /api/auth/verify
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - リクエストボディまたは Cookie から edge-token を、ヘッダから IP を読み取る
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
	/**
	 * edge-token（専ブラ向け: Cookie非共有環境でのフォールバック）。
	 * 専ブラの認証案内URL /auth/verify?token=XXX 経由でブラウザに渡され、
	 * フロントエンドがリクエストボディに含めて送信する。
	 * Cookie が使えない場合（専ブラ→通常ブラウザ間）にこの値を使用する。
	 *
	 * Sprint-110 で6桁認証コードを廃止した際、コードが担っていた
	 * 「ブラウザ横断の識別子」の役割を引き継ぐために必要。
	 */
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
 * POST /api/auth/verify
 *
 * Turnstile トークンを検証し、edge-token を有効化する。
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { turnstileToken: string; edgeToken?: string }
 *   Cookie: edge-token（Web UI 向け。Body に edgeToken がある場合はそちらを優先）
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

	const { turnstileToken, edgeToken: bodyEdgeToken } = body;

	// --- バリデーション ---
	if (!turnstileToken || typeof turnstileToken !== "string") {
		return NextResponse.json(
			{ success: false, error: "Turnstile トークンが指定されていません" },
			{ status: 400 },
		);
	}

	// --- IP ハッシュの取得 ---
	// edge-token の新規発行に必要なため、先に取得する
	const ipHash = await getIpHash(req);

	// --- edge-token の取得 ---
	// 優先順位: リクエストボディ（専ブラ向け） > Cookie（Web UI）
	//
	// 専ブラユーザーは通常ブラウザで /auth/verify?token=XXX を開いて認証する。
	// この場合ブラウザの Cookie には専ブラの edge-token が存在しないため、
	// フロントエンドが URL パラメータからリクエストボディに含めて送信する。
	//
	// See: src/app/(web)/auth/verify/page.tsx — edgeTokenParam → body.edgeToken
	// See: docs/architecture/components/authentication.md §5 > Cookie 命名規則
	// See: src/lib/constants/cookie-names.ts
	const cookieStore = await cookies();
	let edgeToken =
		(typeof bodyEdgeToken === "string" && bodyEdgeToken) ||
		cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

	// --- edge-token がない場合は新規発行 ---
	// ヘッダー「新規登録」リンク（/auth/verify?redirect=/mypage）からの直接アクセスなど、
	// 書き込み試行を経ずに認証ページに到達したケース。
	// edge-token + ユーザー + auth_codes を一括で作成してから Turnstile 検証に進む。
	if (!edgeToken) {
		try {
			const issued = await AuthService.issueEdgeToken(ipHash);
			await AuthService.issueAuthCode(ipHash, issued.token);
			edgeToken = issued.token;
		} catch (err) {
			// IP BAN されている場合
			const message =
				err instanceof Error && err.message.startsWith("IP_BANNED")
					? "このIPアドレスからの新規登録はできません"
					: "認証の初期化に失敗しました。再度お試しください";
			return NextResponse.json(
				{ success: false, error: message },
				{ status: 403 },
			);
		}
	}

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

	let responseEdgeToken = edgeToken;
	const verifiedEdgeToken = await AuthService.verifyEdgeToken(edgeToken, ipHash);
	if (verifiedEdgeToken.valid && verifiedEdgeToken.channel === "senbra") {
		const normalized = await AuthService.issueEdgeTokenForUser(
			verifiedEdgeToken.userId,
			"web",
		);
		responseEdgeToken = normalized.token;
	}
	const response = NextResponse.json(responseBody, { status: 200 });

	// edge-token Cookie を更新（HttpOnly, Secure, SameSite=Lax）
	// 認証成功時に明示的に Cookie を設定し直す（有効期限の更新等）
	// See: src/lib/constants/cookie-names.ts
	response.cookies.set(EDGE_TOKEN_COOKIE, responseEdgeToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		// 365日間有効（専ブラ bbs.cgi と統一）
		maxAge: 60 * 60 * 24 * 365,
		path: "/",
	});

	return response;
}
