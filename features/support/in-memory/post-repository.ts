/**
 * インメモリ PostRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * post-repository.ts と同一シグネチャの関数を提供する。
 *
 * アトミック採番: getNextPostNumber でレース競合を防ぐため、
 * 採番操作はロックフラグで同期する（シングルスレッド JS 環境では
 * Promise チェーンによる直列実行で十分）。
 *
 * See: features/posting.feature
 * See: features/thread.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { Post } from "../../../src/lib/domain/models/post";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるレストア */
const store = new Map<string, Post>();

/**
 * スレッドごとの採番キューを直列実行するための Promise チェーン。
 * 同一スレッドへの同時書き込みで採番が重複しないよう管理する。
 *
 * 前の採番が返した番号を次の採番の起点とすることで、
 * store への書き込み完了を待たずに連番を保証する。
 *
 * See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
 */
const numberingQueues = new Map<string, Promise<number>>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
	numberingQueues.clear();
}

/**
 * テスト用ヘルパー: レスを直接ストアに追加する。
 */
export function _insert(post: Post): void {
	store.set(post.id, post);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * レスを ID で取得する。
 * See: src/lib/infrastructure/repositories/post-repository.ts
 */
export async function findById(id: string): Promise<Post | null> {
	return store.get(id) ?? null;
}

/**
 * スレッド ID に属するレス一覧を post_number ASC で取得する。
 * See: src/lib/infrastructure/repositories/post-repository.ts
 */
export async function findByThreadId(
	threadId: string,
	options: { fromPostNumber?: number } = {},
): Promise<Post[]> {
	const posts = Array.from(store.values())
		.filter((p) => p.threadId === threadId && !p.isDeleted)
		.sort((a, b) => a.postNumber - b.postNumber);

	if (options.fromPostNumber !== undefined) {
		return posts.filter((p) => p.postNumber >= options.fromPostNumber!);
	}

	return posts;
}

/**
 * 著者 ID（author_id）に紐づくレス一覧を created_at DESC で取得する。
 * マイページの書き込み履歴表示に使用する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 */
export async function findByAuthorId(
	authorId: string,
	options: { limit?: number } = {},
): Promise<Post[]> {
	const limit = options.limit ?? 50;
	return Array.from(store.values())
		.filter((p) => p.authorId === authorId)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.slice(0, limit);
}

/**
 * 次のレス番号を取得する（アトミック採番）。
 *
 * 同一スレッドへの並行呼び出しでは Promise チェーンにより直列実行する。
 * これにより JS の単一スレッド内でのレース競合を防ぐ。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts
 * See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
 */
export async function getNextPostNumber(threadId: string): Promise<number> {
	// 並行採番を直列化する。
	// 初回（prevQueue が undefined）: store から現在の最大レス番号を取得して +1 する。
	// 2回目以降: 前回返した番号に +1 する（store への書き込み完了を待たずに連番を保証）。
	// これにより Promise.all での並行 createPost でも重複番号が発生しない。
	//
	// See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
	const prevQueue = numberingQueues.get(threadId);

	let nextQueue: Promise<number>;
	if (prevQueue === undefined) {
		// 初回: store から現在の最大番号を読み取って +1
		nextQueue = Promise.resolve(null).then(() => {
			const maxNumber = Array.from(store.values())
				.filter((p) => p.threadId === threadId)
				.reduce((max, p) => Math.max(max, p.postNumber), 0);
			return maxNumber + 1;
		});
	} else {
		// 2回目以降: 前回の番号に +1（store 更新完了を待たず連番を割り当てる）
		nextQueue = prevQueue.then((prev) => prev + 1);
	}

	// キューを nextQueue で更新して次回呼び出しの起点とする
	numberingQueues.set(threadId, nextQueue);
	return nextQueue;
}

/**
 * 新しいレスを作成する。
 * See: src/lib/infrastructure/repositories/post-repository.ts
 */
export async function create(
	post: Omit<Post, "id" | "createdAt" | "isDeleted">,
): Promise<Post> {
	const newPost: Post = {
		...post,
		id: crypto.randomUUID(),
		isDeleted: false,
		createdAt: new Date(Date.now()),
	};
	store.set(newPost.id, newPost);
	return newPost;
}

/**
 * レスを論理削除する。
 * See: src/lib/infrastructure/repositories/post-repository.ts
 */
export async function softDelete(postId: string): Promise<void> {
	const post = store.get(postId);
	if (post) {
		store.set(postId, { ...post, isDeleted: true });
	}
}

/**
 * 指定日の書き込み数を集計する（非システムメッセージのみ）。
 * ダッシュボードのリアルタイムサマリーに使用する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > countByDate
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function countByDate(date: string): Promise<number> {
	return Array.from(store.values()).filter((p) => {
		if (p.isSystemMessage) return false;
		const postDate = p.createdAt.toISOString().slice(0, 10);
		return postDate === date;
	}).length;
}

/**
 * 指定日に書き込みがあったアクティブスレッド数を集計する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > countActiveThreadsByDate
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function countActiveThreadsByDate(date: string): Promise<number> {
	const uniqueThreadIds = new Set(
		Array.from(store.values())
			.filter((p) => {
				if (p.isSystemMessage) return false;
				const postDate = p.createdAt.toISOString().slice(0, 10);
				return postDate === date;
			})
			.map((p) => p.threadId),
	);
	return uniqueThreadIds.size;
}
