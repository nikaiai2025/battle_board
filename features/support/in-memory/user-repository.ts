/**
 * インメモリ UserRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * user-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/authentication.feature
 * See: features/posting.feature
 * See: features/user_registration.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { User } from "../../../src/lib/domain/models/user";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるユーザーストア */
const store = new Map<string, User>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: ユーザーを直接ストアに追加する。
 * ステップ定義から初期データを投入するために使用する。
 */
export function _insert(user: User): void {
	store.set(user.id, user);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ユーザーを ID で取得する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function findById(id: string): Promise<User | null> {
	assertUUID(id, "UserRepository.findById.id");
	return store.get(id) ?? null;
}

/**
 * ユーザーを auth_token（edge-token）で取得する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function findByAuthToken(authToken: string): Promise<User | null> {
	for (const user of store.values()) {
		if (user.authToken === authToken) return user;
	}
	return null;
}

/**
 * 新しいユーザーを作成する。
 * id・createdAt・streakDays・lastPostDate は自動設定する。
 * isVerified は省略時 false（本番 DB デフォルト値と一致）。
 * Phase 3 フィールド（supabaseAuthId, registrationType, registeredAt, patToken, patLastUsedAt）は
 * 省略時 null（仮ユーザー状態）。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts
 * See: features/user_registration.feature
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
		| "themeId"
		| "fontId"
	> & {
		isVerified?: boolean;
		supabaseAuthId?: string | null;
		registrationType?: "email" | "discord" | null;
		registeredAt?: Date | null;
		patToken?: string | null;
		patLastUsedAt?: Date | null;
		/** 草カウント(通算)。省略時は 0。See: features/reactions.feature */
		grassCount?: number;
		/** BAN フラグ。省略時は false。See: features/admin.feature */
		isBanned?: boolean;
		/** 最終アクセスIPハッシュ。省略時は null。See: features/admin.feature */
		lastIpHash?: string | null;
		/** テーマID。省略時は null。See: features/theme.feature */
		themeId?: string | null;
		/** フォントID。省略時は null。See: features/theme.feature */
		fontId?: string | null;
	},
): Promise<User> {
	const newUser: User = {
		...user,
		isVerified: user.isVerified ?? false,
		id: crypto.randomUUID(),
		streakDays: 0,
		lastPostDate: null,
		createdAt: new Date(Date.now()),
		// Phase 3 フィールド: 省略時は NULL（仮ユーザー）
		// See: features/user_registration.feature
		supabaseAuthId: user.supabaseAuthId ?? null,
		registrationType: user.registrationType ?? null,
		registeredAt: user.registeredAt ?? null,
		patToken: user.patToken ?? null,
		patLastUsedAt: user.patLastUsedAt ?? null,
		// Phase 4 フィールド: 草カウント。省略時は 0（新規ユーザーは草ゼロ）
		// See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
		grassCount: user.grassCount ?? 0,
		// Phase 5 フィールド: BAN システム。省略時はデフォルト値
		// See: features/admin.feature @ユーザーBAN / IP BAN
		isBanned: user.isBanned ?? false,
		lastIpHash: user.lastIpHash ?? null,
		// テーマ設定フィールド。省略時は null（デフォルトテーマ適用）
		// See: features/theme.feature
		themeId: user.themeId ?? null,
		fontId: user.fontId ?? null,
	};
	store.set(newUser.id, newUser);
	return newUser;
}

/**
 * ユーザーの auth_token を更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function updateAuthToken(
	userId: string,
	authToken: string,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateAuthToken.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, authToken });
	}
}

/**
 * ユーザーのストリーク情報を更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function updateStreak(
	userId: string,
	streakDays: number,
	lastPostDate: string,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateStreak.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, streakDays, lastPostDate });
	}
}

/**
 * ユーザーのユーザーネームを更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 */
export async function updateUsername(
	userId: string,
	username: string | null,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateUsername.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, username });
	}
}

/**
 * ユーザーの有料ステータス（isPremium）を更新する。
 * See: src/lib/infrastructure/repositories/user-repository.ts
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 */
export async function updateIsPremium(
	userId: string,
	isPremium: boolean,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateIsPremium.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, isPremium });
	}
}

/**
 * ユーザーの認証完了状態（isVerified）を更新する。
 * AuthService.verifyAuthCode / verifyWriteToken が認証成功後に呼び出す。
 * is_verified = true への更新により、書き込み時の認証チェック（G1 是正）が機能する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateIsVerified
 * See: features/authentication.feature @認証フロー是正
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
 */
export async function updateIsVerified(
	userId: string,
	isVerified: boolean,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateIsVerified.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, isVerified });
	}
}

/**
 * ユーザーの本登録種別（registrationType）を更新する。
 * BDDテストで仮ユーザーを本登録済み状態に変更するために使用する。
 *
 * See: features/user_registration.feature @仮ユーザーは課金できない
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 */
export async function updateRegistrationType(
	userId: string,
	registrationType: "email" | "discord" | null,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateRegistrationType.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, {
			...user,
			registrationType,
			registeredAt:
				registrationType !== null
					? (user.registeredAt ?? new Date(Date.now()))
					: null,
		});
	}
}

// ---------------------------------------------------------------------------
// Phase 3: 本登録・PAT 関連メソッド（新設）
// See: features/user_registration.feature
// See: docs/architecture/components/user-registration.md §10.1 依存先 > UserRepository
// ---------------------------------------------------------------------------

/**
 * ユーザーを Supabase Auth ID で取得する。
 * ログイン時に Supabase Auth 認証後、users レコードを特定するために使用する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > findBySupabaseAuthId
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 */
export async function findBySupabaseAuthId(
	supabaseAuthId: string,
): Promise<User | null> {
	for (const user of store.values()) {
		if (user.supabaseAuthId === supabaseAuthId) return user;
	}
	return null;
}

/**
 * ユーザーの Supabase Auth ID・本登録種別・本登録日時を更新する。
 *
 * @deprecated completeRegistration() からは completeRegistrationUpdate() を使用する。
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateSupabaseAuthId
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 */
export async function updateSupabaseAuthId(
	userId: string,
	supabaseAuthId: string,
	registrationType: "email" | "discord",
): Promise<void> {
	assertUUID(userId, "UserRepository.updateSupabaseAuthId.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, {
			...user,
			supabaseAuthId,
			registrationType,
			registeredAt: new Date(Date.now()),
		});
	}
}

/**
 * 本登録完了に必要な全フィールドを単一操作で原子的に書き込む。
 * completeRegistration() から呼び出される統合メソッド。
 * 本番実装（user-repository.ts）の completeRegistrationUpdate と対称実装。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > completeRegistrationUpdate
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 */
export async function completeRegistrationUpdate(
	userId: string,
	supabaseAuthId: string,
	registrationType: "email" | "discord",
	patToken: string,
): Promise<void> {
	assertUUID(userId, "UserRepository.completeRegistrationUpdate.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, {
			...user,
			supabaseAuthId,
			registrationType,
			registeredAt: new Date(Date.now()),
			patToken,
			patLastUsedAt: null,
		});
	}
}

/**
 * ユーザーの PAT（パーソナルアクセストークン）を更新する。
 * 本登録完了時の自動発行（completeRegistration）と再発行（regeneratePat）から呼び出される。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updatePatToken
 * See: features/user_registration.feature @本登録完了時にPATが自動発行される
 */
export async function updatePatToken(
	userId: string,
	patToken: string,
): Promise<void> {
	assertUUID(userId, "UserRepository.updatePatToken.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, patToken, patLastUsedAt: null });
	}
}

/**
 * PAT（パーソナルアクセストークン）でユーザーを取得する。
 * 専ブラの mail 欄に #pat_<token> が含まれる場合の認証処理に使用する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > findByPatToken
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 */
export async function findByPatToken(patToken: string): Promise<User | null> {
	for (const user of store.values()) {
		if (user.patToken === patToken) return user;
	}
	return null;
}

/**
 * ユーザーの PAT 最終使用日時を現在時刻に更新する。
 * PAT 認証に成功した直後に呼び出される。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updatePatLastUsedAt
 * See: features/user_registration.feature @マイページでPATを確認できる
 */
export async function updatePatLastUsedAt(userId: string): Promise<void> {
	assertUUID(userId, "UserRepository.updatePatLastUsedAt.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, patLastUsedAt: new Date(Date.now()) });
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
 * See: src/lib/infrastructure/repositories/user-repository.ts > findAll
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
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

	const allUsers = Array.from(store.values()).sort((a, b) => {
		if (orderBy === "last_post_date") {
			const aDate = a.lastPostDate ?? "";
			const bDate = b.lastPostDate ?? "";
			return bDate.localeCompare(aDate);
		}
		// created_at DESC
		return b.createdAt.getTime() - a.createdAt.getTime();
	});

	return {
		users: allUsers.slice(offset, offset + limit),
		total: allUsers.length,
	};
}

// ---------------------------------------------------------------------------
// Phase 5: BAN システム関連メソッド（新設）
// See: features/admin.feature @ユーザーBAN / IP BAN
// See: src/lib/infrastructure/repositories/user-repository.ts > updateIsBanned
// ---------------------------------------------------------------------------

/**
 * ユーザーの BAN 状態（isBanned）を更新する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateIsBanned
 * See: features/admin.feature @管理者がユーザーをBANする
 */
export async function updateIsBanned(
	userId: string,
	isBanned: boolean,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateIsBanned.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, isBanned });
	}
}

/**
 * ユーザーの最終アクセスIPハッシュ（lastIpHash）を更新する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateLastIpHash
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 */
export async function updateLastIpHash(
	userId: string,
	lastIpHash: string,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateLastIpHash.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, lastIpHash });
	}
}

// ---------------------------------------------------------------------------
// Phase 4: 草カウント関連メソッド（新設）
// See: features/reactions.feature
// See: features/mypage.feature @草カウントとアイコンを確認できる
// ---------------------------------------------------------------------------

/**
 * ユーザーの草カウントを直接設定する（BDDテスト用）。
 * GrassHandler ではなく、テスト前の状態セットアップに使用する。
 *
 * See: features/mypage.feature @ユーザーの草カウントが {int} である
 */
export async function updateGrassCount(
	userId: string,
	grassCount: number,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateGrassCount.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, grassCount });
	}
}

// ---------------------------------------------------------------------------
// テーマ設定メソッド（新設）
// See: features/theme.feature @テーマ設定が保存される
// See: src/lib/infrastructure/repositories/user-repository.ts > updateTheme
// ---------------------------------------------------------------------------

/**
 * ユーザーのテーマ・フォント設定を更新する。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateTheme
 * See: features/theme.feature @テーマ設定が保存される
 */
export async function updateTheme(
	userId: string,
	themeId: string,
	fontId: string,
): Promise<void> {
	assertUUID(userId, "UserRepository.updateTheme.userId");
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, themeId, fontId });
	}
}
