/**
 * インメモリ BotPostRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * bot-post-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** ボット書き込み紐付けレコード型 */
interface BotPostRecord {
	postId: string;
	botId: string;
}

/** シナリオ間でリセットされるボット書き込みストア */
const store: BotPostRecord[] = [];

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
}

/**
 * テスト用ヘルパー: ボット書き込み紐付けを直接ストアに追加する。
 * BDDステップで「レス >>N はAIボットの書き込みである」を設定する際に使用する。
 *
 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
 */
export function _insert(postId: string, botId: string): void {
	store.push({ postId, botId });
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ボットの書き込み紐付けレコードを作成する。
 * See: src/lib/infrastructure/repositories/bot-post-repository.ts
 */
export async function create(postId: string, botId: string): Promise<void> {
	store.push({ postId, botId });
}

/**
 * 指定した post_id に対応するボット紐付けレコードを取得する。
 * !tell 判定で使用する。
 * See: src/lib/infrastructure/repositories/bot-post-repository.ts
 */
export async function findByPostId(
	postId: string,
): Promise<{ postId: string; botId: string } | null> {
	return store.find((r) => r.postId === postId) ?? null;
}

/**
 * 指定したボットの全書き込み紐付けレコードを取得する。
 * See: src/lib/infrastructure/repositories/bot-post-repository.ts
 */
export async function findByBotId(
	botId: string,
): Promise<{ postId: string; botId: string }[]> {
	return store.filter((r) => r.botId === botId);
}
