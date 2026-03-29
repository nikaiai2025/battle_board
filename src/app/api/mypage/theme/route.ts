/**
 * PUT /api/mypage/theme -- テーマ・フォント設定の保存
 *
 * See: features/theme.feature @テーマ設定が保存される
 * See: tmp/workers/bdd-architect_283/theme_design.md §4.2
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - リクエストボディのバリデーション
 *   - validateThemeSelection() でカタログ存在 + 権限チェック
 *   - ThemeService.updateTheme() で DB 保存
 *   - Set-Cookie でテーマ/フォント Cookie を書き込み（SSR用）
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	EDGE_TOKEN_COOKIE,
	FONT_COOKIE,
	THEME_COOKIE,
} from "@/lib/constants/cookie-names";
import { validateThemeSelection } from "@/lib/domain/rules/theme-rules";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import * as AuthService from "@/lib/services/auth-service";
import * as ThemeService from "@/lib/services/theme-service";

/**
 * PUT /api/mypage/theme -- テーマ・フォント設定更新
 *
 * See: features/theme.feature @テーマ設定が保存される
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
	// --- 認証 ---
	const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null;
	if (!edgeToken) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");
	if (!authResult.valid) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- Sprint-150: チャネルガード（専ブラ経由トークンではテーマ設定不可） ---
	// See: tmp/edge_token_channel_separation_plan.md §3.4
	if (authResult.channel !== "web") {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "この操作にはWeb経由の認証が必要です" },
			{ status: 403 },
		);
	}

	// --- リクエストボディのパース ---
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "INVALID_REQUEST", message: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { themeId, fontId } = body as { themeId?: string; fontId?: string };
	if (typeof themeId !== "string" || typeof fontId !== "string") {
		return NextResponse.json(
			{ error: "INVALID_REQUEST", message: "themeId と fontId は必須です" },
			{ status: 400 },
		);
	}

	// --- ユーザー情報取得（isPremium 判定用） ---
	const user = await UserRepository.findById(authResult.userId);
	if (!user) {
		return NextResponse.json(
			{ error: "NOT_FOUND", message: "ユーザーが見つかりません" },
			{ status: 404 },
		);
	}

	// --- バリデーション（カタログ存在 + 権限チェック） ---
	const validation = validateThemeSelection(themeId, fontId, user.isPremium);
	if (!validation.valid) {
		return NextResponse.json(
			{ error: validation.code, message: validation.error },
			{ status: 400 },
		);
	}

	// --- DB 保存 ---
	await ThemeService.updateTheme(authResult.userId, themeId, fontId);

	// --- レスポンス + Set-Cookie ---
	// Cookie でテーマ/フォントIDを書き込み、SSR(layout.tsx)でのクラス付与に使用する
	// See: tmp/workers/bdd-architect_283/theme_design.md §6.2 Cookie仕様
	const cookieOptions = "Path=/; SameSite=Lax; Max-Age=31536000";
	const response = NextResponse.json({ themeId, fontId }, { status: 200 });
	response.headers.append(
		"Set-Cookie",
		`${THEME_COOKIE}=${themeId}; ${cookieOptions}`,
	);
	response.headers.append(
		"Set-Cookie",
		`${FONT_COOKIE}=${fontId}; ${cookieOptions}`,
	);

	return response;
}
