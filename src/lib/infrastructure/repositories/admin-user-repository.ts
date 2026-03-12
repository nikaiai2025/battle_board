/**
 * AdminUserRepository — 管理者ユーザーの永続化・検索を担うリポジトリ
 *
 * See: features/phase1/admin.feature
 * See: features/phase1/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: docs/architecture/components/admin.md §3 依存関係
 * See: docs/architecture/architecture.md §5.3 管理者認証
 *
 * 責務:
 *   - admin_users テーブルへの読み取り操作
 *   - 管理者メール・パスワード認証（Supabase Auth 経由）
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import { supabaseAdmin } from '../supabase/client'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** admin_users テーブルの DB レコード（snake_case）*/
interface AdminUserRow {
  id: string
  role: string
  created_at: string
}

/** 管理者ユーザードメインモデル */
export interface AdminUser {
  id: string
  role: string
  createdAt: Date
}

/** Supabase Auth によるログイン結果 */
export type AdminLoginResult =
  | { success: true; sessionToken: string; userId: string }
  | { success: false; reason: 'invalid_credentials' | 'not_admin' }

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    role: row.role,
    createdAt: new Date(row.created_at),
  }
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 管理者ユーザーを ID で取得する。
 *
 * See: docs/architecture/components/admin.md §5 設計上の判断 > 認証と認可の分離
 *
 * @param id - 管理者ユーザーの UUID（Supabase Auth の user.id と一致）
 * @returns 見つかった AdminUser、存在しない場合は null
 */
export async function findById(id: string): Promise<AdminUser | null> {
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    // PGRST116: 行が見つからない場合
    if (error.code === 'PGRST116') return null
    throw new Error(`AdminUserRepository.findById failed: ${error.message}`)
  }

  return data ? rowToAdminUser(data as AdminUserRow) : null
}

/**
 * Supabase Auth を使用して管理者のメール・パスワード認証を行う。
 * 認証成功後、admin_users テーブルで管理者ロールを確認する。
 *
 * See: features/phase1/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/phase1/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 * See: docs/architecture/architecture.md §5.3 管理者認証
 *
 * @param email - 管理者メールアドレス
 * @param password - パスワード
 * @returns ログイン結果（成功時はセッショントークンとユーザーIDを含む）
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<AdminLoginResult> {
  // Supabase Auth でメール・パスワード認証を実行する
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session || !data.user) {
    return { success: false, reason: 'invalid_credentials' }
  }

  // admin_users テーブルで管理者ロールを確認する
  const adminUser = await findById(data.user.id)
  if (!adminUser) {
    // Supabase Auth には存在するが admin_users テーブルに登録されていない場合
    return { success: false, reason: 'not_admin' }
  }

  return {
    success: true,
    sessionToken: data.session.access_token,
    userId: data.user.id,
  }
}
