import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { HUMAN_MIMIC_SYSTEM_PROMPT } from "../../config/human-mimic-prompt";
import { botProfilesConfig } from "../../config/bot-profiles";
import { DEFAULT_BOARD_ID } from "../../src/lib/domain/constants";
import { CandidateStockBehaviorStrategy } from "../../src/lib/services/bot-strategies/behavior/candidate-stock";
import type { IGoogleAiAdapter } from "../../src/lib/infrastructure/adapters/google-ai-adapter";
import {
	runHumanMimicCandidateBatch,
} from "../../src/lib/services/human-mimic-candidate-service";
import {
	InMemoryBotPostRepo,
	InMemoryBotRepo,
	InMemoryPostRepo,
	InMemoryReplyCandidateRepo,
	InMemoryThreadRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

type HumanMimicAiMock = IGoogleAiAdapter & {
	calls: Array<{ systemPrompt: string; userPrompt: string; modelId: string }>;
	mode: "success" | "always-fail" | "fail-once";
	callCount: number;
	failOnThreadTitle?: string;
};

function createHumanMimicAiMock(): HumanMimicAiMock {
	return {
		calls: [],
		mode: "success",
		callCount: 0,
		async generate(params) {
			this.calls.push(params);
			this.callCount++;

			if (this.mode === "always-fail") {
				throw new Error("Gemini unavailable");
			}
			if (
				this.failOnThreadTitle &&
				params.userPrompt.includes(`スレッドタイトル: ${this.failOnThreadTitle}`)
			) {
				throw new Error("Gemini unavailable");
			}
			if (this.mode === "fail-once" && this.callCount === 1) {
				throw new Error("Gemini unavailable");
			}

			return {
				text: JSON.stringify(
					Array.from({ length: 10 }, (_, index) => `候補${index + 1}`),
				),
			};
		},
		async generateWithSearch() {
			throw new Error("unused");
		},
	};
}

function createBotService() {
	const { BotService } =
		require("../../src/lib/services/bot-service") as typeof import("../../src/lib/services/bot-service");

	return new BotService(
		InMemoryBotRepo,
		InMemoryBotPostRepo,
		{
			findByAttackerAndBotAndDate: async () => null,
			create: async () => ({}) as any,
			deleteByDateBefore: async () => 0,
		},
		botProfilesConfig,
		InMemoryThreadRepo,
		async (input) => {
			const bot = input.botUserId
				? await InMemoryBotRepo.findById(input.botUserId)
				: null;
			const post = await InMemoryPostRepo.createWithAtomicNumber({
				threadId: input.threadId,
				body: input.body,
				authorId: null,
				displayName: input.displayName ?? "名無しさん",
				dailyId: bot?.dailyId ?? "botdaily",
				inlineSystemInfo: null,
				isSystemMessage: false,
			});
			await InMemoryThreadRepo.incrementPostCount(input.threadId);
			await InMemoryThreadRepo.updateLastPostAt(input.threadId, post.createdAt);
			return {
				success: true as const,
				postId: post.id,
				postNumber: post.postNumber,
				systemMessages: [],
			};
		},
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		InMemoryReplyCandidateRepo.InMemoryReplyCandidateRepo,
	);
}

async function createThread(title: string): Promise<string> {
	const thread = await InMemoryThreadRepo.create({
		threadKey: Math.floor(Date.now() / 1000).toString(),
		boardId: DEFAULT_BOARD_ID,
		title,
		createdBy: "bdd-user",
	});
	return thread.id;
}

async function seedThreadWithPosts(
	title: string,
	postBodies: string[],
): Promise<string> {
	const threadId = await createThread(title);
	for (const [index, body] of postBodies.entries()) {
		const post = await InMemoryPostRepo.createWithAtomicNumber({
			threadId,
			body,
			authorId: `user-${index + 1}`,
			displayName: "名無しさん",
			dailyId: `daily${index + 1}`,
			inlineSystemInfo: null,
			isSystemMessage: false,
		});
		await InMemoryThreadRepo.incrementPostCount(threadId);
		await InMemoryThreadRepo.updateLastPostAt(threadId, post.createdAt);
	}
	return threadId;
}

async function createHumanMimicBot(overrides: Record<string, unknown> = {}) {
	const profile = botProfilesConfig.human_mimic;
	return InMemoryBotRepo.create({
		name: "名無しさん",
		persona: "人間模倣",
		hp: profile.hp,
		maxHp: profile.max_hp,
		dailyId: crypto.randomUUID().slice(0, 8),
		dailyIdDate: new Date(Date.now() + 9 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10),
		isActive: true,
		isRevealed: false,
		revealedAt: null,
		grassCount: 0,
		botProfileKey: "human_mimic",
		nextPostAt: new Date(Date.now() - 60000),
		...overrides,
	});
}

function getAiMock(world: BattleBoardWorld): HumanMimicAiMock {
	const anyWorld = world as any;
	if (!anyWorld.humanMimicAiMock) {
		anyWorld.humanMimicAiMock = createHumanMimicAiMock();
	}
	return anyWorld.humanMimicAiMock as HumanMimicAiMock;
}

Given(
	'スレッド {string} に未投稿の AI回答候補が1件以上存在する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, ["元レス"]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
		InMemoryReplyCandidateRepo._seed({
			botProfileKey: "human_mimic",
			threadId,
			body: "既存候補",
			generatedFromPostCount: 1,
			postedPostId: null,
			postedAt: null,
		});
	},
);

Given(
	'スレッド {string} に未投稿の AI回答候補が存在する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, ["元レス"]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
		InMemoryReplyCandidateRepo._seed({
			botProfileKey: "human_mimic",
			threadId,
			body: "候補1",
			generatedFromPostCount: 1,
			postedPostId: null,
			postedAt: null,
		});
	},
);

Given(
	'スレッド {string} に未投稿の AI回答候補が存在しない',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, ["元レス"]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
	},
);

Given(
	'スレッド {string} に複数のレスが存在する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, [
			"一件目の書き込み",
			"二件目の書き込み",
		]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
	},
);

Given(
	"Gemini API が利用不可である",
	function (this: BattleBoardWorld) {
		const aiMock = getAiMock(this);
		aiMock.mode = "success";
		aiMock.failOnThreadTitle = "A";
	},
);

Given(
	"人間模倣ボットが10体存在する",
	async function (this: BattleBoardWorld) {
		for (let i = 0; i < 10; i++) {
			await createHumanMimicBot();
		}
	},
);

Given(
	'スレッド {string} に未投稿の AI回答候補が1件存在する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, ["元レス"]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
		InMemoryReplyCandidateRepo._seed({
			botProfileKey: "human_mimic",
			threadId,
			body: "候補1",
			generatedFromPostCount: 1,
			postedPostId: null,
			postedAt: null,
		});
	},
);

Given(
	'スレッド {string} に未投稿の AI回答候補が10件存在する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId =
			(this as any).threadIds?.[title] ?? (await seedThreadWithPosts(title, ["元レス"]));
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
		for (let i = 0; i < 10; i++) {
			InMemoryReplyCandidateRepo._seed({
				botProfileKey: "human_mimic",
				threadId,
				body: `候補${i + 1}`,
				generatedFromPostCount: 1,
				postedPostId: null,
				postedAt: null,
				createdAt: new Date(Date.now() + i),
			});
		}
	},
);

Given(
	"アクティブスレッドのうち3件に未投稿の AI回答候補が存在する",
	async function (this: BattleBoardWorld) {
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const title = `候補あり${i + 1}`;
			const threadId = await seedThreadWithPosts(title, ["元レス"]);
			ids.push(threadId);
			InMemoryReplyCandidateRepo._seed({
				botProfileKey: "human_mimic",
				threadId,
				body: `候補${i + 1}`,
				generatedFromPostCount: 1,
				postedPostId: null,
				postedAt: null,
				createdAt: new Date(Date.now() + i),
			});
		}
		(this as any).candidateThreadIds = ids;
	},
);

Given(
	"他のアクティブスレッドには未投稿候補が存在しない",
	async function () {
		await seedThreadWithPosts("候補なし1", ["元レス"]);
		await seedThreadWithPosts("候補なし2", ["元レス"]);
	},
);

Given(
	'スレッド {string} に未投稿の AI回答候補が3件存在する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, ["元レス"]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
		for (let i = 0; i < 3; i++) {
			InMemoryReplyCandidateRepo._seed({
				botProfileKey: "human_mimic",
				threadId,
				body: `${i + 1}件目の候補`,
				generatedFromPostCount: 1,
				postedPostId: null,
				postedAt: null,
				createdAt: new Date(Date.now() + i),
			});
		}
	},
);

Given(
	"それぞれ作成順が 1件目, 2件目, 3件目 である",
	function () {},
);

Given(
	"アクティブスレッドに未投稿の AI回答候補が1件も存在しない",
	async function () {
		await seedThreadWithPosts("候補なしだけ", ["元レス"]);
	},
);

Given(
	"管理者が人間模倣ボットを配置する",
	async function (this: BattleBoardWorld) {
		(this as any).configuredBots = [];
		for (let i = 0; i < 10; i++) {
			(this as any).configuredBots.push(await createHumanMimicBot());
		}
	},
);

Given(
	"人間模倣ボットが潜伏中である",
	async function (this: BattleBoardWorld) {
		(this as any).currentBot = await createHumanMimicBot();
	},
);

Given(
	'人間模倣ボットがスレッド {string} で潜伏中である',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = await seedThreadWithPosts(title, ["元レス"]);
		(this as any).threadIds = { ...(this as any).threadIds, [title]: threadId };
		(this as any).currentBot = await createHumanMimicBot();
		InMemoryReplyCandidateRepo._seed({
			botProfileKey: "human_mimic",
			threadId,
			body: "自然な候補文",
			generatedFromPostCount: 1,
			postedPostId: null,
			postedAt: null,
			createdAt: new Date(),
		});
	},
);

Given(
	"人間模倣ボットの状態が「撃破済み」である",
	async function (this: BattleBoardWorld) {
		(this as any).eliminatedBot = await createHumanMimicBot({
			isActive: false,
			hp: 0,
			eliminatedAt: new Date(Date.now() - 60000),
			eliminatedBy: "attacker-001",
		});
	},
);

When(
	'候補生成バッチが {string} を処理する',
	async function (this: BattleBoardWorld, title: string) {
		const threadId = (this as any).threadIds[title];
		const thread = await InMemoryThreadRepo.findById(threadId);
		const aiMock = getAiMock(this);
		(this as any).batchResult = await runHumanMimicCandidateBatch({
			threadRepository: {
				findByBoardId: async () => [{ id: threadId, title: thread?.title }],
			},
			postRepository: {
				findByThreadId: (id: string) => InMemoryPostRepo.findByThreadId(id),
			},
			replyCandidateRepository: InMemoryReplyCandidateRepo.InMemoryReplyCandidateRepo,
			googleAiAdapter: aiMock,
		});
	},
);

When(
	'候補生成バッチが {string} の候補を作成する',
	async function (this: BattleBoardWorld, title: string) {
		await (this as any).runStep?.();
		const threadId = (this as any).threadIds[title];
		const thread = await InMemoryThreadRepo.findById(threadId);
		const aiMock = getAiMock(this);
		(this as any).batchResult = await runHumanMimicCandidateBatch({
			threadRepository: {
				findByBoardId: async () => [{ id: threadId, title: thread?.title }],
			},
			postRepository: {
				findByThreadId: (id: string) => InMemoryPostRepo.findByThreadId(id),
			},
			replyCandidateRepository: InMemoryReplyCandidateRepo.InMemoryReplyCandidateRepo,
			googleAiAdapter: aiMock,
		});
	},
);

When(
	"候補生成バッチがアクティブ50スレッドを処理する",
	async function (this: BattleBoardWorld) {
		const aiMock = getAiMock(this);
		(this as any).batchResult = await runHumanMimicCandidateBatch({
			threadRepository: InMemoryThreadRepo,
			postRepository: {
				findByThreadId: (id: string) => InMemoryPostRepo.findByThreadId(id),
			},
			replyCandidateRepository: InMemoryReplyCandidateRepo.InMemoryReplyCandidateRepo,
			googleAiAdapter: aiMock,
		});
	},
);

When(
	"候補在庫を参照する",
	function () {},
);

When(
	"人間模倣ボットが投稿先を決定する",
	async function (this: BattleBoardWorld) {
		const strategy = new CandidateStockBehaviorStrategy(
			InMemoryThreadRepo,
			InMemoryReplyCandidateRepo.InMemoryReplyCandidateRepo,
		);
		(this as any).selectedAction = await strategy.decideAction({
			botId: "bot-001",
			botProfileKey: "human_mimic",
			boardId: DEFAULT_BOARD_ID,
		});
	},
);

When(
	'人間模倣ボットが {string} に書き込む',
	async function (this: BattleBoardWorld, _title: string) {
		const bot = await createHumanMimicBot();
		(this as any).currentBot = bot;
		(this as any).postResult = await createBotService().executeBotPost(bot.id);
	},
);

When(
	"人間模倣ボットが書き込みを行う",
	async function (this: BattleBoardWorld) {
		const bot = await createHumanMimicBot();
		(this as any).currentBot = bot;
		(this as any).postResult = await createBotService().executeBotPost(bot.id);
	},
);

When(
	"人間模倣ボットがその候補を投稿する",
	async function (this: BattleBoardWorld) {
		const bot = await createHumanMimicBot();
		(this as any).currentBot = bot;
		(this as any).postResult = await createBotService().executeBotPost(bot.id);
	},
);

When(
	"人間模倣ボットの投稿タイミングが来る",
	async function (this: BattleBoardWorld) {
		const bot = await createHumanMimicBot();
		(this as any).currentBot = bot;
		(this as any).postResult = await createBotService().executeBotPost(bot.id);
	},
);

When(
	"ボットが候補文を1件投稿する",
	async function (this: BattleBoardWorld) {
		const bot = (this as any).currentBot ?? (await createHumanMimicBot());
		(this as any).currentBot = bot;
		(this as any).postResult = await createBotService().executeBotPost(bot.id);
	},
);

When(
	"人間模倣ボットの定期実行が行われる",
	function (this: BattleBoardWorld) {
		(this as any).generatedDelays = Array.from({ length: 30 }, () =>
			createBotService().getNextPostDelay("bot-001", "human_mimic"),
		);
	},
);

When(
	"人間模倣ボットの日次リセットが実行される",
	async function (this: BattleBoardWorld) {
		(this as any).dailyResetResult = await createBotService().performDailyReset();
	},
);

Then("AI API は呼び出されない", function (this: BattleBoardWorld) {
	assert.strictEqual(getAiMock(this).calls.length, 0);
});

Then("既存候補はそのまま保持される", function () {
	assert.strictEqual(InMemoryReplyCandidateRepo._getAll().length >= 1, true);
});

Then("AI API が1回呼び出される", function (this: BattleBoardWorld) {
	assert.strictEqual(getAiMock(this).calls.length, 1);
});

Then(
	'{string} 向けの AI回答候補が10件保存される',
	function (this: BattleBoardWorld, title: string) {
		const threadId = (this as any).threadIds[title];
		const count = InMemoryReplyCandidateRepo._getAll().filter(
			(item) => item.threadId === threadId && item.postedAt === null,
		).length;
		assert.strictEqual(count, 10);
	},
);

Then("AI API にスレッド本文がコンテキストとして渡される", function (this: BattleBoardWorld) {
	const call = getAiMock(this).calls[0];
	assert(call.userPrompt.includes("一件目の書き込み"));
	assert(call.userPrompt.includes("二件目の書き込み"));
});

Then("AI API に人間模倣用のシステムプロンプトが渡される", function (this: BattleBoardWorld) {
	assert.strictEqual(getAiMock(this).calls[0].systemPrompt, HUMAN_MIMIC_SYSTEM_PROMPT);
});

Then(
	"人間模倣候補のスレッド本文はシステムプロンプトとは別メッセージで渡される",
	function (this: BattleBoardWorld) {
		const call = getAiMock(this).calls[0];
		assert.notStrictEqual(call.systemPrompt, call.userPrompt);
	},
);

Then('スレッド {string} には新しい候補が保存されない', function (this: BattleBoardWorld, title: string) {
	const threadId = (this as any).threadIds[title];
	const count = InMemoryReplyCandidateRepo._getAll().filter((item) => item.threadId === threadId).length;
	assert.strictEqual(count, 0);
});

Then('スレッド {string} には AI回答候補が10件保存される', function (this: BattleBoardWorld, title: string) {
	const threadId = (this as any).threadIds[title];
	const count = InMemoryReplyCandidateRepo._getAll().filter((item) => item.threadId === threadId).length;
	assert.strictEqual(count, 10);
});

Then(
	"10件の候補は個別BOTではなく人間模倣ボット全体の共有在庫として扱われる",
	function () {
		const candidates = InMemoryReplyCandidateRepo._getAll();
		assert.strictEqual(candidates.length, 10);
		assert(candidates.every((candidate) => candidate.botProfileKey === "human_mimic"));
	},
);

Then(
	"未投稿候補がある3件の中からランダムに1件が選択される",
	function (this: BattleBoardWorld) {
		const action = (this as any).selectedAction;
		assert.strictEqual(action.type, "post_to_existing");
		assert((this as any).candidateThreadIds.includes(action.threadId));
	},
);

Then("1件目の候補が投稿される", async function (this: BattleBoardWorld) {
	const post = await InMemoryPostRepo.findById((this as any).postResult.postId);
	assert(post);
	assert.strictEqual(post.body, "1件目の候補");
});

Then("2件目と3件目は未投稿のまま残る", function () {
	const remaining = InMemoryReplyCandidateRepo._getAll().filter(
		(item) => item.postedAt === null,
	);
	assert(remaining.some((item) => item.body === "2件目の候補"));
	assert(remaining.some((item) => item.body === "3件目の候補"));
});

Then("保存済み候補だけが使用される", async function (this: BattleBoardWorld) {
	const post = await InMemoryPostRepo.findById((this as any).postResult.postId);
	assert(post);
	assert(post.body.includes("候補") || post.body.includes("自然な候補文"));
});

Then("その候補は投稿済みになる", function () {
	const posted = InMemoryReplyCandidateRepo._getAll().filter(
		(item) => item.postedAt !== null,
	);
	assert.strictEqual(posted.length, 1);
});

Then("次回以降の選択候補から除外される", function () {
	const remaining = InMemoryReplyCandidateRepo._getAll().filter(
		(item) => item.postedAt === null,
	);
	assert.strictEqual(remaining.length, 0);
});

Then("投稿はスキップされる", function (this: BattleBoardWorld) {
	assert.strictEqual((this as any).postResult, null);
});

Then(
	'人間模倣ボットの表示名は {string} である',
	async function (this: BattleBoardWorld, expectedName: string) {
		const post = await InMemoryPostRepo.findById((this as any).postResult.postId);
		assert(post);
		assert.strictEqual(post.displayName, expectedName);
	},
);

Then("偽装日次リセットIDが表示される", async function (this: BattleBoardWorld) {
	const post = await InMemoryPostRepo.findById((this as any).postResult.postId);
	assert(post);
	assert(post.dailyId.length > 0);
});

Then("表示フォーマットは人間の書き込みと同一である", async function (this: BattleBoardWorld) {
	const post = await InMemoryPostRepo.findById((this as any).postResult.postId);
	assert(post);
	assert.strictEqual(post.isSystemMessage, false);
});

Then("人間模倣ボットは10体が存在する", async function () {
	const bots = (await InMemoryBotRepo.findAll()).filter(
		(bot) => bot.botProfileKey === "human_mimic",
	);
	assert.strictEqual(bots.length, 10);
});

Then("人間模倣ボットはそれぞれ異なる日次リセットIDを持つ", async function () {
	const bots = (await InMemoryBotRepo.findAll()).filter(
		(bot) => bot.botProfileKey === "human_mimic",
	);
	assert.strictEqual(new Set(bots.map((bot) => bot.dailyId)).size, bots.length);
});

Then("各ボットのHPは 10 である", async function () {
	const bots = (await InMemoryBotRepo.findAll()).filter(
		(bot) => bot.botProfileKey === "human_mimic",
	);
	assert(bots.every((bot) => bot.hp === 10 && bot.maxHp === 10));
});

Then(
	"人間模倣ボットの書き込み間隔は1時間以上2時間以下のランダムな値である",
	function (this: BattleBoardWorld) {
		const delays: number[] = (this as any).generatedDelays;
		assert(delays.every((delay) => delay >= 60 && delay <= 120));
		assert(new Set(delays).size > 1);
	},
);

Then("人間模倣ボットの状態が「潜伏中」に復帰する", async function () {
	const bots = (await InMemoryBotRepo.findAll()).filter(
		(bot) => bot.botProfileKey === "human_mimic" && bot.isActive,
	);
	assert(bots.length >= 1);
});

Then("人間模倣ボットのHPが初期値 10 にリセットされる", async function () {
	const bots = (await InMemoryBotRepo.findAll()).filter(
		(bot) => bot.botProfileKey === "human_mimic" && bot.isActive,
	);
	assert(bots.some((bot) => bot.hp === 10));
});

Then("人間模倣ボットに新しい偽装IDが割り当てられる", async function (this: BattleBoardWorld) {
	const oldBot = (this as any).eliminatedBot;
	const bots = (await InMemoryBotRepo.findAll()).filter(
		(bot) => bot.botProfileKey === "human_mimic" && bot.isActive,
	);
	assert(bots.some((bot) => bot.dailyId !== oldBot.dailyId));
});
