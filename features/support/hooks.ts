/**
 * Cucumber フック
 *
 * BeforeAll: モジュール差し替えをインストールする
 * Before: インメモリストアをクリアし World 状態をリセットする
 * After: 時刻スタブを復元する
 *
 * See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル
 */

import { After, Before, BeforeAll } from "@cucumber/cucumber";
import { accusationState } from "../step_definitions/ai_accusation.steps";
import * as InMemoryCollectedTopicRepo from "./in-memory/collected-topic-repository";
import { installMocks, resetAllStores } from "./mock-installer";
import type { BattleBoardWorld } from "./world";

// ---------------------------------------------------------------------------
// BeforeAll: モック機構のインストール（テストスイート全体で1回）
// ---------------------------------------------------------------------------

/**
 * テストスイート開始時に require キャッシュにインメモリ実装を差し込む。
 * この後にサービス層がリポジトリを require すると、インメモリ実装が返される。
 *
 * See: features/support/mock-installer.ts
 * See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル > BeforeAll
 */
BeforeAll(() => {
	installMocks();
});

// ---------------------------------------------------------------------------
// Before: シナリオ開始前のリセット（各シナリオで実行）
// ---------------------------------------------------------------------------

/**
 * 各シナリオ開始前に全インメモリストアをクリアし、World 状態をリセットする。
 * これによりシナリオ間の独立性が保証される。
 *
 * See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル > Before
 */
Before(async function (this: BattleBoardWorld, scenario: any) {
	// インメモリストアを全てクリアする
	resetAllStores();

	// InMemoryCollectedTopicRepo のリセット（TASK-353 で追加）
	// resetAllStores() には含まれていないため、ここで明示的にリセットする。
	// See: features/curation_bot.feature
	InMemoryCollectedTopicRepo.reset();

	// AI告発シナリオの共有状態をリセットする（TASK-079 で追加）
	// See: features/ai_accusation.feature
	// ai_accusation.feature のシナリオは accusationState.active = true にする。
	// これにより "{string} を実行する" When ステップで !tell コマンドの
	// ルーティングを AccusationService 直接呼び出しに切り替える。
	const isAccusationScenario =
		scenario?.gherkinDocument?.uri?.includes("ai_accusation") ?? false;
	accusationState.active = isAccusationScenario;
	accusationState.postNumberToId.clear();
	accusationState.lastAccusationResult = null;
	accusationState.balanceBeforeAccusation = 0;
	accusationState.targetAuthorUserId = null;
	accusationState.targetAuthorDailyId = null;

	// World 状態をリセットする
	this.reset();

	// AI告発シナリオの場合、デフォルトユーザーをセットアップする。
	// common.steps.ts の「ユーザーの通貨残高が N である」ステップが
	// this.currentUserId を前提とするため、ここで事前にユーザーを生成する。
	// デフォルト残高を200に設定（通貨残高指定のないシナリオでも告発可能にする）。
	// See: features/ai_accusation.feature
	if (isAccusationScenario) {
		const { InMemoryCurrencyRepo, InMemoryUserRepo } =
			require("./mock-installer");
		const AuthService =
			require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
		const ipHash = "bdd-test-ip-hash-accusation";
		const { token, userId } = await AuthService.issueEdgeToken(ipHash);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = ipHash;
		(this as any)._accuserDailyId = userId.slice(0, 8);
		await InMemoryUserRepo.updateIsVerified(userId, true);
		InMemoryCurrencyRepo._upsert({
			userId,
			balance: 200,
			updatedAt: new Date(Date.now()),
		});
	}
});

// ---------------------------------------------------------------------------
// After: シナリオ終了後のクリーンアップ（各シナリオで実行）
// ---------------------------------------------------------------------------

/**
 * 各シナリオ終了後に時刻スタブを復元する。
 * setCurrentTime で Date.now が書き換えられた場合でも元に戻す。
 *
 * See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル > After
 * See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
 */
After(function (this: BattleBoardWorld) {
	this.restoreDateNow();
});
