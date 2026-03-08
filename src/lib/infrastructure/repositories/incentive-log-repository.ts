/**
 * IncentiveLogRepository — incentive_logs テーブルへの CRUD 操作
 *
 * インセンティブ（ボーナスイベント）の付与履歴を記録する。
 * (user_id, event_type, context_date) のユニーク制約と
 * ON CONFLICT DO NOTHING で日次重複付与を防止する（冪等性担保）。
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > incentive_logs
 * See: docs/architecture/architecture.md §7.2 同時実行制御 > インセンティブ重複
 */

import { supabaseAdmin } from '../supabase/client';
import type { IncentiveLog } from '../../domain/models/incentive';

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** incentive_logs テーブルの生レコード型 */
interface IncentiveLogRow {
  id: string;
  user_id: string;
  event_type: string;
  amount: number;
  context_id: string | null;
  context_date: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメインモデル 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToIncentiveLog(row: IncentiveLogRow): IncentiveLog {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type as IncentiveLog['eventType'],
    amount: row.amount,
    contextId: row.context_id,
    contextDate: row.context_date,
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * インセンティブログを作成する（冪等性保証）。
 *
 * ON CONFLICT (user_id, event_type, context_date) DO NOTHING により、
 * 同一ユーザー・同一イベント・同一日付での重複 INSERT は無視される。
 * INSERT が成功した場合はログレコードを返し、重複の場合は null を返す。
 *
 * See: docs/architecture/architecture.md §7.2 > インセンティブ重複 > ON CONFLICT DO NOTHING
 *
 * @param log 作成するインセンティブログ（id, createdAt を除く）
 * @returns INSERT 成功時はレコード、重複によるスキップ時は null
 */
export async function create(
  log: Omit<IncentiveLog, 'id' | 'createdAt'>
): Promise<IncentiveLog | null> {
  // ignoreDuplicates: true は ON CONFLICT DO NOTHING に相当する
  const { data, error } = await supabaseAdmin
    .from('incentive_logs')
    .insert({
      user_id: log.userId,
      event_type: log.eventType,
      amount: log.amount,
      context_id: log.contextId,
      context_date: log.contextDate,
    })
    .select()
    .single();

  if (error) {
    // 23505: ユニーク制約違反（重複 INSERT）→ null を返して重複を通知
    if (error.code === '23505') {
      return null;
    }
    // PGRST116: ON CONFLICT DO NOTHING で 0 行が INSERT された場合
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`IncentiveLogRepository.create failed: ${error.message}`);
  }

  return data ? rowToIncentiveLog(data as IncentiveLogRow) : null;
}

/**
 * 指定ユーザーの特定日付のインセンティブログを全件取得する。
 * マイページでの当日ボーナス確認・IncentiveService での重複チェックに使用する。
 *
 * @param userId 対象ユーザーの UUID
 * @param contextDate 対象日付（YYYY-MM-DD）
 * @returns 該当日付のインセンティブログ一覧（作成日時昇順）
 */
export async function findByUserIdAndDate(
  userId: string,
  contextDate: string
): Promise<IncentiveLog[]> {
  const { data, error } = await supabaseAdmin
    .from('incentive_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('context_date', contextDate)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`IncentiveLogRepository.findByUserIdAndDate failed: ${error.message}`);
  }

  return (data as IncentiveLogRow[]).map(rowToIncentiveLog);
}

/**
 * 指定ユーザーのインセンティブログを取得する。
 * マイページでの全ボーナス履歴表示に使用する。
 *
 * @param userId 対象ユーザーの UUID
 * @param options クエリオプション
 * @param options.limit 取得件数の上限（指定なしは全件）
 * @returns インセンティブログ一覧（作成日時降順）
 */
export async function findByUserId(
  userId: string,
  options?: { limit?: number }
): Promise<IncentiveLog[]> {
  let query = supabaseAdmin
    .from('incentive_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`IncentiveLogRepository.findByUserId failed: ${error.message}`);
  }

  return (data as IncentiveLogRow[]).map(rowToIncentiveLog);
}
