/**
 * インメモリ BotPostRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * bot-post-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import { assertUUID } from "./assert-uuid";

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
	assertUUID(postId, "BotPostRepository.create.postId");
	assertUUID(botId, "BotPostRepository.create.botId");
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
	assertUUID(postId, "BotPostRepository.findByPostId.postId");
	return store.find((r) => r.postId === postId) ?? null;
}

/**
 * 複数の投稿IDからBOT投稿レコードを一括取得する。
 * 本番実装の findByPostIds に対応するインメモリ実装。
 * N+1問題を解消するため、指定した postIds に一致するレコードをまとめて返す。
 *
 * See: src/lib/infrastructure/repositories/bot-post-repository.ts > findByPostIds
 * See: features/bot_system.feature @複数ターゲット攻撃
 * See: tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md §5.1 S1
 *
 * @param postIds - 取得対象の投稿ID配列
 * @returns 紐付けレコードの配列（BOTの書き込みに該当するものだけ返される）
 */
export async function findByPostIds(
	postIds: string[],
): Promise<{ postId: string; botId: string }[]> {
	if (postIds.length === 0) {
		return [];
	}
	const idSet = new Set(postIds);
	return store.filter((r) => idSet.has(r.postId));
}

/**
 * 指定したボットの全書き込み紐付けレコードを取得する。
 * See: src/lib/infrastructure/repositories/bot-post-repository.ts
 */
export async function findByBotId(
	botId: string,
): Promise<{ postId: string; botId: string }[]> {
	assertUUID(botId, "BotPostRepository.findByBotId.botId");
	return store.filter((r) => r.botId === botId);
}
