/**
 * !newspaper コマンドで使用するカテゴリ定数。
 *
 * feature で定義された 7 カテゴリをそのまま使用する。
 * NewspaperHandler がランダム選択し、payload に保存する。
 *
 * See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §2.4
 */

export const NEWSPAPER_CATEGORIES = [
	"芸能",
	"World",
	"IT",
	"スポーツ",
	"経済",
	"科学",
	"エンタメ",
] as const;

export type NewspaperCategory = (typeof NEWSPAPER_CATEGORIES)[number];

/**
 * !newspaper で使用する AI モデル ID。
 *
 * Gemini 2.5 Flash を使用する。Gemini 3 系は無料 API キーで
 * Google Search Grounding が利用不可（429 エラー）のため使用しない。
 *
 * See: docs/architecture/architecture.md TDR-015
 */
export const NEWSPAPER_MODEL_ID = "gemini-2.5-flash";
