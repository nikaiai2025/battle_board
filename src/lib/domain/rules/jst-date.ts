/**
 * JST日付変換ユーティリティ
 *
 * 日付境界はJST 0:00 を基準とする。
 * collection-job.ts / ThreadCreatorBehaviorStrategy から共有される純粋関数。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5 日付境界はJST 0:00
 */

/**
 * Date オブジェクトから JST の日付文字列 (YYYY-MM-DD) を返す。
 * タイムゾーンオフセット +9時間 を適用する。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5 日付境界はJST 0:00
 *
 * @param date - 変換対象の Date オブジェクト
 * @returns JST の日付文字列（YYYY-MM-DD 形式）
 */
export function getJstDateString(date: Date): string {
	const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
	return jst.toISOString().slice(0, 10);
}
