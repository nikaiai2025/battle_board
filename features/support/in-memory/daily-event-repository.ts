/**
 * インメモリ DailyEventRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * daily-event-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/command_livingbot.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

interface DailyEventRecord {
	id: string;
	eventType: string;
	eventDate: string; // YYYY-MM-DD
	triggeredBy: string;
	createdAt: Date;
}

/** シナリオ間でリセットされるイベントストア */
const store: DailyEventRecord[] = [];

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
}

/**
 * テスト用ヘルパー: イベントを直接ストアに追加する。
 * ステップ定義で「本日すでにラストボットボーナスが1回付与されている」等の事前条件に使用する。
 *
 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
 */
export function _insert(record: {
	eventType: string;
	eventDate: string;
	triggeredBy: string;
}): void {
	store.push({
		id: crypto.randomUUID(),
		eventType: record.eventType,
		eventDate: record.eventDate,
		triggeredBy: record.triggeredBy,
		createdAt: new Date(Date.now()),
	});
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 当日の指定イベントタイプが既に存在するか確認する。
 * See: src/lib/infrastructure/repositories/daily-event-repository.ts
 */
export async function existsForToday(
	eventType: string,
	dateJst: string,
): Promise<boolean> {
	return store.some(
		(e) => e.eventType === eventType && e.eventDate === dateJst,
	);
}

/**
 * イベントレコードを作成する。
 * See: src/lib/infrastructure/repositories/daily-event-repository.ts
 */
export async function create(
	eventType: string,
	dateJst: string,
	triggeredBy: string,
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	store.push({
		id,
		eventType,
		eventDate: dateJst,
		triggeredBy,
		createdAt: new Date(Date.now()),
	});
	return { id };
}
