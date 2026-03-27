/**
 * バズスコア算出ユーティリティ
 *
 * 収集バッチとキュレーションBOTが共有するバズスコア計算の純粋関数。
 * subject-txt.ts などの収集アダプターから import して使用する。
 *
 * See: features/curation_bot.feature ヘッダコメント（バズスコア算出式）
 * See: docs/architecture/components/bot.md §2.13.5 バズスコア算出式
 */

/**
 * バズスコアを算出する。
 *
 * 式: resCount / (elapsedHours + 2) ^ 1.5
 * - elapsedHours: スレッド番号（Unix タイムスタンプ秒）から現在時刻までの経過時間（時間単位）
 * - +2 はゼロ除算防止と新規スレッドのスコア調整
 *
 * See: features/curation_bot.feature ヘッダコメント（バズスコア算出式）
 * See: docs/architecture/components/bot.md §2.13.5 バズスコア算出式
 *
 * @param resCount - レス数（またはエンゲージメント数）
 * @param createdUnixTime - スレッド作成時刻（Unix タイムスタンプ秒）
 * @param nowMs - 現在時刻（ミリ秒）。省略時は Date.now() を使用
 * @returns バズスコア（0 以上の数値）
 */
export function calculateBuzzScore(
	resCount: number,
	createdUnixTime: number,
	nowMs: number = Date.now(),
): number {
	const elapsedHours = (nowMs / 1000 - createdUnixTime) / 3600;
	return resCount / (elapsedHours + 2) ** 1.5;
}
