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
	> & {
		isVerified?: boolean;
		supabaseAuthId?: string | null;
		registrationType?: "email" | "discord" | null;
		registeredAt?: Date | null;
		patToken?: string | null;
		patLastUsedAt?: Date | null;
	},
): Promise<User> {
	const newUser: User = {
		...user,
		isVerified: user.isVerified ?? false,
		id: crypto.randomUUID(),
		streakDays: 0,
		lastPostDate: null,
		createdAt: new Date(),
		// Phase 3 フィールド: 省略時は NULL（仮ユーザー）
		// See: features/user_registration.feature
		supabaseAuthId: user.supabaseAuthId ?? null,
		registrationType: user.registrationType ?? null,
		registeredAt: user.registeredAt ?? null,
		patToken: user.patToken ?? null,
		patLastUsedAt: user.patLastUsedAt ?? null,
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
	const user = store.get(userId);
	if (user) {
		store.set(userId, {
			...user,
			registrationType,
			registeredAt:
				registrationType !== null ? (user.registeredAt ?? new Date()) : null,
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
 * 本登録完了コールバック（completeRegistration）から呼び出される。
 *
 * See: src/lib/infrastructure/repositories/user-repository.ts > updateSupabaseAuthId
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 */
export async function updateSupabaseAuthId(
	userId: string,
	supabaseAuthId: string,
	registrationType: "email" | "discord",
): Promise<void> {
	const user = store.get(userId);
	if (user) {
		store.set(userId, {
			...user,
			supabaseAuthId,
			registrationType,
			registeredAt: new Date(),
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
	const user = store.get(userId);
	if (user) {
		store.set(userId, { ...user, patLastUsedAt: new Date() });
	}
}
