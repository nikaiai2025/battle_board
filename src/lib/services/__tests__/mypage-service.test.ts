/**
 * 単体テスト: mypage-service.ts（MypageService）
 *
 * See: features/mypage.feature
 * See: features/currency.feature @マイページで通貨残高を確認する
 *
 * テスト方針:
 *   - UserRepository・CurrencyService・PostRepository はモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（無料ユーザーのアクセス制限・ユーザー不存在・バリデーション等）を網羅する
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock("@/lib/infrastructure/repositories/user-repository", () => ({
	findById: vi.fn(),
	updateUsername: vi.fn(),
	updateIsPremium: vi.fn(),
}));

vi.mock("@/lib/services/currency-service", () => ({
	getBalance: vi.fn(),
}));

vi.mock("@/lib/infrastructure/repositories/post-repository", () => ({
	findByAuthorId: vi.fn(),
	searchByAuthorId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import type { Post } from "@/lib/domain/models/post";
import type { User } from "@/lib/domain/models/user";
import type { PostWithThread } from "@/lib/infrastructure/repositories/post-repository";
import * as PostRepository from "@/lib/infrastructure/repositories/post-repository";
import * as UserRepository from "@/lib/infrastructure/repositories/user-repository";
import * as CurrencyService from "@/lib/services/currency-service";
import {
	getMypage,
	getPostHistory,
	type MypageInfo,
	type PaginatedPostHistory,
	type PostHistoryItem,
	type SetUsernameResult,
	setUsername,
	type UpgradeToPremiumResult,
	upgradeToPremium,
} from "../mypage-service";

// ---------------------------------------------------------------------------
// テストフィクスチャ
// ---------------------------------------------------------------------------

const FREE_USER: User = {
	id: "user-free-001",
	authToken: "token-free-001",
	authorIdSeed: "seed-001",
	isPremium: false,
	isVerified: true,
	username: null,
	streakDays: 3,
	lastPostDate: "2026-03-13",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	// Phase 3: 本登録・PAT 関連フィールド（本登録済みの無料ユーザー）
	// upgradeToPremium は本登録済みユーザーのみ課金可能
	// See: features/user_registration.feature @仮ユーザーは課金できない
	supabaseAuthId: "supabase-auth-free-001",
	registrationType: "email",
	registeredAt: new Date("2026-01-15T00:00:00Z"),
	patToken: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
	patLastUsedAt: null,
	// Phase 4: 草コマンド関連フィールド
	// See: features/reactions.feature
	grassCount: 0,
	// Phase 5: BAN システム関連フィールド
	// See: features/admin.feature @ユーザーBAN
	isBanned: false,
	lastIpHash: null,
	themeId: null,
	fontId: null,
};

const PREMIUM_USER: User = {
	id: "user-premium-001",
	authToken: "token-premium-001",
	authorIdSeed: "seed-002",
	isPremium: true,
	isVerified: true,
	username: "バトラー太郎",
	streakDays: 10,
	lastPostDate: "2026-03-13",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	// Phase 3: 本登録・PAT 関連フィールド（本登録済みの有料ユーザー）
	// See: features/user_registration.feature
	supabaseAuthId: "supabase-auth-premium-001",
	registrationType: "email",
	registeredAt: new Date("2026-01-10T00:00:00Z"),
	patToken: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
	patLastUsedAt: null,
	// Phase 4: 草コマンド関連フィールド
	// See: features/reactions.feature
	grassCount: 0,
	// Phase 5: BAN システム関連フィールド
	// See: features/admin.feature @ユーザーBAN
	isBanned: false,
	lastIpHash: null,
	themeId: null,
	fontId: null,
};

const SAMPLE_POST: Post = {
	id: "post-001",
	threadId: "thread-001",
	postNumber: 1,
	authorId: "user-free-001",
	displayName: "名無しさん",
	dailyId: "ABCD1234",
	body: "テスト書き込みです",
	inlineSystemInfo: null,
	isSystemMessage: false,
	isDeleted: false,
	createdAt: new Date("2026-03-10T12:00:00Z"),
};

/** PostWithThread テストフィクスチャ（threadTitle 付き） */
const SAMPLE_POST_WITH_THREAD: PostWithThread = {
	...SAMPLE_POST,
	threadTitle: "テストスレッド",
};

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("MypageService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// getMypage: マイページ基本情報取得
	// =========================================================================

	describe("getMypage", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: 無料ユーザー", () => {
			it("残高・アカウント情報を含む MypageInfo を返す", async () => {
				// See: features/mypage.feature @マイページに基本情報が表示される
				// See: features/currency.feature @マイページで通貨残高を確認する
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(CurrencyService.getBalance).mockResolvedValue(150);

				const result = await getMypage("user-free-001");

				expect(result).not.toBeNull();
				expect(result!.userId).toBe("user-free-001");
				expect(result!.balance).toBe(150);
				expect(result!.isPremium).toBe(false);
				expect(result!.username).toBeNull();
				expect(result!.streakDays).toBe(3);
			});

			it("UserRepository.findById と CurrencyService.getBalance を呼び出す", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(CurrencyService.getBalance).mockResolvedValue(50);

				await getMypage("user-free-001");

				expect(UserRepository.findById).toHaveBeenCalledWith("user-free-001");
				expect(CurrencyService.getBalance).toHaveBeenCalledWith(
					"user-free-001",
				);
			});
		});

		describe("正常系: 有料ユーザー", () => {
			it("isPremium=true・ユーザーネームを含む MypageInfo を返す", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(CurrencyService.getBalance).mockResolvedValue(500);

				const result = await getMypage("user-premium-001");

				expect(result!.isPremium).toBe(true);
				expect(result!.username).toBe("バトラー太郎");
				expect(result!.balance).toBe(500);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース
		// -----------------------------------------------------------------------

		describe("エッジケース: ユーザーが存在しない", () => {
			it("ユーザーが見つからない場合は null を返す", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(null);
				vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);

				const result = await getMypage("unknown-user");

				expect(result).toBeNull();
			});
		});

		describe("エッジケース: 残高が 0", () => {
			it("残高 0 を正常に返す", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);

				const result = await getMypage("user-free-001");

				expect(result!.balance).toBe(0);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: DB 障害
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害", () => {
			it("UserRepository.findById がエラーをスローした場合は伝播する", async () => {
				vi.mocked(UserRepository.findById).mockRejectedValue(
					new Error("UserRepository.findById failed: DB障害"),
				);
				vi.mocked(CurrencyService.getBalance).mockResolvedValue(0);

				await expect(getMypage("user-001")).rejects.toThrow(
					"UserRepository.findById failed",
				);
			});

			it("CurrencyService.getBalance がエラーをスローした場合は伝播する", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(CurrencyService.getBalance).mockRejectedValue(
					new Error("CurrencyRepository.getBalance failed: DB障害"),
				);

				await expect(getMypage("user-free-001")).rejects.toThrow(
					"CurrencyRepository.getBalance failed",
				);
			});
		});
	});

	// =========================================================================
	// setUsername: ユーザーネーム設定
	// =========================================================================

	describe("setUsername", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: 有料ユーザーがユーザーネームを設定する", () => {
			it("成功時に { success: true, username } を返す", async () => {
				// See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined);

				const result = await setUsername("user-premium-001", "バトラー太郎");

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.username).toBe("バトラー太郎");
				}
			});

			it("UserRepository.updateUsername を正しい引数で呼び出す", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined);

				await setUsername("user-premium-001", "バトラー太郎");

				expect(UserRepository.updateUsername).toHaveBeenCalledWith(
					"user-premium-001",
					"バトラー太郎",
				);
			});

			it("前後の空白はトリミングされる", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined);

				const result = await setUsername(
					"user-premium-001",
					"  バトラー太郎  ",
				);

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.username).toBe("バトラー太郎");
				}
				expect(UserRepository.updateUsername).toHaveBeenCalledWith(
					"user-premium-001",
					"バトラー太郎",
				);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: 無料ユーザー
		// -----------------------------------------------------------------------

		describe("異常系: 無料ユーザーが設定を試みる", () => {
			it('{ success: false, code: "NOT_PREMIUM" } を返す', async () => {
				// See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);

				const result = await setUsername("user-free-001", "テスト名");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("NOT_PREMIUM");
				}
				// updateUsername は呼び出されない
				expect(UserRepository.updateUsername).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: バリデーション
		// -----------------------------------------------------------------------

		describe("エッジケース: 空文字・バリデーション", () => {
			it('空文字は { success: false, code: "VALIDATION_ERROR" } を返す', async () => {
				const result = await setUsername("user-001", "");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("VALIDATION_ERROR");
				}
				// findById は呼び出されない（早期リターン）
				expect(UserRepository.findById).not.toHaveBeenCalled();
			});

			it('空白のみは { success: false, code: "VALIDATION_ERROR" } を返す', async () => {
				const result = await setUsername("user-001", "   ");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("VALIDATION_ERROR");
				}
			});

			it('21文字は { success: false, code: "VALIDATION_ERROR" } を返す（上限20文字）', async () => {
				const result = await setUsername("user-001", "あ".repeat(21));

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("VALIDATION_ERROR");
				}
			});

			it("20文字は成功する（境界値）", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined);

				const result = await setUsername("user-premium-001", "あ".repeat(20));

				expect(result.success).toBe(true);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: ユーザーが存在しない
		// -----------------------------------------------------------------------

		describe("エッジケース: ユーザーが存在しない", () => {
			it('{ success: false, code: "USER_NOT_FOUND" } を返す', async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(null);

				const result = await setUsername("unknown-user", "名前");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("USER_NOT_FOUND");
				}
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: 特殊文字
		// -----------------------------------------------------------------------

		describe("エッジケース: 特殊文字・Unicode", () => {
			it("日本語・絵文字を含むユーザーネームも設定できる", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined);

				const result = await setUsername("user-premium-001", "名前🎮テスト");

				expect(result.success).toBe(true);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: DB 障害
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害", () => {
			it("UserRepository.updateUsername がエラーをスローした場合は伝播する", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);
				vi.mocked(UserRepository.updateUsername).mockRejectedValue(
					new Error("UserRepository.updateUsername failed: DB障害"),
				);

				await expect(setUsername("user-premium-001", "テスト")).rejects.toThrow(
					"UserRepository.updateUsername failed",
				);
			});
		});
	});

	// =========================================================================
	// upgradeToPremium: 課金（有料ステータス切替）モック
	// =========================================================================

	describe("upgradeToPremium", () => {
		// -----------------------------------------------------------------------
		// 正常系
		// -----------------------------------------------------------------------

		describe("正常系: 無料ユーザーが課金する", () => {
			it("成功時に { success: true } を返す", async () => {
				// See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(UserRepository.updateIsPremium).mockResolvedValue(undefined);

				const result = await upgradeToPremium("user-free-001");

				expect(result.success).toBe(true);
			});

			it("UserRepository.updateIsPremium を isPremium=true で呼び出す", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(UserRepository.updateIsPremium).mockResolvedValue(undefined);

				await upgradeToPremium("user-free-001");

				expect(UserRepository.updateIsPremium).toHaveBeenCalledWith(
					"user-free-001",
					true,
				);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: 既に有料ユーザー
		// -----------------------------------------------------------------------

		describe("異常系: 既に有料ユーザー", () => {
			it('{ success: false, code: "ALREADY_PREMIUM" } を返す', async () => {
				// See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
				vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER);

				const result = await upgradeToPremium("user-premium-001");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("ALREADY_PREMIUM");
				}
				// updateIsPremium は呼び出されない
				expect(UserRepository.updateIsPremium).not.toHaveBeenCalled();
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: ユーザーが存在しない
		// -----------------------------------------------------------------------

		describe("エッジケース: ユーザーが存在しない", () => {
			it('{ success: false, code: "USER_NOT_FOUND" } を返す', async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(null);

				const result = await upgradeToPremium("unknown-user");

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.code).toBe("USER_NOT_FOUND");
				}
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: DB 障害
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害", () => {
			it("UserRepository.updateIsPremium がエラーをスローした場合は伝播する", async () => {
				vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER);
				vi.mocked(UserRepository.updateIsPremium).mockRejectedValue(
					new Error("UserRepository.updateIsPremium failed: DB障害"),
				);

				await expect(upgradeToPremium("user-free-001")).rejects.toThrow(
					"UserRepository.updateIsPremium failed",
				);
			});
		});
	});

	// =========================================================================
	// getPostHistory: 書き込み履歴取得（ページネーション・検索対応）
	// =========================================================================
	// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
	// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
	// See: tmp/workers/bdd-architect_TASK-237/design.md §4

	describe("getPostHistory", () => {
		// -----------------------------------------------------------------------
		// 正常系: 基本動作
		// -----------------------------------------------------------------------

		describe("正常系: 書き込みがある場合", () => {
			it("PaginatedPostHistory を返す", async () => {
				// See: features/mypage.feature @自分の書き込み履歴を確認できる
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [SAMPLE_POST_WITH_THREAD],
					total: 1,
				});

				const result = await getPostHistory("user-free-001");

				// PaginatedPostHistory 型の確認
				expect(result).toMatchObject({
					total: 1,
					totalPages: 1,
					page: 1,
				});
				expect(result.posts).toHaveLength(1);
				expect(result.posts[0]).toMatchObject({
					id: "post-001",
					threadId: "thread-001",
					threadTitle: "テストスレッド",
					postNumber: 1,
					body: "テスト書き込みです",
				});
				expect(result.posts[0].createdAt).toBeInstanceOf(Date);
			});

			it("PostRepository.searchByAuthorId を userId と page=1（offset=0）で呼び出す", async () => {
				// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [SAMPLE_POST_WITH_THREAD],
					total: 1,
				});

				await getPostHistory("user-free-001");

				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({
						limit: 50,
						offset: 0,
					}),
				);
			});

			it("複数件の書き込みを返す", async () => {
				const posts: PostWithThread[] = [
					{
						...SAMPLE_POST_WITH_THREAD,
						id: "post-001",
						postNumber: 3,
						createdAt: new Date("2026-03-13"),
					},
					{
						...SAMPLE_POST_WITH_THREAD,
						id: "post-002",
						postNumber: 2,
						createdAt: new Date("2026-03-12"),
					},
					{
						...SAMPLE_POST_WITH_THREAD,
						id: "post-003",
						postNumber: 1,
						createdAt: new Date("2026-03-11"),
					},
				];
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts,
					total: 3,
				});

				const result = await getPostHistory("user-free-001");

				expect(result.posts).toHaveLength(3);
				expect(result.total).toBe(3);
			});
		});

		// -----------------------------------------------------------------------
		// 正常系: ページネーション計算
		// -----------------------------------------------------------------------

		describe("正常系: ページネーション計算", () => {
			it("total=120 の場合 totalPages=3 を返す（ceil(120/50)=3）", async () => {
				// See: features/mypage.feature @書き込み履歴が50件を超える場合はページネーションで表示される
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 120,
				});

				const result = await getPostHistory("user-free-001");

				expect(result.totalPages).toBe(3);
				expect(result.page).toBe(1);
			});

			it("total=50 の場合 totalPages=1 を返す（境界値）", async () => {
				// See: features/mypage.feature @書き込み履歴が50件以下の場合は全件表示される
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 50,
				});

				const result = await getPostHistory("user-free-001");

				expect(result.totalPages).toBe(1);
			});

			it("total=51 の場合 totalPages=2 を返す（境界値）", async () => {
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 51,
				});

				const result = await getPostHistory("user-free-001");

				expect(result.totalPages).toBe(2);
			});

			it("2ページ目を指定すると offset=50 で searchByAuthorId を呼び出す", async () => {
				// See: features/mypage.feature @2ページ目を表示すると51件目以降が表示される
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 120,
				});

				await getPostHistory("user-free-001", { page: 2 });

				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({
						limit: 50,
						offset: 50,
					}),
				);
			});

			it("3ページ目を指定すると offset=100 で呼び出す", async () => {
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 120,
				});

				await getPostHistory("user-free-001", { page: 3 });

				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({
						limit: 50,
						offset: 100,
					}),
				);
			});

			it("page を指定しない場合は page=1、offset=0 で呼び出す（デフォルト動作）", async () => {
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 0,
				});

				const result = await getPostHistory("user-free-001");

				expect(result.page).toBe(1);
				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({ offset: 0 }),
				);
			});
		});

		// -----------------------------------------------------------------------
		// 正常系: 検索パラメータの伝播
		// -----------------------------------------------------------------------

		describe("正常系: 検索パラメータの伝播", () => {
			it("keyword を searchByAuthorId に渡す", async () => {
				// See: features/mypage.feature @キーワードで書き込み履歴を検索する
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 0,
				});

				await getPostHistory("user-free-001", { keyword: "ボットちゃんねる" });

				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({ keyword: "ボットちゃんねる" }),
				);
			});

			it("startDate と endDate を searchByAuthorId に渡す", async () => {
				// See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 0,
				});

				await getPostHistory("user-free-001", {
					startDate: "2026-03-10",
					endDate: "2026-03-15",
				});

				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({
						startDate: "2026-03-10",
						endDate: "2026-03-15",
					}),
				);
			});

			it("keyword + startDate + endDate を組み合わせて渡す", async () => {
				// See: features/mypage.feature @キーワードと日付範囲を組み合わせて検索する
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 0,
				});

				await getPostHistory("user-free-001", {
					keyword: "草",
					startDate: "2026-03-10",
					endDate: "2026-03-15",
				});

				expect(PostRepository.searchByAuthorId).toHaveBeenCalledWith(
					"user-free-001",
					expect.objectContaining({
						keyword: "草",
						startDate: "2026-03-10",
						endDate: "2026-03-15",
					}),
				);
			});
		});

		// -----------------------------------------------------------------------
		// エッジケース: 0 件
		// -----------------------------------------------------------------------

		describe("エッジケース: 書き込みが 0 件", () => {
			it("空配列・total=0・totalPages=0 を返す", async () => {
				// See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 0,
				});

				const result = await getPostHistory("user-free-001");

				expect(result.posts).toHaveLength(0);
				expect(result.posts).toEqual([]);
				expect(result.total).toBe(0);
				// ceil(0/50) = 0
				expect(result.totalPages).toBe(0);
			});

			it("検索結果が 0 件の場合は空配列を返す（検索条件あり）", async () => {
				// See: features/mypage.feature @検索結果が0件の場合はメッセージが表示される
				vi.mocked(PostRepository.searchByAuthorId).mockResolvedValue({
					posts: [],
					total: 0,
				});

				const result = await getPostHistory("user-free-001", {
					keyword: "存在しないワード12345",
				});

				expect(result.posts).toHaveLength(0);
				expect(result.total).toBe(0);
			});
		});

		// -----------------------------------------------------------------------
		// 異常系: DB 障害
		// -----------------------------------------------------------------------

		describe("異常系: DB 障害", () => {
			it("PostRepository.searchByAuthorId がエラーをスローした場合は伝播する", async () => {
				vi.mocked(PostRepository.searchByAuthorId).mockRejectedValue(
					new Error("PostRepository.searchByAuthorId failed: DB障害"),
				);

				await expect(getPostHistory("user-free-001")).rejects.toThrow(
					"PostRepository.searchByAuthorId failed",
				);
			});
		});
	});
});
