/**
 * CurrencyRepository — 通貨残高の永続化・操作を担うリポジトリ
 *
 * See: docs/architecture/architecture.md §3.2 Infrastructure Layer
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > currencies
 * See: docs/architecture/architecture.md §7.2 同時実行制御（楽観的ロック）TDR-003
 * See: docs/architecture/components/currency.md §4 隠蔽する実装詳細
 *
 * 責務:
 *   - currencies テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - 楽観的ロック（WHERE balance >= :amount）による二重消費防止
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import { supabaseAdmin } from '../supabase/client'
import type { Currency, DeductResult } from '../../domain/models/currency'

// ---------------------------------------------------------------------------
// 型定義: currencies テーブルの DB 行型
// ---------------------------------------------------------------------------

/** currencies テーブルの DB レコード（snake_case）*/
interface CurrencyRow {
  user_id: string
  balance: number
  updated_at: string
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 * Supabase レスポンスの日時フィールドは文字列で返るため Date に変換する。
 */
function rowToCurrency(row: CurrencyRow): Currency {
  return {
    userId: row.user_id,
    balance: row.balance,
    updatedAt: new Date(row.updated_at),
  }
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * ユーザー ID で通貨レコードを取得する。
 * @param userId - ユーザーの UUID
 * @returns 見つかった Currency、存在しない場合は null
 */
export async function findByUserId(userId: string): Promise<Currency | null> {
  const { data, error } = await supabaseAdmin
    .from('currencies')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    // PGRST116: 行が見つからない場合
    if (error.code === 'PGRST116') return null
    throw new Error(`CurrencyRepository.findByUserId failed: ${error.message}`)
  }

  return data ? rowToCurrency(data as CurrencyRow) : null
}

/**
 * ユーザーの通貨レコードを新規作成する。
 * ユーザー登録時に CurrencyService から呼び出される。
 *
 * @param userId - ユーザーの UUID
 * @param initialBalance - 初期残高（デフォルト 0）
 * @returns 作成された Currency
 */
export async function create(userId: string, initialBalance: number = 0): Promise<Currency> {
  const { data, error } = await supabaseAdmin
    .from('currencies')
    .insert({
      user_id: userId,
      balance: initialBalance,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`CurrencyRepository.create failed: ${error.message}`)
  }

  return rowToCurrency(data as CurrencyRow)
}

/**
 * 通貨残高に指定額を加算する（credit）。
 * インセンティブ付与・告発ボーナス・撃破報酬など、残高を増やすすべての操作に使用する。
 * 加算は必ず成功する（マイナスにならないため）。DB 障害時のみ例外をスローする。
 *
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 *
 * @param userId - ユーザーの UUID
 * @param amount - 加算額（正の整数）
 */
export async function credit(userId: string, amount: number): Promise<void> {
  // PostgreSQL の atomic UPDATE で balance を安全にインクリメントする。
  // RPC 定義: CREATE OR REPLACE FUNCTION credit_currency(p_user_id UUID, p_amount INTEGER)
  //           RETURNS void AS $$
  //             UPDATE currencies
  //             SET balance = balance + p_amount, updated_at = now()
  //             WHERE user_id = p_user_id;
  //           $$ LANGUAGE sql;
  const { error } = await supabaseAdmin.rpc('credit_currency', {
    p_user_id: userId,
    p_amount: amount,
  })

  if (error) {
    throw new Error(`CurrencyRepository.credit failed: ${error.message}`)
  }
}

/**
 * 通貨残高から指定額を差し引く（deduct）。
 * 楽観的ロック（WHERE balance >= :amount）で二重消費と残高不足を防ぐ。
 *
 * 実装方針（TDR-003）:
 *   UPDATE currencies
 *   SET balance = balance - :amount, updated_at = now()
 *   WHERE user_id = :uid AND balance >= :amount
 *
 *   affected rows = 0 なら残高不足（または当該レコードが存在しない）。
 *   例外ではなく失敗型（DeductResult）を返す。
 *
 * See: docs/architecture/architecture.md §7.2 同時実行制御 TDR-003
 * See: docs/architecture/components/currency.md §4 隠蔽する実装詳細
 * See: docs/architecture/components/currency.md §5 楽観的ロックの採用
 *
 * @param userId - ユーザーの UUID
 * @param amount - 差し引く額（正の整数）
 * @returns DeductResult — 成功時は新残高、失敗時は reason: 'insufficient_balance'
 */
export async function deduct(userId: string, amount: number): Promise<DeductResult> {
  // PostgreSQL RPC で楽観的ロック付き UPDATE を実行し、影響行数と新残高を返す。
  // RPC 定義: CREATE OR REPLACE FUNCTION deduct_currency(p_user_id UUID, p_amount INTEGER)
  //           RETURNS TABLE(affected_rows INTEGER, new_balance INTEGER) AS $$
  //             WITH updated AS (
  //               UPDATE currencies
  //               SET balance = balance - p_amount, updated_at = now()
  //               WHERE user_id = p_user_id AND balance >= p_amount
  //               RETURNING balance
  //             )
  //             SELECT COUNT(*)::INTEGER, COALESCE((SELECT balance FROM updated), -1)
  //             FROM updated;
  //           $$ LANGUAGE sql;
  const { data, error } = await supabaseAdmin.rpc('deduct_currency', {
    p_user_id: userId,
    p_amount: amount,
  })

  if (error) {
    throw new Error(`CurrencyRepository.deduct failed: ${error.message}`)
  }

  // RPC の戻り値: { affected_rows: number, new_balance: number }
  const result = data as { affected_rows: number; new_balance: number } | null

  // affected_rows = 0 → 残高不足（balance < amount）
  if (!result || result.affected_rows === 0) {
    return { success: false, reason: 'insufficient_balance' }
  }

  return { success: true, newBalance: result.new_balance }
}

/**
 * ユーザーの現在の通貨残高を取得する。
 * マイページ表示など残高確認のみに使用する（消費操作には deduct を使うこと）。
 *
 * @param userId - ユーザーの UUID
 * @returns 現在の残高（レコードが存在しない場合は 0）
 */
export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('currencies')
    .select('balance')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return 0
    throw new Error(`CurrencyRepository.getBalance failed: ${error.message}`)
  }

  return (data as { balance: number }).balance
}
