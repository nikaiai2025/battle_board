/**
 * UserBotVocabularyRepository — user_bot_vocabularies テーブルへの CRUD 操作を担うリポジトリ
 *
 * マイページからのユーザー語録登録・一覧取得に対応する。
 * バリデーション・認可チェックはサービス層（UserBotVocabularyService）で行う。
 *
 * See: features/user_bot_vocabulary.feature
 * See: supabase/migrations/00038_user_bot_vocabularies.sql
 */

import type { UserBotVocabulary } from "../../domain/models/user-bot-vocabulary";
import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** user_bot_vocabularies テーブルの DB レコード（snake_case）*/
interface UserBotVocabularyRow {
	id: number;
	user_id: string;
	content: string;
	registered_at: string;
	expires_at: string;
}

// ---------------------------------------------------------------------------
// IUserBotVocabularyRepository インターフェース（DI用）
// UserBotVocabularyService が依存するインターフェースを定義する。
// BDDテスト時は InMemoryUserBotVocabularyRepository でこれを実装する。
// ---------------------------------------------------------------------------

/**
 * UserBotVocabularyRepository の依存インターフェース。
 * UserBotVocabularyService および FixedMessageContentStrategy に注入する。
 *
 * See: features/user_bot_vocabulary.feature
 */
export interface IUserBotVocabularyRepository {
	/**
	 * 語録を新規登録する。
	 * expires_at は registered_at + 24時間で自動設定される。
	 *
	 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
	 *
	 * @param userId - 登録するユーザーのID（UUID）
	 * @param content - 語録本文
	 * @returns 登録された語録エンティティ
	 */
	create(userId: string, content: string): Promise<UserBotVocabulary>;

	/**
	 * 指定ユーザーの有効語録一覧を取得する（expires_at > now()）。
	 * マイページの語録管理画面に表示する。
	 *
	 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
	 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
	 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
	 *
	 * @param userId - ユーザーID（UUID）
	 * @returns 有効な語録エンティティ配列（registered_at 降順）
	 */
	findActiveByUserId(userId: string): Promise<UserBotVocabulary[]>;

	/**
	 * 全ユーザーの有効語録一覧を取得する（expires_at > now()）。
	 * BOT書き込み時の語録プール構築に使用する。
	 *
	 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
	 * See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
	 *
	 * @returns 全ユーザーの有効な語録エンティティ配列
	 */
	findAllActive(): Promise<UserBotVocabulary[]>;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToUserBotVocabulary(row: UserBotVocabularyRow): UserBotVocabulary {
	return {
		id: row.id,
		userId: row.user_id,
		content: row.content,
		registeredAt: new Date(row.registered_at),
		expiresAt: new Date(row.expires_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数（Supabase実装）
// ---------------------------------------------------------------------------

/**
 * 語録を新規登録する。
 * expires_at は registered_at + 24時間で DB側が自動設定する。
 *
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 * See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
 *
 * @param userId - 登録するユーザーのID（UUID）
 * @param content - 語録本文
 * @returns 登録された語録エンティティ
 */
export async function create(
	userId: string,
	content: string,
): Promise<UserBotVocabulary> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

	const { data, error } = await supabaseAdmin
		.from("user_bot_vocabularies")
		.insert({
			user_id: userId,
			content,
			registered_at: now.toISOString(),
			expires_at: expiresAt.toISOString(),
		})
		.select()
		.single();

	if (error) {
		throw new Error(
			`UserBotVocabularyRepository.create failed: ${error.message}`,
		);
	}

	return rowToUserBotVocabulary(data as UserBotVocabularyRow);
}

/**
 * 指定ユーザーの有効語録一覧を取得する。
 * expires_at > now() のレコードのみ返す。registered_at 降順。
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 *
 * @param userId - ユーザーID（UUID）
 * @returns 有効な語録エンティティ配列
 */
export async function findActiveByUserId(
	userId: string,
): Promise<UserBotVocabulary[]> {
	const { data, error } = await supabaseAdmin
		.from("user_bot_vocabularies")
		.select("*")
		.eq("user_id", userId)
		.gt("expires_at", new Date().toISOString())
		.order("registered_at", { ascending: false });

	if (error) {
		throw new Error(
			`UserBotVocabularyRepository.findActiveByUserId failed: ${error.message}`,
		);
	}

	return (data ?? []).map((row) =>
		rowToUserBotVocabulary(row as UserBotVocabularyRow),
	);
}

/**
 * 全ユーザーの有効語録一覧を取得する。
 * expires_at > now() のレコードのみ返す。
 * BOT書き込み時の語録プール構築に使用する。
 *
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 *
 * @returns 全ユーザーの有効な語録エンティティ配列
 */
export async function findAllActive(): Promise<UserBotVocabulary[]> {
	const { data, error } = await supabaseAdmin
		.from("user_bot_vocabularies")
		.select("*")
		.gt("expires_at", new Date().toISOString());

	if (error) {
		throw new Error(
			`UserBotVocabularyRepository.findAllActive failed: ${error.message}`,
		);
	}

	return (data ?? []).map((row) =>
		rowToUserBotVocabulary(row as UserBotVocabularyRow),
	);
}
