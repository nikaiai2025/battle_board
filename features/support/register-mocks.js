/**
 * モック事前登録スクリプト（CommonJS）
 *
 * Cucumber.js の require リストの先頭に配置して実行される。
 * ts-node が TypeScript ファイルを require する前に
 * require キャッシュにインメモリ実装の参照を登録する。
 *
 * これにより supabase/client.ts の createClient 呼び出しを
 * ダミー実装で差し替え、"supabaseUrl is required" エラーを防ぐ。
 *
 * また、Cucumber 専用 tsconfig（CommonJS 互換）を TS_NODE_PROJECT で
 * 指定することで、ts-node が Next.js 用の ESM 設定を使わないようにする。
 *
 * See: features/support/mock-installer.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../../");

function resolveFromRoot(relativePath) {
	return path.resolve(PROJECT_ROOT, relativePath);
}

// ---------------------------------------------------------------------------
// インメモリ Supabase クライアント（supabase-client.ts から動的ロード）
// ---------------------------------------------------------------------------
// TASK-097: Phase 3 対応として、signUp / signInWithPassword 等の auth メソッドを
// 持つインメモリ実装を使用する。
// register-mocks.js はインタープリタ実行のため、TypeScript ファイルを直接 require する
// には ts-node が必要。ここでは inline でコンパイル済みの CommonJS 互換モジュールを
// 使うか、あるいはインメモリ実装を直接インライン定義する。
//
// See: features/support/in-memory/supabase-client.ts
// See: features/user_registration.feature

// インメモリ Supabase Auth ストア（email → { id, email, password }）
const supabaseAuthStore = new Map();

// signUp の結果スタブ: null=デフォルト成功、'email_taken'=重複エラー
let signUpStubMode = null;

/**
 * テスト用ヘルパー: Supabase Auth にユーザーを登録する。
 * resetAllStores() で supabaseAuthStore もクリアされる必要があるため、
 * この関数は in-memory/supabase-client.ts のインスタンスと共有する。
 *
 * See: features/support/in-memory/supabase-client.ts
 */
function resetSupabaseAuthStore() {
	supabaseAuthStore.clear();
	signUpStubMode = null;
}

// in-memory/supabase-client.ts の exports に reset/helper 関数を注入するため、
// ここでは同じストアを持つ dummyClient を構築し、
// in-memory/supabase-client.ts と同一エクスポートを提供するモックを作成する。
// NOTE: in-memory/supabase-client.ts はここより後でロードされるため、
//       require.cache 差し込み後に supabaseAuthStore を共有できない。
//       代わりに in-memory/supabase-client.ts 側の関数を後から呼ぶ設計とする。
//
// 実際の実装方針:
//   register-mocks.js の dummyClient に完全な auth メソッドを追加する。
//   in-memory/supabase-client.ts は mock-installer.ts から resetAllStores() で
//   呼ばれるが、ストアは register-mocks.js のものと独立している。
//   reset() は両方から呼ばれるため、BDDシナリオ間ではストアがリセットされる。
//   ただし register-mocks.js と in-memory/supabase-client.ts は別インスタンスで
//   ストアが分離している問題がある。
//
// 解決策: in-memory/supabase-client.ts を require して共有する。
// ts-node/register が cucumber.js の requireModule で読み込まれるが、
// register-mocks.js はその前に実行される。ただし ts-node は
// register-mocks.js の require チェーン経由でも TS ファイルを解釈できる。
// tsconfig.cucumber.json が TS_NODE_PROJECT で指定済みのため有効。
//
// より安全な方法: dummyClient を inline で完全実装し、
// in-memory/supabase-client.ts にはストア状態の注入口を設ける。

const inMemorySupabaseClient = require(
	path.resolve(__dirname, "./in-memory/supabase-client.ts"),
);

const supabaseClientMock = {
	id: resolveFromRoot("src/lib/infrastructure/supabase/client.ts"),
	filename: resolveFromRoot("src/lib/infrastructure/supabase/client.ts"),
	loaded: true,
	exports: {
		supabaseClient: inMemorySupabaseClient.supabaseClient,
		supabaseAdmin: inMemorySupabaseClient.supabaseAdmin,
	},
	parent: null,
	children: [],
	paths: [],
};

// supabase/client.ts をキャッシュに差し込む（.ts 拡張子で登録）
require.cache[resolveFromRoot("src/lib/infrastructure/supabase/client.ts")] =
	supabaseClientMock;

// ---------------------------------------------------------------------------
// 全リポジトリ + 外部依存のキャッシュ事前差し込み
// ---------------------------------------------------------------------------
// TypeScript の静的 import はモジュール評価時に解決されるため、
// BeforeAll フックでの差し替えではタイミングが遅い。
// require リスト先頭のこのスクリプトで、サービス層がロードされる前に
// キャッシュを埋めることで、import 解決時にインメモリ実装を参照させる。

const REPO_MOCKS = [
	[
		"src/lib/infrastructure/repositories/user-repository.ts",
		"./in-memory/user-repository.ts",
	],
	[
		"src/lib/infrastructure/repositories/auth-code-repository.ts",
		"./in-memory/auth-code-repository.ts",
	],
	[
		"src/lib/infrastructure/repositories/post-repository.ts",
		"./in-memory/post-repository.ts",
	],
	[
		"src/lib/infrastructure/repositories/thread-repository.ts",
		"./in-memory/thread-repository.ts",
	],
	[
		"src/lib/infrastructure/repositories/currency-repository.ts",
		"./in-memory/currency-repository.ts",
	],
	[
		"src/lib/infrastructure/repositories/incentive-log-repository.ts",
		"./in-memory/incentive-log-repository.ts",
	],
	[
		"src/lib/infrastructure/external/turnstile-client.ts",
		"./in-memory/turnstile-client.ts",
	],
	// 管理者リポジトリ（TASK-021 で追加）
	// See: features/admin.feature
	// See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
	[
		"src/lib/infrastructure/repositories/admin-user-repository.ts",
		"./in-memory/admin-repository.ts",
	],
	// AI告発・ボット書き込みリポジトリ（TASK-079 で追加）
	// See: features/ai_accusation.feature
	[
		"src/lib/infrastructure/repositories/accusation-repository.ts",
		"./in-memory/accusation-repository.ts",
	],
	[
		"src/lib/infrastructure/repositories/bot-post-repository.ts",
		"./in-memory/bot-post-repository.ts",
	],
	// Edge-token リポジトリ（TASK-085 で追加）
	// See: features/authentication.feature
	[
		"src/lib/infrastructure/repositories/edge-token-repository.ts",
		"./in-memory/edge-token-repository.ts",
	],
	// ボットリポジトリ（TASK-096 で追加）
	// See: features/bot_system.feature
	[
		"src/lib/infrastructure/repositories/bot-repository.ts",
		"./in-memory/bot-repository.ts",
	],
	// 攻撃リポジトリ（TASK-096 で追加）
	// See: features/bot_system.feature
	[
		"src/lib/infrastructure/repositories/attack-repository.ts",
		"./in-memory/attack-repository.ts",
	],
	// IP BAN リポジトリ（TASK-105 で追加）
	// See: features/admin.feature @IP BAN シナリオ群
	[
		"src/lib/infrastructure/repositories/ip-ban-repository.ts",
		"./in-memory/ip-ban-repository.ts",
	],
	// 日次統計リポジトリ（TASK-107 で追加）
	// See: features/admin.feature @ダッシュボードシナリオ群
	[
		"src/lib/infrastructure/repositories/daily-stats-repository.ts",
		"./in-memory/daily-stats-repository.ts",
	],
	// pending-tutorial リポジトリ（TASK-248 で追加）
	// See: features/welcome.feature
	[
		"src/lib/infrastructure/repositories/pending-tutorial-repository.ts",
		"./in-memory/pending-tutorial-repository.ts",
	],
	// pending-async-command リポジトリ（TASK-270 で追加）
	// See: features/command_aori.feature
	[
		"src/lib/infrastructure/repositories/pending-async-command-repository.ts",
		"./in-memory/pending-async-command-repository.ts",
	],
];

for (const [srcRelPath, mockRelPath] of REPO_MOCKS) {
	const srcPath = resolveFromRoot(srcRelPath);
	const mock = require(path.resolve(__dirname, mockRelPath));
	require.cache[srcPath] = {
		id: srcPath,
		filename: srcPath,
		loaded: true,
		exports: mock,
		parent: null,
		children: [],
		paths: [],
	};
}

console.log(
	"[register-mocks] Supabase クライアント + 全リポジトリのモック差し替えが完了しました",
);
