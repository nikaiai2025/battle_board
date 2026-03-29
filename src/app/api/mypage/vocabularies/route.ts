/**
 * GET /api/mypage/vocabularies — 自分の有効語録一覧取得
 * POST /api/mypage/vocabularies — 語録新規登録
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - UserBotVocabularyService への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す（マイページは認証必須）
 *   - ビジネスロジックを含まず、UserBotVocabularyService への委譲のみ行う
 *   - 認証は AuthService.verifyEdgeToken() を使用（edge_tokens テーブル経由）
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as UserBotVocabularyService from "@/lib/services/user-bot-vocabulary-service";

/**
 * GET /api/mypage/vocabularies — 自分の有効語録一覧取得
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
 *
 * レスポンス:
 *   200: { entries: UserBotVocabulary[] }
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

	// --- Sprint-150: チャネルガード（専ブラ経由トークンでは語録一覧取得不可） ---
	// See: tmp/edge_token_channel_separation_plan.md §3.4
	if (authResult.channel !== "web") {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "この操作にはWeb経由の認証が必要です" },
			{ status: 403 },
		);
	}

	// --- UserBotVocabularyService への委譲 ---
	const entries = await UserBotVocabularyService.listActive(authResult.userId);

	return NextResponse.json({ entries }, { status: 200 });
}

/**
 * POST /api/mypage/vocabularies — 語録新規登録
 *
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 * See: features/user_bot_vocabulary.feature @残高不足の場合は登録できない
 * See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { content: string }
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   201: UserBotVocabulary（登録成功）
 *   400: ErrorResponse（バリデーションエラー / 残高不足）
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

	// --- Sprint-150: チャネルガード（専ブラ経由トークンでは語録登録不可） ---
	// See: tmp/edge_token_channel_separation_plan.md §3.4
	if (authResult.channel !== "web") {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "この操作にはWeb経由の認証が必要です" },
			{ status: 403 },
		);
	}

	// --- リクエストボディのパース ---
	let body: { content?: unknown };
	try {
		body = (await req.json()) as { content?: unknown };
	} catch {
		return NextResponse.json(
			{ error: "INVALID_REQUEST", message: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { content } = body;

	// --- 型チェック（必須フィールドの型検証） ---
	if (typeof content !== "string") {
		return NextResponse.json(
			{
				error: "VALIDATION_ERROR",
				message: "content は文字列で指定してください",
			},
			{ status: 400 },
		);
	}

	// --- UserBotVocabularyService への委譲（バリデーション + 通貨消費 + 登録） ---
	const result = await UserBotVocabularyService.register(
		authResult.userId,
		content,
	);

	if (!result.success) {
		return NextResponse.json(
			{ error: result.code, message: result.error },
			{ status: 400 },
		);
	}

	return NextResponse.json(result.data, { status: 201 });
}
