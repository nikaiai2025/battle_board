/**
 * インメモリ ThreadRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * thread-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/thread.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { Thread } from "../../../src/lib/domain/models/thread";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるスレッドストア */
const store = new Map<string, Thread>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: スレッドを直接ストアに追加する。
 */
export function _insert(thread: Thread): void {
	store.set(thread.id, thread);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * スレッドを ID で取得する。削除済みスレッドは除外する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 * See: features/admin.feature @管理者が削除したスレッドはURL直接アクセスでも表示されない
 */
export async function findById(id: string): Promise<Thread | null> {
	assertUUID(id, "ThreadRepository.findById.id");
	const thread = store.get(id) ?? null;
	if (thread && thread.isDeleted) return null;
	return thread;
}

/**
 * スレッドを thread_key で取得する。削除済みスレッドは除外する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 * See: features/admin.feature @管理者が削除したスレッドはURL直接アクセスでも表示されない
 */
export async function findByThreadKey(
	threadKey: string,
): Promise<Thread | null> {
	for (const thread of store.values()) {
		if (thread.threadKey === threadKey && !thread.isDeleted) return thread;
	}
	return null;
}

/**
 * テスト用ヘルパー: 削除済みを含む全スレッドを ID で取得する。
 * Then ステップで isDeleted フラグを直接検証するために使用する。
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 */
export function _findByIdIncludeDeleted(id: string): Thread | null {
	return store.get(id) ?? null;
}

/**
 * 板 ID に属するスレッド一覧を last_post_at DESC で取得する。
 * onlyActive: true の場合は is_dormant=false のスレッドのみ返し、LIMIT は使用しない。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 * See: docs/specs/thread_state_transitions.yaml #listing_rules LIMIT不使用
 */
export async function findByBoardId(
	boardId: string,
	options: { limit?: number; cursor?: string; onlyActive?: boolean } = {},
): Promise<Thread[]> {
	let threads = Array.from(store.values())
		.filter((t) => t.boardId === boardId && !t.isDeleted)
		.sort((a, b) => b.lastPostAt.getTime() - a.lastPostAt.getTime());

	if (options.onlyActive) {
		// アクティブスレッドのみ: is_dormant=false を条件に追加し LIMIT は付けない
		threads = threads.filter((t) => !t.isDormant);
	} else {
		// 後方互換: onlyActive 未指定時は従来の LIMIT 方式を維持する
		const limit = options.limit ?? 100;
		if (options.cursor) {
			const cursorTime = new Date(options.cursor).getTime();
			threads = threads.filter((t) => t.lastPostAt.getTime() < cursorTime);
		}
		threads = threads.slice(0, limit);
	}

	return threads;
}

/**
 * 新しいスレッドを作成する。
 * isDormant は DB のデフォルト値（false）を使用するため省略可能とする。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function create(
	thread: Omit<
		Thread,
		| "id"
		| "createdAt"
		| "lastPostAt"
		| "postCount"
		| "datByteSize"
		| "isDeleted"
		| "isDormant"
	> & { isPinned?: boolean },
): Promise<Thread> {
	const now = new Date(Date.now());
	const newThread: Thread = {
		...thread,
		id: crypto.randomUUID(),
		postCount: 0,
		datByteSize: 0,
		isDeleted: false,
		// isPinned は呼び出し元が設定しなければ false がデフォルト
		isPinned: thread.isPinned ?? false,
		// 新規スレッドはアクティブ状態（isDormant=false）で作成する
		// See: docs/specs/thread_state_transitions.yaml #states.listed initial: true
		isDormant: false,
		createdAt: now,
		lastPostAt: now,
	};
	store.set(newThread.id, newThread);
	return newThread;
}

/**
 * スレッドのレス数を 1 増加させる（アトミック操作を再現）。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function incrementPostCount(threadId: string): Promise<void> {
	assertUUID(threadId, "ThreadRepository.incrementPostCount.threadId");
	const thread = store.get(threadId);
	if (thread) {
		store.set(threadId, { ...thread, postCount: thread.postCount + 1 });
	}
}

/**
 * スレッドの last_post_at を更新する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function updateLastPostAt(
	threadId: string,
	lastPostAt: Date,
): Promise<void> {
	assertUUID(threadId, "ThreadRepository.updateLastPostAt.threadId");
	const thread = store.get(threadId);
	if (thread) {
		store.set(threadId, { ...thread, lastPostAt });
	}
}

/**
 * スレッドの dat_byte_size を更新する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function updateDatByteSize(
	threadId: string,
	datByteSize: number,
): Promise<void> {
	assertUUID(threadId, "ThreadRepository.updateDatByteSize.threadId");
	const thread = store.get(threadId);
	if (thread) {
		store.set(threadId, { ...thread, datByteSize });
	}
}

/**
 * スレッドを論理削除する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function softDelete(threadId: string): Promise<void> {
	assertUUID(threadId, "ThreadRepository.softDelete.threadId");
	const thread = store.get(threadId);
	if (thread) {
		store.set(threadId, { ...thread, isDeleted: true });
	}
}

// ---------------------------------------------------------------------------
// 休眠管理関数（TASK-203 で追加）
// See: docs/specs/thread_state_transitions.yaml #transitions
// See: docs/architecture/components/posting.md §5 休眠管理の責務
// ---------------------------------------------------------------------------

/**
 * 休眠中のスレッドを復活させる（is_dormant = false に更新）。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function wakeThread(threadId: string): Promise<void> {
	assertUUID(threadId, "ThreadRepository.wakeThread.threadId");
	const thread = store.get(threadId);
	if (thread) {
		store.set(threadId, { ...thread, isDormant: false });
	}
}

/**
 * 指定板のアクティブスレッドのうち、last_post_at が最古の非固定スレッドを休眠化する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 * See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted
 */
export async function demoteOldestActiveThread(boardId: string): Promise<void> {
	// アクティブ非固定スレッドの中で last_post_at が最古のものを取得する
	const candidates = Array.from(store.values())
		.filter(
			(t) =>
				t.boardId === boardId && !t.isDeleted && !t.isDormant && !t.isPinned,
		)
		.sort((a, b) => a.lastPostAt.getTime() - b.lastPostAt.getTime());

	if (candidates.length === 0) return;

	const oldest = candidates[0];
	store.set(oldest.id, { ...oldest, isDormant: true });
}

/**
 * 指定板のアクティブスレッド数を返す。
 * アクティブスレッド = is_deleted=false かつ is_dormant=false
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function countActiveThreads(boardId: string): Promise<number> {
	return Array.from(store.values()).filter(
		(t) => t.boardId === boardId && !t.isDeleted && !t.isDormant,
	).length;
}
