/**
 * 草コマンド(!w) ドメインルール: アイコン決定・メッセージ生成
 *
 * 外部依存なしの純粋関数。テスト容易性確保のため domain/rules/ に配置する。
 *
 * See: features/reactions.feature §成長ビジュアル
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §3.1
 */

// ---------------------------------------------------------------------------
// 定数定義
// ---------------------------------------------------------------------------

/**
 * 草アイコンの定義。草カウントを CYCLE_LENGTH で割った余りを STEP_SIZE で
 * 区切った段階に応じてアイコンが決定する。
 *
 * See: features/reactions.feature §成長ビジュアル（10刻みループ）
 */
const GRASS_ICONS = ["🌱", "🌿", "🌳", "🍎", "🫘"] as const;

/** 1サイクルの本数(50本でループ) */
const CYCLE_LENGTH = 50;

/** 1段階あたりの本数 */
const STEP_SIZE = 10;

// ---------------------------------------------------------------------------
// 公開関数
// ---------------------------------------------------------------------------

/**
 * 草カウントに応じたアイコンを返す。
 *
 * 50本で1周するループ構造:
 *   0-9:   🌱
 *   10-19: 🌿
 *   20-29: 🌳
 *   30-39: 🍎
 *   40-49: 🫘
 *   50-59: 🌱 (ループ)
 *
 * See: features/reactions.feature §成長ビジュアル（10刻みループ）
 *
 * @param grassCount - 草の通算本数(0以上の整数)
 * @returns 対応するアイコン文字列
 */
export function getGrassIcon(grassCount: number): string {
	const remainder = grassCount % CYCLE_LENGTH;
	const index = Math.floor(remainder / STEP_SIZE);
	return GRASS_ICONS[index];
}

/**
 * 草システムメッセージを生成する。
 *
 * フォーマット: ">>N (ID:xxxxxxxx) に草 ICON(計M本)"
 *
 * See: features/reactions.feature §草を生やした結果がレス末尾にマージ表示される
 *
 * @param targetPostNumber - 対象レスのレス番号
 * @param targetDailyId    - 対象レスの書き込み主のdailyId
 * @param newGrassCount    - 付与後の草カウント(通算)
 * @returns システムメッセージ文字列
 */
export function formatGrassMessage(
	targetPostNumber: number,
	targetDailyId: string,
	newGrassCount: number,
): string {
	const icon = getGrassIcon(newGrassCount);
	return `>>${targetPostNumber} (ID:${targetDailyId}) に草 ${icon}(計${newGrassCount}本)`;
}
