/**
 * 日時ユーティリティ — JST固定フォーマット
 *
 * サーバー（Cloudflare Workers: UTC）とクライアント（ブラウザ: 任意TZ）の
 * 両方で同一の JST 日時文字列を出力し、React hydration mismatch を防ぐ。
 *
 * 方針: UTC メソッド + 9時間オフセットで JST を計算する。
 * タイムゾーン依存メソッド（getFullYear, getMonth 等）は一切使用しない。
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/specs/screens/thread-view.yaml > post-datetime > format
 * See: tmp/workers/bdd-architect_TASK-204/analysis.md §4 修正方針
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 曜日の表示名（日本語）。インデックスは getUTCDay() の戻り値（0=日）に対応する */
export const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ---------------------------------------------------------------------------
// ユーティリティ関数
// ---------------------------------------------------------------------------

/**
 * Date を JST 変換済みの Date オブジェクトとして返す。
 *
 * UTCメソッドで取得することにより、環境非依存の JST 日時を算出できる。
 * DatFormatter の .SS（ミリ秒）を含む箇所で利用する。
 *
 * @param date - 変換元 Date オブジェクト
 * @returns UTC + 9時間分オフセットされた Date（UTCメソッドで JST として読む用途）
 */
export function toJSTDate(date: Date): Date {
	return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * 日時を YYYY/MM/DD(ddd) HH:mm:ss 形式（JST固定）にフォーマットする。
 *
 * UTC メソッド + 9時間オフセットで JST を計算することで、
 * サーバー（Cloudflare Workers: UTC）とクライアント（ブラウザ: 任意TZ）の
 * 両方で同一の JST 日時文字列を出力し、React hydration mismatch を防ぐ。
 *
 * タイムゾーン依存メソッド（getFullYear 等）は一切使用しない。
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/specs/screens/thread-view.yaml > post-datetime > format
 * See: tmp/workers/bdd-architect_TASK-204/analysis.md §4 修正方針
 *
 * @param dateStr - ISO8601形式の日時文字列、またはDateオブジェクト
 * @returns フォーマット済み日時文字列（JST固定）。例: "2026/03/20(金) 08:45:58"
 */
export function formatDateTime(dateStr: string | Date): string {
	const jst = toJSTDate(
		typeof dateStr === "string" ? new Date(dateStr) : dateStr,
	);

	const year = jst.getUTCFullYear();
	const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
	const day = String(jst.getUTCDate()).padStart(2, "0");
	const dayName = DAY_NAMES[jst.getUTCDay()];
	const hours = String(jst.getUTCHours()).padStart(2, "0");
	const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
	const seconds = String(jst.getUTCSeconds()).padStart(2, "0");

	return `${year}/${month}/${day}(${dayName}) ${hours}:${minutes}:${seconds}`;
}
