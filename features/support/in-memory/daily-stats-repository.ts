/**
 * インメモリ DailyStatsRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * daily-stats-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/admin.feature @ダッシュボードシナリオ群
 * See: src/lib/infrastructure/repositories/daily-stats-repository.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { DailyStat } from "../../../src/lib/infrastructure/repositories/daily-stats-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる日次統計ストア（stat_date -> DailyStat） */
const store = new Map<string, DailyStat>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: 日次統計を直接ストアに追加する。
 * ステップ定義から初期データを投入するために使用する。
 */
export function _insert(stat: DailyStat): void {
	store.set(stat.statDate, stat);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 指定日付の日次統計を取得する。
 * See: src/lib/infrastructure/repositories/daily-stats-repository.ts > findByDate
 */
export async function findByDate(statDate: string): Promise<DailyStat | null> {
	return store.get(statDate) ?? null;
}

/**
 * 日次統計を期間指定で取得する（推移グラフ用）。
 * See: src/lib/infrastructure/repositories/daily-stats-repository.ts > findByDateRange
 */
export async function findByDateRange(
	fromDate: string,
	toDate: string,
): Promise<DailyStat[]> {
	return Array.from(store.values())
		.filter((s) => s.statDate >= fromDate && s.statDate <= toDate)
		.sort((a, b) => a.statDate.localeCompare(b.statDate));
}

/**
 * 最新の日次統計を N 件取得する。
 * See: src/lib/infrastructure/repositories/daily-stats-repository.ts > findLatest
 */
export async function findLatest(limit = 30): Promise<DailyStat[]> {
	return Array.from(store.values())
		.sort((a, b) => b.statDate.localeCompare(a.statDate))
		.slice(0, limit);
}

/**
 * 日次統計を UPSERT する（冪等）。
 * See: src/lib/infrastructure/repositories/daily-stats-repository.ts > upsert
 */
export async function upsert(
	stat: Omit<DailyStat, "createdAt">,
): Promise<DailyStat> {
	const existing = store.get(stat.statDate);
	const newStat: DailyStat = {
		...stat,
		createdAt: existing?.createdAt ?? new Date(Date.now()),
	};
	store.set(stat.statDate, newStat);
	return newStat;
}
