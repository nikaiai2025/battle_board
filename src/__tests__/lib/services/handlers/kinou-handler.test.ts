/**
 * 単体テスト: KinouHandler（!kinou コマンド）
 *
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.2
 *
 * テスト方針:
 *   - PostRepository は DI でモック化（外部DBに依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（昨日の書き込みあり/なし・エラー系）を網羅する
 *
 * カバレッジ対象:
 *   - 引数なし → エラー
 *   - 対象レスが見つからない → エラー
 *   - システムメッセージ → エラー
 *   - 削除済みレス → エラー
 *   - authorId が null → エラー
 *   - 昨日の書き込みあり → "ID:今日のID の昨日のID → ID:昨日のID"
 *   - 昨日の書き込みなし → "ID:今日のID は昨日の書き込みがありません"
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../../../../lib/domain/models/post";
import type { IKinouPostRepository } from "../../../../lib/services/handlers/kinou-handler";
import { KinouHandler } from "../../../../lib/services/handlers/kinou-handler";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const USER_ID = "11111111-1111-1111-1111-111111111111";
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
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("KinouHandler", () => {
	let postRepo: IKinouPostRepository;
	let handler: KinouHandler;

	beforeEach(() => {
		postRepo = makeMockPostRepo();
		handler = new KinouHandler(postRepo);
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
		});
		expect(result.success).toBe(false);
		expect(result.systemMessage).toBe("削除されたレスは対象にできません");
	});

	// --- バリデーション: authorId が null ---

	it("authorId が null のレスを対象にした場合はエラーを返す", async () => {
		vi.mocked(postRepo.findById).mockResolvedValue(
			makePost({ authorId: null }),
		);
		const result = await handler.execute({
			args: [TARGET_POST_ID],
			postId: "p1",
			threadId: THREAD_ID,
			userId: USER_ID,
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
		});
		expect(result.success).toBe(false);
		expect(result.independentMessage).toBeUndefined();
	});
});
