/**
 * 単体テスト: RegistrationService
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md §5 公開インターフェース
 * See: docs/specs/user_registration_state_transitions.yaml
 *
 * テスト方針:
 *   - supabaseAdmin, UserRepository, EdgeTokenRepository はモック化して外部DBに依存しない
 *   - 各メソッドの正常系・異常系・エッジケースを網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * BDDシナリオ代替検証（D-10 §7.3.3）:
 *   以下のBDDシナリオはDiscord OAuthの外部依存によりCucumberではpending。
 *   本テストの registerWithDiscord / loginWithDiscord / handleOAuthCallback が
 *   サービス層レベルで部分的に代替検証する。
 *   @feature user_registration.feature
 *   @scenario 仮ユーザーが Discord アカウントで本登録する
 *   @scenario 本登録ユーザーが Discord アカウントでログインする
 *
 * カバレッジ対象:
 *   - registerWithEmail: 正常・already_registered・email_taken・not_found
 *   - registerWithDiscord: 正常・エラー
 *   - completeRegistration: 正常・PAT自動生成
 *   - loginWithEmail: 正常・invalid_credentials・not_registered
 *   - loginWithDiscord: 正常・エラー
 *   - handleOAuthCallback: 正常ログイン・新規本登録・not_registered
 *   - logout: 正常・トークンなし
 *   - verifyPat: 正常・無効PAT
 *   - regeneratePat: 正常
 *   - loginWithPat: 正常・無効PAT
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted を使ったモック変数の事前定義（hoisting問題回避）
// ---------------------------------------------------------------------------

const { mockSupabaseAuth, mockUserRepository, mockEdgeTokenRepository } =
	vi.hoisted(() => {
		const mockSupabaseAuth = {
			signUp: vi.fn(),
			signInWithOAuth: vi.fn(),
			signInWithPassword: vi.fn(),
			exchangeCodeForSession: vi.fn(),
			resetPasswordForEmail: vi.fn(),
			admin: {
				updateUserById: vi.fn(),
			},
		};

		const mockUserRepository = {
			findById: vi.fn(),
			findBySupabaseAuthId: vi.fn(),
			findByPatToken: vi.fn(),
			completeRegistrationUpdate: vi.fn(),
			updateSupabaseAuthId: vi.fn(),
			updatePatToken: vi.fn(),
			updatePatLastUsedAt: vi.fn(),
		};

		const mockEdgeTokenRepository = {
			create: vi.fn(),
			deleteByToken: vi.fn(),
		};

		return { mockSupabaseAuth, mockUserRepository, mockEdgeTokenRepository };
	});

// ---------------------------------------------------------------------------
// モック宣言（インポート前に必須）
// ---------------------------------------------------------------------------

vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		auth: mockSupabaseAuth,
	},
	createAuthOnlyClient: () => ({
		auth: mockSupabaseAuth,
	}),
}));

vi.mock("../../../lib/infrastructure/repositories/user-repository", () => ({
	findById: (...args: unknown[]) => mockUserRepository.findById(...args),
	findBySupabaseAuthId: (...args: unknown[]) =>
		mockUserRepository.findBySupabaseAuthId(...args),
	findByPatToken: (...args: unknown[]) =>
		mockUserRepository.findByPatToken(...args),
	completeRegistrationUpdate: (...args: unknown[]) =>
		mockUserRepository.completeRegistrationUpdate(...args),
	updateSupabaseAuthId: (...args: unknown[]) =>
		mockUserRepository.updateSupabaseAuthId(...args),
	updatePatToken: (...args: unknown[]) =>
		mockUserRepository.updatePatToken(...args),
	updatePatLastUsedAt: (...args: unknown[]) =>
		mockUserRepository.updatePatLastUsedAt(...args),
}));

vi.mock(
	"../../../lib/infrastructure/repositories/edge-token-repository",
	() => ({
		create: (...args: unknown[]) => mockEdgeTokenRepository.create(...args),
		deleteByToken: (...args: unknown[]) =>
			mockEdgeTokenRepository.deleteByToken(...args),
	}),
);

// crypto モックは使わない（randomBytes/randomUUID は実際の実装を使用する）

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import type { User } from "../../../lib/domain/models/user";
import * as RegistrationService from "../../../lib/services/registration-service";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const USER_ID = "user-uuid-001";
const SUPABASE_AUTH_ID = "supabase-auth-uuid-001";
const EMAIL = "test@example.com";
const PASSWORD = "password123";
const PAT_TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const EDGE_TOKEN = "edge-token-uuid-001";

/** テスト用仮ユーザーを生成する */
function createTemporaryUser(overrides: Partial<User> = {}): User {
	return {
		id: USER_ID,
		authToken: "auth-token-001",
		authorIdSeed: "seed-001",
		isPremium: false,
		isVerified: true,
		username: null,
		streakDays: 0,
		lastPostDate: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		supabaseAuthId: null,
		registrationType: null,
		registeredAt: null,
		patToken: null,
		patLastUsedAt: null,
		// Phase 4: 草コマンド関連フィールド（デフォルト値）
		// See: features/reactions.feature §成長ビジュアル
		grassCount: 0,
		// Phase 5: BAN システム関連フィールド（デフォルト値）
		// See: features/admin.feature @ユーザーBAN
		isBanned: false,
		lastIpHash: null,
		themeId: null,
		fontId: null,
		...overrides,
	};
}

/** テスト用本登録済みユーザーを生成する */
function createRegisteredUser(overrides: Partial<User> = {}): User {
	return createTemporaryUser({
		supabaseAuthId: SUPABASE_AUTH_ID,
		registrationType: "email",
		registeredAt: new Date("2026-03-01T00:00:00Z"),
		patToken: PAT_TOKEN,
		...overrides,
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("RegistrationService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// registerWithEmail
	// =========================================================================

	describe("registerWithEmail", () => {
		const REDIRECT_URL =
			"https://example.com/api/auth/callback?flow=email_confirm&userId=user-uuid-001";

		it("正常: 仮ユーザーが本登録申請すると success: true を返す", async () => {
			// See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
			mockUserRepository.findById.mockResolvedValue(createTemporaryUser());
			mockSupabaseAuth.signUp.mockResolvedValue({ error: null });

			const result = await RegistrationService.registerWithEmail(
				USER_ID,
				EMAIL,
				PASSWORD,
				REDIRECT_URL,
			);

			expect(result).toEqual({ success: true });
			expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
				email: EMAIL,
				password: PASSWORD,
				options: {
					emailRedirectTo: REDIRECT_URL,
					data: { battleboard_user_id: USER_ID },
				},
			});
		});

		it("正常: redirectTo が signUp の emailRedirectTo に設定される", async () => {
			mockUserRepository.findById.mockResolvedValue(createTemporaryUser());
			mockSupabaseAuth.signUp.mockResolvedValue({ error: null });

			await RegistrationService.registerWithEmail(
				USER_ID,
				EMAIL,
				PASSWORD,
				"https://example.com/callback",
			);

			expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
				email: EMAIL,
				password: PASSWORD,
				options: {
					emailRedirectTo: "https://example.com/callback",
					data: { battleboard_user_id: USER_ID },
				},
			});
		});

		it("異常系: ユーザーが見つからない場合は not_found を返す", async () => {
			mockUserRepository.findById.mockResolvedValue(null);

			const result = await RegistrationService.registerWithEmail(
				"nonexistent-user-id",
				EMAIL,
				PASSWORD,
				REDIRECT_URL,
			);

			expect(result).toEqual({ success: false, reason: "not_found" });
			expect(mockSupabaseAuth.signUp).not.toHaveBeenCalled();
		});

		it("異常系: 既に本登録済みの場合は already_registered を返す", async () => {
			// See: features/user_registration.feature
			mockUserRepository.findById.mockResolvedValue(createRegisteredUser());

			const result = await RegistrationService.registerWithEmail(
				USER_ID,
				EMAIL,
				PASSWORD,
				REDIRECT_URL,
			);

			expect(result).toEqual({ success: false, reason: "already_registered" });
			expect(mockSupabaseAuth.signUp).not.toHaveBeenCalled();
		});

		it("異常系: メールアドレスが既に使用されている場合は email_taken を返す", async () => {
			// See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
			mockUserRepository.findById.mockResolvedValue(createTemporaryUser());
			mockSupabaseAuth.signUp.mockResolvedValue({
				error: { message: "User already registered", status: 422 },
			});

			const result = await RegistrationService.registerWithEmail(
				USER_ID,
				EMAIL,
				PASSWORD,
				REDIRECT_URL,
			);

			expect(result).toEqual({ success: false, reason: "email_taken" });
		});

		it("異常系: Supabase Auth エラー（重複以外）はエラーをスローする", async () => {
			mockUserRepository.findById.mockResolvedValue(createTemporaryUser());
			mockSupabaseAuth.signUp.mockResolvedValue({
				error: { message: "network error", status: 500 },
			});

			await expect(
				RegistrationService.registerWithEmail(
					USER_ID,
					EMAIL,
					PASSWORD,
					REDIRECT_URL,
				),
			).rejects.toThrow("RegistrationService.registerWithEmail failed");
		});
	});

	// =========================================================================
	// registerWithDiscord
	// =========================================================================

	describe("registerWithDiscord", () => {
		it("正常: Discord OAuth URL と codeVerifier を返す", () => {
			// registerWithDiscord は同期関数（PKCE は Node.js crypto で直接生成）
			// See: src/lib/services/registration-service.ts generatePkce()
			const result = RegistrationService.registerWithDiscord(
				"https://example.com/callback",
			);

			// redirectUrl が SUPABASE_URL ベースの認可 URL であること
			expect(result.redirectUrl).toContain("provider=discord");
			// codeVerifier が返されること（PKCE フロー）
			expect(typeof result.codeVerifier).toBe("string");
			expect(result.codeVerifier.length).toBeGreaterThan(0);
		});

		it("正常: redirectTo がURLに含まれる", () => {
			const redirectTo = "https://example.com/callback";
			const result = RegistrationService.registerWithDiscord(redirectTo);

			expect(result.redirectUrl).toContain(encodeURIComponent(redirectTo));
		});
	});

	// =========================================================================
	// completeRegistration
	// =========================================================================

	describe("completeRegistration", () => {
		it("正常: completeRegistrationUpdate が1回の呼び出しで全フィールドを更新する（アトミック化）", async () => {
			// See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
			// See: tmp/workers/bdd-architect_ATK-REG-001/assessment.md §修正方針
			mockUserRepository.completeRegistrationUpdate.mockResolvedValue(
				undefined,
			);

			await RegistrationService.completeRegistration(
				USER_ID,
				SUPABASE_AUTH_ID,
				"email",
			);

			// 統合メソッドが1回だけ呼ばれることを確認（非アトミック2段階呼び出しではなくなった）
			expect(
				mockUserRepository.completeRegistrationUpdate,
			).toHaveBeenCalledTimes(1);
			expect(
				mockUserRepository.completeRegistrationUpdate,
			).toHaveBeenCalledWith(
				USER_ID,
				SUPABASE_AUTH_ID,
				"email",
				expect.stringMatching(/^[0-9a-f]{32}$/),
			);
			// 旧来の2段階呼び出しが行われないことを確認
			expect(mockUserRepository.updateSupabaseAuthId).not.toHaveBeenCalled();
			expect(mockUserRepository.updatePatToken).not.toHaveBeenCalled();
		});

		it("正常: Discord 本登録の場合も completeRegistrationUpdate が呼ばれる", async () => {
			// See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
			mockUserRepository.completeRegistrationUpdate.mockResolvedValue(
				undefined,
			);

			await RegistrationService.completeRegistration(
				USER_ID,
				SUPABASE_AUTH_ID,
				"discord",
			);

			expect(
				mockUserRepository.completeRegistrationUpdate,
			).toHaveBeenCalledWith(
				USER_ID,
				SUPABASE_AUTH_ID,
				"discord",
				expect.stringMatching(/^[0-9a-f]{32}$/),
			);
		});

		it("正常: 連続して呼ばれた場合、PAT は毎回異なる値が生成される", async () => {
			// See: docs/architecture/components/user-registration.md §8.1 自動発行
			const capturedPats: string[] = [];
			mockUserRepository.completeRegistrationUpdate.mockImplementation(
				(
					_userId: string,
					_supabaseAuthId: string,
					_registrationType: string,
					patToken: string,
				) => {
					capturedPats.push(patToken);
					return Promise.resolve();
				},
			);

			await RegistrationService.completeRegistration(
				USER_ID,
				SUPABASE_AUTH_ID,
				"email",
			);
			await RegistrationService.completeRegistration(
				USER_ID,
				SUPABASE_AUTH_ID,
				"email",
			);

			expect(capturedPats).toHaveLength(2);
			expect(capturedPats[0]).not.toBe(capturedPats[1]);
		});
	});

	// =========================================================================
	// loginWithEmail
	// =========================================================================

	describe("loginWithEmail", () => {
		it("正常: 認証成功時は userId と edgeToken を返す", async () => {
			// See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
			mockSupabaseAuth.signInWithPassword.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(
				createRegisteredUser(),
			);
			mockEdgeTokenRepository.create.mockResolvedValue({
				id: "et-id-001",
				userId: USER_ID,
				token: EDGE_TOKEN,
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});

			const result = await RegistrationService.loginWithEmail(EMAIL, PASSWORD);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.userId).toBe(USER_ID);
				expect(result.edgeToken).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
				);
			}
		});

		it("正常: 新しい edge-token が edge_tokens テーブルに INSERT される", async () => {
			// See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
			mockSupabaseAuth.signInWithPassword.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(
				createRegisteredUser(),
			);
			mockEdgeTokenRepository.create.mockResolvedValue({});

			await RegistrationService.loginWithEmail(EMAIL, PASSWORD);

			// Sprint-150: メールログインは channel='web'
			expect(mockEdgeTokenRepository.create).toHaveBeenCalledWith(
				USER_ID,
				expect.any(String),
				"web",
			);
		});

		it("異常系: パスワードが誤っている場合は invalid_credentials を返す", async () => {
			// See: features/user_registration.feature @誤ったパスワードではログインできない
			mockSupabaseAuth.signInWithPassword.mockResolvedValue({
				data: { user: null },
				error: { message: "Invalid login credentials" },
			});

			const result = await RegistrationService.loginWithEmail(
				EMAIL,
				"wrong-password",
			);

			expect(result).toEqual({ success: false, reason: "invalid_credentials" });
		});

		it("異常系: Supabase Auth に存在するが users テーブルに未登録の場合は not_registered を返す", async () => {
			mockSupabaseAuth.signInWithPassword.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(null);

			const result = await RegistrationService.loginWithEmail(EMAIL, PASSWORD);

			expect(result).toEqual({ success: false, reason: "not_registered" });
		});
	});

	// =========================================================================
	// loginWithDiscord
	// =========================================================================

	describe("loginWithDiscord", () => {
		it("正常: Discord OAuth URL と codeVerifier を返す", () => {
			// loginWithDiscord は同期関数（PKCE は Node.js crypto で直接生成）
			// See: src/lib/services/registration-service.ts generatePkce()
			const result = RegistrationService.loginWithDiscord(
				"https://example.com/callback",
			);

			// redirectUrl が SUPABASE_URL ベースの認可 URL であること
			expect(result.redirectUrl).toContain("provider=discord");
			// codeVerifier が返されること（PKCE フロー）
			expect(typeof result.codeVerifier).toBe("string");
			expect(result.codeVerifier.length).toBeGreaterThan(0);
		});

		it("正常: redirectTo がURLに含まれる", () => {
			const redirectTo = "https://example.com/callback";
			const result = RegistrationService.loginWithDiscord(redirectTo);

			expect(result.redirectUrl).toContain(encodeURIComponent(redirectTo));
		});
	});

	// =========================================================================
	// handleOAuthCallback
	// =========================================================================

	describe("handleOAuthCallback", () => {
		it("正常(ログインフロー): 既存本登録ユーザーが OAuth でログインすると edgeToken を返す", async () => {
			mockSupabaseAuth.exchangeCodeForSession.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(
				createRegisteredUser(),
			);
			mockEdgeTokenRepository.create.mockResolvedValue({});

			const result =
				await RegistrationService.handleOAuthCallback("oauth-code-123");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.userId).toBe(USER_ID);
				expect(result.edgeToken).toBeDefined();
			}
		});

		it("正常(本登録フロー): 仮ユーザー ID を渡すと本登録が完了してログインする", async () => {
			mockSupabaseAuth.exchangeCodeForSession.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});
			// 最初は supabase_auth_id で見つからない（未本登録）
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(null);
			// completeRegistration の内部呼び出し（統合メソッド）
			mockUserRepository.completeRegistrationUpdate.mockResolvedValue(
				undefined,
			);
			// 本登録完了後に findById で取得
			mockUserRepository.findById.mockResolvedValue(createRegisteredUser());
			mockEdgeTokenRepository.create.mockResolvedValue({});

			const result = await RegistrationService.handleOAuthCallback(
				"oauth-code-123",
				USER_ID, // 仮ユーザー ID
			);

			expect(result.success).toBe(true);
			// completeRegistration が completeRegistrationUpdate を呼び出すことを確認
			expect(
				mockUserRepository.completeRegistrationUpdate,
			).toHaveBeenCalledWith(
				USER_ID,
				SUPABASE_AUTH_ID,
				"discord",
				expect.stringMatching(/^[0-9a-f]{32}$/),
			);
		});

		it("異常系: コード交換に失敗した場合は invalid_credentials を返す", async () => {
			mockSupabaseAuth.exchangeCodeForSession.mockResolvedValue({
				data: { user: null },
				error: { message: "invalid code" },
			});

			const result = await RegistrationService.handleOAuthCallback("bad-code");

			expect(result).toEqual({ success: false, reason: "invalid_credentials" });
		});

		it("異常系: supabase_auth_id 未登録かつ pendingUserId なしは not_registered を返す", async () => {
			mockSupabaseAuth.exchangeCodeForSession.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(null);

			const result = await RegistrationService.handleOAuthCallback(
				"oauth-code-123",
				// pendingUserId を渡さない
			);

			expect(result).toEqual({ success: false, reason: "not_registered" });
		});
	});

	// =========================================================================
	// handleEmailConfirmCallback
	// =========================================================================

	describe("handleEmailConfirmCallback", () => {
		it("正常(新規本登録): 仮ユーザーを本登録し edgeToken を返す", async () => {
			// supabase_auth_id で既存ユーザーは見つからない（新規）
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(null);
			// completeRegistration の内部呼び出し（統合メソッド）
			mockUserRepository.completeRegistrationUpdate.mockResolvedValue(
				undefined,
			);
			// 本登録完了後に findById で取得
			mockUserRepository.findById.mockResolvedValue(createRegisteredUser());
			mockEdgeTokenRepository.create.mockResolvedValue({});

			const result = await RegistrationService.handleEmailConfirmCallback(
				SUPABASE_AUTH_ID,
				USER_ID,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.userId).toBe(USER_ID);
				expect(result.edgeToken).toBeDefined();
			}
			// completeRegistration が "email" タイプで completeRegistrationUpdate を呼び出すこと
			expect(
				mockUserRepository.completeRegistrationUpdate,
			).toHaveBeenCalledWith(
				USER_ID,
				SUPABASE_AUTH_ID,
				"email",
				expect.stringMatching(/^[0-9a-f]{32}$/),
			);
		});

		it("正常(二重完了防止): 既に本登録済みの場合は既存ユーザーで edge-token を発行する", async () => {
			// 既に supabase_auth_id で見つかる（本登録済み）
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(
				createRegisteredUser(),
			);
			mockEdgeTokenRepository.create.mockResolvedValue({});

			const result = await RegistrationService.handleEmailConfirmCallback(
				SUPABASE_AUTH_ID,
				USER_ID,
			);

			expect(result.success).toBe(true);
			// completeRegistration は呼ばれない（既に登録済み）
			expect(mockUserRepository.updateSupabaseAuthId).not.toHaveBeenCalled();
		});

		it("異常系: 本登録完了後にユーザーが見つからない場合は not_registered を返す", async () => {
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(null);
			mockUserRepository.updateSupabaseAuthId.mockResolvedValue(undefined);
			mockUserRepository.updatePatToken.mockResolvedValue(undefined);
			// findById が null を返す（異常状態）
			mockUserRepository.findById.mockResolvedValue(null);

			const result = await RegistrationService.handleEmailConfirmCallback(
				SUPABASE_AUTH_ID,
				USER_ID,
			);

			expect(result).toEqual({ success: false, reason: "not_registered" });
		});
	});

	// =========================================================================
	// requestPasswordReset
	// See: features/user_registration.feature @本登録ユーザーがパスワード再設定を申請する
	// =========================================================================

	describe("requestPasswordReset", () => {
		it("正常: resetPasswordForEmail を呼び出し success: true を返す", async () => {
			mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null,
			});

			const result = await RegistrationService.requestPasswordReset(
				EMAIL,
				"/auth/reset-password",
			);

			expect(result).toEqual({ success: true });
			expect(mockSupabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
				EMAIL,
				{
					redirectTo: "/auth/reset-password",
				},
			);
		});

		it("セキュリティ: Supabase Auth がエラーを返しても success: true を返す（列挙攻撃防止）", async () => {
			// See: features/user_registration.feature @未登録のメールアドレスでパスワード再設定を申請してもエラーを明かさない
			mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: { message: "User not found" },
			});

			const result = await RegistrationService.requestPasswordReset(
				"nonexistent@example.com",
				"/auth/reset-password",
			);

			// エラーがあっても success を返す
			expect(result).toEqual({ success: true });
		});
	});

	// =========================================================================
	// handleRecoveryCallback
	// See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
	// =========================================================================

	describe("handleRecoveryCallback", () => {
		it("正常: supabaseAuthId でユーザーを特定し edgeToken を返す", async () => {
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(
				createRegisteredUser(),
			);
			mockEdgeTokenRepository.create.mockResolvedValue({});

			const result =
				await RegistrationService.handleRecoveryCallback(SUPABASE_AUTH_ID);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.userId).toBe(USER_ID);
				expect(result.edgeToken).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
				);
			}
			expect(mockUserRepository.findBySupabaseAuthId).toHaveBeenCalledWith(
				SUPABASE_AUTH_ID,
			);
		});

		it("正常: 新しい edge-token が edge_tokens テーブルに INSERT される", async () => {
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(
				createRegisteredUser(),
			);
			mockEdgeTokenRepository.create.mockResolvedValue({});

			await RegistrationService.handleRecoveryCallback(SUPABASE_AUTH_ID);

			// Sprint-150: パスワード再設定は channel='web'
			expect(mockEdgeTokenRepository.create).toHaveBeenCalledWith(
				USER_ID,
				expect.any(String),
				"web",
			);
		});

		it("異常系: supabaseAuthId に対応するユーザーがいない場合は not_registered を返す", async () => {
			mockUserRepository.findBySupabaseAuthId.mockResolvedValue(null);

			const result = await RegistrationService.handleRecoveryCallback(
				"nonexistent-supabase-id",
			);

			expect(result).toEqual({
				success: false,
				reason: "not_registered",
			});
			expect(mockEdgeTokenRepository.create).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// updatePassword
	// See: features/user_registration.feature @パスワード再設定リンクから新しいパスワードを設定する
	// =========================================================================

	describe("updatePassword", () => {
		const NEW_PASSWORD = "newpassword123";

		it("正常: Supabase Auth Admin API でパスワードを更新し success: true を返す", async () => {
			mockUserRepository.findById.mockResolvedValue(createRegisteredUser());
			mockSupabaseAuth.admin.updateUserById.mockResolvedValue({
				data: { user: { id: SUPABASE_AUTH_ID } },
				error: null,
			});

			const result = await RegistrationService.updatePassword(
				USER_ID,
				NEW_PASSWORD,
			);

			expect(result).toEqual({ success: true });
			expect(mockSupabaseAuth.admin.updateUserById).toHaveBeenCalledWith(
				SUPABASE_AUTH_ID,
				{
					password: NEW_PASSWORD,
				},
			);
		});

		it("異常系: ユーザーが見つからない場合は not_registered を返す", async () => {
			mockUserRepository.findById.mockResolvedValue(null);

			const result = await RegistrationService.updatePassword(
				"nonexistent-user",
				NEW_PASSWORD,
			);

			expect(result).toEqual({
				success: false,
				reason: "not_registered",
			});
			expect(mockSupabaseAuth.admin.updateUserById).not.toHaveBeenCalled();
		});

		it("異常系: supabaseAuthId がないユーザー（仮登録）は not_registered を返す", async () => {
			mockUserRepository.findById.mockResolvedValue(
				createTemporaryUser(), // supabaseAuthId: null
			);

			const result = await RegistrationService.updatePassword(
				USER_ID,
				NEW_PASSWORD,
			);

			expect(result).toEqual({
				success: false,
				reason: "not_registered",
			});
			expect(mockSupabaseAuth.admin.updateUserById).not.toHaveBeenCalled();
		});

		it("異常系: Supabase Auth Admin API がエラーを返す場合はエラーをスローする", async () => {
			mockUserRepository.findById.mockResolvedValue(createRegisteredUser());
			mockSupabaseAuth.admin.updateUserById.mockResolvedValue({
				data: { user: null },
				error: { message: "internal error" },
			});

			await expect(
				RegistrationService.updatePassword(USER_ID, NEW_PASSWORD),
			).rejects.toThrow("updatePassword failed");
		});
	});

	// =========================================================================
	// logout
	// =========================================================================

	describe("logout", () => {
		it("正常: 指定した edge-token が edge_tokens テーブルから削除される", async () => {
			// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
			mockEdgeTokenRepository.deleteByToken.mockResolvedValue(undefined);

			await RegistrationService.logout("some-edge-token");

			expect(mockEdgeTokenRepository.deleteByToken).toHaveBeenCalledWith(
				"some-edge-token",
			);
		});

		it("正常: 存在しない edge-token を渡しても正常終了する（冪等性）", async () => {
			mockEdgeTokenRepository.deleteByToken.mockResolvedValue(undefined);

			await expect(
				RegistrationService.logout("nonexistent-token"),
			).resolves.toBeUndefined();
		});

		it("エッジケース: 空文字列のトークンを渡しても deleteByToken を呼ぶ", async () => {
			mockEdgeTokenRepository.deleteByToken.mockResolvedValue(undefined);

			await RegistrationService.logout("");

			expect(mockEdgeTokenRepository.deleteByToken).toHaveBeenCalledWith("");
		});
	});

	// =========================================================================
	// verifyPat
	// =========================================================================

	describe("verifyPat", () => {
		it("正常: 有効な PAT でユーザーIDを返す", async () => {
			// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
			mockUserRepository.findByPatToken.mockResolvedValue(
				createRegisteredUser(),
			);
			mockUserRepository.updatePatLastUsedAt.mockResolvedValue(undefined);

			const result = await RegistrationService.verifyPat(PAT_TOKEN);

			expect(result).toEqual({ valid: true, userId: USER_ID });
			expect(mockUserRepository.updatePatLastUsedAt).toHaveBeenCalledWith(
				USER_ID,
			);
		});

		it("正常: PAT 認証成功時に pat_last_used_at が更新される", async () => {
			mockUserRepository.findByPatToken.mockResolvedValue(
				createRegisteredUser(),
			);
			mockUserRepository.updatePatLastUsedAt.mockResolvedValue(undefined);

			await RegistrationService.verifyPat(PAT_TOKEN);

			expect(mockUserRepository.updatePatLastUsedAt).toHaveBeenCalledTimes(1);
		});

		it("異常系: 存在しない PAT の場合は valid: false を返す", async () => {
			// See: features/user_registration.feature @無効なPATでは書き込みが拒否される
			mockUserRepository.findByPatToken.mockResolvedValue(null);

			const result = await RegistrationService.verifyPat("invalid-pat");

			expect(result).toEqual({ valid: false });
			expect(mockUserRepository.updatePatLastUsedAt).not.toHaveBeenCalled();
		});

		it("エッジケース: 空文字列の PAT は valid: false を返す", async () => {
			mockUserRepository.findByPatToken.mockResolvedValue(null);

			const result = await RegistrationService.verifyPat("");

			expect(result).toEqual({ valid: false });
		});
	});

	// =========================================================================
	// regeneratePat
	// =========================================================================

	describe("regeneratePat", () => {
		it("正常: 新しい PAT が生成されて返される", async () => {
			// See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
			mockUserRepository.updatePatToken.mockResolvedValue(undefined);

			const result = await RegistrationService.regeneratePat(USER_ID);

			expect(result.patToken).toMatch(/^[0-9a-f]{32}$/);
			expect(mockUserRepository.updatePatToken).toHaveBeenCalledWith(
				USER_ID,
				result.patToken,
			);
		});

		it("正常: 連続して再発行すると毎回異なる PAT が生成される", async () => {
			// See: docs/architecture/components/user-registration.md §8.4 再発行
			mockUserRepository.updatePatToken.mockResolvedValue(undefined);

			const result1 = await RegistrationService.regeneratePat(USER_ID);
			const result2 = await RegistrationService.regeneratePat(USER_ID);

			expect(result1.patToken).not.toBe(result2.patToken);
		});
	});

	// =========================================================================
	// loginWithPat
	// =========================================================================

	describe("loginWithPat", () => {
		it("正常: 有効な PAT で userId と edgeToken を返す", async () => {
			// See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
			mockUserRepository.findByPatToken.mockResolvedValue(
				createRegisteredUser(),
			);
			mockUserRepository.updatePatLastUsedAt.mockResolvedValue(undefined);
			mockEdgeTokenRepository.create.mockResolvedValue({
				id: "et-id-new",
				userId: USER_ID,
				token: "new-edge-token",
				createdAt: new Date(),
				lastUsedAt: new Date(),
			});

			const result = await RegistrationService.loginWithPat(PAT_TOKEN);

			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.userId).toBe(USER_ID);
				expect(result.edgeToken).toBeDefined();
			}
		});

		it("正常: PAT 認証後に新しい edge-token が edge_tokens テーブルに INSERT される", async () => {
			mockUserRepository.findByPatToken.mockResolvedValue(
				createRegisteredUser(),
			);
			mockUserRepository.updatePatLastUsedAt.mockResolvedValue(undefined);
			mockEdgeTokenRepository.create.mockResolvedValue({});

			await RegistrationService.loginWithPat(PAT_TOKEN);

			// Sprint-150: PAT 認証は channel='senbra'
			expect(mockEdgeTokenRepository.create).toHaveBeenCalledWith(
				USER_ID,
				expect.any(String),
				"senbra",
			);
		});

		it("異常系: 無効な PAT の場合は valid: false を返す", async () => {
			// See: features/user_registration.feature @無効なPATでは書き込みが拒否される
			mockUserRepository.findByPatToken.mockResolvedValue(null);

			const result = await RegistrationService.loginWithPat("invalid-pat");

			expect(result).toEqual({ valid: false });
			expect(mockEdgeTokenRepository.create).not.toHaveBeenCalled();
		});
	});
});
