/**
 * [廃止] POST /api/auth/auth-code
 *
 * このエンドポイントは Sprint-110（認証フロー簡素化）で廃止されました。
 * 新しいエンドポイント: POST /api/auth/verify
 * See: src/app/api/auth/verify/route.ts
 */

import { type NextRequest, NextResponse } from "next/server";

/**
 * 廃止済みエンドポイント。410 Gone を返す。
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
	return NextResponse.json(
		{
			success: false,
			error:
				"このエンドポイントは廃止されました。/api/auth/verify を使用してください",
		},
		{ status: 410 },
	);
}
