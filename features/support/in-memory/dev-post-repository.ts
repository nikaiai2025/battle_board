/**
 * インメモリ DevPostRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * dev-post-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/dev_board.feature
 * See: src/lib/infrastructure/repositories/dev-post-repository.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { DevPost } from "../../../src/lib/infrastructure/repositories/dev-post-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるストア（id をキーとする配列） */
let store: DevPost[] = [];

/** 自動採番用の ID カウンター */
let nextId = 1;

// ---------------------------------------------------------------------------
// ライフサイクル関数
// ---------------------------------------------------------------------------

/**
 * ストアを初期化する（Before フックから呼び出す）。
 *
 * See: features/support/mock-installer.ts > resetAllStores
 */
export function reset(): void {
	store = [];
	nextId = 1;
}

/**
 * テスト用ヘルパー: バリデーションをスキップして投稿をストアに直接追加する。
 * Given ステップでの初期データ投入に使用する。
 *
 * @param post - 追加する DevPost（id / createdAt が未指定の場合は自動採番）
 */
export function _insert(
	post: Partial<DevPost> & { name: string; body: string },
): DevPost {
	const newPost: DevPost = {
		id: post.id ?? nextId++,
		name: post.name,
		title: post.title ?? "",
		body: post.body,
		url: post.url ?? "",
		createdAt: post.createdAt ?? new Date(Date.now()),
	};
	store.push(newPost);
	return newPost;
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 開発連絡板の総投稿件数を取得する。
 *
 * See: features/dev_board.feature @書き込みが100件ごとにページ分割される
 */
export async function count(): Promise<number> {
	return store.length;
}

/**
 * 開発連絡板の投稿一覧を新しい順で取得する（ページネーション対応）。
 *
 * created_at DESC ソート後に offset から limit 件を返す。
 *
 * See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
 * See: features/dev_board.feature @書き込みが100件ごとにページ分割される
 *
 * @param limit - 取得件数上限（デフォルト 10）
 * @param offset - 取得開始位置（デフォルト 0）
 * @returns DevPost 配列（created_at DESC ソート済み）
 */
export async function findAll(limit = 10, offset = 0): Promise<DevPost[]> {
	// created_at DESC ソート（降順）
	const sorted = [...store].sort(
		(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
	);
	return sorted.slice(offset, offset + limit);
}

/**
 * 開発連絡板に新しい投稿を保存する。
 *
 * 自動採番 ID と現在時刻を付与して返す。
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 *
 * @param name - 投稿者名
 * @param title - 投稿タイトル
 * @param body - 投稿本文
 * @param url - 投稿者 URL
 * @returns 挿入された DevPost
 */
export async function insert(
	name: string,
	title: string,
	body: string,
	url: string,
): Promise<DevPost> {
	const newPost: DevPost = {
		id: nextId++,
		name,
		title,
		body,
		url,
		createdAt: new Date(Date.now()),
	};
	store.push(newPost);
	return newPost;
}
