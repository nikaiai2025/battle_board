/**
 * POST /api/auth/update-password — パスワード更新エンドポイント
 *
 * パスワード再設定フローの最終ステップ。
 * /api/auth/confirm?type=recovery で edge-token を取得した後、
 * パスワード変更フォームからこのエンドポイントに新パスワードを送信する。
 *
 * See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
 *
 * 責務:
 *   - edge-token による認証確認
 *   - リクエストの受付・バリデーション
 *   - RegistrationService.updatePassword() への委譲
 *   - レスポンス整形
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as RegistrationService from "@/lib/services/registration-service";

/**
 * POST /api/auth/update-password
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Cookie: edge-token（認証済み）
 *   Body: { password: string }
 *
 * レスポンス:
 *   200: { success: true }（パスワード更新成功）
 *   400: { success: false; error: string }（バリデーションエラー）
 *   401: { success: false; error: string }（未認証）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- リクエストボディのパース ---
	let body: { password?: string };
	try {
		body = (await req.json()) as { password?: string };
	} catch {
		return NextResponse.json(
			{ success: false, error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { password } = body;

	// --- バリデーション ---
	if (!password || typeof password !== "string") {
		return NextResponse.json(
			{ success: false, error: "パスワードが指定されていません" },
			{ status: 400 },
		);
	}

	if (password.length < 8) {
		return NextResponse.json(
			{ success: false, error: "パスワードは8文字以上で入力してください" },
			{ status: 400 },
		);
	}

	// --- edge-token による認証確認 ---
	const cookieStore = await cookies();
	const edgeToken = cookieStore.get(EDGE_TOKEN_COOKIE)?.value;

	if (!edgeToken) {
		return NextResponse.json(
			{ success: false, error: "認証が必要です" },
			{ status: 401 },
		);
	}

	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");

	if (!authResult.valid) {
		return NextResponse.json(
			{ success: false, error: "認証が必要です。再度認証してください" },
			{ status: 401 },
		);
	}

	// --- RegistrationService への委譲 ---
	const result = await RegistrationService.updatePassword(
		authResult.userId,
		password,
	);

	if (!result.success) {
		return NextResponse.json(
			{ success: false, error: "本登録されていないアカウントです" },
			{ status: 401 },
		);
	}

	return NextResponse.json({ success: true }, { status: 200 });
}
