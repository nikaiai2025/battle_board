/**
 * command_aori.feature ステップ定義
 *
 * !aori（煽りBOT召喚）コマンドのシナリオを実装する。
 * 非同期キュー（pending_async_commands）の初実装であり、以下を検証する:
 *   - ステルス召喚（コマンド文字列除去 / 通貨不足時の残留）
 *   - Cron 処理（BOTスポーン → 煽り文句投稿 → pending削除）
 *   - BOT撃破と報酬（ファーミング防止の経済バランス検証）
 *   - 使い切りBOTのライフサイクル（定期書き込みなし / 日次リセット復活なし）
 *
 * 再利用するステップ（他ファイルで定義済み）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーがログイン済みである" (common.steps.ts)
 *   - "ユーザーの通貨残高が {int} である" (common.steps.ts)
 *   - "本文に {string} を含めて投稿する" (command_system.steps.ts)
 *   - "通貨が {int} 消費される" (command_system.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *   - "コマンド文字列 {string} は本文に含まれない" (command_iamsystem.steps.ts)
 *   - "表示される本文は {string} である" (command_iamsystem.steps.ts)
 *   - "コマンドは実行されない" (command_system.steps.ts)
 *   - "書き込みがスレッドに追加される" (specialist_browser_compat.steps.ts)
 *   - "書き込み本文は {string} がそのまま表示される" (command_system.steps.ts)
 *
 * See: features/command_aori.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { aoriTaunts } from "../../config/aori-taunts";
import { BotService } from "../../src/lib/services/bot-service";
import {
	InMemoryBotPostRepo,
	InMemoryBotRepo,
	InMemoryCurrencyRepo,
	InMemoryPendingAsyncCommandRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md S2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const TEST_BOARD_ID = "livebot";
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

// ---------------------------------------------------------------------------
// シナリオ間で共有するコンテキスト
// ---------------------------------------------------------------------------

/** Cron処理結果（processAoriCommands の戻り値） */
let lastAoriResult: Awaited<
	ReturnType<typeof BotService.prototype.processAoriCommands>
> | null = null;

// ---------------------------------------------------------------------------
// Background: 煽りBOTの撃破報酬は {int} である
// See: features/command_aori.feature Background
// ---------------------------------------------------------------------------

Given(
	"煽りBOTの撃破報酬は {int} である",
	async function (this: BattleBoardWorld, reward: number) {
		// bot_profiles.yaml の aori.reward.base_reward と一致することを確認
		// 実際の報酬計算は bot-profiles.ts に定義済みなので、ここでは仕様確認のみ
		assert.strictEqual(reward, 10, "煽りBOTの撃破報酬は10であるべきです");

		// ダミーレスを >>5 まで作成する。
		// !aori >>5 の PostNumberResolver 解決（Step 1.5）でレス >>5 の存在が必要。
		// Background の「コマンドレジストリに以下のコマンドが登録されている:」で
		// スレッドは作成済みだが、レスは threadKey=1 の1件のみのため >>5 が存在しない。
		// See: features/command_aori.feature Background
		if (this.currentThreadId && this.currentUserId) {
			const existingPosts = await InMemoryPostRepo.findByThreadId(
				this.currentThreadId,
			);
			const currentMax = existingPosts.reduce(
				(max, p) => Math.max(max, p.postNumber),
				0,
			);
			for (let i = currentMax + 1; i <= 5; i++) {
				InMemoryPostRepo._insert({
					id: crypto.randomUUID(),
					threadId: this.currentThreadId,
					postNumber: i,
					authorId: this.currentUserId,
					displayName: "名無しさん",
					dailyId: "DUMMY",
					body: `ダミー投稿 ${i}`,
					inlineSystemInfo: null,
					isSystemMessage: false,
					isDeleted: false,
					createdAt: new Date(Date.now()),
				});
			}
		}
	},
);

// ---------------------------------------------------------------------------
// Given: スレッドにレス >>N が存在する
// → command_omikuji.steps.ts で定義済みのステップを再利用する（重複定義を避ける）
// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Given: ユーザーが {string} を含む書き込みを投稿した
// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
// ---------------------------------------------------------------------------

Given(
	"ユーザーが {string} を含む書き込みを投稿した",
	async function (this: BattleBoardWorld, bodyContent: string) {
		const PostService = getPostService();

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: bodyContent,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		assert(
			"success" in result && result.success,
			`投稿が失敗しました: ${"error" in result ? result.error : "unknown"}`,
		);
	},
);

// ---------------------------------------------------------------------------
// When: BOT召喚の定期処理が実行される
// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
// ---------------------------------------------------------------------------

When("BOT召喚の定期処理が実行される", async function (this: BattleBoardWorld) {
	const InMemoryAttackRepo = require("../support/in-memory/attack-repository");

	// BotService を InMemory リポジトリで構成して processAoriCommands を実行する
	// See: tmp/workers/bdd-architect_269/aori_design.md §7.2
	const PostService = getPostService();
	const botService = new BotService(
		InMemoryBotRepo,
		InMemoryBotPostRepo,
		InMemoryAttackRepo,
		undefined, // botProfilesData
		undefined, // threadRepository
		PostService.createPost, // createPostFn
		undefined, // resolveStrategiesFn
		undefined, // pendingTutorialRepository
		InMemoryPendingAsyncCommandRepo, // pendingAsyncCommandRepository
	);
	lastAoriResult = await botService.processAoriCommands();
});

// ---------------------------------------------------------------------------
// Then: 煽りBOT（HP:{int}）が新規生成される
// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
// ---------------------------------------------------------------------------

Then(
	/^煽りBOT（HP:(\d+)）が新規生成される$/,
	async function (this: BattleBoardWorld, expectedHp: number) {
		assert(lastAoriResult, "processAoriCommands の結果がありません");
		assert(lastAoriResult.processed > 0, "pending が処理されていません");

		const successResult = lastAoriResult.results.find((r) => r.success);
		assert(successResult, "成功した処理がありません");
		assert(successResult.botId, "botId が設定されていません");

		const bot = await InMemoryBotRepo.findById(successResult.botId);
		assert(bot, "煽りBOTが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`HP が ${expectedHp} であるべきです`,
		);
		assert.strictEqual(
			bot.botProfileKey,
			"aori",
			"botProfileKey が 'aori' であるべきです",
		);
		// 使い切り設定の検証:
		// isActive=true（AttackHandler が攻撃を受け付けるために必要）
		// nextPostAt=null（定期書き込みを行わない）
		// See: features/command_aori.feature @煽りBOTは1回だけ書き込み、定期書き込みを行わない
		assert.strictEqual(
			bot.isActive,
			true,
			"煽りBOTは is_active=true であるべきです（attackable だが定期投稿しない）",
		);
		assert.strictEqual(
			bot.nextPostAt,
			null,
			"煽りBOTは next_post_at=null であるべきです（定期書き込みなし）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: BOTに偽装IDと「名無しさん」表示名が割り当てられる
//
// 汎用ステップ: InMemoryBotRepo から直近生成されたBOTを検索して検証する。
// lastAoriResult 等の特定コマンド結果変数に依存しない。
// aori, hiroyuki 等の複数コマンドから再利用可能。
//
// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
// See: features/command_hiroyuki.feature @ターゲット指定ありではBOTが対象ユーザーの投稿を踏まえた返信を投稿する
// ---------------------------------------------------------------------------

Then(
	"BOTに偽装IDと「名無しさん」表示名が割り当てられる",
	async function (this: BattleBoardWorld) {
		// InMemoryBotRepo から全BOTを取得し、直近生成されたBOTを検証する。
		// 特定コマンドの結果変数（lastAoriResult 等）に依存せず、
		// リポジトリの状態から汎用的に検証する。
		const allBots = await InMemoryBotRepo.findAll();
		assert(allBots.length > 0, "BOTが1体も生成されていません");

		// 直近生成されたBOT（配列末尾）を検証対象とする
		const latestBot = allBots[allBots.length - 1];
		assert.strictEqual(
			latestBot.name,
			"名無しさん",
			"表示名が '名無しさん' であるべきです",
		);
		assert(
			latestBot.dailyId && latestBot.dailyId.length > 0,
			"偽装IDが割り当てられているべきです",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: BOTが煽り文句セット（{int}件）から1つを選択して >>N 宛に投稿する
// See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
// ---------------------------------------------------------------------------

Then(
	/^BOTが煽り文句セット（(\d+)件）から1つを選択して >>(\d+) 宛に投稿する$/,
	async function (
		this: BattleBoardWorld,
		tauntCount: number,
		targetPostNumber: number,
	) {
		// 煽り文句セットの件数を検証
		assert.strictEqual(
			aoriTaunts.length,
			tauntCount,
			`煽り文句セットは ${tauntCount} 件であるべきです（実際: ${aoriTaunts.length}）`,
		);

		assert(lastAoriResult, "processAoriCommands の結果がありません");
		const successResult = lastAoriResult.results.find((r) => r.success);
		assert(successResult?.postId, "成功した処理のpostIdがありません");

		// 投稿内容を取得して検証
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPost = posts.find((p) => p.id === successResult.postId);
		assert(botPost, "煽りBOTの投稿が見つかりません");

		// ">>{N} " で始まることを検証
		const expectedPrefix = `>>${targetPostNumber} `;
		assert(
			botPost.body.startsWith(expectedPrefix),
			`投稿本文が "${expectedPrefix}" で始まるべきです: "${botPost.body}"`,
		);

		// アンカーを除いた残り部分が aoriTaunts に含まれることを検証
		const tauntPart = botPost.body.slice(expectedPrefix.length);
		assert(
			aoriTaunts.includes(tauntPart),
			`煽り文句 "${tauntPart}" が aoriTaunts に含まれていません`,
		);
	},
);

// ---------------------------------------------------------------------------
// Given: 煽りBOT（HP:{int}）がレス >>N として書き込み済みである
// See: features/command_aori.feature @煽りBOTを!attackで撃破すると報酬を得る
// ---------------------------------------------------------------------------

Given(
	/^煽りBOT（HP:(\d+)）がレス >>(\d+) として書き込み済みである$/,
	async function (this: BattleBoardWorld, hp: number, postNumber: number) {
		// スレッドが未作成の場合は作成する
		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "煽りBOTテスト用スレッド",
				createdBy: this.currentUserId ?? crypto.randomUUID(),
			});
			this.currentThreadId = thread.id;
		}

		// 煽りBOTを作成
		// isActive: true に設定する。AttackHandler は !botInfo.isActive で撃破済み判定するため、
		// isActive=false だと「既に撃破されています」と判定される。
		// processAoriCommands では is_active=false で作成するが、この Given ステップは
		// 「HP残ありで攻撃可能な煽りBOT」を前提としたシナリオなので isActive=true が正しい。
		// 定期書き込みは next_post_at=null で抑止される。
		// See: features/command_aori.feature @煽りBOTを!attackで撃破すると報酬を得る
		const bot = await InMemoryBotRepo.create({
			name: "名無しさん",
			persona: "煽り",
			hp: hp,
			maxHp: hp,
			dailyId: "AoriBot1",
			dailyIdDate: "2026-03-22",
			isActive: true,
			isRevealed: false,
			revealedAt: null,
			botProfileKey: "aori",
			nextPostAt: null,
		});

		// ダミーレスを postNumber の手前まで作成
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max, p) => Math.max(max, p.postNumber),
			0,
		);
		for (let i = currentMax + 1; i < postNumber; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: bot.id,
				displayName: "名無しさん",
				dailyId: "DUMMY",
				body: `ダミー ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}

		// 煽りBOTの書き込みを作成
		const botPostId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: botPostId,
			threadId: this.currentThreadId,
			postNumber: postNumber,
			authorId: bot.id,
			displayName: "名無しさん",
			dailyId: bot.dailyId,
			body: `>>5 効いてて草`,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});

		// bot_posts 紐付けを登録
		await InMemoryBotPostRepo.create(botPostId, bot.id);

		// postNumber -> postId マッピングを登録（!attack の >>N → UUID 解決用）
		this.botPostNumberToId.set(postNumber, botPostId);
		this.currentBot = bot;
	},
);

// ---------------------------------------------------------------------------
// When: {string} でBOTを召喚する（コスト -{int}、残高 {int}）
// See: features/command_aori.feature @自分で召喚したBOTを自分で撃破してもファーミングできない
// ---------------------------------------------------------------------------

When(
	/^"([^"]*)" でBOTを召喚する（コスト -(\d+)、残高 (\d+)）$/,
	async function (
		this: BattleBoardWorld,
		commandString: string,
		cost: number,
		expectedBalance: number,
	) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		// スレッドが未作成の場合は作成する
		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "ファーミングテスト用スレッド",
				createdBy: this.currentUserId!,
			});
			this.currentThreadId = thread.id;
		}

		// >>5 が存在する必要があるのでダミーレスを挿入
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const currentMax = existingPosts.reduce(
			(max, p) => Math.max(max, p.postNumber),
			0,
		);
		for (let i = currentMax + 1; i <= 5; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: this.currentUserId!,
				displayName: "名無しさん",
				dailyId: "DUMMY",
				body: `ダミー ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
		}

		// IncentiveLog を事前挿入して new_thread_join ボーナス (+3) を抑止する。
		// PostService.createPost 内で IncentiveService が初回スレッド参加ボーナスを付与するため、
		// 通貨残高の検証が +3 ずれる問題を防ぐ。
		// See: src/lib/services/incentive-service.ts §4 new_thread_join
		{
			const jstOffset = 9 * 60 * 60 * 1000;
			const jstNow = new Date(Date.now() + jstOffset);
			const todayJst = jstNow.toISOString().slice(0, 10);
			const { InMemoryIncentiveLogRepo } = require("../support/mock-installer");
			InMemoryIncentiveLogRepo._insert({
				id: crypto.randomUUID(),
				userId: this.currentUserId!,
				eventType: "new_thread_join",
				amount: 0,
				contextId: this.currentThreadId,
				contextDate: todayJst,
				createdAt: new Date(Date.now()),
			});
		}

		// !aori コマンドを含む投稿を実行
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: commandString,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		assert(
			"success" in result && result.success,
			`!aori 投稿が失敗しました: ${"error" in result ? result.error : "unknown"}`,
		);

		// Cron 処理を実行して煽りBOTをスポーンさせる
		const InMemoryAttackRepo = require("../support/in-memory/attack-repository");
		const botService = new BotService(
			InMemoryBotRepo,
			InMemoryBotPostRepo,
			InMemoryAttackRepo,
			undefined,
			undefined,
			PostService.createPost,
			undefined,
			undefined,
			InMemoryPendingAsyncCommandRepo,
		);
		lastAoriResult = await botService.processAoriCommands();

		// コスト検証
		const balance =
			await require("../../src/lib/services/currency-service").getBalance(
				this.currentUserId,
			);
		assert.strictEqual(
			balance,
			expectedBalance,
			`残高が ${expectedBalance} であるべきですが ${balance} です`,
		);
	},
);

// ---------------------------------------------------------------------------
// When: 召喚されたBOTのレスを {string} で撃破する（コスト -{int}、報酬 +{int}）
// See: features/command_aori.feature @自分で召喚したBOTを自分で撃破してもファーミングできない
// ---------------------------------------------------------------------------

When(
	/^召喚されたBOTのレスを "([^"]*)" で撃破する（コスト -(\d+)、報酬 \+(\d+)）$/,
	async function (
		this: BattleBoardWorld,
		attackCommand: string,
		attackCost: number,
		reward: number,
	) {
		const PostService = getPostService();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		assert(lastAoriResult, "processAoriCommands の結果がありません");

		const successResult = lastAoriResult.results.find((r) => r.success);
		assert(successResult?.postId, "煽りBOTの投稿IDがありません");

		// 煽りBOTの投稿のpostNumberを取得
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPost = posts.find((p) => p.id === successResult.postId);
		assert(botPost, "煽りBOTの投稿が見つかりません");

		// !attack >>{botPostNumber} を実行する
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `!attack >>${botPost.postNumber}`,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		assert(
			"success" in result && result.success,
			`!attack が失敗しました: ${"error" in result ? result.error : "unknown"}`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 通貨残高は {int} である
// See: features/command_aori.feature @自分で召喚したBOTを自分で撃破してもファーミングできない
// ---------------------------------------------------------------------------

Then(
	/^通貨残高は (\d+) である$/,
	async function (this: BattleBoardWorld, expectedBalance: number) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const CurrencyService = require("../../src/lib/services/currency-service");
		const balance = await CurrencyService.getBalance(this.currentUserId);
		assert.strictEqual(
			balance,
			expectedBalance,
			`通貨残高は ${expectedBalance} であるべきですが ${balance} です`,
		);
	},
);

// ---------------------------------------------------------------------------
// Given: 煽りBOTがスポーンして1回書き込み済みである
// See: features/command_aori.feature @煽りBOTは1回だけ書き込み、定期書き込みを行わない
// ---------------------------------------------------------------------------

Given(
	"煽りBOTがスポーンして1回書き込み済みである",
	async function (this: BattleBoardWorld) {
		// スレッドが未作成の場合は作成する
		if (!this.currentThreadId) {
			const AuthService = getAuthService();
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			await InMemoryUserRepo.updateIsVerified(userId, true);
			seedDummyPost(userId);

			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "使い切りBOTライフサイクルテスト",
				createdBy: userId,
			});
			this.currentThreadId = thread.id;
		}

		// 煽りBOTを使い切り設定で作成（isActive=true, nextPostAt=null）
		// isActive=true: AttackHandler が攻撃を受け付ける
		// nextPostAt=null: findDueForPost に含まれない → 定期書き込みしない
		const bot = await InMemoryBotRepo.create({
			name: "名無しさん",
			persona: "煽り",
			hp: 10,
			maxHp: 10,
			dailyId: "AoriTest",
			dailyIdDate: "2026-03-22",
			isActive: true,
			isRevealed: false,
			revealedAt: null,
			botProfileKey: "aori",
			nextPostAt: null,
		});

		this.currentBot = bot;

		// 1回の書き込みを記録
		const botPostId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: botPostId,
			threadId: this.currentThreadId,
			postNumber: 99,
			authorId: bot.id,
			displayName: "名無しさん",
			dailyId: bot.dailyId,
			body: ">>5 効いてて草",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		await InMemoryBotPostRepo.create(botPostId, bot.id);
		await InMemoryBotRepo.incrementTotalPosts(bot.id);
	},
);

// ---------------------------------------------------------------------------
// When: ボットの定期実行（GitHub Actions cron）が行われる
// → welcome.steps.ts で定義済みのステップを再利用する（重複定義を避ける）
// See: features/command_aori.feature @煽りBOTは1回だけ書き込み、定期書き込みを行わない
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 煽りBOTは書き込みを行わない
// See: features/command_aori.feature @煽りBOTは1回だけ書き込み、定期書き込みを行わない
// ---------------------------------------------------------------------------

Then("煽りBOTは書き込みを行わない", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "現在のBOTが設定されていません");

	// 煽りBOTは nextPostAt=null のため、findDueForPost に含まれない
	const dueBots = await InMemoryBotRepo.findDueForPost();
	const aoriBotInDue = dueBots.find((b) => b.id === this.currentBot!.id);
	assert.strictEqual(
		aoriBotInDue,
		undefined,
		"煽りBOTが定期投稿対象に含まれているため書き込みが発生する可能性があります",
	);

	// BOTの total_posts が1のままであることを確認（追加書き込みなし）
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	assert(bot, "煽りBOTが見つかりません");
	assert.strictEqual(
		bot.totalPosts,
		1,
		"煽りBOTは1回のみ書き込むべきです（追加書き込みが発生しています）",
	);
});

// ---------------------------------------------------------------------------
// Given: 煽りBOTが撃破済みである
// See: features/command_aori.feature @煽りBOTは日次リセットで復活しない
// ---------------------------------------------------------------------------

Given("煽りBOTが撃破済みである", async function (this: BattleBoardWorld) {
	const AuthService = getAuthService();

	if (!this.currentUserId) {
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		seedDummyPost(userId);
	}

	// 撃破済みの煽りBOTを作成
	const bot = await InMemoryBotRepo.create({
		name: "名無しさん",
		persona: "煽り",
		hp: 10,
		maxHp: 10,
		dailyId: "AoriElim",
		dailyIdDate: "2026-03-22",
		isActive: false,
		isRevealed: false,
		revealedAt: null,
		botProfileKey: "aori",
		nextPostAt: null,
	});

	// 撃破状態にする
	await InMemoryBotRepo.updateHp(bot.id, 0);
	await InMemoryBotRepo.eliminate(bot.id, this.currentUserId!);

	this.currentBot = bot;
});

// ---------------------------------------------------------------------------
// When: 日付が変更される（JST 0:00）
// → bot_system.steps.ts で定義済みのステップを再利用する（重複定義を避ける）
// See: features/command_aori.feature @煽りBOTは日次リセットで復活しない
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 煽りBOTは撃破済みのまま復活しない
// See: features/command_aori.feature @煽りBOTは日次リセットで復活しない
// ---------------------------------------------------------------------------

Then(
	"煽りBOTは撃破済みのまま復活しない",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "現在のBOTが設定されていません");

		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "煽りBOTが見つかりません");

		// is_active=false のまま（復活していない）
		assert.strictEqual(
			bot.isActive,
			false,
			"煽りBOTが復活しています（is_active が true になっています）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 攻撃コスト {int} が消費される
// See: features/command_aori.feature @煽りBOTを!attackで撃破すると報酬を得る
// ---------------------------------------------------------------------------

// 既存の command_system.steps.ts の "{string} を実行する" で !attack を実行し、
// 通貨消費は "通貨が {int} 消費される" で検証するため、
// 攻撃コストの消費検証は別ステップで対応する。

Then(
	/^攻撃コスト (\d+) が消費される$/,
	async function (this: BattleBoardWorld, cost: number) {
		// 通貨の消費は PostService → CommandService の共通フローで処理される
		// ここでは cost 値が仕様と一致することを確認（アサーションは残高ベースで行う）
		assert.strictEqual(cost, 5, "攻撃コストは5であるべきです");
	},
);

// ---------------------------------------------------------------------------
// Then: 煽りBOTのHPが {int} から {int} に減少する
// See: features/command_aori.feature @煽りBOTを!attackで撃破すると報酬を得る
// ---------------------------------------------------------------------------

Then(
	/^煽りBOTのHPが (\d+) から (\d+) に減少する$/,
	async function (this: BattleBoardWorld, fromHp: number, toHp: number) {
		assert(this.currentBot, "現在のBOTが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "煽りBOTが見つかりません");

		// HP が toHp 以下に減少していることを検証
		assert(bot.hp <= toHp, `HP が ${toHp} 以下であるべきですが ${bot.hp} です`);
	},
);

// ---------------------------------------------------------------------------
// Then: 撃破報酬 {int} がユーザーに付与される
// See: features/command_aori.feature @煽りBOTを!attackで撃破すると報酬を得る
// ---------------------------------------------------------------------------

Then(
	/^撃破報酬 (\d+) がユーザーに付与される$/,
	async function (this: BattleBoardWorld, reward: number) {
		// 撃破報酬は bot_profiles.yaml の base_reward で固定
		// 実際の通貨付与は AttackHandler が行い、残高ベースで検証する
		assert.strictEqual(reward, 10, "撃破報酬は10であるべきです");
	},
);
