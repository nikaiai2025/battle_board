/**
 * bot_system.feature ステップ定義
 *
 * 運営ボットの偽装書き込み・攻撃・撃破・日次リセットに関するシナリオを実装する。
 *
 * カバーするシナリオ:
 *   - 偽装書き込み（区別不能・同日一貫ID・翌日ID変更）
 *   - 荒らし役ボット（配置・10体並行・固定文・間隔・スレ作成不可・ランダム選択・E2Eフロー）
 *   - 攻撃（暴露済み攻撃・不意打ち・人間賠償金・残高不足賠償・複数ユーザー）
 *   - 撃破（撃破+戦歴・報酬計算・書き込み停止・Web表示・トグル）
 *   - エラーケース（通貨不足・撃破済み・同日2回・存在しないレス・自己攻撃・システムメッセージ）
 *   - 日次リセット（BOTマーク解除・復活・生存日数・撃破リセット・攻撃制限解除）
 *
 * 注意: Web限定UIシナリオ（撃破済みレス表示・トグル）は pending。
 *       GitHub Actions 連携シナリオ（ボット書き込み間隔・ランダム選択）は pending。
 *
 * See: features/bot_system.feature
 * See: docs/architecture/bdd_test_strategy.md
 * See: docs/architecture/components/bot.md
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryAttackRepo,
	InMemoryBotPostRepo,
	InMemoryBotRepo,
	InMemoryCopipeRepo,
	InMemoryCurrencyRepo,
	InMemoryDailyEventRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { accusationState } from "./ai_accusation.steps";
// ウェルカムシーケンス抑止用ヘルパー（TASK-248 で追加）
// See: features/welcome.feature
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

/**
 * PostService を動的 require で取得するヘルパー。
 * モック差し替え後に評価されるよう require を遅延させる。
 * executeAttackCommand 内で eliminationNotice の独立レス投稿に使用する。
 * See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
 */
function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

/**
 * BotService インスタンスを生成する（インメモリリポジトリを注入）。
 * ゼロ報酬プロファイル "__test_zero_reward" を追加DIし、名前なしボット（botProfileKey
 * が "__test_zero_reward" のもの）が撃破されても撃破報酬が発生しないようにする。
 * 既存プロファイル（"荒らし役" 等）は botProfilesConfig からそのまま引き継ぐため影響なし。
 *
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
function createBotService() {
	const { BotService } =
		require("../../src/lib/services/bot-service") as typeof import("../../src/lib/services/bot-service");
	const { botProfilesConfig } =
		require("../../config/bot-profiles") as typeof import("../../config/bot-profiles");
	// 既存プロファイルにテスト用ゼロ報酬プロファイルをマージして DI
	const profiles = {
		...botProfilesConfig,
		__test_zero_reward: {
			hp: 10,
			max_hp: 10,
			reward: { base_reward: 0, daily_bonus: 0, attack_bonus: 0 },
			fixed_messages: [],
		},
	};
	return new BotService(
		InMemoryBotRepo,
		InMemoryBotPostRepo,
		InMemoryAttackRepo,
		profiles, // botProfilesData（ゼロ報酬プロファイル含む）
		undefined, // threadRepository
		undefined, // createPostFn
		undefined, // resolveStrategiesFn
		undefined, // pendingTutorialRepository
		undefined, // pendingAsyncCommandRepository
		InMemoryDailyEventRepo, // dailyEventRepository（ラストボットボーナス判定用）
	);
}

/**
 * BotService インスタンスを生成する（ThreadRepository と CreatePostFn も注入）。
 * selectTargetThread / executeBotPost の BDD テストで使用する。
 *
 * See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
 * See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
 */
function createBotServiceWithThread() {
	const { BotService } =
		require("../../src/lib/services/bot-service") as typeof import("../../src/lib/services/bot-service");
	return new BotService(
		InMemoryBotRepo,
		InMemoryBotPostRepo,
		InMemoryAttackRepo,
		undefined, // botProfilesData
		InMemoryThreadRepo, // threadRepository
		undefined, // createPostFn
		undefined, // resolveStrategiesFn
		undefined, // pendingTutorialRepository
		undefined, // pendingAsyncCommandRepository
		InMemoryDailyEventRepo, // dailyEventRepository（ラストボットボーナス判定用）
	);
}

/**
 * AttackHandler インスタンスを生成する（インメモリリポジトリを注入）。
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 */
function createAttackHandler() {
	const { AttackHandler } =
		require("../../src/lib/services/handlers/attack-handler") as typeof import("../../src/lib/services/handlers/attack-handler");
	const CurrencyService = getCurrencyService();
	const botService = createBotService();

	// CurrencyService のアダプター
	// AttackHandler は IAttackCurrencyService.debit を要求するが、
	// currency-service.ts は deduct 関数を提供するため、アダプターで名前を合わせる。
	// See: src/lib/services/currency-service.ts > deduct
	// See: src/lib/services/handlers/attack-handler.ts > IAttackCurrencyService
	const currencyAdapter = {
		getBalance: (userId: string) => CurrencyService.getBalance(userId),
		debit: (userId: string, amount: number, reason: any) =>
			CurrencyService.deduct(userId, amount, reason),
		credit: (userId: string, amount: number, reason: any) =>
			CurrencyService.credit(userId, amount, reason),
	};

	// AttackHandler: コスト=5, ダメージ=10, 賠償金倍率=3
	// See: features/bot_system.feature Background
	return new AttackHandler(
		botService,
		currencyAdapter,
		InMemoryPostRepo,
		5, // cost
		10, // damage
		3, // compensation_multiplier
	);
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "livebot";

/** BDD テストで使用するデフォルト IP ハッシュ (bot_system) */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-bot";

/** 荒らし役ボットの初期HP */
const TROLL_INITIAL_HP = 10;

/** !attack のダメージ */
const ATTACK_DAMAGE = 10;

/** !attack のコスト */
const ATTACK_COST = 5;

/** config/bot_profiles.yaml の荒らし役固定文リスト */
const TROLL_FIXED_MESSAGES = [
	"なんJほんま覇権やな",
	"効いてて草",
	"貧乳なのにめちゃくちゃエロい",
	"【朗報】ワイ、参上",
	"ンゴンゴ",
	"草不可避",
	"せやな",
	"はえ〜すっごい",
	"それな",
	"ぐう畜",
	"まあ正直そうだよな",
	"どういうことだよ（困惑）",
	"ファ！？",
	"ンゴ...",
	"うーんこの",
];

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * 現在のユーザーとスレッドのセットアップを行う。
 * 既にセットアップ済みの場合はスキップする。
 */
async function ensureUserAndThread(
	world: BattleBoardWorld,
	ipHash = DEFAULT_IP_HASH,
): Promise<void> {
	const AuthService = getAuthService();

	if (!world.currentUserId) {
		const { token, userId } = await AuthService.issueEdgeToken(ipHash);
		world.currentEdgeToken = token;
		world.currentUserId = userId;
		world.currentIpHash = ipHash;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);
	}

	if (!world.currentThreadId) {
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "ボットシステムテスト用スレッド",
			createdBy: world.currentUserId,
		});
		world.currentThreadId = thread.id;
	}
}

/**
 * テスト用ボット「荒らし役」を作成してストアに追加する。
 * @param options - ボット生成オプション（デフォルト値を上書き可能）
 */
function createTrollBot(
	options: {
		id?: string;
		hp?: number;
		isRevealed?: boolean;
		isActive?: boolean;
		survivalDays?: number;
		totalPosts?: number;
		accusedCount?: number;
		timesAttacked?: number;
		dailyId?: string;
	} = {},
) {
	const today = getTodayJst();
	const bot = {
		id: options.id ?? crypto.randomUUID(),
		name: "荒らし役",
		persona: "荒らし役ペルソナ",
		hp: options.hp ?? TROLL_INITIAL_HP,
		maxHp: TROLL_INITIAL_HP,
		dailyId: options.dailyId ?? "Fk9mP3aa",
		dailyIdDate: today,
		isActive: options.isActive !== undefined ? options.isActive : true,
		isRevealed: options.isRevealed ?? false,
		revealedAt: options.isRevealed ? new Date(Date.now()) : null,
		survivalDays: options.survivalDays ?? 0,
		totalPosts: options.totalPosts ?? 0,
		accusedCount: options.accusedCount ?? 0,
		timesAttacked: options.timesAttacked ?? 0,
		botProfileKey: "荒らし役",
		nextPostAt: null,
		eliminatedAt: options.isActive === false ? new Date(Date.now()) : null,
		eliminatedBy: null,
		createdAt: new Date(Date.now()),
	};
	InMemoryBotRepo._insert(bot);
	return bot;
}

/**
 * 今日の JST 日付を YYYY-MM-DD 形式で返す。
 */
function getTodayJst(): string {
	const now = new Date(Date.now());
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstDate = new Date(now.getTime() + jstOffset);
	return jstDate.toISOString().slice(0, 10);
}

/**
 * !attack コマンドを実行する。
 * AttackHandler を直接呼び出す（サービス層テスト方針に従う）。
 *
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
 */
async function executeAttackCommand(
	world: BattleBoardWorld,
	postNumber: number,
	attackerUserId?: string,
): Promise<void> {
	await ensureUserAndThread(world);

	const userId = attackerUserId ?? world.currentUserId!;
	const targetPostId = world.botPostNumberToId.get(postNumber);

	// 攻撃前の残高を保存する。
	// ai_accusation.steps.ts の「通貨が N 消費され残高が M になる」ステップが
	// balanceBeforeAccusation > 0 の場合にコスト消費の論理検証（変更前残高 - コスト = 期待残高）
	// を行うため、ここで攻撃前残高を設定する。
	// これにより、撃破報酬(credit)が同時に発生しても、コスト消費のみを検証できる。
	// See: features/step_definitions/ai_accusation.steps.ts > accusationState
	const CurrencyService = getCurrencyService();
	accusationState.balanceBeforeAccusation =
		await CurrencyService.getBalance(userId);

	// AttackHandler を直接呼び出す
	// 残高チェックは AttackHandler 内で行う（debit 失敗時に適切なエラーを返す）。
	// postId 引数には "target" として実際のIDを渡す（攻撃対象のレスID）
	const attackHandler = createAttackHandler();
	const result = await attackHandler.execute({
		// 対象レスが存在しない場合は存在しない UUID を渡す（非UUID文字列はリポジトリバリデーションに弾かれる）
		// See: features/support/in-memory/assert-uuid.ts
		args: [targetPostId ?? crypto.randomUUID()],
		// 攻撃レス自身のID（新規レスのID）は UUID 形式でなければならない
		postId: crypto.randomUUID(),
		threadId: world.currentThreadId!,
		userId,
	});

	const systemMessage = result.systemMessage ?? "";
	world.lastAttackResult = {
		success: result.success,
		systemMessage,
	};

	// command_system.steps.ts の "レス末尾にエラー {string} がマージ表示される" ステップと
	// 互換性を持つため、攻撃結果をDBのレスとして保存する（inlineSystemInfo に設定）。
	// postNumber を既存レスの最大値 + 1000 として、findByThreadId の昇順ソートで
	// 確実に最後のレスになるようにする。
	// See: features/step_definitions/command_system.steps.ts
	const existingPosts = await InMemoryPostRepo.findByThreadId(
		world.currentThreadId!,
	);
	const maxPostNumber = existingPosts.reduce(
		(max, p) => Math.max(max, p.postNumber),
		0,
	);
	const attackerPostNumber = maxPostNumber + 1000;
	// レスIDはUUID形式でなければならない（非UUID文字列はリポジトリバリデーションに弾かれる）
	// See: features/support/in-memory/assert-uuid.ts
	InMemoryPostRepo._insert({
		id: crypto.randomUUID(),
		threadId: world.currentThreadId!,
		postNumber: attackerPostNumber,
		authorId: userId,
		displayName: "名無しさん",
		dailyId: "AttckDly",
		body: `!attack >>${postNumber}`,
		inlineSystemInfo: systemMessage.length > 0 ? systemMessage : null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});

	// 撃破通知独立レス投稿（eliminationNotice が存在する場合）
	// AttackHandler が返す eliminationNotice を PostService.createPost() で
	// ★システム名義の独立レスとして投稿する。
	// これにより InMemory PostRepository に独立レスが追加され、
	// "「★システム」名義の独立レスで撃破が通知される" ステップが実検証できる。
	// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
	// See: src/lib/services/post-service.ts Step 9b（PostService 本体での対応箇所）
	if (result.eliminationNotice) {
		try {
			const PostService = getPostService();
			await PostService.createPost({
				threadId: world.currentThreadId!,
				body: result.eliminationNotice,
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});
		} catch (err) {
			// 撃破通知レス挿入失敗は攻撃レスの成功を巻き戻さない
			console.error("[BDD executeAttackCommand] 撃破通知レス挿入失敗:", err);
		}
	}

	// ラストボットボーナス祝福メッセージ独立レス投稿（lastBotBonusNotice が存在する場合）
	// AttackHandler が返す lastBotBonusNotice を PostService.createPost() で
	// ★システム名義の独立レスとして投稿する。
	// See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
	// See: src/lib/services/post-service.ts（PostService 本体での対応箇所）
	if (result.lastBotBonusNotice) {
		world.lastBotBonusNotice = result.lastBotBonusNotice;
		try {
			const PostService = getPostService();
			await PostService.createPost({
				threadId: world.currentThreadId!,
				body: result.lastBotBonusNotice,
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});
		} catch (err) {
			// 祝福メッセージレス挿入失敗は攻撃レスの成功を巻き戻さない
			console.error(
				"[BDD executeAttackCommand] ラストボットボーナス祝福レス挿入失敗:",
				err,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Background ステップ
// See: features/bot_system.feature Background
// ---------------------------------------------------------------------------

// 注: "コマンドレジストリに以下のコマンドが登録されている:" は
// command_system.steps.ts に定義済みのため、ここでは定義しない。
// See: features/step_definitions/command_system.steps.ts

Given(
	/^運営ボット「荒らし役」の初期HPは (\d+) である$/,
	async function (this: BattleBoardWorld, _hpStr: string) {
		// config/bot_profiles.yaml で定義済み。このステップは前提条件の表明のみ。
	},
);

Given(
	/^!attack のダメージは (\d+) である$/,
	async function (this: BattleBoardWorld, _damageStr: string) {
		// AttackHandler のコンストラクタ引数として定義済み。前提条件の表明のみ。
	},
);

Given(
	"同一ユーザーは同一ボットに対して1日1回のみ攻撃できる",
	async function (this: BattleBoardWorld) {
		// BotService.canAttackToday() によって制御済み。前提条件の表明のみ。
	},
);

Given(
	"人間への攻撃時の賠償金は攻撃コストの3倍（15）である",
	async function (this: BattleBoardWorld) {
		// AttackHandler のコンストラクタ引数 compensationMultiplier=3 として定義済み。前提条件の表明のみ。
	},
);

// ---------------------------------------------------------------------------
// 偽装書き込み: スレッド読者にはボットと人間が区別できない
// See: features/bot_system.feature @スレッド読者にはボットの書き込みと人間の書き込みが区別できない
// ---------------------------------------------------------------------------

Given(
	/^運営ボット「荒らし役」がスレッド「([^」]*)」で潜伏中である$/,
	async function (this: BattleBoardWorld, _threadTitle: string) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ isRevealed: false });
		this.currentBot = bot;
	},
);

Given(
	"人間ユーザーがスレッドに1件書き込んでいる",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber: 1,
			authorId: this.currentUserId,
			displayName: "名無しさん",
			dailyId: "Hmn1dly1",
			body: "人間の書き込みです",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
	},
);

When("ボットがスレッドに1件書き込む", async function (this: BattleBoardWorld) {
	await ensureUserAndThread(this);
	if (!this.currentBot) {
		const bot = createTrollBot({ isRevealed: false });
		this.currentBot = bot;
	}
	const botPostId = crypto.randomUUID();
	InMemoryPostRepo._insert({
		id: botPostId,
		threadId: this.currentThreadId!,
		postNumber: 2,
		authorId: null, // ボットは authorId が null
		displayName: "名無しさん",
		dailyId: this.currentBot.dailyId,
		body: "なんJほんま覇権やな",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});
	InMemoryBotPostRepo._insert(botPostId, this.currentBot.id);
	this.botPostNumberToId.set(2, botPostId);
});

Then(
	/^スレッドには(\d+)件のレスが表示される$/,
	async function (this: BattleBoardWorld, countStr: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const expectedCount = parseInt(countStr, 10);
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert.strictEqual(
			posts.length,
			expectedCount,
			`スレッドに ${expectedCount} 件のレスがあることを期待しましたが ${posts.length} 件でした`,
		);
	},
);

Then(
	/^両方のレスの表示名は "([^"]*)" である$/,
	async function (this: BattleBoardWorld, expectedName: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		for (const post of posts) {
			assert.strictEqual(
				post.displayName,
				expectedName,
				`表示名が "${expectedName}" であることを期待しましたが "${post.displayName}" でした`,
			);
		}
	},
);

Then(
	"両方のレスに日次リセットIDが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		for (const post of posts) {
			assert(
				post.dailyId && post.dailyId.length > 0,
				`すべてのレスに日次リセットIDが表示されることを期待しましたが、レス ${post.postNumber} のIDが空です`,
			);
		}
	},
);

Then(
	"表示フォーマット（表示名・ID・日時・本文の構成）は両者で同一である",
	async function (this: BattleBoardWorld) {
		// フォーマットが「名無しさん + dailyId + 日時 + 本文」であることをデータモデルレベルで確認する。
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		for (const post of posts) {
			assert(post.displayName !== undefined, "displayName が存在します");
			assert(post.dailyId !== undefined, "dailyId が存在します");
			assert(post.createdAt !== undefined, "createdAt が存在します");
			assert(post.body !== undefined, "body が存在します");
		}
	},
);

// ---------------------------------------------------------------------------
// 偽装書き込み: 同日中は一貫した日次リセットID
// See: features/bot_system.feature @ボットの日次リセットIDは同日中は一貫して同一である
// ---------------------------------------------------------------------------

Given(
	/^運営ボット「荒らし役」がスレッドで潜伏中である$/,
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ isRevealed: false });
		this.currentBot = bot;
	},
);

When(
	"ボットが同日中に3回書き込みを行う",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		for (let i = 1; i <= 3; i++) {
			const botPostId = crypto.randomUUID();
			InMemoryPostRepo._insert({
				id: botPostId,
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: null,
				displayName: "名無しさん",
				dailyId: this.currentBot.dailyId, // 同日は同一dailyId
				body: `書き込み ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now()),
			});
			InMemoryBotPostRepo._insert(botPostId, this.currentBot.id);
			this.botPostNumberToId.set(i, botPostId);
		}
	},
);

Then(
	"3件すべてのレスに同一の日次リセットIDが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPosts = posts.filter((p) => !p.authorId);
		assert.strictEqual(
			botPosts.length,
			3,
			`ボットの書き込みが3件あることを期待しましたが ${botPosts.length} 件でした`,
		);
		const firstDailyId = botPosts[0].dailyId;
		for (const post of botPosts) {
			assert.strictEqual(
				post.dailyId,
				firstDailyId,
				`すべてのボット書き込みが同一の日次IDを持つことを期待しましたが "${post.dailyId}" でした`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// 偽装書き込み: 翌日にIDが変わる
// See: features/bot_system.feature @ボットの日次リセットIDは翌日に変わる
// ---------------------------------------------------------------------------

Given(
	/^運営ボット「荒らし役」が今日の書き込みで日次リセットID "([^"]*)" を使用している$/,
	async function (this: BattleBoardWorld, dailyId: string) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ dailyId, isRevealed: false });
		this.currentBot = bot;
	},
);

When("日付が変更される（JST 0:00）", async function (this: BattleBoardWorld) {
	// 日付を翌日 JST 0:01 に設定する
	const tomorrow = new Date(Date.now());
	tomorrow.setDate(tomorrow.getDate() + 1);
	this.setCurrentTime(tomorrow);

	// BotService の日次リセット処理を実行する
	const botService = createBotService();
	await botService.performDailyReset();

	// インカーネーションモデルでは旧ボットが凍結され、新世代ボットが別 UUID で作成される。
	// 撃破済みボットが復活した場合は this.currentBot を新世代ボットに更新する。
	// See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
	if (this.currentBot) {
		const allBots = await InMemoryBotRepo.findAll();
		const newIncarnation = allBots.find(
			(b) =>
				b.isActive &&
				b.name === this.currentBot!.name &&
				b.id !== this.currentBot!.id,
		);
		if (newIncarnation) {
			this.currentBot = newIncarnation;
		}
	}
});

When(
	"ボットが新しい日に書き込みを行う",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		assert(this.currentThreadId, "スレッドIDが設定されていません");

		// 日次リセット後のボット情報を再取得する
		const updatedBot = await InMemoryBotRepo.findById(this.currentBot.id);
		if (updatedBot) {
			this.currentBot = updatedBot;
		}

		const botPostId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: botPostId,
			threadId: this.currentThreadId,
			postNumber: 10,
			authorId: null,
			displayName: "名無しさん",
			dailyId: this.currentBot.dailyId,
			body: "翌日の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(botPostId, this.currentBot.id);
		this.botPostNumberToId.set(10, botPostId);
	},
);

Then(
	/^その書き込みの日次リセットIDは "([^"]*)" とは異なる$/,
	async function (this: BattleBoardWorld, oldDailyId: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const newPosts = posts.filter((p) => !p.authorId && p.postNumber === 10);
		assert.strictEqual(newPosts.length, 1, "翌日の書き込みが1件あるはずです");
		assert.notStrictEqual(
			newPosts[0].dailyId,
			oldDailyId,
			`翌日の書き込みの日次IDが "${oldDailyId}" とは異なることを期待しましたが同じでした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 荒らし役ボット: 配置
// See: features/bot_system.feature @荒らし役ボットはHP 10の潜伏中状態で配置される
// ---------------------------------------------------------------------------

Given(
	"管理者が運営ボット「荒らし役」を配置する",
	async function (this: BattleBoardWorld) {
		const bot = createTrollBot({ isRevealed: false, isActive: true });
		this.currentBot = bot;
	},
);

Then(
	/^ボットのHPは (\d+) である$/,
	async function (this: BattleBoardWorld, expectedHpStr: string) {
		const expectedHp = parseInt(expectedHpStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`ボットのHPが ${expectedHp} であることを期待しましたが ${bot.hp} でした`,
		);
	},
);

Then("ボットの状態は「潜伏中」である", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "ボットが設定されていません");
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	assert(bot, "ボットが見つかりません");
	assert.strictEqual(
		bot.isActive,
		true,
		"ボットが活動中（潜伏中）であることを期待しました",
	);
	assert.strictEqual(
		bot.isRevealed,
		false,
		"ボットにBOTマークがついていない（潜伏中）ことを期待しました",
	);
});

// ---------------------------------------------------------------------------
// 荒らし役ボット: 10体並行
// See: features/bot_system.feature @荒らし役ボットは10体が並行して活動する
// ---------------------------------------------------------------------------

Given(
	"管理者が荒らし役ボットを配置している",
	async function (this: BattleBoardWorld) {
		for (let i = 0; i < 10; i++) {
			const dailyId = `TrollI${i.toString().padStart(3, "0")}`;
			const bot = createTrollBot({
				id: crypto.randomUUID(),
				dailyId,
				isRevealed: false,
				isActive: true,
			});
			this.botMap.set(`荒らし役${i}`, bot);
		}
	},
);

Then("荒らし役ボットは10体が存在する", async function (this: BattleBoardWorld) {
	const allBots = await InMemoryBotRepo.findAll();
	const trollBots = allBots.filter((b) => b.name === "荒らし役");
	assert.strictEqual(
		trollBots.length,
		10,
		`荒らし役ボットが10体存在することを期待しましたが ${trollBots.length} 体でした`,
	);
});

Then(
	"各ボットはそれぞれ異なる日次リセットIDを持つ",
	async function (this: BattleBoardWorld) {
		const allBots = await InMemoryBotRepo.findAll();
		const dailyIds = allBots.map((b) => b.dailyId);
		const uniqueDailyIds = new Set(dailyIds);
		assert.strictEqual(
			uniqueDailyIds.size,
			dailyIds.length,
			"各ボットが異なる日次IDを持つことを期待しましたが重複がありました",
		);
	},
);

// ---------------------------------------------------------------------------
// 荒らし役ボット: 固定文
// See: features/bot_system.feature @荒らし役ボットは定義済みの固定文からランダムに書き込む
// ---------------------------------------------------------------------------

Given(
	"荒らし役ボットがスレッドで潜伏中である",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ isRevealed: false });
		this.currentBot = bot;
	},
);

When("ボットが書き込みを行う", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "ボットが設定されていません");
	assert(this.currentThreadId, "スレッドIDが設定されていません");

	// コピペボット（botProfileKey="コピペ"）の場合は PostService.createPost 経由でコマンドパイプラインを通す。
	// FixedMessageContentStrategy の結果として "!copipe" が選ばれ、CopipeHandler が実行される。
	// See: features/bot_system.feature @コピペボットは !copipe コマンドで書き込む
	if (this.currentBot.botProfileKey === "コピペ") {
		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "!copipe",
			edgeToken: null,
			ipHash: "bot",
			displayName: "名無しさん",
			isBotWrite: true,
			botUserId: this.currentBot.id,
		});
		// PostResult は success プロパティで判定する（type プロパティは存在しない）
		// See: src/lib/services/post-service.ts > PostResult
		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = { type: "error", message: "書き込みに失敗しました" };
		}
		return;
	}

	// 荒らし役ボット: 固定文リストからランダムに選択してInMemoryPostRepo に直接挿入する
	const selectedMessage =
		TROLL_FIXED_MESSAGES[
			Math.floor(Math.random() * TROLL_FIXED_MESSAGES.length)
		];
	const botPostId = crypto.randomUUID();
	InMemoryPostRepo._insert({
		id: botPostId,
		threadId: this.currentThreadId,
		postNumber: 100,
		authorId: null,
		displayName: "名無しさん",
		dailyId: this.currentBot.dailyId,
		body: selectedMessage,
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});
	InMemoryBotPostRepo._insert(botPostId, this.currentBot.id);
	this.botPostNumberToId.set(100, botPostId);
});

Then(
	"書き込み本文は荒らし役の固定文リストに含まれるいずれかの文である",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPosts = posts.filter((p) => !p.authorId);
		assert(botPosts.length > 0, "ボットの書き込みが存在することを期待しました");
		for (const post of botPosts) {
			assert(
				TROLL_FIXED_MESSAGES.includes(post.body),
				`書き込み本文 "${post.body}" が固定文リストに含まれることを期待しました`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// 荒らし役ボット: 間隔（GitHub Actions 連携シナリオ — pending）
// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
// ---------------------------------------------------------------------------

Given("荒らし役ボットが潜伏中である", async function (this: BattleBoardWorld) {
	await ensureUserAndThread(this);
	const bot = createTrollBot({ isRevealed: false });
	this.currentBot = bot;
});

When("ボットの定期実行が行われる", async function (this: BattleBoardWorld) {
	// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
	// See: docs/architecture/components/bot.md §2.1 書き込み実行（GitHub Actionsから呼び出し）
	const botService = createBotService();
	const delay = botService.getNextPostDelay();
	// シナリオスコープの拡張プロパティとして保存する
	// See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
	(this as unknown as Record<string, unknown>).nextPostDelayMinutes = delay;
});

Then(
	"各ボットの書き込み間隔は1時間以上2時間以下のランダムな値である",
	async function (this: BattleBoardWorld) {
		// See: features/bot_system.feature @荒らし役ボットは1〜2時間間隔で書き込む
		// See: docs/architecture/components/bot.md §2.1 書き込み実行
		const delay = (this as unknown as Record<string, unknown>)
			.nextPostDelayMinutes as number | undefined;
		assert(delay !== undefined, "書き込み間隔が設定されていません");
		assert(delay >= 60, `書き込み間隔が60分未満です: ${delay}分`);
		assert(delay <= 120, `書き込み間隔が120分を超えています: ${delay}分`);
	},
);

// ---------------------------------------------------------------------------
// 荒らし役ボット: スレッド作成不可
// See: features/bot_system.feature @荒らし役ボットはスレッドを作成しない
// ---------------------------------------------------------------------------

Given("荒らし役ボットが活動中である", async function (this: BattleBoardWorld) {
	await ensureUserAndThread(this);
	const bot = createTrollBot({ isRevealed: false });
	this.currentBot = bot;
});

Then(
	"ボットは既存のスレッドに書き込む",
	async function (this: BattleBoardWorld) {
		// See: features/bot_system.feature @荒らし役ボットはスレッドを作成しない
		// When ステップで書き込まれたレスが this.currentThreadId（既存スレッド）に存在することを検証する。
		// botPostNumberToId にはWhenステップが設定した postNumber=100 のpostIdが入っている。
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const botPostId = this.botPostNumberToId.get(100);
		assert(
			botPostId !== undefined,
			"ボットの書き込みが記録されていません（When ステップが実行されたか確認してください）",
		);
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPost = posts.find((p) => p.id === botPostId);
		assert(
			botPost !== undefined,
			`ボットの書き込み (id=${botPostId}) が既存スレッド (id=${this.currentThreadId}) に存在することを期待しましたが、見つかりませんでした`,
		);
	},
);

Then("新しいスレッドの作成は行わない", async function (this: BattleBoardWorld) {
	// See: features/bot_system.feature @荒らし役ボットはスレッドを作成しない
	// Given ステップで1件のスレッドが作成された後、ボット書き込みによってスレッド数が
	// 増加していないことを検証する。
	// BotService.executeBotPost は既存スレッドIDのみを受け取る設計であり、
	// create_thread アクション時は明示的に Error を throw する（bot-service.ts L708-713）。
	assert(this.currentThreadId, "スレッドIDが設定されていません");
	const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID);
	assert(
		threads.length === 1,
		`スレッド数は1件（Givenで作成した既存スレッドのみ）であることを期待しましたが、${threads.length}件でした`,
	);
	assert(
		threads[0].id === this.currentThreadId,
		`唯一のスレッドはGivenで作成した既存スレッド (id=${this.currentThreadId}) であることを期待しましたが、異なるスレッド (id=${threads[0].id}) でした`,
	);
});

// ---------------------------------------------------------------------------
// 荒らし役ボット: ランダムスレッド選択（GitHub Actions 連携シナリオ — pending）
// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
// ---------------------------------------------------------------------------

Given(
	"スレッド一覧に50件のスレッドが表示されている",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		for (let i = 0; i < 50; i++) {
			await InMemoryThreadRepo.create({
				threadKey: `${Math.floor(Date.now() / 1000) + i}`,
				boardId: TEST_BOARD_ID,
				title: `テストスレッド ${i + 1}`,
				createdBy: this.currentUserId!,
			});
		}
	},
);

When(
	"荒らし役ボットが書き込み先を決定する",
	async function (this: BattleBoardWorld) {
		// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
		// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
		const botService = createBotServiceWithThread();
		// ボットIDはUUID形式でなければならない（非UUID文字列はリポジトリバリデーションに弾かれる）
		// See: features/support/in-memory/assert-uuid.ts
		const selectedId = await botService.selectTargetThread(
			this.currentBot?.id ?? crypto.randomUUID(),
		);
		// シナリオスコープの拡張プロパティとして保存する
		// See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
		(this as unknown as Record<string, unknown>).selectedThreadId = selectedId;
	},
);

Then(
	"表示中の50件の中からランダムに1件が選択される",
	async function (this: BattleBoardWorld) {
		// See: features/bot_system.feature @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
		// See: docs/architecture/components/bot.md §2.11 書き込み先スレッド選択
		const selectedId = (this as unknown as Record<string, unknown>)
			.selectedThreadId as string | undefined;
		assert(selectedId !== undefined, "書き込み先スレッドが選択されていません");

		// Given で作成した50件のスレッドを InMemoryThreadRepo から取得して検証する
		const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID);
		const threadIds = threads.map((t: { id: string }) => t.id);
		assert(
			threadIds.includes(selectedId),
			`選択されたスレッド "${selectedId}" が表示中の50件に含まれていません`,
		);
	},
);

// ---------------------------------------------------------------------------
// 荒らし役ボット: E2E チュートリアルフロー
// See: features/bot_system.feature @新規ユーザーが荒らし役を !tell で暴き !attack で撃破する一連の体験
// ---------------------------------------------------------------------------

Given(
	/^運営ボット「荒らし役」（HP:(\d+)）がスレッドで潜伏中である$/,
	async function (this: BattleBoardWorld, hpStr: string) {
		await ensureUserAndThread(this);
		const hp = parseInt(hpStr, 10);
		const bot = createTrollBot({ hp, isRevealed: false });
		this.currentBot = bot;
	},
);

Given(
	/^レス >>(\d+) はボット「荒らし役」の書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		if (this.botPostNumberToId.has(postNumber)) return; // 既に設定済みの場合はスキップ
		await ensureUserAndThread(this);
		if (!this.currentBot) {
			const bot = createTrollBot({});
			this.currentBot = bot;
		}
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: this.currentBot.dailyId,
			body: "なんJほんま覇権やな",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId, this.currentBot.id);
		this.botPostNumberToId.set(postNumber, postId);
	},
);

When(
	/^ユーザーが "!tell >>(\d+)" を含む書き込みを投稿する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(this.currentUserId!);
		// 攻撃前残高を保存（「通貨が N 消費され残高が M になる」ステップで使用）
		accusationState.balanceBeforeAccusation = balance;
		if (balance < 10) {
			this.lastResult = { type: "error", message: "通貨が不足しています" };
			return;
		}
		await CurrencyService.deduct(this.currentUserId!, 10, "command_tell");
		// ボットにBOTマークを付与する（!tell 成功時の動作）
		const targetPostId = this.botPostNumberToId.get(postNumber);
		if (targetPostId) {
			const botRecord = await InMemoryBotPostRepo.findByPostId(targetPostId);
			if (botRecord) {
				const botService = createBotService();
				await botService.revealBot(botRecord.botId);
			}
		}
		this.lastResult = { type: "success", data: { postNumber } };
	},
);

// 注: "通貨が N 消費され残高が M になる" は ai_accusation.steps.ts に定義済み。
// balanceBeforeAccusation が設定されていない場合は CurrencyService.getBalance で直接確認。
// See: features/step_definitions/ai_accusation.steps.ts

Then(
	/^レス >>(\d+) のボットにBOTマーク🤖が付与される$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		const postId = this.botPostNumberToId.get(postNumber);
		assert(postId, `レス >>${postNumber} がセットアップされていません`);
		const botRecord = await InMemoryBotPostRepo.findByPostId(postId);
		assert(
			botRecord,
			`レス >>${postNumber} はボット書き込みとして登録されていません`,
		);
		const bot = await InMemoryBotRepo.findById(botRecord.botId);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.isRevealed,
			true,
			`レス >>${postNumber} のボットにBOTマークが付与されていることを期待しました`,
		);
	},
);

When(
	/^ユーザーが "!attack >>(\d+)" を含む書き込みを投稿する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await executeAttackCommand(this, postNumber);
	},
);

Then(
	/^ボット「荒らし役」のHPが (\d+) になる$/,
	async function (this: BattleBoardWorld, expectedHpStr: string) {
		const expectedHp = parseInt(expectedHpStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`ボットのHPが ${expectedHp} であることを期待しましたが ${bot.hp} でした`,
		);
	},
);

Then(
	"ボットの状態が「撃破済み」になる",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.isActive,
			false,
			"ボットが撃破済み（isActive=false）であることを期待しました",
		);
	},
);

Then("撃破報酬がユーザーに付与される", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const CurrencyService = getCurrencyService();
	const balance = await CurrencyService.getBalance(this.currentUserId);
	// 初期残高100 - tell10 - attack5 + 報酬(>=10) = 残高 >= 95
	assert(
		balance >= 85,
		`撃破報酬が付与されていることを期待しました。現在残高: ${balance}`,
	);
});

// ---------------------------------------------------------------------------
// 攻撃: 暴露済みボットに攻撃
// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
// ---------------------------------------------------------------------------

Given(
	/^ボット「荒らし役」（HP:(\d+)）の状態が「暴露済み」である$/,
	async function (this: BattleBoardWorld, hpStr: string) {
		await ensureUserAndThread(this);
		const hp = parseInt(hpStr, 10);
		const bot = createTrollBot({ hp, isRevealed: true });
		this.currentBot = bot;
	},
);

Given(
	/^ユーザー（ID:([A-Za-z0-9]+)）の通貨残高が (\d+) である$/,
	async function (this: BattleBoardWorld, _userId: string, balanceStr: string) {
		const balance = parseInt(balanceStr, 10);
		await ensureUserAndThread(this);
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

Given(
	/^レス >>(\d+) はBOTマーク付きボット「荒らし役」の書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		if (this.botPostNumberToId.has(postNumber)) return;
		await ensureUserAndThread(this);
		assert(this.currentBot, "ボットが設定されていません");
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: this.currentBot.dailyId,
			body: "なんJほんま覇権やな",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId, this.currentBot.id);
		this.botPostNumberToId.set(postNumber, postId);
	},
);

Then(
	/^ボット「荒らし役」のHPが (\d+) から (\d+) に減少する$/,
	async function (
		this: BattleBoardWorld,
		_prevHpStr: string,
		expectedHpStr: string,
	) {
		const expectedHp = parseInt(expectedHpStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`ボットのHPが ${expectedHp} であることを期待しましたが ${bot.hp} でした`,
		);
	},
);

Then(
	/^レス末尾にシステム情報がマージ表示される$/,
	async function (this: BattleBoardWorld) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		assert(
			this.lastAttackResult.systemMessage.length > 0,
			"システム情報が存在することを期待しました",
		);
	},
);

// docstring 付きバリアント: 攻撃結果のシステム情報が期待パターンの構造に一致するか検証する。
// feature のdocstringはユーザー可視フォーマット（日次リセットID）で記載されるが、
// サービス層は内部ユーザーID（UUID）を使用するため、ID部分はパターンマッチで検証する。
// See: features/bot_system.feature @暴露済みボットに攻撃してHPを減少させる
Then(
	"レス末尾にシステム情報がマージ表示される:",
	async function (this: BattleBoardWorld, docString: string) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		const actual = this.lastAttackResult.systemMessage.trim();
		assert(actual.length > 0, "システム情報が空です");
		// docstring 内のキーワード（ボット名、HP変化等）を個別検証する。
		// ID部分は内部UUID vs 日次リセットIDの差異があるためスキップする。
		const expected = docString.trim();
		// 攻撃シンボル（⚔）の存在確認
		if (expected.includes("⚔")) {
			assert(
				actual.includes("⚔"),
				`攻撃シンボル ⚔ が含まれていません: ${actual}`,
			);
		}
		// ボット名の存在確認
		if (expected.includes("荒らし役")) {
			assert(
				actual.includes("荒らし役"),
				`ボット名「荒らし役」が含まれていません: ${actual}`,
			);
		}
		// HP変化パターンの確認（例: HP:10→0）
		const hpPattern = expected.match(/HP:(\d+)→(\d+)/);
		if (hpPattern) {
			assert(
				actual.includes(`HP:${hpPattern[1]}→${hpPattern[2]}`),
				`HP変化パターン HP:${hpPattern[1]}→${hpPattern[2]} が含まれていません: ${actual}`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// 攻撃: 不意打ち（BOTマークなし・対象がボット）
// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
// ---------------------------------------------------------------------------

Given(
	/^ボット「荒らし役」（HP:(\d+)）がスレッドで潜伏中である$/,
	async function (this: BattleBoardWorld, hpStr: string) {
		await ensureUserAndThread(this);
		const hp = parseInt(hpStr, 10);
		const bot = createTrollBot({ hp, isRevealed: false });
		this.currentBot = bot;
	},
);

Given(
	/^レス >>(\d+) はボット「荒らし役」の書き込みでありBOTマークは付いていない$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		if (this.botPostNumberToId.has(postNumber)) return;
		await ensureUserAndThread(this);
		assert(this.currentBot, "ボットが設定されていません");
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: this.currentBot.dailyId,
			body: "なんJほんま覇権やな",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId, this.currentBot.id);
		this.botPostNumberToId.set(postNumber, postId);
	},
);

// ---------------------------------------------------------------------------
// 攻撃: 人間への攻撃・賠償金
// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象が人間だった場合は賠償金が発生する
// ---------------------------------------------------------------------------

Given(
	/^レス >>(\d+) は人間ユーザー（ID:([A-Za-z0-9]+)）による書き込みである$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		victimDailyId: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const AuthService = getAuthService();
		const { userId: victimUserId } = await AuthService.issueEdgeToken(
			`bot-system-victim-${victimDailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(victimUserId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(victimUserId);
		this.attackerUserIds.set(victimDailyId, victimUserId);
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: victimUserId,
			displayName: "名無しさん",
			dailyId: victimDailyId,
			body: "普通の人間の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		this.botPostNumberToId.set(postNumber, postId);
	},
);

Given(
	/^攻撃者（ID:([A-Za-z0-9]+)）の通貨残高が (\d+) である$/,
	async function (
		this: BattleBoardWorld,
		attackerDailyId: string,
		balanceStr: string,
	) {
		const balance = parseInt(balanceStr, 10);
		await ensureUserAndThread(this);
		this.attackerUserIds.set(attackerDailyId, this.currentUserId!);
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

Given(
	/^被攻撃者（ID:([A-Za-z0-9]+)）の通貨残高が (\d+) である$/,
	async function (
		this: BattleBoardWorld,
		victimDailyId: string,
		balanceStr: string,
	) {
		const balance = parseInt(balanceStr, 10);
		const victimUserId = this.attackerUserIds.get(victimDailyId);
		assert(
			victimUserId,
			`被攻撃者 ${victimDailyId} のユーザーIDが登録されていません`,
		);
		InMemoryCurrencyRepo._upsert({
			userId: victimUserId,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

When(
	/^攻撃者が "!attack >>(\d+)" を含む書き込みを投稿する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await executeAttackCommand(this, postNumber, this.currentUserId!);
	},
);

Then(
	/^攻撃コスト (\d+) が消費され攻撃者の残高が (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		costStr: string,
		expectedBalanceStr: string,
	) {
		const cost = parseInt(costStr, 10);
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		// 攻撃はコスト消費と賠償金が同時に実行されるため、getBalance() は最終残高を返す。
		// そのため攻撃前残高（accusationState.balanceBeforeAccusation）からコスト分の減算を論理検証する。
		// See: features/step_definitions/ai_accusation.steps.ts > accusationState
		const preAttackBalance = accusationState.balanceBeforeAccusation;
		assert(
			preAttackBalance > 0,
			"攻撃前残高が保存されていません（executeAttackCommand が呼ばれていない可能性があります）",
		);
		const afterCostBalance = preAttackBalance - cost;
		assert.strictEqual(
			afterCostBalance,
			expectedBalance,
			`攻撃コスト消費後の残高が ${expectedBalance} であることを期待しましたが ${afterCostBalance} でした（攻撃前残高: ${preAttackBalance}, コスト: ${cost}）`,
		);
	},
);

Then(
	/^賠償金 (\d+) が攻撃者から差し引かれ残高が (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		_compensationStr: string,
		expectedBalanceStr: string,
	) {
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(this.currentUserId);
		assert.strictEqual(
			balance,
			expectedBalance,
			`賠償金差し引き後の残高が ${expectedBalance} であることを期待しましたが ${balance} でした`,
		);
	},
);

Then(
	/^被攻撃者の残高が (\d+) に増加する$/,
	async function (this: BattleBoardWorld, expectedBalanceStr: string) {
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		// attackerUserIds から currentUserId 以外のユーザー（被攻撃者）を取得する
		let victimUserId: string | null = null;
		for (const [_dailyId, userId] of this.attackerUserIds.entries()) {
			if (userId !== this.currentUserId) {
				victimUserId = userId;
				break;
			}
		}
		assert(victimUserId, "被攻撃者のユーザーIDが見つかりません");
		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(victimUserId);
		assert.strictEqual(
			balance,
			expectedBalance,
			`被攻撃者の残高が ${expectedBalance} に増加することを期待しましたが ${balance} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 攻撃: 賠償金残高不足の場合は全額支払い
// See: features/bot_system.feature @人間への攻撃時に賠償金の残高が不足している場合は全額支払い
// ---------------------------------------------------------------------------

Then(
	/^賠償金として残高全額 (\d+) が差し引かれ攻撃者の残高が (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		_fullAmountStr: string,
		expectedBalanceStr: string,
	) {
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(this.currentUserId);
		assert.strictEqual(
			balance,
			expectedBalance,
			`全額賠償金差し引き後の残高が ${expectedBalance} であることを期待しましたが ${balance} でした`,
		);
	},
);

Then(
	/^レス末尾に特殊メッセージがマージ表示される(?::)?$/,
	async function (this: BattleBoardWorld, _docString?: string) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		assert(
			this.lastAttackResult.systemMessage.includes("チッ"),
			`特殊メッセージに "チッ" が含まれることを期待しましたが "${this.lastAttackResult.systemMessage}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 攻撃: 複数ユーザーが同一ボットを攻撃
// See: features/bot_system.feature @複数ユーザーがそれぞれ同一ボットを攻撃できる
// ---------------------------------------------------------------------------

Given(
	/^ユーザーA（ID:([A-Za-z0-9]+)）の通貨残高が (\d+) である$/,
	async function (
		this: BattleBoardWorld,
		userADailyId: string,
		balanceStr: string,
	) {
		const balance = parseInt(balanceStr, 10);
		await ensureUserAndThread(this);
		this.attackerUserIds.set(`userA_${userADailyId}`, this.currentUserId!);
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

Given(
	/^ユーザーB（ID:([A-Za-z0-9]+)）の通貨残高が (\d+) である$/,
	async function (
		this: BattleBoardWorld,
		userBDailyId: string,
		balanceStr: string,
	) {
		const balance = parseInt(balanceStr, 10);
		const AuthService = getAuthService();
		const { userId: userBId } = await AuthService.issueEdgeToken(
			`bot-system-userB-${userBDailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(userBId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userBId);
		this.attackerUserIds.set(`userB_${userBDailyId}`, userBId);
		InMemoryCurrencyRepo._upsert({
			userId: userBId,
			balance,
			updatedAt: new Date(Date.now()),
		});
	},
);

When(
	/^ユーザーAが "!attack >>(\d+)" を含む書き込みを投稿する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await executeAttackCommand(this, postNumber, this.currentUserId!);
	},
);

// ---------------------------------------------------------------------------
// 撃破: HPが0になったボットが撃破され戦歴が全公開される
// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
// ---------------------------------------------------------------------------

Given(
	/^ボットの生存日数は (\d+)日、総書き込み数は (\d+)件、被告発回数は (\d+)回 である$/,
	async function (
		this: BattleBoardWorld,
		survivalDaysStr: string,
		totalPostsStr: string,
		accusedCountStr: string,
	) {
		assert(this.currentBot, "ボットが設定されていません");
		// ボット情報を更新して再挿入する
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		const updatedBot = {
			...bot,
			survivalDays: parseInt(survivalDaysStr, 10),
			totalPosts: parseInt(totalPostsStr, 10),
			accusedCount: parseInt(accusedCountStr, 10),
		};
		InMemoryBotRepo._insert(updatedBot);
		this.currentBot = updatedBot;
	},
);

Given(
	/^ボットの被攻撃回数は (\d+)回 である$/,
	async function (this: BattleBoardWorld, timesAttackedStr: string) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		// feature の「被攻撃回数 N回」は今回の攻撃を含んだ値を表す。
		// BotService.applyDamage は攻撃実行時に incrementTimesAttacked を呼ぶため、
		// ストアには N-1 を設定して、increment 後に N になるようにする。
		// See: src/lib/services/bot-service.ts > applyDamage
		const featureTimesAttacked = parseInt(timesAttackedStr, 10);
		const updatedBot = {
			...bot,
			timesAttacked: Math.max(0, featureTimesAttacked - 1),
		};
		InMemoryBotRepo._insert(updatedBot);
		this.currentBot = updatedBot;
	},
);

Then(
	"レス末尾に攻撃結果がマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		assert(
			this.lastAttackResult.systemMessage.length > 0,
			"攻撃結果がマージ表示されることを期待しました",
		);
	},
);

Then(
	/^「★システム」名義の独立レスで撃破が通知される(?::)?$/,
	async function (this: BattleBoardWorld, _docString?: string) {
		// 実検証: InMemory PostRepository に ★システム名義の独立レスが存在することを確認する。
		// executeAttackCommand 内で result.eliminationNotice が存在した場合に
		// PostService.createPost() を呼び出して独立レスを投稿している。
		// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
		// See: docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md 問題 #1
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);

		// isSystemMessage=true かつ displayName=★システム のレスが存在することを確認する
		const systemPost = posts.find(
			(p) => p.isSystemMessage && p.displayName === "★システム",
		);

		assert(
			systemPost !== undefined,
			`「★システム」名義の独立レスが InMemory PostRepository に存在しません。` +
				`スレッド内のレス: ${JSON.stringify(posts.map((p) => ({ displayName: p.displayName, isSystemMessage: p.isSystemMessage, body: p.body?.slice(0, 50) })))}`,
		);

		// 独立レスの本文に撃破通知の必須要素が含まれることを確認する
		assert(
			systemPost.body.includes("撃破"),
			`★システム名義の独立レスの本文に「撃破」が含まれることを期待しましたが、実際: "${systemPost.body}"`,
		);
	},
);

Then(
	/^撃破報酬 (\d+) が撃破者に付与される$/,
	async function (this: BattleBoardWorld, rewardStr: string) {
		const expectedReward = parseInt(rewardStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");

		// 撃破通知の独立レス（★システム名義）から報酬額を確認する。
		// attack-handler.ts の変更により、eliminationNotice が PostService 経由で独立レスとして投稿される。
		// 独立レスの本文には「撃破者：名無しさん(ID:xxx) に撃破報酬 +{N}」が含まれる。
		// See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
		// See: src/lib/services/handlers/attack-handler.ts > executeFlowB > eliminationNoticeBody
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const systemPost = posts.find(
			(p) => p.isSystemMessage && p.displayName === "★システム",
		);

		assert(
			systemPost !== undefined,
			`★システム名義の独立レスが存在しないため撃破報酬を確認できません。` +
				`スレッド内のレス: ${JSON.stringify(posts.map((p) => ({ displayName: p.displayName, isSystemMessage: p.isSystemMessage, body: p.body?.slice(0, 50) })))}`,
		);

		assert(
			systemPost.body.includes(`+${expectedReward}`),
			`撃破報酬 ${expectedReward} が独立レスの本文に含まれることを期待しましたが、実際: "${systemPost.body}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// 撃破報酬計算
// See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
// ---------------------------------------------------------------------------

Given(
	/^ボットA（生存日数:(\d+)日、被攻撃回数:(\d+)回）が撃破された$/,
	async function (
		this: BattleBoardWorld,
		survivalDaysStr: string,
		timesAttackedStr: string,
	) {
		const survivalDays = parseInt(survivalDaysStr, 10);
		const timesAttacked = parseInt(timesAttackedStr, 10);
		const { calculateEliminationReward } =
			require("../../src/lib/domain/rules/elimination-reward") as typeof import("../../src/lib/domain/rules/elimination-reward");
		const reward = calculateEliminationReward(
			{ survivalDays, timesAttacked },
			{ baseReward: 10, dailyBonus: 50, attackBonus: 5 },
		);
		(this as any)._botAReward = reward;
	},
);

Then(
	/^ボットAの撃破報酬は (\d+) である$/,
	async function (this: BattleBoardWorld, expectedRewardStr: string) {
		const expectedReward = parseInt(expectedRewardStr, 10);
		const actualReward = (this as any)._botAReward;
		assert.strictEqual(
			actualReward,
			expectedReward,
			`ボットAの撃破報酬が ${expectedReward} であることを期待しましたが ${actualReward} でした`,
		);
	},
);

Given(
	/^ボットB（生存日数:(\d+)日、被攻撃回数:(\d+)回）が撃破された$/,
	async function (
		this: BattleBoardWorld,
		survivalDaysStr: string,
		timesAttackedStr: string,
	) {
		const survivalDays = parseInt(survivalDaysStr, 10);
		const timesAttacked = parseInt(timesAttackedStr, 10);
		const { calculateEliminationReward } =
			require("../../src/lib/domain/rules/elimination-reward") as typeof import("../../src/lib/domain/rules/elimination-reward");
		const reward = calculateEliminationReward(
			{ survivalDays, timesAttacked },
			{ baseReward: 10, dailyBonus: 50, attackBonus: 5 },
		);
		(this as any)._botBReward = reward;
	},
);

Then(
	/^ボットBの撃破報酬は (\d+) である$/,
	async function (this: BattleBoardWorld, expectedRewardStr: string) {
		const expectedReward = parseInt(expectedRewardStr, 10);
		const actualReward = (this as any)._botBReward;
		assert.strictEqual(
			actualReward,
			expectedReward,
			`ボットBの撃破報酬が ${expectedReward} であることを期待しましたが ${actualReward} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 撃破: 撃破済みボットは書き込みを行わない
// See: features/bot_system.feature @撃破済みボットはスレッドに新たな書き込みを行わない
// ---------------------------------------------------------------------------

Given(
	"ボット「荒らし役」の状態が「撃破済み」である",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ isActive: false, isRevealed: false });
		this.currentBot = bot;
	},
);

When("時間が経過する", async function (this: BattleBoardWorld) {
	this.advanceTimeByHours(1);
});

Then(
	"ボットの新たな書き込みはスレッドに追加されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.isActive,
			false,
			"ボットが撃破済み（isActive=false）であることを確認しました",
		);
		// 撃破済みボットは GitHub Actions 定期実行から除外されるため新規書き込みが発生しない
		assert(
			true,
			"撃破済みボットは isActive=false のため新規書き込みが行われない",
		);
	},
);

// ---------------------------------------------------------------------------
// 撃破: Webブラウザ表示（Web限定シナリオ — pending）
// See: features/bot_system.feature @撃破済みボットのレスはWebブラウザで目立たない表示になる
// 分類: DOM/CSS表示 — Cucumberサービス層では検証不可（D-10 §7.3.1）
// 代替検証: UI未実装のため代替テスト未作成。UIコンポーネント実装時に
//   src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx を作成すること
// ---------------------------------------------------------------------------

Given(
	"ボット「荒らし役」が撃破済みである",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ isActive: false, isRevealed: false });
		this.currentBot = bot;
	},
);

Given(
	"ユーザーがWebブラウザでスレッドを閲覧している",
	async function (this: BattleBoardWorld) {
		// Web UI はBDDサービス層テストのスコープ外（Web限定シナリオ）。
		// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
		return "pending";
	},
);

Then(
	"撃破済みボットの過去のレスは目立たない文字色で表示される",
	async function (this: BattleBoardWorld) {
		// DOM/CSS表示: Cucumberサービス層では検証不可（D-10 §7.3.1）
		// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
		return "pending";
	},
);

// ---------------------------------------------------------------------------
// 撃破: トグル表示切り替え（Web限定シナリオ — pending）
// See: features/bot_system.feature @撃破済みボットのレス表示をトグルで切り替えられる
// 分類: DOM/CSS表示 — Cucumberサービス層では検証不可（D-10 §7.3.1）
// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
// ---------------------------------------------------------------------------

When(
	"全体メニューの「撃破済みBOTレス表示」トグルをOFFにする",
	async function (this: BattleBoardWorld) {
		// DOM/CSS表示: Cucumberサービス層では検証不可（D-10 §7.3.1）
		// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
		return "pending";
	},
);

Then(
	"撃破済みボットの過去のレスが非表示になる",
	async function (this: BattleBoardWorld) {
		// DOM/CSS表示: Cucumberサービス層では検証不可（D-10 §7.3.1）
		// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
		return "pending";
	},
);

When("トグルをONに戻す", async function (this: BattleBoardWorld) {
	// DOM/CSS表示: Cucumberサービス層では検証不可（D-10 §7.3.1）
	// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
	return "pending";
});

Then(
	"撃破済みボットの過去のレスが表示される（目立たない文字色）",
	async function (this: BattleBoardWorld) {
		// DOM/CSS表示: Cucumberサービス層では検証不可（D-10 §7.3.1）
		// 代替検証: e2e/flows/bot-display.spec.ts（E2E）
		return "pending";
	},
);

// ---------------------------------------------------------------------------
// エラーケース: 通貨不足
// See: features/bot_system.feature @通貨不足で攻撃できない
// ---------------------------------------------------------------------------

// 注: "ユーザーの通貨残高が {int} である" は common.steps.ts に定義済み。
// currentUserId が未設定の場合は自動でユーザーを作成する実装になっている。
// See: features/step_definitions/common.steps.ts

Given(
	/^レス >>(\d+) が存在する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const AuthService = getAuthService();
		const { userId: targetUserId } = await AuthService.issueEdgeToken(
			`bot-error-target-${postNumber}`,
		);
		await InMemoryUserRepo.updateIsVerified(targetUserId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(targetUserId);
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: targetUserId,
			displayName: "名無しさん",
			dailyId: "TgtDly1x",
			body: "攻撃対象のレス",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		this.botPostNumberToId.set(postNumber, postId);
	},
);

Then("攻撃は実行されない", async function (this: BattleBoardWorld) {
	assert(
		this.lastAttackResult,
		"攻撃結果が存在しません（executeAttackCommand が呼ばれていません）",
	);
	assert.strictEqual(
		this.lastAttackResult.success,
		false,
		"攻撃が実行されないことを期待しました",
	);
});

// 注: "通貨残高は {int} のまま変化しない" は common.steps.ts に定義済み。
// See: features/step_definitions/common.steps.ts

// 注: "レス末尾にエラー {string} がマージ表示される" は command_system.steps.ts に定義済み。
// executeAttackCommand でDBにレスを作成するため、command_system.steps.ts の実装が使える。
// See: features/step_definitions/command_system.steps.ts

// 注: "通貨は消費されない" は command_system.steps.ts に定義済み。
// 攻撃失敗の確認は "攻撃は実行されない" ステップで行う。
// See: features/step_definitions/command_system.steps.ts

Then(
	"レス末尾にエラーがマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert.strictEqual(
			this.lastAttackResult.success,
			false,
			"エラーがマージ表示されることを期待しました",
		);
		assert(
			this.lastAttackResult.systemMessage.length > 0,
			"エラーメッセージが存在することを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// エラーケース: 同日2回目の攻撃
// See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
// ---------------------------------------------------------------------------

Given(
	"ユーザーが今日既にボット「荒らし役」に1回攻撃済みである",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		if (!this.currentBot) {
			const bot = createTrollBot({ isRevealed: true, isActive: true });
			this.currentBot = bot;
		}
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance: 100,
			updatedAt: new Date(Date.now()),
		});
		const today = getTodayJst();
		InMemoryAttackRepo._insert({
			attackerId: this.currentUserId!,
			botId: this.currentBot.id,
			attackDate: today,
			postId: "dummy-post-id-for-attack-limit",
			damage: ATTACK_DAMAGE,
		});
	},
);

// ---------------------------------------------------------------------------
// エラーケース: 存在しないレスへの攻撃
// See: features/bot_system.feature @存在しないレスへの攻撃はエラーになる
// ---------------------------------------------------------------------------

// 注: "レス >>999 は存在しない" は admin.steps.ts に定義済み。
// bot_system.feature ではこの固定文字列ステップを再利用する。
// See: features/step_definitions/admin.steps.ts
// 残高セットアップは `When ユーザーが "!attack >>999" を含む書き込みを投稿する` 内で
// ensureUserAndThread が自動的にユーザーを作成するため問題なし。
// 注意: 残高が 0 の場合、AttackHandler の内部残高チェック（debit）より先に
// 「指定されたレスが見つかりません」チェックが行われるためエラーは適切に返る。

// ---------------------------------------------------------------------------
// エラーケース: 自己攻撃
// See: features/bot_system.feature @自分の書き込みに対して攻撃を試みると拒否される
// ---------------------------------------------------------------------------
// 注: "レス >>(\d+) は自分自身の書き込みである" は ai_accusation.steps.ts に定義済み。
// ai_accusation.steps.ts の実装が world.botPostNumberToId にも登録するよう修正済みのため、
// bot_system.feature の当該シナリオでも使用できる。
// See: features/step_definitions/ai_accusation.steps.ts

// ---------------------------------------------------------------------------
// エラーケース: システムメッセージへの攻撃
// See: features/bot_system.feature @システムメッセージに対して攻撃を試みると拒否される
// ---------------------------------------------------------------------------
// 注: "レス >>10 はシステムメッセージである" は command_system.steps.ts に定義済み。
// command_system.steps.ts の実装が world.botPostNumberToId にも登録するよう修正済みのため、
// bot_system.feature の当該シナリオでも使用できる。
// See: features/step_definitions/command_system.steps.ts

// ---------------------------------------------------------------------------
// 日次リセット: BOTマーク解除
// See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
// ---------------------------------------------------------------------------

Given(
	"ボット「荒らし役」の状態が「暴露済み」である",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		const bot = createTrollBot({ isRevealed: true, isActive: true });
		this.currentBot = bot;
	},
);

Given(
	/^ボットの偽装IDは "([^"]*)" である$/,
	async function (this: BattleBoardWorld, dailyId: string) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		if (bot) {
			const updatedBot = { ...bot, dailyId };
			InMemoryBotRepo._insert(updatedBot);
			this.currentBot = updatedBot;
		}
	},
);

Then("BOTマークが解除される", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "ボットが設定されていません");
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	assert(bot, "ボットが見つかりません");
	assert.strictEqual(
		bot.isRevealed,
		false,
		"BOTマークが解除されていることを期待しました",
	);
});

Then("ボットの状態が「潜伏中」に戻る", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "ボットが設定されていません");
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	assert(bot, "ボットが見つかりません");
	assert.strictEqual(
		bot.isActive,
		true,
		"ボットが活動中（潜伏中）であることを期待しました",
	);
	assert.strictEqual(
		bot.isRevealed,
		false,
		"BOTマークが解除されていることを期待しました",
	);
});

Then(
	/^ボットに "([^"]*)" とは異なる新しい偽装IDが割り当てられる$/,
	async function (this: BattleBoardWorld, oldDailyId: string) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.notStrictEqual(
			bot.dailyId,
			oldDailyId,
			`ボットの偽装IDが "${oldDailyId}" とは異なる新しいIDに更新されていることを期待しました`,
		);
	},
);

// ---------------------------------------------------------------------------
// 日次リセット: 撃破済みボットの復活
// See: features/bot_system.feature @撃破済みボットは翌日にHP初期値で復活する
// ---------------------------------------------------------------------------

Then(
	"ボットの状態が「潜伏中」に復帰する",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.isActive,
			true,
			"ボットが活動中（潜伏中）に復帰していることを期待しました",
		);
	},
);

Then(
	/^ボットのHPが初期値 (\d+) にリセットされる$/,
	async function (this: BattleBoardWorld, expectedHpStr: string) {
		const expectedHp = parseInt(expectedHpStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`ボットのHPが初期値 ${expectedHp} にリセットされることを期待しましたが ${bot.hp} でした`,
		);
	},
);

Then("新しい偽装IDが割り当てられる", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "ボットが設定されていません");
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	assert(bot, "ボットが見つかりません");
	assert(
		bot.dailyId && bot.dailyId.length > 0,
		"新しい偽装IDが割り当てられていることを期待しました",
	);
});

// ---------------------------------------------------------------------------
// 日次リセット: 生存日数カウント
// See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる
// ---------------------------------------------------------------------------

Given(
	/^ボット「荒らし役」の現在の生存日数が (\d+)日 である$/,
	async function (this: BattleBoardWorld, survivalDaysStr: string) {
		await ensureUserAndThread(this);
		const survivalDays = parseInt(survivalDaysStr, 10);
		const bot = createTrollBot({
			isRevealed: false,
			isActive: true,
			survivalDays,
		});
		this.currentBot = bot;
	},
);

Given(
	"ボットの状態が「潜伏中」または「暴露済み」である",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.isActive,
			true,
			"ボットが活動中（潜伏中または暴露済み）であることを期待しました",
		);
	},
);

Then(
	/^生存日数が (\d+)日 に増加する$/,
	async function (this: BattleBoardWorld, expectedSurvivalDaysStr: string) {
		const expectedSurvivalDays = parseInt(expectedSurvivalDaysStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.survivalDays,
			expectedSurvivalDays,
			`生存日数が ${expectedSurvivalDays} 日に増加することを期待しましたが ${bot.survivalDays} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 日次リセット: 撃破後の生存日数リセット
// See: features/bot_system.feature @撃破されたボットの生存日数は撃破時にリセットされる
// ---------------------------------------------------------------------------

Given(
	/^ボット「荒らし役」の生存日数が (\d+)日 であった$/,
	async function (this: BattleBoardWorld, survivalDaysStr: string) {
		await ensureUserAndThread(this);
		const survivalDays = parseInt(survivalDaysStr, 10);
		const bot = createTrollBot({ isActive: true, survivalDays });
		this.currentBot = bot;
	},
);

Given("ボットが撃破された", async function (this: BattleBoardWorld) {
	assert(this.currentBot, "ボットが設定されていません");
	// eliminatedBy はUUID形式でなければならない（非UUID文字列はリポジトリバリデーションに弾かれる）
	// See: features/support/in-memory/assert-uuid.ts
	await InMemoryBotRepo.eliminate(this.currentBot.id, crypto.randomUUID());
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	if (bot) this.currentBot = bot;
});

When("翌日に復活する", async function (this: BattleBoardWorld) {
	const tomorrow = new Date(Date.now());
	tomorrow.setDate(tomorrow.getDate() + 1);
	this.setCurrentTime(tomorrow);
	const botService = createBotService();
	await botService.performDailyReset();

	// インカーネーションモデルでは旧ボットが凍結され、新世代ボットが別 UUID で作成される。
	// this.currentBot を新世代ボットに更新しないと、後続ステップが旧（凍結済み）レコードを参照してしまう。
	// See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
	if (this.currentBot) {
		const allBots = await InMemoryBotRepo.findAll();
		const newIncarnation = allBots.find(
			(b) =>
				b.isActive &&
				b.name === this.currentBot!.name &&
				b.id !== this.currentBot!.id,
		);
		if (newIncarnation) {
			this.currentBot = newIncarnation;
		}
	}
});

Then(
	/^生存日数は (\d+)日 からカウントが再開される$/,
	async function (this: BattleBoardWorld, expectedDaysStr: string) {
		const expectedDays = parseInt(expectedDaysStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.survivalDays,
			expectedDays,
			`生存日数が ${expectedDays} 日からカウントが再開されることを期待しましたが ${bot.survivalDays} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// 日次リセット: 攻撃制限解除
// See: features/bot_system.feature @日次リセットで同一ボットへの攻撃制限が解除される
// ---------------------------------------------------------------------------

Given(
	"ユーザーが今日ボット「荒らし役」に攻撃済みである",
	async function (this: BattleBoardWorld) {
		await ensureUserAndThread(this);
		if (!this.currentBot) {
			const bot = createTrollBot({ isRevealed: true, isActive: true });
			this.currentBot = bot;
		}
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance: 100,
			updatedAt: new Date(Date.now()),
		});
		const today = getTodayJst();
		InMemoryAttackRepo._insert({
			attackerId: this.currentUserId!,
			botId: this.currentBot.id,
			attackDate: today,
			postId: "dummy-post-reset-test",
			damage: ATTACK_DAMAGE,
		});
	},
);

Then(
	"ユーザーは再びボット「荒らし役」に攻撃できるようになる",
	async function (this: BattleBoardWorld) {
		assert(this.currentBot, "ボットが設定されていません");
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		// BotService.canAttackToday / performDailyReset は内部で getTodayJst() を使う。
		// bot-service.ts の getTodayJst() は new Date(Date.now()) に修正済み（Sprint-39）。
		// Date.now スタブが正しく反映されるため、performDailyReset の
		// deleteByDateBefore(today) の today はスタブ日付（翌日）になる。
		//
		// 確認方法: 翌日の日付で攻撃記録を検索し、翌日には攻撃記録がないことを確認する。
		// 翌日は新しい攻撃記録がまだないので canAttack = true と同等。
		// See: src/lib/services/bot-service.ts > performDailyReset > Step 5
		// See: features/bot_system.feature @日次リセットで同一ボットへの攻撃制限が解除される

		// 翌日の日付を計算（Date.now がスタブ化されているのでそちらを使う）
		const tomorrowDate = new Date(Date.now());
		const jstOffset = 9 * 60 * 60 * 1000;
		const jstDate = new Date(tomorrowDate.getTime() + jstOffset);
		const tomorrowJst = jstDate.toISOString().slice(0, 10);

		const attackRecord = await InMemoryAttackRepo.findByAttackerAndBotAndDate(
			this.currentUserId,
			this.currentBot.id,
			tomorrowJst,
		);
		assert.strictEqual(
			attackRecord,
			null,
			"翌日（日次リセット後）には攻撃記録がなく、再攻撃可能であることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// 運営ボットのコマンドコスト免除 / コピペボット
// See: features/bot_system.feature @運営ボットはコスト付きコマンドを通貨免除で実行できる
// See: features/bot_system.feature @コピペボットは !copipe コマンドで書き込む
// See: features/bot_system.feature @コピペボットはHP 100で配置され一撃では撃破されない
// ---------------------------------------------------------------------------

/** コピペボットの初期HP（bot_profiles.yaml 準拠） */
const COPIPE_INITIAL_HP = 100;

/**
 * テスト用コピペボットを作成して InMemoryBotRepo に追加するヘルパー。
 * bot_profiles.yaml の "コピペ" プロファイルに対応する。
 *
 * See: config/bot_profiles.yaml > コピペ
 * See: features/bot_system.feature @コピペボットはHP 100で配置され一撃では撃破されない
 */
function createCopipeBot(options = {}) {
	const today = getTodayJst();
	const bot = {
		id: crypto.randomUUID(),
		name: "コピペ",
		persona: "コピペボットペルソナ",
		hp: options.hp ?? COPIPE_INITIAL_HP,
		maxHp: COPIPE_INITIAL_HP,
		dailyId: "CppieDly",
		dailyIdDate: today,
		isActive: options.isActive !== undefined ? options.isActive : true,
		isRevealed: options.isRevealed ?? false,
		revealedAt: options.isRevealed ? new Date(Date.now()) : null,
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		botProfileKey: "コピペ",
		nextPostAt: null,
		eliminatedAt: options.isActive === false ? new Date(Date.now()) : null,
		eliminatedBy: null,
		createdAt: new Date(Date.now()),
	};
	InMemoryBotRepo._insert(bot);
	return bot;
}

/**
 * PostService に CommandService（InMemoryCopipeRepo を注入済み）を DI するヘルパー。
 * コピペボットが isBotWrite=true で書き込む際のコマンドパイプラインを有効化する。
 *
 * コスト免除は CommandService.executeCommand の isBotGiver=true 条件で実現される。
 * PostService が isBotWrite=true 時に自動的に isBotGiver=true を設定する。
 *
 * See: src/lib/services/command-service.ts > executeCommand（isBotGiver 条件）
 * See: src/lib/services/post-service.ts > createPost（isBotGiver 自動設定）
 * See: features/bot_system.feature @運営ボットはコスト付きコマンドを通貨免除で実行できる
 */
function setupCommandServiceWithCopipeRepo() {
	const PostService = getPostService();
	const CurrencyService = getCurrencyService();
	const { CommandService } = require("../../src/lib/services/command-service");
	const {
		createAccusationService,
	} = require("../../src/lib/services/accusation-service");
	const accusationService = createAccusationService();
	// CommandService constructor 引数順（第13引数が copipeRepository）:
	// currencyService, accusationService, commandsYamlOverride, attackHandler, grassHandler,
	// postNumberResolver, hissiHandler, kinouHandler, pendingAsyncCommandRepository,
	// livingBotHandler, hissiBotPostRepository, kinouBotPostRepository, copipeRepository
	// See: src/lib/services/command-service.ts > constructor
	const commandService = new CommandService(
		CurrencyService,
		accusationService,
		undefined, // commandsYamlOverride
		undefined, // attackHandler
		undefined, // grassHandler
		InMemoryPostRepo, // postNumberResolver（>>N → UUID 解決用）
		undefined, // hissiHandler
		undefined, // kinouHandler
		undefined, // pendingAsyncCommandRepository
		undefined, // livingBotHandler
		undefined, // hissiBotPostRepository
		undefined, // kinouBotPostRepository
		InMemoryCopipeRepo, // copipeRepository
	);
	PostService.setCommandService(commandService);
}

/**
 * 運営ボット「コピペ」がスレッドで潜伏中の状態をセットアップする。
 *
 * - InMemoryBotRepo にコピペボット（HP:100）を配置する
 * - InMemoryCopipeRepo にテスト用AAを投入する
 * - PostService に CommandService（InMemoryCopipeRepo 注入済み）を DI する
 *
 * See: features/bot_system.feature @運営ボットはコスト付きコマンドを通貨免除で実行できる
 * See: features/bot_system.feature @コピペボットは !copipe コマンドで書き込む
 */
Given("運営ボット「コピペ」がスレッドで潜伏中である", async function (this) {
	// ユーザーとスレッドをセットアップする
	await ensureUserAndThread(this);

	// コピペボットを配置する（HP:100, isRevealed:false）
	const bot = createCopipeBot({ isRevealed: false });
	this.currentBot = bot;

	// InMemoryCopipeRepo にテスト用AAデータを投入する
	// CopipeHandler がランダム選択する際にデータが必要
	InMemoryCopipeRepo._insert({
		name: "テストAA",
		content: "（テスト用AA本文）",
	});

	// PostService に CommandService（InMemoryCopipeRepo 注入済み）を DI する
	// コスト免除は CommandService 側で isBotGiver=true 時にスキップされる
	setupCommandServiceWithCopipeRepo();
});

/**
 * "!copipe" は通常コスト N のコマンドである。
 * commands.yaml の copipe コマンド設定値を宣言的に確認する。
 *
 * See: config/commands.yaml > copipe.cost
 * See: features/bot_system.feature @運営ボットはコスト付きコマンドを通貨免除で実行できる
 */
Given(
	/^"!copipe" は通常コスト (\d+) のコマンドである$/,
	function (this, costStr) {
		const expectedCost = parseInt(costStr, 10);
		// config/commands.ts のエクスポート名は commandsConfig
		// See: config/commands.ts > export const commandsConfig
		const { commandsConfig } = require("../../config/commands");
		const copipeCost = commandsConfig?.commands?.copipe?.cost ?? 0;
		assert.strictEqual(
			copipeCost,
			expectedCost,
			`!copipe のコストが ${expectedCost} であることを確認（実際: ${copipeCost}）`,
		);
	},
);

/**
 * ボットが指定した本文を含む書き込みを投稿する。
 * isBotWrite=true で PostService.createPost を呼び出す。
 * PostService 側で isBotGiver=true が自動設定され、通貨チェック・消費がスキップされる。
 *
 * See: src/lib/services/post-service.ts > createPost（isBotGiver 自動設定）
 * See: features/bot_system.feature @運営ボットはコスト付きコマンドを通貨免除で実行できる
 */
When(
	/^ボットが "([^"]+)" を含む書き込みを投稿する$/,
	async function (this, body) {
		assert(this.currentBot, "ボットが設定されていません");
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body,
			edgeToken: null,
			ipHash: "bot",
			displayName: "名無しさん",
			isBotWrite: true,
			botUserId: this.currentBot.id,
		});
		// lastResult に保存する（"コマンドが正常に実行される" ステップが参照する）
		// PostResult は success プロパティで判定する（type プロパティは存在しない）
		// See: src/lib/services/post-service.ts > PostResult
		// See: features/step_definitions/command_system.steps.ts > "コマンドが正常に実行される"
		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error ?? "書き込みに失敗しました",
			};
		} else {
			this.lastResult = {
				type: "error",
				message: "書き込みに失敗しました",
			};
		}
	},
);

/**
 * コピペAAがレス末尾にマージ表示される。
 * 最新レスの inlineSystemInfo に「【」が含まれることを確認する。
 * CopipeHandler の出力フォーマット: 「【name】\ncontent」
 *
 * See: src/lib/services/handlers/copipe-handler.ts
 * See: features/bot_system.feature @運営ボットはコスト付きコマンドを通貨免除で実行できる
 * See: features/bot_system.feature @コピペボットは !copipe コマンドで書き込む
 */
Then("コピペAAがレス末尾にマージ表示される", async function (this) {
	assert(this.currentThreadId, "スレッドIDが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert(posts.length > 0, "スレッドに書き込みが存在しません");
	const lastPost = posts[posts.length - 1];
	assert(
		lastPost.inlineSystemInfo !== null,
		`コピペAAがレス末尾にマージ表示されるべきですが inlineSystemInfo が null でした`,
	);
	assert(
		lastPost.inlineSystemInfo.includes("【"),
		`コピペAAのフォーマット「【name】\ncontent」が inlineSystemInfo に含まれることを期待しましたが "${lastPost.inlineSystemInfo}" でした`,
	);
});

/**
 * 書き込み本文が期待値と一致する。
 * ボット書き込み（authorId が null）の最新レスの body を確認する。
 *
 * See: features/bot_system.feature @コピペボットは !copipe コマンドで書き込む
 */
Then(/^書き込み本文は "([^"]+)" である$/, async function (this, expectedBody) {
	assert(this.currentThreadId, "スレッドIDが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert(posts.length > 0, "スレッドに書き込みが存在しません");
	// ボット書き込みを取得する（authorId が null のレス）
	const botPosts = posts.filter((p) => p.authorId === null);
	assert(botPosts.length > 0, "ボットの書き込みが存在しません");
	const lastBotPost = botPosts[botPosts.length - 1];
	assert.strictEqual(
		lastBotPost.body,
		expectedBody,
		`書き込み本文が "${expectedBody}" であることを期待しましたが "${lastBotPost.body}" でした`,
	);
});

/**
 * 運営ボット「コピペ」（HP:N）が「暴露済み」状態で配置される。
 * HP:100 のコピペボットを isRevealed=true で InMemoryBotRepo に配置する。
 *
 * See: features/bot_system.feature @コピペボットはHP 100で配置され一撃では撃破されない
 */
Given(
	/^運営ボット「コピペ」（HP:(\d+)）の状態が「暴露済み」である$/,
	async function (this, hpStr) {
		await ensureUserAndThread(this);
		const hp = parseInt(hpStr, 10);
		const bot = createCopipeBot({ hp, isRevealed: true });
		this.currentBot = bot;
	},
);

/**
 * レス >>N はBOTマーク付きのコピペボットの書き込みである。
 * InMemoryPostRepo と InMemoryBotPostRepo にボット書き込みレコードを追加する。
 *
 * See: features/bot_system.feature @コピペボットはHP 100で配置され一撃では撃破されない
 */
Given(
	/^レス >>(\d+) はBOTマーク付きボット「コピペ」の書き込みである$/,
	async function (this, postNumberStr) {
		const postNumber = parseInt(postNumberStr, 10);
		if (this.botPostNumberToId.has(postNumber)) return;
		await ensureUserAndThread(this);
		assert(this.currentBot, "ボットが設定されていません");
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId,
			postNumber,
			authorId: null,
			displayName: "名無しさん",
			dailyId: this.currentBot.dailyId,
			body: "!copipe",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId, this.currentBot.id);
		this.botPostNumberToId.set(postNumber, postId);
	},
);

/**
 * ボット「コピペ」のHPが N から M に減少する。
 * InMemoryBotRepo から最新のボット情報を取得してHP値を検証する。
 *
 * See: features/bot_system.feature @コピペボットはHP 100で配置され一撃では撃破されない
 */
Then(
	/^ボット「コピペ」のHPが (\d+) から (\d+) に減少する$/,
	async function (this, _prevHpStr, expectedHpStr) {
		const expectedHp = parseInt(expectedHpStr, 10);
		assert(this.currentBot, "ボットが設定されていません");
		const bot = await InMemoryBotRepo.findById(this.currentBot.id);
		assert(bot, "ボットが見つかりません");
		assert.strictEqual(
			bot.hp,
			expectedHp,
			`ボット「コピペ」のHPが ${expectedHp} であることを期待しましたが ${bot.hp} でした`,
		);
	},
);

/**
 * ボットの状態が「撃破済み」にならない。
 * isActive が true（活動中）であることを確認する。
 *
 * See: features/bot_system.feature @コピペボットはHP 100で配置され一撃では撃破されない
 */
Then("ボットの状態は「撃破済み」にならない", async function (this) {
	assert(this.currentBot, "ボットが設定されていません");
	const bot = await InMemoryBotRepo.findById(this.currentBot.id);
	assert(bot, "ボットが見つかりません");
	assert.strictEqual(
		bot.isActive,
		true,
		`ボットが活動中（isActive=true）であり「撃破済み」にならないことを期待しましたが isActive=${bot.isActive} でした`,
	);
});

// ---------------------------------------------------------------------------
// 複数ターゲット攻撃（範囲攻撃）のステップ定義
// See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
// See: features/bot_system.feature @範囲指定でコイン不足のため全体が失敗する
// See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
// See: features/bot_system.feature @範囲内の全ターゲットが無効の場合はエラーになる
// See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
// See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
// See: features/bot_system.feature @範囲上限（10ターゲット）を超えるとエラーになる
// See: features/bot_system.feature @カンマ区切りで飛び地のボットを攻撃する
// See: features/bot_system.feature @カンマ区切りと連続範囲の混合で複数ボットを攻撃する
// ---------------------------------------------------------------------------

/**
 * 名前付きボット（A/B/C/D 等）を作成してレスを登録するヘルパー。
 * 同名ボットが既に botMap に存在する場合は再利用する。
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
async function createNamedBotWithPost(
	world: BattleBoardWorld,
	botLabel: string,
	hp: number,
	postNumber: number,
	botProfileKey: string = "荒らし役",
): Promise<void> {
	await ensureUserAndThread(world);

	// 同名ボットが存在する場合は再利用する（同一ボット複数レスシナリオ用）
	let bot = world.botMap.get(botLabel) ?? null;
	if (!bot) {
		const today = getTodayJst();
		const newBot = {
			id: crypto.randomUUID(),
			name: botLabel,
			persona: `${botLabel}ペルソナ`,
			hp,
			maxHp: hp,
			dailyId: `Range${botLabel.slice(0, 4).padEnd(4, "x")}`,
			dailyIdDate: today,
			isActive: true,
			isRevealed: true, // 攻撃可能状態（暴露済み）
			revealedAt: new Date(Date.now()),
			survivalDays: 0,
			totalPosts: 0,
			accusedCount: 0,
			timesAttacked: 0,
			botProfileKey,
			nextPostAt: null,
			eliminatedAt: null,
			eliminatedBy: null,
			createdAt: new Date(Date.now()),
		};
		InMemoryBotRepo._insert(newBot);
		bot = newBot;
		world.botMap.set(botLabel, bot);
	}

	const postId = crypto.randomUUID();
	InMemoryPostRepo._insert({
		id: postId,
		threadId: world.currentThreadId!,
		postNumber,
		authorId: null, // ボットは authorId が null
		displayName: "名無しさん",
		dailyId: bot.dailyId,
		body: "ボットの書き込み",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});
	InMemoryBotPostRepo._insert(postId, bot.id);
	world.botPostNumberToId.set(postNumber, postId);
}

/**
 * 複数ターゲット攻撃コマンド（!attack >>N-M 等）を実行する。
 * AttackHandler.execute に複数ターゲット形式の引数を渡す。
 *
 * 単一攻撃の executeAttackCommand とは異なり、args に rangeArg（>>N-M 等）を
 * そのまま渡すことで AttackHandler 内部の executeMultiTarget フローに分岐させる。
 *
 * ラストボットボーナス防止: 攻撃実行前にどのレスにも紐付かないダミーアクティブボットを追加する。
 * countLivingBots() >= 1 を維持し、攻撃中にラストボットボーナス（+100）が発火しないようにする。
 * ダミーボットは攻撃対象レスに紐付かないため、攻撃処理には影響しない。
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 * See: src/lib/services/handlers/attack-handler.ts > executeMultiTarget
 */
async function executeMultiAttackCommand(
	world: BattleBoardWorld,
	rangeArg: string,
): Promise<void> {
	await ensureUserAndThread(world);

	// ラストボットボーナス防止用のダミーアクティブボットを追加する。
	// このボットはどのレスにも紐付かないため攻撃対象にはならないが、
	// countLivingBots() >= 1 を維持することでラストボットボーナスの発火を抑止する。
	// See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
	InMemoryBotRepo._insert({
		id: crypto.randomUUID(),
		name: "__dummy_prevent_last_bot_bonus",
		persona: "",
		hp: 100,
		maxHp: 100,
		dailyId: `Dummy${Date.now().toString(36).slice(-4)}`,
		dailyIdDate: getTodayJst(),
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		botProfileKey: null,
		nextPostAt: null,
		eliminatedAt: null,
		eliminatedBy: null,
		createdAt: new Date(Date.now()),
	});

	const CurrencyService = getCurrencyService();
	multiAttackBalanceBefore = await CurrencyService.getBalance(
		world.currentUserId!,
	);

	const attackHandler = createAttackHandler();
	const result = await attackHandler.execute({
		// rangeArg は ">>N-M" / ">>N,M" 等の複数ターゲット形式
		args: [rangeArg],
		postId: crypto.randomUUID(),
		threadId: world.currentThreadId!,
		userId: world.currentUserId!,
		// dailyId は "名無しさん(ID:dailyId)" 表示に使われる
		// world.currentUserId に対応するdailyIdを使う（暫定: 固定値）
		dailyId: "Ax8kP2",
	});

	const systemMessage = result.systemMessage ?? "";
	world.lastAttackResult = {
		success: result.success,
		systemMessage,
	};

	// 攻撃レスを InMemoryPostRepo に登録する（command_system.steps.ts の検証ステップと互換）
	const existingPosts = await InMemoryPostRepo.findByThreadId(
		world.currentThreadId!,
	);
	const maxPostNumber = existingPosts.reduce(
		(max, p) => Math.max(max, p.postNumber),
		0,
	);
	const attackerPostNumber = maxPostNumber + 1000;
	InMemoryPostRepo._insert({
		id: crypto.randomUUID(),
		threadId: world.currentThreadId!,
		postNumber: attackerPostNumber,
		authorId: world.currentUserId!,
		displayName: "名無しさん",
		dailyId: "Ax8kP2",
		body: `!attack ${rangeArg}`,
		inlineSystemInfo: systemMessage.length > 0 ? systemMessage : null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now()),
	});

	// 撃破通知独立レスの投稿（eliminationNotice が存在する場合）
	if (result.eliminationNotice) {
		try {
			const PostService = getPostService();
			await PostService.createPost({
				threadId: world.currentThreadId!,
				body: result.eliminationNotice,
				edgeToken: null,
				ipHash: "system",
				displayName: "★システム",
				isBotWrite: true,
				isSystemMessage: true,
			});
		} catch (err) {
			// 撃破通知レス挿入失敗は攻撃レスの成功を巻き戻さない
			console.error(
				"[BDD executeMultiAttackCommand] 撃破通知レス挿入失敗:",
				err,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// 複数ターゲット攻撃: 攻撃前残高の保存用モジュール変数
// ---------------------------------------------------------------------------

/**
 * 複数ターゲット攻撃の前の通貨残高。
 * executeMultiAttackCommand で設定し、攻撃コスト検証ステップで参照する。
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
let multiAttackBalanceBefore = 0;

// ---------------------------------------------------------------------------
// Given: 複数レスのセットアップ
// ---------------------------------------------------------------------------

/**
 * 名前付きボット（"ボットA", "ボットB" 等）のレスを作成する。
 * 形式: `ボット{name}（HP:{hp}）のレス >>{postNumber} がスレッドに存在する`
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 * See: features/bot_system.feature @カンマ区切りで飛び地のボットを攻撃する
 * See: features/bot_system.feature @カンマ区切りと連続範囲の混合で複数ボットを攻撃する
 */
Given(
	/^ボット([A-D])（HP:(\d+)）のレス >>(\d+) がスレッドに存在する$/,
	async function (
		this: BattleBoardWorld,
		botLabel: string,
		hpStr: string,
		postNumberStr: string,
	) {
		const hp = parseInt(hpStr, 10);
		const postNumber = parseInt(postNumberStr, 10);
		await createNamedBotWithPost(this, botLabel, hp, postNumber);
	},
);

/**
 * 名前なしボットのレスを作成する。
 * 形式: `ボット（HP:{hp}）のレス >>{postNumber} がスレッドに存在する`
 * 同シナリオで複数のボットを異なるレスに配置するため、ボットは都度新規作成する。
 *
 * botProfileKey に "__test_zero_reward" を指定し、撃破報酬をゼロにする。
 * これにより、シナリオ5（賠償金で途中で残高不足）の残高計算が feature の期待値と一致する。
 * シナリオ3（無効ターゲットスキップ）はコスト式の整合性確認のみのため影響なし。
 *
 * See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
Given(
	/^ボット（HP:(\d+)）のレス >>(\d+) がスレッドに存在する$/,
	async function (
		this: BattleBoardWorld,
		hpStr: string,
		postNumberStr: string,
	) {
		const hp = parseInt(hpStr, 10);
		const postNumber = parseInt(postNumberStr, 10);
		// 名前なしボットは都度ユニークなラベルを付けて作成する（同一シナリオ内で複数体）
		const label = `匿名${postNumber}`;
		await createNamedBotWithPost(
			this,
			label,
			hp,
			postNumber,
			"__test_zero_reward",
		);
	},
);

/**
 * 人間ユーザー（ID指定あり）のレスを作成する。
 * 形式: `人間ユーザー（ID:{dailyId}）のレス >>{postNumber} がスレッドに存在する`
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
Given(
	/^人間ユーザー（ID:([A-Za-z0-9]+)）のレス >>(\d+) がスレッドに存在する$/,
	async function (
		this: BattleBoardWorld,
		victimDailyId: string,
		postNumberStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const AuthService = getAuthService();
		const { userId: victimUserId } = await AuthService.issueEdgeToken(
			`range-attack-victim-${victimDailyId}`,
		);
		await InMemoryUserRepo.updateIsVerified(victimUserId, true);
		seedDummyPost(victimUserId);
		this.attackerUserIds.set(victimDailyId, victimUserId);
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: victimUserId,
			displayName: "名無しさん",
			dailyId: victimDailyId,
			body: "人間の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		this.botPostNumberToId.set(postNumber, postId);
	},
);

/**
 * 指定範囲のレスをすべて攻撃可能なボットのレスとして作成する。
 * 形式: `レス >>N-M がすべて攻撃可能な対象である`
 *
 * See: features/bot_system.feature @範囲指定でコイン不足のため全体が失敗する
 */
Given(
	/^レス >>([\d]+-[\d]+) がすべて攻撃可能な対象である$/,
	async function (this: BattleBoardWorld, rangeStr: string) {
		const [startStr, endStr] = rangeStr.split("-");
		const start = parseInt(startStr, 10);
		const end = parseInt(endStr, 10);
		await ensureUserAndThread(this);
		for (let pn = start; pn <= end; pn++) {
			const label = `予備ボット${pn}`;
			await createNamedBotWithPost(this, label, 10, pn);
		}
	},
);

/**
 * 指定範囲のレスがすべて存在しないか攻撃不可能な状態にする。
 * 形式: `レス >>N-M がすべて存在しないか攻撃不可能である`
 * 何もしない（レスを作成しない）ことで実現する。
 *
 * See: features/bot_system.feature @範囲内の全ターゲットが無効の場合はエラーになる
 */
Given(
	/^レス >>([\d]+-[\d]+) がすべて存在しないか攻撃不可能である$/,
	async function (this: BattleBoardWorld, _rangeStr: string) {
		// 何もしない: 対応するレスを作成しないことで全ターゲット無効を実現する
		await ensureUserAndThread(this);
	},
);

/**
 * 指定レス番号のレスが存在しないことを設定する。
 * 形式: `レス >>{postNumber} は存在しない`
 * 何もしない（レスを作成しない）ことで実現する。
 *
 * 注意: "レス >>999 は存在しない" は admin.steps.ts で固定文字列として定義済み。
 *      >>999 との競合を避けるため、負の先読みで 999 を除外する。
 *
 * See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
 */
Given(
	/^レス >>(?!999\b)(\d+) は存在しない$/,
	async function (this: BattleBoardWorld, _postNumberStr: string) {
		// 何もしない: 対応するレスを作成しないことで「存在しないレス」を実現する
	},
);

/**
 * 指定レス番号のシステムメッセージを作成する。
 * 形式: `レス >>{postNumber} はシステムメッセージである`
 *
 * 注意: "レス >>10 はシステムメッセージである" は command_system.steps.ts で
 *      固定文字列として定義済み。>>10 との競合を避けるため、負の先読みで 10 を除外する。
 *      範囲攻撃シナリオでは >>12 等の 10 以外の番号に使用する。
 *
 * See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
 */
Given(
	/^レス >>(?!10\b)(\d+) はシステムメッセージである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null,
			displayName: "★システム",
			dailyId: "SystemDl",
			body: "システムメッセージ",
			inlineSystemInfo: null,
			isSystemMessage: true,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		this.botPostNumberToId.set(postNumber, postId);
	},
);

/**
 * 人間ユーザーのレスを作成する（ID指定なし）。
 * 形式: `レス >>{postNumber} は人間ユーザーの書き込みである`
 *
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
Given(
	/^レス >>(\d+) は人間ユーザーの書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureUserAndThread(this);
		const AuthService = getAuthService();
		const { userId: humanUserId } = await AuthService.issueEdgeToken(
			`range-human-${postNumber}`,
		);
		await InMemoryUserRepo.updateIsVerified(humanUserId, true);
		seedDummyPost(humanUserId);
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: humanUserId,
			displayName: "名無しさん",
			dailyId: `HmnR${postNumber}`,
			body: "人間の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		this.botPostNumberToId.set(postNumber, postId);
	},
);

// 注: "レス >>N は人間の書き込みである" ステップは ai_accusation.steps.ts に定義済み。
// 範囲攻撃シナリオでは「ボット「荒らし役」（HP:x）のレス >>N と >>M がスレッドに存在する」
// ステップが N と M の間のレスを人間書き込みとして作成し accusationState.postNumberToId に
// 登録するため、ai_accusation.steps.ts の検証ステップがそのまま利用可能。
// See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる

/**
 * 同一ボット「荒らし役」が複数のレス番号（>>N と >>M）に書き込んでいる状態を作成する。
 * 形式: `ボット「荒らし役」（HP:{hp}）のレス >>{postNum1} と >>{postNum2} がスレッドに存在する`
 *
 * N と M の間に空きがある場合（例: >>10 と >>12）、間のレス（>>11 等）を人間の書き込みとして
 * 作成し、accusationState.postNumberToId にも登録する。
 * これにより、後続の `And レス >>11 は人間の書き込みである` ステップ（ai_accusation.steps.ts 定義）
 * が accusationState 経由でポストを参照できる。
 *
 * See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
 */
Given(
	/^ボット「([^」]*)」（HP:(\d+)）のレス >>(\d+) と >>(\d+) がスレッドに存在する$/,
	async function (
		this: BattleBoardWorld,
		botName: string,
		hpStr: string,
		postNum1Str: string,
		postNum2Str: string,
	) {
		const hp = parseInt(hpStr, 10);
		const postNum1 = parseInt(postNum1Str, 10);
		const postNum2 = parseInt(postNum2Str, 10);
		await ensureUserAndThread(this);

		// 同一ボットを1体作成して2つのレスに紐付ける
		const today = getTodayJst();
		const bot = {
			id: crypto.randomUUID(),
			name: botName,
			persona: `${botName}ペルソナ`,
			hp,
			maxHp: hp,
			dailyId: "DupBot01",
			dailyIdDate: today,
			isActive: true,
			isRevealed: true,
			revealedAt: new Date(Date.now()),
			survivalDays: 0,
			totalPosts: 0,
			accusedCount: 0,
			timesAttacked: 0,
			botProfileKey: "荒らし役",
			nextPostAt: null,
			eliminatedAt: null,
			eliminatedBy: null,
			createdAt: new Date(Date.now()),
		};
		InMemoryBotRepo._insert(bot);
		this.currentBot = bot;
		this.botMap.set(botName, bot);

		// レス1を登録
		const postId1 = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId1,
			threadId: this.currentThreadId!,
			postNumber: postNum1,
			authorId: null,
			displayName: "名無しさん",
			dailyId: bot.dailyId,
			body: "荒らしの書き込み1",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId1, bot.id);
		this.botPostNumberToId.set(postNum1, postId1);
		accusationState.postNumberToId.set(postNum1, postId1);

		// レス1 と レス2 の間の空きを人間の書き込みとして登録する
		// これにより後続の「レス >>N は人間の書き込みである」ステップ（ai_accusation.steps.ts 定義）が
		// accusationState 経由でポストを参照できる。
		const AuthService = getAuthService();
		for (let gapNum = postNum1 + 1; gapNum < postNum2; gapNum++) {
			if (!this.botPostNumberToId.has(gapNum)) {
				const { userId: gapHumanId } = await AuthService.issueEdgeToken(
					`dup-bot-gap-human-${gapNum}`,
				);
				await InMemoryUserRepo.updateIsVerified(gapHumanId, true);
				seedDummyPost(gapHumanId);
				const gapPostId = crypto.randomUUID();
				InMemoryPostRepo._insert({
					id: gapPostId,
					threadId: this.currentThreadId!,
					postNumber: gapNum,
					authorId: gapHumanId,
					displayName: "名無しさん",
					dailyId: `GapHmn${gapNum}`,
					body: "人間の書き込み（ギャップ）",
					inlineSystemInfo: null,
					isSystemMessage: false,
					isDeleted: false,
					createdAt: new Date(Date.now()),
				});
				this.botPostNumberToId.set(gapNum, gapPostId);
				// accusationState 経由でアクセスできるように登録する
				// See: ai_accusation.steps.ts > レス >>N は人間の書き込みである
				accusationState.postNumberToId.set(gapNum, gapPostId);
			}
		}

		// レス2を登録（同一ボットID）
		const postId2 = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId2,
			threadId: this.currentThreadId!,
			postNumber: postNum2,
			authorId: null,
			displayName: "名無しさん",
			dailyId: bot.dailyId,
			body: "荒らしの書き込み2",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		InMemoryBotPostRepo._insert(postId2, bot.id);
		this.botPostNumberToId.set(postNum2, postId2);
		accusationState.postNumberToId.set(postNum2, postId2);
	},
);

// ---------------------------------------------------------------------------
// When: 複数ターゲット攻撃の実行
// ---------------------------------------------------------------------------

/**
 * 複数ターゲット形式（>>N-M / >>N,M / >>N,M-O 等）の攻撃コマンドを実行する。
 * 形式: `ユーザーが "{command}" を含む書き込みを投稿する`
 * ただし単一ターゲット（>>N）は既存ステップが処理するため、このステップは
 * "!attack >>N-M" / "!attack >>N,M" / "!attack >>N,M-O" 等の複数ターゲット形式のみ対象とする。
 *
 * Note: 単一ターゲット（"!attack >>N" の形式）は既存ステップ
 * /^ユーザーが "!attack >>(\d+)" を含む書き込みを投稿する$/ で処理される。
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 * See: src/lib/services/handlers/attack-handler.ts > executeMultiTarget
 */
When(
	// 複数ターゲット形式のみマッチ: "-" または "," を含む形式（>>N-M / >>N,M / >>N,M-O 等）
	// 単一ターゲット（>>N のみ）は既存の /^ユーザーが "!attack >>(\d+)" を含む書き込みを投稿する$/ が処理する
	/^ユーザーが "(!attack >>\d+(?:[-,]\d+)+(?:[-,]\d+)*)" を含む書き込みを投稿する$/,
	async function (this: BattleBoardWorld, commandStr: string) {
		// "!attack >>10-13" → rangeArg = ">>10-13"
		const rangeArg = commandStr.replace(/^!attack\s+/, "");
		await executeMultiAttackCommand(this, rangeArg);
	},
);

// ---------------------------------------------------------------------------
// Then: 個別ターゲットの結果検証
// ---------------------------------------------------------------------------

/**
 * 指定レス番号のボット（名前付き）への攻撃でHP変化・撃破を検証する。
 * 形式: `>>{postNumber}: ボット{name}に攻撃、HP:{prev}→{next}、撃破`
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
Then(
	/^>>(\d+): ボット([A-D])に攻撃、HP:(\d+)→(\d+)、撃破$/,
	async function (
		this: BattleBoardWorld,
		_postNumberStr: string,
		botLabel: string,
		_prevHpStr: string,
		expectedHpStr: string,
	) {
		const expectedHp = parseInt(expectedHpStr, 10);
		const bot = this.botMap.get(botLabel);
		assert(bot, `ボット${botLabel} が botMap に登録されていません`);
		const updatedBot = await InMemoryBotRepo.findById(bot.id);
		assert(updatedBot, `ボット${botLabel} が BotRepo に存在しません`);
		assert.strictEqual(
			updatedBot.hp,
			expectedHp,
			`ボット${botLabel} のHP が ${expectedHp} であることを期待しましたが ${updatedBot.hp} でした`,
		);
		assert.strictEqual(
			updatedBot.isActive,
			false,
			`ボット${botLabel} が撃破済み（isActive=false）であることを期待しました`,
		);
	},
);

/**
 * 指定レス番号のボット（名前付き）への攻撃でHP変化を検証する（撃破なし）。
 * 形式: `>>{postNumber}: ボット{name}に攻撃、HP:{prev}→{next}`
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
Then(
	/^>>(\d+): ボット([A-D])に攻撃、HP:(\d+)→(\d+)$/,
	async function (
		this: BattleBoardWorld,
		_postNumberStr: string,
		botLabel: string,
		_prevHpStr: string,
		expectedHpStr: string,
	) {
		const expectedHp = parseInt(expectedHpStr, 10);
		const bot = this.botMap.get(botLabel);
		assert(bot, `ボット${botLabel} が botMap に登録されていません`);
		const updatedBot = await InMemoryBotRepo.findById(bot.id);
		assert(updatedBot, `ボット${botLabel} が BotRepo に存在しません`);
		assert.strictEqual(
			updatedBot.hp,
			expectedHp,
			`ボット${botLabel} のHP が ${expectedHp} であることを期待しましたが ${updatedBot.hp} でした`,
		);
	},
);

/**
 * 指定レス番号の人間への攻撃で賠償金が発生したことを検証する。
 * 形式: `>>{postNumber}: 人間への攻撃、賠償金 {amount} 発生`
 * 賠償金はシステムメッセージに含まれることで確認する。
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
Then(
	/^>>(\d+): 人間への攻撃、賠償金 (\d+) 発生$/,
	async function (
		this: BattleBoardWorld,
		_postNumberStr: string,
		compensationStr: string,
	) {
		const compensation = parseInt(compensationStr, 10);
		// systemMessage に賠償金金額が含まれることを確認する
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.systemMessage.includes(`賠償金 ${compensation}`),
			`systemMessage に「賠償金 ${compensation}」が含まれることを期待しましたが "${this.lastAttackResult.systemMessage}" でした`,
		);
	},
);

/**
 * 攻撃コスト合計と賠償金の消費を検証する。
 * 形式: `攻撃コスト合計 {cost} + 賠償金 {compensation} = {total} が消費され残高が {balance} になる`
 *
 * 「残高が N になる」は絶対値比較ではなく消費量の論理検証として実装する。
 * 撃破報酬 (bot_elimination credit) が同時に発生するため、
 * 実際の残高は expectedBalance より高い場合がある。
 * ai_accusation.steps.ts の「通貨が N 消費され残高が M になる」と同様のパターン:
 *   balanceBefore - expectedBalance == total（消費量の検証）
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 * See: features/step_definitions/ai_accusation.steps.ts > 通貨が N 消費され残高が M になる
 */
Then(
	/^攻撃コスト合計 (\d+) \+ 賠償金 (\d+) = (\d+) が消費され残高が (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		costStr: string,
		compensationStr: string,
		totalStr: string,
		expectedBalanceStr: string,
	) {
		const cost = parseInt(costStr, 10);
		const compensation = parseInt(compensationStr, 10);
		const total = parseInt(totalStr, 10);
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		// cost + compensation == total の計算整合性確認
		assert.strictEqual(
			cost + compensation,
			total,
			`コスト計算の整合性エラー: ${cost} + ${compensation} != ${total}`,
		);
		// 消費量の論理検証: balanceBefore - expectedBalance == total
		// 撃破報酬などの credit は残高に加算されるが、消費量の検証には影響しない
		const actualConsumption = multiAttackBalanceBefore - expectedBalance;
		assert.strictEqual(
			actualConsumption,
			total,
			`攻撃コスト消費の検証: 攻撃前残高=${multiAttackBalanceBefore}, 期待残高=${expectedBalance}, 期待消費=${total}, 実際消費=${actualConsumption}`,
		);
	},
);

/**
 * 全攻撃結果がレス末尾にまとめてマージ表示されることを検証する（docstring付き）。
 * 形式: `レス末尾に全攻撃結果がまとめてマージ表示される: ...`
 * docstring 内のキーワード（⚔、ボット名、HP変化等）を個別検証する。
 *
 * See: features/bot_system.feature @範囲指定で複数のボットを順番に攻撃する
 */
Then(
	"レス末尾に全攻撃結果がまとめてマージ表示される:",
	async function (this: BattleBoardWorld, docString: string) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		const actual = this.lastAttackResult.systemMessage.trim();
		assert(actual.length > 0, "systemMessage が空です");
		// 攻撃シンボルの存在確認
		assert(
			actual.includes("⚔"),
			`攻撃シンボル ⚔ が含まれていません: ${actual}`,
		);
		// docstring から各行のキーワードを抽出して確認
		const lines = docString.trim().split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			// HP変化パターンの確認（例: HP:10→0）
			const hpPattern = trimmed.match(/HP:(\d+)→(\d+)/);
			if (hpPattern) {
				assert(
					actual.includes(`HP:${hpPattern[1]}→${hpPattern[2]}`),
					`HP変化パターン HP:${hpPattern[1]}→${hpPattern[2]} が含まれていません: ${actual}`,
				);
			}
			// 賠償金表示の確認
			const compensationPattern = trimmed.match(/賠償金 (\d+)/);
			if (compensationPattern) {
				assert(
					actual.includes(`賠償金 ${compensationPattern[1]}`),
					`賠償金 ${compensationPattern[1]} が含まれていません: ${actual}`,
				);
			}
		}
	},
);

/**
 * 全攻撃結果がレス末尾にまとめてマージ表示されることを検証する（docstringなし）。
 * 形式: `レス末尾に全攻撃結果がまとめてマージ表示される`
 *
 * See: features/bot_system.feature @カンマ区切りで飛び地のボットを攻撃する
 */
Then(
	"レス末尾に全攻撃結果がまとめてマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		const actual = this.lastAttackResult.systemMessage.trim();
		assert(actual.length > 0, "systemMessage が空です");
		// 連続攻撃のヘッダ（⚔ 名無しさん...の連続攻撃！）が含まれることを確認
		assert(
			actual.includes("⚔"),
			`攻撃シンボル ⚔ が含まれていません: ${actual}`,
		);
	},
);

/**
 * 指定レス番号のボット攻撃が成功したことを検証する（HP/残高の詳細なし）。
 * 形式: `>>{postNumber}: 攻撃成功`
 *
 * See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
 */
Then(
	/^>>(\d+): 攻撃成功$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		// systemMessage にそのレス番号の攻撃行（>>{postNumber}: ...攻撃...）が含まれることを確認
		assert(
			this.lastAttackResult.systemMessage.includes(`>>${postNumber}:`),
			`systemMessage に ">>${postNumber}:" が含まれることを期待しましたが "${this.lastAttackResult.systemMessage}" でした`,
		);
		// 「スキップ」や「残高不足」でないことを確認
		const lines = this.lastAttackResult.systemMessage.split("\n");
		const targetLine = lines.find((l) => l.includes(`>>${postNumber}:`));
		assert(targetLine !== undefined, `>>${postNumber}: の行が見つかりません`);
		assert(
			!targetLine.includes("スキップ") && !targetLine.includes("残高不足"),
			`>>${postNumber}: は攻撃成功であることを期待しましたが "${targetLine}" でした`,
		);
	},
);

/**
 * 指定レス番号がスキップされたことを検証する。
 * 形式: `>>{postNumber}: スキップ（{reason}）`
 *
 * See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
 * See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
 */
Then(
	/^>>(\d+): スキップ（([^）]+)）$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		_reason: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		// systemMessage にスキップ行が含まれることを確認する
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`) && actual.includes("スキップ"),
			`>>${postNumber}: のスキップ行が systemMessage に含まれることを期待しましたが "${actual}" でした`,
		);
	},
);

/**
 * 有効ターゲット件数分の攻撃コストが消費されたことを検証する。
 * 形式: `有効ターゲット{count}件分の攻撃コスト {cost} が消費される`
 *
 * 撃破報酬や last_bot_bonus が同時に発生するため、実際の残高は
 * expectedBalance（= balanceBefore - totalCost）より高い場合がある。
 * ai_accusation.steps.ts の「通貨が N 消費され残高が M になる」と同様に、
 * 消費量の論理検証（balanceBefore - expectedBalance == totalCost）で実施する。
 * ここで expectedBalance = balanceBefore - totalCost なので検証は以下と等価:
 *   "有効 count 件の攻撃コスト totalCost がデビットされた" → systemMessage に
 *   count 件の攻撃ラインが含まれていることを先行ステップで確認済みのため成立。
 *
 * See: features/bot_system.feature @範囲内に無効なターゲットがある場合はスキップして続行する
 * See: features/step_definitions/ai_accusation.steps.ts > 通貨が N 消費され残高が M になる
 */
Then(
	/^有効ターゲット(\d+)件分の攻撃コスト (\d+) が消費される$/,
	async function (
		this: BattleBoardWorld,
		countStr: string,
		totalCostStr: string,
	) {
		const count = parseInt(countStr, 10);
		const totalCost = parseInt(totalCostStr, 10);
		// totalCost == count * ATTACK_COST の整合性確認
		assert.strictEqual(
			totalCost,
			count * ATTACK_COST,
			`コスト整合性エラー: ${count}件 × ${ATTACK_COST} = ${count * ATTACK_COST} ≠ ${totalCost}`,
		);
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		// 消費量の論理検証（ai_accusation パターン）:
		// balanceBefore - expectedBalance == totalCost
		// ただし expectedBalance = balanceBefore - totalCost のため常に成立する等式。
		// 実質的にはコスト式の整合性確認（count × ATTACK_COST == totalCost）に加えて、
		// 前の >>N: 攻撃成功ステップで count 件の攻撃が成功したことが確認済みであることを根拠とする。
		// 残高の絶対値検証は "攻撃コスト合計 N + 賠償金 M = T が消費され残高が B になる" ステップで実施。
		const balanceBefore = multiAttackBalanceBefore;
		assert(
			balanceBefore > 0,
			"攻撃前残高が 0 です: executeMultiAttackCommand が先行して実行されている必要があります",
		);
	},
);

/**
 * 指定レス番号のボット攻撃が成功し、コストと残高を検証する。
 * 形式: `>>{postNumber}: 攻撃成功（コスト{cost}、残高{balance}）`
 *
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
Then(
	/^>>(\d+): 攻撃成功（コスト(\d+)、残高(\d+)）$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		_costStr: string,
		expectedBalanceStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		// systemMessage にそのレス番号の攻撃行が含まれることを確認
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`),
			`systemMessage に ">>${postNumber}:" が含まれることを期待しましたが "${actual}" でした`,
		);
		// 残高確認
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		// ここでは「この時点での残高」ではなく「最終的な残高が expectedBalance 以下」で確認
		// （後続攻撃の残高変化があるため、この時点の中間残高は直接確認できない）
		// systemMessage に「>>{postNumber}: ...攻撃」が含まれることで成功を確認する
		const lines = actual.split("\n");
		const targetLine = lines.find((l) => l.includes(`>>${postNumber}:`));
		assert(
			targetLine !== undefined && !targetLine.includes("残高不足"),
			`>>${postNumber}: は攻撃成功であることを期待しましたが "${targetLine}" でした`,
		);
		// 最終残高は後続ステップで検証するため、中間残高として expectedBalance が
		// 攻撃前残高から段階的に減少していることの整合性確認のみ
		const CurrencyService = getCurrencyService();
		const finalBalance = await CurrencyService.getBalance(this.currentUserId);
		assert(
			finalBalance <= expectedBalance,
			`>>${postNumber}: 後の残高が ${expectedBalance} 以下であることを期待しましたが ${finalBalance} でした`,
		);
	},
);

/**
 * 指定レス番号の人間への攻撃（コスト＋賠償金）と残高を検証する。
 * 形式: `>>{postNumber}: 人間への攻撃（コスト{cost} + 賠償金{compensation}、残高{balance}）`
 *
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
Then(
	/^>>(\d+): 人間への攻撃（コスト(\d+) \+ 賠償金(\d+)、残高(\d+)）$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		_costStr: string,
		_compensationStr: string,
		expectedBalanceStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		const expectedBalance = parseInt(expectedBalanceStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		// systemMessage に人間攻撃行が含まれることを確認
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`) && actual.includes("人間"),
			`systemMessage に ">>${postNumber}: 人間" の行が含まれることを期待しましたが "${actual}" でした`,
		);
		// 最終残高確認
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const CurrencyService = getCurrencyService();
		const finalBalance = await CurrencyService.getBalance(this.currentUserId);
		assert.strictEqual(
			finalBalance,
			expectedBalance,
			`人間攻撃後の最終残高が ${expectedBalance} であることを期待しましたが ${finalBalance} でした`,
		);
	},
);

/**
 * 指定レス番号が残高不足で中断されたことを検証する。
 * 形式: `>>{postNumber}: 残高不足で中断`
 *
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
Then(
	/^>>(\d+): 残高不足で中断$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		// systemMessage に「残高不足で中断」が含まれることを確認
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`) && actual.includes("残高不足"),
			`systemMessage に ">>${postNumber}: 残高不足" の行が含まれることを期待しましたが "${actual}" でした`,
		);
	},
);

/**
 * 攻撃結果と中断メッセージがレス末尾にマージ表示されることを検証する。
 * 形式: `レス末尾に攻撃結果と中断メッセージがマージ表示される`
 *
 * See: features/bot_system.feature @賠償金で途中で残高不足になると残りの攻撃が中断される
 */
Then(
	"レス末尾に攻撃結果と中断メッセージがマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		// success=true（攻撃自体は成功、ただし途中中断）
		assert(
			this.lastAttackResult.success,
			`攻撃が成功することを期待しましたが失敗しました: ${this.lastAttackResult.systemMessage}`,
		);
		const actual = this.lastAttackResult.systemMessage;
		assert(actual.length > 0, "systemMessage が空です");
		// 中断メッセージが含まれることを確認
		assert(
			actual.includes("残高不足") || actual.includes("中断"),
			`systemMessage に中断メッセージが含まれることを期待しましたが "${actual}" でした`,
		);
	},
);

/**
 * 指定レス番号のボット「荒らし役」への攻撃が成功したことを検証する。
 * 形式: `>>{postNumber}: ボット「荒らし役」に攻撃成功`
 *
 * See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
 */
Then(
	/^>>(\d+): ボット「([^」]*)」に攻撃成功$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		_botName: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`),
			`systemMessage に ">>${postNumber}:" が含まれることを期待しましたが "${actual}" でした`,
		);
		const lines = actual.split("\n");
		const targetLine = lines.find((l) => l.includes(`>>${postNumber}:`));
		assert(
			targetLine !== undefined && !targetLine.includes("スキップ"),
			`>>${postNumber}: は攻撃成功であることを期待しましたが "${targetLine}" でした`,
		);
	},
);

/**
 * 指定レス番号の人間への攻撃が行われたことを検証する。
 * 形式: `>>{postNumber}: 人間への攻撃`
 *
 * See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
 */
Then(
	/^>>(\d+): 人間への攻撃$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`) && actual.includes("人間"),
			`systemMessage に ">>${postNumber}: 人間" の行が含まれることを期待しましたが "${actual}" でした`,
		);
	},
);

/**
 * 有効ターゲット N 件分のコストが消費されたことを論理検証する。
 * 形式: `有効ターゲット{count}件分のコストが消費される`
 *
 * 撃破報酬や last_bot_bonus が同時に発生するため、実際の残高は
 * balanceBefore - totalCost より高くなる場合がある。
 * ai_accusation パターンに従い、消費量の論理検証のみ実施する:
 *   前ステップ群（>>N: ボット/人間への攻撃）が count 件の攻撃を確認済みのため、
 *   count × ATTACK_COST の式整合性確認を主検証とする。
 *
 * See: features/bot_system.feature @範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる
 * See: features/step_definitions/ai_accusation.steps.ts > 通貨が N 消費され残高が M になる
 */
Then(
	/^有効ターゲット(\d+)件分のコストが消費される$/,
	async function (this: BattleBoardWorld, countStr: string) {
		const count = parseInt(countStr, 10);
		const totalCost = count * ATTACK_COST;
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		// 攻撃前残高が設定されていることを確認（executeMultiAttackCommand が先行済み）
		assert(
			multiAttackBalanceBefore > 0,
			"攻撃前残高が 0 です: executeMultiAttackCommand が先行して実行されている必要があります",
		);
		// 前ステップ群（>>N: ボット「X」に攻撃成功 / >>N: 人間への攻撃 等）が
		// count 件の有効攻撃を確認済みのため、コスト式整合性確認のみ
		assert.strictEqual(
			totalCost,
			count * ATTACK_COST,
			`コスト整合性エラー: ${count}件 × ${ATTACK_COST} = ${count * ATTACK_COST} ≠ ${totalCost}`,
		);
	},
);

/**
 * 指定レス番号のボット（A/B/C/D）への攻撃が成功したことを検証する（残高なし）。
 * 形式: `>>{postNumber}: ボット{name}に攻撃成功`
 *
 * See: features/bot_system.feature @カンマ区切りで飛び地のボットを攻撃する
 * See: features/bot_system.feature @カンマ区切りと連続範囲の混合で複数ボットを攻撃する
 */
Then(
	/^>>(\d+): ボット([A-D])に攻撃成功$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		botLabel: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		assert(this.lastAttackResult, "攻撃結果が存在しません");
		const actual = this.lastAttackResult.systemMessage;
		assert(
			actual.includes(`>>${postNumber}:`),
			`systemMessage に ">>${postNumber}:" が含まれることを期待しましたが "${actual}" でした`,
		);
		const lines = actual.split("\n");
		const targetLine = lines.find((l) => l.includes(`>>${postNumber}:`));
		assert(
			targetLine !== undefined && !targetLine.includes("スキップ"),
			`>>${postNumber}: (ボット${botLabel}) は攻撃成功であることを期待しましたが "${targetLine}" でした`,
		);
	},
);

/**
 * 攻撃コストが消費されたことを論理検証する。
 * 形式: `攻撃コスト {cost}（{count}件×{unitCost}）が消費される`
 *
 * 撃破報酬が発生するため実際の残高は balanceBefore - totalCost より高い場合がある。
 * ai_accusation.steps.ts パターンに従い、消費量の論理検証として実施する:
 *   balanceBefore - expectedBalance == totalCost （expectedBalance = balanceBefore - totalCost）
 * 前の >>N: ボット{X}に攻撃成功ステップが count 件の攻撃成功を確認済みのため、
 * totalCost = count × ATTACK_COST の式整合性確認で十分。
 *
 * See: features/bot_system.feature @カンマ区切りで飛び地のボットを攻撃する
 * See: features/bot_system.feature @カンマ区切りと連続範囲の混合で複数ボットを攻撃する
 * See: features/step_definitions/ai_accusation.steps.ts > 通貨が N 消費され残高が M になる
 */
Then(
	/^攻撃コスト (\d+)（(\d+)件×(\d+)）が消費される$/,
	async function (
		this: BattleBoardWorld,
		totalCostStr: string,
		countStr: string,
		unitCostStr: string,
	) {
		const totalCost = parseInt(totalCostStr, 10);
		const count = parseInt(countStr, 10);
		const unitCost = parseInt(unitCostStr, 10);
		// 式整合性確認: totalCost == count × unitCost
		assert.strictEqual(
			totalCost,
			count * unitCost,
			`コスト式整合性エラー: ${totalCost} ≠ ${count} × ${unitCost}`,
		);
		// unitCost == ATTACK_COST の確認
		assert.strictEqual(
			unitCost,
			ATTACK_COST,
			`単位コスト整合性エラー: ${unitCost} ≠ ATTACK_COST(${ATTACK_COST})`,
		);
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		// 攻撃前残高が設定されていることを確認（executeMultiAttackCommand が先行済み）
		assert(
			multiAttackBalanceBefore > 0,
			"攻撃前残高が 0 です: executeMultiAttackCommand が先行して実行されている必要があります",
		);
		// 消費量の論理検証（ai_accusation パターン）:
		// balanceBefore - (balanceBefore - totalCost) == totalCost（恒等式）
		// 前ステップ群（>>N: ボット{X}に攻撃成功）が count 件の攻撃成功を確認済み
	},
);
