/**
 * 日次統計集計サービス
 *
 * daily-stats ルートの集計ロジックを Service 層に配置する。
 * 依存方向: app/ -> services/ -> infrastructure/ のルールに準拠。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: scripts/aggregate-daily-stats.ts
 * See: docs/architecture/architecture.md §12.2（定期ジョブ一覧）
 *
 * 集計対象:
 *   - 全ユーザー数 / 新規ユーザー数 / アクティブユーザー数
 *   - 書き込み数 / 新規スレッド数 / アクティブスレッド数
 *   - 通貨流通量 / 付与額 / 消費額
 *   - 告発件数 / 攻撃件数
 *
 * 日付境界の扱い:
 *   Supabase/PostgreSQL の created_at は UTC (timestamptz) で格納されている。
 *   集計はJST（日本標準時、UTC+9）の1日を単位とするため、
 *   クエリ境界には +09:00 オフセット付き ISO 文字列を使用する。
 *   例: date="2026-03-25" → gte: "2026-03-25T00:00:00+09:00"
 *                            lt:  "2026-03-26T00:00:00+09:00"
 *   これにより JST 00:00〜23:59:59 の活動を正確に集計できる。
 */

import { supabaseAdmin } from "@/lib/infrastructure/supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 日次統計データ */
export interface DailyStat {
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
}

// ---------------------------------------------------------------------------
// 日付ヘルパー
// ---------------------------------------------------------------------------

/**
 * 昨日の日付を YYYY-MM-DD 形式で返す（JST基準）。
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export function getYesterdayJst(): string {
	const now = new Date();
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstNow = new Date(now.getTime() + jstOffset);
	jstNow.setUTCDate(jstNow.getUTCDate() - 1);
	return jstNow.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD 形式の JST 日付を受け取り、その日の UTC 開始・終了境界を返す。
 *
 * JST の 1 日（00:00:00〜翌00:00:00 exclusive）に対応する ISO 文字列を生成する。
 * PostgreSQL/Supabase は +09:00 オフセット付き ISO 文字列を timestamptz として
 * 正しく解釈するため、明示的な UTC 変換は不要。
 *
 * @param date - YYYY-MM-DD 形式の JST 日付（例: "2026-03-25"）
 * @returns startUtc: その日の JST 00:00 を +09:00 表記した文字列
 *          endUtc:   翌日の JST 00:00 を +09:00 表記した文字列（lt 条件に使用）
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export function getJstDateRange(date: string): {
	startUtc: string;
	endUtc: string;
} {
	// startUtc: 指定日の JST 00:00:00 を +09:00 オフセット付きで表現
	const startUtc = `${date}T00:00:00+09:00`;

	// endUtc: 翌日の JST 00:00:00 を +09:00 オフセット付きで表現
	// Date を使い月末・年末の繰り上げを正確に計算する
	const nextDay = new Date(`${date}T00:00:00+09:00`);
	nextDay.setUTCDate(nextDay.getUTCDate() + 1);
	// nextDay は UTC で翌日 JST 00:00 を指すが、+09:00 表記に戻す
	// UTC -> JST: +9h して YYYY-MM-DD を取得し、T00:00:00+09:00 を付与する
	const jstOffset = 9 * 60 * 60 * 1000;
	const nextDayJst = new Date(nextDay.getTime() + jstOffset);
	const nextDateStr = nextDayJst.toISOString().slice(0, 10);
	const endUtc = `${nextDateStr}T00:00:00+09:00`;

	return { startUtc, endUtc };
}

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

/**
 * 指定日（JST基準）の新規ユーザー数を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getNewUsers(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { count, error } = await supabaseAdmin
		.from("users")
		.select("*", { count: "exact", head: true })
		.gte("created_at", startUtc)
		.lt("created_at", endUtc);
	if (error) throw new Error(`getNewUsers failed: ${error.message}`);
	return count ?? 0;
}

/**
 * 指定日（JST基準）にアクティブだったユニークユーザー数を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getActiveUsers(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("author_id")
		.gte("created_at", startUtc)
		.lt("created_at", endUtc)
		.eq("is_system_message", false)
		.not("author_id", "is", null);
	if (error) throw new Error(`getActiveUsers failed: ${error.message}`);
	const uniqueUsers = new Set((data ?? []).map((r) => r.author_id));
	return uniqueUsers.size;
}

/**
 * 指定日（JST基準）の書き込み数（システムメッセージ除く）を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getTotalPosts(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { count, error } = await supabaseAdmin
		.from("posts")
		.select("*", { count: "exact", head: true })
		.gte("created_at", startUtc)
		.lt("created_at", endUtc)
		.eq("is_system_message", false);
	if (error) throw new Error(`getTotalPosts failed: ${error.message}`);
	return count ?? 0;
}

/**
 * 指定日（JST基準）の新規スレッド数を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getTotalThreads(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { count, error } = await supabaseAdmin
		.from("threads")
		.select("*", { count: "exact", head: true })
		.gte("created_at", startUtc)
		.lt("created_at", endUtc);
	if (error) throw new Error(`getTotalThreads failed: ${error.message}`);
	return count ?? 0;
}

/**
 * 指定日（JST基準）にアクティブだったスレッド数を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getActiveThreads(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("thread_id")
		.gte("created_at", startUtc)
		.lt("created_at", endUtc)
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

/**
 * 指定日（JST基準）の通貨付与総額を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getCurrencyGranted(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { data, error } = await supabaseAdmin
		.from("incentive_logs")
		.select("amount")
		.gte("created_at", startUtc)
		.lt("created_at", endUtc)
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

/**
 * 指定日（JST基準）の通貨消費総額を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getCurrencyConsumed(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { data, error } = await supabaseAdmin
		.from("incentive_logs")
		.select("amount")
		.gte("created_at", startUtc)
		.lt("created_at", endUtc)
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

/**
 * 指定日（JST基準）の告発件数を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getTotalAccusations(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { count, error } = await supabaseAdmin
		.from("accusations")
		.select("*", { count: "exact", head: true })
		.gte("created_at", startUtc)
		.lt("created_at", endUtc);
	if (error) {
		console.warn(`[daily-stats] getTotalAccusations: ${error.message}`);
		return 0;
	}
	return count ?? 0;
}

/**
 * 指定日（JST基準）の攻撃件数を取得する。
 * 境界は getJstDateRange() が生成する +09:00 オフセット付き ISO 文字列を使用。
 */
async function getTotalAttacks(date: string): Promise<number> {
	const { startUtc, endUtc } = getJstDateRange(date);
	const { count, error } = await supabaseAdmin
		.from("attacks")
		.select("*", { count: "exact", head: true })
		.gte("created_at", startUtc)
		.lt("created_at", endUtc);
	if (error) {
		console.warn(`[daily-stats] getTotalAttacks: ${error.message}`);
		return 0;
	}
	return count ?? 0;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * 指定日の日次統計を集計し、daily_stats テーブルに UPSERT する。
 *
 * @param targetDate - 集計対象日（YYYY-MM-DD形式、JST基準）
 * @returns 集計結果
 * @throws 集計またはUPSERTに失敗した場合
 *
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export async function aggregateAndUpsert(
	targetDate: string,
): Promise<DailyStat> {
	// 全集計を並列実行
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

	const stat: DailyStat = {
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

	// daily_stats テーブルに UPSERT（冪等）
	const { error: upsertError } = await supabaseAdmin
		.from("daily_stats")
		.upsert(stat, { onConflict: "stat_date" });

	if (upsertError) {
		throw new Error(`UPSERT 失敗: ${upsertError.message}`);
	}

	return stat;
}
