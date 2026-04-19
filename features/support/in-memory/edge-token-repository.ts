/**
 * インメモリ EdgeTokenRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * edge-token-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/authentication.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { EdgeToken } from "../../../src/lib/infrastructure/repositories/edge-token-repository";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる edge-token ストア */
const store = new Map<string, EdgeToken>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: EdgeToken を直接ストアに追加する。
 */
export function _insert(edgeToken: EdgeToken): void {
	store.set(edgeToken.id, edgeToken);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 新しい edge-token を作成する。
 * See: src/lib/infrastructure/repositories/edge-token-repository.ts
 */
export async function create(
	userId: string,
	token: string,
	channel: "web" | "senbra" = "web",
): Promise<EdgeToken> {
	const now = new Date(Date.now());
	const newEdgeToken: EdgeToken = {
		id: crypto.randomUUID(),
		userId,
		token,
		channel,
		createdAt: now,
		lastUsedAt: now,
	};
	store.set(newEdgeToken.id, newEdgeToken);
	return newEdgeToken;
}

/**
 * edge-token 文字列で EdgeToken を取得する。
 * See: src/lib/infrastructure/repositories/edge-token-repository.ts
 */
export async function findByToken(token: string): Promise<EdgeToken | null> {
	for (const edgeToken of store.values()) {
		if (edgeToken.token === token) return edgeToken;
	}
	return null;
}

/**
 * ユーザー ID に紐づく全 edge-token を取得する。
 * See: src/lib/infrastructure/repositories/edge-token-repository.ts
 */
export async function findByUserId(userId: string): Promise<EdgeToken[]> {
	assertUUID(userId, "EdgeTokenRepository.findByUserId.userId");
	const result: EdgeToken[] = [];
	for (const edgeToken of store.values()) {
		if (edgeToken.userId === userId) result.push(edgeToken);
	}
	// 作成日時の降順でソート（本番実装と同一）
	result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return result;
}

/**
 * edge-token 文字列を指定して削除する。
 * See: src/lib/infrastructure/repositories/edge-token-repository.ts
 */
export async function deleteByToken(token: string): Promise<void> {
	for (const [id, edgeToken] of store.entries()) {
		if (edgeToken.token === token) {
			store.delete(id);
			return;
		}
	}
}

/**
 * edge-token の最終使用日時を現在時刻に更新する。
 * See: src/lib/infrastructure/repositories/edge-token-repository.ts
 */
export async function updateLastUsedAt(token: string): Promise<void> {
	for (const [id, edgeToken] of store.entries()) {
		if (edgeToken.token === token) {
			store.set(id, { ...edgeToken, lastUsedAt: new Date(Date.now()) });
			return;
		}
	}
}
