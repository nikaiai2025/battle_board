/**
 * CopipeRepository — copipe_entries + user_copipe_entries の両テーブルをマージして検索する
 *
 * !copipe コマンドの検索ロジック（優先順）:
 *   1. 引数なし → ランダム1件取得（両テーブルからマージしてランダム選択）
 *   2. 引数あり → 完全一致を検索（両テーブルから配列で返す）
 *   3. 完全一致なし → name 部分一致を検索
 *   4. name 一致なし → content 部分一致にフォールバック
 *
 * See: features/command_copipe.feature
 * See: features/user_copipe.feature
 * See: supabase/migrations/00032_copipe_entries.sql
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** copipe_entries テーブルの DB レコード（snake_case）*/
interface CopipeEntryRow {
	id: number;
	name: string;
	content: string;
	created_at: string;
}

/** コピペエントリのドメインモデル */
export interface CopipeEntry {
	id: number;
	name: string;
	content: string;
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// ICopipeRepository インターフェース（DI用）
// CopipeHandler が依存するインターフェースを定義する。
// BDDテスト時は InMemoryCopipeRepository でこれを実装する。
// ---------------------------------------------------------------------------

/**
 * CopipeRepository の依存インターフェース。
 * CopipeHandler に注入する。
 *
 * See: features/command_copipe.feature
 * See: features/user_copipe.feature @copipe
 */
export interface ICopipeRepository {
	/**
	 * ランダムに1件取得する。
	 * 両テーブル（copipe_entries + user_copipe_entries）の全件からランダム選択する。
	 * データが0件の場合は null を返す。
	 */
	findRandom(): Promise<CopipeEntry | null>;

	/**
	 * 名前で完全一致検索する。
	 * 両テーブルを検索し、ヒットした全エントリを配列で返す。
	 * 同名エントリが管理者データとユーザーデータで複数存在する場合がある。
	 * 一致しない場合は空配列を返す。
	 *
	 * See: features/user_copipe.feature @管理者データとユーザーデータで同名のコピペが存在する場合はランダムに1件表示される
	 *
	 * @param name - 検索する名前（完全一致）
	 */
	findByName(name: string): Promise<CopipeEntry[]>;

	/**
	 * 名前で部分一致検索する（完全一致を除く）。
	 * 両テーブルを検索し、完全一致したレコードは結果から除外する（完全一致優先ロジックのため）。
	 *
	 * @param name - 検索するキーワード（部分一致）
	 * @returns 部分一致したエントリの配列（完全一致は除外済み）
	 */
	findByNamePartial(name: string): Promise<CopipeEntry[]>;

	/**
	 * content（AA本文）で部分一致検索する。
	 * name 検索（完全一致・部分一致）で0件だった場合のフォールバックとして呼び出す。
	 *
	 * See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
	 * See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
	 *
	 * @param query - 検索するキーワード（content に対する部分一致）
	 * @returns 部分一致したエントリの配列
	 */
	findByContentPartial(query: string): Promise<CopipeEntry[]>;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToCopipeEntry(row: CopipeEntryRow): CopipeEntry {
	return {
		id: row.id,
		name: row.name,
		content: row.content,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数（Supabase実装）
// ---------------------------------------------------------------------------

/**
 * ランダムに1件のコピペエントリを取得する。
 *
 * copipe_entries と user_copipe_entries の両テーブルの全件を結合し、
 * アプリ側で Math.random() でランダム選択する。
 * 両テーブルとも数百件〜数千件程度のデータセットのため、全件取得のコストは許容範囲内。
 *
 * データが0件の場合は null を返す。
 *
 * See: features/command_copipe.feature @引数なしでランダムにAAが表示される
 * See: features/user_copipe.feature @ユーザー登録コピペが!copipeのランダム選択に含まれる
 *
 * @returns ランダムに選ばれたエントリ、またはデータなし時は null
 */
export async function findRandom(): Promise<CopipeEntry | null> {
	// 両テーブルを並列で全件取得してマージする
	const [adminResult, userResult] = await Promise.all([
		supabaseAdmin.from("copipe_entries").select("*"),
		supabaseAdmin.from("user_copipe_entries").select("*"),
	]);

	if (adminResult.error) {
		throw new Error(
			`CopipeRepository.findRandom (admin) failed: ${adminResult.error.message}`,
		);
	}
	if (userResult.error) {
		throw new Error(
			`CopipeRepository.findRandom (user) failed: ${userResult.error.message}`,
		);
	}

	// 両テーブルの結果をマージする
	const allEntries = [
		...(adminResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
		...(userResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
	];

	if (allEntries.length === 0) return null;

	// アプリ側でランダム選択する
	const index = Math.floor(Math.random() * allEntries.length);
	return allEntries[index];
}

/**
 * 名前で完全一致検索する。
 *
 * copipe_entries と user_copipe_entries の両テーブルを検索し、
 * ヒットした全エントリを配列で返す。
 * 管理者データとユーザーデータで同名エントリが複数存在する場合がある。
 *
 * See: features/command_copipe.feature @完全一致でAAが表示される
 * See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
 * See: features/user_copipe.feature @管理者データとユーザーデータで同名のコピペが存在する場合はランダムに1件表示される
 *
 * @param name - 検索する名前（完全一致）
 * @returns 完全一致したエントリの配列（0件の場合は空配列）
 */
export async function findByName(name: string): Promise<CopipeEntry[]> {
	// 両テーブルを並列で完全一致検索する
	const [adminResult, userResult] = await Promise.all([
		supabaseAdmin.from("copipe_entries").select("*").eq("name", name),
		supabaseAdmin.from("user_copipe_entries").select("*").eq("name", name),
	]);

	if (adminResult.error) {
		throw new Error(
			`CopipeRepository.findByName (admin) failed: ${adminResult.error.message}`,
		);
	}
	if (userResult.error) {
		throw new Error(
			`CopipeRepository.findByName (user) failed: ${userResult.error.message}`,
		);
	}

	// 両テーブルの結果をマージして返す
	return [
		...(adminResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
		...(userResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
	];
}

/**
 * 名前で部分一致検索する（完全一致を除く）。
 *
 * copipe_entries と user_copipe_entries の両テーブルを検索し、結果をマージして返す。
 * 完全一致したレコードは結果から除外する。
 * ハンドラは結果件数に基づいて表示方法を決定する:
 *   - 1件: 表示
 *   - 2件以上: ランダム1件 +「曖昧です（N件ヒット）」通知
 *   - 0件: content 部分一致にフォールバック
 *
 * See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
 * See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
 *
 * @param name - 検索するキーワード（部分一致）
 * @returns 部分一致したエントリの配列（完全一致は除外済み）
 */
export async function findByNamePartial(name: string): Promise<CopipeEntry[]> {
	// 両テーブルを並列で部分一致検索する（完全一致は除外）
	const [adminResult, userResult] = await Promise.all([
		supabaseAdmin
			.from("copipe_entries")
			.select("*")
			.like("name", `%${name}%`)
			.neq("name", name), // 完全一致を除外する
		supabaseAdmin
			.from("user_copipe_entries")
			.select("*")
			.like("name", `%${name}%`)
			.neq("name", name), // 完全一致を除外する
	]);

	if (adminResult.error) {
		throw new Error(
			`CopipeRepository.findByNamePartial (admin) failed: ${adminResult.error.message}`,
		);
	}
	if (userResult.error) {
		throw new Error(
			`CopipeRepository.findByNamePartial (user) failed: ${userResult.error.message}`,
		);
	}

	// 両テーブルの結果をマージして返す
	return [
		...(adminResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
		...(userResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
	];
}

/**
 * content（AA本文）で部分一致検索する。
 *
 * copipe_entries と user_copipe_entries の両テーブルを検索し、結果をマージして返す。
 * name 検索（完全一致・部分一致）で0件だった場合のフォールバック。
 * ハンドラは結果件数に基づいて表示方法を決定する:
 *   - 1件: 表示
 *   - 2件以上: ランダム1件 +「曖昧です（N件ヒット）」通知
 *   - 0件: 「見つかりません」エラー
 *
 * See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
 * See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
 * See: features/command_copipe.feature @一致するAAがない場合はエラーになる
 *
 * @param query - 検索するキーワード（content に対する部分一致）
 * @returns 部分一致したエントリの配列
 */
export async function findByContentPartial(
	query: string,
): Promise<CopipeEntry[]> {
	// 両テーブルを並列で content 部分一致検索する
	const [adminResult, userResult] = await Promise.all([
		supabaseAdmin
			.from("copipe_entries")
			.select("*")
			.like("content", `%${query}%`),
		supabaseAdmin
			.from("user_copipe_entries")
			.select("*")
			.like("content", `%${query}%`),
	]);

	if (adminResult.error) {
		throw new Error(
			`CopipeRepository.findByContentPartial (admin) failed: ${adminResult.error.message}`,
		);
	}
	if (userResult.error) {
		throw new Error(
			`CopipeRepository.findByContentPartial (user) failed: ${userResult.error.message}`,
		);
	}

	// 両テーブルの結果をマージして返す
	return [
		...(adminResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
		...(userResult.data ?? []).map((row) =>
			rowToCopipeEntry(row as CopipeEntryRow),
		),
	];
}
