/**
 * POST /api/internal/daily-stats — 日次統計集計 Internal API
 *
 * GitHub Actions cron ジョブ（daily-maintenance）から呼ばれる。
 * 指定日（デフォルト: 昨日）の統計を集計し、daily_stats テーブルに UPSERT する。
 * 集計ロジックは DailyStatsService に委譲する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: src/lib/services/daily-stats-service.ts
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 *
 * 依存方向: app/ -> services/ -> infrastructure/（Source_Layout 準拠）
 */

import { NextResponse } from "next/server";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";
import * as DailyStatsService from "@/lib/services/daily-stats-service";

// ---------------------------------------------------------------------------
// API ルートハンドラ
// ---------------------------------------------------------------------------

/**
 * 日次統計集計を実行する。
 *
 * リクエストボディ:
 *   - date?: string (YYYY-MM-DD形式。省略時は昨日)
 *
 * 処理フロー:
 *   1. Bearer 認証チェック
 *   2. 集計対象日を決定
 *   3. DailyStatsService.aggregateAndUpsert() に委譲
 *   4. 結果をJSONで返す
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export async function POST(request: Request): Promise<NextResponse> {
	// Step 1: Bearer 認証チェック
	if (!verifyInternalApiKey(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Step 2: 集計対象日を決定（リクエストボディから取得、省略時は昨日）
		let targetDate: string;
		try {
			const body = await request.json();
			targetDate = body?.date ?? DailyStatsService.getYesterdayJst();
		} catch {
			// JSON パース失敗時は昨日をデフォルトにする
			targetDate = DailyStatsService.getYesterdayJst();
		}

		// YYYY-MM-DD 形式の検証
		if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
			return NextResponse.json(
				{
					error: "INVALID_DATE",
					message: "date は YYYY-MM-DD 形式で指定してください",
				},
				{ status: 400 },
			);
		}

		// Step 3: Service層に集計・UPSERTを委譲
		const stat = await DailyStatsService.aggregateAndUpsert(targetDate);

		// Step 4: 結果をJSONで返す
		return NextResponse.json({
			success: true,
			targetDate,
			stats: stat,
		});
	} catch (err) {
		console.error("[POST /api/internal/daily-stats] Unhandled error:", err);
		return NextResponse.json(
			{
				error: "INTERNAL_ERROR",
				message: "日次統計集計中にエラーが発生しました",
			},
			{ status: 500 },
		);
	}
}
