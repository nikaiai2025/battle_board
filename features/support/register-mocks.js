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
// ダミー Supabase クライアント
// ---------------------------------------------------------------------------

const dummyClient = {
	from: (_table) => ({
		select: () => ({
			eq: () => ({ single: async () => ({ data: null, error: null }) }),
		}),
		insert: () => ({
			select: () => ({ single: async () => ({ data: null, error: null }) }),
		}),
		update: () => ({ eq: async () => ({ error: null }) }),
		delete: () => ({
			lt: () => ({ select: async () => ({ data: [], error: null }) }),
		}),
	}),
	rpc: async (_fn, _args) => ({ data: null, error: null }),
	auth: {
		getUser: async (_token) => ({ data: { user: null }, error: null }),
	},
};

const supabaseClientMock = {
	id: resolveFromRoot("src/lib/infrastructure/supabase/client.ts"),
	filename: resolveFromRoot("src/lib/infrastructure/supabase/client.ts"),
	loaded: true,
	exports: {
		supabaseClient: dummyClient,
		supabaseAdmin: dummyClient,
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
