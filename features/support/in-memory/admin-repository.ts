/**
 * インメモリ AdminUserRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * admin-user-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/phase1/admin.feature
 * See: features/phase1/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { AdminUser, AdminLoginResult } from '../../../src/lib/infrastructure/repositories/admin-user-repository'

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる管理者ユーザーストア（id -> AdminUser） */
const store = new Map<string, AdminUser>()

/** テスト用管理者認証情報ストア（email -> { password, userId }） */
const credentialStore = new Map<string, { password: string; userId: string }>()

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
  store.clear()
  credentialStore.clear()
}

/**
 * テスト用ヘルパー: 管理者ユーザーを直接ストアに追加する。
 */
export function _insert(adminUser: AdminUser): void {
  store.set(adminUser.id, adminUser)
}

/**
 * テスト用ヘルパー: 管理者の認証情報を登録する。
 * BDD シナリオで「管理者アカウントが存在する」の Given ステップから呼び出す。
 *
 * @param email - 管理者メールアドレス
 * @param password - パスワード
 * @param userId - 対応する AdminUser の ID
 */
export function _insertCredential(email: string, password: string, userId: string): void {
  credentialStore.set(email, { password, userId })
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 管理者ユーザーを ID で取得する。
 * See: src/lib/infrastructure/repositories/admin-user-repository.ts
 */
export async function findById(id: string): Promise<AdminUser | null> {
  return store.get(id) ?? null
}

/**
 * Supabase Auth を模倣したメール・パスワード認証。
 * credentialStore で照合し、一致する場合は成功を返す。
 *
 * See: features/phase1/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/phase1/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 * See: src/lib/infrastructure/repositories/admin-user-repository.ts
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<AdminLoginResult> {
  const credential = credentialStore.get(email)

  // メールアドレスが存在しない or パスワードが一致しない場合は失敗
  if (!credential || credential.password !== password) {
    return { success: false, reason: 'invalid_credentials' }
  }

  // 管理者ロールの確認（admin_users テーブルに存在するか）
  const adminUser = store.get(credential.userId)
  if (!adminUser) {
    return { success: false, reason: 'not_admin' }
  }

  // セッショントークンはテスト用の固定文字列を生成する
  const sessionToken = `test-admin-session-${credential.userId}`

  return {
    success: true,
    sessionToken,
    userId: credential.userId,
  }
}
