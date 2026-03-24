/**
 * テーマ・フォント定義
 * See: features/theme.feature
 * See: docs/architecture/architecture.md TDR-016
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface ThemeEntry {
	/** テーマID（DB保存値） */
	id: string;
	/** 表示名 */
	name: string;
	/** <html> or <body> に付与するCSSクラス名。デフォルトは空文字（クラスなし） */
	cssClass: string;
	/** 無料ユーザーが使用可能か */
	isFree: boolean;
}

/** フォントカテゴリ */
export type FontCategory = "system" | "gothic" | "serif" | "display";

/** カテゴリの表示名 */
export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
	system: "システムフォント",
	gothic: "ゴシック / サンセリフ",
	serif: "明朝 / セリフ",
	display: "個性派 / ディスプレイ",
};

/** カテゴリの表示順 */
export const FONT_CATEGORY_ORDER: readonly FontCategory[] = [
	"system",
	"gothic",
	"serif",
	"display",
] as const;

export interface FontEntry {
	/** フォントID（DB保存値） */
	id: string;
	/** 表示名 */
	name: string;
	/** CSS font-family 値（CSS変数 --bb-font-family に設定） */
	cssFontFamily: string;
	/** 無料ユーザーが使用可能か */
	isFree: boolean;
	/** カテゴリ */
	category: FontCategory;
	/** Google Fonts のファミリー名（Webフォント読み込み用）。null ならシステムフォント */
	googleFontFamily: string | null;
}

// ---------------------------------------------------------------------------
// カタログ定数
// ---------------------------------------------------------------------------

/**
 * テーマカタログ。
 * CSS変数定義: src/app/globals.css
 */
export const THEME_CATALOG: readonly ThemeEntry[] = [
	{ id: "default", name: "デフォルト", cssClass: "", isFree: true },
	{ id: "dark", name: "ダーク", cssClass: "dark", isFree: true },
	{ id: "ocean", name: "オーシャン", cssClass: "ocean", isFree: false },
	{ id: "forest", name: "フォレスト", cssClass: "forest", isFree: false },
	{ id: "sunset", name: "サンセット", cssClass: "sunset", isFree: false },
] as const;

/**
 * フォントカタログ。
 * システムフォントは無料、Webフォントは有料。
 * Google Fonts の日本語フォントを動的読み込みで提供する。
 */
export const FONT_CATALOG: readonly FontEntry[] = [
	// ===== システムフォント（無料） =====
	{
		id: "gothic",
		name: "ゴシック",
		cssFontFamily:
			"'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif",
		isFree: true,
		category: "system",
		googleFontFamily: null,
	},
	{
		id: "mincho",
		name: "明朝",
		cssFontFamily:
			"'Hiragino Mincho ProN', 'Noto Serif JP', 'Yu Mincho', serif",
		isFree: true,
		category: "system",
		googleFontFamily: null,
	},
	{
		id: "monospace",
		name: "等幅",
		cssFontFamily:
			"'Source Code Pro', 'Noto Sans Mono', 'Courier New', monospace",
		isFree: true,
		category: "system",
		googleFontFamily: null,
	},

	// ===== ゴシック / サンセリフ（有料・Google Fonts） =====
	{
		id: "noto-sans-jp",
		name: "Noto Sans JP",
		cssFontFamily: "'Noto Sans JP', sans-serif",
		isFree: false,
		category: "gothic",
		googleFontFamily: "Noto Sans JP",
	},
	{
		id: "zen-kaku-gothic-new",
		name: "Zen Kaku Gothic New",
		cssFontFamily: "'Zen Kaku Gothic New', sans-serif",
		isFree: false,
		category: "gothic",
		googleFontFamily: "Zen Kaku Gothic New",
	},
	{
		id: "m-plus-1p",
		name: "M PLUS 1p",
		cssFontFamily: "'M PLUS 1p', sans-serif",
		isFree: false,
		category: "gothic",
		googleFontFamily: "M PLUS 1p",
	},
	{
		id: "m-plus-rounded-1c",
		name: "M PLUS Rounded 1c",
		cssFontFamily: "'M PLUS Rounded 1c', sans-serif",
		isFree: false,
		category: "gothic",
		googleFontFamily: "M PLUS Rounded 1c",
	},
	{
		id: "zen-maru-gothic",
		name: "Zen Maru Gothic",
		cssFontFamily: "'Zen Maru Gothic', sans-serif",
		isFree: false,
		category: "gothic",
		googleFontFamily: "Zen Maru Gothic",
	},
	{
		id: "kosugi-maru",
		name: "Kosugi Maru",
		cssFontFamily: "'Kosugi Maru', sans-serif",
		isFree: false,
		category: "gothic",
		googleFontFamily: "Kosugi Maru",
	},

	// ===== 明朝 / セリフ（有料・Google Fonts） =====
	{
		id: "noto-serif-jp",
		name: "Noto Serif JP",
		cssFontFamily: "'Noto Serif JP', serif",
		isFree: false,
		category: "serif",
		googleFontFamily: "Noto Serif JP",
	},
	{
		id: "shippori-mincho",
		name: "Shippori Mincho",
		cssFontFamily: "'Shippori Mincho', serif",
		isFree: false,
		category: "serif",
		googleFontFamily: "Shippori Mincho",
	},
	{
		id: "zen-old-mincho",
		name: "Zen Old Mincho",
		cssFontFamily: "'Zen Old Mincho', serif",
		isFree: false,
		category: "serif",
		googleFontFamily: "Zen Old Mincho",
	},
	{
		id: "zen-antique",
		name: "Zen Antique",
		cssFontFamily: "'Zen Antique', serif",
		isFree: false,
		category: "serif",
		googleFontFamily: "Zen Antique",
	},
	{
		id: "kiwi-maru",
		name: "Kiwi Maru",
		cssFontFamily: "'Kiwi Maru', serif",
		isFree: false,
		category: "serif",
		googleFontFamily: "Kiwi Maru",
	},

	// ===== 個性派 / ディスプレイ（有料・Google Fonts） =====
	{
		id: "dotgothic16",
		name: "DotGothic16",
		cssFontFamily: "'DotGothic16', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "DotGothic16",
	},
	{
		id: "dela-gothic-one",
		name: "Dela Gothic One",
		cssFontFamily: "'Dela Gothic One', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "Dela Gothic One",
	},
	{
		id: "hachi-maru-pop",
		name: "Hachi Maru Pop",
		cssFontFamily: "'Hachi Maru Pop', cursive",
		isFree: false,
		category: "display",
		googleFontFamily: "Hachi Maru Pop",
	},
	{
		id: "yusei-magic",
		name: "Yusei Magic",
		cssFontFamily: "'Yusei Magic', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "Yusei Magic",
	},
	{
		id: "rocknroll-one",
		name: "RocknRoll One",
		cssFontFamily: "'RocknRoll One', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "RocknRoll One",
	},
	{
		id: "reggae-one",
		name: "Reggae One",
		cssFontFamily: "'Reggae One', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "Reggae One",
	},
	{
		id: "potta-one",
		name: "Potta One",
		cssFontFamily: "'Potta One', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "Potta One",
	},
	{
		id: "stick",
		name: "Stick",
		cssFontFamily: "'Stick', sans-serif",
		isFree: false,
		category: "display",
		googleFontFamily: "Stick",
	},
] as const;

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** テーマIDからエントリを取得。見つからない場合は null */
export function findTheme(themeId: string): ThemeEntry | null {
	return THEME_CATALOG.find((t) => t.id === themeId) ?? null;
}

/** フォントIDからエントリを取得。見つからない場合は null */
export function findFont(fontId: string): FontEntry | null {
	return FONT_CATALOG.find((f) => f.id === fontId) ?? null;
}

/** デフォルトテーマを返す */
export function getDefaultTheme(): ThemeEntry {
	return THEME_CATALOG[0];
}

/** デフォルトフォントを返す */
export function getDefaultFont(): FontEntry {
	return FONT_CATALOG[0];
}

/** カテゴリ別にフォントをグループ化して返す */
export function getFontsByCategory(): Map<FontCategory, FontEntry[]> {
	const map = new Map<FontCategory, FontEntry[]>();
	for (const cat of FONT_CATEGORY_ORDER) {
		map.set(
			cat,
			FONT_CATALOG.filter((f) => f.category === cat),
		);
	}
	return map;
}
