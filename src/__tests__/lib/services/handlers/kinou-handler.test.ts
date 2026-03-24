/**
 * 単体テスト: KinouHandler（!kinou コマンド）
 *
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 * See: features/investigation.feature @ボットの書き込みに !kinou を実行すると昨日のID情報が表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 * See: tmp/design_bot_leak_fix.md §3.5
 *
 * テスト方針:
 *   - PostRepository / BotPostRepository は DI でモック化（外部DBに依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（昨日の書き込みあり/なし・エラー系・BOTパス）を網羅する
 *
 * カバレッジ対象:
 *   - 引数なし → エラー
 *   - 対象レスが見つからない → エラー
 *   - システムメッセージ → エラー
 *   - 削除済みレス → エラー
 *   - authorId が null + BotPostRepository 未提供 → エラー
 *   - authorId が null + bot_posts に記録なし → エラー
 *   - authorId が null + BOT書き込み + 昨日書き込みあり → 昨日 dailyId 表示
 *   - authorId が null + BOT書き込み + 昨日書き込みなし → 「昨日の書き込みがありません」
 *   - 昨日の書き込みあり → "ID:今日のID の昨日のID → ID:昨日のID"
 *   - 昨日の書き込みなし → "ID:今日のID は昨日の書き込みがありません"
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../../../../lib/domain/models/post";
import { generateDailyId } from "../../../../lib/domain/rules/daily-id";
import type {
	IKinouBotPostRepository,
	IKinouPostRepository,
} from "../../../../lib/services/handlers/kinou-handler";
import {
	getBotAuthorIdSeed,
	KinouHandler,
} from "../../../../lib/services/handlers/kinou-handler";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BOT_ID = "22222222-2222-2222-2222-222222222222";
const TARGET_POST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const THREAD_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// テストフィクスチャ生成ヘルパー
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: TARGET_POST_ID,
		threadId: THREAD_ID,
		postNumber: 4,
		authorId: USER_ID,
		displayName: "名無しさん",
		dailyId: "Ax8kP2",
		body: "本文",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-20T05:00:00.000Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// モックリポジトリ
// ---------------------------------------------------------------------------

function makeMockPostRepo(
	overrides: Partial<IKinouPostRepository> = {},
): IKinouPostRepository {
	return {
		findById: vi.fn().mockResolvedValue(makePost()),
		findByAuthorIdAndDate: vi.fn().mockResolvedValue([]),
		findByDailyId: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}

function makeMockBotPostRepo(
	overrides: Partial<IKinouBotPostRepository> = {},
): IKinouBotPostRepository {
	return {
		findByPostId: vi.fn().mockResolvedValue({ botId: BOT_ID }),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("KinouHandler", () => {
	let postRepo: IKinouPostRepository;
	let botPostRepo: IKinouBotPostRepository;
	let handler: KinouHandler;

	beforeEach(() => {
		postRepo = makeMockPostRepo();
		botPostRepo = makeMockBotPostRepo();
		handler = new KinouHandler(postRepo, botPostRepo);
	});

	it("commandName が 'kinou' である", () => {
		expect(handler.commandName).toBe("kinou");
	});

	// --- バリデーション: 引数なし ---

	it("引数なしの場合はエラーを返す", async () => {
		const result = await handler.execute({
			args: [],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toContain("対象レスを指定してください");
		expect(result.independentMessage).toBeUndefined();
	});

	// --- バリデーション: 対象レス不在 ---

	it("対象レスが存在しない場合はエラーを返す", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(null);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toContain("見つかりません");
	});

	// --- バリデーション: システムメッセージ ---

	it("システムメッセージを対象にした場合はエラーを返す", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ isSystemMessage: true }),
		);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("システムメッセージは対象にできません");
	});

	// --- バリデーション: 削除済みレス ---

	it("削除済みレスを対象にした場合はエラーを返す", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ isDeleted: true }),
		);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("削除されたレスは対象にできません");
	});

	// --- バリデーション: authorId が null + BotPostRepository 未提供 ---

	it("authorId が null かつ BotPostRepository 未提供の場合はエラーを返す", async () => {
		// BotPostRepository なし（従来動作の後方互換テスト）
		const handlerNoBotRepo = new KinouHandler(postRepo);
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null }),
		);
		const result = await handlerNoBotRepo.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("このレスは対象にできません");
	});

	// --- バリデーション: authorId が null + bot_posts に記録なし ---

	it("authorId が null かつ bot_posts に記録がない場合はエラーを返す", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null }),
		);
		vi.mocked(botPostRepo.findByPostId).mockResolvedValue(null);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("このレスは対象にできません");
	});

	// --- 正常系: 昨日の書き込みあり ---

	it("昨日の書き込みがある場合は昨日のIDを含むメッセージを返す", async () => {
		const yesterdayPost = makePost({
			id: "yesterday-post",
			dailyId: "Bz3mQ9",
			createdAt: new Date("2026-03-19T05:00:00.000Z"),
		});
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValue([
			yesterdayPost,
		]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toBe("ID:Ax8kP2 の昨日のID → ID:Bz3mQ9");
	});

	// --- 正常系: 昨日の書き込みなし ---

	it("昨日の書き込みがない場合は「昨日の書き込みがありません」を返す", async () => {
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValue([]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toBe(
			"ID:Ax8kP2 は昨日の書き込みがありません",
		);
	});

	// --- 正常系: 今日のIDは対象レスの dailyId を使用する ---

	it("今日のIDとして対象レスの dailyId が使われる", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ dailyId: "Cx9nR3" }),
		);
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValue([]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.independentMessage).toContain("ID:Cx9nR3");
	});

	// --- 正常系: 複数の昨日の書き込みがある場合は最初の1件のIDを使う ---

	it("昨日の書き込みが複数ある場合は最初の1件（最新）の dailyId を使う", async () => {
		// findByAuthorIdAndDate は limit=1 で呼ばれるため、返ってくるのは1件のみ
		const yesterdayPost = makePost({
			dailyId: "Bz3mQ9",
		});
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValue([
			yesterdayPost,
		]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.independentMessage).toContain("ID:Bz3mQ9");
	});

	// --- 正常系: findByAuthorIdAndDate は昨日の日付・limit=1 で呼ばれる ---

	it("findByAuthorIdAndDate は limit=1 オプションで呼ばれる", async () => {
		await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(postRepo.findByAuthorIdAndDate).toHaveBeenCalledWith(
			USER_ID,
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
			{ limit: 1 },
		);
	});

	// --- 正常系: エラー時は independentMessage なし ---

	it("エラー時は independentMessage を返さない", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ isDeleted: true }),
		);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.independentMessage).toBeUndefined();
	});

	// --- BOTパス: authorId が null + BOT書き込み ---

	it("BOT書き込みへの !kinou で昨日の書き込みがある場合は昨日の dailyId を返す", async () => {
		// See: features/investigation.feature @ボットの書き込みに !kinou を実行すると昨日のID情報が表示される
		const botTodayDailyId = "BotToday";
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null, dailyId: botTodayDailyId }),
		);

		// 昨日の dailyId を計算（getBotAuthorIdSeed + generateDailyId）
		const botAuthorIdSeed = getBotAuthorIdSeed(BOT_ID);
		const jstOffset = 9 * 60 * 60 * 1000;
		const now = new Date(Date.now());
		const jstDate = new Date(now.getTime() + jstOffset);
		jstDate.setUTCDate(jstDate.getUTCDate() - 1);
		const yesterdayJst = jstDate.toISOString().slice(0, 10);
		const expectedYesterdayDailyId = generateDailyId(
			botAuthorIdSeed,
			"livebot",
			yesterdayJst,
		);

		// findByDailyId が昨日の dailyId で1件返す
		const yesterdayPost = makePost({
			id: "yesterday-bot-post",
			authorId: null,
			dailyId: expectedYesterdayDailyId,
			createdAt: new Date(`${yesterdayJst}T10:00:00.000Z`),
		});
		vi.mocked(postRepo.findByDailyId).mockResolvedValue([yesterdayPost]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toBe(
			`ID:${botTodayDailyId} の昨日のID → ID:${expectedYesterdayDailyId}`,
		);
	});

	it("BOT書き込みへの !kinou で昨日の書き込みがない場合は「昨日の書き込みがありません」を返す", async () => {
		const botTodayDailyId = "BotToday";
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null, dailyId: botTodayDailyId }),
		);
		// findByDailyId が昨日の dailyId で0件返す
		vi.mocked(postRepo.findByDailyId).mockResolvedValue([]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toBe(
			`ID:${botTodayDailyId} は昨日の書き込みがありません`,
		);
	});

	it("BOT書き込みへの !kinou は「このレスは対象にできません」エラーを返さない（正体暴露されない）", async () => {
		// See: features/investigation.feature @ボットの正体は暴露されない
		// 「このレスは対象にできません」というBOT固有エラーが返らないことを検証する
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null, dailyId: "Zx7nQ4" }),
		);
		vi.mocked(postRepo.findByDailyId).mockResolvedValue([]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		// BOT固有エラーが含まれないこと（正体暴露されないことの検証）
		expect(result.success).toBe(true);
		expect(result.systemMessage).not.toBe("このレスは対象にできません");
		expect(result.independentMessage).not.toContain("対象にできません");
	});

	it("getBotAuthorIdSeed は 'bot-{botId}' 形式の文字列を返す", () => {
		// See: tmp/design_bot_leak_fix.md §5.1
		expect(getBotAuthorIdSeed("test-bot-id")).toBe("bot-test-bot-id");
		expect(getBotAuthorIdSeed(BOT_ID)).toBe(`bot-${BOT_ID}`);
	});
});
