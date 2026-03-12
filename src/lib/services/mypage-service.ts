/**
 * MypageService — マイページ機能の統括サービス
 *
 * See: features/phase1/mypage.feature
 * See: features/phase1/currency.feature @マイページで通貨残高を確認する
 * See: docs/architecture/architecture.md §3.2 Service Layer
 *
 * 責務:
 *   - UserRepository・CurrencyRepository・PostRepository を組み合わせてマイページ情報を提供する
 *   - ユーザーネーム設定（有料ユーザーのみ）
 *   - 課金モック（フラグ切替のみ。実決済なし）
 *   - 書き込み履歴取得
 *
 * 設計上の判断:
 *   - 課金は MVP フェーズではモック実装（isPremium フラグ切替のみ）
 *   - ユーザーネーム設定は有料ユーザーのみ許可。無料ユーザーへのエラーはサービス層で返す
 *   - ユーザー不在時は null を返す（呼び出し元が 404 を判断する）
 */

import * as UserRepository from '../infrastructure/repositories/user-repository'
import * as CurrencyService from './currency-service'
import * as PostRepository from '../infrastructure/repositories/post-repository'
import type { User } from '../domain/models/user'
import type { Post } from '../domain/models/post'

// ---------------------------------------------------------------------------
// 型定義: マイページ関連の公開インターフェース
// ---------------------------------------------------------------------------

/**
 * マイページ基本情報レスポンス
 * See: features/phase1/mypage.feature @マイページに基本情報が表示される
 * See: features/phase1/currency.feature @マイページで通貨残高を確認する
 *
 * NOTE: authToken（edge-token）はセキュリティ上の理由からレスポンスに含めない。
 *   クライアントはCookieを通じて自動送信されるため、JSONレスポンスでの返却は不要。
 *   See: tmp/reports/code_review_phase1.md CR-002
 */
export interface MypageInfo {
  /** ユーザーID */
  userId: string
  /** 通貨残高 */
  balance: number
  /** 有料ユーザーフラグ */
  isPremium: boolean
  /** ユーザーネーム（有料ユーザーのみ設定可。未設定の場合は null） */
  username: string | null
  /** 連続書き込み日数 */
  streakDays: number
}

/**
 * ユーザーネーム設定結果
 * See: features/phase1/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
 */
export type SetUsernameResult =
  | { success: true; username: string }
  | { success: false; error: string; code: 'NOT_PREMIUM' | 'USER_NOT_FOUND' | 'VALIDATION_ERROR' }

/**
 * 課金（有料ステータス切替）結果
 * See: features/phase1/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 */
export type UpgradeToPremiumResult =
  | { success: true }
  | { success: false; error: string; code: 'ALREADY_PREMIUM' | 'USER_NOT_FOUND' }

/**
 * 書き込み履歴アイテム
 * See: features/phase1/mypage.feature @自分の書き込み履歴を確認できる
 */
export interface PostHistoryItem {
  /** レスID */
  id: string
  /** スレッドID */
  threadId: string
  /** レス番号 */
  postNumber: number
  /** 本文 */
  body: string
  /** 書き込み日時 */
  createdAt: Date
}

// ---------------------------------------------------------------------------
// ユーザーネームバリデーション定数
// ---------------------------------------------------------------------------

/** ユーザーネームの最大文字数 */
const USERNAME_MAX_LENGTH = 20

// ---------------------------------------------------------------------------
// サービス関数
// ---------------------------------------------------------------------------

/**
 * マイページ基本情報を取得する。
 * 通貨残高・アカウント情報（有料/無料ステータス・ユーザーネーム）を一括取得する。
 *
 * See: features/phase1/mypage.feature @マイページに基本情報が表示される
 * See: features/phase1/currency.feature @マイページで通貨残高を確認する
 *
 * @param userId - 対象ユーザーの UUID
 * @returns MypageInfo、ユーザーが存在しない場合は null
 */
export async function getMypage(userId: string): Promise<MypageInfo | null> {
  // ユーザー情報と通貨残高を並列取得（パフォーマンス最適化）
  const [user, balance] = await Promise.all([
    UserRepository.findById(userId),
    CurrencyService.getBalance(userId),
  ])

  // ユーザーが存在しない場合は null を返す（呼び出し元が 404 を判断する）
  if (!user) return null

  // authToken は CR-002 修正によりレスポンスから除去済み
  // Cookieで自動送信されるため、JSONレスポンスに含める必要はない
  return {
    userId: user.id,
    balance,
    isPremium: user.isPremium,
    username: user.username,
    streakDays: user.streakDays,
  }
}

/**
 * ユーザーネームを設定する。有料ユーザーのみ許可。
 *
 * See: features/phase1/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
 * See: features/phase1/mypage.feature @無料ユーザーはユーザーネームを設定できない
 *
 * @param userId - 対象ユーザーの UUID
 * @param username - 設定するユーザーネーム
 * @returns SetUsernameResult — 成功時は新しいユーザーネーム、失敗時はエラー情報
 */
export async function setUsername(
  userId: string,
  username: string
): Promise<SetUsernameResult> {
  // 入力バリデーション: 空文字・空白のみ禁止
  const trimmedUsername = username.trim()
  if (!trimmedUsername) {
    return {
      success: false,
      error: 'ユーザーネームを入力してください',
      code: 'VALIDATION_ERROR',
    }
  }

  // 入力バリデーション: 最大文字数チェック
  if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
    return {
      success: false,
      error: `ユーザーネームは${USERNAME_MAX_LENGTH}文字以内で入力してください`,
      code: 'VALIDATION_ERROR',
    }
  }

  // ユーザー存在確認
  const user = await UserRepository.findById(userId)
  if (!user) {
    return {
      success: false,
      error: 'ユーザーが見つかりません',
      code: 'USER_NOT_FOUND',
    }
  }

  // 有料ユーザー権限チェック
  // See: features/phase1/mypage.feature @無料ユーザーはユーザーネームを設定できない
  if (!user.isPremium) {
    return {
      success: false,
      error: 'ユーザーネームの設定は有料ユーザーのみ利用できます',
      code: 'NOT_PREMIUM',
    }
  }

  // ユーザーネームを更新する
  await UserRepository.updateUsername(userId, trimmedUsername)

  return { success: true, username: trimmedUsername }
}

/**
 * 無料ユーザーを有料ユーザーにアップグレードする（課金モック）。
 * MVP フェーズでは実決済なし。isPremium フラグの切替のみ行う。
 *
 * See: features/phase1/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: features/phase1/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 *
 * @param userId - 対象ユーザーの UUID
 * @returns UpgradeToPremiumResult — 成功時は { success: true }、失敗時はエラー情報
 */
export async function upgradeToPremium(userId: string): Promise<UpgradeToPremiumResult> {
  // ユーザー存在確認
  const user = await UserRepository.findById(userId)
  if (!user) {
    return {
      success: false,
      error: 'ユーザーが見つかりません',
      code: 'USER_NOT_FOUND',
    }
  }

  // 既に有料ユーザーの場合はエラー
  // See: features/phase1/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
  if (user.isPremium) {
    return {
      success: false,
      error: '既に有料ユーザーです',
      code: 'ALREADY_PREMIUM',
    }
  }

  // isPremium フラグを true に切替（モック実装。実決済なし）
  await UserRepository.updateIsPremium(userId, true)

  return { success: true }
}

/**
 * ユーザーの書き込み履歴を取得する。
 *
 * See: features/phase1/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/phase1/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
 *
 * @param userId - 対象ユーザーの UUID
 * @param options.limit - 取得件数（デフォルト 50）
 * @returns PostHistoryItem 配列（created_at DESC ソート済み）
 */
export async function getPostHistory(
  userId: string,
  options: { limit?: number } = {}
): Promise<PostHistoryItem[]> {
  const posts: Post[] = await PostRepository.findByAuthorId(userId, options)

  // 論理削除されたレスは除外する（利用者の書き込み履歴として見せない）
  return posts
    .filter((post) => !post.isDeleted)
    .map((post) => ({
      id: post.id,
      threadId: post.threadId,
      postNumber: post.postNumber,
      body: post.body,
      createdAt: post.createdAt,
    }))
}
