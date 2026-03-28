/**
 * GET /api/mypage/copipe — 自分のコピペ一覧取得
 * POST /api/mypage/copipe — コピペ新規登録
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: docs/specs/openapi.yaml > /api/mypage/copipe
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - UserCopipeService への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す（マイページは認証必須）
 *   - ビジネスロジックを含まず、UserCopipeService への委譲のみ行う
 *   - 認証は AuthService.verifyEdgeToken() を使用（edge_tokens テーブル経由）
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as UserCopipeService from "@/lib/services/user-copipe-service";

/**
 * GET /api/mypage/copipe — 自分のコピペ一覧取得
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
 *
 * レスポンス:
 *   200: { entries: UserCopipeEntry[] }
 *   401: ErrorResponse（未認証）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	// --- Cookie から edge-token を読み取る ---
	const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null;

	if (!edgeToken) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- edge-token で認証確認 ---
	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");
	if (!authResult.valid) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- UserCopipeService への委譲 ---
	const entries = await UserCopipeService.list(authResult.userId);

	return NextResponse.json({ entries }, { status: 200 });
}

/**
 * POST /api/mypage/copipe — コピペ新規登録
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: features/user_copipe.feature @同名のコピペを登録できる
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: CreateUserCopipeRequest { name: string, content: string }
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   201: UserCopipeEntry（登録成功）
 *   400: ErrorResponse（バリデーションエラー）
 *   401: ErrorResponse（未認証）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- Cookie から edge-token を読み取る ---
	const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null;

	if (!edgeToken) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- edge-token で認証確認 ---
	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");
	if (!authResult.valid) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- リクエストボディのパース ---
	let body: { name?: unknown; content?: unknown };
	try {
		body = (await req.json()) as { name?: unknown; content?: unknown };
	} catch {
		return NextResponse.json(
			{ error: "INVALID_REQUEST", message: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { name, content } = body;

	// --- 型チェック（必須フィールドの型検証） ---
	if (typeof name !== "string" || typeof content !== "string") {
		return NextResponse.json(
			{
				error: "VALIDATION_ERROR",
				message: "name と content は文字列で指定してください",
			},
			{ status: 400 },
		);
	}

	// --- UserCopipeService への委譲（バリデーション + 登録） ---
	const result = await UserCopipeService.create(authResult.userId, {
		name,
		content,
	});

	if (!result.success) {
		return NextResponse.json(
			{ error: result.code, message: result.error },
			{ status: 400 },
		);
	}

	return NextResponse.json(result.data, { status: 201 });
}
