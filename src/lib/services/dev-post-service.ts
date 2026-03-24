/**
 * DevPostService — 開発連絡板のユースケース実行を担うサービス
 *
 * 本番の PostService / AuthService / CommandService には一切依存しない。
 * DevPostRepository を通じて dev_posts テーブルのみを操作する。
 *
 * See: features/dev_board.feature
 * See: docs/architecture/architecture.md §13 TDR-014
 */

import type { DevPost } from "../infrastructure/repositories/dev-post-repository";
import * as DevPostRepository from "../infrastructure/repositories/dev-post-repository";

// DevPost 型を再エクスポートして呼び出し元が直接 Repository を参照しなくて済むようにする
export type { DevPost };

// ---------------------------------------------------------------------------
// ユースケース関数
// ---------------------------------------------------------------------------

/** 1ページあたりの表示件数 */
export const POSTS_PER_PAGE = 100;

/** ページネーション付き投稿一覧の返却型 */
export interface PaginatedPosts {
	posts: DevPost[];
	totalCount: number;
	currentPage: number;
	totalPages: number;
}

/**
 * 開発連絡板の投稿一覧をページネーション付きで取得する。
 *
 * See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
 * See: features/dev_board.feature @書き込みが10件ごとにページ分割される
 *
 * @param page - ページ番号（1始まり。デフォルト 1）
 * @returns ページネーション情報付き DevPost 配列
 */
export async function getPosts(page = 1): Promise<PaginatedPosts> {
	const safePage = Math.max(1, Math.floor(page));
	const offset = (safePage - 1) * POSTS_PER_PAGE;

	const [posts, totalCount] = await Promise.all([
		DevPostRepository.findAll(POSTS_PER_PAGE, offset),
		DevPostRepository.count(),
	]);

	return {
		posts,
		totalCount,
		currentPage: safePage,
		totalPages: Math.max(1, Math.ceil(totalCount / POSTS_PER_PAGE)),
	};
}

/**
 * 開発連絡板に新しい投稿を作成する。
 *
 * バリデーション:
 *   - name が空文字または空白のみの場合は Error をスローする
 *   - body が空文字または空白のみの場合は Error をスローする
 *   - title, url は任意（空文字許容）
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 * See: features/dev_board.feature @名前を入力して書き込みができる
 * See: features/dev_board.feature @名前が空の場合は投稿できない
 * See: features/dev_board.feature @本文が空の場合は投稿できない
 *
 * @param name - 投稿者名（必須。空文字・空白のみは不可）
 * @param title - 投稿タイトル（空文字可）
 * @param body - 投稿本文（必須。空文字・空白のみは不可）
 * @param url - 投稿者のホームページURL（空文字可）
 * @returns 作成された DevPost
 * @throws {Error} name または body が空の場合
 */
export async function createPost(
	name: string,
	title: string,
	body: string,
	url: string,
): Promise<DevPost> {
	// 名前バリデーション
	if (!name || name.trim() === "") {
		throw new Error("名前を入力してください");
	}

	// 本文バリデーション
	if (!body || body.trim() === "") {
		throw new Error("本文を入力してください");
	}

	return DevPostRepository.insert(
		name.trim(),
		title.trim(),
		body.trim(),
		url.trim(),
	);
}
