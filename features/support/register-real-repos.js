/**
 * 統合テスト用リポジトリ登録スクリプト（CommonJS）
 *
 * integrationプロファイル専用。register-mocks.js の代わりに使用する。
 * モックの差し替えを一切行わず、実 Supabase クライアントとリポジトリ実装を
 * そのまま使用する。
 *
 * 前提条件:
 *   - Supabase Local が起動済みであること（npx supabase start）
 *   - マイグレーションが適用済みであること
 *   - .env.local に SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY が設定済みであること
 *
 * See: features/support/register-mocks.js（defaultプロファイル用、こちらは統合テスト用）
 * See: docs/architecture/bdd_test_strategy.md §8 統合テスト方針
 * See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
 */

const path = require('path')

// ---------------------------------------------------------------------------
// 環境変数の読み込み
// ---------------------------------------------------------------------------
// Next.js は .env.local を自動ロードするが、Cucumber.js（Node.js直接起動）は
// 自動ロードしないため、dotenv で明示的にロードする。
// dotenv は devDependencies に含まれている。
// See: package.json > devDependencies > dotenv
try {
  const dotenv = require('dotenv')
  const envPath = path.resolve(__dirname, '../../.env.local')
  const result = dotenv.config({ path: envPath })
  if (result.error) {
    console.warn(`[register-real-repos] .env.local の読み込みに失敗しました: ${result.error.message}`)
    console.warn('[register-real-repos] 環境変数が既に設定されている場合は問題ありません')
  } else {
    console.log('[register-real-repos] .env.local を読み込みました')
  }
} catch (e) {
  console.warn('[register-real-repos] dotenv が利用できません。環境変数を直接設定してください:', e.message)
}

// ---------------------------------------------------------------------------
// Turnstile バイパス設定
// ---------------------------------------------------------------------------
// 統合テスト用: Turnstile をバイパスするため TURNSTILE_SECRET_KEY を未設定にする
// turnstile-client.ts は TURNSTILE_SECRET_KEY 未設定時に常に true を返す
// See: src/lib/infrastructure/external/turnstile-client.ts
// See: docs/architecture/bdd_test_strategy.md §11.1 Cloudflare Turnstile
delete process.env.TURNSTILE_SECRET_KEY

console.log('[register-real-repos] 実 Supabase クライアント + リポジトリを使用します（モックなし）')
console.log(`[register-real-repos] SUPABASE_URL: ${process.env.SUPABASE_URL ?? '(未設定)'}`)
console.log('[register-real-repos] TURNSTILE_SECRET_KEY: 未設定（バイパス有効）')
