/**
 * POST /api/mypage/upgrade — 課金（有料ステータス切替）モック
 *
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 * See: docs/specs/openapi.yaml > /api/mypage/upgrade
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - MypageService.upgradeToPremium への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - MVP フェーズでは実決済なし。isPremium フラグの切替のみ行う
 *   - 既に有料ユーザーの場合は 409 Conflict を返す
 *   - 未認証時は 401 を返す
 *   - 認証は AuthService.verifyEdgeToken() を使用（edge_tokens テーブル経由）
 *     verifyEdgeToken は内部で is_verified チェックを含むため、別途チェック不要
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as MypageService from "@/lib/services/mypage-service";

/**
 * POST /api/mypage/upgrade — 課金（モック）
 *
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 *
 * リクエスト:
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   200: { isPremium: true }（アップグレード成功）
 *   401: ErrorResponse（未認証）
 *   409: ErrorResponse（既に有料ユーザー）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- Cookie から edge-token を読み取る ---
	// See: src/lib/constants/cookie-names.ts
	const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null;

	if (!edgeToken) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- edge-token で認証確認（edge_tokens テーブル経由、is_verified チェック含む）---
	// See: src/lib/services/auth-service.ts > verifyEdgeToken
	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");
	if (!authResult.valid) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- Sprint-150: チャネルガード（専ブラ経由トークンではアップグレード不可） ---
	// See: tmp/edge_token_channel_separation_plan.md §3.4
	if (authResult.channel !== "web") {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "この操作にはWeb経由の認証が必要です" },
			{ status: 403 },
		);
	}

	// --- MypageService への委譲 ---
	const result = await MypageService.upgradeToPremium(authResult.userId);

	if (!result.success) {
		// 既に有料ユーザー: 409 Conflict
		if (result.code === "ALREADY_PREMIUM") {
			return NextResponse.json(
				{ error: result.code, message: result.error },
				{ status: 409 },
			);
		}
		// ユーザー不存在: 404
		return NextResponse.json(
			{ error: result.code, message: result.error },
			{ status: 404 },
		);
	}

	return NextResponse.json({ isPremium: true }, { status: 200 });
}
