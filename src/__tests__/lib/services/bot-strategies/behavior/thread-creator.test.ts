/**
 * ThreadCreatorBehaviorStrategy の単体テスト
 *
 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
 * See: features/curation_bot.feature @投稿内容がない場合は元ネタURLのみ>>1に書き込む
 * See: features/curation_bot.feature @投稿済みアイテムは選択候補から除外される
 * See: features/curation_bot.feature @当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする
 * See: features/curation_bot.feature @蓄積データが存在しない場合は投稿をスキップする
 * See: docs/architecture/components/bot.md §2.13.5
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadCreatorBehaviorStrategy } from "../../../../../lib/services/bot-strategies/behavior/thread-creator";
import type {
	CollectedTopic,
	ICollectedTopicRepository,
} from "../../../../../lib/services/bot-strategies/types";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function makeTopic(
	overrides: Partial<CollectedTopic> & { id: string },
): CollectedTopic {
	return {
		id: overrides.id,
		articleTitle: overrides.articleTitle ?? "テスト記事タイトル",
		content: overrides.content !== undefined ? overrides.content : "本文内容",
		sourceUrl: overrides.sourceUrl ?? "https://example.com/thread/123",
		buzzScore: overrides.buzzScore ?? 10,
		collectedDate: overrides.collectedDate ?? "2025-03-28",
	};
}

function makeRepo(
	findUnpostedByBotId: (
		botId: string,
		date: string,
	) => Promise<CollectedTopic[]>,
): ICollectedTopicRepository {
	return {
		save: vi.fn().mockResolvedValue(undefined),
		findUnpostedByBotId,
		markAsPosted: vi.fn().mockResolvedValue(undefined),
	};
}

const BEHAVIOR_CONTEXT = {
	botId: "bot-001",
	botProfileKey: "curation_newsplus",
	boardId: "board-001",
};

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe("ThreadCreatorBehaviorStrategy", () => {
	// 固定日時: 2025-03-28 JST（UTC 2025-03-27 15:00:00）
	const FIXED_NOW_UTC = new Date("2025-03-27T15:00:00.000Z").getTime();

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_UTC);
	});

	describe("decideAction: 当日の未投稿アイテムがある場合", () => {
		it("create_thread アクションを返す", async () => {
			const todayTopic = makeTopic({
				id: "topic-1",
				collectedDate: "2025-03-28",
			});
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return [todayTopic];
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("create_thread");
		});

		it("title が articleTitle と一致する", async () => {
			const todayTopic = makeTopic({
				id: "topic-1",
				articleTitle: "【速報】テスト記事",
				collectedDate: "2025-03-28",
			});
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return [todayTopic];
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("create_thread");
			if (action.type === "create_thread") {
				expect(action.title).toBe("【速報】テスト記事");
			}
		});

		it("content がある場合 body は '{content}\\n\\n元ネタ: {url}' 形式", async () => {
			const todayTopic = makeTopic({
				id: "topic-1",
				content: "本文テキスト",
				sourceUrl: "https://example.com/thread/456",
				collectedDate: "2025-03-28",
			});
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return [todayTopic];
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("create_thread");
			if (action.type === "create_thread") {
				expect(action.body).toBe(
					"本文テキスト\n\n元ネタ: https://example.com/thread/456",
				);
			}
		});

		it("content が null の場合 body は sourceUrl のみ", async () => {
			const todayTopic = makeTopic({
				id: "topic-1",
				content: null,
				sourceUrl: "https://example.com/thread/789",
				collectedDate: "2025-03-28",
			});
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return [todayTopic];
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("create_thread");
			if (action.type === "create_thread") {
				expect(action.body).toBe("https://example.com/thread/789");
			}
		});

		it("_selectedTopicId が選択したトピックの id と一致する", async () => {
			const todayTopic = makeTopic({
				id: "topic-selected",
				collectedDate: "2025-03-28",
			});
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return [todayTopic];
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("create_thread");
			if (action.type === "create_thread") {
				expect(action._selectedTopicId).toBe("topic-selected");
			}
		});
	});

	describe("decideAction: 当日データが全て投稿済み → 前日フォールバック", () => {
		it("前日の未投稿アイテムから選択する", async () => {
			const yesterdayTopic = makeTopic({
				id: "yesterday-topic",
				collectedDate: "2025-03-27",
			});
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return []; // 当日は0件
				if (date === "2025-03-27") return [yesterdayTopic]; // 前日に1件
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("create_thread");
			if (action.type === "create_thread") {
				expect(action._selectedTopicId).toBe("yesterday-topic");
			}
		});
	});

	describe("decideAction: 当日も前日もデータなし → skip", () => {
		it("skip アクションを返す", async () => {
			const repo = makeRepo(async () => []);
			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const action = await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(action.type).toBe("skip");
		});
	});

	describe("decideAction: markAsPosted は呼ばない", () => {
		it("decideAction 内では markAsPosted を呼び出さない", async () => {
			const todayTopic = makeTopic({
				id: "topic-1",
				collectedDate: "2025-03-28",
			});
			const markAsPostedMock = vi.fn().mockResolvedValue(undefined);
			const repo: ICollectedTopicRepository = {
				save: vi.fn().mockResolvedValue(undefined),
				findUnpostedByBotId: async (_botId, date) => {
					if (date === "2025-03-28") return [todayTopic];
					return [];
				},
				markAsPosted: markAsPostedMock,
			};

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			await strategy.decideAction(BEHAVIOR_CONTEXT);

			expect(markAsPostedMock).not.toHaveBeenCalled();
		});
	});

	describe("decideAction: 複数候補からランダム選択", () => {
		it("複数の未投稿アイテムがある場合、全候補のいずれかを選択する", async () => {
			const topics = [
				makeTopic({ id: "topic-A", collectedDate: "2025-03-28" }),
				makeTopic({ id: "topic-B", collectedDate: "2025-03-28" }),
				makeTopic({ id: "topic-C", collectedDate: "2025-03-28" }),
			];
			const repo = makeRepo(async (_botId, date) => {
				if (date === "2025-03-28") return topics;
				return [];
			});

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			const selectedIds = new Set<string>();

			// 30回試行して複数の候補が選ばれることを確認
			for (let i = 0; i < 30; i++) {
				const action = await strategy.decideAction(BEHAVIOR_CONTEXT);
				if (action.type === "create_thread" && action._selectedTopicId) {
					selectedIds.add(action._selectedTopicId);
				}
			}

			// 30回試行で全3候補のうち複数が選ばれる（ランダム性の確認）
			expect(selectedIds.size).toBeGreaterThan(1);
			for (const id of selectedIds) {
				expect(["topic-A", "topic-B", "topic-C"]).toContain(id);
			}
		});
	});

	describe("decideAction: botId をリポジトリに正しく渡す", () => {
		it("findUnpostedByBotId が正しい botId で呼ばれる", async () => {
			const findMock = vi.fn().mockResolvedValue([]);
			const repo: ICollectedTopicRepository = {
				save: vi.fn().mockResolvedValue(undefined),
				findUnpostedByBotId: findMock,
				markAsPosted: vi.fn().mockResolvedValue(undefined),
			};

			const strategy = new ThreadCreatorBehaviorStrategy(repo);
			await strategy.decideAction({ ...BEHAVIOR_CONTEXT, botId: "my-bot-id" });

			expect(findMock).toHaveBeenCalledWith("my-bot-id", expect.any(String));
		});
	});
});
