/**
 * CopipeRepository — copipe_entries テーブルへの CRUD/検索操作を担うリポジトリ
 *
 * !copipe コマンドの検索ロジック（優先順）:
 *   1. 引数なし → ランダム1件取得
 *   2. 引数あり → 完全一致を検索
 *   3. 完全一致なし → name 部分一致を検索
 *   4. name 一致なし → content 部分一致にフォールバック
 *
 * See: features/command_copipe.feature
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
 */
export interface ICopipeRepository {
	/**
	 * ランダムに1件取得する。
	 * データが0件の場合は null を返す。
	 */
	findRandom(): Promise<CopipeEntry | null>;

	/**
	 * 名前で完全一致検索する。
	 * 一致しない場合は null を返す。
	 *
	 * @param name - 検索する名前（完全一致）
	 */
	findByName(name: string): Promise<CopipeEntry | null>;

	/**
	 * 名前で部分一致検索する（完全一致を除く）。
	 * 完全一致したレコードは結果から除外する（完全一致優先ロジックのため）。
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
 * 全件取得後にアプリ側で Math.random() でランダム選択する。
 * PostgreSQL の ORDER BY random() は PostgREST 経由での指定が複雑なため、
 * アプリ側でランダム選択する方式を採用する。
 * copipe_entries は数百件程度の固定データセットのため、全件取得のコストは許容範囲内。
 *
 * データが0件の場合は null を返す。
 *
 * See: features/command_copipe.feature @引数なしでランダムにAAが表示される
 *
 * @returns ランダムに選ばれたエントリ、またはデータなし時は null
 */
export async function findRandom(): Promise<CopipeEntry | null> {
	// 全件取得してアプリ側でランダム選択する
	// seed データは数百件程度のため全件取得のコストは許容範囲内
	const { data, error } = await supabaseAdmin
		.from("copipe_entries")
		.select("*");

	if (error) {
		throw new Error(`CopipeRepository.findRandom failed: ${error.message}`);
	}

	if (!data || data.length === 0) return null;

	// アプリ側でランダム選択する
	const index = Math.floor(Math.random() * data.length);
	return rowToCopipeEntry(data[index] as CopipeEntryRow);
}

/**
 * 名前で完全一致検索する。
 *
 * 完全一致は部分一致よりも優先される（検索ロジック §2）。
 * 一致するエントリがない場合は null を返す。
 *
 * See: features/command_copipe.feature @完全一致でAAが表示される
 * See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
 *
 * @param name - 検索する名前（完全一致）
 * @returns 完全一致したエントリ、またはなければ null
 */
export async function findByName(name: string): Promise<CopipeEntry | null> {
	const { data, error } = await supabaseAdmin
		.from("copipe_entries")
		.select("*")
		.eq("name", name)
		.maybeSingle();

	if (error) {
		throw new Error(`CopipeRepository.findByName failed: ${error.message}`);
	}

	return data ? rowToCopipeEntry(data as CopipeEntryRow) : null;
}

/**
 * 名前で部分一致検索する（完全一致を除く）。
 *
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
	const { data, error } = await supabaseAdmin
		.from("copipe_entries")
		.select("*")
		.like("name", `%${name}%`)
		.neq("name", name); // 完全一致を除外する（完全一致優先ロジックのため）

	if (error) {
		throw new Error(
			`CopipeRepository.findByNamePartial failed: ${error.message}`,
		);
	}

	return (data ?? []).map((row) => rowToCopipeEntry(row as CopipeEntryRow));
}

/**
 * content（AA本文）で部分一致検索する。
 *
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
	const { data, error } = await supabaseAdmin
		.from("copipe_entries")
		.select("*")
		.like("content", `%${query}%`);

	if (error) {
		throw new Error(
			`CopipeRepository.findByContentPartial failed: ${error.message}`,
		);
	}

	return (data ?? []).map((row) => rowToCopipeEntry(row as CopipeEntryRow));
}
