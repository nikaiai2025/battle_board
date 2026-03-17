/**
 * DailyStatsRepository — 日次統計スナップショットの永続化・検索を担うリポジトリ
 *
 * See: supabase/migrations/00011_daily_stats.sql
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-a DB: daily_stats テーブル
 *
 * 責務:
 *   - daily_stats テーブルへの CRUD 操作
 *   - 日次統計スナップショットの UPSERT（冪等）
 *   - 推移取得（期間指定）
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 日次統計スナップショット。
 * daily_stats テーブルの1行に対応する。
 *
 * See: supabase/migrations/00011_daily_stats.sql
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export interface DailyStat {
	/** 統計対象日付（YYYY-MM-DD 形式） */
	statDate: string;
	/** 全ユーザー数（仮+本登録の合計） */
	totalUsers: number;
	/** 当日の新規登録ユーザー数 */
	newUsers: number;
	/** 当日1件以上書き込みしたユーザー数 */
	activeUsers: number;
	/** 当日の書き込み数（非システムメッセージ） */
	totalPosts: number;
	/** 当日の新規スレッド数 */
	totalThreads: number;
	/** 当日書き込みがあったスレッド数 */
	activeThreads: number;
	/** 全ユーザーの残高合計 */
	currencyInCirculation: number;
	/** 当日の通貨付与総額 */
	currencyGranted: number;
	/** 当日の通貨消費総額 */
	currencyConsumed: number;
	/** 当日の告発件数 */
	totalAccusations: number;
	/** 当日の攻撃件数 */
	totalAttacks: number;
	/** レコード作成日時 */
	createdAt: Date;
}

/** daily_stats テーブルの DB レコード（snake_case）*/
interface DailyStatRow {
	stat_date: string;
	total_users: number;
	new_users: number;
	active_users: number;
	total_posts: number;
	total_threads: number;
	active_threads: number;
	currency_in_circulation: number;
	currency_granted: number;
	currency_consumed: number;
	total_accusations: number;
	total_attacks: number;
	created_at: string;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToDailyStat(row: DailyStatRow): DailyStat {
	return {
		statDate: row.stat_date,
		totalUsers: row.total_users,
		newUsers: row.new_users,
		activeUsers: row.active_users,
		totalPosts: row.total_posts,
		totalThreads: row.total_threads,
		activeThreads: row.active_threads,
		currencyInCirculation: row.currency_in_circulation,
		currencyGranted: row.currency_granted,
		currencyConsumed: row.currency_consumed,
		totalAccusations: row.total_accusations,
		totalAttacks: row.total_attacks,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 指定日付の日次統計を取得する。
 *
 * @param statDate - 対象日付（YYYY-MM-DD 形式）
 * @returns 見つかった DailyStat、存在しない場合は null
 */
export async function findByDate(statDate: string): Promise<DailyStat | null> {
	const { data, error } = await supabaseAdmin
		.from("daily_stats")
		.select("*")
		.eq("stat_date", statDate)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(`DailyStatsRepository.findByDate failed: ${error.message}`);
	}

	return data ? rowToDailyStat(data as DailyStatRow) : null;
}

/**
 * 日次統計を期間指定で取得する（推移グラフ用）。
 * stat_date ASC でソートして返す。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-d GET /api/admin/dashboard/history
 *
 * @param fromDate - 開始日（YYYY-MM-DD 形式、この日を含む）
 * @param toDate - 終了日（YYYY-MM-DD 形式、この日を含む）
 * @returns DailyStat 配列（stat_date ASC ソート済み）
 */
export async function findByDateRange(
	fromDate: string,
	toDate: string,
): Promise<DailyStat[]> {
	const { data, error } = await supabaseAdmin
		.from("daily_stats")
		.select("*")
		.gte("stat_date", fromDate)
		.lte("stat_date", toDate)
		.order("stat_date", { ascending: true });

	if (error) {
		throw new Error(
			`DailyStatsRepository.findByDateRange failed: ${error.message}`,
		);
	}

	return (data as DailyStatRow[]).map(rowToDailyStat);
}

/**
 * 最新の日次統計を N 件取得する。
 * stat_date DESC でソートして返す（新しい順）。
 *
 * @param limit - 取得件数（デフォルト 30）
 * @returns DailyStat 配列（stat_date DESC ソート済み）
 */
export async function findLatest(limit = 30): Promise<DailyStat[]> {
	const { data, error } = await supabaseAdmin
		.from("daily_stats")
		.select("*")
		.order("stat_date", { ascending: false })
		.limit(limit);

	if (error) {
		throw new Error(`DailyStatsRepository.findLatest failed: ${error.message}`);
	}

	return (data as DailyStatRow[]).map(rowToDailyStat);
}

/**
 * 日次統計を UPSERT する（冪等）。
 * 再実行しても安全（同一 stat_date への再実行は上書き）。
 *
 * See: tmp/feature_plan_admin_expansion.md §5-b 日次集計スクリプト
 * See: scripts/aggregate-daily-stats.ts
 *
 * @param stat - UPSERT する統計データ（createdAt を除く全フィールド）
 * @returns UPSERT 後の DailyStat
 */
export async function upsert(
	stat: Omit<DailyStat, "createdAt">,
): Promise<DailyStat> {
	const { data, error } = await supabaseAdmin
		.from("daily_stats")
		.upsert(
			{
				stat_date: stat.statDate,
				total_users: stat.totalUsers,
				new_users: stat.newUsers,
				active_users: stat.activeUsers,
				total_posts: stat.totalPosts,
				total_threads: stat.totalThreads,
				active_threads: stat.activeThreads,
				currency_in_circulation: stat.currencyInCirculation,
				currency_granted: stat.currencyGranted,
				currency_consumed: stat.currencyConsumed,
				total_accusations: stat.totalAccusations,
				total_attacks: stat.totalAttacks,
			},
			{ onConflict: "stat_date" },
		)
		.select()
		.single();

	if (error) {
		throw new Error(`DailyStatsRepository.upsert failed: ${error.message}`);
	}

	return rowToDailyStat(data as DailyStatRow);
}
