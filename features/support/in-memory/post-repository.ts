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
import type { PostWithThread } from "../../../src/lib/infrastructure/repositories/post-repository";
import { assertUUID } from "./assert-uuid";

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
	assertUUID(id, "PostRepository.findById.id");
	return store.get(id) ?? null;
}

/**
 * スレッド ID に属するレス一覧を post_number ASC で取得する。
 * fromPostNumber / range / latestCount オプションによりページネーション範囲指定に対応する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts
 * See: features/thread.feature @pagination
 */
export async function findByThreadId(
	threadId: string,
	options: {
		fromPostNumber?: number;
		range?: { start: number; end: number };
		latestCount?: number;
	} = {},
): Promise<Post[]> {
	assertUUID(threadId, "PostRepository.findByThreadId.threadId");
	const posts = Array.from(store.values())
		.filter((p) => p.threadId === threadId && !p.isDeleted)
		.sort((a, b) => a.postNumber - b.postNumber);

	// latestCount 指定時: 末尾 latestCount 件を返す
	if (options.latestCount !== undefined) {
		return posts.slice(-options.latestCount);
	}

	// range 指定時: start <= postNumber <= end のレスを返す
	if (options.range !== undefined) {
		const { start, end } = options.range;
		return posts.filter((p) => p.postNumber >= start && p.postNumber <= end);
	}

	// fromPostNumber 指定時: postNumber >= fromPostNumber のレスを返す
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
	assertUUID(authorId, "PostRepository.findByAuthorId.authorId");
	const limit = options.limit ?? 50;
	return Array.from(store.values())
		.filter((p) => p.authorId === authorId)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.slice(0, limit);
}

/**
 * 著者 ID に紐づくレスをキーワード・日付範囲・ページネーション付きで検索する。
 * スレッドリポジトリのインメモリストアを参照してスレッドタイトルを取得する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > searchByAuthorId
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 * See: tmp/workers/bdd-architect_TASK-237/design.md §9.2
 */
export async function searchByAuthorId(
	authorId: string,
	options: {
		limit: number;
		offset: number;
		keyword?: string;
		startDate?: string; // YYYY-MM-DD
		endDate?: string; // YYYY-MM-DD
	},
): Promise<{ posts: PostWithThread[]; total: number }> {
	assertUUID(authorId, "PostRepository.searchByAuthorId.authorId");

	// インメモリ ThreadRepository から findById を取得する（require キャッシュ経由でモック版が返る）
	// See: features/support/register-mocks.js（thread-repository.ts → in-memory/thread-repository.ts に差し替え済み）
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const ThreadRepository =
		require("../../../src/lib/infrastructure/repositories/thread-repository") as typeof import("../../../src/lib/infrastructure/repositories/thread-repository");

	// フィルタリング: author_id, is_deleted=false, is_system_message=false
	let filtered = Array.from(store.values()).filter((p) => {
		if (p.authorId !== authorId) return false;
		if (p.isDeleted) return false;
		if (p.isSystemMessage) return false;
		return true;
	});

	// キーワードフィルタ（部分一致、大文字小文字区別なし）
	if (options.keyword) {
		const keywordLower = options.keyword.toLowerCase();
		filtered = filtered.filter((p) =>
			p.body.toLowerCase().includes(keywordLower),
		);
	}

	// 日付範囲フィルタ
	// startDate: YYYY-MM-DDTOO:00:00.000Z 以降
	// endDate: YYYY-MM-DDT23:59:59.999Z 以前
	if (options.startDate) {
		const startMs = new Date(`${options.startDate}T00:00:00.000Z`).getTime();
		filtered = filtered.filter((p) => p.createdAt.getTime() >= startMs);
	}
	if (options.endDate) {
		const endMs = new Date(`${options.endDate}T23:59:59.999Z`).getTime();
		filtered = filtered.filter((p) => p.createdAt.getTime() <= endMs);
	}

	// created_at DESC ソート
	filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	const total = filtered.length;

	// ページネーション: offset から limit 件取得
	const paginated = filtered.slice(
		options.offset,
		options.offset + options.limit,
	);

	// スレッドタイトルを取得して PostWithThread に変換する
	const posts: PostWithThread[] = await Promise.all(
		paginated.map(async (post) => {
			const thread = await ThreadRepository.findById(post.threadId);
			return {
				...post,
				threadTitle: thread?.title ?? "(削除されたスレッド)",
			};
		}),
	);

	return { posts, total };
}

/**
 * スレッドID とレス番号（postNumber）でレスを1件取得する。
 * コマンドの `>>N` 引数から対応するレスのUUIDを解決するために使用する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > findByThreadIdAndPostNumber
 * See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
 */
export async function findByThreadIdAndPostNumber(
	threadId: string,
	postNumber: number,
): Promise<Post | null> {
	assertUUID(threadId, "PostRepository.findByThreadIdAndPostNumber.threadId");
	for (const post of store.values()) {
		if (post.threadId === threadId && post.postNumber === postNumber) {
			return post;
		}
	}
	return null;
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
	assertUUID(threadId, "PostRepository.getNextPostNumber.threadId");
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
	assertUUID(postId, "PostRepository.softDelete.postId");
	const post = store.get(postId);
	if (post) {
		store.set(postId, { ...post, isDeleted: true });
	}
}

/**
 * 指定スレッド内の全レスをバッチで論理削除する。
 * 本番実装の softDeleteByThreadId に対応するインメモリ実装。
 *
 * MEDIUM-005: N+1解消のためのバッチ削除に対応する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > softDeleteByThreadId
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 */
export async function softDeleteByThreadId(threadId: string): Promise<void> {
	assertUUID(threadId, "PostRepository.softDeleteByThreadId.threadId");
	for (const [id, post] of store.entries()) {
		if (post.threadId === threadId) {
			store.set(id, { ...post, isDeleted: true });
		}
	}
}

/**
 * 著者 ID と日付で絞り込んだレス一覧を created_at DESC で取得する。
 * 調査系コマンド（!hissi, !kinou）の全スレッド横断検索に使用する。
 * システムメッセージと削除済みレスは除外する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > findByAuthorIdAndDate
 * See: features/investigation.feature
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.7
 */
export async function findByAuthorIdAndDate(
	authorId: string,
	date: string,
	options: { limit?: number } = {},
): Promise<Post[]> {
	assertUUID(authorId, "PostRepository.findByAuthorIdAndDate.authorId");
	const limit = options.limit;

	const filtered = Array.from(store.values())
		.filter((p) => {
			if (p.authorId !== authorId) return false;
			if (p.isSystemMessage) return false;
			if (p.isDeleted) return false;
			const postDate = p.createdAt.toISOString().slice(0, 10);
			return postDate === date;
		})
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	return limit !== undefined ? filtered.slice(0, limit) : filtered;
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
 * 著者 ID（author_id）に紐づくレス総数を返す。
 * 初回書き込み検出（ウェルカムシーケンス発動判定）に使用する。
 * システムメッセージ・削除済みレスを含む全件をカウントする
 * （「投稿経験があるか」を判定するため）。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > countByAuthorId
 * See: features/welcome.feature @仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する
 *
 * @param authorId - 著者ユーザーの UUID
 * @returns レス総数（レコードが存在しない場合は 0）
 */
export async function countByAuthorId(authorId: string): Promise<number> {
	assertUUID(authorId, "PostRepository.countByAuthorId.authorId");
	return Array.from(store.values()).filter((p) => p.authorId === authorId)
		.length;
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
