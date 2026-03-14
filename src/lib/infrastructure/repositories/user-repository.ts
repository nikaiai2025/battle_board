/**
 * UserRepository — ユーザーの永続化・検索を担うリポジトリ
 *
 * See: docs/architecture/architecture.md §3.2 Infrastructure Layer
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 *
 * 責務:
 *   - users テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import { supabaseAdmin } from '../supabase/client'
import type { User } from '../../domain/models/user'

// ---------------------------------------------------------------------------
// 型定義: users テーブルの DB 行型
// ---------------------------------------------------------------------------

/** users テーブルの DB レコード（snake_case）*/
interface UserRow {
  id: string
  auth_token: string
  author_id_seed: string
  is_premium: boolean
  /**
   * edge-token の認証完了状態。
   * See: supabase/migrations/00005_auth_verification.sql
   */
  is_verified: boolean
  username: string | null
  streak_days: number
  last_post_date: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 * Supabase レスポンスの日時フィールドは文字列で返るため Date に変換する。
 * last_post_date は DATE 型（日付のみ）のため文字列のまま保持する。
 */
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    authToken: row.auth_token,
    authorIdSeed: row.author_id_seed,
    isPremium: row.is_premium,
    isVerified: row.is_verified,
    username: row.username,
    streakDays: row.streak_days,
    lastPostDate: row.last_post_date,
    createdAt: new Date(row.created_at),
  }
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * ユーザーを ID で取得する。
 * @param id - ユーザーの UUID
 * @returns 見つかった User、存在しない場合は null
 */
export async function findById(id: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    // PGRST116: 行が見つからない場合
    if (error.code === 'PGRST116') return null
    throw new Error(`UserRepository.findById failed: ${error.message}`)
  }

  return data ? rowToUser(data as UserRow) : null
}

/**
 * ユーザーを auth_token（edge-token）で取得する。
 * 書き込みリクエスト受信時の認証検証に使用する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 *
 * @param authToken - 検索対象の edge-token
 * @returns 見つかった User、存在しない場合は null
 */
export async function findByAuthToken(authToken: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_token', authToken)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`UserRepository.findByAuthToken failed: ${error.message}`)
  }

  return data ? rowToUser(data as UserRow) : null
}

/**
 * 新しいユーザーを作成する。
 * id / createdAt / streakDays / lastPostDate は DB のデフォルト値を使用する。
 * isVerified は省略時 false（DBデフォルト値と一致）。
 *
 * See: features/phase1/authentication.feature @認証フロー是正
 *
 * @param user - 作成するユーザーのデータ（自動設定フィールドを除く）
 * @returns 作成された User（DB デフォルト値を含む）
 */
export async function create(
  user: Omit<User, 'id' | 'createdAt' | 'streakDays' | 'lastPostDate' | 'isVerified'> & { isVerified?: boolean }
): Promise<User> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      auth_token: user.authToken,
      author_id_seed: user.authorIdSeed,
      is_premium: user.isPremium,
      // isVerified が省略された場合は DB デフォルト（false）を使用する
      ...(user.isVerified !== undefined ? { is_verified: user.isVerified } : {}),
      username: user.username,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`UserRepository.create failed: ${error.message}`)
  }

  return rowToUser(data as UserRow)
}

/**
 * ユーザーの auth_token（edge-token）を更新する。
 * トークンのローテーションや認証コード検証完了後の有効化に使用する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 *
 * @param userId - 対象ユーザーの UUID
 * @param authToken - 新しい edge-token
 */
export async function updateAuthToken(userId: string, authToken: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ auth_token: authToken })
    .eq('id', userId)

  if (error) {
    throw new Error(`UserRepository.updateAuthToken failed: ${error.message}`)
  }
}

/**
 * ユーザーのストリーク情報（連続書き込み日数・最終書き込み日）を更新する。
 * 書き込み処理の完了後に IncentiveService から呼び出される。
 *
 * See: docs/requirements/ubiquitous_language.yaml #ストリーク
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users > streak_days
 *
 * @param userId - 対象ユーザーの UUID
 * @param streakDays - 新しい連続書き込み日数
 * @param lastPostDate - 最終書き込み日（YYYY-MM-DD 形式）
 */
export async function updateStreak(
  userId: string,
  streakDays: number,
  lastPostDate: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      streak_days: streakDays,
      last_post_date: lastPostDate,
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`UserRepository.updateStreak failed: ${error.message}`)
  }
}

/**
 * ユーザーのユーザーネームを更新する。
 * 有料ユーザーのみ設定可能（バリデーションはサービス層で実施）。
 *
 * See: docs/requirements/ubiquitous_language.yaml #ユーザーネーム
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users > username
 *
 * @param userId - 対象ユーザーの UUID
 * @param username - 新しいユーザーネーム（null でクリア）
 */
export async function updateUsername(userId: string, username: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ username })
    .eq('id', userId)

  if (error) {
    throw new Error(`UserRepository.updateUsername failed: ${error.message}`)
  }
}

/**
 * ユーザーの有料ステータス（isPremium）を更新する。
 * 課金モック実装（MypageService.upgradeToPremium）から呼び出される。
 *
 * See: features/phase1/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users > is_premium
 *
 * @param userId - 対象ユーザーの UUID
 * @param isPremium - 新しい有料ステータス
 */
export async function updateIsPremium(userId: string, isPremium: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_premium: isPremium })
    .eq('id', userId)

  if (error) {
    throw new Error(`UserRepository.updateIsPremium failed: ${error.message}`)
  }
}

/**
 * ユーザーの認証完了状態（isVerified）を更新する。
 * AuthService.verifyAuthCode が認証コードとTurnstileの検証に成功した後に呼び出される。
 * is_verified = true への更新により、書き込み時の認証チェック（G1 是正）が機能する。
 *
 * See: features/phase1/authentication.feature @認証フロー是正
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
 *
 * @param userId - 対象ユーザーの UUID
 * @param isVerified - 新しい認証完了状態（通常は true を渡す）
 */
export async function updateIsVerified(userId: string, isVerified: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_verified: isVerified })
    .eq('id', userId)

  if (error) {
    throw new Error(`UserRepository.updateIsVerified failed: ${error.message}`)
  }
}
