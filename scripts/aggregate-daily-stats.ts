/**
 * 日次統計集計スクリプト
 *
 * 指定日（デフォルト: 昨日）の統計を集計し、daily_stats テーブルに UPSERT する。
 * 再実行しても安全（冪等: 同一 stat_date への再実行は上書き）。
 *
 * 実行方法:
 *   npx tsx scripts/aggregate-daily-stats.ts
 *   npx tsx scripts/aggregate-daily-stats.ts --date=2026-03-16
 *
 * 推奨: GitHub Actions cron や Vercel Cron Job で毎日 00:05 JST に実行する。
 * See: tmp/feature_plan_admin_expansion.md §5-b 日次集計スクリプト
 *
 * 集計対象フィールド:
 *   - total_users: users テーブルの全件数
 *   - new_users: 当日作成されたユーザー数
 *   - active_users: 当日1件以上書き込んだユニークユーザー数
 *   - total_posts: 当日の書き込み数（システムメッセージ除く）
 *   - total_threads: 当日作成されたスレッド数
 *   - active_threads: 当日書き込みがあったスレッド数
 *   - currency_in_circulation: 全ユーザーの残高合計
 *   - currency_granted: 当日の通貨付与総額（incentive_logs の credit 合計）
 *   - currency_consumed: 当日の通貨消費総額（incentive_logs の deduct 合計）
 *   - total_accusations: 当日の告発件数
 *   - total_attacks: 当日の攻撃件数
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: src/lib/infrastructure/repositories/daily-stats-repository.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase Admin クライアントの初期化
// スクリプト用に直接クライアントを生成する（Next.js ランタイム外のため）
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error(
		"[aggregate-daily-stats] エラー: NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません",
	);
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// コマンドライン引数の解析
// ---------------------------------------------------------------------------

/**
 * --date=YYYY-MM-DD 引数を解析する。
 * 指定なし: 昨日の日付を使用する（00:00 UTC 基準）。
 */
function parseTargetDate(): string {
	const dateArg = process.argv.find((a) => a.startsWith("--date="));
	if (dateArg) {
		const dateStr = dateArg.replace("--date=", "");
		// YYYY-MM-DD 形式の検証
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			console.error(
				"[aggregate-daily-stats] エラー: --date の形式が不正です（YYYY-MM-DD）",
			);
			process.exit(1);
		}
		return dateStr;
	}
	// デフォルト: 昨日の日付
	const yesterday = new Date();
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	return yesterday.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 集計クエリ関数群
// ---------------------------------------------------------------------------

/** 全ユーザー数（仮+本登録の合計）を取得する */
async function getTotalUsers(): Promise<number> {
	const { count, error } = await supabase
		.from("users")
		.select("*", { count: "exact", head: true });
	if (error) throw new Error(`getTotalUsers failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日の新規ユーザー数を取得する */
async function getNewUsers(date: string): Promise<number> {
	const { count, error } = await supabase
		.from("users")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) throw new Error(`getNewUsers failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日にアクティブだったユニークユーザー数を取得する */
async function getActiveUsers(date: string): Promise<number> {
	const { data, error } = await supabase
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
	const { count, error } = await supabase
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
	const { count, error } = await supabase
		.from("threads")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) throw new Error(`getTotalThreads failed: ${error.message}`);
	return count ?? 0;
}

/** 指定日にアクティブだったスレッド数（書き込みがあったスレッド）を取得する */
async function getActiveThreads(date: string): Promise<number> {
	const { data, error } = await supabase
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
	const { data, error } = await supabase.from("currencies").select("balance");
	if (error)
		throw new Error(`getCurrencyInCirculation failed: ${error.message}`);
	return (data ?? []).reduce((sum, r) => sum + (r.balance ?? 0), 0);
}

/**
 * 指定日の通貨付与総額を取得する（incentive_logs の credit エントリ合計）。
 * NOTE: incentive_logs テーブルにはデルタ値（amount）と direction（credit/deduct）が記録される想定。
 *       現在のスキーマに合わせて amount > 0 の合計を使う。
 */
async function getCurrencyGranted(date: string): Promise<number> {
	const { data, error } = await supabase
		.from("incentive_logs")
		.select("amount")
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.gt("amount", 0);
	if (error) {
		// incentive_logs が存在しない場合は 0 を返す（スキーマ未対応）
		console.warn(
			`[aggregate-daily-stats] getCurrencyGranted: ${error.message}`,
		);
		return 0;
	}
	return (data ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

/** 指定日の通貨消費総額を取得する（incentive_logs の deduct エントリ合計） */
async function getCurrencyConsumed(date: string): Promise<number> {
	const { data, error } = await supabase
		.from("incentive_logs")
		.select("amount")
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.lt("amount", 0);
	if (error) {
		console.warn(
			`[aggregate-daily-stats] getCurrencyConsumed: ${error.message}`,
		);
		return 0;
	}
	return Math.abs((data ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0));
}

/** 指定日の告発件数を取得する */
async function getTotalAccusations(date: string): Promise<number> {
	const { count, error } = await supabase
		.from("accusations")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) {
		console.warn(
			`[aggregate-daily-stats] getTotalAccusations: ${error.message}`,
		);
		return 0;
	}
	return count ?? 0;
}

/** 指定日の攻撃件数を取得する */
async function getTotalAttacks(date: string): Promise<number> {
	const { count, error } = await supabase
		.from("attacks")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00Z`)
		.lt("created_at", `${date}T23:59:59.999Z`);
	if (error) {
		console.warn(`[aggregate-daily-stats] getTotalAttacks: ${error.message}`);
		return 0;
	}
	return count ?? 0;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

/**
 * 指定日の統計を集計し daily_stats テーブルに UPSERT する。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-b 日次集計スクリプト
 */
async function aggregateDailyStats(targetDate: string): Promise<void> {
	console.log(`[aggregate-daily-stats] 集計開始: ${targetDate}`);

	// 全集計を並列実行してパフォーマンスを最大化する
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

	console.log("[aggregate-daily-stats] 集計結果:", stat);

	// UPSERT（冪等: 同一 stat_date への再実行は上書き）
	const { error } = await supabase
		.from("daily_stats")
		.upsert(stat, { onConflict: "stat_date" });

	if (error) {
		throw new Error(`UPSERT 失敗: ${error.message}`);
	}

	console.log(
		`[aggregate-daily-stats] 集計完了: ${targetDate} → daily_stats UPSERT 成功`,
	);
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

const targetDate = parseTargetDate();

aggregateDailyStats(targetDate)
	.then(() => {
		process.exit(0);
	})
	.catch((err) => {
		console.error("[aggregate-daily-stats] 集計エラー:", err);
		process.exit(1);
	});
