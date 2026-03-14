/**
 * インメモリ UserRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * user-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/phase1/authentication.feature
 * See: features/phase1/posting.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { User } from '../../../src/lib/domain/models/user'

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるユーザーストア */
const store = new Map<string, User>()

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
  store.clear()
}

/**
 * テスト用ヘルパー: ユーザーを直接ストアに追加する。
 * ステップ定義から初期データを投入するために使用する。
 */
export function _insert(user: User): void {
  store.set(user.id, user)
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ユーザーを ID で取得する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function findById(id: string): Promise<User | null> {
  return store.get(id) ?? null
}

/**
 * ユーザーを auth_token（edge-token）で取得する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function findByAuthToken(authToken: string): Promise<User | null> {
  for (const user of store.values()) {
    if (user.authToken === authToken) return user
  }
  return null
}

/**
 * 新しいユーザーを作成する。
 * id・createdAt・streakDays・lastPostDate は自動設定する。
 * isVerified は省略時 false（本番 DB デフォルト値と一致）。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function create(
  user: Omit<User, 'id' | 'createdAt' | 'streakDays' | 'lastPostDate' | 'isVerified'> & { isVerified?: boolean }
): Promise<User> {
  const newUser: User = {
    ...user,
    isVerified: user.isVerified ?? false,
    id: crypto.randomUUID(),
    streakDays: 0,
    lastPostDate: null,
    createdAt: new Date(),
  }
  store.set(newUser.id, newUser)
  return newUser
}

/**
 * ユーザーの auth_token を更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function updateAuthToken(userId: string, authToken: string): Promise<void> {
  const user = store.get(userId)
  if (user) {
    store.set(userId, { ...user, authToken })
  }
}

/**
 * ユーザーのストリーク情報を更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function updateStreak(
  userId: string,
  streakDays: number,
  lastPostDate: string
): Promise<void> {
  const user = store.get(userId)
  if (user) {
    store.set(userId, { ...user, streakDays, lastPostDate })
  }
}

/**
 * ユーザーのユーザーネームを更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function updateUsername(userId: string, username: string | null): Promise<void> {
  const user = store.get(userId)
  if (user) {
    store.set(userId, { ...user, username })
  }
}

/**
 * ユーザーの有料ステータス（isPremium）を更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 * See: features/phase1/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 */
export async function updateIsPremium(userId: string, isPremium: boolean): Promise<void> {
  const user = store.get(userId)
  if (user) {
    store.set(userId, { ...user, isPremium })
  }
}

/**
 * ユーザーの認証完了状態（isVerified）を更新する。
 * AuthService.verifyAuthCode / verifyWriteToken が認証成功後に呼び出す。
 * is_verified = true への更新により、書き込み時の認証チェック（G1 是正）が機能する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateIsVerified
 * See: features/phase1/authentication.feature @認証フロー是正
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
 */
export async function updateIsVerified(userId: string, isVerified: boolean): Promise<void> {
  const user = store.get(userId)
  if (user) {
    store.set(userId, { ...user, isVerified })
  }
}
