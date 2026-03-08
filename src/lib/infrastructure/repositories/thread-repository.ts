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

import { supabaseAdmin } from '../supabase/client'
import type { Thread } from '../../domain/models/thread'

// ---------------------------------------------------------------------------
// 型定義: threads テーブルの DB 行型
// ---------------------------------------------------------------------------

/** threads テーブルの DB レコード（snake_case）*/
interface ThreadRow {
  id: string
  thread_key: string
  board_id: string
  title: string
  post_count: number
  dat_byte_size: number
  created_by: string
  created_at: string
  last_post_at: string
  is_deleted: boolean
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
  }
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * スレッドを ID で取得する。
 * @param id - スレッドの UUID
 * @returns 見つかった Thread、存在しない場合は null
 */
export async function findById(id: string): Promise<Thread | null> {
  const { data, error } = await supabaseAdmin
    .from('threads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    // PGRST116: 行が見つからない場合
    if (error.code === 'PGRST116') return null
    throw new Error(`ThreadRepository.findById failed: ${error.message}`)
  }

  return data ? rowToThread(data as ThreadRow) : null
}

/**
 * スレッドを thread_key（専ブラ用 10 桁 UNIX タイムスタンプ）で取得する。
 * @param threadKey - 専ブラ互換キー
 * @returns 見つかった Thread、存在しない場合は null
 */
export async function findByThreadKey(threadKey: string): Promise<Thread | null> {
  const { data, error } = await supabaseAdmin
    .from('threads')
    .select('*')
    .eq('thread_key', threadKey)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`ThreadRepository.findByThreadKey failed: ${error.message}`)
  }

  return data ? rowToThread(data as ThreadRow) : null
}

/**
 * 板 ID に属するスレッド一覧を last_post_at DESC で取得する。
 * カーソルページネーションに対応する（cursor は last_post_at の ISO 文字列）。
 *
 * See: docs/architecture/components/posting.md §2.3 getThreadList
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 * @param options.limit - 取得件数（デフォルト 100）
 * @param options.cursor - カーソル（この last_post_at より古いものを取得）
 * @returns Thread 配列（last_post_at DESC ソート済み）
 */
export async function findByBoardId(
  boardId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<Thread[]> {
  const limit = options.limit ?? 100
  let query = supabaseAdmin
    .from('threads')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_deleted', false)
    .order('last_post_at', { ascending: false })
    .limit(limit)

  // カーソルが指定された場合は、その last_post_at より古いものだけを取得する
  if (options.cursor) {
    query = query.lt('last_post_at', options.cursor)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`ThreadRepository.findByBoardId failed: ${error.message}`)
  }

  return (data as ThreadRow[]).map(rowToThread)
}

/**
 * 新しいスレッドを作成する。
 * id / createdAt / lastPostAt / postCount / datByteSize / isDeleted は DB のデフォルト値を使用する。
 *
 * @param thread - 作成するスレッドのデータ（自動設定フィールドを除く）
 * @returns 作成された Thread（DB デフォルト値を含む）
 */
export async function create(
  thread: Omit<Thread, 'id' | 'createdAt' | 'lastPostAt' | 'postCount' | 'datByteSize' | 'isDeleted'>
): Promise<Thread> {
  const { data, error } = await supabaseAdmin
    .from('threads')
    .insert({
      thread_key: thread.threadKey,
      board_id: thread.boardId,
      title: thread.title,
      created_by: thread.createdBy,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`ThreadRepository.create failed: ${error.message}`)
  }

  return rowToThread(data as ThreadRow)
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
  const { error } = await supabaseAdmin.rpc('increment_thread_post_count', {
    p_thread_id: threadId,
  })

  if (error) {
    throw new Error(`ThreadRepository.incrementPostCount failed: ${error.message}`)
  }
}

/**
 * スレッドの last_post_at（最終書き込み日時）を更新する。
 * See: docs/architecture/architecture.md §7.1 書き込み + コマンド実行の一体処理（Step 2）
 *
 * @param threadId - 対象スレッドの UUID
 * @param lastPostAt - 新しい最終書き込み日時
 */
export async function updateLastPostAt(threadId: string, lastPostAt: Date): Promise<void> {
  const { error } = await supabaseAdmin
    .from('threads')
    .update({ last_post_at: lastPostAt.toISOString() })
    .eq('id', threadId)

  if (error) {
    throw new Error(`ThreadRepository.updateLastPostAt failed: ${error.message}`)
  }
}

/**
 * スレッドの dat_byte_size（Shift_JIS 換算累積バイト数）を更新する。
 * See: docs/architecture/architecture.md §11.3 Range 差分応答の実装方針
 *
 * @param threadId - 対象スレッドの UUID
 * @param datByteSize - 新しい累積バイト数
 */
export async function updateDatByteSize(threadId: string, datByteSize: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('threads')
    .update({ dat_byte_size: datByteSize })
    .eq('id', threadId)

  if (error) {
    throw new Error(`ThreadRepository.updateDatByteSize failed: ${error.message}`)
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
    .from('threads')
    .update({ is_deleted: true })
    .eq('id', threadId)

  if (error) {
    throw new Error(`ThreadRepository.softDelete failed: ${error.message}`)
  }
}
