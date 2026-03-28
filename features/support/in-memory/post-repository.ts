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
		.filter((p) => p.threadId === threadId)
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
 * 指定スレッド内の複数レス番号のレスを一括取得する。
 * 本番実装の findByThreadIdAndPostNumbers に対応するインメモリ実装。
 * N+1問題を解消するため、1回のループで複数レス番号を取得する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > findByThreadIdAndPostNumbers
 * See: features/bot_system.feature @複数ターゲット攻撃
 *
 * @param threadId - スレッドの UUID
 * @param postNumbers - 取得対象のレス番号配列
 * @returns Post 配列（post_number ASC ソート済み）
 */
export async function findByThreadIdAndPostNumbers(
	threadId: string,
	postNumbers: number[],
): Promise<Post[]> {
	assertUUID(threadId, "PostRepository.findByThreadIdAndPostNumbers.threadId");
	if (postNumbers.length === 0) {
		return [];
	}
	const numberSet = new Set(postNumbers);
	return Array.from(store.values())
		.filter((p) => p.threadId === threadId && numberSet.has(p.postNumber))
		.sort((a, b) => a.postNumber - b.postNumber);
}

/**
 * レス番号の原子採番 + レス作成を一体的に実行する。
 * 本番実装の insert_post_with_next_number RPC に対応するインメモリ版。
 *
 * 同一スレッドへの並行呼び出しでは Promise チェーンにより直列実行する。
 * これにより JS の単一スレッド内でのレース競合を防ぐ。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > createWithAtomicNumber
 * See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
 *
 * @param post - 作成するレスのデータ（postNumber は自動採番されるため不要）
 * @returns 作成された Post（自動採番された postNumber を含む）
 */
export async function createWithAtomicNumber(
	post: Omit<Post, "id" | "createdAt" | "isDeleted" | "postNumber">,
): Promise<Post> {
	assertUUID(post.threadId, "PostRepository.createWithAtomicNumber.threadId");
	const threadId = post.threadId;

	// 並行採番を直列化する。
	// 初回（prevQueue が undefined）: store から現在の最大レス番号を取得して +1 する。
	// 2回目以降: 前回返した番号に +1 する（store への書き込み完了を待たずに連番を保証）。
	// これにより Promise.all での並行 createPost でも重複番号が発生しない。
	//
	// See: features/posting.feature @2人が同時に書き込みを行ってもデータ不整合が発生しない
	const prevQueue = numberingQueues.get(threadId);

	const nextQueue: Promise<number> =
		prevQueue === undefined
			? Promise.resolve(null).then(() => {
					const maxNumber = Array.from(store.values())
						.filter((p) => p.threadId === threadId)
						.reduce((max, p) => Math.max(max, p.postNumber), 0);
					return maxNumber + 1;
				})
			: prevQueue.then((prev) => prev + 1);

	// キューを nextQueue で更新して次回呼び出しの起点とする
	numberingQueues.set(threadId, nextQueue);
	const postNumber = await nextQueue;

	// レスを store に追加する
	const newPost: Post = {
		...post,
		postNumber,
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
 * 日次リセットID（daily_id）でレス一覧を取得する。
 * LEAK-2/3 修正: BOT書き込み（authorId=null）への !hissi / !kinou コマンド対応。
 * システムメッセージと削除済みレスは除外する。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > findByDailyId
 * See: features/investigation.feature §ボットの書き込みへの調査
 */
export async function findByDailyId(
	dailyId: string,
	options: { limit?: number } = {},
): Promise<Post[]> {
	const filtered = Array.from(store.values())
		.filter((p) => {
			if (p.dailyId !== dailyId) return false;
			if (p.isSystemMessage) return false;
			if (p.isDeleted) return false;
			return true;
		})
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	return options.limit !== undefined
		? filtered.slice(0, options.limit)
		: filtered;
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
 * 指定日の人間書き込み数とユニーク書き込みユーザー数を集計する。
 * 条件: is_system_message = false AND author_id IS NOT NULL（人間の書き込み）。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > countHumanPostsByDate
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function countHumanPostsByDate(
	date: string,
): Promise<{ count: number; uniqueAuthors: number }> {
	const humanPosts = Array.from(store.values()).filter((p) => {
		if (p.isSystemMessage) return false;
		if (p.authorId === null) return false;
		const postDate = p.createdAt.toISOString().slice(0, 10);
		return postDate === date;
	});
	const uniqueAuthors = new Set(humanPosts.map((p) => p.authorId)).size;
	return { count: humanPosts.length, uniqueAuthors };
}

/**
 * 指定日のBOT書き込み数とユニークBOT数を集計する。
 * 条件: is_system_message = false AND author_id IS NULL（BOTの書き込み）。
 *
 * InMemory版ではbot_postsテーブルの代わりにBotRepositoryのストアを参照しないため、
 * uniqueBots は常に 0 を返す（InMemory環境ではbot_posts JOINを省略）。
 *
 * See: src/lib/infrastructure/repositories/post-repository.ts > countBotPostsByDate
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function countBotPostsByDate(
	date: string,
): Promise<{ count: number; uniqueBots: number }> {
	const botPosts = Array.from(store.values()).filter((p) => {
		if (p.isSystemMessage) return false;
		if (p.authorId !== null) return false;
		const postDate = p.createdAt.toISOString().slice(0, 10);
		return postDate === date;
	});
	// InMemory版ではbot_postsテーブルがないため、uniqueBots はcount相当で近似する
	return { count: botPosts.length, uniqueBots: 0 };
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
