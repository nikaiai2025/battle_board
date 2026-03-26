/**
 * ThreadRepository — スレッドの永続化・検索を担うリポジトリ
 *
 * See: docs/architecture/architecture.md §3.2 Infrastructure Layer
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > threads
 * See: docs/architecture/components/posting.md §3.1 依存先 > ThreadRepository
 *
 * 責務:
 *   - threads テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import type { Thread } from "../../domain/models/thread";
import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義: threads テーブルの DB 行型
// ---------------------------------------------------------------------------

/** threads テーブルの DB レコード（snake_case）*/
interface ThreadRow {
	id: string;
	thread_key: string;
	board_id: string;
	title: string;
	post_count: number;
	dat_byte_size: number;
	created_by: string;
	created_at: string;
	last_post_at: string;
	is_deleted: boolean;
	/** 固定スレッドフラグ。See: supabase/migrations/00009_pinned_thread.sql */
	is_pinned: boolean;
	/** 休眠フラグ。See: supabase/migrations/00018_add_thread_dormancy.sql */
	is_dormant: boolean;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 * Supabase レスポンスの日時フィールドは文字列で返るため Date に変換する。
 */
function rowToThread(row: ThreadRow): Thread {
	return {
		id: row.id,
		threadKey: row.thread_key,
		boardId: row.board_id,
		title: row.title,
		postCount: row.post_count,
		datByteSize: row.dat_byte_size,
		createdBy: row.created_by,
		createdAt: new Date(row.created_at),
		lastPostAt: new Date(row.last_post_at),
		isDeleted: row.is_deleted,
		// is_pinned が未定義（マイグレーション前の行）の場合は false にフォールバック
		isPinned: row.is_pinned ?? false,
		// is_dormant が未定義（マイグレーション前の行）の場合は false にフォールバック
		// See: docs/specs/thread_state_transitions.yaml #states.listed (initial: true)
		isDormant: row.is_dormant ?? false,
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * スレッドを ID で取得する。
 * @param id - スレッドの UUID
 * @returns 見つかった Thread、存在しない場合は null
 */
// See: features/admin.feature @管理者が削除したスレッドはURL直接アクセスでも表示されない
export async function findById(id: string): Promise<Thread | null> {
	const { data, error } = await supabaseAdmin
		.from("threads")
		.select("*")
		.eq("id", id)
		.eq("is_deleted", false)
		.single();

	if (error) {
		// PGRST116: 行が見つからない場合
		if (error.code === "PGRST116") return null;
		throw new Error(`ThreadRepository.findById failed: ${error.message}`);
	}

	return data ? rowToThread(data as ThreadRow) : null;
}

/**
 * スレッドを thread_key（専ブラ用 10 桁 UNIX タイムスタンプ）で取得する。
 * @param threadKey - 専ブラ互換キー
 * @returns 見つかった Thread、存在しない場合は null
 */
// See: features/admin.feature @管理者が削除したスレッドはURL直接アクセスでも表示されない
export async function findByThreadKey(
	threadKey: string,
): Promise<Thread | null> {
	const { data, error } = await supabaseAdmin
		.from("threads")
		.select("*")
		.eq("thread_key", threadKey)
		.eq("is_deleted", false)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(
			`ThreadRepository.findByThreadKey failed: ${error.message}`,
		);
	}

	return data ? rowToThread(data as ThreadRow) : null;
}

/**
 * 板 ID に属するスレッド一覧を last_post_at DESC で取得する。
 * カーソルページネーションおよびアクティブスレッドフィルタリングに対応する。
 *
 * See: docs/architecture/components/posting.md §2.3 getThreadList
 * See: docs/specs/thread_state_transitions.yaml #listing_rules
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 * @param options.limit - 取得件数（デフォルト 100）。onlyActive=true の場合は使用しない
 * @param options.cursor - カーソル（この last_post_at より古いものを取得）
 * @param options.onlyActive - true の場合は is_dormant=false のスレッドのみ取得し LIMIT を付けない
 *   アクティブスレッド数は書き込み時の休眠管理で制御されるため LIMIT 不要
 *   See: docs/specs/thread_state_transitions.yaml #listing_rules LIMIT不使用
 * @returns Thread 配列（last_post_at DESC ソート済み）
 */
export async function findByBoardId(
	boardId: string,
	options: { limit?: number; cursor?: string; onlyActive?: boolean } = {},
): Promise<Thread[]> {
	let query = supabaseAdmin
		.from("threads")
		.select("*")
		.eq("board_id", boardId)
		.eq("is_deleted", false)
		.order("last_post_at", { ascending: false });

	if (options.onlyActive) {
		// アクティブスレッドのみ: is_dormant=false を条件に追加し LIMIT は付けない
		// See: docs/specs/thread_state_transitions.yaml #listing_rules filter
		query = query.eq("is_dormant", false);
	} else {
		// 後方互換: onlyActive 未指定時は従来の LIMIT 方式を維持する
		const limit = options.limit ?? 100;
		query = query.limit(limit);
	}

	// カーソルが指定された場合は、その last_post_at より古いものだけを取得する
	if (options.cursor) {
		query = query.lt("last_post_at", options.cursor);
	}

	const { data, error } = await query;

	if (error) {
		throw new Error(`ThreadRepository.findByBoardId failed: ${error.message}`);
	}

	return (data as ThreadRow[]).map(rowToThread);
}

/**
 * 新しいスレッドを作成する。
 * id / createdAt / lastPostAt / postCount / datByteSize / isDeleted は DB のデフォルト値を使用する。
 * isDormant は DB のデフォルト値（false）を使用するため省略可能とする。
 *
 * @param thread - 作成するスレッドのデータ（自動設定フィールドを除く）
 * @returns 作成された Thread（DB デフォルト値を含む）
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
	const { data, error } = await supabaseAdmin
		.from("threads")
		.insert({
			thread_key: thread.threadKey,
			board_id: thread.boardId,
			title: thread.title,
			created_by: thread.createdBy,
			// isPinned は通常は false（デフォルト）。固定スレッド生成スクリプトのみ true を設定
			// See: scripts/upsert-pinned-thread.ts
			...(thread.isPinned ? { is_pinned: true } : {}),
		})
		.select()
		.single();

	if (error) {
		throw new Error(`ThreadRepository.create failed: ${error.message}`);
	}

	return rowToThread(data as ThreadRow);
}

/**
 * スレッドのレス数を 1 増加させる。
 * PostgreSQL の atomic UPDATE（post_count = post_count + 1）でレース競合を防ぐ。
 * See: docs/architecture/architecture.md §7.1 書き込み + コマンド実行の一体処理（Step 2）
 * See: docs/architecture/architecture.md §7.2 同時実行制御
 *
 * @param threadId - 対象スレッドの UUID
 */
export async function incrementPostCount(threadId: string): Promise<void> {
	// Supabase JS v2 では式評価を直接記述できないため、
	// PostgreSQL RPC で atomic インクリメントを実行する。
	// RPC 定義: CREATE OR REPLACE FUNCTION increment_thread_post_count(p_thread_id UUID)
	//           RETURNS void AS $$
	//             UPDATE threads SET post_count = post_count + 1 WHERE id = p_thread_id;
	//           $$ LANGUAGE sql;
	const { error } = await supabaseAdmin.rpc("increment_thread_post_count", {
		p_thread_id: threadId,
	});

	if (error) {
		throw new Error(
			`ThreadRepository.incrementPostCount failed: ${error.message}`,
		);
	}
}

/**
 * スレッドの last_post_at（最終書き込み日時）を更新する。
 * See: docs/architecture/architecture.md §7.1 書き込み + コマンド実行の一体処理（Step 2）
 *
 * @param threadId - 対象スレッドの UUID
 * @param lastPostAt - 新しい最終書き込み日時
 */
export async function updateLastPostAt(
	threadId: string,
	lastPostAt: Date,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("threads")
		.update({ last_post_at: lastPostAt.toISOString() })
		.eq("id", threadId);

	if (error) {
		throw new Error(
			`ThreadRepository.updateLastPostAt failed: ${error.message}`,
		);
	}
}

/**
 * スレッドの dat_byte_size（Shift_JIS 換算累積バイト数）を更新する。
 * See: docs/architecture/architecture.md §11.3 Range 差分応答の実装方針
 *
 * @param threadId - 対象スレッドの UUID
 * @param datByteSize - 新しい累積バイト数
 */
export async function updateDatByteSize(
	threadId: string,
	datByteSize: number,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("threads")
		.update({ dat_byte_size: datByteSize })
		.eq("id", threadId);

	if (error) {
		throw new Error(
			`ThreadRepository.updateDatByteSize failed: ${error.message}`,
		);
	}
}

/**
 * スレッドを論理削除する（is_deleted = true に設定）。
 * See: docs/architecture/architecture.md §10.1.1 RLS ポリシー設計
 *
 * @param threadId - 対象スレッドの UUID
 */
export async function softDelete(threadId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("threads")
		.update({ is_deleted: true })
		.eq("id", threadId);

	if (error) {
		throw new Error(`ThreadRepository.softDelete failed: ${error.message}`);
	}
}

// ---------------------------------------------------------------------------
// 休眠管理関数
// See: docs/specs/thread_state_transitions.yaml #transitions
// See: docs/architecture/components/posting.md §5 休眠管理の責務
// ---------------------------------------------------------------------------

/**
 * 休眠中のスレッドを復活させる（is_dormant = false に更新）。
 * 書き込み時に対象スレッドが休眠中の場合に呼び出される。
 *
 * See: docs/specs/thread_state_transitions.yaml #transitions unlisted→listed
 * See: docs/architecture/architecture.md §7.1 step 2b
 *
 * @param threadId - 対象スレッドの UUID
 */
export async function wakeThread(threadId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("threads")
		.update({ is_dormant: false })
		.eq("id", threadId);

	if (error) {
		throw new Error(`ThreadRepository.wakeThread failed: ${error.message}`);
	}
}

/**
 * 指定板のアクティブスレッドのうち、last_post_at が最古の非固定スレッドを休眠化する。
 * アクティブスレッド数が上限（50件）を超えた場合に書き込み時の同期処理で呼び出される。
 *
 * 条件:
 *   - is_deleted = false（削除されていない）
 *   - is_dormant = false（アクティブ）
 *   - is_pinned = false（固定スレッドは休眠化対象外）
 *   - last_post_at が上記条件の中で最も古いスレッド
 *
 * See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted
 * See: docs/architecture/architecture.md §7.1 step 2b
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 */
export async function demoteOldestActiveThread(boardId: string): Promise<void> {
	// アクティブ非固定スレッドの中で last_post_at が最古のものを1件取得する
	const { data, error: selectError } = await supabaseAdmin
		.from("threads")
		.select("id")
		.eq("board_id", boardId)
		.eq("is_deleted", false)
		.eq("is_dormant", false)
		.eq("is_pinned", false)
		.order("last_post_at", { ascending: true })
		.limit(1)
		.single();

	if (selectError) {
		// PGRST116: 対象スレッドが存在しない（全スレッドが固定 or 休眠済み）
		if (selectError.code === "PGRST116") return;
		throw new Error(
			`ThreadRepository.demoteOldestActiveThread (select) failed: ${selectError.message}`,
		);
	}

	if (!data) return;

	// 取得したスレッドを休眠化する
	const { error: updateError } = await supabaseAdmin
		.from("threads")
		.update({ is_dormant: true })
		.eq("id", (data as { id: string }).id);

	if (updateError) {
		throw new Error(
			`ThreadRepository.demoteOldestActiveThread (update) failed: ${updateError.message}`,
		);
	}
}

/**
 * 管理者用: 全スレッドを取得する（削除済みを含む）。
 * is_deleted によるフィルタを行わず、last_post_at DESC でソートする。
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: src/app/api/admin/threads/route.ts
 *
 * @param options.limit - 取得件数（デフォルト 200）
 * @returns Thread 配列（last_post_at DESC ソート済み）
 */
export async function findAllForAdmin(
	options: { limit?: number } = {},
): Promise<Thread[]> {
	const limit = options.limit ?? 200;

	const { data, error } = await supabaseAdmin
		.from("threads")
		.select("*")
		.order("last_post_at", { ascending: false })
		.limit(limit);

	if (error) {
		throw new Error(
			`ThreadRepository.findAllForAdmin failed: ${error.message}`,
		);
	}

	return (data as ThreadRow[]).map(rowToThread);
}

/**
 * 指定板のアクティブスレッド数を返す。
 * アクティブスレッド = is_deleted=false かつ is_dormant=false
 *
 * See: docs/specs/thread_state_transitions.yaml #listing_rules max_listed
 * See: docs/architecture/architecture.md §7.1 step 2b
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 * @returns アクティブスレッド数
 */
export async function countActiveThreads(boardId: string): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("threads")
		.select("*", { count: "exact", head: true })
		.eq("board_id", boardId)
		.eq("is_deleted", false)
		.eq("is_dormant", false);

	if (error) {
		throw new Error(
			`ThreadRepository.countActiveThreads failed: ${error.message}`,
		);
	}

	return count ?? 0;
}
