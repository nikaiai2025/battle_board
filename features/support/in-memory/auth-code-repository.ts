/**
 * インメモリ AuthCodeRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * auth-code-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/authentication.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { AuthCode } from "../../../src/lib/infrastructure/repositories/auth-code-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる認証コードストア */
const store = new Map<string, AuthCode>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
}

/**
 * テスト用ヘルパー: 認証コードを直接ストアに追加する。
 */
export function _insert(authCode: AuthCode): void {
	store.set(authCode.id, authCode);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 新規認証コードレコードを作成する。
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts
 */
export async function create(
	authCode: Omit<AuthCode, "id" | "createdAt">,
): Promise<AuthCode> {
	const newCode: AuthCode = {
		...authCode,
		id: crypto.randomUUID(),
		createdAt: new Date(Date.now()),
	};
	store.set(newCode.id, newCode);
	return newCode;
}

/**
 * 認証コード文字列（6桁）でレコードを取得する。
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts
 */
export async function findByCode(code: string): Promise<AuthCode | null> {
	for (const authCode of store.values()) {
		if (authCode.code === code) return authCode;
	}
	return null;
}

/**
 * edge-token の識別子（token_id）でレコードを取得する。
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts
 */
export async function findByTokenId(tokenId: string): Promise<AuthCode | null> {
	for (const authCode of store.values()) {
		if (authCode.tokenId === tokenId) return authCode;
	}
	return null;
}

/**
 * 認証コードを認証済み状態にする。
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts
 */
export async function markVerified(id: string): Promise<void> {
	const authCode = store.get(id);
	if (authCode) {
		store.set(id, { ...authCode, verified: true });
	}
}

/**
 * 有効期限切れの認証コードを削除し、削除件数を返す。
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts
 */
export async function deleteExpired(): Promise<number> {
	const now = new Date(Date.now());
	let count = 0;
	for (const [id, authCode] of store.entries()) {
		if (authCode.expiresAt < now) {
			store.delete(id);
			count++;
		}
	}
	return count;
}

/**
 * 認証コードレコードに write_token と write_token_expires_at を設定する。
 * AuthService.verifyAuthCode が認証成功後に専ブラ向け write_token を発行する際に呼ばれる。
 *
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts > updateWriteToken
 * See: features/constraints/specialist_browser_compat.feature @専ブラ認証フロー
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */
export async function updateWriteToken(
	id: string,
	writeToken: string,
	writeTokenExpiresAt: Date,
): Promise<void> {
	const authCode = store.get(id);
	if (authCode) {
		store.set(id, { ...authCode, writeToken, writeTokenExpiresAt });
	}
}

/**
 * write_token 文字列で認証コードレコードを検索する。
 * AuthService.verifyWriteToken が専ブラ認証フローでトークン検証する際に呼ばれる。
 *
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts > findByWriteToken
 * See: features/constraints/specialist_browser_compat.feature @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
 * See: tmp/escalations/escalation_ESC-TASK-041-1.md — ESC解決用追加
 */
export async function findByWriteToken(
	writeToken: string,
): Promise<AuthCode | null> {
	for (const authCode of store.values()) {
		if (authCode.writeToken === writeToken) return authCode;
	}
	return null;
}

/**
 * 認証コードレコードの write_token と write_token_expires_at を null にする（ワンタイム消費）。
 * AuthService.verifyWriteToken がトークン検証成功後に呼ばれ、再利用を防ぐ。
 *
 * See: src/lib/infrastructure/repositories/auth-code-repository.ts > clearWriteToken
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式 > ワンタイム
 * See: tmp/escalations/escalation_ESC-TASK-041-1.md — ESC解決用追加
 */
export async function clearWriteToken(id: string): Promise<void> {
	const authCode = store.get(id);
	if (authCode) {
		store.set(id, { ...authCode, writeToken: null, writeTokenExpiresAt: null });
	}
}
