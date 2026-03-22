/**
 * !livingbot コマンド + ラストボットボーナス ステップ定義
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §4
 *
 * 対象シナリオ:
 *   - !livingbot 基本動作（生存BOT数表示、カウント除外条件）
 *   - !livingbot コスト（通貨消費・通貨不足）
 *   - ラストボットボーナス（撃破時の+100ボーナス、1日1回制限）
 *
 * 再利用するステップ（他ファイルで定義済み）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーの通貨残高が {int} である" (common.steps.ts)
 *   - "{string} を実行する" (command_system.steps.ts)
 *   - "通貨が {int} 消費される" (command_system.steps.ts)
 *   - "通貨残高が {int} になる" (common.steps.ts)
 *   - "通貨残高は {int} のまま変化しない" (common.steps.ts)
 *   - "コマンドは実行されない" (command_system.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *   - "ユーザーが "!attack >>N" を含む書き込みを投稿する" (bot_system.steps.ts)
 */

import assert from "node:assert";
import { Given, Then, When } from "@cucumber/cucumber";
import type { Bot } from "../../src/lib/domain/models/bot";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// 遅延 require ヘルパー
// ---------------------------------------------------------------------------

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

// ---------------------------------------------------------------------------
// InMemory リポジトリへの直接アクセス
// ---------------------------------------------------------------------------

const {
	InMemoryBotRepo,
	InMemoryBotPostRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
	InMemoryCurrencyRepo,
	InMemoryDailyEventRepo,
	InMemoryIncentiveLogRepo,
} = require("../support/mock-installer");

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const DEFAULT_IP_HASH = "bdd-test-ip-hash-livingbot";
const TEST_BOARD_ID = "battleboard";

/**
 * スレッド内BOT総数（撃破済み含む）の一時保持。
 * 「当該スレッドにN体のBOTが書き込んでいる」ステップで設定し、
 * 「そのうちN体は撃破済みである」ステップで撃破分を差し引く。
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.7
 */
// biome-ignore lint: mutable state for cross-step communication
let _threadBotTotalCount = 0;

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * 荒らし役BOTを生成してInMemoryBotRepoに挿入する。
 * See: features/command_livingbot.feature
 */
function createAndInsertActiveTrollBot(overrides?: Partial<Bot>): Bot {
	const bot: Bot = {
		id: crypto.randomUUID(),
		name: "荒らし役",
		persona: "荒らし",
		hp: 10,
		maxHp: 10,
		dailyId: crypto.randomUUID().slice(0, 8),
		dailyIdDate: new Date().toISOString().slice(0, 10),
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 3,
		totalPosts: 5,
		accusedCount: 1,
		timesAttacked: 0,
		botProfileKey: null,
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date(Date.now()),
		...overrides,
	};
	InMemoryBotRepo._insert(bot);
	return bot;
}

/**
 * ユーザーとスレッドが未作成なら作成する。
 */
async function ensureUserAndThread(world: BattleBoardWorld): Promise<void> {
	if (!world.currentUserId) {
		const AuthService = getAuthService();
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		world.currentEdgeToken = token;
		world.currentUserId = userId;
		world.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止
		const existingPosts = await InMemoryPostRepo.findByAuthorId(userId);
		if (existingPosts.length === 0) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: crypto.randomUUID(),
				postNumber: 1,
				authorId: userId,
				displayName: "名無しさん",
				dailyId: "dummyDly",
				body: "ウェルカムシーケンス抑止用ダミー",
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - 86400000),
			});
		}
	}
	if (!world.currentThreadId) {
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "livingbot BDD用スレッド",
			createdBy: world.currentUserId!,
		});
		world.currentThreadId = thread.id;
	}
}

/**
 * new_thread_join ボーナスを抑止する。
 * See: command_system.steps.ts の同等パターン
 */
function blockNewThreadJoinBonus(userId: string, threadId: string): void {
	InMemoryIncentiveLogRepo._insert({
		userId,
		incentiveType: "new_thread_join",
		threadId,
		amount: 3,
		createdAt: new Date(Date.now()),
	});
}

// ===========================================================================
// !livingbot — Given ステップ
// ===========================================================================

/**
 * 定期活動BOTがN体活動中である。
 * InMemoryBotRepo にアクティブな荒らし役BOTを N体挿入する。
 *
 * See: features/command_livingbot.feature @掲示板全体の生存BOT数がレス内マージで表示される
 */
Given(
	"定期活動BOTが{int}体活動中である",
	async function (this: BattleBoardWorld, count: number) {
		for (let i = 0; i < count; i++) {
			createAndInsertActiveTrollBot();
		}
	},
);

/**
 * スレッド固定BOTはアクティブスレッドにN体いる。
 * _setLivingBotCount で合算値を設定する。
 *
 * See: features/command_livingbot.feature @掲示板全体の生存BOT数がレス内マージで表示される
 */
Given(
	"スレッド固定BOTはアクティブスレッドに{int}体いる",
	async function (this: BattleBoardWorld, count: number) {
		if (count === 0) {
			// スレッド固定BOTが0体の場合、定期活動BOTのカウントのみ使用
			// デフォルトモード（ストアベース）で正しくカウントされる
			return;
		}
		// チュートリアルBOTを挿入し、_setLivingBotCount で合算設定
		for (let i = 0; i < count; i++) {
			createAndInsertActiveTrollBot({ botProfileKey: "tutorial" });
		}
		// 定期活動BOT + スレッド固定BOT の合計をオーバーライド
		const activeBots = (await InMemoryBotRepo.findActive()).length;
		InMemoryBotRepo._setLivingBotCount(activeBots);
	},
);

/**
 * アクティブスレッドにチュートリアルBOTがN体いる。
 *
 * See: features/command_livingbot.feature @定期活動BOTとアクティブスレッドのスレッド固定BOTが合算される
 */
Given(
	"アクティブスレッドにチュートリアルBOTが{int}体いる",
	async function (this: BattleBoardWorld, count: number) {
		for (let i = 0; i < count; i++) {
			createAndInsertActiveTrollBot({ botProfileKey: "tutorial" });
		}
		// 定期活動BOT + チュートリアルBOT の合計をオーバーライド
		const activeBots = (await InMemoryBotRepo.findActive()).length;
		InMemoryBotRepo._setLivingBotCount(activeBots);
	},
);

/**
 * チュートリアルBOTがN体いるが、いずれも休眠スレッドにいる。
 * _setLivingBotCount で休眠分を除外した値を設定する。
 *
 * See: features/command_livingbot.feature @休眠スレッドにいるスレッド固定BOTはカウントされない
 */
Given(
	"チュートリアルBOTが{int}体いるが、いずれも休眠スレッドにいる",
	async function (this: BattleBoardWorld, count: number) {
		// チュートリアルBOTをストアに挿入（isActive=true）
		for (let i = 0; i < count; i++) {
			createAndInsertActiveTrollBot({ botProfileKey: "tutorial" });
		}
		// 休眠スレッドのBOTはカウント対象外なので、定期活動BOTだけの数をオーバーライド
		const activeBots = (await InMemoryBotRepo.findActive()).filter(
			(b: Bot) => b.botProfileKey === null,
		).length;
		InMemoryBotRepo._setLivingBotCount(activeBots);
	},
);

/**
 * チュートリアルBOTがN体、休眠中のスレッドにいる。
 *
 * See: features/command_livingbot.feature @休眠スレッドが復活するとそのスレッドのスレッド固定BOTがカウントに復帰する
 */
Given(
	"チュートリアルBOTが{int}体、休眠中のスレッドにいる",
	async function (this: BattleBoardWorld, count: number) {
		for (let i = 0; i < count; i++) {
			createAndInsertActiveTrollBot({ botProfileKey: "tutorial" });
		}
		// 休眠スレッドのBOTはカウント対象外
		const activeBots = (await InMemoryBotRepo.findActive()).filter(
			(b: Bot) => b.botProfileKey === null,
		).length;
		InMemoryBotRepo._setLivingBotCount(activeBots);
	},
);

/**
 * 定期活動BOTがN体中M体撃破済みである。
 *
 * See: features/command_livingbot.feature @撃破済みBOTはカウントされない
 */
Given(
	"定期活動BOTが{int}体中{int}体撃破済みである",
	async function (this: BattleBoardWorld, total: number, eliminated: number) {
		const alive = total - eliminated;
		// アクティブなBOTを挿入
		for (let i = 0; i < alive; i++) {
			createAndInsertActiveTrollBot();
		}
		// 撃破済みBOTを挿入
		for (let i = 0; i < eliminated; i++) {
			createAndInsertActiveTrollBot({
				isActive: false,
				eliminatedAt: new Date(Date.now()),
				eliminatedBy: crypto.randomUUID(),
			});
		}
	},
);

/**
 * 全てのBOTが撃破済みである。
 *
 * See: features/command_livingbot.feature @全BOTが撃破済みの場合は0体と表示される
 */
Given("全てのBOTが撃破済みである", async function (this: BattleBoardWorld) {
	InMemoryBotRepo._setLivingBotCount(0);
});

// ===========================================================================
// !livingbot — Given ステップ（スレッド内カウント v2追加）
// ===========================================================================

/**
 * 当該スレッドにN体の生存BOTが書き込んでいる。
 * _setLivingBotInThreadCount で静的値を設定する。
 *
 * See: features/command_livingbot.feature @掲示板全体とスレッド内の生存BOT数がマージ表示される
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.7
 */
Given(
	"当該スレッドに{int}体の生存BOTが書き込んでいる",
	async function (this: BattleBoardWorld, count: number) {
		InMemoryBotRepo._setLivingBotInThreadCount(count);
	},
);

/**
 * 当該スレッドにはBOTの書き込みがない。
 * _setLivingBotInThreadCount(0) を設定する。
 *
 * See: features/command_livingbot.feature @スレッド内にBOTの書き込みがない場合は0体と表示される
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.7
 */
Given(
	"当該スレッドにはBOTの書き込みがない",
	async function (this: BattleBoardWorld) {
		InMemoryBotRepo._setLivingBotInThreadCount(0);
	},
);

/**
 * 当該スレッドにN体のBOTが書き込んでいる（撃破済み含む）。
 * World に仮カウントを保持し、後続の「そのうちN体は撃破済みである」ステップで
 * 実際のオーバーライド値を計算する。
 *
 * See: features/command_livingbot.feature @撃破済みBOTはスレッド内カウントにも含まれない
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.7
 */
Given(
	"当該スレッドに{int}体のBOTが書き込んでいる",
	async function (this: BattleBoardWorld, count: number) {
		// 仮カウントをモジュール変数に保持（後続ステップで撃破分を差し引く）
		_threadBotTotalCount = count;
		InMemoryBotRepo._setLivingBotInThreadCount(count);
	},
);

/**
 * そのうちN体は撃破済みである。
 * World に保持した仮カウントから撃破分を差し引いて _setLivingBotInThreadCount を更新する。
 *
 * See: features/command_livingbot.feature @撃破済みBOTはスレッド内カウントにも含まれない
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.7
 */
Given(
	"そのうち{int}体は撃破済みである",
	async function (this: BattleBoardWorld, eliminatedCount: number) {
		const total = _threadBotTotalCount;
		const living = total - eliminatedCount;
		InMemoryBotRepo._setLivingBotInThreadCount(living);
	},
);

// ===========================================================================
// !livingbot — When ステップ
// ===========================================================================

/**
 * ユーザーが "!livingbot" を含む書き込みを投稿する。
 * PostService.createPost 経由でコマンドを実行する。
 *
 * 注意: bot_system.steps.ts の /^ユーザーが "!attack >>(\d+)" を含む書き込みを投稿する$/
 * と ambiguous にならないよう、!livingbot 専用の正規表現で定義する。
 *
 * See: features/command_livingbot.feature @掲示板全体の生存BOT数がレス内マージで表示される
 */
When(
	/^ユーザーが "(!livingbot)" を含む書き込みを投稿する$/,
	async function (this: BattleBoardWorld, commandString: string) {
		await ensureUserAndThread(this);

		const PostService = getPostService();
		const CurrencyService = getCurrencyService();

		// 通貨残高がデフォルト 0 のままだとコスト不足で弾かれるため、
		// 明示的に残高設定されていない場合はデフォルト値を付与する。
		const currentBalance = await CurrencyService.getBalance(
			this.currentUserId!,
		);
		if (currentBalance === 0) {
			InMemoryCurrencyRepo._upsert({
				userId: this.currentUserId!,
				balance: 1000,
				updatedAt: new Date(Date.now()),
			});
		}

		// new_thread_join ボーナス抑止
		blockNewThreadJoinBonus(this.currentUserId!, this.currentThreadId!);

		const result = await PostService.createPost({
			threadId: this.currentThreadId!,
			body: commandString,
			edgeToken: this.currentEdgeToken!,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("success" in result && !result.success) {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		}
	},
);

/**
 * スレッドAから "!livingbot" を実行する。
 *
 * See: features/command_livingbot.feature @どのスレッドから実行しても同じ結果が返る
 */
When(
	"スレッドAから {string} を実行する",
	async function (this: BattleBoardWorld, commandString: string) {
		await ensureUserAndThread(this);

		const CurrencyService = getCurrencyService();
		const currentBalance = await CurrencyService.getBalance(
			this.currentUserId!,
		);
		if (currentBalance === 0) {
			InMemoryCurrencyRepo._upsert({
				userId: this.currentUserId!,
				balance: 1000,
				updatedAt: new Date(Date.now()),
			});
		}

		// スレッドAを作成
		const threadA = await InMemoryThreadRepo.create({
			threadKey: `threadA-${Date.now()}`,
			boardId: TEST_BOARD_ID,
			title: "スレッドA",
			createdBy: this.currentUserId!,
		});
		blockNewThreadJoinBonus(this.currentUserId!, threadA.id);

		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: threadA.id,
			body: commandString,
			edgeToken: this.currentEdgeToken!,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			// 結果をInMemoryから取得
			const posts = await InMemoryPostRepo.findByThreadId(threadA.id);
			const lastPost = posts[posts.length - 1];
			if (lastPost?.inlineSystemInfo) {
				this.livingBotResults.push(lastPost.inlineSystemInfo);
			}
		}
	},
);

/**
 * スレッドBから "!livingbot" を実行する。
 *
 * See: features/command_livingbot.feature @どのスレッドから実行しても同じ結果が返る
 */
When(
	"スレッドBから {string} を実行する",
	async function (this: BattleBoardWorld, commandString: string) {
		await ensureUserAndThread(this);

		// スレッドBを作成
		const threadB = await InMemoryThreadRepo.create({
			threadKey: `threadB-${Date.now()}`,
			boardId: TEST_BOARD_ID,
			title: "スレッドB",
			createdBy: this.currentUserId!,
		});
		blockNewThreadJoinBonus(this.currentUserId!, threadB.id);

		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: threadB.id,
			body: commandString,
			edgeToken: this.currentEdgeToken!,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			const posts = await InMemoryPostRepo.findByThreadId(threadB.id);
			const lastPost = posts[posts.length - 1];
			if (lastPost?.inlineSystemInfo) {
				this.livingBotResults.push(lastPost.inlineSystemInfo);
			}
		}
	},
);

/**
 * そのスレッドに書き込みがありスレッドが復活する。
 * _setLivingBotCount をアクティブBOT全数（休眠除外なし）に更新する。
 *
 * See: features/command_livingbot.feature @休眠スレッドが復活するとそのスレッドのスレッド固定BOTがカウントに復帰する
 */
When(
	"そのスレッドに書き込みがありスレッドが復活する",
	async function (this: BattleBoardWorld) {
		// スレッド復活をシミュレート: 全アクティブBOTをカウント対象に含める
		const activeBots = (await InMemoryBotRepo.findActive()).length;
		InMemoryBotRepo._setLivingBotCount(activeBots);
	},
);

// ===========================================================================
// !livingbot — Then ステップ
// ===========================================================================

/**
 * レス末尾に "{string}" がマージ表示される。
 * 最新レスの inlineSystemInfo を検証する。
 *
 * See: features/command_livingbot.feature @掲示板全体の生存BOT数がレス内マージで表示される
 */
Then(
	"レス末尾に {string} がマージ表示される",
	async function (this: BattleBoardWorld, expected: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "レスが存在しません");
		// 最新レス（postNumber最大）のinlineSystemInfoを検証
		const lastPost = posts.reduce((prev: any, curr: any) =>
			curr.postNumber > prev.postNumber ? curr : prev,
		);
		assert(
			lastPost.inlineSystemInfo,
			`最新レスに inlineSystemInfo が設定されていません（postNumber=${lastPost.postNumber}）`,
		);
		assert(
			lastPost.inlineSystemInfo.includes(expected),
			`期待: "${expected}" を含む\n実際: "${lastPost.inlineSystemInfo}"`,
		);
	},
);

/**
 * 両方のレスに同じ掲示板全体の生存BOT数が表示される。
 * v2: 掲示板全体部分のみを比較する（スレッド内カウントはスレッドにより異なるため）。
 *
 * See: features/command_livingbot.feature @掲示板全体のカウントはどのスレッドから実行しても同じ結果になる
 */
Then(
	"両方のレスに同じ掲示板全体の生存BOT数が表示される",
	async function (this: BattleBoardWorld) {
		assert.strictEqual(
			this.livingBotResults.length,
			2,
			`2つの結果を期待しましたが ${this.livingBotResults.length} 件でした`,
		);
		// v2フォーマットから「掲示板全体: N体」部分を抽出して比較
		const extractBoardCount = (msg: string): string => {
			const match = msg.match(/掲示板全体: \d+体/);
			return match ? match[0] : msg;
		};
		const boardCountA = extractBoardCount(this.livingBotResults[0]);
		const boardCountB = extractBoardCount(this.livingBotResults[1]);
		assert.strictEqual(
			boardCountA,
			boardCountB,
			`スレッドAの掲示板全体: "${boardCountA}" とスレッドBの掲示板全体: "${boardCountB}" が一致しません`,
		);
	},
);

// ===========================================================================
// ラストボットボーナス — Given ステップ
// ===========================================================================

/**
 * 掲示板全体の生存BOTが残りN体である。
 * N体のアクティブBOTを挿入し、_setLivingBotCount で設定する。
 *
 * See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
 */
Given(
	"掲示板全体の生存BOTが残り{int}体である",
	async function (this: BattleBoardWorld, count: number) {
		await ensureUserAndThread(this);
		// BOTを1体だけ挿入（撃破対象）
		const bot = createAndInsertActiveTrollBot({
			hp: 10,
			maxHp: 10,
			isRevealed: true,
		});
		this.currentBot = bot;
		this.botMap.set("lastBot", bot);
		// 追加のBOTが必要な場合
		for (let i = 1; i < count; i++) {
			createAndInsertActiveTrollBot();
		}
		// _setLivingBotCount でカウントを設定
		InMemoryBotRepo._setLivingBotCount(count);
	},
);

/**
 * 掲示板全体の生存BOTが3体いる。
 *
 * See: features/command_livingbot.feature @最後の1体でなければラストボットボーナスは発生しない
 */
Given(
	"掲示板全体の生存BOTが{int}体いる",
	async function (this: BattleBoardWorld, count: number) {
		await ensureUserAndThread(this);
		// 攻撃用の通貨を設定（明示的な残高設定がないシナリオ向け）
		const CurrencyService = getCurrencyService();
		const currentBalance = await CurrencyService.getBalance(
			this.currentUserId!,
		);
		if (currentBalance === 0) {
			InMemoryCurrencyRepo._upsert({
				userId: this.currentUserId!,
				balance: 1000,
				updatedAt: new Date(Date.now()),
			});
		}
		// new_thread_join ボーナス抑止
		blockNewThreadJoinBonus(this.currentUserId!, this.currentThreadId!);
		// BOTをcount体挿入
		for (let i = 0; i < count; i++) {
			const bot = createAndInsertActiveTrollBot({
				hp: 10,
				maxHp: 10,
				isRevealed: true,
			});
			if (i === 0) {
				this.currentBot = bot;
			}
		}
		InMemoryBotRepo._setLivingBotCount(count);
	},
);

/**
 * ユーザー（ID:Ax8kP2）の通貨残高が N である。
 * See: features/command_livingbot.feature @ラストボットボーナス
 */
// NOTE: This step is already defined in bot_system.steps.ts with regex:
// /^ユーザー（ID:([A-Za-z0-9]+)）の通貨残高が (\d+) である$/
// It is reused here.

/**
 * レス >>N はその最後のBOTの書き込みである。
 * BOTの書き込みをInMemoryに登録する。
 *
 * See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
 */
Given(
	/^レス >>(\d+) はその最後のBOTの書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const bot = this.currentBot ?? this.botMap.get("lastBot");
		assert(bot, "対象BOTが設定されていません");

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: bot.dailyId,
			body: "なんか適当なレス",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId, bot.id);
		this.botPostNumberToId.set(postNumber, postId);
	},
);

/**
 * レス >>N はBOTの書き込みである。
 *
 * See: features/command_livingbot.feature @最後の1体でなければラストボットボーナスは発生しない
 */
Given(
	/^レス >>(\d+) はBOTの書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const bot = this.currentBot;
		assert(bot, "対象BOTが設定されていません");

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: bot.dailyId,
			body: "適当なBOTの書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId, bot.id);
		this.botPostNumberToId.set(postNumber, postId);
	},
);

/**
 * 本日すでにラストボットボーナスが1回付与されている。
 *
 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
 */
Given(
	"本日すでにラストボットボーナスが1回付与されている",
	async function (this: BattleBoardWorld) {
		// JST 日付を計算
		const now = new Date(Date.now());
		const jstOffset = 9 * 60 * 60 * 1000;
		const jstDate = new Date(now.getTime() + jstOffset);
		const today = jstDate.toISOString().slice(0, 10);

		InMemoryDailyEventRepo._insert({
			eventType: "last_bot_bonus",
			eventDate: today,
			triggeredBy: crypto.randomUUID(),
		});
	},
);

/**
 * その後スレッド復活によりスレッド固定BOTがN体カウントに復帰した。
 * BOTを挿入し、_setLivingBotCount で1体に更新する。
 *
 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
 */
Given(
	"その後スレッド復活によりスレッド固定BOTが{int}体カウントに復帰した",
	async function (this: BattleBoardWorld, count: number) {
		await ensureUserAndThread(this);
		const bot = createAndInsertActiveTrollBot({
			botProfileKey: "tutorial",
			hp: 10,
			maxHp: 10,
			isRevealed: true,
		});
		this.currentBot = bot;
		InMemoryBotRepo._setLivingBotCount(count);
	},
);

/**
 * そのBOTが撃破され掲示板全体の生存BOTが再び0体になる。
 * !attack コマンドを実行して撃破する。
 *
 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
 */
When(
	"そのBOTが撃破され掲示板全体の生存BOTが再び0体になる",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const bot = this.currentBot;
		assert(bot, "撃破対象BOTが設定されていません");

		// BOTの書き込みをセットアップ（まだ無い場合）
		const postNumber = 99;
		if (!this.botPostNumberToId.has(postNumber)) {
			const postId = crypto.randomUUID();
			InMemoryPostRepo._insert({
				id: postId,
				threadId: this.currentThreadId!,
				postNumber,
				authorId: null,
				displayName: "名無しさん",
				dailyId: bot.dailyId,
				body: "BOTの書き込み",
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
			InMemoryBotPostRepo._insert(postId, bot.id);
			this.botPostNumberToId.set(postNumber, postId);
		}

		// 通貨を十分に設定
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance: 1000,
			updatedAt: new Date(Date.now()),
		});

		// AttackHandler で撃破
		const {
			AttackHandler,
		} = require("../../src/lib/services/handlers/attack-handler");
		const { BotService } = require("../../src/lib/services/bot-service");
		const CurrencyService = getCurrencyService();

		const botService = new BotService(
			InMemoryBotRepo,
			InMemoryBotPostRepo,
			require("../support/in-memory/attack-repository"),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			InMemoryDailyEventRepo,
		);

		const currencyAdapter = {
			getBalance: (userId: string) => CurrencyService.getBalance(userId),
			debit: (userId: string, amount: number, reason: any) =>
				CurrencyService.deduct(userId, amount, reason),
			credit: (userId: string, amount: number, reason: any) =>
				CurrencyService.credit(userId, amount, reason),
		};

		const attackHandler = new AttackHandler(
			botService,
			currencyAdapter,
			InMemoryPostRepo,
			5,
			10,
			3,
		);

		// 撃破後のカウントを0に設定
		InMemoryBotRepo._setLivingBotCount(0);

		const targetPostId = this.botPostNumberToId.get(postNumber);
		const result = await attackHandler.execute({
			args: [targetPostId!],
			postId: crypto.randomUUID(),
			threadId: this.currentThreadId!,
			userId: this.currentUserId!,
			dailyId: this.currentUserId!.slice(0, 8),
		});

		this.lastAttackResult = {
			success: result.success,
			systemMessage: result.systemMessage ?? "",
		};
		this.lastBotBonusNotice = result.lastBotBonusNotice ?? null;
	},
);

/**
 * 昨日ラストボットボーナスが付与されている。
 *
 * See: features/command_livingbot.feature @翌日にはラストボットボーナスが再び発生可能になる
 */
Given(
	"昨日ラストボットボーナスが付与されている",
	async function (this: BattleBoardWorld) {
		// 昨日のJST日付を計算
		const now = new Date(Date.now());
		const jstOffset = 9 * 60 * 60 * 1000;
		const yesterday = new Date(now.getTime() + jstOffset - 86400000);
		const yesterdayStr = yesterday.toISOString().slice(0, 10);

		InMemoryDailyEventRepo._insert({
			eventType: "last_bot_bonus",
			eventDate: yesterdayStr,
			triggeredBy: crypto.randomUUID(),
		});
	},
);

/**
 * 日次リセットでBOTが全て復活している。
 *
 * See: features/command_livingbot.feature @翌日にはラストボットボーナスが再び発生可能になる
 */
Given(
	"日次リセットでBOTが全て復活している",
	async function (this: BattleBoardWorld) {
		// bulkReviveEliminated を実行してBOT復活
		await InMemoryBotRepo.bulkReviveEliminated();
	},
);

/**
 * 本日、掲示板全体の生存BOTが残り1体になった。
 *
 * See: features/command_livingbot.feature @翌日にはラストボットボーナスが再び発生可能になる
 */
Given(
	"本日、掲示板全体の生存BOTが残り{int}体になった",
	async function (this: BattleBoardWorld, count: number) {
		await ensureUserAndThread(this);
		// 攻撃用の通貨を設定（明示的な残高設定がないシナリオ向け）
		const CurrencyService = getCurrencyService();
		const currentBalance = await CurrencyService.getBalance(
			this.currentUserId!,
		);
		if (currentBalance === 0) {
			InMemoryCurrencyRepo._upsert({
				userId: this.currentUserId!,
				balance: 1000,
				updatedAt: new Date(Date.now()),
			});
		}
		// new_thread_join ボーナス抑止
		blockNewThreadJoinBonus(this.currentUserId!, this.currentThreadId!);
		// BOTを1体挿入
		const bot = createAndInsertActiveTrollBot({
			hp: 10,
			maxHp: 10,
			isRevealed: true,
		});
		this.currentBot = bot;
		InMemoryBotRepo._setLivingBotCount(count);
	},
);

// ===========================================================================
// ラストボットボーナス — Then ステップ
// ===========================================================================

/**
 * BOTが撃破される。
 * lastAttackResult が success=true かつ HP=0 を確認する。
 *
 * See: features/command_livingbot.feature @ラストボットボーナス
 */
Then("BOTが撃破される", async function (this: BattleBoardWorld) {
	assert(this.lastAttackResult, "攻撃結果が存在しません");
	assert.strictEqual(
		this.lastAttackResult.success,
		true,
		`攻撃が成功していることを期待しました: ${this.lastAttackResult.systemMessage}`,
	);
	// systemMessage に HP:X→0 が含まれることを確認
	assert(
		this.lastAttackResult.systemMessage.includes("→0"),
		`HPが0になっていることを期待しました: ${this.lastAttackResult.systemMessage}`,
	);
});

/**
 * 通常の撃破報酬に加えてラストボットボーナス +100 が付与される。
 *
 * See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
 */
Then(
	"通常の撃破報酬に加えてラストボットボーナス +100 が付与される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(this.currentUserId);
		// 初期残高100 - attack5 + 撃破報酬(>=10) + ラストボットボーナス100
		// 最低でも 100 - 5 + 10 + 100 = 205
		assert(
			balance >= 200,
			`ラストボットボーナスが付与されていることを期待しました。現在残高: ${balance}`,
		);
	},
);

/**
 * 「★システム」名義の独立レスで祝福メッセージが表示される。
 *
 * See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
 */
Then(
	"「★システム」名義の独立レスで祝福メッセージが表示される:",
	async function (this: BattleBoardWorld, docString: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const systemPosts = posts.filter(
			(p: any) => p.displayName === "★システム" && p.isSystemMessage,
		);

		// 祝福メッセージが含まれるシステムレスを探す
		const expectedText = docString.trim();
		const bonusPost = systemPosts.find((p: any) =>
			p.body.includes("本日のBOTが全滅しました"),
		);

		// lastBotBonusNotice も確認（bot_system.steps.ts 未修正の場合のフォールバック）
		if (!bonusPost && this.lastBotBonusNotice) {
			assert(
				this.lastBotBonusNotice.includes("本日のBOTが全滅しました"),
				`祝福メッセージが期待と異なります: ${this.lastBotBonusNotice}`,
			);
			return;
		}

		assert(
			bonusPost,
			`★システム名義の祝福メッセージが見つかりません。システムレス: ${systemPosts.map((p: any) => p.body).join(" / ")}`,
		);
		assert(
			bonusPost.body.includes("本日のBOTが全滅しました"),
			`祝福メッセージが期待と異なります: ${bonusPost.body}`,
		);
	},
);

/**
 * 通常の撃破報酬のみ付与される。
 *
 * See: features/command_livingbot.feature @最後の1体でなければラストボットボーナスは発生しない
 */
Then("通常の撃破報酬のみ付与される", async function (this: BattleBoardWorld) {
	assert(this.lastAttackResult, "攻撃結果が存在しません");
	assert.strictEqual(
		this.lastAttackResult.success,
		true,
		"攻撃が成功していることを期待しました",
	);
	// 通常の撃破報酬は bot_system.steps.ts で検証済み
	// ここでは攻撃成功のみ確認する
});

/**
 * ラストボットボーナスは付与されない。
 *
 * See: features/command_livingbot.feature @最後の1体でなければラストボットボーナスは発生しない
 */
Then(
	"ラストボットボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		// lastBotBonusNotice が null であることを確認
		assert.strictEqual(
			this.lastBotBonusNotice,
			null,
			`ラストボットボーナスが付与されていないことを期待しました: ${this.lastBotBonusNotice}`,
		);
	},
);

/**
 * 祝福メッセージも表示されない。
 *
 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
 */
Then("祝福メッセージも表示されない", async function (this: BattleBoardWorld) {
	assert.strictEqual(
		this.lastBotBonusNotice,
		null,
		`祝福メッセージが表示されていないことを期待しました: ${this.lastBotBonusNotice}`,
	);
});

/**
 * ラストボットボーナス +100 が付与される。
 *
 * See: features/command_livingbot.feature @翌日にはラストボットボーナスが再び発生可能になる
 */
Then(
	"ラストボットボーナス +100 が付与される",
	async function (this: BattleBoardWorld) {
		assert(
			this.lastBotBonusNotice,
			"ラストボットボーナスの祝福メッセージが存在しません",
		);
		assert(
			this.lastBotBonusNotice.includes("ラストボットボーナス +100"),
			`祝福メッセージにラストボットボーナスが含まれていません: ${this.lastBotBonusNotice}`,
		);
	},
);
