/**
 * D-08 Domain Model: UserBotVocabulary（ユーザー語録）
 *
 * ユーザーがマイページから登録する荒らしBOTの語録。
 * 登録から24時間で自動失効する。
 * 管理者固定文（bot_profiles.yaml の fixed_messages）とマージされ、
 * 荒らしBOTの書き込みにランダムで使用される。
 *
 * See: features/user_bot_vocabulary.feature
 * See: supabase/migrations/00038_user_bot_vocabularies.sql
 */

/** ユーザー語録エンティティ */
export interface UserBotVocabulary {
	/** レコードID (PK, SERIAL) */
	id: number;
	/** 登録したユーザーのID (FK → users.id) */
	userId: string;
	/** 語録本文（最大30文字、! 禁止） */
	content: string;
	/** 登録日時 */
	registeredAt: Date;
	/** 有効期限（registeredAt + 24時間） */
	expiresAt: Date;
}
