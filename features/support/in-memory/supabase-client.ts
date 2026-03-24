/**
 * インメモリ Supabase クライアントスタブ
 *
 * BDD テスト用の Supabase 接続を持たないダミーエクスポート。
 * AuthService.verifyAdminSession が supabaseAdmin.auth.getUser を呼ぶが、
 * 管理者シナリオは Sprint-8 スコープ外のためダミー実装で十分。
 *
 * Phase 3 追加:
 *   RegistrationService が supabaseAdmin.auth.signUp / signInWithPassword /
 *   signInWithOAuth / exchangeCodeForSession を呼ぶため、
 *   BDDテスト用のスタブ実装を追加する。
 *   インメモリ Supabase Auth ストア（_supabaseAuthStore）を用意し、
 *   テスト用ヘルパー（_registerSupabaseUser / _stubSignInSuccess）で
 *   ユーザー登録と認証成功/失敗をシミュレートする。
 *
 * See: src/lib/infrastructure/supabase/client.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: task_TASK-016.md §補足・制約 > supabase/client: ダミーエクスポート
 * See: features/user_registration.feature
 */

// ---------------------------------------------------------------------------
// インメモリ Supabase Auth ストア（Phase 3 追加）
// See: features/user_registration.feature
// ---------------------------------------------------------------------------

interface SupabaseAuthUser {
	id: string;
	email: string;
	password: string;
}

/** テスト用 Supabase Auth ユーザーストア（email → user） */
const supabaseAuthStore = new Map<string, SupabaseAuthUser>();

/** signUp の結果スタブ: null=デフォルト成功、'email_taken'=重複エラー */
let signUpStubMode: null | "email_taken" = null;

/**
 * ストアをリセットする（Beforeフックから呼び出す）。
 */
export function reset(): void {
	supabaseAuthStore.clear();
	signUpStubMode = null;
}

/**
 * テスト用ヘルパー: Supabase Auth にユーザーを登録する。
 * RegistrationService.loginWithEmail のテストで認証成功をシミュレートするために使用する。
 *
 * @param id - Supabase Auth の user.id（UUID）
 * @param email - メールアドレス
 * @param password - パスワード
 */
export function _registerSupabaseUser(
	id: string,
	email: string,
	password: string,
): void {
	supabaseAuthStore.set(email, { id, email, password });
}

/**
 * テスト用ヘルパー: signUp で重複エラーをシミュレートする。
 * 「既に使用されているメールアドレスでは本登録できない」シナリオで使用する。
 */
export function _setSignUpMode(mode: null | "email_taken"): void {
	signUpStubMode = mode;
}

// ---------------------------------------------------------------------------
// ダミー Supabase クライアント
// ---------------------------------------------------------------------------

/**
 * ダミー Supabase クライアントオブジェクト。
 * BDD テストで実際の Supabase API を呼び出さないためのスタブ。
 * サービス層がリポジトリ経由で間接的に使用するが、
 * モック機構によりリポジトリ自体が差し替えられるため、
 * このオブジェクトが実際に呼ばれることはない。
 *
 * Phase 3: auth.signUp / auth.signInWithPassword / auth.signInWithOAuth /
 *          auth.exchangeCodeForSession のスタブを追加する。
 */
const dummyClient = {
	from: (_table: string) => ({
		select: () => ({
			eq: () => ({ single: async () => ({ data: null, error: null }) }),
		}),
		insert: () => ({
			select: () => ({ single: async () => ({ data: null, error: null }) }),
		}),
		update: () => ({ eq: async () => ({ error: null }) }),
		delete: () => ({
			lt: () => ({ select: async () => ({ data: [], error: null }) }),
		}),
	}),
	rpc: async (_fn: string, _args: unknown) => ({ data: null, error: null }),
	auth: {
		/** 管理者ログイン検証（既存） */
		getUser: async (_token: string) => ({ data: { user: null }, error: null }),

		/**
		 * メール本登録申請のスタブ。
		 * signUpStubMode = 'email_taken' の場合は重複エラーを返す。
		 * それ以外は成功（確認メール送信済み）を返す。
		 *
		 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
		 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
		 */
		signUp: async (params: {
			email: string;
			password: string;
			options?: unknown;
		}) => {
			if (signUpStubMode === "email_taken") {
				return {
					data: { user: null, session: null },
					error: { message: "User already registered", status: 422 },
				};
			}
			// 成功: 確認メール送信済みを示す（identities空配列で未確認状態）
			const fakeUser = {
				id: crypto.randomUUID(),
				email: params.email,
				identities: [],
			};
			return { data: { user: fakeUser, session: null }, error: null };
		},

		/**
		 * メールアドレス + パスワードでのログインスタブ。
		 * supabaseAuthStore に登録されたユーザーと照合する。
		 *
		 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
		 * See: features/user_registration.feature @誤ったパスワードではログインできない
		 */
		signInWithPassword: async (params: { email: string; password: string }) => {
			const storedUser = supabaseAuthStore.get(params.email);
			if (!storedUser || storedUser.password !== params.password) {
				return {
					data: { user: null, session: null },
					error: { message: "Invalid login credentials", status: 400 },
				};
			}
			return {
				data: {
					user: { id: storedUser.id, email: storedUser.email },
					session: { access_token: "dummy-session-token" },
				},
				error: null,
			};
		},

		/**
		 * Discord OAuth フロー開始のスタブ。
		 * BDDテストでは外部OAuth依存のため pending 扱い。
		 * 呼ばれた場合はダミー URL を返す。
		 *
		 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
		 */
		signInWithOAuth: async (_params: unknown) => ({
			data: {
				url: "https://discord.com/oauth2/authorize?dummy=1",
				provider: "discord",
			},
			error: null,
		}),

		/**
		 * OAuth コールバックのコード交換スタブ。
		 * BDDテストでは外部OAuth依存のため pending 扱い。
		 *
		 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
		 */
		exchangeCodeForSession: async (_code: string) => ({
			data: { user: null, session: null },
			error: {
				message: "Discord OAuth is not supported in BDD tests",
				status: 400,
			},
		}),
	},
};

/** anon キーを使用するクライアント（ダミー） */
export const supabaseClient = dummyClient;

/** service_role キーを使用するサーバーサイド専用クライアント（ダミー） */
export const supabaseAdmin = dummyClient;

/**
 * 認証専用の使い捨てクライアントを生成する（BDDテスト用ダミー）。
 *
 * registration-service.ts の loginWithEmail が createAuthOnlyClient() を呼ぶため、
 * BDDテスト環境でも同一スタブを返す必要がある。
 * signInWithPassword は supabaseAuthStore と照合してシミュレートする。
 *
 * See: src/lib/infrastructure/supabase/client.ts createAuthOnlyClient()
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 */
export function createAuthOnlyClient() {
	return dummyClient;
}
