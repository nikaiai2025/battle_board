/**
 * PUT /api/mypage/copipe/[id] — コピペ編集（本人のみ）
 * DELETE /api/mypage/copipe/[id] — コピペ削除（本人のみ）
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 * See: docs/specs/openapi.yaml > /api/mypage/copipe/{id}
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - パスパラメータ id の検証
 *   - UserCopipeService への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す
 *   - 他人のエントリ操作は 403 を返す（UserCopipeService が判定）
 *   - 存在しないエントリは 404 を返す（UserCopipeService が判定）
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as UserCopipeService from "@/lib/services/user-copipe-service";

/**
 * PUT /api/mypage/copipe/[id] — コピペ編集（本人のみ）
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: UpdateUserCopipeRequest { name: string, content: string }
 *   Cookie: edge-token（認証済みトークン）
 *   Path: id（整数）
 *
 * レスポンス:
 *   200: UserCopipeEntry（編集成功）
 *   400: ErrorResponse（バリデーションエラーまたは不正な id）
 *   401: ErrorResponse（未認証）
 *   403: ErrorResponse（他人のエントリ）
 *   404: ErrorResponse（エントリが存在しない）
 */
export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

	// --- パスパラメータ id の検証 ---
	const { id: idStr } = await params;
	const entryId = parseInt(idStr, 10);
	if (isNaN(entryId) || entryId <= 0) {
		return NextResponse.json(
			{ error: "INVALID_REQUEST", message: "不正なIDです" },
			{ status: 400 },
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

	// --- UserCopipeService への委譲（バリデーション + 認可 + 更新） ---
	const result = await UserCopipeService.update(authResult.userId, entryId, {
		name,
		content,
	});

	if (!result.success) {
		// 権限なし: 403
		if (result.code === "FORBIDDEN") {
			return NextResponse.json(
				{ error: result.code, message: result.error },
				{ status: 403 },
			);
		}
		// エントリなし: 404
		if (result.code === "NOT_FOUND") {
			return NextResponse.json(
				{ error: result.code, message: result.error },
				{ status: 404 },
			);
		}
		// バリデーションエラー: 400
		return NextResponse.json(
			{ error: result.code, message: result.error },
			{ status: 400 },
		);
	}

	return NextResponse.json(result.data, { status: 200 });
}

/**
 * DELETE /api/mypage/copipe/[id] — コピペ削除（本人のみ）
 *
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 *
 * レスポンス:
 *   204: 削除成功（ボディなし）
 *   400: ErrorResponse（不正な id）
 *   401: ErrorResponse（未認証）
 *   403: ErrorResponse（他人のエントリ）
 *   404: ErrorResponse（エントリが存在しない）
 */
export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

	// --- パスパラメータ id の検証 ---
	const { id: idStr } = await params;
	const entryId = parseInt(idStr, 10);
	if (isNaN(entryId) || entryId <= 0) {
		return NextResponse.json(
			{ error: "INVALID_REQUEST", message: "不正なIDです" },
			{ status: 400 },
		);
	}

	// --- UserCopipeService への委譲（認可 + 削除） ---
	const result = await UserCopipeService.deleteEntry(
		authResult.userId,
		entryId,
	);

	if (!result.success) {
		// 権限なし: 403
		if (result.code === "FORBIDDEN") {
			return NextResponse.json(
				{ error: result.code, message: result.error },
				{ status: 403 },
			);
		}
		// エントリなし: 404
		if (result.code === "NOT_FOUND") {
			return NextResponse.json(
				{ error: result.code, message: result.error },
				{ status: 404 },
			);
		}
		// その他エラー: 400
		return NextResponse.json(
			{ error: result.code, message: result.error },
			{ status: 400 },
		);
	}

	// 削除成功: 204 No Content
	return new NextResponse(null, { status: 204 });
}
