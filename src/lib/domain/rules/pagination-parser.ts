/**
 * pagination-parser — ページネーション範囲パーサー（純粋関数）
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.3 範囲パーサー（純粋関数）
 *
 * 責務:
 *   - URL のページネーションセグメント文字列を PaginationRange に変換する
 *   - 外部依存なし（純粋関数）
 *   - 不正な値は { type: 'default' } にフォールバックする
 *
 * パースルール:
 *   - undefined → { type: 'default' }（最新50件）
 *   - "1-100"   → { type: 'range', start: 1, end: 100 }
 *   - "l100"    → { type: 'latest', count: 100 }
 *   - 不正な値  → { type: 'default' } にフォールバック
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * ページネーション範囲を表す型。
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.3
 */
export interface PaginationRange {
	/** 表示モード */
	type: "default" | "range" | "latest";
	/** range 時のみ: 開始レス番号（1始まり） */
	start?: number;
	/** range 時のみ: 終了レス番号 */
	end?: number;
	/** latest 時のみ: 最新N件 */
	count?: number;
}

// ---------------------------------------------------------------------------
// フォールバック値
// ---------------------------------------------------------------------------

/** デフォルト表示（最新50件）を表すフォールバック値 */
const DEFAULT_RANGE: PaginationRange = { type: "default" };

// ---------------------------------------------------------------------------
// パーサー本体
// ---------------------------------------------------------------------------

/**
 * URL のページネーションセグメント文字列を PaginationRange に変換する。
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.3
 *
 * @param segment - URLセグメント文字列（例: "1-100", "l100"）。省略可能
 * @returns PaginationRange オブジェクト
 */
export function parsePaginationRange(segment?: string): PaginationRange {
	// undefined または空文字列はデフォルトにフォールバック
	if (segment === undefined || segment === "") {
		return DEFAULT_RANGE;
	}

	// latest 形式: 先頭が小文字 "l" で始まり、後続が正の整数
	if (segment.startsWith("l")) {
		return parseLatest(segment);
	}

	// range 形式: "N-M" パターン（ハイフン区切りの2つの正整数）
	if (segment.includes("-")) {
		return parseRange(segment);
	}

	// その他: フォールバック
	return DEFAULT_RANGE;
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: latest 形式パース
// ---------------------------------------------------------------------------

/**
 * "lN" 形式をパースして PaginationRange を返す。
 * 不正な場合は DEFAULT_RANGE を返す。
 *
 * 有効条件:
 *   - "l" に続く文字列が整数（1以上）である
 *
 * See: features/thread.feature @pagination - "l100" → 最新100件
 */
function parseLatest(segment: string): PaginationRange {
	const countStr = segment.slice(1); // "l" を除いた部分

	// 空文字、整数でない、または0以下はフォールバック
	const count = parsePositiveInteger(countStr);
	if (count === null) {
		return DEFAULT_RANGE;
	}

	return { type: "latest", count };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: range 形式パース
// ---------------------------------------------------------------------------

/**
 * "N-M" 形式をパースして PaginationRange を返す。
 * 不正な場合は DEFAULT_RANGE を返す。
 *
 * 有効条件:
 *   - ハイフンが1つだけある
 *   - start, end がともに1以上の正整数
 *   - start <= end（逆転禁止）
 *
 * See: features/thread.feature @pagination - "1-100" → レス1〜100
 */
function parseRange(segment: string): PaginationRange {
	const parts = segment.split("-");

	// ハイフンが1つだけ → parts.length === 2
	if (parts.length !== 2) {
		return DEFAULT_RANGE;
	}

	const start = parsePositiveInteger(parts[0]);
	const end = parsePositiveInteger(parts[1]);

	// どちらかが不正、または範囲逆転（start > end）はフォールバック
	if (start === null || end === null || start > end) {
		return DEFAULT_RANGE;
	}

	return { type: "range", start, end };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: 正の整数パース
// ---------------------------------------------------------------------------

/**
 * 文字列を正の整数（1以上）に変換する。
 * 変換できない場合、または0以下の場合は null を返す。
 *
 * 制約:
 *   - 小数点を含む文字列は拒否する（"1.5" → null）
 *   - 先頭・末尾のスペースは拒否する（Number("1 ") が1を返すため明示的にチェック）
 *   - 0 は拒否する（レス番号は1始まり）
 */
function parsePositiveInteger(str: string): number | null {
	// 空文字列は拒否
	if (str === "") return null;

	// スペース、ドット、その他の数字以外の文字を含む場合は拒否
	// 正規表現: 1以上の十進数字のみ
	if (!/^\d+$/.test(str)) return null;

	const num = Number(str);

	// 0以下はレス番号として無効
	if (num <= 0) return null;

	return num;
}
