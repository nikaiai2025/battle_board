/**
 * ドメインルール: 入力バリデーション
 * See: docs/architecture/architecture.md §10.2 入力バリデーション
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義
 * See: docs/requirements/ubiquitous_language.yaml #スレッド #レス
 *
 * 全関数が純粋関数（外部依存なし）。
 */

// ---------------------------------------------------------------------------
// バリデーション結果型
// ---------------------------------------------------------------------------

/** バリデーション結果型 */
export type ValidationResult =
	| { valid: true }
	| { valid: false; reason: string; code: string };

// ---------------------------------------------------------------------------
// スレッドタイトルのバリデーション
// ---------------------------------------------------------------------------

/** スレッドタイトルの最大文字数 */
export const THREAD_TITLE_MAX_LENGTH = 96;

/**
 * スレッドタイトルをバリデーションする純粋関数。
 * See: docs/architecture/architecture.md §10.2 入力バリデーション
 * See: docs/architecture/architecture.md §4.2 threads.title: VARCHAR(96)
 *
 * @param title - スレッドタイトル文字列
 * @returns バリデーション結果
 */
export function validateThreadTitle(title: unknown): ValidationResult {
	if (typeof title !== "string") {
		return {
			valid: false,
			reason: "スレッドタイトルは文字列で指定してください",
			code: "INVALID_TYPE",
		};
	}
	if (title.trim().length === 0) {
		return {
			valid: false,
			reason: "スレッドタイトルは空にできません",
			code: "EMPTY_TITLE",
		};
	}
	if (title.length > THREAD_TITLE_MAX_LENGTH) {
		return {
			valid: false,
			reason: `スレッドタイトルは${THREAD_TITLE_MAX_LENGTH}文字以内で入力してください`,
			code: "TITLE_TOO_LONG",
		};
	}
	return { valid: true };
}

// ---------------------------------------------------------------------------
// レス本文のバリデーション
// ---------------------------------------------------------------------------

/** レス本文の最大文字数（仕様TBD。現時点では大きめの制限を設ける） */
export const POST_BODY_MAX_LENGTH = 2000;

/**
 * レス本文をバリデーションする純粋関数。
 * See: docs/architecture/architecture.md §10.2 入力バリデーション
 *
 * @param body - レス本文文字列
 * @returns バリデーション結果
 */
export function validatePostBody(body: unknown): ValidationResult {
	if (typeof body !== "string") {
		return {
			valid: false,
			reason: "本文は文字列で指定してください",
			code: "INVALID_TYPE",
		};
	}
	if (body.trim().length === 0) {
		return {
			valid: false,
			reason: "本文は空にできません",
			code: "EMPTY_BODY",
		};
	}
	if (body.length > POST_BODY_MAX_LENGTH) {
		return {
			valid: false,
			reason: `本文は${POST_BODY_MAX_LENGTH}文字以内で入力してください`,
			code: "BODY_TOO_LONG",
		};
	}
	return { valid: true };
}

// ---------------------------------------------------------------------------
// ユーザーネームのバリデーション（有料ユーザー用）
// ---------------------------------------------------------------------------

/** ユーザーネームの最大文字数 */
export const USERNAME_MAX_LENGTH = 20;

/**
 * ユーザーネームをバリデーションする純粋関数。
 * See: docs/architecture/architecture.md §4.2 users.username: VARCHAR(20)
 * See: docs/requirements/ubiquitous_language.yaml #ユーザーネーム
 *
 * @param username - ユーザーネーム文字列
 * @returns バリデーション結果
 */
export function validateUsername(username: unknown): ValidationResult {
	if (typeof username !== "string") {
		return {
			valid: false,
			reason: "ユーザーネームは文字列で指定してください",
			code: "INVALID_TYPE",
		};
	}
	if (username.trim().length === 0) {
		return {
			valid: false,
			reason: "ユーザーネームは空にできません",
			code: "EMPTY_USERNAME",
		};
	}
	if (username.length > USERNAME_MAX_LENGTH) {
		return {
			valid: false,
			reason: `ユーザーネームは${USERNAME_MAX_LENGTH}文字以内で入力してください`,
			code: "USERNAME_TOO_LONG",
		};
	}
	return { valid: true };
}

// ---------------------------------------------------------------------------
// 板IDのバリデーション
// ---------------------------------------------------------------------------

/** 板IDの最大文字数 */
export const BOARD_ID_MAX_LENGTH = 32;

/** 板IDの正規表現（英数字・アンダースコアのみ） */
const BOARD_ID_PATTERN = /^[a-z0-9_]+$/;

/**
 * 板IDをバリデーションする純粋関数。
 *
 * @param boardId - 板ID文字列
 * @returns バリデーション結果
 */
export function validateBoardId(boardId: unknown): ValidationResult {
	if (typeof boardId !== "string") {
		return {
			valid: false,
			reason: "板IDは文字列で指定してください",
			code: "INVALID_TYPE",
		};
	}
	if (boardId.trim().length === 0) {
		return {
			valid: false,
			reason: "板IDは空にできません",
			code: "EMPTY_BOARD_ID",
		};
	}
	if (boardId.length > BOARD_ID_MAX_LENGTH) {
		return {
			valid: false,
			reason: `板IDは${BOARD_ID_MAX_LENGTH}文字以内で指定してください`,
			code: "BOARD_ID_TOO_LONG",
		};
	}
	if (!BOARD_ID_PATTERN.test(boardId)) {
		return {
			valid: false,
			reason: "板IDは英小文字・数字・アンダースコアのみ使用できます",
			code: "INVALID_BOARD_ID_FORMAT",
		};
	}
	return { valid: true };
}
