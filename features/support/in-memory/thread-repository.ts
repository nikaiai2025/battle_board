/**
 * インメモリ ThreadRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * thread-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/phase1/thread.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { Thread } from '../../../src/lib/domain/models/thread'

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるスレッドストア */
const store = new Map<string, Thread>()

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
  store.clear()
}

/**
 * テスト用ヘルパー: スレッドを直接ストアに追加する。
 */
export function _insert(thread: Thread): void {
  store.set(thread.id, thread)
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * スレッドを ID で取得する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function findById(id: string): Promise<Thread | null> {
  return store.get(id) ?? null
}

/**
 * スレッドを thread_key で取得する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function findByThreadKey(threadKey: string): Promise<Thread | null> {
  for (const thread of store.values()) {
    if (thread.threadKey === threadKey) return thread
  }
  return null
}

/**
 * 板 ID に属するスレッド一覧を last_post_at DESC で取得する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function findByBoardId(
  boardId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<Thread[]> {
  const limit = options.limit ?? 100
  let threads = Array.from(store.values())
    .filter(t => t.boardId === boardId && !t.isDeleted)
    .sort((a, b) => b.lastPostAt.getTime() - a.lastPostAt.getTime())

  if (options.cursor) {
    const cursorTime = new Date(options.cursor).getTime()
    threads = threads.filter(t => t.lastPostAt.getTime() < cursorTime)
  }

  return threads.slice(0, limit)
}

/**
 * 新しいスレッドを作成する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function create(
  thread: Omit<Thread, 'id' | 'createdAt' | 'lastPostAt' | 'postCount' | 'datByteSize' | 'isDeleted'>
): Promise<Thread> {
  const now = new Date()
  const newThread: Thread = {
    ...thread,
    id: crypto.randomUUID(),
    postCount: 0,
    datByteSize: 0,
    isDeleted: false,
    createdAt: now,
    lastPostAt: now,
  }
  store.set(newThread.id, newThread)
  return newThread
}

/**
 * スレッドのレス数を 1 増加させる（アトミック操作を再現）。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function incrementPostCount(threadId: string): Promise<void> {
  const thread = store.get(threadId)
  if (thread) {
    store.set(threadId, { ...thread, postCount: thread.postCount + 1 })
  }
}

/**
 * スレッドの last_post_at を更新する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function updateLastPostAt(threadId: string, lastPostAt: Date): Promise<void> {
  const thread = store.get(threadId)
  if (thread) {
    store.set(threadId, { ...thread, lastPostAt })
  }
}

/**
 * スレッドの dat_byte_size を更新する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function updateDatByteSize(threadId: string, datByteSize: number): Promise<void> {
  const thread = store.get(threadId)
  if (thread) {
    store.set(threadId, { ...thread, datByteSize })
  }
}

/**
 * スレッドを論理削除する。
 * See: src/lib/infrastructure/repositories/thread-repository.ts
 */
export async function softDelete(threadId: string): Promise<void> {
  const thread = store.get(threadId)
  if (thread) {
    store.set(threadId, { ...thread, isDeleted: true })
  }
}
