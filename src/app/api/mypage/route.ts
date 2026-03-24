/**
 * GET /api/mypage — マイページ基本情報取得
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: features/currency.feature @マイページで通貨残高を確認する
 * See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
 * See: docs/specs/openapi.yaml > /api/mypage
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - MypageService.getMypage への委譲
 *   - レスポンス整形
 *   - Set-Cookie でテーマ/フォント Cookie を同期（ダウングレード時のフォールバック）
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す（マイページは認証必須）
 *   - ビジネスロジックを含まず、MypageService への委譲のみ行う
 *   - 認証は AuthService.verifyEdgeToken() を使用（edge_tokens テーブル経由）
 *     verifyEdgeToken は内部で is_verified チェックを含むため、別途チェック不要
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	EDGE_TOKEN_COOKIE,
	FONT_COOKIE,
	THEME_COOKIE,
} from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as MypageService from "@/lib/services/mypage-service";

/**
 * GET /api/mypage — マイページ基本情報取得
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 *
 * レスポンス:
 *   200: MypageInfo（基本情報）
 *   401: ErrorResponse（未認証）
 *   404: ErrorResponse（ユーザー不存在）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
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

	// --- MypageService への委譲 ---
	const mypageInfo = await MypageService.getMypage(authResult.userId);

	if (!mypageInfo) {
		return NextResponse.json(
			{ error: "NOT_FOUND", message: "ユーザーが見つかりません" },
			{ status: 404 },
		);
	}

	// --- レスポンス + Set-Cookie（テーマ/フォント Cookie 同期） ---
	// MypageService.getMypage() が返す themeId/fontId は resolveTheme/resolveFont で
	// フォールバック適用済みのため、その値をそのまま Cookie に設定する。
	// ダウングレード時（有料→無料）は、この Cookie 更新により layout.tsx の
	// SSRテーマ適用がデフォルトにフォールバックされる。
	// See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
	// See: src/app/(web)/layout.tsx のコメント
	const cookieOptions = "Path=/; SameSite=Lax; Max-Age=31536000";
	const response = NextResponse.json(mypageInfo, { status: 200 });
	response.headers.append(
		"Set-Cookie",
		`${THEME_COOKIE}=${mypageInfo.themeId}; ${cookieOptions}`,
	);
	response.headers.append(
		"Set-Cookie",
		`${FONT_COOKIE}=${mypageInfo.fontId}; ${cookieOptions}`,
	);

	return response;
}
