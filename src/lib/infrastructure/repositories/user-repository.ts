/**
 * UserRepository — ユーザーの永続化・検索を担うリポジトリ
 *
 * See: docs/architecture/architecture.md §3.2 Infrastructure Layer
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: docs/architecture/components/user-registration.md §10.1 依存先 > UserRepository
 *
 * 責務:
 *   - users テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import type { User } from "../../domain/models/user";
import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義: users テーブルの DB 行型
// ---------------------------------------------------------------------------

/** users テーブルの DB レコード（snake_case）*/
interface UserRow {
	id: string;
	auth_token: string;
	author_id_seed: string;
	is_premium: boolean;
	/**
	 * edge-token の認証完了状態。
	 * See: supabase/migrations/00005_auth_verification.sql
	 */
	is_verified: boolean;
	username: string | null;
	streak_days: number;
	last_post_date: string | null;
	created_at: string;
	// ---------------------------------------------------------------------------
	// Phase 3: 本登録・PAT 関連カラム（新設）
	// See: supabase/migrations/00006_user_registration.sql
	// See: docs/architecture/components/user-registration.md §3.1 users テーブル拡張
	// ---------------------------------------------------------------------------
	/** Supabase Auth ユーザーID。仮ユーザーは NULL */
	supabase_auth_id: string | null;
	/** 本登録方法: 'email' | 'discord'。仮ユーザーは NULL */
	registration_type: string | null;
	/** 本登録完了日時。仮ユーザーは NULL */
	registered_at: string | null;
	/** PAT（パーソナルアクセストークン）。本登録完了後に自動発行。仮ユーザーは NULL */
	pat_token: string | null;
	/** PAT 最終使用日時。未使用は NULL */
	pat_last_used_at: string | null;
	// ---------------------------------------------------------------------------
	// Phase 4: 草コマンド(!w) 関連カラム（新設）
	// See: supabase/migrations/00008_grass_system.sql
	// ---------------------------------------------------------------------------
	/** 草カウント(通算)。草付与時に +1 される。デフォルト 0 */
	grass_count: number;
	// ---------------------------------------------------------------------------
	// Phase 5: BAN システム関連カラム（新設）
	// See: supabase/migrations/00010_ban_system.sql
	// See: features/admin.feature @ユーザーBAN / IP BAN
	// ---------------------------------------------------------------------------
	/** ユーザーBAN フラグ。true の場合書き込み不可。デフォルト false */
	is_banned: boolean;
	/** 最終アクセスIPハッシュ。hashIp(reduceIp(ip)) 済みの値。未更新は NULL */
	last_ip_hash: string | null;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 * Supabase レスポンスの日時フィールドは文字列で返るため Date に変換する。
 * last_post_date は DATE 型（日付のみ）のため文字列のまま保持する。
 * Phase 3 追加カラムは NULL 許容のためオプショナル扱いとする。
 */
function rowToUser(row: UserRow): User {
	return {
		id: row.id,
		authToken: row.auth_token,
		authorIdSeed: row.author_id_seed,
		isPremium: row.is_premium,
		isVerified: row.is_verified,
		username: row.username,
		streakDays: row.streak_days,
		lastPostDate: row.last_post_date,
		createdAt: new Date(row.created_at),
		// Phase 3: 本登録・PAT 関連フィールド
		supabaseAuthId: row.supabase_auth_id ?? null,
		registrationType:
			(row.registration_type as "email" | "discord" | null) ?? null,
		registeredAt: row.registered_at ? new Date(row.registered_at) : null,
		patToken: row.pat_token ?? null,
		patLastUsedAt: row.pat_last_used_at ? new Date(row.pat_last_used_at) : null,
		// Phase 4: 草コマンド(!w) 関連フィールド
		// See: supabase/migrations/00008_grass_system.sql
		grassCount: row.grass_count ?? 0,
		// Phase 5: BAN システム関連フィールド
		// See: supabase/migrations/00010_ban_system.sql
		isBanned: row.is_banned ?? false,
		lastIpHash: row.last_ip_hash ?? null,
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * ユーザーを ID で取得する。
 * @param id - ユーザーの UUID
 * @returns 見つかった User、存在しない場合は null
 */
export async function findById(id: string): Promise<User | null> {
	const { data, error } = await supabaseAdmin
		.from("users")
		.select("*")
		.eq("id", id)
		.single();

	if (error) {
		// PGRST116: 行が見つからない場合
		if (error.code === "PGRST116") return null;
		throw new Error(`UserRepository.findById failed: ${error.message}`);
	}

	return data ? rowToUser(data as UserRow) : null;
}

/**
 * ユーザーを auth_token（edge-token）で取得する。
 * 書き込みリクエスト受信時の認証検証に使用する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 *
 * @param authToken - 検索対象の edge-token
 * @returns 見つかった User、存在しない場合は null
 */
export async function findByAuthToken(authToken: string): Promise<User | null> {
	const { data, error } = await supabaseAdmin
		.from("users")
		.select("*")
		.eq("auth_token", authToken)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(`UserRepository.findByAuthToken failed: ${error.message}`);
	}

	return data ? rowToUser(data as UserRow) : null;
}

/**
 * 新しいユーザーを作成する。
 * id / createdAt / streakDays / lastPostDate は DB のデフォルト値を使用する。
 * isVerified は省略時 false（DBデフォルト値と一致）。
 *
 * See: features/authentication.feature @認証フロー是正
 *
 * @param user - 作成するユーザーのデータ（自動設定フィールドを除く）
 * @returns 作成された User（DB デフォルト値を含む）
 */
export async function create(
	user: Omit<
		User,
		| "id"
		| "createdAt"
		| "streakDays"
		| "lastPostDate"
		| "isVerified"
		| "supabaseAuthId"
		| "registrationType"
		| "registeredAt"
		| "patToken"
		| "patLastUsedAt"
		| "grassCount"
		| "isBanned"
		| "lastIpHash"
	> & { isVerified?: boolean },
): Promise<User> {
	const { data, error } = await supabaseAdmin
		.from("users")
		.insert({
			auth_token: user.authToken,
			author_id_seed: user.authorIdSeed,
			is_premium: user.isPremium,
			// isVerified が省略された場合は DB デフォルト（false）を使用する
			...(user.isVerified !== undefined
				? { is_verified: user.isVerified }
				: {}),
			username: user.username,
		})
		.select()
		.single();

	if (error) {
		throw new Error(`UserRepository.create failed: ${error.message}`);
	}

	return rowToUser(data as UserRow);
}

/**
 * ユーザーの auth_token（edge-token）を更新する。
 * トークンのローテーションや認証コード検証完了後の有効化に使用する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 *
 * @param userId - 対象ユーザーの UUID
 * @param authToken - 新しい edge-token
 */
export async function updateAuthToken(
	userId: string,
	authToken: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ auth_token: authToken })
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateAuthToken failed: ${error.message}`);
	}
}

/**
 * ユーザーのストリーク情報（連続書き込み日数・最終書き込み日）を更新する。
 * 書き込み処理の完了後に IncentiveService から呼び出される。
 *
 * See: docs/requirements/ubiquitous_language.yaml #ストリーク
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users > streak_days
 *
 * @param userId - 対象ユーザーの UUID
 * @param streakDays - 新しい連続書き込み日数
 * @param lastPostDate - 最終書き込み日（YYYY-MM-DD 形式）
 */
export async function updateStreak(
	userId: string,
	streakDays: number,
	lastPostDate: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({
			streak_days: streakDays,
			last_post_date: lastPostDate,
		})
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateStreak failed: ${error.message}`);
	}
}

/**
 * ユーザーのユーザーネームを更新する。
 * 有料ユーザーのみ設定可能（バリデーションはサービス層で実施）。
 *
 * See: docs/requirements/ubiquitous_language.yaml #ユーザーネーム
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users > username
 *
 * @param userId - 対象ユーザーの UUID
 * @param username - 新しいユーザーネーム（null でクリア）
 */
export async function updateUsername(
	userId: string,
	username: string | null,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ username })
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateUsername failed: ${error.message}`);
	}
}

/**
 * ユーザーの有料ステータス（isPremium）を更新する。
 * 課金モック実装（MypageService.upgradeToPremium）から呼び出される。
 *
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users > is_premium
 *
 * @param userId - 対象ユーザーの UUID
 * @param isPremium - 新しい有料ステータス
 */
export async function updateIsPremium(
	userId: string,
	isPremium: boolean,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ is_premium: isPremium })
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateIsPremium failed: ${error.message}`);
	}
}

/**
 * ユーザーの認証完了状態（isVerified）を更新する。
 * AuthService.verifyAuthCode が認証コードとTurnstileの検証に成功した後に呼び出される。
 * is_verified = true への更新により、書き込み時の認証チェック（G1 是正）が機能する。
 *
 * See: features/authentication.feature @認証フロー是正
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
 *
 * @param userId - 対象ユーザーの UUID
 * @param isVerified - 新しい認証完了状態（通常は true を渡す）
 */
export async function updateIsVerified(
	userId: string,
	isVerified: boolean,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ is_verified: isVerified })
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateIsVerified failed: ${error.message}`);
	}
}

// ---------------------------------------------------------------------------
// Phase 3: 本登録・PAT 関連メソッド（新設）
// See: features/未実装/user_registration.feature
// See: docs/architecture/components/user-registration.md §10.1 依存先 > UserRepository
// ---------------------------------------------------------------------------

/**
 * ユーザーを Supabase Auth ID で取得する。
 * ログイン時に Supabase Auth 認証成功後、users レコードを特定するために使用する。
 *
 * See: docs/architecture/components/user-registration.md §5.2 ログイン
 *
 * @param supabaseAuthId - Supabase Auth の user.id（UUID）
 * @returns 見つかった User、存在しない場合は null
 */
export async function findBySupabaseAuthId(
	supabaseAuthId: string,
): Promise<User | null> {
	const { data, error } = await supabaseAdmin
		.from("users")
		.select("*")
		.eq("supabase_auth_id", supabaseAuthId)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(
			`UserRepository.findBySupabaseAuthId failed: ${error.message}`,
		);
	}

	return data ? rowToUser(data as UserRow) : null;
}

/**
 * ユーザーの Supabase Auth ID・本登録種別・本登録日時を更新する。
 * 本登録完了コールバック（completeRegistration）から呼び出される。
 *
 * See: docs/architecture/components/user-registration.md §5.1 本登録 > completeRegistration
 *
 * @param userId - 対象ユーザーの UUID
 * @param supabaseAuthId - Supabase Auth の user.id
 * @param registrationType - 本登録方法: 'email' | 'discord'
 */
export async function updateSupabaseAuthId(
	userId: string,
	supabaseAuthId: string,
	registrationType: "email" | "discord",
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({
			supabase_auth_id: supabaseAuthId,
			registration_type: registrationType,
			registered_at: new Date(Date.now()).toISOString(),
		})
		.eq("id", userId);

	if (error) {
		throw new Error(
			`UserRepository.updateSupabaseAuthId failed: ${error.message}`,
		);
	}
}

/**
 * ユーザーの PAT（パーソナルアクセストークン）を更新する。
 * 本登録完了時の自動発行（completeRegistration）と再発行（regeneratePat）から呼び出される。
 * 旧 PAT は UNIQUE 制約により即時無効化される。
 *
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > regeneratePat
 * See: features/未実装/user_registration.feature @本登録完了時にPATが自動発行される
 *
 * @param userId - 対象ユーザーの UUID
 * @param patToken - 新しい PAT（32文字の hex 文字列）
 */
export async function updatePatToken(
	userId: string,
	patToken: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({
			pat_token: patToken,
			pat_last_used_at: null,
		})
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updatePatToken failed: ${error.message}`);
	}
}

// ---------------------------------------------------------------------------
// Phase 5: BAN システム関連メソッド（新設）
// See: features/admin.feature @ユーザーBAN / IP BAN
// See: supabase/migrations/00010_ban_system.sql
// ---------------------------------------------------------------------------

/**
 * ユーザーの BAN 状態（isBanned）を更新する。
 * AdminService.banUser / unbanUser から呼び出される。
 *
 * See: features/admin.feature @管理者がユーザーをBANする
 * See: features/admin.feature @管理者がユーザーBANを解除する
 *
 * @param userId - 対象ユーザーの UUID
 * @param isBanned - 新しい BAN 状態（true = BAN、false = 解除）
 */
export async function updateIsBanned(
	userId: string,
	isBanned: boolean,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ is_banned: isBanned })
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateIsBanned failed: ${error.message}`);
	}
}

/**
 * ユーザーの最終アクセスIPハッシュ（lastIpHash）を更新する。
 * 書き込みリクエスト完了後に PostService / PostHandler から呼び出される。
 * 管理者が「このIPをBAN」する際の最新IP特定に使用する。
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 * See: tmp/feature_plan_admin_expansion.md §2-c BANチェックフロー ④ last_ip_hash更新
 *
 * @param userId - 対象ユーザーの UUID
 * @param lastIpHash - hashIp(reduceIp(ip)) 済みの値
 */
export async function updateLastIpHash(
	userId: string,
	lastIpHash: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ last_ip_hash: lastIpHash })
		.eq("id", userId);

	if (error) {
		throw new Error(`UserRepository.updateLastIpHash failed: ${error.message}`);
	}
}

// ---------------------------------------------------------------------------
// ユーザー管理（管理者向け）
// See: features/admin.feature @ユーザー管理シナリオ群
// See: tmp/feature_plan_admin_expansion.md §4-a Infrastructure: UserRepository 拡張
// ---------------------------------------------------------------------------

/**
 * ユーザー一覧を取得する（ページネーション付き）。
 * 管理画面のユーザー一覧ページで使用する。
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 * See: tmp/feature_plan_admin_expansion.md §4-a UserRepository.findAll
 *
 * @param options.limit - 取得件数（デフォルト 50）
 * @param options.offset - スキップ件数（デフォルト 0）
 * @param options.orderBy - ソート対象（デフォルト 'created_at'）
 * @returns ユーザー配列と総件数
 */
export async function findAll(
	options: {
		limit?: number;
		offset?: number;
		orderBy?: "created_at" | "last_post_date";
	} = {},
): Promise<{ users: User[]; total: number }> {
	const limit = options.limit ?? 50;
	const offset = options.offset ?? 0;
	const orderBy = options.orderBy ?? "created_at";

	// 総件数取得
	const { count, error: countError } = await supabaseAdmin
		.from("users")
		.select("*", { count: "exact", head: true });

	if (countError) {
		throw new Error(
			`UserRepository.findAll (count) failed: ${countError.message}`,
		);
	}

	// データ取得
	const { data, error } = await supabaseAdmin
		.from("users")
		.select("*")
		.order(orderBy, { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		throw new Error(`UserRepository.findAll failed: ${error.message}`);
	}

	return {
		users: (data as UserRow[]).map(rowToUser),
		total: count ?? 0,
	};
}

/**
 * PAT（パーソナルアクセストークン）でユーザーを取得する。
 * 専ブラの mail 欄に #pat_<token> が含まれる場合の認証処理に使用する。
 *
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > verifyPat
 * See: features/未実装/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 *
 * @param patToken - 照合対象の PAT
 * @returns 見つかった User、存在しない場合は null
 */
export async function findByPatToken(patToken: string): Promise<User | null> {
	const { data, error } = await supabaseAdmin
		.from("users")
		.select("*")
		.eq("pat_token", patToken)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(`UserRepository.findByPatToken failed: ${error.message}`);
	}

	return data ? rowToUser(data as UserRow) : null;
}

/**
 * ユーザーの PAT 最終使用日時を現在時刻に更新する。
 * PAT 認証に成功した直後に呼び出される。
 *
 * See: docs/architecture/components/user-registration.md §5.4 PAT管理 > verifyPat
 *
 * @param userId - 対象ユーザーの UUID
 */
export async function updatePatLastUsedAt(userId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("users")
		.update({ pat_last_used_at: new Date(Date.now()).toISOString() })
		.eq("id", userId);

	if (error) {
		throw new Error(
			`UserRepository.updatePatLastUsedAt failed: ${error.message}`,
		);
	}
}
