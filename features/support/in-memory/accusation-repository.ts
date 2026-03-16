/**
 * インメモリ AccusationRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * accusation-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/phase2/ai_accusation.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { Accusation } from "../../../src/lib/domain/models/accusation";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる告発ストア */
const store: Accusation[] = [];

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 新規告発レコードを作成する。
 * See: src/lib/infrastructure/repositories/accusation-repository.ts
 */
export async function create(
	accusation: Omit<Accusation, "id" | "createdAt">,
): Promise<Accusation> {
	const newAccusation: Accusation = {
		...accusation,
		id: crypto.randomUUID(),
		createdAt: new Date(),
	};
	store.push(newAccusation);
	return newAccusation;
}

/**
 * 同一ユーザーが同一レスを告発した記録を取得する。
 * 重複告発チェックに使用する。
 * See: src/lib/infrastructure/repositories/accusation-repository.ts
 */
export async function findByAccuserAndTarget(
	accuserId: string,
	targetPostId: string,
): Promise<Accusation | null> {
	return (
		store.find(
			(a) => a.accuserId === accuserId && a.targetPostId === targetPostId,
		) ?? null
	);
}

/**
 * スレッド内の全告発レコードを取得する。
 * See: src/lib/infrastructure/repositories/accusation-repository.ts
 */
export async function findByThreadId(threadId: string): Promise<Accusation[]> {
	return store
		.filter((a) => a.threadId === threadId)
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
