/**
 * インメモリ CopipeRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * copipe-repository.ts と同一シグネチャの関数を提供する。
 *
 * 検索ロジック（本番実装と同一）:
 *   findRandom()         → ストアからランダム1件を返す
 *   findByName(name)     → 完全一致（name === entry.name）
 *   findByNamePartial(name) → 部分一致（name を含む && 完全一致は除外）
 *
 * See: features/command_copipe.feature
 * See: src/lib/infrastructure/repositories/copipe-repository.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { CopipeEntry } from "../../../src/lib/infrastructure/repositories/copipe-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるエントリストア */
const store: CopipeEntry[] = [];

/** 連番カウンター（IDの一意性を保証する） */
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
 * BDDステップ定義で「以下のコピペAAが登録されている」等の事前条件に使用する。
 *
 * See: features/command_copipe.feature Background
 *
 * @param entry - 登録するエントリ（content は省略可能、省略時はダミーコンテンツを使用）
 */
export function _insert(entry: { name: string; content?: string }): void {
	store.push({
		id: idCounter++,
		name: entry.name,
		content: entry.content ?? `【${entry.name}】のAA本文（テスト用ダミー）`,
		createdAt: new Date(Date.now()),
	});
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ランダムに1件のコピペエントリを取得する。
 *
 * InMemory実装では Math.random() でランダム選択する（テスト容易性）。
 * データが0件の場合は null を返す。
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findRandom
 * See: features/command_copipe.feature @引数なしでランダムにAAが表示される
 */
export async function findRandom(): Promise<CopipeEntry | null> {
	if (store.length === 0) return null;
	const index = Math.floor(Math.random() * store.length);
	return store[index];
}

/**
 * 名前で完全一致検索する。
 * 一致しない場合は null を返す。
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findByName
 * See: features/command_copipe.feature @完全一致でAAが表示される
 *
 * @param name - 検索する名前（完全一致）
 */
export async function findByName(name: string): Promise<CopipeEntry | null> {
	const found = store.find((entry) => entry.name === name);
	return found ?? null;
}

/**
 * 名前で部分一致検索する（完全一致を除く）。
 *
 * name を含む（部分一致）かつ完全一致ではないエントリを返す。
 * 本番実装の SQL: WHERE name LIKE '%name%' AND name != 'name'
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findByNamePartial
 * See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
 * See: features/command_copipe.feature @部分一致で複数件ヒットした場合はエラーになる
 *
 * @param name - 検索するキーワード（部分一致）
 * @returns 部分一致したエントリの配列（完全一致は除外済み）
 */
export async function findByNamePartial(name: string): Promise<CopipeEntry[]> {
	return store.filter(
		// 部分一致（name を含む）かつ完全一致は除外
		(entry) => entry.name.includes(name) && entry.name !== name,
	);
}
