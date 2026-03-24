/**
 * POST /api/auth/reset-password — パスワード再設定メール送信エンドポイント
 *
 * See: features/user_registration.feature @本登録ユーザーがパスワード再設定を申請する
 * See: features/user_registration.feature @未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - RegistrationService.requestPasswordReset() への委譲
 *   - レスポンス整形
 *
 * セキュリティ:
 *   - 未登録メールでも常に 200 を返す（ユーザー列挙攻撃防止）
 *   - edge-token 認証不要（パスワードを忘れたユーザーは未ログイン状態）
 */

import { type NextRequest, NextResponse } from "next/server";
import * as RegistrationService from "@/lib/services/registration-service";

/**
 * POST /api/auth/reset-password
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { email: string }
 *
 * レスポンス:
 *   200: { success: true; message: string }（常に成功を返す）
 *   400: { success: false; error: string }（バリデーションエラー）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- リクエストボディのパース ---
	let body: { email?: string };
	try {
		body = (await req.json()) as { email?: string };
	} catch {
		return NextResponse.json(
			{ success: false, error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { email } = body;

	// --- バリデーション ---
	if (!email || typeof email !== "string") {
		return NextResponse.json(
			{ success: false, error: "メールアドレスが指定されていません" },
			{ status: 400 },
		);
	}

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return NextResponse.json(
			{ success: false, error: "メールアドレスの形式が不正です" },
			{ status: 400 },
		);
	}

	// --- RegistrationService への委譲 ---
	// redirectTo はメールテンプレートの {{ .RedirectTo }} に展開され、
	// /api/auth/confirm の next パラメータとなる。
	// パスワード再設定フォームのパスを指定する。
	await RegistrationService.requestPasswordReset(email, "/auth/reset-password");

	// セキュリティ: 未登録メールでも同じ応答を返す
	return NextResponse.json(
		{
			success: true,
			message:
				"メールアドレスが登録済みの場合、パスワード再設定リンクを送信しました",
		},
		{ status: 200 },
	);
}
