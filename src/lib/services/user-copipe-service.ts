/**
 * UserCopipeService — マイページのコピペ(AA)CRUD を担うサービス
 *
 * 認可チェック（本人のみ編集・削除）とバリデーションをこの層で実施する。
 * DB操作は IUserCopipeRepository に委譲する。
 *
 * バリデーションルール:
 *   - name: 必須、1〜50文字
 *   - content: 必須、1〜5,000文字
 *
 * 認可ルール:
 *   - create: 認証済みユーザーなら誰でも可
 *   - update / delete: entry.userId === userId でなければ 403
 *
 * See: features/user_copipe.feature
 * See: docs/architecture/components/user-copipe.md §2.1 UserCopipeService
 */

import type {
	IUserCopipeRepository,
	UserCopipeEntry,
} from "@/lib/infrastructure/repositories/user-copipe-repository";
import * as UserCopipeRepository from "@/lib/infrastructure/repositories/user-copipe-repository";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 成功結果 */
type SuccessResult<T> = { success: true; data: T };

/** エラー結果 */
type ErrorResult = { success: false; code: string; error: string };

/** サービス操作の結果型 */
export type ServiceResult<T> = SuccessResult<T> | ErrorResult;

/** コピペ作成/更新の入力型 */
export interface UserCopipeInput {
	name: string;
	content: string;
}

// ---------------------------------------------------------------------------
// バリデーション定数
// ---------------------------------------------------------------------------

/** name の最大文字数 */
const NAME_MAX_LENGTH = 50;

/** content の最大文字数 */
const CONTENT_MAX_LENGTH = 5000;

// ---------------------------------------------------------------------------
// バリデーション関数
// ---------------------------------------------------------------------------

/**
 * コピペ入力値を検証する。
 * エラーがある場合は ErrorResult を返す。
 *
 * See: features/user_copipe.feature @名前が空の場合は登録できない
 * See: features/user_copipe.feature @本文が空の場合は登録できない
 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
 *
 * @param input - バリデーション対象の入力値
 * @returns エラーがある場合は ErrorResult、問題なければ null
 */
function validateInput(input: UserCopipeInput): ErrorResult | null {
	// name 必須チェック
	if (!input.name || input.name.trim() === "") {
		return {
			success: false,
			code: "VALIDATION_ERROR",
			error: "名前は必須です",
		};
	}

	// name 文字数チェック
	if (input.name.length > NAME_MAX_LENGTH) {
		return {
			success: false,
			code: "VALIDATION_ERROR",
			error: `名前は${NAME_MAX_LENGTH}文字以内で入力してください`,
		};
	}

	// content 必須チェック
	if (!input.content || input.content.trim() === "") {
		return {
			success: false,
			code: "VALIDATION_ERROR",
			error: "本文は必須です",
		};
	}

	// content 文字数チェック
	if (input.content.length > CONTENT_MAX_LENGTH) {
		return {
			success: false,
			code: "VALIDATION_ERROR",
			error: `本文は${CONTENT_MAX_LENGTH}文字以内で入力してください`,
		};
	}

	return null;
}

// ---------------------------------------------------------------------------
// DI用リポジトリ参照
// ---------------------------------------------------------------------------

/**
 * テスト用にリポジトリ実装を差し替えるための参照。
 * BDDテストでは register-mocks.js によりモジュール差し替えが行われるため、
 * 実際には直接インポートされた UserCopipeRepository が使われる。
 */
let _repo: IUserCopipeRepository = UserCopipeRepository;

/**
 * テスト用: リポジトリを差し替える。
 * BDDテストでは register-mocks.js による差し替えを使用し、
 * 単体テストでは直接この関数を呼び出す。
 */
export function _setRepository(repo: IUserCopipeRepository): void {
	_repo = repo;
}

// ---------------------------------------------------------------------------
// サービス関数
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーのコピペ一覧を取得する。
 * 他ユーザーのコピペは返さない。
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
 *
 * @param userId - 取得対象のユーザーID（UUID）
 * @returns コピペエントリ配列
 */
export async function list(userId: string): Promise<UserCopipeEntry[]> {
	return _repo.findByUserId(userId);
}

/**
 * コピペを新規登録する。
 * バリデーションエラーの場合は ErrorResult を返す。
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: features/user_copipe.feature @同名のコピペを登録できる
 * See: features/user_copipe.feature @名前が空の場合は登録できない
 * See: features/user_copipe.feature @本文が空の場合は登録できない
 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
 *
 * @param userId - 登録するユーザーのID（UUID）
 * @param input - 登録内容（name, content）
 * @returns 登録されたエントリ、またはバリデーションエラー
 */
export async function create(
	userId: string,
	input: UserCopipeInput,
): Promise<ServiceResult<UserCopipeEntry>> {
	// バリデーション
	const validationError = validateInput(input);
	if (validationError) return validationError;

	// 登録
	const entry = await _repo.insert({
		userId,
		name: input.name,
		content: input.content,
	});

	return { success: true, data: entry };
}

/**
 * コピペを更新する。
 * 本人以外のエントリを更新しようとした場合は 403 エラーを返す。
 * 存在しないエントリの場合は 404 エラーを返す。
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 *
 * @param userId - 操作するユーザーのID（UUID）
 * @param entryId - 更新するエントリのID
 * @param input - 更新内容（name, content）
 * @returns 更新後のエントリ、または認可/バリデーションエラー
 */
export async function update(
	userId: string,
	entryId: number,
	input: UserCopipeInput,
): Promise<ServiceResult<UserCopipeEntry>> {
	// バリデーション
	const validationError = validateInput(input);
	if (validationError) return validationError;

	// エントリ存在確認
	const existing = await _repo.findById(entryId);
	if (!existing) {
		return {
			success: false,
			code: "NOT_FOUND",
			error: "コピペが見つかりません",
		};
	}

	// 認可チェック: 本人のみ編集可能
	// See: features/user_copipe.feature @他人の登録コピペは編集できない
	if (existing.userId !== userId) {
		return {
			success: false,
			code: "FORBIDDEN",
			error: "権限がありません",
		};
	}

	// 更新
	const updated = await _repo.update(entryId, {
		name: input.name,
		content: input.content,
	});

	return { success: true, data: updated };
}

/**
 * コピペを削除する。
 * 本人以外のエントリを削除しようとした場合は 403 エラーを返す。
 * 存在しないエントリの場合は 404 エラーを返す。
 *
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 *
 * @param userId - 操作するユーザーのID（UUID）
 * @param entryId - 削除するエントリのID
 * @returns 成功またはエラー
 */
export async function deleteEntry(
	userId: string,
	entryId: number,
): Promise<ServiceResult<void>> {
	// エントリ存在確認
	const existing = await _repo.findById(entryId);
	if (!existing) {
		return {
			success: false,
			code: "NOT_FOUND",
			error: "コピペが見つかりません",
		};
	}

	// 認可チェック: 本人のみ削除可能
	// See: features/user_copipe.feature @他人の登録コピペは削除できない
	if (existing.userId !== userId) {
		return {
			success: false,
			code: "FORBIDDEN",
			error: "権限がありません",
		};
	}

	// 削除
	await _repo.deleteById(entryId);

	return { success: true, data: undefined };
}
