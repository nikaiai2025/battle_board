/**
 * 単体テスト: HissiHandler（!hissi コマンド）
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: features/investigation.feature @ボットの書き込みに !hissi を実行すると書き込み履歴が表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1
 * See: tmp/design_bot_leak_fix.md §3.4
 *
 * テスト方針:
 *   - PostRepository / ThreadRepository / BotPostRepository は DI でモック化（外部DBに依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（0件・3件・4件以上・エラー系・BOTパス）を網羅する
 *
 * カバレッジ対象:
 *   - 引数なし → エラー
 *   - 対象レスが見つからない → エラー
 *   - システムメッセージ → エラー
 *   - 削除済みレス → エラー
 *   - authorId が null + BotPostRepository 未提供 → エラー
 *   - authorId が null + bot_posts に記録なし → エラー
 *   - authorId が null + BOT書き込み → dailyId で検索し書き込み履歴を返す（BOTパス）
 *   - BOTパス: 書き込み0件 → "本日の書き込みはありません"
 *   - BOTパス: 書き込み2件 → 件数表示
 *   - 書き込み0件 → "本日の書き込みはありません"
 *   - 書き込み1件 → 1件表示 + "1件"
 *   - 書き込み3件 → 3件表示 + "3件"
 *   - 書き込み4件以上 → 最新3件表示 + "N件中3件表示"
 *   - スレッド名が含まれる
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../../../../lib/domain/models/post";
import type { Thread } from "../../../../lib/domain/models/thread";
import type {
	IHissiBotPostRepository,
	IHissiPostRepository,
	IHissiThreadRepository,
} from "../../../../lib/services/handlers/hissi-handler";
import { HissiHandler } from "../../../../lib/services/handlers/hissi-handler";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BOT_ID = "22222222-2222-2222-2222-222222222222";
const TARGET_POST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const THREAD_1_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THREAD_2_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// ---------------------------------------------------------------------------
// テストフィクスチャ生成ヘルパー
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: TARGET_POST_ID,
		threadId: THREAD_1_ID,
		postNumber: 4,
		authorId: USER_ID,
		displayName: "名無しさん",
		dailyId: "Ax8kP2",
		body: "こんにちは",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date("2026-03-20T05:23:15.000Z"), // JST 14:23:15
		...overrides,
	};
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: THREAD_1_ID,
		threadKey: "1742428800",
		boardId: "livebot",
		title: "雑談スレ",
		postCount: 10,
		datByteSize: 0,
		lastPostAt: new Date(),
		createdBy: USER_ID,
		isPinned: false,
		isDormant: false,
		isDeleted: false,
		createdAt: new Date(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// モックリポジトリ
// ---------------------------------------------------------------------------

function makeMockPostRepo(
	overrides: Partial<IHissiPostRepository> = {},
): IHissiPostRepository {
	return {
		findById: vi.fn().mockResolvedValue(makePost()),
		findByAuthorIdAndDate: vi.fn().mockResolvedValue([]),
		findByDailyId: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}

function makeMockThreadRepo(
	overrides: Partial<IHissiThreadRepository> = {},
): IHissiThreadRepository {
	return {
		findById: vi.fn().mockResolvedValue(makeThread()),
		...overrides,
	};
}

function makeMockBotPostRepo(
	overrides: Partial<IHissiBotPostRepository> = {},
): IHissiBotPostRepository {
	return {
		findByPostId: vi.fn().mockResolvedValue({ botId: BOT_ID }),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("HissiHandler", () => {
	let postRepo: IHissiPostRepository;
	let threadRepo: IHissiThreadRepository;
	let botPostRepo: IHissiBotPostRepository;
	let handler: HissiHandler;

	beforeEach(() => {
		postRepo = makeMockPostRepo();
		threadRepo = makeMockThreadRepo();
		botPostRepo = makeMockBotPostRepo();
		handler = new HissiHandler(postRepo, threadRepo, botPostRepo);
	});

	it("commandName が 'hissi' である", () => {
		expect(handler.commandName).toBe("hissi");
	});

	// --- バリデーション: 引数なし ---

	it("引数なしの場合はエラーを返す", async () => {
		const result = await handler.execute({
			args: [],
			postId: "p1",
			threadId: THREAD_1_ID,
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
			threadId: THREAD_1_ID,
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
			threadId: THREAD_1_ID,
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
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("削除されたレスは対象にできません");
	});

	// --- バリデーション: authorId が null + BotPostRepository 未提供 ---

	it("authorId が null かつ BotPostRepository 未提供の場合はエラーを返す", async () => {
		// BotPostRepository なし（従来動作の後方互換テスト）
		const handlerNoBotRepo = new HissiHandler(postRepo, threadRepo);
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null }),
		);
		const result = await handlerNoBotRepo.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
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
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("このレスは対象にできません");
	});

	// --- BOTパス: authorId が null + BOT書き込み ---

	it("BOT書き込みに !hissi を実行すると dailyId で検索した書き込み履歴が返る", async () => {
		// See: features/investigation.feature @ボットの書き込みに !hissi を実行すると書き込み履歴が表示される
		const botPost1 = makePost({
			id: "bot-post-1",
			authorId: null,
			dailyId: "BotDailyX",
			postNumber: 5,
			body: "BOTの書き込み1",
			createdAt: new Date("2026-03-20T06:00:00.000Z"),
		});
		const botPost2 = makePost({
			id: "bot-post-2",
			authorId: null,
			dailyId: "BotDailyX",
			postNumber: 3,
			body: "BOTの書き込み2",
			createdAt: new Date("2026-03-20T04:00:00.000Z"),
		});
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null, dailyId: "BotDailyX" }),
		);
		// findByDailyId が DESC で 2件返す
		vi.mocked(postRepo.findByDailyId).mockResolvedValue([botPost1, botPost2]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toContain("ID:BotDailyX");
		expect(result.independentMessage).toContain("（2件）");
	});

	it("BOT書き込みへの !hissi は「このレスは対象にできません」エラーを返さない（正体暴露されない）", async () => {
		// See: features/investigation.feature @ボットの正体は暴露されない
		// 「このレスは対象にできません」というBOT固有エラーが返らないことを検証する
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null, dailyId: "BotDailyX" }),
		);
		const botPost = makePost({
			id: "bot-post-1",
			authorId: null,
			dailyId: "BotDailyX",
			postNumber: 5,
			body: "こんにちは",
			createdAt: new Date("2026-03-20T06:00:00.000Z"),
		});
		vi.mocked(postRepo.findByDailyId).mockResolvedValue([botPost]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		expect(result.success).toBe(true);
		// BOT固有エラーが含まれないこと
		expect(result.systemMessage).not.toBe("このレスは対象にできません");
		expect(result.independentMessage).not.toContain("対象にできません");
	});

	it("BOT書き込みへの !hissi で書き込みが0件の場合は「本日の書き込みはありません」を返す", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null, dailyId: "BotDailyX" }),
		);
		vi.mocked(postRepo.findByDailyId).mockResolvedValue([]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		expect(result.success).toBe(true);
		expect(result.independentMessage).toBe("本日の書き込みはありません");
	});

	// --- 正常系: 0件 ---

	it("本日の書き込みが0件の場合は「本日の書き込みはありません」を返す", async () => {
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValue([]);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toBe("本日の書き込みはありません");
	});

	// --- 正常系: 1件 ---

	it("書き込み1件の場合は件数「1件」が表示される", async () => {
		const post1 = makePost({
			id: "post-1",
			postNumber: 4,
			body: "こんにちは",
			createdAt: new Date("2026-03-20T05:23:15.000Z"),
		});
		// 全件取得 1回のみ（表示用最新3件はsliceで取得するため2回目のクエリは不要）
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce([post1]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(true);
		expect(result.independentMessage).toContain("（1件）");
		expect(result.independentMessage).not.toContain("中3件表示");
	});

	// --- 正常系: 3件ちょうど ---

	it("書き込み3件の場合は件数「3件」が表示される", async () => {
		const posts = [1, 2, 3].map((n) =>
			makePost({
				id: `post-${n}`,
				postNumber: n + 3,
				body: `本文${n}`,
				createdAt: new Date(`2026-03-20T0${n + 4}:00:00.000Z`),
			}),
		);
		// DESC で返ってくる想定 (3,2,1 の順)
		// 全件取得 1回のみ（表示用最新3件はsliceで取得するため2回目のクエリは不要）
		const postsDesc = [...posts].reverse();
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce(postsDesc);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(true);
		expect(result.independentMessage).toContain("（3件）");
		expect(result.independentMessage).not.toContain("中3件表示");
	});

	// --- 正常系: 5件（4件以上） ---

	it("書き込き5件の場合は「5件中3件表示」と最新3件が表示される", async () => {
		// 全5件 (DESC順: 5,4,3,2,1)
		const allPosts = [5, 4, 3, 2, 1].map((n) =>
			makePost({
				id: `post-${n}`,
				postNumber: n + 3,
				body: `本文${n}`,
				createdAt: new Date(`2026-03-20T0${n + 4}:00:00.000Z`),
			}),
		);
		// 全件取得 1回のみ（表示用最新3件は実装内部で allPosts.slice(0, 3) により取得）
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce(allPosts);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(true);
		expect(result.independentMessage).toContain("（5件中3件表示）");
	});

	// --- 正常系: メッセージフォーマット ---

	it("各レスにスレッド名・レス番号・表示名・ID・時刻・本文が含まれる", async () => {
		const post1 = makePost({
			id: "post-1",
			postNumber: 4,
			dailyId: "Ax8kP2",
			displayName: "名無しさん",
			body: "こんにちは",
			createdAt: new Date("2026-03-20T05:23:15.000Z"), // JST 14:23:15
			threadId: THREAD_1_ID,
		});
		// 全件取得 1回のみ（表示用最新3件はsliceで取得するため2回目のクエリは不要）
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce([post1]);
		vi.mocked(threadRepo.findById).mockResolvedValue(
			makeThread({ id: THREAD_1_ID, title: "雑談スレ" }),
		);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		const msg = result.independentMessage ?? "";
		expect(msg).toContain("[雑談スレ]");
		expect(msg).toContain(">>4");
		expect(msg).toContain("名無しさん");
		expect(msg).toContain("ID:Ax8kP2");
		expect(msg).toContain("14:23:15");
		expect(msg).toContain("こんにちは");
	});

	// --- 正常系: ヘッダに今日のIDが含まれる ---

	it("ヘッダに対象レスの dailyId が含まれる", async () => {
		const post1 = makePost({ dailyId: "Ax8kP2" });
		// 全件取得 1回のみ（表示用最新3件はsliceで取得するため2回目のクエリは不要）
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce([post1]);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.independentMessage).toContain("ID:Ax8kP2 の本日の書き込み");
	});

	// --- 正常系: 複数スレッド横断 ---

	it("異なるスレッドの書き込みがある場合は各スレッド名が含まれる", async () => {
		const post1 = makePost({
			id: "post-1",
			postNumber: 4,
			threadId: THREAD_1_ID,
			createdAt: new Date("2026-03-20T09:00:00.000Z"),
		});
		const post2 = makePost({
			id: "post-2",
			postNumber: 7,
			threadId: THREAD_2_ID,
			createdAt: new Date("2026-03-20T08:00:00.000Z"),
		});
		// 全件取得 1回のみ（表示用最新3件はsliceで取得するため2回目のクエリは不要）
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce([
			post1,
			post2,
		]);
		vi.mocked(threadRepo.findById)
			.mockResolvedValueOnce(makeThread({ id: THREAD_1_ID, title: "雑談スレ" }))
			.mockResolvedValueOnce(
				makeThread({ id: THREAD_2_ID, title: "ゲームスレ" }),
			);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		const msg = result.independentMessage ?? "";
		expect(msg).toContain("[雑談スレ]");
		expect(msg).toContain("[ゲームスレ]");
	});

	// --- 正常系: 時系列順で表示 ---

	it("表示順は時系列順（ASC）である（DECデータを反転する）", async () => {
		// findByAuthorIdAndDate は DESC で返す: post3(18時) → post2(12時) → post1(10時)
		const post3 = makePost({
			id: "post-3",
			postNumber: 20,
			body: "ただいま",
			createdAt: new Date("2026-03-20T09:00:00.000Z"), // JST 18:00
		});
		const post2 = makePost({
			id: "post-2",
			postNumber: 7,
			body: "昼休み",
			createdAt: new Date("2026-03-20T03:00:00.000Z"), // JST 12:00
		});
		const post1 = makePost({
			id: "post-1",
			postNumber: 4,
			body: "おはよう",
			createdAt: new Date("2026-03-20T01:00:00.000Z"), // JST 10:00
		});
		const postsDesc = [post3, post2, post1];
		// 全件取得 1回のみ（表示用最新3件はsliceで取得するため2回目のクエリは不要）
		vi.mocked(postRepo.findByAuthorIdAndDate).mockResolvedValueOnce(postsDesc);

		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});

		// 時系列順: おはよう → 昼休み → ただいま の順に現れること
		const msg = result.independentMessage ?? "";
		const pos1 = msg.indexOf("おはよう");
		const pos2 = msg.indexOf("昼休み");
		const pos3 = msg.indexOf("ただいま");
		expect(pos1).toBeGreaterThanOrEqual(0);
		expect(pos2).toBeGreaterThanOrEqual(0);
		expect(pos3).toBeGreaterThanOrEqual(0);
		expect(pos1).toBeLessThan(pos2);
		expect(pos2).toBeLessThan(pos3);
	});

	// --- 正常系: エラー時は independentMessage なし ---

	it("エラー時は independentMessage を返さない", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ isSystemMessage: true }),
		);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_1_ID,
			userId: USER_ID,
			dailyId: "test-daily-id",
		});
		expect(result.success).toBe(false);
		expect(result.independentMessage).toBeUndefined();
	});
});
