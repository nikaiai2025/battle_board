/**
 * テーマ定義
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

export interface FontEntry {
	/** フォントID（DB保存値） */
	id: string;
	/** 表示名 */
	name: string;
	/** CSS font-family 値（CSS変数 --bb-font-family に設定） */
	cssFontFamily: string;
	/** 無料ユーザーが使用可能か */
	isFree: boolean;
}

// ---------------------------------------------------------------------------
// カタログ定数
// ---------------------------------------------------------------------------

/**
 * テーマカタログ。
 * 段階1: default, dark のみCSS実装済み。有料テーマはカタログ定義のみ。
 * 段階2: 有料テーマのCSS変数を globals.css に追加して有効化する。
 */
export const THEME_CATALOG: readonly ThemeEntry[] = [
	{ id: "default", name: "デフォルト", cssClass: "", isFree: true },
	{ id: "dark", name: "ダーク", cssClass: "dark", isFree: true },
	// --- 段階2で CSS を追加する有料テーマ（カタログ定義のみ） ---
	{ id: "ocean", name: "オーシャン", cssClass: "ocean", isFree: false },
	{ id: "forest", name: "フォレスト", cssClass: "forest", isFree: false },
	{ id: "sunset", name: "サンセット", cssClass: "sunset", isFree: false },
] as const;

/**
 * フォントカタログ。
 * 段階1: gothic のみ。有料フォントはカタログ定義のみ。
 */
export const FONT_CATALOG: readonly FontEntry[] = [
	{
		id: "gothic",
		name: "ゴシック",
		cssFontFamily:
			"'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif",
		isFree: true,
	},
	// --- 段階2で有効化する有料フォント（カタログ定義のみ） ---
	{
		id: "mincho",
		name: "明朝",
		cssFontFamily:
			"'Hiragino Mincho ProN', 'Noto Serif JP', 'Yu Mincho', serif",
		isFree: false,
	},
	{
		id: "monospace",
		name: "等幅",
		cssFontFamily:
			"'Source Code Pro', 'Noto Sans Mono', 'Courier New', monospace",
		isFree: false,
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
