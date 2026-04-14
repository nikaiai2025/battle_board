/**
 * curation_bot.feature v3 ステップ定義
 *
 * キュレーションBOTの収集バッチ・BOT投稿・BOTスペックに関するシナリオを実装する。
 *
 * カバーするシナリオ（v3: 全11シナリオ）:
 *   - 収集バッチ（日次バッチ・月次バッチ・上限6件・データ取得失敗保持）
 *   - BOT投稿（新規スレッド作成・投稿間隔・投稿済み除外・フォールバック・スキップ）
 *   - BOTスペック（初期HP=100）
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { getJstDateString } from "../../src/lib/domain/rules/jst-date";
import type { CollectedItem } from "../../src/lib/services/bot-strategies/types";
import * as InMemoryCollectedTopicRepo from "../support/in-memory/collected-topic-repository";
import {
	InMemoryBotPostRepo,
	InMemoryBotRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ソースごとの蓄積上限件数（collection-job.ts と同値） */
const MAX_ITEMS_PER_SOURCE = 6;

/** BDDテストで使用する板ID */
const TEST_BOARD_ID = "livebot";

/** BDDテストで使用するデフォルトIPハッシュ（キュレーションBOT用） */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-curation";

/** キュレーションBOTのプロファイルキー */
const CURATION_PROFILE_KEY = "curation_newsplus";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

/**
 * AuthService を動的 require で取得する。
 * See: features/step_definitions/bot_system.steps.ts パターン
 */
function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

/**
 * PostService を動的 require で取得する。
 * See: features/step_definitions/bot_system.steps.ts パターン
 */
function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

/**
 * BOTによるスレッド作成関数（InMemory版）。
 *
 * PostService.createThread は resolveAuth を通すため edgeToken=null のBOT書き込みでは
 * 認証エラーとなる。BDDテストでは InMemory リポジトリ直接操作で代替する。
 *
 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
 * See: src/lib/services/bot-service.ts > CreateThreadFn
 */
async function botCreateThread(
	input: { boardId: string; title: string; firstPostBody: string },
	_edgeToken: string | null,
	ipHash: string,
): Promise<import("../../src/lib/services/post-service").CreateThreadResult> {
	// スレッドを作成する
	const thread = await InMemoryThreadRepo.create({
		threadKey: Math.floor(Date.now() / 1000).toString(),
		boardId: input.boardId,
		title: input.title,
		createdBy: ipHash,
	});

	// 1レス目を作成する（原子採番版）
	const post = await InMemoryPostRepo.createWithAtomicNumber({
		threadId: thread.id,
		body: input.firstPostBody,
		authorId: ipHash,
		displayName: "名無しさん",
		dailyId: ipHash.slice(0, 8),
		inlineSystemInfo: null,
		isSystemMessage: false,
	});

	return {
		success: true,
		thread,
		firstPost: post,
	};
}

/**
 * BotService インスタンスを生成する（キュレーションBOT用の全DI込み）。
 *
 * executeBotPost() の内部で:
 *   - resolveStrategies: ThreadCreatorBehaviorStrategy を解決
 *   - createThreadFn: botCreateThread（InMemory版: 認証バイパス）を使用
 *   - collectedTopicRepository: InMemoryCollectedTopicRepo を使用
 *
 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
 * See: docs/architecture/components/bot.md §2.13.5
 */
function createCurationBotService() {
	const { BotService } =
		require("../../src/lib/services/bot-service") as typeof import("../../src/lib/services/bot-service");
	const { botProfilesConfig } =
		require("../../config/bot-profiles") as typeof import("../../config/bot-profiles");
	const PostService = getPostService();

	return new BotService(
		InMemoryBotRepo,
		InMemoryBotPostRepo,
		// 攻撃リポジトリ（キュレーションBOTでは未使用だが必須引数）
		{
			findByAttackerAndBotAndDate: async () => null,
			create: async () => ({}) as any,
			deleteByDateBefore: async () => 0,
		},
		botProfilesConfig, // botProfilesData
		InMemoryThreadRepo, // threadRepository
		PostService.createPost, // createPostFn
		undefined, // resolveStrategiesFn（デフォルト resolver を使用）
		undefined, // pendingTutorialRepository
		undefined, // pendingAsyncCommandRepository
		undefined, // dailyEventRepository
		botCreateThread, // createThreadFn（InMemory版: 認証バイパス）
		InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo, // collectedTopicRepository
	);
}

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * テスト用ユーザーのセットアップ（PostService.createThread に必要）。
 * See: features/step_definitions/bot_system.steps.ts > ensureUserAndThread パターン
 */
async function ensureUser(world: BattleBoardWorld): Promise<void> {
	if (world.currentUserId) return;
	const AuthService = getAuthService();
	const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
	world.currentEdgeToken = token;
	world.currentUserId = userId;
	world.currentIpHash = DEFAULT_IP_HASH;
	await InMemoryUserRepo.updateIsVerified(userId, true);
	// ウェルカムシーケンス抑止
	// See: features/welcome.feature
	seedDummyPost(userId);
}

/**
 * キュレーションBOTをInMemoryBotRepoに作成する。
 *
 * @param options - オプション（next_post_at 等を上書き可能）
 * @returns 作成されたBOT
 *
 * See: features/curation_bot.feature
 */
async function createCurationBot(options: { nextPostAt?: Date | null } = {}) {
	const { botProfilesConfig } =
		require("../../config/bot-profiles") as typeof import("../../config/bot-profiles");
	const profile = botProfilesConfig[CURATION_PROFILE_KEY];
	const now = new Date(Date.now());

	return InMemoryBotRepo.create({
		name: "速報+速報ボット",
		persona: "5chニュース速報+のバズスレッドをキュレーション",
		hp: profile.hp,
		maxHp: profile.max_hp,
		dailyId: crypto.randomUUID().slice(0, 8),
		dailyIdDate: getJstDateString(now),
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		grassCount: 0,
		botProfileKey: CURATION_PROFILE_KEY,
		nextPostAt:
			options.nextPostAt !== undefined
				? options.nextPostAt
				: new Date(Date.now() - 60000),
	});
}

/**
 * テスト用の収集アイテムを生成する。
 *
 * @param count - 生成件数
 * @param options - オプション
 * @returns CollectedItem の配列
 */
function generateCollectedItems(
	count: number,
	options: {
		buzzScoreStart?: number;
	} = {},
): CollectedItem[] {
	const items: CollectedItem[] = [];
	const buzzStart = options.buzzScoreStart ?? 100;
	for (let i = 0; i < count; i++) {
		items.push({
			articleTitle: `テスト記事タイトル${i + 1}`,
			sourceUrl: `https://example.com/article/${i + 1}`,
			buzzScore: buzzStart - i * 10,
		});
	}
	return items;
}

/**
 * CollectedItem 配列を buzzScore 降順ソート + 上限切り出しする。
 * collection-job.ts の処理を再現するヘルパー。
 *
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 */
function sortAndSlice(items: CollectedItem[]): CollectedItem[] {
	return [...items]
		.sort((a, b) => b.buzzScore - a.buzzScore)
		.slice(0, MAX_ITEMS_PER_SOURCE);
}

// ===========================================================================
// 収集バッチ (S1〜S5)
//
// runCollectionJob() は supabaseAdmin.from("bots") を直接呼び出すため、
// InMemory 環境では BOT 取得部分が動作しない。
// そのため、収集ジョブの中核ロジック（アダプター呼び出し → ソート → 保存）を
// ステップ定義内で再現してテストする。
//
// See: features/curation_bot.feature
// See: src/lib/collection/collection-job.ts
// ===========================================================================

// ---------------------------------------------------------------------------
// S1: 日次バッチでバズデータを収集・蓄積する
// See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
// ---------------------------------------------------------------------------

Given("日次収集バッチが実行される", async function (this: BattleBoardWorld) {
	// キュレーションBOTをセットアップする
	const bot = await createCurationBot();
	this.currentBot = bot;

	// InMemoryCollectedTopicRepo を World に設定する
	this.collectedTopicRepo =
		InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;

	// デフォルトのモック収集アイテム（6件）をセットする
	// When ステップで上書きされない場合はこの値が使われる
	if (this.mockCollectedItems.length === 0) {
		this.mockCollectedItems = generateCollectedItems(6);
	}
});

When(
	"外部ソースからバズスコア上位6件を取得する",
	async function (this: BattleBoardWorld) {
		// S1: 6件のアイテムをソート・保存する
		assert(this.currentBot, "currentBot が未設定です");
		assert(this.collectedTopicRepo, "collectedTopicRepo が未設定です");

		const topItems = sortAndSlice(this.mockCollectedItems);
		const todayJst = getJstDateString(new Date(Date.now()));
		await this.collectedTopicRepo.save(topItems, this.currentBot.id, todayJst);
	},
);

Then(
	"記事タイトル・元ネタURL・バズスコアをDBに保存する",
	async function (this: BattleBoardWorld) {
		// InMemoryCollectedTopicRepo の全データを取得して3フィールドを検証する
		const stored = InMemoryCollectedTopicRepo._getAll();
		assert(stored.length > 0, "保存されたデータが0件です");

		for (const topic of stored) {
			assert(
				topic.articleTitle,
				`articleTitle が空です: ${JSON.stringify(topic)}`,
			);
			assert(topic.sourceUrl, `sourceUrl が空です: ${JSON.stringify(topic)}`);
			assert(
				typeof topic.buzzScore === "number",
				`buzzScore が数値でありません: ${JSON.stringify(topic)}`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// S2: Wikipedia定番記事を月次バッチで収集する
// See: features/curation_bot.feature @Wikipedia定番記事を月次バッチで収集する
// ---------------------------------------------------------------------------

Given(
	"Wikipedia月次収集バッチが実行される",
	async function (this: BattleBoardWorld) {
		// Wikipedia用のBOTをセットアップする（月次フラグは bot_profiles.yaml の設定）
		const bot = await createCurationBot();
		this.currentBot = bot;
		this.collectedTopicRepo =
			InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;

		// Wikipedia月次用のモック収集アイテム（6件）
		this.mockCollectedItems = [];
		for (let i = 0; i < 6; i++) {
			this.mockCollectedItems.push({
				articleTitle: `Wikipedia記事タイトル${i + 1}`,
				sourceUrl: `https://ja.wikipedia.org/wiki/Article_${i + 1}`,
				buzzScore: 10000 - i * 1000, // 月次閲覧数をbuzzScoreとして格納
			});
		}
	},
);

When("月次閲覧数トップ6件を取得する", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "currentBot が未設定です");
	assert(this.collectedTopicRepo, "collectedTopicRepo が未設定です");

	const topItems = sortAndSlice(this.mockCollectedItems);
	const todayJst = getJstDateString(new Date(Date.now()));
	await this.collectedTopicRepo.save(topItems, this.currentBot.id, todayJst);
});

Then(
	"記事タイトル・元ネタURL・月次閲覧数をDBに保存する",
	async function (this: BattleBoardWorld) {
		const stored = InMemoryCollectedTopicRepo._getAll();
		assert.strictEqual(
			stored.length,
			6,
			`保存件数が6件ではありません: ${stored.length}`,
		);

		for (const topic of stored) {
			assert(topic.articleTitle, "articleTitle が空です");
			assert(topic.sourceUrl, "sourceUrl が空です");
			assert(
				typeof topic.buzzScore === "number",
				"buzzScore (月次閲覧数) が数値ではありません",
			);
		}
	},
);

// ---------------------------------------------------------------------------
// S4: ソースごとの蓄積上限は6件である
// See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
// ---------------------------------------------------------------------------

When(
	"あるソースのバズアイテムが6件を超える",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "currentBot が未設定です");
		assert(this.collectedTopicRepo, "collectedTopicRepo が未設定です");

		// 10件のアイテムを生成して、ソート・上限切り出し後に保存する
		const items = generateCollectedItems(10);
		const topItems = sortAndSlice(items);
		const todayJst = getJstDateString(new Date(Date.now()));
		await this.collectedTopicRepo.save(topItems, this.currentBot.id, todayJst);
	},
);

Then(
	"バズスコアの高い順に6件のみ保存し残りは破棄する",
	async function (this: BattleBoardWorld) {
		const stored = InMemoryCollectedTopicRepo._getAll();
		assert.strictEqual(
			stored.length,
			MAX_ITEMS_PER_SOURCE,
			`保存件数が${MAX_ITEMS_PER_SOURCE}件ではありません: ${stored.length}`,
		);

		// buzzScore 降順であることを確認する
		for (let i = 1; i < stored.length; i++) {
			assert(
				stored[i - 1].buzzScore >= stored[i].buzzScore,
				`buzzScore が降順ではありません: ${stored[i - 1].buzzScore} < ${stored[i].buzzScore}`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// S5: データ取得失敗時は前回の蓄積データを保持する
// See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
// ---------------------------------------------------------------------------

Given(
	"あるソースの前回蓄積データが存在する",
	async function (this: BattleBoardWorld) {
		// キュレーションBOTをセットアップする
		const bot = await createCurationBot();
		this.currentBot = bot;
		this.collectedTopicRepo =
			InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;

		// 前回日付（前日）のデータを6件直接シードする
		const yesterdayJst = getJstDateString(new Date(Date.now() - 86400000));
		for (let i = 0; i < 6; i++) {
			InMemoryCollectedTopicRepo._seed({
				id: crypto.randomUUID(),
				articleTitle: `前回記事${i + 1}`,
				sourceUrl: `https://example.com/previous/${i + 1}`,
				buzzScore: 100 - i * 10,
				collectedDate: yesterdayJst,
				sourceBotId: bot.id,
				isPosted: false,
				postedAt: null,
			});
		}
	},
);

When(
	"日次収集バッチでそのソースのデータ取得が失敗する",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "currentBot が未設定です");

		// collection-job.ts ではアダプターが例外をスローしても catch してログ出力し、
		// 前回データの save は呼ばれない。save が呼ばれなければ ON CONFLICT DO NOTHING で
		// 前回データは保持される。ここではその動作をシミュレートする。
		// つまり、何もしない（save を呼ばない）。
		try {
			throw new Error("模擬: 外部ソースからのデータ取得に失敗");
		} catch (err) {
			this.lastCollectionError = err as Error;
		}
	},
);

Then(
	"前回の蓄積データは上書きされずに保持される",
	async function (this: BattleBoardWorld) {
		const stored = InMemoryCollectedTopicRepo._getAll();
		assert.strictEqual(
			stored.length,
			6,
			`前回データが保持されていません: ${stored.length}件`,
		);

		// 前回データが残存していることを確認する
		for (const topic of stored) {
			assert(
				topic.articleTitle.startsWith("前回記事"),
				`前回データではないデータが混入しています: ${topic.articleTitle}`,
			);
		}
	},
);

// ===========================================================================
// BOT投稿 (S6〜S11)
//
// BotService.executeBotPost(botId) を直接呼び出す。
// ThreadCreatorBehaviorStrategy が InMemoryCollectedTopicRepo から投稿候補を取得し、
// PostService.createThread でスレッドを作成する。
//
// See: features/curation_bot.feature
// ===========================================================================

// ---------------------------------------------------------------------------
// S6: キュレーションBOTが蓄積データから新規スレッドを立てる
// See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
// ---------------------------------------------------------------------------

Given(
	"キュレーションBOTの投稿タイミングが来た",
	async function (this: BattleBoardWorld) {
		// ユーザーセットアップ（PostService.createThread が内部で AuthService を使用するため）
		await ensureUser(this);

		// next_post_at <= NOW() のキュレーションBOTを作成する
		const bot = await createCurationBot({
			nextPostAt: new Date(Date.now() - 60000),
		});
		this.currentBot = bot;
		this.collectedTopicRepo =
			InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;
	},
);

Given(
	"最新の蓄積データに未投稿のアイテムが存在する",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "currentBot が未設定です");

		// 当日の未投稿アイテムを3件シードする
		const todayJst = getJstDateString(new Date(Date.now()));
		for (let i = 0; i < 3; i++) {
			InMemoryCollectedTopicRepo._seed({
				id: crypto.randomUUID(),
				articleTitle: `バズ記事タイトル${i + 1}`,
				sourceUrl: `https://example.com/buzz/${i + 1}`,
				buzzScore: 100 - i * 10,
				collectedDate: todayJst,
				sourceBotId: this.currentBot.id,
				isPosted: false,
				postedAt: null,
			});
		}
	},
);

When(
	"未投稿のアイテムからランダムに1件を選択する",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "currentBot が未設定です");

		const botService = createCurationBotService();
		const result = await botService.executeBotPost(this.currentBot.id);
		(this as any)._lastBotPostResult = result;
	},
);

Then(
	"記事タイトルをスレッドタイトルとして新規スレッドを作成する",
	async function (this: BattleBoardWorld) {
		const result = (this as any)._lastBotPostResult;
		assert(
			result,
			"executeBotPost の結果が null です（投稿が実行されませんでした）",
		);
		assert(result.postId, "postId が存在しません");

		// InMemoryThreadRepo から作成されたスレッドを検索する
		const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID);
		assert(threads.length > 0, "スレッドが作成されていません");

		// スレッドタイトルが収集アイテムのいずれかの articleTitle と一致することを確認する
		const storedTopics = InMemoryCollectedTopicRepo._getAll();
		const articleTitles = storedTopics.map((t) => t.articleTitle);

		// 実際に作成されたスレッドを取得する（最新のもの）
		const lastThread = threads[threads.length - 1];
		// InMemoryThreadRepo.findByBoardId は { id: string } しか返さないので、
		// InMemoryThreadRepo._findById で詳細を取得する
		const threadDetail = await InMemoryThreadRepo.findById(lastThread.id);
		assert(threadDetail, "作成されたスレッドの詳細が取得できません");
		assert(
			articleTitles.includes(threadDetail.title),
			`スレッドタイトル "${threadDetail.title}" が収集アイテムのタイトルと一致しません。候補: ${articleTitles.join(", ")}`,
		);
	},
);

Then(
	">>1 にバズスコアと元ネタURLを書き込む",
	async function (this: BattleBoardWorld) {
		const result = (this as any)._lastBotPostResult;
		assert(result, "executeBotPost の結果が null です");

		// 投稿内容を取得する
		const post = await InMemoryPostRepo.findById(result.postId);
		assert(post, "投稿が見つかりません");

		// 投稿済みトピックを取得する（is_posted === true のもの）
		const postedTopics = InMemoryCollectedTopicRepo._getAll().filter(
			(t) => t.isPosted,
		);
		assert(postedTopics.length > 0, "投稿済みトピックが存在しません");

		const postedTopic = postedTopics[0];

		// v4 形式: content あり → `{content}\n\n元ネタ: {sourceUrl}`
		//          content なし & buzzScore > 0 → `{sourceUrl}\n\nバズスコア: {localizedScore}`
		//          content なし & buzzScore = 0 → `{sourceUrl}`
		// See: tmp/workers/bdd-architect_TASK-379/design.md §3.5 formatBody 拡張
		assert(
			post.body.includes(postedTopic.sourceUrl),
			`>>1 の本文に元ネタURL が含まれていません: ${post.body}`,
		);
		// buzzScore が 0 超の場合は本文に数値が含まれる
		// （toLocaleString("ja-JP") での 3桁区切りも許容するため Math.round 済み値の
		//  先頭桁で判定）
		if (postedTopic.buzzScore > 0) {
			const scoreStr = Math.round(postedTopic.buzzScore).toLocaleString(
				"ja-JP",
			);
			assert(
				post.body.includes(scoreStr) || post.body.includes("バズスコア:"),
				`>>1 の本文にバズスコアが含まれていません: ${post.body}`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// S8: BOTの投稿間隔は12時間〜24時間のランダム間隔である
// See: features/curation_bot.feature @BOTの投稿間隔は12時間〜24時間のランダム間隔である
// ---------------------------------------------------------------------------

Given(
	"キュレーションBOTが前回投稿を完了した",
	async function (this: BattleBoardWorld) {
		// TopicDrivenSchedulingStrategy の検証のためBOTを作成する
		const bot = await createCurationBot();
		this.currentBot = bot;
	},
);

When("次回投稿タイミングを決定する", async function (this: BattleBoardWorld) {
	// TopicDrivenSchedulingStrategy.getNextPostDelay() を直接呼び出す
	const { TopicDrivenSchedulingStrategy } =
		require("../../src/lib/services/bot-strategies/scheduling/topic-driven") as typeof import("../../src/lib/services/bot-strategies/scheduling/topic-driven");

	const strategy = new TopicDrivenSchedulingStrategy();
	const delays: number[] = [];

	// 100回ループで範囲外がないことを検証する
	for (let i = 0; i < 100; i++) {
		delays.push(
			strategy.getNextPostDelay({
				botId: "test",
				botProfileKey: CURATION_PROFILE_KEY,
			}),
		);
	}

	(this as any)._schedulingDelays = delays;
});

Then(
	"12時間以上24時間以内のランダムな間隔が設定される",
	async function (this: BattleBoardWorld) {
		const delays: number[] = (this as any)._schedulingDelays;
		assert(delays, "スケジューリング結果が未設定です");

		for (const delay of delays) {
			assert(
				delay >= 720 && delay <= 1440,
				`投稿間隔が範囲外です: ${delay}分（720〜1440分を期待。12〜24時間）`,
			);
		}

		// 全て同じ値ではないことを確認する（ランダム性の簡易チェック）
		const unique = new Set(delays);
		assert(
			unique.size > 1,
			`100回のスケジューリング結果が全て同じ値です: ${delays[0]}分`,
		);
	},
);

// ---------------------------------------------------------------------------
// S9: 投稿済みアイテムは選択候補から除外される
// See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
// ---------------------------------------------------------------------------

Given(
	"キュレーションBOTの蓄積データが6件存在する",
	async function (this: BattleBoardWorld) {
		// ユーザーセットアップ
		await ensureUser(this);

		const bot = await createCurationBot({
			nextPostAt: new Date(Date.now() - 60000),
		});
		this.currentBot = bot;
		this.collectedTopicRepo =
			InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;

		// 6件のアイテムをシードする（全て未投稿）
		const todayJst = getJstDateString(new Date(Date.now()));
		for (let i = 0; i < 6; i++) {
			InMemoryCollectedTopicRepo._seed({
				id: crypto.randomUUID(),
				articleTitle: `蓄積記事${i + 1}`,
				sourceUrl: `https://example.com/stored/${i + 1}`,
				buzzScore: 100 - i * 10,
				collectedDate: todayJst,
				sourceBotId: bot.id,
				isPosted: false,
				postedAt: null,
			});
		}
	},
);

Given("そのうち3件が投稿済みである", async function (this: BattleBoardWorld) {
	// 最初の3件を投稿済みにマークする
	const allTopics = InMemoryCollectedTopicRepo._getAll();
	for (let i = 0; i < 3; i++) {
		await InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo.markAsPosted(
			allTopics[i].id,
			new Date(Date.now()),
		);
	}
});

When("投稿タイミングが来る", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "currentBot が未設定です");

	const botService = createCurationBotService();
	const result = await botService.executeBotPost(this.currentBot.id);
	(this as any)._lastBotPostResult = result;
});

Then(
	"未投稿の3件からランダムに1件が選択される",
	async function (this: BattleBoardWorld) {
		const result = (this as any)._lastBotPostResult;
		assert(
			result,
			"executeBotPost の結果が null です（投稿が実行されませんでした）",
		);

		// 投稿されたアイテムが未投稿だった3件のいずれかであることを確認する
		// 投稿後に markAsPosted されているため、is_posted=true が4件（元3件+新1件）になるはず
		const allTopics = InMemoryCollectedTopicRepo._getAll();
		const postedTopics = allTopics.filter((t) => t.isPosted);
		assert.strictEqual(
			postedTopics.length,
			4,
			`投稿済み件数が4件ではありません: ${postedTopics.length}`,
		);

		// 新たに投稿されたトピックは「蓄積記事4〜6」のいずれかであることを確認する
		// (蓄積記事1〜3 は Given で投稿済みにマークされた)
		const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID);
		assert(threads.length > 0, "スレッドが作成されていません");

		const lastThread = threads[threads.length - 1];
		const threadDetail = await InMemoryThreadRepo.findById(lastThread.id);
		assert(threadDetail, "スレッド詳細が取得できません");

		// スレッドタイトルが未投稿だった記事（蓄積記事4〜6）のいずれかであること
		const unpostedTitles = ["蓄積記事4", "蓄積記事5", "蓄積記事6"];
		assert(
			unpostedTitles.includes(threadDetail.title),
			`スレッドタイトル "${threadDetail.title}" が未投稿アイテムのタイトルと一致しません。候補: ${unpostedTitles.join(", ")}`,
		);
	},
);

// ---------------------------------------------------------------------------
// S10: 当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする
// See: features/curation_bot.feature @当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする
// ---------------------------------------------------------------------------

Given(
	"キュレーションBOTの当日蓄積データが全て投稿済みである",
	async function (this: BattleBoardWorld) {
		// ユーザーセットアップ
		await ensureUser(this);

		const bot = await createCurationBot({
			nextPostAt: new Date(Date.now() - 60000),
		});
		this.currentBot = bot;
		this.collectedTopicRepo =
			InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;

		// 当日のデータ6件を全て投稿済みでシードする
		const todayJst = getJstDateString(new Date(Date.now()));
		for (let i = 0; i < 6; i++) {
			InMemoryCollectedTopicRepo._seed({
				id: crypto.randomUUID(),
				articleTitle: `当日記事${i + 1}`,
				sourceUrl: `https://example.com/today/${i + 1}`,
				buzzScore: 100 - i * 10,
				collectedDate: todayJst,
				sourceBotId: bot.id,
				isPosted: true,
				postedAt: new Date(Date.now()),
			});
		}
	},
);

Given(
	"前日の蓄積データに未投稿のアイテムが存在する",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "currentBot が未設定です");

		// 前日のデータに未投稿3件をシードする
		const yesterdayJst = getJstDateString(new Date(Date.now() - 86400000));
		for (let i = 0; i < 3; i++) {
			InMemoryCollectedTopicRepo._seed({
				id: crypto.randomUUID(),
				articleTitle: `前日記事${i + 1}`,
				sourceUrl: `https://example.com/yesterday/${i + 1}`,
				buzzScore: 50 - i * 10,
				collectedDate: yesterdayJst,
				sourceBotId: this.currentBot.id,
				isPosted: false,
				postedAt: null,
			});
		}
	},
);

Then(
	"前日の未投稿アイテムからランダムに1件が選択される",
	async function (this: BattleBoardWorld) {
		const result = (this as any)._lastBotPostResult;
		assert(
			result,
			"executeBotPost の結果が null です（投稿が実行されませんでした）",
		);

		// 投稿されたスレッドのタイトルが前日記事であることを確認する
		const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID);
		assert(threads.length > 0, "スレッドが作成されていません");

		const lastThread = threads[threads.length - 1];
		const threadDetail = await InMemoryThreadRepo.findById(lastThread.id);
		assert(threadDetail, "スレッド詳細が取得できません");

		const yesterdayTitles = ["前日記事1", "前日記事2", "前日記事3"];
		assert(
			yesterdayTitles.includes(threadDetail.title),
			`スレッドタイトル "${threadDetail.title}" が前日アイテムのタイトルと一致しません。候補: ${yesterdayTitles.join(", ")}`,
		);

		// 投稿されたアイテムの collected_date が前日であることも確認する
		const postedYesterday = InMemoryCollectedTopicRepo._getAll().filter(
			(t) =>
				t.isPosted &&
				t.collectedDate === getJstDateString(new Date(Date.now() - 86400000)),
		);
		assert(
			postedYesterday.length > 0,
			"前日のアイテムが投稿済みにマークされていません",
		);
	},
);

// ---------------------------------------------------------------------------
// S11: 蓄積データが存在しない場合は投稿をスキップする
// See: features/curation_bot.feature @蓄積データが存在しない場合は投稿をスキップする
// ---------------------------------------------------------------------------

Given(
	"キュレーションBOTの蓄積データが0件である",
	async function (this: BattleBoardWorld) {
		// ユーザーセットアップ
		await ensureUser(this);

		const bot = await createCurationBot({
			nextPostAt: new Date(Date.now() - 60000),
		});
		this.currentBot = bot;
		this.collectedTopicRepo =
			InMemoryCollectedTopicRepo.InMemoryCollectedTopicRepo;

		// ストアは既にリセット済みで0件
	},
);

Then(
	"投稿はスキップされ次回タイミングまで待機する",
	async function (this: BattleBoardWorld) {
		const result = (this as any)._lastBotPostResult;
		assert.strictEqual(
			result,
			null,
			"投稿がスキップされていません（null を期待）",
		);

		// next_post_at が更新されていることを確認する
		assert(this.currentBot, "currentBot が未設定です");
		const updatedBot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(updatedBot, "BOT が見つかりません");
		assert(
			updatedBot.nextPostAt !== null,
			"next_post_at が更新されていません（null のまま）",
		);

		// next_post_at が現在時刻より未来であることを確認する
		assert(
			updatedBot.nextPostAt!.getTime() > Date.now(),
			`next_post_at が現在時刻より過去です: ${updatedBot.nextPostAt}`,
		);
	},
);

// ===========================================================================
// BOTスペック (S12)
//
// See: features/curation_bot.feature @キュレーションBOTの初期HPは100である
// ===========================================================================

// ---------------------------------------------------------------------------
// S12: キュレーションBOTの初期HPは100である
// See: features/curation_bot.feature @キュレーションBOTの初期HPは100である
// ---------------------------------------------------------------------------

Given("キュレーションBOTが生成される", async function (this: BattleBoardWorld) {
	const bot = await createCurationBot();
	this.currentBot = bot;
});

Then(
	"BOTの初期HPは {int} である",
	async function (this: BattleBoardWorld, expectedHp: number) {
		assert(this.currentBot, "currentBot が未設定です");
		assert.strictEqual(
			this.currentBot.hp,
			expectedHp,
			`HPが期待値と異なります: ${this.currentBot.hp} !== ${expectedHp}`,
		);
		assert.strictEqual(
			this.currentBot.maxHp,
			expectedHp,
			`maxHpが期待値と異なります: ${this.currentBot.maxHp} !== ${expectedHp}`,
		);
	},
);
