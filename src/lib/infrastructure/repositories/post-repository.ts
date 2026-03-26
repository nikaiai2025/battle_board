/**
 * PostRepository — レスの永続化・検索を担うリポジトリ
 *
 * See: docs/architecture/architecture.md §3.2 Infrastructure Layer
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > posts
 * See: docs/architecture/components/posting.md §3.1 依存先 > PostRepository
 *
 * 責務:
 *   - posts テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import type { Post } from "../../domain/models/post";
import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義: PostWithThread（threads JOIN 結果）
// ---------------------------------------------------------------------------

/**
 * Post + スレッドタイトル（threads INNER JOIN 結果）。
 * searchByAuthorId の戻り値として使用する。
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: tmp/workers/bdd-architect_TASK-237/design.md §3.2
 */
export interface PostWithThread extends Post {
	/** スレッドタイトル（threads テーブルから JOIN して取得） */
	threadTitle: string;
}

// ---------------------------------------------------------------------------
// 型定義: posts テーブルの DB 行型
// ---------------------------------------------------------------------------

/** posts テーブルの DB レコード（snake_case）*/
interface PostRow {
	id: string;
	thread_id: string;
	post_number: number;
	author_id: string | null;
	display_name: string;
	daily_id: string;
	body: string;
	inline_system_info: string | null;
	is_system_message: boolean;
	is_deleted: boolean;
	created_at: string;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 * Supabase レスポンスの日時フィールドは文字列で返るため Date に変換する。
 */
function rowToPost(row: PostRow): Post {
	return {
		id: row.id,
		threadId: row.thread_id,
		postNumber: row.post_number,
		authorId: row.author_id,
		displayName: row.display_name,
		dailyId: row.daily_id,
		body: row.body,
		inlineSystemInfo: row.inline_system_info ?? null,
		isSystemMessage: row.is_system_message,
		isDeleted: row.is_deleted,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * レスを ID で取得する。
 * @param id - レスの UUID
 * @returns 見つかった Post、存在しない場合は null
 */
export async function findById(id: string): Promise<Post | null> {
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("*")
		.eq("id", id)
		.single();

	if (error) {
		// PGRST116: 行が見つからない場合
		if (error.code === "PGRST116") return null;
		throw new Error(`PostRepository.findById failed: ${error.message}`);
	}

	return data ? rowToPost(data as PostRow) : null;
}

/**
 * スレッド ID に属するレス一覧を post_number ASC で取得する。
 * fromPostNumber / range / latestCount を指定することで絞り込みに対応する。
 *
 * See: docs/architecture/components/posting.md §2.3 getPostList
 * See: docs/architecture/architecture.md §11.3 Range 差分応答の実装方針
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.4 PostService改修
 *
 * @param threadId - スレッドの UUID
 * @param options.fromPostNumber - この番号以降のレスを取得（省略時は全件）。ポーリング差分取得用
 * @param options.range - 範囲指定（start 〜 end）。@pagination のレス範囲指定用
 * @param options.latestCount - 最新N件を取得。@pagination のl表示用
 * @returns Post 配列（post_number ASC ソート済み）
 */
// See: features/admin.feature @管理者が削除したレスはスレッド閲覧時に表示されない
export async function findByThreadId(
	threadId: string,
	options: {
		fromPostNumber?: number;
		range?: { start: number; end: number };
		latestCount?: number;
	} = {},
): Promise<Post[]> {
	// latestCount 指定時: post_number DESC で limit を取得してから反転する
	// See: tmp/workers/bdd-architect_TASK-162/design.md §2.4
	if (options.latestCount !== undefined) {
		const { data, error } = await supabaseAdmin
			.from("posts")
			.select("*")
			.eq("thread_id", threadId)
			.eq("is_deleted", false)
			.order("post_number", { ascending: false })
			.limit(options.latestCount);

		if (error) {
			throw new Error(`PostRepository.findByThreadId failed: ${error.message}`);
		}

		// DESC で取得したものを ASC に反転する
		return (data as PostRow[]).map(rowToPost).reverse();
	}

	let query = supabaseAdmin
		.from("posts")
		.select("*")
		.eq("thread_id", threadId)
		.eq("is_deleted", false)
		.order("post_number", { ascending: true });

	// fromPostNumber が指定された場合は、その番号以降のレスだけを取得する
	if (options.fromPostNumber !== undefined) {
		query = query.gte("post_number", options.fromPostNumber);
	}

	// range 指定時: start 〜 end の範囲のレスだけを取得する
	// See: features/thread.feature @pagination - "1-100" → レス1〜100
	if (options.range !== undefined) {
		query = query
			.gte("post_number", options.range.start)
			.lte("post_number", options.range.end);
	}

	const { data, error } = await query;

	if (error) {
		throw new Error(`PostRepository.findByThreadId failed: ${error.message}`);
	}

	return (data as PostRow[]).map(rowToPost);
}

/**
 * 著者 ID と日付でレス一覧を取得する（調査コマンド用）。
 * 全スレッド横断。システムメッセージ・削除済みレスを除外する。
 * !hissi（本日の書き込み表示）・!kinou（昨日のID取得）で使用する。
 *
 * 日付フィルタは UTC ベース（既存の countByDate と同方式）。
 * See: features/investigation.feature
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.3
 *
 * @param authorId - 著者ユーザーの UUID
 * @param date - 対象日付（YYYY-MM-DD 形式）
 * @param options.limit - 取得件数（省略時は全件）
 * @returns Post 配列（created_at DESC ソート済み）
 */
export async function findByAuthorIdAndDate(
	authorId: string,
	date: string,
	options: { limit?: number } = {},
): Promise<Post[]> {
	const limit = options.limit;

	let query = supabaseAdmin
		.from("posts")
		.select("*")
		.eq("author_id", authorId)
		.gte("created_at", `${date}T00:00:00.000Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.eq("is_system_message", false)
		.eq("is_deleted", false)
		.order("created_at", { ascending: false });

	if (limit !== undefined) {
		query = query.limit(limit);
	}

	const { data, error } = await query;

	if (error) {
		throw new Error(
			`PostRepository.findByAuthorIdAndDate failed: ${error.message}`,
		);
	}

	return (data as PostRow[]).map(rowToPost);
}

/**
 * 著者 ID（author_id）に紐づくレス一覧を created_at DESC で取得する。
 * マイページの書き込み履歴表示や管理画面のユーザー書き込み履歴に使用する。
 *
 * HIGH-003: offset パラメータを追加し、ページネーションに対応する。
 * Supabase の .range() を使用して offset/limit を実現する。
 *
 * @param authorId - 著者ユーザーの UUID
 * @param options.limit - 取得件数（デフォルト 50）
 * @param options.offset - スキップ件数（デフォルト 0）
 * @returns Post 配列（created_at DESC ソート済み）
 */
export async function findByAuthorId(
	authorId: string,
	options: { limit?: number; offset?: number } = {},
): Promise<Post[]> {
	const limit = options.limit ?? 50;
	const offset = options.offset ?? 0;

	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("*")
		.eq("author_id", authorId)
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		throw new Error(`PostRepository.findByAuthorId failed: ${error.message}`);
	}

	return (data as PostRow[]).map(rowToPost);
}

/**
 * 著者 ID（author_id）に紐づくレスをキーワード・日付範囲・ページネーション付きで検索する。
 * マイページの書き込み履歴検索に使用する。threads INNER JOIN でスレッドタイトルを取得する。
 *
 * HIGH-003: ページネーション・キーワード・日付範囲フィルタに対応する searchByAuthorId を新設。
 * findByAuthorId との責務分離: 既存呼び出し元への影響をゼロにするため別関数として定義する。
 *
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 * See: tmp/workers/bdd-architect_TASK-237/design.md §3.2
 *
 * @param authorId - 著者ユーザーの UUID
 * @param options.limit - 取得件数
 * @param options.offset - スキップ件数（ページネーション用）
 * @param options.keyword - 本文部分一致検索キーワード（省略時はフィルタなし）
 * @param options.startDate - 日付範囲の開始日（YYYY-MM-DD、省略時はフィルタなし）
 * @param options.endDate - 日付範囲の終了日（YYYY-MM-DD、inclusive）
 * @returns { posts: PostWithThread[], total: number }
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
	// 1. ベースクエリ構築: threads を INNER JOIN して1クエリで posts + thread title を取得する
	// { count: "exact" } で COUNT を同時取得し、追加クエリを不要にする
	// See: tmp/workers/bdd-architect_TASK-237/design.md §3.2 実装方針
	let query = supabaseAdmin
		.from("posts")
		.select("*, threads!inner(title)", { count: "exact" })
		.eq("author_id", authorId)
		.eq("is_deleted", false) // 論理削除除外
		.eq("is_system_message", false) // システムメッセージ除外
		.order("created_at", { ascending: false });

	// 2. キーワード検索（ILIKE による部分一致）
	// %keyword% はB-treeインデックス非対応だが、author_id で行数が十分絞り込まれる
	// See: tmp/workers/bdd-architect_TASK-237/design.md §3.4 インデックス設計
	if (options.keyword) {
		query = query.ilike("body", `%${options.keyword}%`);
	}

	// 3. 日付範囲フィルタ
	// startDate は inclusive（当日 00:00:00 以上）
	// endDate は inclusive（翌日 00:00:00 未満 = 当日 23:59:59.999 以下）
	if (options.startDate) {
		query = query.gte("created_at", `${options.startDate}T00:00:00.000Z`);
	}
	if (options.endDate) {
		// endDate inclusive: 翌日 00:00:00 未満 = 当日 23:59:59.999Z まで
		query = query.lt("created_at", `${options.endDate}T23:59:59.999Z`);
	}

	// 4. ページネーション: range(from, to) は inclusive
	query = query.range(options.offset, options.offset + options.limit - 1);

	const { data, count, error } = await query;

	if (error) {
		throw new Error(`PostRepository.searchByAuthorId failed: ${error.message}`);
	}

	// 5. JOIN 結果を展開してドメインモデルに変換する
	// Supabase の resource embedding では threads は { title: string } 形式で返る
	const posts = (data as (PostRow & { threads: { title: string } })[]).map(
		(row) => ({
			...rowToPost(row),
			threadTitle: row.threads.title,
		}),
	);

	return { posts, total: count ?? 0 };
}

/**
 * スレッドID とレス番号（postNumber）でレスを1件取得する。
 * コマンドの `>>N` 引数から対応するレスのUUIDを解決するために使用する。
 *
 * See: docs/architecture/components/command.md §2.3 解析ルール
 * See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
 *
 * @param threadId - スレッドの UUID
 * @param postNumber - レス番号（1始まり）
 * @returns 見つかった Post、存在しない場合は null
 */
export async function findByThreadIdAndPostNumber(
	threadId: string,
	postNumber: number,
): Promise<Post | null> {
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("*")
		.eq("thread_id", threadId)
		.eq("post_number", postNumber)
		.single();

	if (error) {
		// PGRST116: 行が見つからない場合
		if (error.code === "PGRST116") return null;
		throw new Error(
			`PostRepository.findByThreadIdAndPostNumber failed: ${error.message}`,
		);
	}

	return data ? rowToPost(data as PostRow) : null;
}

/**
 * レス番号の原子採番 + INSERT を RPC 1回で実行する。
 * DB 側の insert_post_with_next_number 関数で threads テーブルの行ロック (FOR UPDATE)
 * を取得し、採番と INSERT を単一トランザクション内で原子的に実行する。
 * これにより、従来の getNextPostNumber (SELECT MAX+1) → create (INSERT) 間の
 * TOCTOU 競合を解消する。
 *
 * UNIQUE 制約 (thread_id, post_number) は最終防衛線として維持する。
 *
 * See: docs/architecture/architecture.md §7.2 同時実行制御（レス番号採番）
 * See: supabase/migrations/00031_insert_post_with_next_number.sql
 * See: tmp/workers/bdd-architect_ATK-POST-001/assessment.md §3 推奨案
 *
 * @param post - 作成するレスのデータ（postNumber は DB 側で自動採番するため不要）
 * @returns 作成された Post（DB デフォルト値 + 採番済み postNumber を含む）
 */
export async function createWithAtomicNumber(
	post: Omit<Post, "id" | "createdAt" | "isDeleted" | "postNumber">,
): Promise<Post> {
	const { data, error } = await supabaseAdmin.rpc(
		"insert_post_with_next_number",
		{
			p_thread_id: post.threadId,
			p_author_id: post.authorId,
			p_display_name: post.displayName,
			p_daily_id: post.dailyId,
			p_body: post.body,
			p_inline_system_info: post.inlineSystemInfo,
			p_is_system_message: post.isSystemMessage,
		},
	);

	if (error) {
		throw new Error(
			`PostRepository.createWithAtomicNumber failed: ${error.message}`,
		);
	}

	return rowToPost(data as PostRow);
}

/**
 * 著者 ID（author_id）に紐づくレス総数を返す。
 * 初回書き込み検出（ウェルカムシーケンス発動判定）に使用する。
 * システムメッセージ・削除済みレスを含む全件をカウントする
 * （「投稿経験があるか」を判定するため）。
 *
 * See: features/welcome.feature @仮ユーザーが初めて書き込むとウェルカムシーケンスが発動する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §2.1 初回書き込み検出ロジック
 *
 * @param authorId - 著者ユーザーの UUID
 * @returns レス総数（レコードが存在しない場合は 0）
 */
export async function countByAuthorId(authorId: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("posts")
		.select("*", { count: "exact", head: true })
		.eq("author_id", authorId);

	if (error) {
		throw new Error(`PostRepository.countByAuthorId failed: ${error.message}`);
	}
	return count ?? 0;
}

/**
 * 指定日の書き込み数を集計する（非システムメッセージのみ）。
 * ダッシュボードのリアルタイムサマリーに使用する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-e リアルタイム集計
 *
 * @param date - 対象日付（YYYY-MM-DD 形式）
 * @returns 書き込み数
 */
export async function countByDate(date: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("posts")
		.select("*", { count: "exact", head: true })
		.gte("created_at", `${date}T00:00:00.000Z`)
		.lt("created_at", `${date}T23:59:59.999Z`)
		.eq("is_system_message", false);

	if (error) {
		throw new Error(`PostRepository.countByDate failed: ${error.message}`);
	}
	return count ?? 0;
}

/**
 * 指定日に書き込みがあったアクティブスレッド数を集計する。
 * ダッシュボードのリアルタイムサマリーに使用する。
 *
 * MEDIUM-002: 全行フェッチ+JS Set重複除去をDB側COUNT DISTINCT相当クエリに変更。
 * threads テーブルを主体に INNER JOIN で当日投稿があったスレッドを絞り込み、
 * DB側でスレッド単位のカウントを実現する（マイグレーション不要）。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 * See: tmp/feature_plan_admin_expansion.md §5-e リアルタイム集計
 *
 * @param date - 対象日付（YYYY-MM-DD 形式）
 * @returns アクティブスレッド数
 */
export async function countActiveThreadsByDate(date: string): Promise<number> {
	// threads テーブルを主体に、指定日に posts が存在するスレッドを INNER JOIN でフィルタリングし
	// DB側でスレッド数をカウントする。全行フェッチを回避する。
	// `posts!inner(thread_id)` は PostgREST の INNER JOIN 構文。
	const { count, error } = await supabaseAdmin
		.from("threads")
		.select("id, posts!inner(thread_id)", { count: "exact", head: true })
		.gte("posts.created_at", `${date}T00:00:00.000Z`)
		.lt("posts.created_at", `${date}T23:59:59.999Z`)
		.eq("posts.is_system_message", false);

	if (error) {
		throw new Error(
			`PostRepository.countActiveThreadsByDate failed: ${error.message}`,
		);
	}
	return count ?? 0;
}

/**
 * 日次リセットID（daily_id）でレス一覧を取得する。
 * LEAK-2/3 修正: BOT書き込み（authorId=null）への !hissi / !kinou コマンド対応。
 * dailyId は当日分のみ含むため日付フィルタ不要。システムメッセージ・削除済みレスを除外する。
 *
 * See: features/investigation.feature §ボットの書き込みへの調査
 * See: tmp/design_bot_leak_fix.md §3.3
 *
 * @param dailyId - 日次リセットID（8文字の16進数文字列）
 * @param options.limit - 取得件数（省略時は全件）
 * @returns Post 配列（created_at DESC ソート済み）
 */
export async function findByDailyId(
	dailyId: string,
	options: { limit?: number } = {},
): Promise<Post[]> {
	let query = supabaseAdmin
		.from("posts")
		.select("*")
		.eq("daily_id", dailyId)
		.eq("is_system_message", false)
		.eq("is_deleted", false)
		.order("created_at", { ascending: false });

	if (options.limit !== undefined) {
		query = query.limit(options.limit);
	}

	const { data, error } = await query;

	if (error) {
		throw new Error(`PostRepository.findByDailyId failed: ${error.message}`);
	}

	return (data as PostRow[]).map(rowToPost);
}

/**
 * レスを論理削除する（is_deleted = true に設定）。
 * 表示時は本文を「このレスは削除されました」に置換する（表示ロジックはプレゼンテーション層）。
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > posts > is_deleted
 *
 * @param postId - 対象レスの UUID
 */
export async function softDelete(postId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("posts")
		.update({ is_deleted: true })
		.eq("id", postId);

	if (error) {
		throw new Error(`PostRepository.softDelete failed: ${error.message}`);
	}
}

/**
 * 指定スレッド内の全レスをバッチで論理削除する（is_deleted = true に設定）。
 * 1回のUPDATE文でスレッド内全レスを一括削除するため、N+1問題を回避する。
 *
 * MEDIUM-005: スレッド削除時に個別softDelete×Nを呼び出していたN+1問題を解消。
 * admin-service.ts の deleteThread から呼び出される。
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > posts > is_deleted
 *
 * @param threadId - 論理削除対象のスレッドの UUID
 */
export async function softDeleteByThreadId(threadId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("posts")
		.update({ is_deleted: true })
		.eq("thread_id", threadId);

	if (error) {
		throw new Error(
			`PostRepository.softDeleteByThreadId failed: ${error.message}`,
		);
	}
}
