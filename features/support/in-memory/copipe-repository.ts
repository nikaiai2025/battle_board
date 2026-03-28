/**
 * インメモリ CopipeRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * copipe-repository.ts と同一シグネチャの関数を提供する。
 *
 * 内部ストア:
 *   adminStore: copipe_entries 相当（管理者データ）
 *   userStore:  user_copipe_entries 相当（ユーザー登録データ）
 *
 * 検索ロジック（本番実装と同一）:
 *   findRandom()               → 両ストアをマージしてランダム1件を返す
 *   findByName(name)           → 完全一致（name === entry.name）を両ストアから返す
 *   findByNamePartial(name)    → 部分一致（name を含む && 完全一致は除外）を両ストアから返す
 *   findByContentPartial(query) → content 部分一致（全文検索フォールバック）を両ストアから返す
 *
 * See: features/command_copipe.feature
 * See: features/user_copipe.feature
 * See: src/lib/infrastructure/repositories/copipe-repository.ts
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { CopipeEntry } from "../../../src/lib/infrastructure/repositories/copipe-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる管理者コピペストア（copipe_entries 相当） */
const adminStore: CopipeEntry[] = [];

/** シナリオ間でリセットされるユーザーコピペストア（user_copipe_entries 相当） */
const userStore: CopipeEntry[] = [];

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
	adminStore.length = 0;
	userStore.length = 0;
	idCounter = 1;
}

/**
 * テスト用ヘルパー: 管理者コピペエントリをストアに追加する（copipe_entries 相当）。
 * BDDステップ定義で「以下のコピペAAが登録されている」等の事前条件に使用する。
 *
 * See: features/command_copipe.feature Background
 * See: features/user_copipe.feature
 *
 * @param entry - 登録するエントリ（content は省略可能、省略時はダミーコンテンツを使用）
 */
export function _insert(entry: { name: string; content?: string }): void {
	adminStore.push({
		id: idCounter++,
		name: entry.name,
		content: entry.content ?? `【${entry.name}】のAA本文（テスト用ダミー）`,
		createdAt: new Date(Date.now()),
	});
}

/**
 * テスト用ヘルパー: ユーザーコピペエントリをストアに追加する（user_copipe_entries 相当）。
 * BDDステップ定義で「自分が以下のコピペを登録済みである」等の事前条件に使用する。
 *
 * See: features/user_copipe.feature
 *
 * @param entry - 登録するエントリ（content は省略可能、省略時はダミーコンテンツを使用）
 */
export function _insertUser(entry: { name: string; content?: string }): void {
	userStore.push({
		id: idCounter++,
		name: entry.name,
		content:
			entry.content ??
			`【${entry.name}】のAA本文（ユーザー登録・テスト用ダミー）`,
		createdAt: new Date(Date.now()),
	});
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ランダムに1件のコピペエントリを取得する。
 *
 * adminStore と userStore の両方をマージしてランダム選択する。
 * データが0件の場合は null を返す。
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findRandom
 * See: features/command_copipe.feature @引数なしでランダムにAAが表示される
 * See: features/user_copipe.feature @ユーザー登録コピペが!copipeのランダム選択に含まれる
 */
export async function findRandom(): Promise<CopipeEntry | null> {
	// 両ストアをマージしてランダム選択する
	const allEntries = [...adminStore, ...userStore];
	if (allEntries.length === 0) return null;
	const index = Math.floor(Math.random() * allEntries.length);
	return allEntries[index];
}

/**
 * 名前で完全一致検索する。
 * 両ストアから完全一致したエントリを配列で返す。
 * 一致しない場合は空配列を返す。
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findByName
 * See: features/command_copipe.feature @完全一致でAAが表示される
 * See: features/user_copipe.feature @管理者データとユーザーデータで同名のコピペが存在する場合はランダムに1件表示される
 *
 * @param name - 検索する名前（完全一致）
 */
export async function findByName(name: string): Promise<CopipeEntry[]> {
	// 両ストアから完全一致するエントリをすべて返す
	const adminMatches = adminStore.filter((entry) => entry.name === name);
	const userMatches = userStore.filter((entry) => entry.name === name);
	return [...adminMatches, ...userMatches];
}

/**
 * 名前で部分一致検索する（完全一致を除く）。
 *
 * name を含む（部分一致）かつ完全一致ではないエントリを両ストアから返す。
 * 本番実装の SQL: WHERE name LIKE '%name%' AND name != 'name'
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findByNamePartial
 * See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
 * See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
 *
 * @param name - 検索するキーワード（部分一致）
 * @returns 部分一致したエントリの配列（完全一致は除外済み）
 */
export async function findByNamePartial(name: string): Promise<CopipeEntry[]> {
	// 部分一致（name を含む）かつ完全一致は除外するフィルタ
	const isPartialMatch = (entry: CopipeEntry) =>
		entry.name.includes(name) && entry.name !== name;

	return [
		...adminStore.filter(isPartialMatch),
		...userStore.filter(isPartialMatch),
	];
}

/**
 * content（AA本文）で部分一致検索する。
 *
 * query を content に含むエントリを両ストアから返す。
 * 本番実装の SQL: WHERE content LIKE '%query%'
 *
 * See: src/lib/infrastructure/repositories/copipe-repository.ts > findByContentPartial
 * See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
 * See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
 *
 * @param query - 検索するキーワード（content に対する部分一致）
 * @returns 部分一致したエントリの配列
 */
export async function findByContentPartial(
	query: string,
): Promise<CopipeEntry[]> {
	// 両ストアから content に query を含むエントリをすべて返す
	const adminMatches = adminStore.filter((entry) =>
		entry.content.includes(query),
	);
	const userMatches = userStore.filter((entry) =>
		entry.content.includes(query),
	);
	return [...adminMatches, ...userMatches];
}
