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
Before(function (this: BattleBoardWorld, scenario: any) {
	// インメモリストアを全てクリアする
	resetAllStores();

	// AI告発シナリオの共有状態をリセットする（TASK-079 で追加）
	// See: features/phase2/ai_accusation.feature
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
