/**
 * モックインストーラー — リポジトリモジュール差し替え機構
 *
 * Node.js の require キャッシュを書き換えることで、
 * サービス層がリポジトリをインポートする際にインメモリ実装を返すようにする。
 *
 * Cucumber.js v12 は CommonJS 環境で実行されるため、
 * require.cache の書き換え（モンキーパッチ）が最も安全かつ単純な手法。
 *
 * 手順:
 *   1. resolve() で本番リポジトリの絶対パスを取得する
 *   2. require.cache[path] にインメモリ実装を差し込む
 *   3. サービス層が require() でリポジトリを読む際にキャッシュが返される
 *
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: task_TASK-016.md §補足・制約 > モック機構の実装方式
 */

// ---------------------------------------------------------------------------
// インメモリ実装のインポート
// ---------------------------------------------------------------------------

import * as InMemoryUserRepo from './in-memory/user-repository'
import * as InMemoryAuthCodeRepo from './in-memory/auth-code-repository'
import * as InMemoryPostRepo from './in-memory/post-repository'
import * as InMemoryThreadRepo from './in-memory/thread-repository'
import * as InMemoryCurrencyRepo from './in-memory/currency-repository'
import * as InMemoryIncentiveLogRepo from './in-memory/incentive-log-repository'
import * as InMemoryTurnstileClient from './in-memory/turnstile-client'
import * as InMemorySupabaseClient from './in-memory/supabase-client'

// ---------------------------------------------------------------------------
// インストール関数
// ---------------------------------------------------------------------------

/**
 * require キャッシュにインメモリ実装を差し込む。
 *
 * 注: キャッシュ差し込みは register-mocks.js が require リスト先頭で
 * 既に実行済みのため、この関数は互換性のために残されている（no-op）。
 *
 * See: features/support/register-mocks.js
 * See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル
 */
export function installMocks(): void {
  // register-mocks.js で差し込み済み — 二重差し込みを避けるため no-op
}

// ---------------------------------------------------------------------------
// リセット関数（Beforeフックから呼び出す）
// ---------------------------------------------------------------------------

/**
 * 全インメモリストアをクリアする。
 * 各シナリオの Before フックから呼び出すことでシナリオ間独立性を保証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル
 */
export function resetAllStores(): void {
  InMemoryUserRepo.reset()
  InMemoryAuthCodeRepo.reset()
  InMemoryPostRepo.reset()
  InMemoryThreadRepo.reset()
  InMemoryCurrencyRepo.reset()
  InMemoryIncentiveLogRepo.reset()
  InMemoryTurnstileClient.reset()
}

// ---------------------------------------------------------------------------
// インメモリ実装への直接アクセス（ステップ定義用）
// ---------------------------------------------------------------------------

export {
  InMemoryUserRepo,
  InMemoryAuthCodeRepo,
  InMemoryPostRepo,
  InMemoryThreadRepo,
  InMemoryCurrencyRepo,
  InMemoryIncentiveLogRepo,
  InMemoryTurnstileClient,
  InMemorySupabaseClient,
}
