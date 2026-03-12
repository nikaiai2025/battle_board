/**
 * Cucumber.js 設定ファイル
 *
 * Sprint-8 対象: 5 feature / 56 シナリオ
 * 除外対象（スコープ外）:
 *   - admin.feature 全体
 *   - mypage.feature 全体
 *   - authentication.feature: 管理者シナリオ 2 件
 *   - currency.feature: マイページシナリオ 1 件
 *
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §1 対象スコープと除外
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §2 cucumber.js 設定の更新方針
 * See: docs/architecture/bdd_test_strategy.md §6 スコープ外シナリオの扱い方針
 */

// Cucumber 専用 tsconfig（CommonJS 互換）を ts-node に指示する
// tsconfig.json は module:esnext のため CommonJS モードで動かない
// ここで設定することで ts-node/register が適切な設定でロードされる
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, 'tsconfig.cucumber.json')

module.exports = {
  default: {
    // 対象 feature ファイルを明示列挙（admin.feature / mypage.feature を除外）
    paths: [
      'features/phase1/authentication.feature',
      'features/phase1/posting.feature',
      'features/phase1/thread.feature',
      'features/phase1/currency.feature',
      'features/phase1/incentive.feature',
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
    // See: tmp/orchestrator/sprint_8_bdd_guide.md §1 除外対象
    name: [
      // 除外: 管理者が正しいメールアドレスとパスワードでログインする
      // 除外: 管理者が誤ったパスワードでログインすると失敗する
      // 除外: マイページで通貨残高を確認する
      '^(?!.*管理者が正しいメールアドレスとパスワードでログインする)(?!.*管理者が誤ったパスワードでログインすると失敗する)(?!.*マイページで通貨残高を確認する).*$',
    ],

    format: ['@cucumber/pretty-formatter'],
  },
}
