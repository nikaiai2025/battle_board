/**
 * テーマ解決ルール -- ユーザー設定からの有効テーマ/フォント決定
 * See: features/theme.feature
 */

import {
	type FontEntry,
	findFont,
	findTheme,
	getDefaultFont,
	getDefaultTheme,
	type ThemeEntry,
} from "../models/theme";

/**
 * ユーザーのテーマ設定を解決する。
 * - themeId が null -> デフォルト
 * - カタログに存在しない -> デフォルト
 * - 有料テーマ + 無料ユーザー -> デフォルトにフォールバック
 *
 * See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
 * See: features/theme.feature @未設定のユーザーにはデフォルトテーマとゴシックフォントが適用される
 */
export function resolveTheme(
	themeId: string | null,
	isPremium: boolean,
): ThemeEntry {
	if (!themeId) return getDefaultTheme();
	const entry = findTheme(themeId);
	if (!entry) return getDefaultTheme();
	if (!entry.isFree && !isPremium) return getDefaultTheme();
	return entry;
}

/**
 * ユーザーのフォント設定を解決する。
 * - fontId が null -> デフォルト（ゴシック）
 * - カタログに存在しない -> デフォルト
 * - 有料フォント + 無料ユーザー -> デフォルトにフォールバック
 *
 * See: features/theme.feature @有料設定中のユーザーが無料に戻るとデフォルトに戻る
 */
export function resolveFont(
	fontId: string | null,
	isPremium: boolean,
): FontEntry {
	if (!fontId) return getDefaultFont();
	const entry = findFont(fontId);
	if (!entry) return getDefaultFont();
	if (!entry.isFree && !isPremium) return getDefaultFont();
	return entry;
}

/**
 * テーマ選択のバリデーション。
 * API側で使用。カタログ存在チェック + 権限チェック。
 */
export type ThemeValidationResult =
	| { valid: true }
	| {
			valid: false;
			error: string;
			code: "INVALID_THEME" | "INVALID_FONT" | "PREMIUM_REQUIRED";
	  };

export function validateThemeSelection(
	themeId: string,
	fontId: string,
	isPremium: boolean,
): ThemeValidationResult {
	const theme = findTheme(themeId);
	if (!theme)
		return {
			valid: false,
			error: "指定されたテーマは存在しません",
			code: "INVALID_THEME",
		};

	const font = findFont(fontId);
	if (!font)
		return {
			valid: false,
			error: "指定されたフォントは存在しません",
			code: "INVALID_FONT",
		};

	if ((!theme.isFree || !font.isFree) && !isPremium) {
		return {
			valid: false,
			error: "有料テーマ/フォントは有料ユーザーのみ利用できます",
			code: "PREMIUM_REQUIRED",
		};
	}

	return { valid: true };
}
