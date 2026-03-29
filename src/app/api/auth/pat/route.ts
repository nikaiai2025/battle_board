/**
 * GET /api/auth/pat — PAT取得 API エンドポイント
 * POST /api/auth/pat — PAT再発行 API エンドポイント
 *
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理
 *
 * 責務:
 *   - Cookie から edge-token を読み取り、認証済みユーザーを特定
 *   - GET: 現在の PAT と最終使用日時を返す
 *   - POST: PAT を再発行し新しい PAT を返す
 *
 * 設計上の判断:
 *   - 本登録済みユーザーのみが PAT を持つ（仮ユーザーは 403）
 *   - PAT の取得・再発行ともに edge-token 認証が必要
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import * as AuthService from "@/lib/services/auth-service";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// 共通: 認証ユーザー取得ヘルパー
// ---------------------------------------------------------------------------

/**
 * Cookie の edge-token からユーザーを取得する。
 * 未認証・仮ユーザー・本登録済みユーザーのいずれかを返す。
 * Sprint-150: channel を含めて返す（チャネルガード用）
 */
async function resolveAuthenticatedUser(cookieValue: string | undefined) {
	if (!cookieValue) {
		return { type: "unauthenticated" as const };
	}

	const authResult = await AuthService.verifyEdgeToken(cookieValue, "");

	if (!authResult.valid) {
		return { type: "unauthenticated" as const };
	}

	const user = await UserRepository.findById(authResult.userId);
	if (!user) {
		return { type: "unauthenticated" as const };
	}

	return {
		type: "authenticated" as const,
		user,
		channel: authResult.channel,
	};
}

// ---------------------------------------------------------------------------
// GET /api/auth/pat
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/pat
 *
 * 現在の PAT と最終使用日時を返す。本登録済みユーザーのみアクセス可能。
 *
 * リクエスト:
 *   Cookie: edge-token（認証済み本登録ユーザー）
 *
 * レスポンス:
 *   200: { patToken: string; patLastUsedAt: string | null }
 *   401: { error: string }（未認証）
 *   403: { error: string }（仮ユーザー: PAT未発行）
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

	const resolved = await resolveAuthenticatedUser(edgeToken);

	if (resolved.type === "unauthenticated") {
		return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
	}

	// Sprint-150: チャネルガード（専ブラ経由トークンでは PAT 取得不可）
	// See: tmp/edge_token_channel_separation_plan.md §3.4
	if (resolved.channel !== "web") {
		return NextResponse.json(
			{ error: "この操作にはWeb経由の認証が必要です" },
			{ status: 403 },
		);
	}

	const { user } = resolved;

	// 仮ユーザーは PAT を持たない
	if (!user.patToken) {
		return NextResponse.json(
			{ error: "本登録が完了していないためPATは発行されていません" },
			{ status: 403 },
		);
	}

	return NextResponse.json(
		{
			patToken: user.patToken,
			patLastUsedAt: user.patLastUsedAt?.toISOString() ?? null,
		},
		{ status: 200 },
	);
}

// ---------------------------------------------------------------------------
// POST /api/auth/pat
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/pat
 *
 * PAT を再発行する。旧 PAT は即時無効化される。本登録済みユーザーのみアクセス可能。
 *
 * リクエスト:
 *   Cookie: edge-token（認証済み本登録ユーザー）
 *
 * レスポンス:
 *   200: { patToken: string }（新しい PAT）
 *   401: { error: string }（未認証）
 *   403: { error: string }（仮ユーザー: PAT再発行不可）
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

	const resolved = await resolveAuthenticatedUser(edgeToken);

	if (resolved.type === "unauthenticated") {
		return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
	}

	// Sprint-150: チャネルガード（専ブラ経由トークンでは PAT 再発行不可）
	// See: tmp/edge_token_channel_separation_plan.md §3.4
	if (resolved.channel !== "web") {
		return NextResponse.json(
			{ error: "この操作にはWeb経由の認証が必要です" },
			{ status: 403 },
		);
	}

	const { user } = resolved;

	// 仮ユーザーは PAT を持たないため再発行不可
	if (!user.supabaseAuthId) {
		return NextResponse.json(
			{ error: "本登録が完了していないためPATは再発行できません" },
			{ status: 403 },
		);
	}

	// --- RegistrationService への委譲 ---
	const { patToken } = await RegistrationService.regeneratePat(user.id);

	return NextResponse.json({ patToken }, { status: 200 });
}
