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

/** 名前未入力時のデフォルト名 */
const DEFAULT_NAME = "名無しさん";

// ---------------------------------------------------------------------------
// ユースケース関数
// ---------------------------------------------------------------------------

/**
 * 開発連絡板の投稿一覧を新しい順で取得する。
 *
 * See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
 *
 * @returns DevPost 配列（created_at DESC ソート済み）
 */
export async function getPosts(): Promise<DevPost[]> {
	return DevPostRepository.findAll();
}

/**
 * 開発連絡板に新しい投稿を作成する。
 *
 * バリデーション:
 *   - body が空文字または空白のみの場合は Error をスローする
 *   - name が空文字または空白のみの場合は「名無しさん」を使用する
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 * See: features/dev_board.feature @名前を指定して書き込みができる
 * See: features/dev_board.feature @名前未入力の場合は「名無しさん」で表示される
 * See: features/dev_board.feature @本文が空の場合は投稿できない
 *
 * @param name - 投稿者名（空文字可。空の場合はデフォルト名を使用）
 * @param body - 投稿本文（必須。空文字・空白のみは不可）
 * @returns 作成された DevPost
 * @throws {Error} body が空の場合
 */
export async function createPost(name: string, body: string): Promise<DevPost> {
	// 本文バリデーション
	if (!body || body.trim() === "") {
		throw new Error("本文を入力してください");
	}

	// 名前が空の場合はデフォルト名を使用する
	const resolvedName = name.trim() !== "" ? name.trim() : DEFAULT_NAME;

	return DevPostRepository.insert(resolvedName, body.trim());
}
