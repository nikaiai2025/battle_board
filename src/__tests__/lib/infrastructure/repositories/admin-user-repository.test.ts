/**
 * 単体テスト: AdminUserRepository
 *
 * @feature features/authentication.feature
 * @scenario 管理者が正しいメールアドレスとパスワードでログインする
 * @scenario 管理者が誤ったパスワードでログインすると失敗する
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 * See: features/admin.feature @管理者がログイン済みである
 * See: docs/architecture/components/admin.md §3 依存関係
 * See: docs/architecture/architecture.md §5.3 管理者認証
 *
 * テスト方針:
 *   - supabaseAdmin と createClient はモック化して外部DBに依存しない
 *   - バグ修正の核心: loginWithPassword が supabaseAdmin のセッションを汚染しないことを検証する
 *     - signInWithPassword は一時クライアント（createClient で作成）で実行される
 *     - supabaseAdmin.auth.signInWithPassword は呼ばれない
 *   - findById は supabaseAdmin（service_role）を使い続けることを検証する
 *
 * カバレッジ対象:
 *   - loginWithPassword: 正常（管理者存在）・認証失敗・管理者テーブル未登録
 *   - findById:          正常取得・存在しない（PGRST116）・DBエラー
 *   - エッジケース:       空文字・null 入力、supabaseAdmin セッション汚染なし
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

/**
 * vi.mock ファクトリはファイルトップへホイスティングされるため、
 * vi.hoisted を使用してファクトリ内で参照する変数をホイスティング順序に合わせる。
 */
const {
	mockAdminAuthSignIn,
	mockAdminFrom,
	mockTempAuthSignIn,
	mockCreateClient,
	mockSelect,
	mockEq,
	mockSingle,
} = vi.hoisted(() => ({
	mockAdminAuthSignIn: vi.fn(),
	mockAdminFrom: vi.fn(),
	mockTempAuthSignIn: vi.fn(),
	mockCreateClient: vi.fn(),
	mockSelect: vi.fn(),
	mockEq: vi.fn(),
	mockSingle: vi.fn(),
}));

/**
 * supabaseAdmin モジュールをモック化する。
 * - supabaseAdmin.auth.signInWithPassword: バグ修正後は呼ばれないことを検証する
 * - supabaseAdmin.from(): findById で引き続き使用される
 */
vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		auth: {
			signInWithPassword: mockAdminAuthSignIn,
		},
		from: mockAdminFrom,
	},
}));

/**
 * @supabase/supabase-js の createClient をモック化する。
 * loginWithPassword 内で認証専用一時クライアントを作成する際に使用される。
 * 一時クライアントの auth.signInWithPassword が mockTempAuthSignIn に紐付く。
 */
vi.mock("@supabase/supabase-js", () => ({
	createClient: mockCreateClient,
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import * as AdminUserRepository from "../../../../lib/infrastructure/repositories/admin-user-repository";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-03-20T09:00:00.000Z";
const NOW = new Date(NOW_ISO);
const TEST_ADMIN_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TEST_EMAIL = "admin@example.com";
const TEST_PASSWORD = "test-password-123";
const TEST_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test";

/** テスト用 admin_users テーブルの DB レコード */
function createAdminUserRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: TEST_ADMIN_ID,
		role: "admin",
		created_at: NOW_ISO,
		...overrides,
	};
}

/**
 * supabaseAdmin.from().select().eq().single() のチェーンをセットアップする。
 * findById で使用されるパターン。
 */
function setupAdminFromChain(result: { data: unknown; error: unknown }) {
	mockSingle.mockResolvedValue(result);
	mockEq.mockReturnValue({ single: mockSingle });
	mockSelect.mockReturnValue({ eq: mockEq });
	mockAdminFrom.mockReturnValue({ select: mockSelect });
}

/**
 * 一時クライアントをセットアップする。
 * createClient() の戻り値として、auth.signInWithPassword を持つオブジェクトを返す。
 */
function setupTempClient(authResult: { data: unknown; error: unknown }) {
	mockTempAuthSignIn.mockResolvedValue(authResult);
	mockCreateClient.mockReturnValue({
		auth: {
			signInWithPassword: mockTempAuthSignIn,
		},
	});
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AdminUserRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// loginWithPassword — バグ修正の中心
	// =========================================================================

	describe("loginWithPassword", () => {
		// See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする

		describe("【バグ修正】supabaseAdmin のセッション汚染なし", () => {
			it("supabaseAdmin.auth.signInWithPassword は呼ばれない（一時クライアントを使用する）", async () => {
				// Arrange: 認証成功シナリオ
				setupTempClient({
					data: {
						session: { access_token: TEST_ACCESS_TOKEN },
						user: { id: TEST_ADMIN_ID },
					},
					error: null,
				});
				setupAdminFromChain({ data: createAdminUserRow(), error: null });

				// Act
				await AdminUserRepository.loginWithPassword(TEST_EMAIL, TEST_PASSWORD);

				// Assert: supabaseAdmin の signInWithPassword が呼ばれていないこと（汚染なし）
				expect(mockAdminAuthSignIn).not.toHaveBeenCalled();
			});

			it("一時クライアントの signInWithPassword が正しい認証情報で呼ばれる", async () => {
				// Arrange
				setupTempClient({
					data: {
						session: { access_token: TEST_ACCESS_TOKEN },
						user: { id: TEST_ADMIN_ID },
					},
					error: null,
				});
				setupAdminFromChain({ data: createAdminUserRow(), error: null });

				// Act
				await AdminUserRepository.loginWithPassword(TEST_EMAIL, TEST_PASSWORD);

				// Assert: 一時クライアントに対して正しいパラメータが渡されること
				expect(mockTempAuthSignIn).toHaveBeenCalledOnce();
				expect(mockTempAuthSignIn).toHaveBeenCalledWith({
					email: TEST_EMAIL,
					password: TEST_PASSWORD,
				});
			});

			it("createClient が URL と serviceRoleKey で呼ばれ、一時クライアントが作成される", async () => {
				// Arrange
				setupTempClient({
					data: {
						session: { access_token: TEST_ACCESS_TOKEN },
						user: { id: TEST_ADMIN_ID },
					},
					error: null,
				});
				setupAdminFromChain({ data: createAdminUserRow(), error: null });

				// Act
				await AdminUserRepository.loginWithPassword(TEST_EMAIL, TEST_PASSWORD);

				// Assert: createClient が呼ばれること（URL・キーは環境変数依存のため引数の存在のみ確認）
				expect(mockCreateClient).toHaveBeenCalledOnce();
				// createClient の引数は (url, serviceRoleKey) の2引数であることを確認
				const [url, key] = mockCreateClient.mock.calls[0];
				expect(typeof url).toBe("string");
				expect(typeof key).toBe("string");
			});
		});

		describe("正常系", () => {
			it("管理者認証に成功した場合、success: true とセッショントークン・ユーザーIDを返す", async () => {
				// Arrange
				setupTempClient({
					data: {
						session: { access_token: TEST_ACCESS_TOKEN },
						user: { id: TEST_ADMIN_ID },
					},
					error: null,
				});
				setupAdminFromChain({ data: createAdminUserRow(), error: null });

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					TEST_PASSWORD,
				);

				// Assert
				expect(result).toEqual({
					success: true,
					sessionToken: TEST_ACCESS_TOKEN,
					userId: TEST_ADMIN_ID,
				});
			});

			it("findById は supabaseAdmin（service_role）で実行される", async () => {
				// Arrange: 認証成功後、findById が supabaseAdmin を使う
				setupTempClient({
					data: {
						session: { access_token: TEST_ACCESS_TOKEN },
						user: { id: TEST_ADMIN_ID },
					},
					error: null,
				});
				setupAdminFromChain({ data: createAdminUserRow(), error: null });

				// Act
				await AdminUserRepository.loginWithPassword(TEST_EMAIL, TEST_PASSWORD);

				// Assert: supabaseAdmin.from() が呼ばれること（findById がsupabaseAdminを使用）
				expect(mockAdminFrom).toHaveBeenCalledWith("admin_users");
			});
		});

		describe("異常系: 認証失敗", () => {
			// See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する

			it("Supabase Auth が error を返した場合、invalid_credentials を返す", async () => {
				// Arrange
				setupTempClient({
					data: { session: null, user: null },
					error: { message: "Invalid login credentials" },
				});

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					"wrong-password",
				);

				// Assert
				expect(result).toEqual({
					success: false,
					reason: "invalid_credentials",
				});
			});

			it("session が null の場合、invalid_credentials を返す", async () => {
				// Arrange: error は null だが session がない（認証不完全）
				setupTempClient({
					data: { session: null, user: { id: TEST_ADMIN_ID } },
					error: null,
				});

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					TEST_PASSWORD,
				);

				// Assert
				expect(result).toEqual({
					success: false,
					reason: "invalid_credentials",
				});
			});

			it("user が null の場合、invalid_credentials を返す", async () => {
				// Arrange
				setupTempClient({
					data: { session: { access_token: TEST_ACCESS_TOKEN }, user: null },
					error: null,
				});

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					TEST_PASSWORD,
				);

				// Assert
				expect(result).toEqual({
					success: false,
					reason: "invalid_credentials",
				});
			});

			it("Supabase Auth には存在するが admin_users テーブルに未登録の場合、not_admin を返す", async () => {
				// Arrange: 認証は成功するが admin_users には存在しない（PGRST116）
				setupTempClient({
					data: {
						session: { access_token: TEST_ACCESS_TOKEN },
						user: { id: TEST_ADMIN_ID },
					},
					error: null,
				});
				setupAdminFromChain({
					data: null,
					error: { code: "PGRST116", message: "Row not found" },
				});

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					TEST_PASSWORD,
				);

				// Assert
				expect(result).toEqual({
					success: false,
					reason: "not_admin",
				});
			});

			it("認証失敗時は findById（supabaseAdmin）を呼ばない", async () => {
				// Arrange: 認証エラー
				setupTempClient({
					data: { session: null, user: null },
					error: { message: "Invalid login credentials" },
				});

				// Act
				await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					"wrong-password",
				);

				// Assert: DB クエリは実行されない
				expect(mockAdminFrom).not.toHaveBeenCalled();
			});
		});

		describe("エッジケース", () => {
			it("空文字のメールアドレスでも invalid_credentials を返す（Supabase が弾く）", async () => {
				// Arrange
				setupTempClient({
					data: { session: null, user: null },
					error: { message: "Invalid email" },
				});

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					"",
					TEST_PASSWORD,
				);

				// Assert
				expect(result).toEqual({
					success: false,
					reason: "invalid_credentials",
				});
			});

			it("空文字のパスワードでも invalid_credentials を返す（Supabase が弾く）", async () => {
				// Arrange
				setupTempClient({
					data: { session: null, user: null },
					error: { message: "Invalid password" },
				});

				// Act
				const result = await AdminUserRepository.loginWithPassword(
					TEST_EMAIL,
					"",
				);

				// Assert
				expect(result).toEqual({
					success: false,
					reason: "invalid_credentials",
				});
			});
		});
	});

	// =========================================================================
	// findById
	// =========================================================================

	describe("findById", () => {
		it("正常: 管理者ユーザーが見つかった場合は AdminUser ドメインモデルを返す", async () => {
			// Arrange
			setupAdminFromChain({ data: createAdminUserRow(), error: null });

			// Act
			const result = await AdminUserRepository.findById(TEST_ADMIN_ID);

			// Assert
			expect(result).toEqual({
				id: TEST_ADMIN_ID,
				role: "admin",
				createdAt: NOW,
			});
		});

		it("正常: PGRST116 エラーの場合は null を返す（ユーザー未登録）", async () => {
			// Arrange
			setupAdminFromChain({
				data: null,
				error: { code: "PGRST116", message: "Row not found" },
			});

			// Act
			const result = await AdminUserRepository.findById(TEST_ADMIN_ID);

			// Assert
			expect(result).toBeNull();
		});

		it("正常: snake_case から camelCase に正しく変換される", async () => {
			// Arrange
			const row = createAdminUserRow({
				id: TEST_ADMIN_ID,
				role: "super_admin",
				created_at: "2026-01-01T00:00:00.000Z",
			});
			setupAdminFromChain({ data: row, error: null });

			// Act
			const result = await AdminUserRepository.findById(TEST_ADMIN_ID);

			// Assert
			expect(result?.id).toBe(TEST_ADMIN_ID);
			expect(result?.role).toBe("super_admin");
			expect(result?.createdAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
		});

		it("異常系: PGRST116 以外の DB エラーはスローされる", async () => {
			// Arrange
			setupAdminFromChain({
				data: null,
				error: { code: "PGRST001", message: "connection failed" },
			});

			// Act & Assert
			await expect(AdminUserRepository.findById(TEST_ADMIN_ID)).rejects.toThrow(
				"AdminUserRepository.findById failed: connection failed",
			);
		});

		it("正常: supabaseAdmin.from('admin_users') が呼ばれる", async () => {
			// Arrange
			setupAdminFromChain({ data: createAdminUserRow(), error: null });

			// Act
			await AdminUserRepository.findById(TEST_ADMIN_ID);

			// Assert: supabaseAdmin を使ってクエリが実行される（service_role で RLS バイパス）
			expect(mockAdminFrom).toHaveBeenCalledWith("admin_users");
		});
	});
});
