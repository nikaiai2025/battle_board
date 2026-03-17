/**
 * インメモリ IncentiveLogRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * incentive-log-repository.ts と同一シグネチャの関数を提供する。
 *
 * 一意制約の再現:
 *   DB の ON CONFLICT DO NOTHING に対応するため、
 *   (userId, eventType, contextId, contextDate) の組み合わせを
 *   重複チェックのキーとして使用する。
 *
 * See: features/incentive.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: task_TASK-016.md §補足・制約 > incentive-log-repository の一意制約
 */

import type { IncentiveLog } from "../../../src/lib/domain/models/incentive";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるインセンティブログストア */
const store = new Map<string, IncentiveLog>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: インセンティブログを直接ストアに追加する。
 */
export function _insert(log: IncentiveLog): void {
	store.set(log.id, log);
}

// ---------------------------------------------------------------------------
// 一意制約チェックヘルパー
// ---------------------------------------------------------------------------

/**
 * (userId, eventType, contextId, contextDate) の一意性を確認する。
 *
 * DB の ON CONFLICT (user_id, event_type, context_date) DO NOTHING を再現する。
 * contextId は追加のユニーク条件として扱う（同一スレッド/レスでの重複付与防止）。
 *
 * See: src/lib/infrastructure/repositories/incentive-log-repository.ts
 */
function isDuplicate(
	userId: string,
	eventType: string,
	contextId: string | null,
	contextDate: string,
): boolean {
	for (const log of store.values()) {
		if (
			log.userId === userId &&
			log.eventType === eventType &&
			log.contextId === contextId &&
			log.contextDate === contextDate
		) {
			return true;
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * インセンティブログを作成する（冪等性保証）。
 *
 * (userId, eventType, contextId, contextDate) が重複する場合は null を返す。
 * これにより ON CONFLICT DO NOTHING と同等の動作を再現する。
 *
 * See: src/lib/infrastructure/repositories/incentive-log-repository.ts
 */
export async function create(
	log: Omit<IncentiveLog, "id" | "createdAt">,
): Promise<IncentiveLog | null> {
	// 一意制約チェック
	if (isDuplicate(log.userId, log.eventType, log.contextId, log.contextDate)) {
		return null;
	}

	const newLog: IncentiveLog = {
		...log,
		id: crypto.randomUUID(),
		createdAt: new Date(Date.now()),
	};
	store.set(newLog.id, newLog);
	return newLog;
}

/**
 * 指定ユーザーの特定日付のインセンティブログを全件取得する。
 * See: src/lib/infrastructure/repositories/incentive-log-repository.ts
 */
export async function findByUserIdAndDate(
	userId: string,
	contextDate: string,
): Promise<IncentiveLog[]> {
	return Array.from(store.values())
		.filter((log) => log.userId === userId && log.contextDate === contextDate)
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * 指定ユーザーのインセンティブログを取得する。
 * See: src/lib/infrastructure/repositories/incentive-log-repository.ts
 */
export async function findByUserId(
	userId: string,
	options?: { limit?: number },
): Promise<IncentiveLog[]> {
	let logs = Array.from(store.values())
		.filter((log) => log.userId === userId)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	if (options?.limit !== undefined) {
		logs = logs.slice(0, options.limit);
	}

	return logs;
}
