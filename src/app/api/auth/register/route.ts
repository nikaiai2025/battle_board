/**
 * POST /api/auth/register — 本登録申請 API エンドポイント
 *
 * See: features/未実装/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 * See: features/未実装/user_registration.feature @既に使用されているメールアドレスでは本登録できない
 * See: docs/architecture/components/user-registration.md §12 新規APIルート
 * See: docs/architecture/components/user-registration.md §7.1 メール認証フロー
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - Cookie から edge-token を読み取り、仮ユーザーを特定
 *   - AuthService.verifyEdgeToken() で認証確認
 *   - RegistrationService.registerWithEmail() への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - Cookieの操作はRoute Handlerが担当（RegistrationServiceはCookieを触らない）
 *   - 本登録申請はメール確認待ち状態となり、completeRegistration()はコールバックで呼ばれる
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as RegistrationService from "@/lib/services/registration-service";

// ---------------------------------------------------------------------------
// リクエスト型
// ---------------------------------------------------------------------------

/** POST /api/auth/register リクエストボディ */
interface RegisterRequest {
	/** 登録するメールアドレス */
	email: string;
	/** パスワード（Supabase Auth の要件に従う）*/
	password: string;
	/** メール確認後のリダイレクト先URL（省略可。省略時はSupabaseデフォルト） */
	redirectTo?: string;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/register
 *
 * 仮ユーザーがメールアドレスとパスワードで本登録を申請する。
 * 確認メールが送信される（本登録完了は /api/auth/callback で処理）。
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Cookie: edge-token（認証済みの仮ユーザートークン）
 *   Body: { email: string; password: string; redirectTo?: string }
 *
 * レスポンス:
 *   200: { success: true; message: string }（確認メール送信済み）
 *   400: { success: false; error: string }（リクエスト不正）
 *   401: { success: false; error: string }（未認証または認証未完了）
 *   409: { success: false; error: string; reason: "already_registered" | "email_taken" }（重複）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
	// --- リクエストボディのパース ---
	let body: RegisterRequest;
	try {
		body = (await req.json()) as RegisterRequest;
	} catch {
		return NextResponse.json(
			{ success: false, error: "リクエストボディが不正です" },
			{ status: 400 },
		);
	}

	const { email, password, redirectTo } = body;

	// --- バリデーション ---
	if (!email || typeof email !== "string") {
		return NextResponse.json(
			{ success: false, error: "メールアドレスが指定されていません" },
			{ status: 400 },
		);
	}

	// 簡易メールアドレス形式チェック
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return NextResponse.json(
			{ success: false, error: "メールアドレスの形式が不正です" },
			{ status: 400 },
		);
	}

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

	// verifyEdgeToken で仮ユーザーを特定（ipHash は未使用だが互換性のためダミーを渡す）
	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");

	if (!authResult.valid) {
		return NextResponse.json(
			{ success: false, error: "認証が必要です。再度認証してください" },
			{ status: 401 },
		);
	}

	const { userId } = authResult;

	// --- RegistrationService への委譲 ---
	const result = await RegistrationService.registerWithEmail(
		userId,
		email,
		password,
		redirectTo,
	);

	if (!result.success) {
		if (result.reason === "already_registered") {
			return NextResponse.json(
				{
					success: false,
					error: "既に本登録済みのアカウントです",
					reason: "already_registered",
				},
				{ status: 409 },
			);
		}

		if (result.reason === "email_taken") {
			return NextResponse.json(
				{
					success: false,
					error: "このメールアドレスは既に使用されています",
					reason: "email_taken",
				},
				{ status: 409 },
			);
		}

		if (result.reason === "not_found") {
			return NextResponse.json(
				{ success: false, error: "ユーザーが見つかりません" },
				{ status: 401 },
			);
		}
	}

	return NextResponse.json(
		{
			success: true,
			message:
				"確認メールを送信しました。メール内のリンクをクリックして本登録を完了してください",
		},
		{ status: 200 },
	);
}
