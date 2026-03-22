/**
 * ThemeService -- テーマ設定の保存
 * See: features/theme.feature
 */

import * as UserRepository from "../infrastructure/repositories/user-repository";

/**
 * ユーザーのテーマ・フォント設定を更新する。
 * バリデーションは呼び出し元（route.ts）で実施済みの前提。
 *
 * See: features/theme.feature @テーマ設定が保存される
 *
 * @param userId - 対象ユーザーの UUID
 * @param themeId - テーマID
 * @param fontId - フォントID
 */
export async function updateTheme(
	userId: string,
	themeId: string,
	fontId: string,
): Promise<void> {
	await UserRepository.updateTheme(userId, themeId, fontId);
}
