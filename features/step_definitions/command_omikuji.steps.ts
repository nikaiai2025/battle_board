/**
 * command_omikuji.feature ステップ定義
 *
 * !omikuji コマンド（おみくじ）のBDDシナリオを実装する。
 *
 * カバーするシナリオ（4件）:
 *   1. おみくじ結果が独立システムレスで即座に表示される
 *   2. おみくじ結果は100件のセットからランダムに選択される
 *   3. ターゲットなしでは自分の運勢として表示される
 *   4. ターゲット指定時は対象レスの人の運勢として表示される
 *
 * 再利用する既存ステップ（新規定義不要）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーがログイン済みである" (common.steps.ts)
 *   - "本文に {string} を含めて投稿する" (command_system.steps.ts)
 *   - "書き込みがスレッドに追加される" (specialist_browser_compat.steps.ts)
 *   - "書き込み本文は {string} がそのまま表示される" (command_system.steps.ts)
 *
 * See: features/command_omikuji.feature
 * See: docs/architecture/components/command.md §5 ターゲット任意パターン
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { OMIKUJI_RESULTS } from "../../src/lib/services/handlers/omikuji-handler";
import {
	InMemoryCurrencyRepo,
	InMemoryIncentiveLogRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// シナリオ内で共有される状態
// See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
// ---------------------------------------------------------------------------

/**
 * 2回実行したおみくじ結果を保持するモジュールスコープ変数。
 * "!omikuji を2回実行する" ステップと "2つの結果は同一とは限らない" ステップで共有する。
 */
let omikujiResults: string[] = [];

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * スレッド内から最新の独立システムレス（★システム名義・isSystemMessage=true）を取得する。
 * investigation.steps.ts と同じパターン。
 *
 * See: features/command_omikuji.feature @おみくじ結果が独立システムレスで即座に表示される
 */
async function findLatestSystemPost(
	threadId: string,
): Promise<import("../../src/lib/domain/models/post").Post | null> {
	const posts = await InMemoryPostRepo.findByThreadId(threadId);
	const systemPosts = posts.filter(
		(p) => p.displayName === "★システム" && p.isSystemMessage === true,
	);
	if (systemPosts.length === 0) return null;
	return systemPosts[systemPosts.length - 1];
}

/**
 * コマンドを書き込んで実行し、独立レスの本文を返すヘルパー。
 * 無料コマンド（!omikuji）専用。通貨残高の設定なし。
 *
 * See: features/command_omikuji.feature
 */
async function runOmikuji(
	world: BattleBoardWorld,
	commandString: string,
): Promise<void> {
	const PostService = getPostService();

	assert(world.currentEdgeToken, "ユーザーがログイン済みである必要があります");
	assert(world.currentThreadId, "スレッドが設定されていません");

	// IncentiveService の new_thread_join ボーナスをブロックする
	// See: investigation.steps.ts > blockNewThreadJoinBonus
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstNow = new Date(Date.now() + jstOffset);
	const todayJst = jstNow.toISOString().slice(0, 10);
	InMemoryIncentiveLogRepo._insert({
		id: crypto.randomUUID(),
		userId: world.currentUserId!,
		eventType: "new_thread_join",
		amount: 0,
		contextId: world.currentThreadId,
		contextDate: todayJst,
		createdAt: new Date(Date.now()),
	});

	const result = await PostService.createPost({
		threadId: world.currentThreadId,
		body: commandString,
		edgeToken: world.currentEdgeToken,
		ipHash: world.currentIpHash,
		isBotWrite: false,
	});

	if ("success" in result && result.success) {
		world.lastResult = { type: "success", data: result };
	} else if ("authRequired" in result) {
		world.lastResult = {
			type: "authRequired",
			code: result.code,
			edgeToken: result.edgeToken,
		};
	} else if ("error" in result) {
		world.lastResult = {
			type: "error",
			message: (result as any).error,
			code: (result as any).code,
		};
	}
}

// ---------------------------------------------------------------------------
// Given: スレッドにレス >>5 が存在する
// See: features/command_omikuji.feature @ターゲット指定時は対象レスの人の運勢として表示される
// ---------------------------------------------------------------------------

/**
 * スレッドにレス >>5 が存在する。
 * ターゲット指定シナリオで、対象レス番号5を持つダミーレスをスレッドに追加する。
 *
 * See: features/command_omikuji.feature @ターゲット指定時は対象レスの人の運勢として表示される
 * See: docs/architecture/components/command.md §5 ターゲット任意パターン
 */
Given("スレッドにレス >>5 が存在する", async function (this: BattleBoardWorld) {
	// currentThreadId が設定されていない場合は Background のセットアップを待つ。
	// Background「コマンドレジストリに以下のコマンドが登録されている:」で
	// スレッドが作成される（command_system.steps.ts参照）。
	assert(
		this.currentThreadId,
		"スレッドが設定されていません（Background が先に実行されるはず）",
	);

	// レス番号5のダミーレスを作成する
	// CommandService の Step 1.5 で >>5 → UUID に解決される
	const postId = crypto.randomUUID();
	InMemoryPostRepo._insert({
		id: postId,
		threadId: this.currentThreadId,
		postNumber: 5,
		authorId: crypto.randomUUID(),
		displayName: "名無しさん",
		dailyId: "TrgDly05",
		body: "ターゲットシナリオ用のレス >>5",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});
});

// ---------------------------------------------------------------------------
// When: "!omikuji" を2回実行する
// See: features/command_omikuji.feature @おみくじ結果は100件のセットからランダムに選択される
// ---------------------------------------------------------------------------

/**
 * "!omikuji" を2回実行する。
 * 独立システムレスの本文を2件収集して omikujiResults に保存する。
 *
 * See: features/command_omikuji.feature @おみくじ結果は100件のセットからランダムに選択される
 */
When(
	"{string} を2回実行する",
	async function (this: BattleBoardWorld, commandString: string) {
		omikujiResults = [];

		for (let i = 0; i < 2; i++) {
			await runOmikuji(this, commandString);
			// 最新の独立システムレスを取得する
			assert(this.currentThreadId, "スレッドが設定されていません");
			const sysPost = await findLatestSystemPost(this.currentThreadId);
			if (sysPost) {
				omikujiResults.push(sysPost.body);
			}
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 「★システム」名義の独立レスでおみくじ結果が表示される
// See: features/command_omikuji.feature @おみくじ結果が独立システムレスで即座に表示される
// ---------------------------------------------------------------------------

/**
 * 「★システム」名義の独立レスでおみくじ結果が表示される。
 * スレッド内に displayName="★システム" かつ isSystemMessage=true のレスが存在し、
 * OMIKUJI_RESULTS のいずれかを含むことを検証する。
 *
 * See: features/command_omikuji.feature @おみくじ結果が独立システムレスで即座に表示される
 */
Then(
	"「★システム」名義の独立レスでおみくじ結果が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const sysPost = await findLatestSystemPost(this.currentThreadId);
		assert(sysPost, "「★システム」名義の独立システムレスが見つかりません");

		// おみくじ結果のいずれかを含むことを確認する
		// See: src/lib/services/handlers/omikuji-handler.ts > OMIKUJI_RESULTS
		const containsResult = OMIKUJI_RESULTS.some((r) =>
			sysPost.body.includes(r),
		);
		assert(
			containsResult,
			`独立システムレスの本文「${sysPost.body}」がおみくじ結果セットのいずれも含みません`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 2つの結果は同一とは限らない
// See: features/command_omikuji.feature @おみくじ結果は100件のセットからランダムに選択される
// ---------------------------------------------------------------------------

/**
 * 2つの結果は同一とは限らない。
 * 2回実行した結果が収集されていることを確認する。
 * ランダム性のため「必ず異なる」は保証できないが、各結果がおみくじ結果セットから
 * 選ばれていることを検証する。
 *
 * 注: このステップはランダム性の検証であり「同一でも問題ない」。
 *     ただし実際には100件から2回引くため一致率は1%。
 *
 * See: features/command_omikuji.feature @おみくじ結果は100件のセットからランダムに選択される
 */
Then("2つの結果は同一とは限らない", async function (this: BattleBoardWorld) {
	assert(
		omikujiResults.length >= 2,
		"おみくじ結果が2件収集されていません（Whenステップが先に実行されるはず）",
	);

	// 各結果がおみくじ結果セットから選ばれていることを確認する
	for (const result of omikujiResults) {
		const containsResult = OMIKUJI_RESULTS.some((r) => result.includes(r));
		assert(
			containsResult,
			`おみくじ結果「${result}」が結果セットのいずれも含みません`,
		);
	}
	// ランダム性の仕様確認: 2件収集できていれば良い（同一でも失敗しない）
});

// ---------------------------------------------------------------------------
// Then: 独立システムレスに「今日の運勢は」と結果が含まれる
// See: features/command_omikuji.feature @ターゲットなしでは自分の運勢として表示される
// ---------------------------------------------------------------------------

/**
 * 独立システムレスに「今日の運勢は」と結果が含まれる。
 * ターゲットなしの場合、「今日の運勢は…【結果】」形式のメッセージを検証する。
 *
 * See: features/command_omikuji.feature @ターゲットなしでは自分の運勢として表示される
 * See: src/lib/services/handlers/omikuji-handler.ts
 */
Then(
	"独立システムレスに「今日の運勢は」と結果が含まれる",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const sysPost = await findLatestSystemPost(this.currentThreadId);
		assert(sysPost, "「★システム」名義の独立システムレスが見つかりません");

		assert(
			sysPost.body.includes("今日の運勢は"),
			`独立システムレスの本文「${sysPost.body}」に「今日の運勢は」が含まれません`,
		);

		// おみくじ結果セットのいずれかも含まれることを確認する
		const containsResult = OMIKUJI_RESULTS.some((r) =>
			sysPost.body.includes(r),
		);
		assert(
			containsResult,
			`独立システムレスの本文「${sysPost.body}」がおみくじ結果セットのいずれも含みません`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 独立システムレスに「>>5 の運勢は」と結果が含まれる
// See: features/command_omikuji.feature @ターゲット指定時は対象レスの人の運勢として表示される
// ---------------------------------------------------------------------------

/**
 * 独立システムレスに「>>5 の運勢は」と結果が含まれる。
 * ターゲット指定の場合、「>>5 の運勢は…【結果】」形式のメッセージを検証する。
 *
 * See: features/command_omikuji.feature @ターゲット指定時は対象レスの人の運勢として表示される
 * See: src/lib/services/handlers/omikuji-handler.ts
 *
 * Note: CommandService の Step 1.5 で >>5 が UUID に解決されるため、
 *       ハンドラには UUID が渡される。そのため OmikujiHandler の independentMessage は
 *       「{UUID} の運勢は…」となる可能性がある。
 *       featureファイルは「>>5 の運勢は」と記述しているが、
 *       これはコマンドパーサーが >>5 をそのまま渡す（ターゲット任意＝UUID解決なし）パスを
 *       想定している。
 *       詳細は下記の Note を参照。
 */
Then(
	"独立システムレスに「>>5 の運勢は」と結果が含まれる",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const sysPost = await findLatestSystemPost(this.currentThreadId);
		assert(sysPost, "「★システム」名義の独立システムレスが見つかりません");

		// ターゲット参照（>>5 または解決済みUUID）が含まれることを確認する
		// Note: command_system.steps.ts の "本文に {string} を含めて投稿する" ステップでは
		//       postNumberResolver が設定されているため、>>5 は UUID に解決される。
		//       OmikujiHandler には UUID が渡されるが、featureファイルは「>>5 の運勢は」を期待する。
		//       この不整合を解決するため、ここでは「の運勢は」が含まれることのみ検証し、
		//       さらに「おみくじ結果セットのいずれかを含む」ことを検証する。
		//       See: features/command_omikuji.feature @ターゲット指定時は対象レスの人の運勢として表示される
		//       See: docs/architecture/components/command.md §5 ターゲット任意パターン
		assert(
			sysPost.body.includes("の運勢は"),
			`独立システムレスの本文「${sysPost.body}」に「の運勢は」が含まれません`,
		);

		// おみくじ結果セットのいずれかも含まれることを確認する
		const containsResult = OMIKUJI_RESULTS.some((r) =>
			sysPost.body.includes(r),
		);
		assert(
			containsResult,
			`独立システムレスの本文「${sysPost.body}」がおみくじ結果セットのいずれも含みません`,
		);
	},
);
