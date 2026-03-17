/**
 * GET /api/threads — スレッド一覧取得
 * POST /api/threads — スレッド作成
 *
 * See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
 * See: features/thread.feature @スレッド一覧には最新50件のみ表示される
 * See: docs/specs/openapi.yaml > /api/threads
 * See: docs/architecture/components/posting.md §2.3 createThread / getThreadList
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - Cookie から edge-token を読み取る
 *   - IP 抽出 → AuthService.hashIp(AuthService.reduceIp(ip))
 *   - PostService への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、PostService への委譲のみ行う
 *   - 未認証時は 401 + AuthCodeIssuedResponse + Set-Cookie
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import { hashIp, reduceIp } from "@/lib/services/auth-service";
import * as PostService from "@/lib/services/post-service";

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * リクエストからクライアント IP を取得し、ハッシュ化して返す。
 * x-forwarded-for → x-real-ip → '127.0.0.1' のフォールバックチェーン。
 *
 * @param req - Next.js リクエストオブジェクト
 * @returns クライアント IP の SHA-512 ハッシュ
 */
function getIpHash(req: NextRequest): string {
	const forwarded = req.headers.get("x-forwarded-for");
	// x-forwarded-for は "client, proxy1, proxy2" の形式のため先頭を使用する
	const ip =
		forwarded?.split(",")[0].trim() ??
		req.headers.get("x-real-ip") ??
		"127.0.0.1";
	return hashIp(reduceIp(ip));
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/threads — スレッド一覧取得
 *
 * See: features/thread.feature @スレッド一覧には最新50件のみ表示される
 * See: docs/specs/openapi.yaml > /api/threads > get
 *
 * レスポンス:
 *   200: { threads: Thread[] }（最大50件、last_post_at DESC 順）
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
	try {
		const threads = await PostService.getThreadList("battleboard", 50);
		return NextResponse.json({ threads }, { status: 200 });
	} catch (err) {
		// HIGH-002: err.message をクライアントに漏洩させない（固定メッセージのみ返す）
		console.error("[GET /api/threads] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "サーバー内部エラーが発生しました",
			},
			{ status: 500 },
		);
	}
}

/**
 * POST /api/threads — スレッド作成
 *
 * See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
 * See: features/thread.feature @スレッドタイトルが空の場合はスレッドが作成されない
 * See: docs/specs/openapi.yaml > /api/threads > post
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { title: string; body: string }
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   201: Thread（スレッド作成成功）
 *   400: ErrorResponse（バリデーションエラー）
 *   401: AuthCodeIssuedResponse + Set-Cookie（未認証）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	try {
		// --- リクエストボディのパース ---
		let body: { title?: unknown; body?: unknown; boardId?: unknown };
		try {
			body = (await req.json()) as {
				title?: unknown;
				body?: unknown;
				boardId?: unknown;
			};
		} catch {
			return NextResponse.json(
				{ error: "INVALID_REQUEST", message: "リクエストボディが不正です" },
				{ status: 400 },
			);
		}

		const { title, body: postBody, boardId } = body;

		// --- バリデーション ---
		if (!title || typeof title !== "string" || title.trim() === "") {
			return NextResponse.json(
				{
					error: "VALIDATION_ERROR",
					message: "スレッドタイトルを入力してください",
				},
				{ status: 400 },
			);
		}

		if (!postBody || typeof postBody !== "string" || postBody.trim() === "") {
			return NextResponse.json(
				{ error: "VALIDATION_ERROR", message: "本文を入力してください" },
				{ status: 400 },
			);
		}

		// --- Cookie から edge-token を読み取る ---
		// See: src/lib/constants/cookie-names.ts
		const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null;

		// --- IP ハッシュの取得 ---
		const ipHash = getIpHash(req);

		// --- boardId の決定（未指定・不正時は "battleboard" を使用）---
		// See: tmp/feature_plan_pinned_thread_and_dev_board.md §3-c 方式A
		const resolvedBoardId =
			typeof boardId === "string" && boardId.trim() !== ""
				? boardId.trim()
				: "battleboard";

		// --- PostService への委譲 ---
		const result = await PostService.createThread(
			{
				boardId: resolvedBoardId,
				title: title.trim(),
				firstPostBody: postBody.trim(),
			},
			edgeToken,
			ipHash,
		);

		// --- レスポンス整形 ---

		// 未認証の場合: 401 + AuthCodeIssuedResponse + Set-Cookie
		if (result.authRequired) {
			const response = NextResponse.json(
				{
					message: "認証コードを入力してください",
					authCodeUrl: "/auth/auth-code",
					authCode: result.authRequired.code,
				},
				{ status: 401 },
			);
			// edge-token Cookie を設定（HttpOnly, Secure, SameSite=Lax）
			// See: docs/specs/openapi.yaml > /api/threads > post > 401 > Set-Cookie
			// See: src/lib/constants/cookie-names.ts
			response.cookies.set(EDGE_TOKEN_COOKIE, result.authRequired.edgeToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				maxAge: 60 * 60 * 24 * 365,
				path: "/",
			});
			return response;
		}

		// バリデーションエラー
		if (!result.success) {
			return NextResponse.json(
				{
					error: result.code ?? "VALIDATION_ERROR",
					message: result.error ?? "エラーが発生しました",
				},
				{ status: 400 },
			);
		}

		// 成功: 201 + Thread JSON
		return NextResponse.json(result.thread, { status: 201 });
	} catch (err) {
		// HIGH-002: err.message をクライアントに漏洩させない（固定メッセージのみ返す）
		console.error("[POST /api/threads] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "サーバー内部エラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
