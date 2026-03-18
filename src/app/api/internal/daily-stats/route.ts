/**
 * POST /api/internal/daily-stats — 日次統計集計 Internal API
 *
 * GitHub Actions cron ジョブ（daily-maintenance）から呼ばれる。
 * scripts/aggregate-daily-stats.ts と同等のロジックを API ルートとして提供する。
 * 指定日（デフォルト: 昨日）の統計を集計し、daily_stats テーブルに UPSERT する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: scripts/aggregate-daily-stats.ts
 *
 * 認証: Bearer 認証（BOT_API_KEY）
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/infrastructure/supabase/client";
import { verifyInternalApiKey } from "@/lib/middleware/internal-api-auth";

// ---------------------------------------------------------------------------
// 集計クエリ関数群（scripts/aggregate-daily-stats.ts からロジックを移植）
// ---------------------------------------------------------------------------

/** 全ユーザー数を取得する */
async function getTotalUsers(): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("users")
		.select("*", { count: "exact", head: true });
	if (error) throw new Error(`getTotalUsers failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日の新規ユーザー数を取得する */
async function getNewUsers(date: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("users")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) throw new Error(`getNewUsers failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日にアクティブだったユニークユーザー数を取得する */
async function getActiveUsers(date: string): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("author_id")
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.eq("is_system_message", false)
		.not("author_id", "is", null);
	if (error) throw new Error(`getActiveUsers failed: ${error.message}`);
	const uniqueUsers = new Set((data ?? []).map((r) => r.author_id));
	return uniqueUsers.size;
}

/** 指定日の書き込み数（システムメッセージ除く）を取得する */
async function getTotalPosts(date: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("posts")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.eq("is_system_message", false);
	if (error) throw new Error(`getTotalPosts failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日の新規スレッド数を取得する */
async function getTotalThreads(date: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("threads")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) throw new Error(`getTotalThreads failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日にアクティブだったスレッド数を取得する */
async function getActiveThreads(date: string): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("thread_id")
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.eq("is_system_message", false);
	if (error) throw new Error(`getActiveThreads failed: ${error.message}`);
	const uniqueThreads = new Set((data ?? []).map((r) => r.thread_id));
	return uniqueThreads.size;
}

/** 全ユーザーの通貨残高合計を取得する */
async function getCurrencyInCirculation(): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("currencies")
		.select("balance");
	if (error)
		throw new Error(`getCurrencyInCirculation failed: ${error.message}`);
	return (data ?? []).reduce(
		(sum: number, r: { balance: number }) => sum + (r.balance ?? 0),
		0,
	);
}

/** 指定日の通貨付与総額を取得する */
async function getCurrencyGranted(date: string): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("incentive_logs")
		.select("amount")
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.gt("amount", 0);
	if (error) {
		console.warn(`[daily-stats] getCurrencyGranted: ${error.message}`);
		return 0;
	}
	return (data ?? []).reduce(
		(sum: number, r: { amount: number }) => sum + (r.amount ?? 0),
		0,
	);
}

/** 指定日の通貨消費総額を取得する */
async function getCurrencyConsumed(date: string): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("incentive_logs")
		.select("amount")
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.lt("amount", 0);
	if (error) {
		console.warn(`[daily-stats] getCurrencyConsumed: ${error.message}`);
		return 0;
	}
	return Math.abs(
		(data ?? []).reduce(
			(sum: number, r: { amount: number }) => sum + (r.amount ?? 0),
			0,
		),
	);
}

/** 指定日の告発件数を取得する */
async function getTotalAccusations(date: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("accusations")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) {
		console.warn(`[daily-stats] getTotalAccusations: ${error.message}`);
		return 0;
	}
	return count ?? 0;
}

/** 指定日の攻撃件数を取得する */
async function getTotalAttacks(date: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("attacks")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) {
		console.warn(`[daily-stats] getTotalAttacks: ${error.message}`);
		return 0;
	}
	return count ?? 0;
}

// ---------------------------------------------------------------------------
// 日付ヘルパー
// ---------------------------------------------------------------------------

/**
 * 昨日の日付を YYYY-MM-DD 形式で返す（JST基準）。
 */
function getYesterdayJst(): string {
	const now = new Date();
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstNow = new Date(now.getTime() + jstOffset);
	jstNow.setUTCDate(jstNow.getUTCDate() - 1);
	return jstNow.toISOString().slice(0, 10);
}

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
 *   3. 全集計を並列実行
 *   4. daily_stats テーブルに UPSERT
 *   5. 結果をJSONで返す
 *
 * See: scripts/aggregate-daily-stats.ts
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
			targetDate = body?.date ?? getYesterdayJst();
		} catch {
			// JSON パース失敗時は昨日をデフォルトにする
			targetDate = getYesterdayJst();
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

		// Step 3: 全集計を並列実行
		const [
			totalUsers,
			newUsers,
			activeUsers,
			totalPosts,
			totalThreads,
			activeThreads,
			currencyInCirculation,
			currencyGranted,
			currencyConsumed,
			totalAccusations,
			totalAttacks,
		] = await Promise.all([
			getTotalUsers(),
			getNewUsers(targetDate),
			getActiveUsers(targetDate),
			getTotalPosts(targetDate),
			getTotalThreads(targetDate),
			getActiveThreads(targetDate),
			getCurrencyInCirculation(),
			getCurrencyGranted(targetDate),
			getCurrencyConsumed(targetDate),
			getTotalAccusations(targetDate),
			getTotalAttacks(targetDate),
		]);

		const stat = {
			stat_date: targetDate,
			total_users: totalUsers,
			new_users: newUsers,
			active_users: activeUsers,
			total_posts: totalPosts,
			total_threads: totalThreads,
			active_threads: activeThreads,
			currency_in_circulation: currencyInCirculation,
			currency_granted: currencyGranted,
			currency_consumed: currencyConsumed,
			total_accusations: totalAccusations,
			total_attacks: totalAttacks,
		};

		// Step 4: daily_stats テーブルに UPSERT（冪等）
		const { error: upsertError } = await supabaseAdmin
			.from("daily_stats")
			.upsert(stat, { onConflict: "stat_date" });

		if (upsertError) {
			throw new Error(`UPSERT 失敗: ${upsertError.message}`);
		}

		// Step 5: 結果をJSONで返す
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
