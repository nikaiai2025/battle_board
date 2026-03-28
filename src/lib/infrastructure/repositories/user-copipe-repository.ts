/**
 * UserCopipeRepository — user_copipe_entries テーブルへの CRUD 操作を担うリポジトリ
 *
 * マイページからのコピペ(AA)登録・編集・削除に対応する。
 * 認可チェック（本人のみ編集・削除）はサービス層（UserCopipeService）で行う。
 *
 * See: features/user_copipe.feature
 * See: supabase/migrations/00036_user_copipe_entries.sql
 * See: docs/architecture/components/user-copipe.md §2.2 IUserCopipeRepository
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** user_copipe_entries テーブルの DB レコード（snake_case）*/
interface UserCopipeEntryRow {
	id: number;
	user_id: string;
	name: string;
	content: string;
	created_at: string;
	updated_at: string;
}

/** ユーザーコピペエントリのドメインモデル */
export interface UserCopipeEntry {
	id: number;
	userId: string;
	name: string;
	content: string;
	createdAt: Date;
	updatedAt: Date;
}

// ---------------------------------------------------------------------------
// IUserCopipeRepository インターフェース（DI用）
// UserCopipeService が依存するインターフェースを定義する。
// BDDテスト時は InMemoryUserCopipeRepository でこれを実装する。
// ---------------------------------------------------------------------------

/**
 * UserCopipeRepository の依存インターフェース。
 * UserCopipeService に注入する。
 *
 * See: features/user_copipe.feature
 * See: docs/architecture/components/user-copipe.md §2.2 IUserCopipeRepository
 */
export interface IUserCopipeRepository {
	/**
	 * 指定ユーザーのコピペエントリ一覧を取得する。
	 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
	 *
	 * @param userId - ユーザーID（UUID）
	 * @returns ユーザーのコピペエントリ配列
	 */
	findByUserId(userId: string): Promise<UserCopipeEntry[]>;

	/**
	 * ID でコピペエントリを取得する。
	 * 存在しない場合は null を返す。
	 *
	 * @param id - エントリID
	 * @returns コピペエントリ、またはなければ null
	 */
	findById(id: number): Promise<UserCopipeEntry | null>;

	/**
	 * コピペエントリを新規登録する。
	 * See: features/user_copipe.feature @マイページからコピペを新規登録する
	 *
	 * @param entry - 登録するエントリ（userId, name, content）
	 * @returns 登録されたエントリ（id, createdAt, updatedAt 付与済み）
	 */
	insert(entry: {
		userId: string;
		name: string;
		content: string;
	}): Promise<UserCopipeEntry>;

	/**
	 * コピペエントリを更新する。
	 * See: features/user_copipe.feature @自分の登録コピペを編集する
	 *
	 * @param id - 更新するエントリID
	 * @param input - 更新内容（name, content）
	 * @returns 更新後のエントリ
	 */
	update(
		id: number,
		input: { name: string; content: string },
	): Promise<UserCopipeEntry>;

	/**
	 * コピペエントリを削除する。
	 * See: features/user_copipe.feature @自分の登録コピペを削除する
	 *
	 * @param id - 削除するエントリID
	 */
	deleteById(id: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToUserCopipeEntry(row: UserCopipeEntryRow): UserCopipeEntry {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		content: row.content,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数（Supabase実装）
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーのコピペエントリ一覧を取得する。
 * created_at 降順で返す（新しいエントリが先頭）。
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
 *
 * @param userId - ユーザーID（UUID）
 * @returns ユーザーのコピペエントリ配列（created_at 降順）
 */
export async function findByUserId(userId: string): Promise<UserCopipeEntry[]> {
	const { data, error } = await supabaseAdmin
		.from("user_copipe_entries")
		.select("*")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });

	if (error) {
		throw new Error(
			`UserCopipeRepository.findByUserId failed: ${error.message}`,
		);
	}

	return (data ?? []).map((row) =>
		rowToUserCopipeEntry(row as UserCopipeEntryRow),
	);
}

/**
 * ID でコピペエントリを取得する。
 * 存在しない場合は null を返す。
 *
 * @param id - エントリID
 * @returns コピペエントリ、またはなければ null
 */
export async function findById(id: number): Promise<UserCopipeEntry | null> {
	const { data, error } = await supabaseAdmin
		.from("user_copipe_entries")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (error) {
		throw new Error(`UserCopipeRepository.findById failed: ${error.message}`);
	}

	return data ? rowToUserCopipeEntry(data as UserCopipeEntryRow) : null;
}

/**
 * コピペエントリを新規登録する。
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: features/user_copipe.feature @同名のコピペを登録できる
 *
 * @param entry - 登録するエントリ（userId, name, content）
 * @returns 登録されたエントリ（id, createdAt, updatedAt 付与済み）
 */
export async function insert(entry: {
	userId: string;
	name: string;
	content: string;
}): Promise<UserCopipeEntry> {
	const { data, error } = await supabaseAdmin
		.from("user_copipe_entries")
		.insert({
			user_id: entry.userId,
			name: entry.name,
			content: entry.content,
		})
		.select()
		.single();

	if (error) {
		throw new Error(`UserCopipeRepository.insert failed: ${error.message}`);
	}

	return rowToUserCopipeEntry(data as UserCopipeEntryRow);
}

/**
 * コピペエントリを更新する。
 * updated_at は DB のデフォルト値として自動更新される。
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 *
 * @param id - 更新するエントリID
 * @param input - 更新内容（name, content）
 * @returns 更新後のエントリ
 */
export async function update(
	id: number,
	input: { name: string; content: string },
): Promise<UserCopipeEntry> {
	const { data, error } = await supabaseAdmin
		.from("user_copipe_entries")
		.update({
			name: input.name,
			content: input.content,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.select()
		.single();

	if (error) {
		throw new Error(`UserCopipeRepository.update failed: ${error.message}`);
	}

	return rowToUserCopipeEntry(data as UserCopipeEntryRow);
}

/**
 * コピペエントリを削除する。
 *
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 *
 * @param id - 削除するエントリID
 */
export async function deleteById(id: number): Promise<void> {
	const { error } = await supabaseAdmin
		.from("user_copipe_entries")
		.delete()
		.eq("id", id);

	if (error) {
		throw new Error(`UserCopipeRepository.deleteById failed: ${error.message}`);
	}
}
