/**
 * AccusationRepository — accusations テーブルへの CRUD 操作
 *
 * accusations テーブルは AI告発（!tell コマンド）の実行記録を保存する。
 * (accuser_id, target_post_id) のユニーク制約で重複告発を防止する。
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > accusations
 * See: docs/architecture/architecture.md §11.2 DB最適化 > accusations インデックス
 */

import { supabaseAdmin } from '../supabase/client';
import type { Accusation } from '../../domain/models/accusation';

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** accusations テーブルの生レコード型 */
interface AccusationRow {
  id: string;
  accuser_id: string;
  target_post_id: string;
  thread_id: string;
  result: string;
  bonus_amount: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメインモデル 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToAccusation(row: AccusationRow): Accusation {
  return {
    id: row.id,
    accuserId: row.accuser_id,
    targetPostId: row.target_post_id,
    threadId: row.thread_id,
    result: row.result as 'hit' | 'miss',
    bonusAmount: row.bonus_amount,
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 新規告発レコードを作成する。
 * id, createdAt は DB デフォルト値で生成されるため入力から除外する。
 *
 * @param accusation 作成する告発データ（id, createdAt を除く）
 * @returns 作成された告発レコード（DB 生成フィールドを含む）
 * @throws 重複告発の場合は DB ユニーク制約違反でエラー
 */
export async function create(
  accusation: Omit<Accusation, 'id' | 'createdAt'>
): Promise<Accusation> {
  const { data, error } = await supabaseAdmin
    .from('accusations')
    .insert({
      accuser_id: accusation.accuserId,
      target_post_id: accusation.targetPostId,
      thread_id: accusation.threadId,
      result: accusation.result,
      bonus_amount: accusation.bonusAmount,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`AccusationRepository.create failed: ${error.message}`);
  }

  return rowToAccusation(data as AccusationRow);
}

/**
 * 同一ユーザーが同一レスを告発した記録を取得する。
 * 重複告発チェックに使用する。
 * (accuser_id, target_post_id) にユニーク制約があるため、最大1件。
 *
 * See: docs/architecture/architecture.md §4.2 > accusations.UNIQUE制約
 *
 * @param accuserId 告発者の user_id（UUID）
 * @param targetPostId 告発対象の post_id（UUID）
 * @returns 既存の告発レコード、または存在しない場合は null
 */
export async function findByAccuserAndTarget(
  accuserId: string,
  targetPostId: string
): Promise<Accusation | null> {
  const { data, error } = await supabaseAdmin
    .from('accusations')
    .select('*')
    .eq('accuser_id', accuserId)
    .eq('target_post_id', targetPostId)
    .single();

  if (error) {
    // PGRST116: 行が見つからない（重複なし）
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`AccusationRepository.findByAccuserAndTarget failed: ${error.message}`);
  }

  return data ? rowToAccusation(data as AccusationRow) : null;
}

/**
 * スレッド内の全告発レコードを取得する。
 * スレッドでの告発結果表示に使用する（告発結果は全公開）。
 *
 * See: docs/architecture/architecture.md §10.1.1 > accusations: SELECT (スレッド内の告発結果)
 *
 * @param threadId スレッドの UUID
 * @returns スレッド内の告発レコード一覧（作成日時昇順）
 */
export async function findByThreadId(threadId: string): Promise<Accusation[]> {
  const { data, error } = await supabaseAdmin
    .from('accusations')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`AccusationRepository.findByThreadId failed: ${error.message}`);
  }

  return (data as AccusationRow[]).map(rowToAccusation);
}
