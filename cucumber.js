/**
 * Cucumber.js 設定ファイル
 *
 * プロファイル:
 *   - default: InMemoryリポジトリを使用した高速BDDテスト（開発中の主力）
 *   - integration: Supabase Local実DBを使用した統合テスト（TASK-031で追加）
 *
 * Sprint-10 対象: 8 feature（mypage.feature 追加）
 * 除外対象（スコープ外）:
 *   - specialist_browser_compat.feature: Phase 2コマンドシナリオ 1 件
 *   ※ インフラ制約シナリオ（HTTP:80/WAF）は Sprint-21 TASK-060 でPendingステップとして追加済み
 *
 * Sprint-10 からの変更点（TASK-026）:
 *   - paths に mypage.feature を追加
 *   - name フィルタから「マイページで通貨残高を確認する」の除外を削除
 *
 * TASK-031 からの変更点:
 *   - integration プロファイルを追加
 *
 * See: tmp/tasks/task_TASK-026.md
 * See: tmp/tasks/task_TASK-031.md
 * See: docs/architecture/bdd_test_strategy.md §6 スコープ外シナリオの扱い方針
 * See: docs/architecture/bdd_test_strategy.md §8 統合テスト方針
 */

// Cucumber 専用 tsconfig（CommonJS 互換）を ts-node に指示する
// tsconfig.json は module:esnext のため CommonJS モードで動かない
// ここで設定することで ts-node/register が適切な設定でロードされる
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, 'tsconfig.cucumber.json')

module.exports = {
  // ---------------------------------------------------------------------------
  // defaultプロファイル — InMemoryリポジトリを使用した高速BDDテスト
  // 実行コマンド: npx cucumber-js
  // See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
  // ---------------------------------------------------------------------------
  default: {
    // 対象 feature ファイルを明示列挙
    // TASK-021: admin.feature を追加
    // TASK-024: specialist_browser_compat.feature を追加
    // TASK-026: mypage.feature を追加
    paths: [
      'features/phase1/authentication.feature',
      'features/phase1/posting.feature',
      'features/phase1/thread.feature',
      'features/phase1/currency.feature',
      'features/phase1/incentive.feature',
      'features/phase1/admin.feature',
      'features/constraints/specialist_browser_compat.feature',
      'features/phase1/mypage.feature',
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
    // TASK-026: 「マイページで通貨残高を確認する」の除外を削除（mypage.feature をスコープに追加したため）
    //
    // 注意: name フィルタの複数指定は OR として扱われるため、
    //       除外パターンを1つの正規表現にまとめる必要がある
    //   除外: コマンド文字列がゲームコマンドとして解釈される（Phase 2依存）
    //
    // インフラ制約シナリオ（HTTP:80/WAF）はPendingステップとして実行する（nameフィルタ除外しない）:
    //   - 専ブラの5chプロトコル通信がHTTP:80で直接応答される
    //   - bbs.cgiへのHTTP:80 POSTが直接処理される
    //   - 専ブラ特有のUser-AgentがWAFにブロックされない
    //   → ステップ定義で `return 'pending'` として実装済み（Sprint-21 TASK-060）
    name: [
      '^(?!.*(コマンド文字列がゲームコマンドとして解釈される)).*$',
    ],

    format: ['@cucumber/pretty-formatter'],
  },

  // ---------------------------------------------------------------------------
  // integrationプロファイル — Supabase Local実DBを使用した統合テスト
  // 実行コマンド: npx cucumber-js --profile integration
  // 前提: Supabase Local が起動済みであること（npx supabase start）
  //
  // 選定方針:
  //   InMemory直接操作（_insert, _upsert等）を使うステップ定義を含むシナリオは除外する。
  //   方針(C)を採用: InMemory直接操作シナリオを除外し、サービス層経由のシナリオのみ実行。
  //   除外の基準はステップ定義の調査結果に基づく（task_TASK-031.md 作業ログ参照）。
  //
  // 除外対象のシナリオパターン:
  //   InMemory直接操作(_insert/_upsert/_insertCredential)を前提とするシナリオ:
  //   - スレッド一覧関連（InMemoryThreadRepo.create等を使うGivenステップが必要）
  //   - incentive系（InMemoryPostRepo._insert等を多用）
  //   - currency系（InMemoryCurrencyRepo._upsertを使う残高設定ステップ）
  //   - admin系（InMemoryAdminRepo._insert/_insertCredentialを使う）
  //   - 認証コード直接挿入シナリオ（InMemoryAuthCodeRepo._insertを使う）
  //   - 有料ユーザー書き込み（InMemoryUserRepo._insertを使う）
  //   - 専ブラ互換（InMemoryPostRepo._insertを多用）
  //   - マイページ書き込み履歴（InMemoryPostRepo.findByIdを使う）
  //
  // 統合テストで実行するシナリオ（サービス層経由のみ）:
  //   - thread.feature: スレッド作成・バリデーション系（InMemory直接操作なし）
  //   - authentication.feature: 未認証ユーザーの書き込みフロー
  //
  // 注意: ステップ定義はdefaultプロファイルと共有。
  //       mock-installer.ts のインポートは残るが、register-real-repos.js では
  //       モック差し替えを行わないため、実リポジトリが使われる。
  //       ただしステップ定義内で InMemoryXxxRepo.XXXX() を呼ぶ箇所は
  //       実リポジトリAPIと異なる可能性があり、除外対象に含める。
  //
  // See: docs/architecture/bdd_test_strategy.md §8 統合テスト方針
  // See: features/support/register-real-repos.js
  // See: features/support/integration-hooks.ts
  // ---------------------------------------------------------------------------
  integration: {
    // 統合テスト対象 feature ファイル
    // InMemory直接操作が不要なシナリオを含む feature に限定する
    paths: [
      'features/phase1/thread.feature',
      'features/phase1/authentication.feature',
    ],

    // ステップ定義と support ファイルを読み込む
    // register-real-repos.js を先頭に配置する（register-mocks.js の代わり）
    // integration-hooks.ts でDBクリーンアップを行う（hooks.ts の代わり）
    require: [
      'features/support/register-real-repos.js',
      'features/support/world.ts',
      'features/support/mock-installer.ts',
      'features/support/integration-hooks.ts',
      'features/step_definitions/**/*.ts',
    ],

    // TypeScript（CommonJS 互換設定）と tsconfig-paths の登録
    requireModule: [
      'ts-node/register',
      'tsconfig-paths/register',
    ],

    // 統合テストで実行するシナリオを名前フィルタで絞り込む
    // InMemory直接操作を含むシナリオ（下記リスト）を除外する。
    //
    // 除外するシナリオ（InMemory直接操作を使うため）:
    //   スレッド一覧系:
    //     - スレッド一覧にスレッドの基本情報が表示される（InMemoryThreadRepo.create）
    //     - スレッド一覧は最終書き込み日時の新しい順に表示される（InMemoryThreadRepo.create）
    //     - スレッド一覧には最新50件のみ表示される（InMemoryThreadRepo.create x51）
    //     - 一覧外のスレッドに書き込むと一覧に復活する（InMemoryThreadRepo.create x51）
    //     - 一覧外のスレッドにURLで直接アクセスできる（InMemoryThreadRepo.create x51）
    //     - スレッドのレスが書き込み順に表示される（InMemoryThreadRepo.create）
    //     - レス内のアンカーで他のレスを参照できる（InMemoryThreadRepo.create）
    //   スレッド作成Thenステップ系:
    //     - ログイン済みユーザーがスレッドを作成する（InMemoryPostRepo.findByThreadId）
    //   認証系（InMemory直接操作あり）:
    //     - 正しい認証コードとTurnstileで認証に成功する（InMemoryAuthCodeRepo._insert）
    //     - Turnstile検証に失敗すると認証に失敗する（InMemoryAuthCodeRepo._insert, setStubResult）
    //     - 期限切れ認証コードでは認証できない（InMemoryAuthCodeRepo._insert）
    //     - 日次リセットID関連シナリオ（InMemoryThreadRepo.create）
    //     - 管理者ログイン系（InMemoryAdminRepo._insert/_insertCredential）
    //
    // 統合テストで実行するシナリオ（InMemory直接操作なし）:
    //   - 未認証ユーザーが書き込みを行うと認証コードが案内される
    //   - スレッドタイトルが空の場合はスレッドが作成されない
    //   - スレッドタイトルが上限文字数を超えている場合はエラーになる
    //   - スレッドが0件の場合はメッセージが表示される
    name: [
      '^(未認証ユーザーが書き込みを行うと認証コードが案内される|スレッドタイトルが空の場合はスレッドが作成されない|スレッドタイトルが上限文字数を超えている場合はエラーになる|スレッドが0件の場合はメッセージが表示される)$',
    ],

    format: ['@cucumber/pretty-formatter'],
  },
}
