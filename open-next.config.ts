// open-next.config.ts — @opennextjs/cloudflare 設定
// See: tmp/workers/bdd-architect_TASK-036/migration_guide.md §1.2
//
// シンプル構成: R2 インクリメンタルキャッシュは使用しない
// （このプロジェクトでは全ルートが force-dynamic のため静的キャッシュ不要）
//
// buildCommand: Next.js 16.x はデフォルトで Turbopack を使用するが、
// @opennextjs/cloudflare 1.17.1 は Turbopack のチャンクロードランタイムを
// 正しくバンドルできない（requireChunk がスタブのまま残る）。
// Webpack ビルドを使用することでこの問題を回避する。
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({});

// Webpack ビルドを強制（Turbopack 非互換問題の回避）
config.buildCommand = "npx next build --webpack";

export default config;
