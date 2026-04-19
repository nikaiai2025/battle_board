/**
 * 統合テスト用 Cucumber フック
 *
 * integrationプロファイル専用。hooks.ts（defaultプロファイル用）の代替として使用。
 * 各シナリオ前に Supabase Local の全テーブルをTRUNCATEし、シナリオ間の独立性を保証する。
 *
 * TRUNCATEの順序は外部キー制約の依存関係に従う（子テーブル → 親テーブルの順）:
 *   1. bot_posts       — posts, bots に依存
 *   2. accusations     — users, posts, threads に依存
 *   3. incentive_logs  — users に依存
 *   4. auth_codes      — 依存なし（独立テーブル）
 *   5. admin_users     — 依存なし（独立テーブル）
 *   6. posts           — threads, users に依存
 *   7. currencies      — users に依存
 *   8. bots            — users に依存
 *   9. threads         — users に依存
 *  10. users           — 依存なし（ルートテーブル）
 *
 * CASCADE オプションを使えば順序は不要だが、意図しないデータ削除を防ぐため
 * 明示的な順序を指定する。
 *
 * See: features/support/hooks.ts（defaultプロファイル用フック）
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 * See: supabase/migrations/00001_create_tables.sql
 */

import { Before, After, BeforeAll } from '@cucumber/cucumber'
import { createClient } from '@supabase/supabase-js'
import type { BattleBoardWorld } from './world'

// ---------------------------------------------------------------------------
// Supabase Admin クライアント（テスト用）
// RLS をバイパスするため service_role キーを使用する
// ---------------------------------------------------------------------------

/**
 * 統合テスト専用の Supabase Admin クライアントを生成する。
 * テーブルの TRUNCATE には RLS バイパスが必要なため service_role キーを使用する。
 */
function createTestAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[integration-hooks] SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です。' +
        '.env.local を確認してください。'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

// ---------------------------------------------------------------------------
// BeforeAll: 接続確認
// ---------------------------------------------------------------------------

/**
 * テストスイート開始時に Supabase Local への接続を確認する。
 * 接続に失敗した場合は早期にエラーを報告する。
 *
 * See: docs/architecture/bdd_test_strategy.md §8.3 前提条件
 */
BeforeAll(async function () {
  console.log('[integration-hooks] 統合テストモード: Supabase Local に接続します')
  const client = createTestAdminClient()

  // usersテーブルへのクエリで接続確認（軽量）
  const { error } = await client.from('users').select('id').limit(1)
  if (error) {
    throw new Error(
      `[integration-hooks] Supabase Local への接続確認に失敗しました: ${error.message}\n` +
        'npx supabase start でローカルサーバーを起動してください。'
    )
  }
  console.log('[integration-hooks] Supabase Local への接続確認 OK')
})

// ---------------------------------------------------------------------------
// Before: シナリオ開始前のDBクリーンアップ
// ---------------------------------------------------------------------------

/**
 * 各シナリオ開始前に全テーブルをTRUNCATEしてDBを初期化する。
 * World 状態もリセットしてシナリオ間の独立性を保証する。
 *
 * TRUNCATE順序は外部キー制約の依存関係に従う（子 → 親）。
 * RESTART IDENTITY: シーケンスをリセット（UUID使用のため効果なしだが念のため）
 * CASCADE: 参照先の行も合わせて削除（二重保険）
 *
 * See: docs/architecture/bdd_test_strategy.md §8.4 データライフサイクル
 * See: supabase/migrations/00001_create_tables.sql（テーブル定義・依存関係）
 */
Before(async function (this: BattleBoardWorld) {
  const client = createTestAdminClient()

  // RPC 依存はやめ、毎回明示順序で全件削除する。
  // 現在のローカル DB には truncate_all_test_tables RPC が存在しないため、
  // 条件分岐は cleanup 漏れの温床になる。
  await truncateTablesSequentially(client)

  // World 状態をリセットする
  this.reset()
})

/**
 * 外部キー制約の依存順序に従ってテーブルを個別にTRUNCATEする。
 * truncate_all_test_tables RPCが存在しない場合のフォールバック。
 *
 * 削除順序（子テーブルから親テーブルの順）:
 *   1. bot_posts, accusations, incentive_logs, auth_codes, admin_users（末端テーブル）
 *   2. posts, currencies, bots（中間テーブル）
 *   3. threads（中間テーブル）
 *   4. users（ルートテーブル）
 */
async function truncateTablesSequentially(
  client: ReturnType<typeof createClient>
): Promise<void> {
  const allUuid = '00000000-0000-0000-0000-000000000000'

  const deletePlan: Array<{
    table: string
    mode: 'uuid' | 'serial'
    column: string
  }> = [
    { table: 'bot_posts', mode: 'uuid', column: 'post_id' },
    { table: 'attacks', mode: 'uuid', column: 'id' },
    { table: 'grass_reactions', mode: 'uuid', column: 'id' },
    { table: 'accusations', mode: 'uuid', column: 'id' },
    { table: 'pending_tutorials', mode: 'uuid', column: 'id' },
    { table: 'pending_async_commands', mode: 'uuid', column: 'id' },
    { table: 'incentive_logs', mode: 'uuid', column: 'id' },
    { table: 'auth_codes', mode: 'uuid', column: 'id' },
    { table: 'admin_users', mode: 'uuid', column: 'id' },
    { table: 'user_copipe_entries', mode: 'serial', column: 'id' },
    { table: 'user_bot_vocabularies', mode: 'serial', column: 'id' },
    { table: 'edge_tokens', mode: 'uuid', column: 'id' },
    { table: 'posts', mode: 'uuid', column: 'id' },
    { table: 'currencies', mode: 'uuid', column: 'user_id' },
    { table: 'bots', mode: 'uuid', column: 'id' },
    { table: 'threads', mode: 'uuid', column: 'id' },
    { table: 'users', mode: 'uuid', column: 'id' },
  ]

  for (const step of deletePlan) {
    const query = client.from(step.table).delete()
    const result =
      step.mode === 'uuid'
        ? await query.neq(step.column, allUuid)
        : await query.gte(step.column, 0)

    if (result.error && result.error.code !== 'PGRST116') {
      throw new Error(
        `[integration-hooks] ${step.table} のクリーンアップに失敗しました: ${result.error.message}`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// After: シナリオ終了後のクリーンアップ
// ---------------------------------------------------------------------------

/**
 * 各シナリオ終了後に時刻スタブを復元する。
 * 統合テストでも World の時刻制御を使用する可能性があるため実装する。
 *
 * See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
 */
After(function (this: BattleBoardWorld) {
  this.restoreDateNow()
})
