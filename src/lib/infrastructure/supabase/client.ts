/**
 * Supabase クライアント初期化モジュール
 *
 * サーバーサイド用（service_role キー）とクライアントサイド用（anon キー）の
 * 2種類のクライアントを提供する。
 *
 * 環境変数:
 *   SUPABASE_URL              - Supabase プロジェクト URL
 *   SUPABASE_ANON_KEY         - anon（公開）キー（Row Level Security が適用される）
 *   SUPABASE_SERVICE_ROLE_KEY - service_role キー（RLS をバイパスするサーバー専用）
 *
 * セキュリティ制約:
 *   SUPABASE_SERVICE_ROLE_KEY はサーバーサイドコードでのみ使用すること。
 *   クライアントサイドバンドルに含めることを禁止する。
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * anon キーを使用するクライアント。
 * Row Level Security が適用されるため、一般ユーザー向けの読み書きに使用する。
 */
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * service_role キーを使用するサーバーサイド専用クライアント。
 * RLS をバイパスするため、サーバーサイド処理（API ルート・バッチ）でのみ使用する。
 * クライアントサイドコードからインポートしてはならない。
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * 認証専用の使い捨てクライアントを生成する。
 *
 * signInWithPassword はクライアントのセッション状態を変更するため、
 * シングルトン supabaseAdmin で呼ぶとセッション汚染が発生する。
 * この関数は anon key + persistSession: false で使い捨てクライアントを返す。
 *
 * See: admin-user-repository.ts createAuthClient()（同一パターン）
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 */
export function createAuthOnlyClient() {
	return createClient(supabaseUrl, supabaseAnonKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

/**
 * Discord OAuth PKCE フロー用のクライアントを生成する。
 *
 * サーバーサイドでPKCEを正しく機能させるため、カスタムストレージを使用する。
 * code_verifier はサーバー側のメモリに保持し、呼び出し元がCookieで永続化する。
 *
 * 使い方:
 *   1. OAuth開始時: createPkceOAuthClient() → signInWithOAuth → getStorage() でverifier取得 → Cookieに保存
 *   2. コールバック時: createPkceOAuthClient(cookieから読んだStorage) → exchangeCodeForSession(code)
 *
 * See: src/app/api/auth/login/discord/route.ts
 * See: src/app/api/auth/callback/route.ts
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 */
export function createPkceOAuthClient(
	preloadedStorage: Record<string, string> = {},
) {
	const storage: Record<string, string> = { ...preloadedStorage };

	const client = createClient(supabaseUrl, supabaseAnonKey, {
		auth: {
			flowType: "pkce",
			persistSession: false,
			autoRefreshToken: false,
			storage: {
				getItem: (key: string) => storage[key] ?? null,
				setItem: (key: string, value: string) => {
					storage[key] = value;
				},
				removeItem: (key: string) => {
					delete storage[key];
				},
			},
		},
	});

	return {
		client,
		/** フロー開始後にstorageのスナップショットを取得する（Cookieに保存するため） */
		getStorage: () => ({ ...storage }),
	};
}
