/**
 * インメモリ UserBotVocabularyRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * user-bot-vocabulary-repository.ts の IUserBotVocabularyRepository を実装する。
 *
 * ストア設計:
 *   - エントリを配列で保持する
 *   - id は連番（idCounter）で自動採番する（SERIAL に相当）
 *   - user_id（UUID型）は assertUUID() で検証する
 *   - findActiveByUserId / findAllActive は expires_at > now() でフィルタする
 *     （Date.now() はテスト側で setCurrentTime() によりスタブ化可能）
 *
 * See: features/user_bot_vocabulary.feature
 * See: src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: docs/architecture/bdd_test_strategy.md §2 インメモリ実装の設計方針
 */

import type { UserBotVocabulary } from "../../../src/lib/domain/models/user-bot-vocabulary";
import type { IUserBotVocabularyRepository } from "../../../src/lib/infrastructure/repositories/user-bot-vocabulary-repository";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 語録の有効期間（24時間をミリ秒で表現） */
const EXPIRY_DURATION_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるエントリストア */
const store: UserBotVocabulary[] = [];

/** 連番カウンター（IDの一意性を保証する。SERIAL相当） */
let idCounter = 1;

// ---------------------------------------------------------------------------
// ストア管理関数
// ---------------------------------------------------------------------------

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 *
 * See: features/support/mock-installer.ts > resetAllStores
 */
export function reset(): void {
	store.length = 0;
	idCounter = 1;
}

/**
 * テスト用ヘルパー: エントリを直接ストアに追加する。
 * BDDステップ定義で「自分が以下の語録を登録済みである」等の事前条件に使用する。
 *
 * UUID型カラム（userId）には assertUUID() を適用する。
 * See: docs/architecture/bdd_test_strategy.md §2 インメモリ実装の設計方針
 *
 * See: features/user_bot_vocabulary.feature Background
 *
 * @param entry - 登録するエントリ
 * @returns 登録されたエントリ
 */
export function _insert(entry: {
	userId: string;
	content: string;
	registeredAt?: Date;
	expiresAt?: Date;
}): UserBotVocabulary {
	assertUUID(entry.userId, "UserBotVocabularyRepository._insert.userId");

	const registeredAt = entry.registeredAt ?? new Date(Date.now());
	const expiresAt =
		entry.expiresAt ?? new Date(registeredAt.getTime() + EXPIRY_DURATION_MS);

	const newEntry: UserBotVocabulary = {
		id: idCounter++,
		userId: entry.userId,
		content: entry.content,
		registeredAt,
		expiresAt,
	};
	store.push(newEntry);
	return newEntry;
}

// ---------------------------------------------------------------------------
// リポジトリ関数（IUserBotVocabularyRepository 実装）
// ---------------------------------------------------------------------------

/**
 * 語録を新規登録する。
 * expires_at は registered_at + 24時間で自動設定される。
 *
 * See: src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts > create
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
	assertUUID(userId, "UserBotVocabularyRepository.create.userId");

	return _insert({ userId, content });
}

/**
 * 指定ユーザーの有効語録一覧を取得する（expires_at > now()）。
 * registered_at 降順で返す（本番実装と同順）。
 *
 * See: src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts > findActiveByUserId
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
 *
 * @param userId - ユーザーID（UUID）
 * @returns 有効な語録エンティティ配列（registered_at 降順）
 */
export async function findActiveByUserId(
	userId: string,
): Promise<UserBotVocabulary[]> {
	assertUUID(userId, "UserBotVocabularyRepository.findActiveByUserId.userId");

	const now = new Date(Date.now());
	return store
		.filter((entry) => entry.userId === userId && entry.expiresAt > now)
		.sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime());
}

/**
 * 全ユーザーの有効語録一覧を取得する（expires_at > now()）。
 * BOT書き込み時の語録プール構築に使用する。
 *
 * See: src/lib/infrastructure/repositories/user-bot-vocabulary-repository.ts > findAllActive
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 * See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 *
 * @returns 全ユーザーの有効な語録エンティティ配列
 */
export async function findAllActive(): Promise<UserBotVocabulary[]> {
	const now = new Date(Date.now());
	return store.filter((entry) => entry.expiresAt > now);
}

// ---------------------------------------------------------------------------
// IUserBotVocabularyRepository 準拠の確認
// TypeScript コンパイル時に型チェックで準拠を保証する。
// ---------------------------------------------------------------------------

const _: IUserBotVocabularyRepository = {
	create,
	findActiveByUserId,
	findAllActive,
};
void _;
