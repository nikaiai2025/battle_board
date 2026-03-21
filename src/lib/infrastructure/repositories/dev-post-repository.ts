/**
 * DevPostRepository — 開発連絡板（dev_posts テーブル）の永続化を担うリポジトリ
 *
 * 本番の PostRepository / ThreadRepository には一切依存しない。
 * 共有する外部依存は supabaseAdmin（DB接続）のみ。
 *
 * See: features/dev_board.feature
 * See: supabase/migrations/00022_create_dev_posts.sql
 * See: docs/architecture/architecture.md §13 TDR-014
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 開発連絡板の1投稿を表すドメインモデル。
 *
 * See: features/dev_board.feature
 */
export interface DevPost {
	/** 連番ID（シリアル） */
	id: number;
	/** 投稿者名。未入力時は「名無しさん」 */
	name: string;
	/** 投稿本文 */
	body: string;
	/** 投稿日時 */
	createdAt: Date;
}

/** dev_posts テーブルの DB レコード（snake_case） */
interface DevPostRow {
	id: number;
	name: string;
	body: string;
	created_at: string;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToDevPost(row: DevPostRow): DevPost {
	return {
		id: row.id,
		name: row.name,
		body: row.body,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 開発連絡板の投稿一覧を新しい順で取得する。
 *
 * See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
 *
 * @param limit - 取得件数上限（デフォルト 100）
 * @returns DevPost 配列（created_at DESC ソート済み）
 */
export async function findAll(limit = 100): Promise<DevPost[]> {
	const { data, error } = await supabaseAdmin
		.from("dev_posts")
		.select("*")
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error) {
		throw new Error(`DevPostRepository.findAll failed: ${error.message}`);
	}

	return (data as DevPostRow[]).map(rowToDevPost);
}

/**
 * 開発連絡板に新しい投稿を保存する。
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 *
 * @param name - 投稿者名（空文字の場合は「名無しさん」をデフォルト使用）
 * @param body - 投稿本文（空文字は Service 層でバリデーション済み）
 * @returns 挿入された DevPost
 */
export async function insert(name: string, body: string): Promise<DevPost> {
	const { data, error } = await supabaseAdmin
		.from("dev_posts")
		.insert({ name, body })
		.select()
		.single();

	if (error) {
		throw new Error(`DevPostRepository.insert failed: ${error.message}`);
	}

	return rowToDevPost(data as DevPostRow);
}
