/**
 * インメモリ Supabase クライアントスタブ
 *
 * BDD テスト用の Supabase 接続を持たないダミーエクスポート。
 * AuthService.verifyAdminSession が supabaseAdmin.auth.getUser を呼ぶが、
 * 管理者シナリオは Sprint-8 スコープ外のためダミー実装で十分。
 *
 * See: src/lib/infrastructure/supabase/client.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: task_TASK-016.md §補足・制約 > supabase/client: ダミーエクスポート
 */

// ---------------------------------------------------------------------------
// ダミー Supabase クライアント
// ---------------------------------------------------------------------------

/**
 * ダミー Supabase クライアントオブジェクト。
 * BDD テストで実際の Supabase API を呼び出さないためのスタブ。
 * サービス層がリポジトリ経由で間接的に使用するが、
 * モック機構によりリポジトリ自体が差し替えられるため、
 * このオブジェクトが実際に呼ばれることはない。
 */
const dummyClient = {
  from: (_table: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({ lt: () => ({ select: async () => ({ data: [], error: null }) }) }),
  }),
  rpc: async (_fn: string, _args: unknown) => ({ data: null, error: null }),
  auth: {
    getUser: async (_token: string) => ({ data: { user: null }, error: null }),
  },
}

/** anon キーを使用するクライアント（ダミー） */
export const supabaseClient = dummyClient

/** service_role キーを使用するサーバーサイド専用クライアント（ダミー） */
export const supabaseAdmin = dummyClient
