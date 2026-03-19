/**
 * 単体テスト: post-service.ts（PostService）
 *
 * See: features/posting.feature
 * See: features/thread.feature
 * See: features/incentive.feature @PostService経由の統合
 * See: docs/architecture/components/posting.md §2 公開インターフェース
 *
 * テスト方針:
 *   - 依存するリポジトリ・サービスはすべてモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（空本文・未認証・スレッド不存在等）を網羅する
 *   - IncentiveService 統合テスト: evaluateOnPost の呼び出し・失敗時の巻き戻し禁止
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	create: vi.fn(),
	findByThreadId: vi.fn(),
	getNextPostNumber: vi.fn(),
	findById: vi.fn(),
	findByAuthorId: vi.fn(),
	softDelete: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/thread-repository", () => ({
	create: vi.fn(),
	findById: vi.fn(),
	findByBoardId: vi.fn(),
	incrementPostCount: vi.fn(),
	updateLastPostAt: vi.fn(),
	findByThreadKey: vi.fn(),
	updateDatByteSize: vi.fn(),
	softDelete: vi.fn(),
	// 休眠管理関数（TASK-203 で追加）
	// See: docs/specs/thread_state_transitions.yaml #transitions
	wakeThread: vi.fn(),
	demoteOldestActiveThread: vi.fn(),
	countActiveThreads: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	findByAuthToken: vi.fn(),
	create: vi.fn(),
	updateAuthToken: vi.fn(),
	updateStreak: vi.fn(),
	updateUsername: vi.fn(),
	updateIsVerified: vi.fn(),
	// BAN システム関連（TASK-105 で追加）
	// See: features/admin.feature @BANされたユーザーの書き込みが拒否される
	updateIsBanned: vi.fn(),
	updateLastIpHash: vi.fn(),
}));

vi.mock("@/lib/services/auth-service", () => ({
	verifyEdgeToken: vi.fn(),
	issueEdgeToken: vi.fn(),
	issueAuthCode: vi.fn(),
	verifyWriteToken: vi.fn(),
	hashIp: vi.fn(),
	reduceIp: vi.fn(),
	// BAN チェック（TASK-105 で追加）
	// See: features/admin.feature @BANされたIPからの書き込みが拒否される
	isIpBanned: vi.fn().mockResolvedValue(false),
	isUserBanned: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/services/incentive-service", () => ({
	evaluateOnPost: vi.fn(),
}));

vi.mock("@/lib/domain/rules/daily-id", () => ({
	generateDailyId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import type { Post } from "@/lib/domain/models/post";
import type { Thread } from "@/lib/domain/models/thread";
import type { User } from "@/lib/domain/models/user";
import { generateDailyId } from "@/lib/domain/rules/daily-id";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import * as AuthService from "@/lib/services/auth-service";
import * as IncentiveService from "@/lib/services/incentive-service";
import {
	createPost,
	createThread,
	getPostList,
	getThread,
	getThreadList,
} from "../post-service";

// ---------------------------------------------------------------------------
// テストフィクスチャ
// ---------------------------------------------------------------------------

const mockUser: User = {
	id: "user-001",
	authToken: "token-abc",
	authorIdSeed: "seed-abc",
	isPremium: false,
	isVerified: true,
	username: null,
	streakDays: 0,
	lastPostDate: null,
	createdAt: new Date("2026-01-01"),
	// Phase 3: 本登録・PAT 関連フィールド（デフォルトは仮ユーザー状態）
	// See: features/user_registration.feature
	supabaseAuthId: null,
	registrationType: null,
	registeredAt: null,
	patToken: null,
	patLastUsedAt: null,
	// Phase 4: 草コマンド関連フィールド
	// See: features/reactions.feature
	grassCount: 0,
	// Phase 5: BAN システム関連フィールド
	// See: features/admin.feature @ユーザーBAN
	isBanned: false,
	lastIpHash: null,
};

const mockPremiumUser: User = {
	id: "user-002",
	authToken: "token-xyz",
	authorIdSeed: "seed-xyz",
	isPremium: true,
	isVerified: true,
	username: "バトラー太郎",
	streakDays: 5,
	lastPostDate: "2026-03-08",
	createdAt: new Date("2026-01-01"),
	// Phase 3: 本登録・PAT 関連フィールド（デフォルトは仮ユーザー状態）
	// See: features/user_registration.feature
	supabaseAuthId: null,
	registrationType: null,
	registeredAt: null,
	patToken: null,
	patLastUsedAt: null,
	// Phase 4: 草コマンド関連フィールド
	// See: features/reactions.feature
	grassCount: 0,
	// Phase 5: BAN システム関連フィールド
	// See: features/admin.feature @ユーザーBAN
	isBanned: false,
	lastIpHash: null,
};

const mockPost: Post = {
	id: "post-001",
	threadId: "thread-001",
	postNumber: 1,
	authorId: "user-001",
	displayName: "名無しさん",
	dailyId: "abcd1234",
	body: "こんにちは",
	inlineSystemInfo: null,
	isSystemMessage: false,
	isDeleted: false,
	createdAt: new Date("2026-03-09"),
};

const mockThread: Thread = {
	id: "thread-001",
	threadKey: "1741471200",
	boardId: "battleboard",
	title: "今日の雑談",
	postCount: 0,
	datByteSize: 0,
	createdBy: "user-001",
	createdAt: new Date("2026-03-09"),
	lastPostAt: new Date("2026-03-09"),
	isDeleted: false,
	// See: features/thread.feature @pinned_thread
	isPinned: false,
	// See: docs/specs/thread_state_transitions.yaml #states.listed
	isDormant: false,
};

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("PostService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// generateDailyId のデフォルトモック
		vi.mocked(generateDailyId).mockReturnValue("abcd1234");
		// IncentiveService のデフォルトモック（成功・何も付与しない）
		vi.mocked(IncentiveService.evaluateOnPost).mockResolvedValue({
			granted: [],
			skipped: [],
		});
		// PostRepository.findByThreadId のデフォルトモック（アンカー解析用）
		vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);
		// ThreadRepository.findById のデフォルトモック（Step 0: 固定スレッドチェック）
		vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);
		// ThreadRepository 休眠管理関数のデフォルトモック（Step 10b）
		// See: docs/specs/thread_state_transitions.yaml #transitions
		vi.mocked(ThreadRepository.wakeThread).mockResolvedValue(undefined);
		vi.mocked(ThreadRepository.demoteOldestActiveThread).mockResolvedValue(
			undefined,
		);
		// デフォルトはアクティブスレッド数 < 50（休眠化不要）
		vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(1);
	});

	// =========================================================================
	// createPost: 書き込み処理
	// =========================================================================

	describe("createPost", () => {
		// -----------------------------------------------------------------------
		// 正常系: 認証済みユーザー（無料）
		// -----------------------------------------------------------------------

		describe("正常系: 認証済み無料ユーザーが書き込みを行う", () => {
			// See: features/posting.feature @無料ユーザーが書き込みを行う

			it("書き込みが成功し PostResult(success:true) を返す", async () => {
				// Arrange
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				// Act
				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert
				expect(result).toMatchObject({
					success: true,
					postId: "post-001",
					postNumber: 1,
					systemMessages: [],
				});
			});

			it("表示名のデフォルトは「名無しさん」である", async () => {
				// See: features/posting.feature @無料ユーザーが書き込みを行う
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// PostRepository.create が「名無しさん」で呼ばれることを検証
				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ displayName: "名無しさん" }),
				);
			});

			it("日次リセットIDが生成されレスに付与される", async () => {
				// See: features/posting.feature @無料ユーザーが書き込みを行う
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(2);
				vi.mocked(PostRepository.create).mockResolvedValue({
					...mockPost,
					postNumber: 2,
				});
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(generateDailyId).mockReturnValue("xyz99999");

				await createPost({
					threadId: "thread-001",
					body: "テスト",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(generateDailyId).toHaveBeenCalled();
				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ dailyId: "xyz99999" }),
				);
			});

			it("書き込み後に ThreadRepository.incrementPostCount と updateLastPostAt が呼ばれる", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(ThreadRepository.incrementPostCount).toHaveBeenCalledWith(
					"thread-001",
				);
				expect(ThreadRepository.updateLastPostAt).toHaveBeenCalledWith(
					"thread-001",
					expect.any(Date),
				);
			});
		});

		// -----------------------------------------------------------------------
		// 正常系: 認証済みユーザー（有料）
		// -----------------------------------------------------------------------

		describe("正常系: 認証済み有料ユーザーがユーザーネーム付きで書き込む", () => {
			// See: features/posting.feature @有料ユーザーがユーザーネーム付きで書き込みを行う

			it("有料ユーザーのユーザーネームが表示名として使用される", async () => {
				const premiumPost = {
					...mockPost,
					displayName: "バトラー太郎",
					authorId: "user-002",
				};
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-002",
					authorIdSeed: "seed-xyz",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockPremiumUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(premiumPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-xyz",
					ipHash: "seed-xyz",
					isBotWrite: false,
				});

				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ displayName: "バトラー太郎" }),
				);
			});

			it("displayName が明示的に指定された場合はその値を使用する", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue({
					...mockPost,
					displayName: "テストユーザー",
				});
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					displayName: "テストユーザー",
					isBotWrite: false,
				});

				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ displayName: "テストユーザー" }),
				);
			});
		});

		// -----------------------------------------------------------------------
		// 正常系: ボット書き込み（isBotWrite=true）
		// -----------------------------------------------------------------------

		describe("正常系: isBotWrite=true の場合は認証をスキップする", () => {
			it("edgeToken が null でも書き込みが成功する", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				const result = await createPost({
					threadId: "thread-001",
					body: "ボットの書き込み",
					edgeToken: null,
					ipHash: "bot-ip-hash",
					isBotWrite: true,
				});

				// isBotWrite=true の場合、verifyEdgeToken は呼ばれない
				expect(AuthService.verifyEdgeToken).not.toHaveBeenCalled();
				expect(result).toMatchObject({ success: true });
			});
		});

		// -----------------------------------------------------------------------
		// 未認証: edge-token なし → 認証フロー起動
		// -----------------------------------------------------------------------

		describe("未認証: edge-token が null の場合に認証フローを起動する", () => {
			// See: docs/architecture/architecture.md §5.1 一般ユーザー認証

			it("authRequired:true のレスポンスを返し、edgeToken と code を含む", async () => {
				vi.mocked(AuthService.issueEdgeToken).mockResolvedValue({
					token: "new-edge-token",
					userId: "user-new",
				});
				vi.mocked(AuthService.issueAuthCode).mockResolvedValue({
					code: "123456",
					expiresAt: new Date(),
				});

				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: null,
					ipHash: "ip-hash-xyz",
					isBotWrite: false,
				});

				expect(result).toMatchObject({
					authRequired: true,
					edgeToken: "new-edge-token",
					code: "123456",
				});
				expect(AuthService.issueEdgeToken).toHaveBeenCalledWith("ip-hash-xyz");
				expect(AuthService.issueAuthCode).toHaveBeenCalledWith(
					"ip-hash-xyz",
					"new-edge-token",
				);
			});

			it("edge-token が not_found の場合も認証フローを起動する", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: false,
					reason: "not_found",
				});
				vi.mocked(AuthService.issueEdgeToken).mockResolvedValue({
					token: "new-edge-token",
					userId: "user-new",
				});
				vi.mocked(AuthService.issueAuthCode).mockResolvedValue({
					code: "654321",
					expiresAt: new Date(),
				});

				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "invalid-token",
					ipHash: "ip-hash-xyz",
					isBotWrite: false,
				});

				expect(result).toMatchObject({ authRequired: true });
			});

			it("edge-token が not_verified の場合は既存 edge-token を維持して認証コードを再発行する（G1 是正）", async () => {
				// See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: false,
					reason: "not_verified",
				});
				vi.mocked(AuthService.issueAuthCode).mockResolvedValue({
					code: "999888",
					expiresAt: new Date(),
				});

				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "existing-unverified-token",
					ipHash: "ip-hash-xyz",
					isBotWrite: false,
				});

				// 認証フローが起動され、既存の edge-token が維持されること
				expect(result).toMatchObject({
					authRequired: true,
					edgeToken: "existing-unverified-token",
					code: "999888",
				});
				// 新規 edge-token は発行されない（既存を維持）
				expect(AuthService.issueEdgeToken).not.toHaveBeenCalled();
				// 既存 edge-token に紐づく認証コードを再発行
				expect(AuthService.issueAuthCode).toHaveBeenCalledWith(
					"ip-hash-xyz",
					"existing-unverified-token",
				);
			});
		});

		// -----------------------------------------------------------------------
		// IPアドレス変更時の認証（投稿時 IP チェック廃止）
		// -----------------------------------------------------------------------

		describe("IPアドレスが変わっても認証済みなら書き込みが成功する", () => {
			// See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
			// 投稿時の IP チェックは廃止。verifyEdgeToken は「存在 + is_verified」のみで判定する。

			it("IPが変わっても is_verified=true なら書き込みが成功する", async () => {
				// verifyEdgeToken は IP チェックなしで valid: true を返す
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "different-ip-hash", // 登録時と異なるIPハッシュ
					isBotWrite: false,
				});

				// IP が変わっても書き込みが成功すること
				expect(result).toMatchObject({ success: true });
				// resolveAuth が UserRepository.findByAuthToken を追加で呼び出さないこと（ip_mismatch 分岐廃止）
				expect(UserRepository.findByAuthToken).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// バリデーションエラー
		// -----------------------------------------------------------------------

		describe("バリデーション: 本文が空の場合はエラーを返す", () => {
			// See: features/posting.feature @本文が空の場合は書き込みが行われない

			it("空文字列の本文でエラーを返す", async () => {
				const result = await createPost({
					threadId: "thread-001",
					body: "",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(result).toMatchObject({
					success: false,
					code: "EMPTY_BODY",
				});
			});

			it("スペースのみの本文でエラーを返す", async () => {
				const result = await createPost({
					threadId: "thread-001",
					body: "   ",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(result).toMatchObject({
					success: false,
					code: "EMPTY_BODY",
				});
			});

			it("最大文字数超過の本文でエラーを返す", async () => {
				const longBody = "a".repeat(2001);

				const result = await createPost({
					threadId: "thread-001",
					body: longBody,
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(result).toMatchObject({
					success: false,
					code: "BODY_TOO_LONG",
				});
			});

			it("バリデーションエラー時は認証・DB操作が呼ばれない", async () => {
				await createPost({
					threadId: "thread-001",
					body: "",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(AuthService.verifyEdgeToken).not.toHaveBeenCalled();
				expect(PostRepository.create).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// IncentiveService 統合テスト
		// -----------------------------------------------------------------------

		describe("IncentiveService 統合: 書き込み成功後に evaluateOnPost が呼ばれる", () => {
			// See: features/incentive.feature @PostService経由の統合
			// See: docs/architecture/components/incentive.md §5 設計上の判断

			it("createPost 成功後に IncentiveService.evaluateOnPost が呼ばれる", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// 書き込み成功かつ IncentiveService が2回呼ばれていること（二段階評価）
				// Phase 1: 同期ボーナス（INSERT前）、Phase 2: 遅延評価ボーナス（INSERT後）
				// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
				expect(result).toMatchObject({ success: true });
				expect(IncentiveService.evaluateOnPost).toHaveBeenCalledTimes(2);
				// Phase 1: 同期ボーナス（INSERT前、仮postId）
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						threadId: "thread-001",
						postNumber: 1,
					}),
					{ phase: "sync" },
				);
				// Phase 2: 遅延評価ボーナス（INSERT後、実postId）
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					2,
					expect.objectContaining({
						threadId: "thread-001",
						postNumber: 1,
						postId: "post-001",
					}),
					{ phase: "deferred" },
				);
			});

			it("IncentiveService が失敗しても書き込み結果は success:true を返す", async () => {
				// See: docs/architecture/components/incentive.md §5 インセンティブ失敗は書き込みを巻き戻さない
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);
				// IncentiveService が例外をスローする
				vi.mocked(IncentiveService.evaluateOnPost).mockRejectedValue(
					new Error("IncentiveService error"),
				);

				const result = await createPost({
					threadId: "thread-001",
					body: "こんにちは",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// IncentiveService が失敗しても書き込みは成功扱い
				expect(result).toMatchObject({
					success: true,
					postId: "post-001",
					postNumber: 1,
					systemMessages: [],
				});
			});

			it("アンカー（>>N）を含む本文では isReplyTo に対象レスIDが設定される", async () => {
				// See: features/incentive.feature @返信ボーナス
				const anchorTargetPost: Post = {
					id: "post-target-001",
					threadId: "thread-001",
					postNumber: 1,
					authorId: "user-002",
					displayName: "名無しさん",
					dailyId: "target1234",
					body: "最初のレス",
					inlineSystemInfo: null,
					isSystemMessage: false,
					isDeleted: false,
					createdAt: new Date("2026-03-09"),
				};
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(2);
				vi.mocked(PostRepository.create).mockResolvedValue({
					...mockPost,
					postNumber: 2,
					id: "post-002",
				});
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				// アンカー先レスを返す
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
					anchorTargetPost,
				]);

				await createPost({
					threadId: "thread-001",
					body: ">>1 返信します",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// isReplyTo にアンカー先レスのID が設定されていること（Phase 1: 同期ボーナス）
				// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						isReplyTo: "post-target-001",
					}),
					{ phase: "sync" },
				);
			});

			it("アンカー先レスが存在しない場合は isReplyTo が undefined となる", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(2);
				vi.mocked(PostRepository.create).mockResolvedValue({
					...mockPost,
					postNumber: 2,
				});
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				// アンカー先レスが存在しない
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

				await createPost({
					threadId: "thread-001",
					body: ">>999 存在しないレスへのアンカー",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Phase 1: 同期ボーナスで isReplyTo が undefined であること
				// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						isReplyTo: undefined,
					}),
					{ phase: "sync" },
				);
			});

			it("アンカー先レスの authorId が null の場合は isReplyTo が undefined となる", async () => {
				const anonymousPost: Post = {
					id: "post-anon-001",
					threadId: "thread-001",
					postNumber: 1,
					authorId: null, // authorId が null（匿名）
					displayName: "名無しさん",
					dailyId: "anon1234",
					body: "匿名のレス",
					inlineSystemInfo: null,
					isSystemMessage: false,
					isDeleted: false,
					createdAt: new Date("2026-03-09"),
				};
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(2);
				vi.mocked(PostRepository.create).mockResolvedValue({
					...mockPost,
					postNumber: 2,
				});
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
					anonymousPost,
				]);

				await createPost({
					threadId: "thread-001",
					body: ">>1 匿名レスへのアンカー",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Phase 1: 同期ボーナスで isReplyTo が undefined であること
				// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						isReplyTo: undefined,
					}),
					{ phase: "sync" },
				);
			});

			it("アンカーなしの本文では isReplyTo が undefined となる", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

				await createPost({
					threadId: "thread-001",
					body: "アンカーなしの通常の書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Phase 1: 同期ボーナスで isReplyTo プロパティが含まれないこと
				// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					1,
					expect.not.objectContaining({
						isReplyTo: expect.anything(),
					}),
					{ phase: "sync" },
				);
			});

			it("複数アンカーがある場合は最初のアンカー先レスのIDが isReplyTo に設定される", async () => {
				const post1: Post = {
					id: "post-first-001",
					threadId: "thread-001",
					postNumber: 1,
					authorId: "user-002",
					displayName: "名無しさん",
					dailyId: "first1234",
					body: "最初のレス",
					inlineSystemInfo: null,
					isSystemMessage: false,
					isDeleted: false,
					createdAt: new Date("2026-03-09"),
				};
				const post3: Post = {
					id: "post-third-003",
					threadId: "thread-001",
					postNumber: 3,
					authorId: "user-003",
					displayName: "名無しさん",
					dailyId: "third1234",
					body: "3番目のレス",
					inlineSystemInfo: null,
					isSystemMessage: false,
					isDeleted: false,
					createdAt: new Date("2026-03-09"),
				};
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(5);
				vi.mocked(PostRepository.create).mockResolvedValue({
					...mockPost,
					postNumber: 5,
					id: "post-005",
				});
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
					post1,
					post3,
				]);

				await createPost({
					threadId: "thread-001",
					body: ">>1 >>3 複数アンカー",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// 最初のアンカー（>>1）のレスID が設定される（Phase 1: 同期ボーナス）
				// See: tmp/workers/bdd-architect_TASK-070/analysis.md §4 方針A: 二段階評価
				expect(IncentiveService.evaluateOnPost).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						isReplyTo: "post-first-001",
					}),
					{ phase: "sync" },
				);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: 特殊文字
		// -----------------------------------------------------------------------

		describe("エッジケース: 特殊文字を含む本文", () => {
			it("Unicode・絵文字を含む本文が正常に処理される", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				const unicodePost = {
					...mockPost,
					body: "🎮テスト\n改行あり<script>xss</script>",
				};
				vi.mocked(PostRepository.create).mockResolvedValue(unicodePost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				const result = await createPost({
					threadId: "thread-001",
					body: "🎮テスト\n改行あり<script>xss</script>",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(result).toMatchObject({ success: true });
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: DB 障害
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害時は例外が伝播する", () => {
			it("PostRepository.create が失敗した場合は例外をスローする", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockRejectedValue(
					new Error("PostRepository.create failed: DB障害"),
				);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				await expect(
					createPost({
						threadId: "thread-001",
						body: "こんにちは",
						edgeToken: "token-abc",
						ipHash: "seed-abc",
						isBotWrite: false,
					}),
				).rejects.toThrow("PostRepository.create failed");
			});
		});

		// -----------------------------------------------------------------------
		// CommandService 統合: コマンド解析と inlineSystemInfo 設定
		// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
		// See: docs/architecture/components/posting.md §5 方式A
		// -----------------------------------------------------------------------

		describe("CommandService 統合: コマンド実行結果が inlineSystemInfo に設定される", () => {
			// ヘルパー: 認証済みのデフォルト設定
			function setupAuthenticatedUser() {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);
			}

			it("CommandService が設定されていない場合は inlineSystemInfo が null になる", async () => {
				// See: Phase 1 互換: CommandService 未設定時はコマンド機能無効
				setupAuthenticatedUser();
				// CommandService を設定しない（デフォルト: null）
				const { setCommandService } = await import("../post-service");
				setCommandService(null);

				await createPost({
					threadId: "thread-001",
					body: "!tell >>5",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ inlineSystemInfo: null }),
				);
			});

			it("CommandService がコマンドを検出した場合、結果が inlineSystemInfo に設定される", async () => {
				// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
				setupAuthenticatedUser();
				const mockCommandService = {
					executeCommand: vi.fn().mockResolvedValue({
						success: true,
						systemMessage: "!tell >>5 を実行しました",
						currencyCost: 50,
					}),
					getRegisteredCommandNames: vi.fn().mockReturnValue(["tell", "w"]),
				};
				const { setCommandService } = await import("../post-service");
				setCommandService(mockCommandService as any);

				await createPost({
					threadId: "thread-001",
					body: "これAIだろ !tell >>5",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(mockCommandService.executeCommand).toHaveBeenCalledWith(
					expect.objectContaining({
						rawCommand: "これAIだろ !tell >>5",
						threadId: "thread-001",
						userId: "user-001",
					}),
				);
				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({
						inlineSystemInfo: "!tell >>5 を実行しました",
					}),
				);

				// クリーンアップ
				setCommandService(null);
			});

			it("CommandService がコマンドを検出しない場合は inlineSystemInfo が null になる", async () => {
				// See: features/command_system.feature @存在しないコマンドは無視され通常の書き込みとして扱われる
				setupAuthenticatedUser();
				const mockCommandService = {
					executeCommand: vi.fn().mockResolvedValue(null),
					getRegisteredCommandNames: vi.fn().mockReturnValue(["tell", "w"]),
				};
				const { setCommandService } = await import("../post-service");
				setCommandService(mockCommandService as any);

				await createPost({
					threadId: "thread-001",
					body: "普通の書き込みです",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ inlineSystemInfo: null }),
				);
				setCommandService(null);
			});

			it("isSystemMessage=true の場合はコマンド解析をスキップする", async () => {
				// See: features/command_system.feature @システムメッセージ内のコマンド文字列は実行されない
				setupAuthenticatedUser();
				const mockCommandService = {
					executeCommand: vi.fn(),
					getRegisteredCommandNames: vi.fn().mockReturnValue(["tell", "w"]),
				};
				const { setCommandService } = await import("../post-service");
				setCommandService(mockCommandService as any);

				await createPost({
					threadId: "thread-001",
					body: "!tell >>3 はシステムメッセージ",
					edgeToken: null,
					ipHash: "system",
					isBotWrite: true,
					isSystemMessage: true,
				});

				// CommandService.executeCommand は呼ばれない
				expect(mockCommandService.executeCommand).not.toHaveBeenCalled();
				// isSystemMessage=true が PostRepository.create に渡される
				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({ isSystemMessage: true }),
				);
				setCommandService(null);
			});

			it("isSystemMessage=true の場合は IncentiveService もスキップする", async () => {
				// See: features/command_system.feature @システムメッセージは書き込み報酬の対象にならない
				setupAuthenticatedUser();
				const { setCommandService } = await import("../post-service");
				setCommandService(null);

				await createPost({
					threadId: "thread-001",
					body: "システムメッセージ",
					edgeToken: null,
					ipHash: "system",
					isBotWrite: true,
					isSystemMessage: true,
				});

				expect(IncentiveService.evaluateOnPost).not.toHaveBeenCalled();
			});

			it("CommandService 失敗時も書き込み自体は成功する", async () => {
				// See: docs/architecture/components/posting.md §1 分割方針
				setupAuthenticatedUser();
				const mockCommandService = {
					executeCommand: vi
						.fn()
						.mockRejectedValue(new Error("CommandService error")),
					getRegisteredCommandNames: vi.fn().mockReturnValue(["tell"]),
				};
				const { setCommandService } = await import("../post-service");
				setCommandService(mockCommandService as any);

				const result = await createPost({
					threadId: "thread-001",
					body: "!tell >>5",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				expect(result).toMatchObject({ success: true });
				setCommandService(null);
			});

			it("コマンド結果とインセンティブ報酬の両方が inlineSystemInfo に含まれる", async () => {
				// See: features/command_system.feature
				// 完了条件: コマンド実行結果 + 書き込み報酬が両方ある場合、両方がinlineSystemInfoに含まれる
				setupAuthenticatedUser();
				const mockCommandService = {
					executeCommand: vi.fn().mockResolvedValue({
						success: true,
						systemMessage: "コマンド実行結果",
						currencyCost: 0,
					}),
					getRegisteredCommandNames: vi.fn().mockReturnValue(["w"]),
				};
				const { setCommandService } = await import("../post-service");
				setCommandService(mockCommandService as any);

				// IncentiveService が報酬を返す
				vi.mocked(IncentiveService.evaluateOnPost).mockResolvedValue({
					granted: [{ eventType: "daily_login", amount: 10 }],
					skipped: [],
				});

				await createPost({
					threadId: "thread-001",
					body: "!w >>3",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// inlineSystemInfo にコマンド結果と報酬の両方が含まれる
				expect(PostRepository.create).toHaveBeenCalledWith(
					expect.objectContaining({
						inlineSystemInfo: expect.stringContaining("コマンド実行結果"),
					}),
				);
				// 報酬メッセージも含まれる
				const createCall = vi.mocked(PostRepository.create).mock.calls[0][0];
				expect(createCall.inlineSystemInfo).toContain("daily_login +10");

				setCommandService(null);
			});
		});
	});

	// =========================================================================
	// createThread: スレッド作成
	// =========================================================================

	describe("createThread", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: スレッド作成が成功する", () => {
			// See: features/thread.feature @ログイン済みユーザーがスレッドを作成する

			it("スレッドが作成され、1レス目が書き込まれる", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(ThreadRepository.create).mockResolvedValue(mockThread);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				const result = await createThread(
					{
						boardId: "battleboard",
						title: "今日の雑談",
						firstPostBody: "自由に話しましょう",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(true);
				expect(result.thread).toBeDefined();
				expect(result.firstPost).toBeDefined();
				expect(ThreadRepository.create).toHaveBeenCalled();
				expect(PostRepository.create).toHaveBeenCalled();
			});

			it("1レス目は post_number=1 である", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(ThreadRepository.create).mockResolvedValue(mockThread);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				const result = await createThread(
					{
						boardId: "battleboard",
						title: "今日の雑談",
						firstPostBody: "自由に話しましょう",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.firstPost?.postNumber).toBe(1);
			});
		});

		// -----------------------------------------------------------------------
		// バリデーションエラー: タイトル
		// -----------------------------------------------------------------------

		describe("バリデーション: タイトルが空の場合はエラーを返す", () => {
			// See: features/thread.feature @スレッドタイトルが空の場合はスレッドが作成されない

			it("空タイトルでエラーを返す", async () => {
				const result = await createThread(
					{
						boardId: "battleboard",
						title: "",
						firstPostBody: "自由に話しましょう",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(false);
				expect(result.code).toBe("EMPTY_TITLE");
				expect(ThreadRepository.create).not.toHaveBeenCalled();
			});

			it("スペースのみのタイトルでエラーを返す", async () => {
				const result = await createThread(
					{
						boardId: "battleboard",
						title: "   ",
						firstPostBody: "内容",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(false);
				expect(result.code).toBe("EMPTY_TITLE");
			});
		});

		describe("バリデーション: タイトルが上限文字数超過の場合はエラーを返す", () => {
			// See: features/thread.feature @スレッドタイトルが上限文字数を超えている場合はエラーになる

			it("97文字以上のタイトルでエラーを返す", async () => {
				const longTitle = "あ".repeat(97);

				const result = await createThread(
					{
						boardId: "battleboard",
						title: longTitle,
						firstPostBody: "内容",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(false);
				expect(result.code).toBe("TITLE_TOO_LONG");
				expect(ThreadRepository.create).not.toHaveBeenCalled();
			});

			it("96文字のタイトルは許可される（境界値）", async () => {
				const maxTitle = "あ".repeat(96);
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(ThreadRepository.create).mockResolvedValue({
					...mockThread,
					title: maxTitle,
				});
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);

				const result = await createThread(
					{
						boardId: "battleboard",
						title: maxTitle,
						firstPostBody: "内容",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(true);
			});
		});

		describe("バリデーション: 1レス目本文が空の場合はエラーを返す", () => {
			it("空の1レス目本文でエラーを返す", async () => {
				const result = await createThread(
					{
						boardId: "battleboard",
						title: "今日の雑談",
						firstPostBody: "",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(false);
				expect(result.code).toBe("EMPTY_BODY");
				expect(ThreadRepository.create).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// IncentiveService 統合テスト（createThread）
		// -----------------------------------------------------------------------

		describe("IncentiveService 統合: createThread 成功後に isThreadCreation=true で evaluateOnPost が呼ばれる", () => {
			// See: features/incentive.feature @スレッド作成時のボーナス
			// See: docs/architecture/components/incentive.md §2.2 イベント種別 thread_creation

			it("createThread 成功後に isThreadCreation:true で IncentiveService.evaluateOnPost が呼ばれる", async () => {
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(ThreadRepository.create).mockResolvedValue(mockThread);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

				await createThread(
					{
						boardId: "battleboard",
						title: "今日の雑談",
						firstPostBody: "自由に話しましょう",
					},
					"token-abc",
					"seed-abc",
				);

				// createPost 内での呼び出し（isThreadCreation なし）と
				// createThread 内での呼び出し（isThreadCreation:true）の2回呼ばれる
				const calls = vi.mocked(IncentiveService.evaluateOnPost).mock.calls;
				const hasThreadCreationCall = calls.some(
					(call) => call[1]?.isThreadCreation === true,
				);
				expect(hasThreadCreationCall).toBe(true);
			});

			it("createThread の IncentiveService 失敗でもスレッド作成は成功として返される", async () => {
				// See: docs/architecture/components/incentive.md §5 インセンティブ失敗は書き込みを巻き戻さない
				vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
					valid: true,
					userId: "user-001",
					authorIdSeed: "seed-abc",
				});
				vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
				vi.mocked(ThreadRepository.create).mockResolvedValue(mockThread);
				vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(1);
				vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
				vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
					undefined,
				);
				vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(
					undefined,
				);
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);
				// IncentiveService が例外をスローする
				vi.mocked(IncentiveService.evaluateOnPost).mockRejectedValue(
					new Error("IncentiveService error"),
				);

				const result = await createThread(
					{
						boardId: "battleboard",
						title: "今日の雑談",
						firstPostBody: "自由に話しましょう",
					},
					"token-abc",
					"seed-abc",
				);

				expect(result.success).toBe(true);
				expect(result.thread).toBeDefined();
				expect(result.firstPost).toBeDefined();
			});
		});

		// -----------------------------------------------------------------------
		// 未認証: スレッド作成時の認証フロー
		// -----------------------------------------------------------------------

		describe("未認証: edge-token がない場合に認証フローを起動する", () => {
			it("authRequired 情報を返す", async () => {
				vi.mocked(AuthService.issueEdgeToken).mockResolvedValue({
					token: "new-token",
					userId: "user-new",
				});
				vi.mocked(AuthService.issueAuthCode).mockResolvedValue({
					code: "111111",
					expiresAt: new Date(),
				});

				const result = await createThread(
					{
						boardId: "battleboard",
						title: "新スレ",
						firstPostBody: "内容",
					},
					null,
					"ip-hash-new",
				);

				expect(result.success).toBe(false);
				expect(result.authRequired).toBeDefined();
				expect(result.authRequired?.edgeToken).toBe("new-token");
				expect(result.authRequired?.code).toBe("111111");
				expect(ThreadRepository.create).not.toHaveBeenCalled();
			});
		});
	});

	// =========================================================================
	// createPost — Step 10b: 休眠管理
	// See: docs/specs/thread_state_transitions.yaml #transitions
	// See: docs/architecture/components/posting.md §5 休眠管理の責務
	// See: docs/architecture/architecture.md §7.1 step 2b
	// =========================================================================

	describe("createPost — Step 10b: 休眠管理", () => {
		// 全テストで共通する認証・書き込みのモックを beforeEach で設定
		beforeEach(() => {
			vi.mocked(AuthService.verifyEdgeToken).mockResolvedValue({
				valid: true,
				userId: "user-001",
				authorIdSeed: "seed-abc",
			});
			vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);
			vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(2);
			vi.mocked(PostRepository.create).mockResolvedValue(mockPost);
			vi.mocked(ThreadRepository.incrementPostCount).mockResolvedValue(
				undefined,
			);
			vi.mocked(ThreadRepository.updateLastPostAt).mockResolvedValue(undefined);
		});

		describe("休眠中スレッドへの書き込み → 復活", () => {
			// See: docs/specs/thread_state_transitions.yaml #transitions unlisted→listed

			it("isDormant=true のスレッドへの書き込み時に wakeThread が呼ばれる", async () => {
				// Arrange: 休眠中スレッドを返すようモック設定
				const dormantThread = { ...mockThread, isDormant: true };
				vi.mocked(ThreadRepository.findById).mockResolvedValue(dormantThread);

				// Act
				const result = await createPost({
					threadId: "thread-001",
					body: "復活書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: 書き込み成功 + wakeThread が呼ばれた
				expect(result).toMatchObject({ success: true });
				expect(ThreadRepository.wakeThread).toHaveBeenCalledWith("thread-001");
			});

			it("isDormant=false のスレッドへの書き込み時に wakeThread が呼ばれない", async () => {
				// Arrange: アクティブスレッド（isDormant=false）
				vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);

				// Act
				await createPost({
					threadId: "thread-001",
					body: "通常書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: wakeThread は呼ばれない
				expect(ThreadRepository.wakeThread).not.toHaveBeenCalled();
			});
		});

		describe("アクティブスレッド数が上限超過 → 末尾スレッドを休眠化", () => {
			// See: docs/specs/thread_state_transitions.yaml #transitions listed→unlisted

			it("アクティブ数が50件を超えた場合に demoteOldestActiveThread が呼ばれる", async () => {
				// Arrange: アクティブスレッド数 = 51（上限超過）
				vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);
				vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(51);

				// Act
				const result = await createPost({
					threadId: "thread-001",
					body: "51件超過時の書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: 書き込み成功 + demoteOldestActiveThread が呼ばれた
				expect(result).toMatchObject({ success: true });
				expect(ThreadRepository.demoteOldestActiveThread).toHaveBeenCalledWith(
					"battleboard",
				);
			});

			it("アクティブ数がちょうど50件の場合は demoteOldestActiveThread が呼ばれない", async () => {
				// Arrange: アクティブスレッド数 = 50（上限ちょうど）
				vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);
				vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(50);

				// Act
				await createPost({
					threadId: "thread-001",
					body: "50件ちょうどの書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: demoteOldestActiveThread は呼ばれない（> 50 が条件）
				expect(
					ThreadRepository.demoteOldestActiveThread,
				).not.toHaveBeenCalled();
			});

			it("アクティブ数が49件の場合は demoteOldestActiveThread が呼ばれない", async () => {
				// Arrange: アクティブスレッド数 = 49（上限未満）
				vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);
				vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(49);

				// Act
				await createPost({
					threadId: "thread-001",
					body: "49件の書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: demoteOldestActiveThread は呼ばれない
				expect(
					ThreadRepository.demoteOldestActiveThread,
				).not.toHaveBeenCalled();
			});
		});

		describe("休眠復活 + 末尾休眠化が同時に発生するケース", () => {
			// See: docs/specs/thread_state_transitions.yaml #transitions unlisted→listed
			// 休眠スレッドが復活 → アクティブ数が上限超過 → 末尾スレッドを休眠化

			it("isDormant=true のスレッドへの書き込みでアクティブ数が上限を超えた場合、両方の処理が行われる", async () => {
				// Arrange: 休眠中スレッド + 復活後にアクティブ数 = 51
				const dormantThread = { ...mockThread, isDormant: true };
				vi.mocked(ThreadRepository.findById).mockResolvedValue(dormantThread);
				vi.mocked(ThreadRepository.countActiveThreads).mockResolvedValue(51);

				// Act
				const result = await createPost({
					threadId: "thread-001",
					body: "休眠→復活+末尾休眠化",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: wakeThread と demoteOldestActiveThread の両方が呼ばれる
				expect(result).toMatchObject({ success: true });
				expect(ThreadRepository.wakeThread).toHaveBeenCalledWith("thread-001");
				expect(ThreadRepository.demoteOldestActiveThread).toHaveBeenCalledWith(
					"battleboard",
				);
			});
		});

		describe("countActiveThreads は Step 10（last_post_at更新）後の最新DB状態を参照する", () => {
			it("countActiveThreads が適切な boardId で呼ばれる", async () => {
				// Arrange
				vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);

				// Act
				await createPost({
					threadId: "thread-001",
					body: "countのテスト",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: mockThread.boardId = 'battleboard'
				expect(ThreadRepository.countActiveThreads).toHaveBeenCalledWith(
					"battleboard",
				);
			});
		});

		describe("スレッドが存在しない場合（nullスレッド）のフォールバック", () => {
			it("スレッドが null の場合は countActiveThreads が battleboard でフォールバック呼び出しされる", async () => {
				// Arrange: スレッドが存在しない（targetThread = null）
				vi.mocked(ThreadRepository.findById).mockResolvedValue(null);
				// null スレッドでも後続処理（認証 → バリデーション → Step 9）まで進む必要があるが、
				// null の場合は isPinned チェックが false → Step 1以降が処理される
				// ただし null.boardId のアクセスはフォールバック "battleboard" で対応

				// Act: 通常書き込み
				await createPost({
					threadId: "thread-001",
					body: "nullスレッドへの書き込み",
					edgeToken: "token-abc",
					ipHash: "seed-abc",
					isBotWrite: false,
				});

				// Assert: フォールバック "battleboard" で呼ばれる
				expect(ThreadRepository.countActiveThreads).toHaveBeenCalledWith(
					"battleboard",
				);
			});
		});
	});

	// =========================================================================
	// getThreadList: スレッド一覧取得
	// =========================================================================

	describe("getThreadList", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: スレッド一覧を返す（onlyActive方式）", () => {
			// See: features/thread.feature @スレッド一覧にスレッドの基本情報が表示される
			// See: docs/specs/thread_state_transitions.yaml #listing_rules LIMIT不使用

			it("スレッド一覧（Thread 配列）を返す", async () => {
				const mockThreads = [mockThread];
				vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue(
					mockThreads,
				);

				const result = await getThreadList("battleboard");

				expect(result).toEqual(mockThreads);
				// onlyActive: true で呼ばれ、LIMIT は使用しない
				expect(ThreadRepository.findByBoardId).toHaveBeenCalledWith(
					"battleboard",
					{ onlyActive: true },
				);
			});

			it("アクティブスレッドのみ取得する（onlyActive:true を使用）", async () => {
				// See: features/thread.feature @スレッド一覧には最新50件のみ表示される
				// is_dormant=false のスレッドのみ返す（休眠管理はDB側が担保）
				const activeThreads = Array.from({ length: 50 }, (_, i) => ({
					...mockThread,
					id: `thread-${i + 1}`,
					isDormant: false,
				}));
				vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue(
					activeThreads,
				);

				const result = await getThreadList("battleboard");

				expect(result).toHaveLength(50);
				expect(ThreadRepository.findByBoardId).toHaveBeenCalledWith(
					"battleboard",
					{ onlyActive: true },
				);
			});

			it("スレッドが0件の場合は空配列を返す", async () => {
				// See: features/thread.feature @スレッドが0件の場合はメッセージが表示される
				vi.mocked(ThreadRepository.findByBoardId).mockResolvedValue([]);

				const result = await getThreadList("battleboard");

				expect(result).toEqual([]);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害時は例外が伝播する", () => {
			it("ThreadRepository.findByBoardId が失敗した場合は例外をスローする", async () => {
				vi.mocked(ThreadRepository.findByBoardId).mockRejectedValue(
					new Error("ThreadRepository.findByBoardId failed: DB障害"),
				);

				await expect(getThreadList("battleboard")).rejects.toThrow(
					"ThreadRepository.findByBoardId failed",
				);
			});
		});
	});

	// =========================================================================
	// getPostList: レス一覧取得
	// =========================================================================

	describe("getPostList", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: レス一覧を post_number ASC で返す", () => {
			// See: features/thread.feature @スレッドのレスが書き込み順に表示される

			it("レス一覧（Post 配列）を返す", async () => {
				const mockPosts = [
					mockPost,
					{ ...mockPost, id: "post-002", postNumber: 2 },
				];
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue(mockPosts);

				const result = await getPostList("thread-001");

				expect(result).toEqual(mockPosts);
				expect(PostRepository.findByThreadId).toHaveBeenCalledWith(
					"thread-001",
					{},
				);
			});

			it("fromPostNumber を指定した場合にリポジトリに渡される", async () => {
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
					{ ...mockPost, postNumber: 5 },
				]);

				await getPostList("thread-001", { fromPostNumber: 5 });

				expect(PostRepository.findByThreadId).toHaveBeenCalledWith(
					"thread-001",
					{
						fromPostNumber: 5,
					},
				);
			});

			it("レスが0件の場合は空配列を返す", async () => {
				vi.mocked(PostRepository.findByThreadId).mockResolvedValue([]);

				const result = await getPostList("thread-001");

				expect(result).toEqual([]);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害時は例外が伝播する", () => {
			it("PostRepository.findByThreadId が失敗した場合は例外をスローする", async () => {
				vi.mocked(PostRepository.findByThreadId).mockRejectedValue(
					new Error("PostRepository.findByThreadId failed: DB障害"),
				);

				await expect(getPostList("thread-001")).rejects.toThrow(
					"PostRepository.findByThreadId failed",
				);
			});
		});
	});

	// =========================================================================
	// getThread: スレッド単体取得
	// =========================================================================

	describe("getThread", () => {
		describe("正常系: スレッドが存在する場合", () => {
			it("Thread オブジェクトを返す", async () => {
				vi.mocked(ThreadRepository.findById).mockResolvedValue(mockThread);

				const result = await getThread("thread-001");

				expect(result).toEqual(mockThread);
				expect(ThreadRepository.findById).toHaveBeenCalledWith("thread-001");
			});
		});

		describe("正常系: スレッドが存在しない場合", () => {
			it("null を返す", async () => {
				vi.mocked(ThreadRepository.findById).mockResolvedValue(null);

				const result = await getThread("nonexistent-thread");

				expect(result).toBeNull();
			});
		});

		describe("エッジケース: 空文字列 ID", () => {
			it("空文字列の ID でもリポジトリを呼び出す（バリデーションはサービス外）", async () => {
				vi.mocked(ThreadRepository.findById).mockResolvedValue(null);

				const result = await getThread("");

				expect(result).toBeNull();
				expect(ThreadRepository.findById).toHaveBeenCalledWith("");
			});
		});

		describe("異常系: DB 障害時は例外が伝播する", () => {
			it("ThreadRepository.findById が失敗した場合は例外をスローする", async () => {
				vi.mocked(ThreadRepository.findById).mockRejectedValue(
					new Error("ThreadRepository.findById failed: DB障害"),
				);

				await expect(getThread("thread-001")).rejects.toThrow(
					"ThreadRepository.findById failed",
				);
			});
		});
	});
});
