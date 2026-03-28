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

// AI告発リポジトリ（TASK-079 で追加）
// See: features/ai_accusation.feature
import * as InMemoryAccusationRepo from "./in-memory/accusation-repository";
// 管理者リポジトリ（TASK-021 で追加）
// See: features/admin.feature
// See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
import * as InMemoryAdminRepo from "./in-memory/admin-repository";
// 攻撃リポジトリ（TASK-096 で追加）
// See: features/bot_system.feature
import * as InMemoryAttackRepo from "./in-memory/attack-repository";
import * as InMemoryAuthCodeRepo from "./in-memory/auth-code-repository";
// ボット書き込みリポジトリ（TASK-079 で追加）
// See: features/ai_accusation.feature
import * as InMemoryBotPostRepo from "./in-memory/bot-post-repository";
// ボットリポジトリ（TASK-096 で追加）
// See: features/bot_system.feature
import * as InMemoryBotRepo from "./in-memory/bot-repository";
// copipe リポジトリ（TASK-328 で追加）
// See: features/command_copipe.feature
import * as InMemoryCopipeRepo from "./in-memory/copipe-repository";
import * as InMemoryCurrencyRepo from "./in-memory/currency-repository";
// daily-event リポジトリ（TASK-278 で追加）
// See: features/command_livingbot.feature
import * as InMemoryDailyEventRepo from "./in-memory/daily-event-repository";
// 日次統計リポジトリ（TASK-107 で追加）
// See: features/admin.feature @ダッシュボードシナリオ群
import * as InMemoryDailyStatsRepo from "./in-memory/daily-stats-repository";
// Edge-token リポジトリ（TASK-085 で追加）
// See: features/authentication.feature
import * as InMemoryEdgeTokenRepo from "./in-memory/edge-token-repository";
import * as InMemoryIncentiveLogRepo from "./in-memory/incentive-log-repository";
// IP BAN リポジトリ（TASK-105 で追加）
// See: features/admin.feature @IP BAN シナリオ群
import * as InMemoryIpBanRepo from "./in-memory/ip-ban-repository";
// pending-async-command リポジトリ（TASK-270 で追加）
// See: features/command_aori.feature
import * as InMemoryPendingAsyncCommandRepo from "./in-memory/pending-async-command-repository";
// pending-tutorial リポジトリ（TASK-248 で追加）
// See: features/welcome.feature
import * as InMemoryPendingTutorialRepo from "./in-memory/pending-tutorial-repository";
import * as InMemoryPostRepo from "./in-memory/post-repository";
import * as InMemorySupabaseClient from "./in-memory/supabase-client";
import * as InMemoryThreadRepo from "./in-memory/thread-repository";
import * as InMemoryTurnstileClient from "./in-memory/turnstile-client";
// user-copipe リポジトリ（TASK-357 で追加）
// See: features/user_copipe.feature
import * as InMemoryUserCopipeRepo from "./in-memory/user-copipe-repository";
import * as InMemoryUserRepo from "./in-memory/user-repository";

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
	InMemoryUserRepo.reset();
	InMemoryAuthCodeRepo.reset();
	InMemoryPostRepo.reset();
	InMemoryThreadRepo.reset();
	InMemoryCurrencyRepo.reset();
	InMemoryIncentiveLogRepo.reset();
	InMemoryTurnstileClient.reset();
	// 管理者リポジトリのリセット（TASK-021 で追加）
	// See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル
	InMemoryAdminRepo.reset();
	// Edge-token リポジトリのリセット（TASK-085 で追加）
	// See: features/authentication.feature
	InMemoryEdgeTokenRepo.reset();
	// AI告発リポジトリのリセット（TASK-079 で追加）
	// See: features/ai_accusation.feature
	InMemoryAccusationRepo.reset();
	InMemoryBotPostRepo.reset();
	// ボット・攻撃リポジトリのリセット（TASK-096 で追加）
	// See: features/bot_system.feature
	InMemoryBotRepo.reset();
	InMemoryAttackRepo.reset();
	// Supabase Auth ストアのリセット（TASK-097 で追加）
	// See: features/user_registration.feature
	InMemorySupabaseClient.reset();
	// IP BAN リポジトリのリセット（TASK-105 で追加）
	// See: features/admin.feature @IP BAN シナリオ群
	InMemoryIpBanRepo.reset();
	// 日次統計リポジトリのリセット（TASK-107 で追加）
	// See: features/admin.feature @ダッシュボードシナリオ群
	InMemoryDailyStatsRepo.reset();
	// pending-tutorial リポジトリのリセット（TASK-248 で追加）
	// See: features/welcome.feature
	InMemoryPendingTutorialRepo.reset();
	// pending-async-command リポジトリのリセット（TASK-270 で追加）
	// See: features/command_aori.feature
	InMemoryPendingAsyncCommandRepo.reset();
	// daily-event リポジトリのリセット（TASK-278 で追加）
	// See: features/command_livingbot.feature
	InMemoryDailyEventRepo.reset();
	// copipe リポジトリのリセット（TASK-328 で追加）
	// See: features/command_copipe.feature
	InMemoryCopipeRepo.reset();
	// user-copipe リポジトリのリセット（TASK-357 で追加）
	// See: features/user_copipe.feature
	InMemoryUserCopipeRepo.reset();
}

// ---------------------------------------------------------------------------
// インメモリ実装への直接アクセス（ステップ定義用）
// ---------------------------------------------------------------------------

export {
	// AI告発・ボット書き込みリポジトリ（TASK-079 で追加）
	InMemoryAccusationRepo,
	// 管理者リポジトリ（TASK-021 で追加）
	InMemoryAdminRepo,
	// 攻撃リポジトリ（TASK-096 で追加）
	InMemoryAttackRepo,
	InMemoryAuthCodeRepo,
	InMemoryBotPostRepo,
	// ボットリポジトリ（TASK-096 で追加）
	InMemoryBotRepo,
	// copipe リポジトリ（TASK-328 で追加）
	InMemoryCopipeRepo,
	InMemoryCurrencyRepo,
	// daily-event リポジトリ（TASK-278 で追加）
	InMemoryDailyEventRepo,
	// 日次統計リポジトリ（TASK-107 で追加）
	InMemoryDailyStatsRepo,
	// Edge-token リポジトリ（TASK-085 で追加）
	InMemoryEdgeTokenRepo,
	InMemoryIncentiveLogRepo,
	// IP BAN リポジトリ（TASK-105 で追加）
	InMemoryIpBanRepo,
	// pending-async-command リポジトリ（TASK-270 で追加）
	InMemoryPendingAsyncCommandRepo,
	// pending-tutorial リポジトリ（TASK-248 で追加）
	InMemoryPendingTutorialRepo,
	InMemoryPostRepo,
	InMemorySupabaseClient,
	InMemoryThreadRepo,
	InMemoryTurnstileClient,
	// user-copipe リポジトリ（TASK-357 で追加）
	// See: features/user_copipe.feature
	InMemoryUserCopipeRepo,
	InMemoryUserRepo,
};
