/**
 * インメモリ UserCopipeRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * user-copipe-repository.ts と同一シグネチャの関数を提供する。
 *
 * ストア設計:
 *   - エントリを配列で保持する
 *   - id は連番（idCounter）で自動採番する（SERIAL に相当）
 *   - user_id（UUID型）は assertUUID() で検証する
 *
 * See: features/user_copipe.feature
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: docs/architecture/bdd_test_strategy.md §2 インメモリ実装の設計方針
 */

import type { UserCopipeEntry } from "../../../src/lib/infrastructure/repositories/user-copipe-repository";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるエントリストア */
const store: UserCopipeEntry[] = [];

/** 連番カウンター（IDの一意性を保証する。SERIAL相当）*/
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
 * BDDステップ定義で「自分が以下のコピペを登録済みである」等の事前条件に使用する。
 *
 * UUID型カラム（userId）には assertUUID() を適用する。
 * See: docs/architecture/bdd_test_strategy.md §2 インメモリ実装の設計方針
 *
 * See: features/user_copipe.feature Background
 *
 * @param entry - 登録するエントリ
 */
export function _insert(entry: {
	userId: string;
	name: string;
	content: string;
}): UserCopipeEntry {
	assertUUID(entry.userId, "UserCopipeRepository._insert.userId");

	const now = new Date(Date.now());
	const newEntry: UserCopipeEntry = {
		id: idCounter++,
		userId: entry.userId,
		name: entry.name,
		content: entry.content,
		createdAt: now,
		updatedAt: now,
	};
	store.push(newEntry);
	return newEntry;
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーのコピペエントリ一覧を取得する。
 * created_at 降順で返す（本番実装と同順）。
 *
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts > findByUserId
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
 *
 * @param userId - ユーザーID（UUID）
 * @returns ユーザーのコピペエントリ配列（created_at 降順）
 */
export async function findByUserId(userId: string): Promise<UserCopipeEntry[]> {
	assertUUID(userId, "UserCopipeRepository.findByUserId.userId");
	// created_at 降順（本番 Supabase の order 設定に合わせる）
	return store
		.filter((entry) => entry.userId === userId)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * ID でコピペエントリを取得する。
 * 存在しない場合は null を返す。
 *
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts > findById
 *
 * @param id - エントリID
 * @returns コピペエントリ、またはなければ null
 */
export async function findById(id: number): Promise<UserCopipeEntry | null> {
	return store.find((entry) => entry.id === id) ?? null;
}

/**
 * コピペエントリを新規登録する。
 * id は自動採番（SERIAL相当）、createdAt/updatedAt は現在時刻を設定する。
 *
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts > insert
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
	assertUUID(entry.userId, "UserCopipeRepository.insert.userId");

	return _insert(entry);
}

/**
 * コピペエントリを更新する。
 * updatedAt は現在時刻に更新する（本番 DB の updated_at 更新に相当）。
 *
 * 存在しない ID の場合は Error を throw する（本番の Supabase 動作に準拠）。
 *
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts > update
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
	const index = store.findIndex((entry) => entry.id === id);
	if (index === -1) {
		throw new Error(
			`[InMemory] UserCopipeRepository.update: entry not found for id=${id}`,
		);
	}

	const updated: UserCopipeEntry = {
		...store[index],
		name: input.name,
		content: input.content,
		updatedAt: new Date(Date.now()),
	};
	store[index] = updated;
	return updated;
}

/**
 * コピペエントリを削除する。
 * 存在しない ID の場合は何もしない（本番 DB の DELETE 動作に準拠）。
 *
 * See: src/lib/infrastructure/repositories/user-copipe-repository.ts > deleteById
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 *
 * @param id - 削除するエントリID
 */
export async function deleteById(id: number): Promise<void> {
	const index = store.findIndex((entry) => entry.id === id);
	if (index !== -1) {
		store.splice(index, 1);
	}
}
