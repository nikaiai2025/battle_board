/**
 * CurrencyService — 通貨操作の統括サービス
 *
 * See: features/phase1/currency.feature
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §3.2 CurrencyService
 *
 * 責務:
 *   - CurrencyRepository をラップし、通貨の加算・減算・残高取得・初期化を提供する薄いサービス層
 *   - 残高不足時は例外ではなく DeductResult.success=false を返す
 *   - 二重消費防止・楽観的ロックの実装詳細は CurrencyRepository が担当する
 *
 * 設計上の判断:
 *   - credit は常に成功する（マイナスにならないため）。DB障害時のみ例外をスロー
 *   - deduct は残高不足時に失敗型を返す（例外スロー不可）
 *   - initializeBalance は新規ユーザー登録時に呼び出す（初期残高 INITIAL_BALANCE）
 */

import * as CurrencyRepository from '../infrastructure/repositories/currency-repository'
import type { DeductResult, DeductReason, CreditReason } from '../domain/models/currency'

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 新規ユーザー登録時の初期通貨付与額。
 * See: features/phase1/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
 */
export const INITIAL_BALANCE = 50

// ---------------------------------------------------------------------------
// サービス関数
// ---------------------------------------------------------------------------

/**
 * 残高に指定額を加算する（credit）。
 * 加算は必ず成功する。DB障害時のみ例外をスローし、呼び出し元のトランザクションをロールバックさせる。
 *
 * See: features/phase1/currency.feature
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 *
 * @param userId - 対象ユーザーの UUID
 * @param amount - 加算額（正の整数）
 * @param reason - 付与理由（監査ログ用途。将来的に incentive_log テーブルへ記録予定）
 */
export async function credit(
  userId: string,
  amount: number,
  reason: CreditReason
): Promise<void> {
  // reason は将来的な incentive_log 記録のために受け取るが、
  // 現フェーズではリポジトリに渡さない（IncentiveService が担当予定）
  await CurrencyRepository.credit(userId, amount)
}

/**
 * 残高から指定額を差し引く（deduct）。
 * 楽観的ロック（CurrencyRepository 担当）により二重消費と残高不足を防ぐ。
 * 残高不足時は例外ではなく失敗型（DeductResult）を返す。
 *
 * See: features/phase1/currency.feature @通貨残高がマイナスになる操作は実行されない
 * See: features/phase1/currency.feature @同時操作による通貨の二重消費が発生しない
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §7.2 同時実行制御 TDR-003
 *
 * @param userId - 対象ユーザーの UUID
 * @param amount - 差し引く額（正の整数）
 * @param reason - 消費理由（監査ログ用途）
 * @returns DeductResult — 成功時は新残高、残高不足時は reason: 'insufficient_balance'
 */
export async function deduct(
  userId: string,
  amount: number,
  reason: DeductReason
): Promise<DeductResult> {
  // reason は将来的な audit ログ記録のために受け取るが、
  // 現フェーズではリポジトリに渡さない
  return CurrencyRepository.deduct(userId, amount)
}

/**
 * ユーザーの現在の通貨残高を取得する。
 * マイページ表示など残高確認のみに使用する（消費操作には deduct を使うこと）。
 *
 * See: features/phase1/currency.feature @マイページで通貨残高を確認する
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 *
 * @param userId - 対象ユーザーの UUID
 * @returns 現在の残高（レコードが存在しない場合は 0）
 */
export async function getBalance(userId: string): Promise<number> {
  return CurrencyRepository.getBalance(userId)
}

/**
 * 新規ユーザーの通貨レコードを作成し、初期通貨 INITIAL_BALANCE を付与する。
 * AuthService.issueEdgeToken から呼び出される。
 *
 * See: features/phase1/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 *
 * @param userId - 新規ユーザーの UUID
 */
export async function initializeBalance(userId: string): Promise<void> {
  // CurrencyRepository.create で通貨レコードを作成し、初期残高 50 を設定する
  await CurrencyRepository.create(userId, INITIAL_BALANCE)
}
