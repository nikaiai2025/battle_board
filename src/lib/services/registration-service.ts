/**
 * RegistrationService — 本登録ビジネスロジック統括サービス
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md §5 公開インターフェース
 * See: docs/specs/user_registration_state_transitions.yaml #registration_transitions
 *
 * 責務:
 *   - 仮ユーザーがメール/Discordで本登録を行うロジック
 *   - 本登録完了時のsupabase_auth_id紐付け、PAT自動発行
 *   - PAT管理（検証・再発行）
 *   - ログイン・ログアウト処理（edge-token発行・削除）
 *
 * 設計上の判断:
 *   - このServiceはCookieを直接操作しない（Route Handlerが担当）
 *   - Supabase Auth SDKはsupabaseAdminを通じて呼び出す
 *   - PAT は 32文字 hex（crypto.randomBytes(16).toString('hex')）
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";
import * as EdgeTokenRepository from "../infrastructure/repositories/edge-token-repository";
import * as UserRepository from "../infrastructure/repositories/user-repository";
import { supabaseAdmin } from "../infrastructure/supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 本登録（メール）の結果型。
 * See: docs/architecture/components/user-registration.md §5.1 本登録
 */
export type RegisterResult =
	| { success: true }
	| {
			success: false;
			reason: "already_registered" | "email_taken" | "not_found";
	  };

/**
 * ログイン結果型。
 * See: docs/architecture/components/user-registration.md §5.2 ログイン
 */
export type LoginResult =
	| { success: true; userId: string; edgeToken: string }
	| { success: false; reason: "invalid_credentials" | "not_registered" };

/**
 * PAT 検証結果型。
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > verifyPat
 */
export type VerifyPatResult =
	| { valid: true; userId: string }
	| { valid: false };

// ---------------------------------------------------------------------------
// 本登録
// ---------------------------------------------------------------------------

/**
 * メールアドレスとパスワードで本登録を申請する。
 * Supabase Auth signUp() を呼び出し、確認メールを送信する。
 *
 * 処理手順:
 *   1. userId で仮ユーザーの users レコードを取得（存在確認）
 *   2. supabase_auth_id が既に設定されている場合は already_registered を返す
 *   3. Supabase Auth signUp() で確認メール送信
 *   4. メール確認完了は /api/auth/callback コールバックで completeRegistration() が呼ばれる
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
 * See: docs/architecture/components/user-registration.md §7.1 メール認証
 *
 * @param userId - 現在の仮ユーザーの user_id
 * @param email - 登録するメールアドレス
 * @param password - パスワード
 * @param redirectTo - メール確認後のリダイレクト先URL（呼び出し元が構築する。省略不可）
 * @returns RegisterResult
 */
export async function registerWithEmail(
	userId: string,
	email: string,
	password: string,
	redirectTo: string,
): Promise<RegisterResult> {
	// Step 1: 仮ユーザーの存在確認
	const user = await UserRepository.findById(userId);
	if (!user) {
		return { success: false, reason: "not_found" };
	}

	// Step 2: 既に本登録済みの場合は already_registered を返す
	if (user.supabaseAuthId !== null) {
		return { success: false, reason: "already_registered" };
	}

	// Step 3: Supabase Auth signUp() で確認メール送信
	const { error } = await supabaseAdmin.auth.signUp({
		email,
		password,
		options: {
			emailRedirectTo: redirectTo,
		},
	});

	if (error) {
		// メールアドレスが既に使用されている場合
		// Supabase Auth のエラーコード: "User already registered" / email conflict
		if (
			error.message.includes("already registered") ||
			error.message.includes("already been registered") ||
			error.status === 422
		) {
			return { success: false, reason: "email_taken" };
		}
		throw new Error(
			`RegistrationService.registerWithEmail failed: ${error.message}`,
		);
	}

	return { success: true };
}

/**
 * Discord アカウントで本登録するための OAuth URL を返す。
 * Supabase Auth signInWithOAuth({ provider: 'discord' }) の認可 URL を返す。
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 * See: docs/architecture/components/user-registration.md §7.2 Discord連携
 *
 * @param redirectTo - Discord認可後のコールバックURL
 * @returns redirectUrl: Discord認可画面のURL
 */
export async function registerWithDiscord(
	redirectTo: string,
): Promise<{ redirectUrl: string }> {
	const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
		provider: "discord",
		options: {
			redirectTo,
			scopes: "identify",
		},
	});

	if (error || !data.url) {
		throw new Error(
			`RegistrationService.registerWithDiscord failed: ${error?.message ?? "URL not returned"}`,
		);
	}

	return { redirectUrl: data.url };
}

/**
 * 本登録完了処理。
 * OAuth コールバックまたはメール確認完了時に呼び出される内部関数。
 *
 * 処理:
 *   - users.supabase_auth_id を設定
 *   - users.registration_type を設定
 *   - users.registered_at を設定
 *   - PAT を自動生成して users.pat_token に保存
 *
 * See: docs/architecture/components/user-registration.md §5.1 本登録 > completeRegistration
 * See: docs/specs/user_registration_state_transitions.yaml #registration_transitions
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 *
 * @param userId - 仮ユーザーの users.id
 * @param supabaseAuthId - Supabase Auth の user.id
 * @param registrationType - 本登録方法: 'email' | 'discord'
 */
export async function completeRegistration(
	userId: string,
	supabaseAuthId: string,
	registrationType: "email" | "discord",
): Promise<void> {
	// supabase_auth_id, registration_type, registered_at を更新
	await UserRepository.updateSupabaseAuthId(
		userId,
		supabaseAuthId,
		registrationType,
	);

	// PAT 自動生成（32文字 hex）
	// See: docs/architecture/components/user-registration.md §8.1 自動発行
	const patToken = randomBytes(16).toString("hex");
	await UserRepository.updatePatToken(userId, patToken);
}

// ---------------------------------------------------------------------------
// ログイン
// ---------------------------------------------------------------------------

/**
 * メールアドレスとパスワードでログインする。
 *
 * 処理手順:
 *   1. Supabase Auth signInWithPassword() で認証
 *   2. supabase_auth_id で users レコードを検索
 *   3. 新しい edge-token を生成し edge_tokens に INSERT
 *   4. edge-token を返却（呼び出し元が Cookie に設定）
 *
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 * See: docs/architecture/components/user-registration.md §5.2 ログイン
 * See: docs/specs/user_registration_state_transitions.yaml #login_transitions
 *
 * @param email - メールアドレス
 * @param password - パスワード
 * @returns LoginResult
 */
export async function loginWithEmail(
	email: string,
	password: string,
): Promise<LoginResult> {
	// Step 1: Supabase Auth 認証
	// 注意: signInWithPassword はクライアントのセッション状態を変更するため、
	// supabaseAdmin を使うと以降のDB操作がユーザーJWTで実行され RLS 違反となる。
	// 使い捨てクライアントで認証し、DB操作は supabaseAdmin で行う。
	const authClient = createClient(
		process.env.SUPABASE_URL ?? "",
		process.env.SUPABASE_ANON_KEY ?? "",
		{ auth: { persistSession: false, autoRefreshToken: false } },
	);
	const { data: authData, error: authError } =
		await authClient.auth.signInWithPassword({
			email,
			password,
		});

	if (authError || !authData.user) {
		return { success: false, reason: "invalid_credentials" };
	}

	// Step 2: supabase_auth_id で users レコードを検索
	const user = await UserRepository.findBySupabaseAuthId(authData.user.id);
	if (!user) {
		// Supabase Auth には存在するが users テーブルに未登録（異常状態）
		return { success: false, reason: "not_registered" };
	}

	// Step 3: 新しい edge-token を生成し edge_tokens に INSERT
	const newEdgeToken = randomUUID();
	await EdgeTokenRepository.create(user.id, newEdgeToken);

	return { success: true, userId: user.id, edgeToken: newEdgeToken };
}

/**
 * Discord アカウントでのログイン開始。Discord OAuth フロー開始 URL を返す。
 *
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 * See: docs/architecture/components/user-registration.md §5.2 ログイン > loginWithDiscord
 *
 * @param redirectTo - Discord認可後のコールバックURL
 * @returns redirectUrl: Discord認可画面のURL
 */
export async function loginWithDiscord(
	redirectTo: string,
): Promise<{ redirectUrl: string }> {
	const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
		provider: "discord",
		options: {
			redirectTo,
			scopes: "identify",
		},
	});

	if (error || !data.url) {
		throw new Error(
			`RegistrationService.loginWithDiscord failed: ${error?.message ?? "URL not returned"}`,
		);
	}

	return { redirectUrl: data.url };
}

/**
 * OAuth コールバックを処理し、ログインを完了する。
 * Supabase Auth exchangeCodeForSession() でセッション取得後、ログイン処理を行う。
 *
 * 処理手順:
 *   1. Supabase Auth exchangeCodeForSession() でセッション取得
 *   2. supabase_auth_id で users レコードを検索
 *   3. 見つかった場合: 新 edge-token を発行してログイン完了（ログインフロー）
 *   4. 見つからない場合: completeRegistration() で本登録完了（本登録フロー）
 *
 * See: docs/architecture/components/user-registration.md §5.2 ログイン > handleOAuthCallback
 *
 * @param code - Supabase Auth コールバックの code パラメータ
 * @param pendingUserId - 本登録フローの場合、紐付け先の仮ユーザーID（ログインフローの場合は不要）
 * @param registrationType - 本登録方法: 'email' | 'discord'（本登録フローの場合に使用）
 * @returns LoginResult（ログイン成功時は userId と edgeToken を含む）
 */
export async function handleOAuthCallback(
	code: string,
	pendingUserId?: string,
	registrationType: "email" | "discord" = "discord",
): Promise<LoginResult> {
	// Step 1: コードをセッションに交換
	const { data: sessionData, error: sessionError } =
		await supabaseAdmin.auth.exchangeCodeForSession(code);

	if (sessionError || !sessionData.user) {
		return { success: false, reason: "invalid_credentials" };
	}

	const supabaseAuthId = sessionData.user.id;

	// Step 2: supabase_auth_id で users レコードを検索
	let user = await UserRepository.findBySupabaseAuthId(supabaseAuthId);

	if (!user) {
		// 本登録フロー: 仮ユーザーを本登録ユーザーに昇格
		if (!pendingUserId) {
			return { success: false, reason: "not_registered" };
		}
		await completeRegistration(pendingUserId, supabaseAuthId, registrationType);
		user = await UserRepository.findById(pendingUserId);
		if (!user) {
			return { success: false, reason: "not_registered" };
		}
	}

	// Step 3: 新しい edge-token を発行
	const newEdgeToken = randomUUID();
	await EdgeTokenRepository.create(user.id, newEdgeToken);

	return { success: true, userId: user.id, edgeToken: newEdgeToken };
}

// ---------------------------------------------------------------------------
// ログアウト
// ---------------------------------------------------------------------------

/**
 * ログアウト処理。当該デバイスの edge-token を削除する。
 * 他デバイスの edge-token は影響を受けない。
 *
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 * See: docs/architecture/components/user-registration.md §5.3 ログアウト
 * See: docs/specs/user_registration_state_transitions.yaml #login_transitions
 *
 * @param edgeToken - 削除対象の edge-token 文字列
 */
export async function logout(edgeToken: string): Promise<void> {
	// edge_tokens テーブルから該当トークンの行を DELETE
	await EdgeTokenRepository.deleteByToken(edgeToken);
}

// ---------------------------------------------------------------------------
// PAT 管理
// ---------------------------------------------------------------------------

/**
 * PAT を検証し、有効な場合はユーザーIDを返す。
 * 専ブラの mail 欄 #pat_<token> パターンからのコールで使用する。
 *
 * 処理:
 *   1. users テーブルで pat_token = :patToken を検索
 *   2. 見つかれば pat_last_used_at を更新して返却
 *   3. 見つからなければ { valid: false }
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > verifyPat
 *
 * @param patToken - 照合対象の PAT（32文字 hex）
 * @returns VerifyPatResult
 */
export async function verifyPat(patToken: string): Promise<VerifyPatResult> {
	const user = await UserRepository.findByPatToken(patToken);

	if (!user) {
		return { valid: false };
	}

	// pat_last_used_at を更新
	await UserRepository.updatePatLastUsedAt(user.id);

	return { valid: true, userId: user.id };
}

/**
 * PAT を再発行する。
 * 新しい PAT を生成して users.pat_token を上書きする。
 * 旧 PAT は UNIQUE 制約により即時無効化される。
 *
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > regeneratePat
 * See: docs/specs/user_registration_state_transitions.yaml #pat_transitions
 *
 * @param userId - 対象ユーザーの UUID
 * @returns 新しい PAT 文字列
 */
export async function regeneratePat(
	userId: string,
): Promise<{ patToken: string }> {
	const patToken = randomBytes(16).toString("hex");
	await UserRepository.updatePatToken(userId, patToken);
	return { patToken };
}

/**
 * PAT 認証後に新しい edge-token を発行してログインさせる。
 * 専ブラ PAT 認証フロー（bbs.cgi の mail 欄）で使用する。
 *
 * 処理:
 *   1. verifyPat() で PAT を検証
 *   2. 有効な場合は新しい edge-token を生成し edge_tokens に INSERT
 *   3. edge-token を返却（呼び出し元が Cookie に設定）
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 * See: docs/architecture/components/user-registration.md §6 認証判定フロー
 *
 * @param patToken - 照合対象の PAT
 * @returns 検証成功時 { valid: true, userId, edgeToken }、失敗時 { valid: false }
 */
export async function loginWithPat(
	patToken: string,
): Promise<
	{ valid: true; userId: string; edgeToken: string } | { valid: false }
> {
	const result = await verifyPat(patToken);

	if (!result.valid) {
		return { valid: false };
	}

	// 新しい edge-token を発行
	const newEdgeToken = randomUUID();
	await EdgeTokenRepository.create(result.userId, newEdgeToken);

	return { valid: true, userId: result.userId, edgeToken: newEdgeToken };
}
