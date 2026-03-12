/**
 * Cucumber.js 設定ファイル
 *
 * Sprint-9 対象: 7 feature（specialist_browser_compat.feature 追加）
 * 除外対象（スコープ外）:
 *   - mypage.feature 全体
 *   - currency.feature: マイページシナリオ 1 件
 *   - specialist_browser_compat.feature: Phase 2コマンドシナリオ 1 件 + インフラ制約 2 件
 *
 * Sprint-9 からの変更点（TASK-024）:
 *   - paths に specialist_browser_compat.feature を追加
 *   - name フィルタにスコープ外シナリオ 3 件の除外を追加
 *     1. 「専ブラのコマンド文字列がゲームコマンドとして解釈される」（Phase 2依存）
 *     2. 「bbs.cgiへのPOSTがHTTPSリダイレクトでペイロードを消失しない」（インフラ制約）
 *     3. 「専ブラ特有のUser-AgentがWAFにブロックされない」（インフラ制約）
 *
 * See: tmp/tasks/task_TASK-024.md
 * See: docs/architecture/bdd_test_strategy.md §6 スコープ外シナリオの扱い方針
 */

// Cucumber 専用 tsconfig（CommonJS 互換）を ts-node に指示する
// tsconfig.json は module:esnext のため CommonJS モードで動かない
// ここで設定することで ts-node/register が適切な設定でロードされる
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, 'tsconfig.cucumber.json')

module.exports = {
  default: {
    // 対象 feature ファイルを明示列挙（mypage.feature を除外）
    // TASK-021: admin.feature を追加
    // TASK-024: specialist_browser_compat.feature を追加
    paths: [
      'features/phase1/authentication.feature',
      'features/phase1/posting.feature',
      'features/phase1/thread.feature',
      'features/phase1/currency.feature',
      'features/phase1/incentive.feature',
      'features/phase1/admin.feature',
      'features/constraints/specialist_browser_compat.feature',
    ],

    // ステップ定義と support ファイルを読み込む
    // register-mocks.js を先頭に配置して全モジュールのキャッシュを差し込む
    require: [
      'features/support/register-mocks.js',
      'features/support/world.ts',
      'features/support/mock-installer.ts',
      'features/support/hooks.ts',
      'features/step_definitions/**/*.ts',
    ],

    // TypeScript（CommonJS 互換設定）と tsconfig-paths の登録
    // TS_NODE_PROJECT 環境変数で Cucumber 専用の tsconfig を指定する
    requireModule: [
      'ts-node/register',
      'tsconfig-paths/register',
    ],

    // スコープ外シナリオを名前フィルタで除外する
    // TASK-021: 管理者シナリオ 2 件の除外を削除（admin.feature をスコープに追加したため）
    // TASK-024: Phase 2コマンドシナリオ 1 件 + インフラ制約シナリオ 2 件を除外追加
    //
    // 注意: name フィルタの複数指定は OR として扱われるため、
    //       除外パターンを1つの正規表現にまとめる必要がある
    //   除外: マイページで通貨残高を確認する（mypage.feature スコープ外）
    //   除外: コマンド文字列がゲームコマンドとして解釈される（Phase 2依存）
    //   除外: bbs.cgiへのPOSTがHTTPSリダイレクトでペイロードを消失しない（インフラ制約）
    //   除外: 専ブラ特有のUser-AgentがWAFにブロックされない（インフラ制約）
    name: [
      '^(?!.*(マイページで通貨残高を確認する|コマンド文字列がゲームコマンドとして解釈される|bbs\\.cgiへのPOSTがHTTPSリダイレクトでペイロードを消失しない|専ブラ特有のUser-AgentがWAFにブロックされない)).*$',
    ],

    format: ['@cucumber/pretty-formatter'],
  },
}
