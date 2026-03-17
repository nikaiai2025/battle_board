/**
 * インメモリ IpBanRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * ip-ban-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/admin.feature @IP BAN シナリオ群
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: src/lib/infrastructure/repositories/ip-ban-repository.ts
 */

import type { IpBan } from "../../../src/lib/infrastructure/repositories/ip-ban-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる IP BAN ストア */
const store = new Map<string, IpBan>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: IP BAN を直接ストアに追加する。
 * ステップ定義から初期データを投入するために使用する。
 */
export function _insert(ban: IpBan): void {
	store.set(ban.id, ban);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 指定 IP ハッシュが現在 BAN されているか判定する。
 * is_active=true かつ未期限切れの BAN レコードが存在すれば true を返す。
 *
 * See: src/lib/infrastructure/repositories/ip-ban-repository.ts > isBanned
 */
export async function isBanned(ipHash: string): Promise<boolean> {
	const now = new Date(Date.now());
	for (const ban of store.values()) {
		if (
			ban.ipHash === ipHash &&
			ban.isActive &&
			(ban.expiresAt === null || ban.expiresAt > now)
		) {
			return true;
		}
	}
	return false;
}

/**
 * IP BAN を新規作成する。
 *
 * See: src/lib/infrastructure/repositories/ip-ban-repository.ts > create
 */
export async function create(
	ipHash: string,
	reason: string | null,
	bannedBy: string,
): Promise<IpBan> {
	const newBan: IpBan = {
		id: crypto.randomUUID(),
		ipHash,
		reason,
		bannedBy,
		bannedAt: new Date(Date.now()),
		expiresAt: null,
		isActive: true,
	};
	store.set(newBan.id, newBan);
	return newBan;
}

/**
 * IP BAN を解除する（isActive を false に更新）。
 *
 * See: src/lib/infrastructure/repositories/ip-ban-repository.ts > deactivate
 */
export async function deactivate(id: string): Promise<void> {
	const ban = store.get(id);
	if (ban) {
		store.set(id, { ...ban, isActive: false });
	}
}

/**
 * 有効な BAN 一覧を取得する（管理画面用）。
 *
 * See: src/lib/infrastructure/repositories/ip-ban-repository.ts > listActive
 */
export async function listActive(): Promise<IpBan[]> {
	const now = new Date(Date.now());
	return Array.from(store.values())
		.filter(
			(ban) => ban.isActive && (ban.expiresAt === null || ban.expiresAt > now),
		)
		.sort((a, b) => b.bannedAt.getTime() - a.bannedAt.getTime());
}

/**
 * IP BAN を ID で取得する。
 *
 * See: src/lib/infrastructure/repositories/ip-ban-repository.ts > findById
 */
export async function findById(id: string): Promise<IpBan | null> {
	return store.get(id) ?? null;
}
