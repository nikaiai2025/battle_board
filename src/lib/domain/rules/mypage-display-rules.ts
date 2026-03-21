/**
 * マイページ表示ロジック — 純粋関数
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: features/user_registration.feature @仮ユーザーには PAT が表示されない
 * See: features/user_registration.feature @仮ユーザーは課金できない
 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
 * See: docs/architecture/components/user-registration.md § 4.2 認証状態
 * See: docs/architecture/components/user-registration.md § 8.2 マイページ表示
 *
 * 責務:
 *   - MypageInfo から表示ラベル・表示制御フラグを算出する純粋関数群
 *   - 外部依存なし（テスト容易）
 *   - UIコンポーネント（mypage/page.tsx）および単体テストから利用される
 */

import type { MypageInfo } from "../../services/mypage-service";
import { formatDateTime } from "../../utils/date";

// ---------------------------------------------------------------------------
// ユーザー種別判定
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーかどうかを判定する。
 * registrationType が null の場合は本登録未完了（仮ユーザー）と見なす。
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: docs/architecture/components/user-registration.md §2 用語定義
 *
 * @param info - マイページ基本情報
 * @returns 仮ユーザーであれば true
 */
export function isTemporaryUser(info: MypageInfo): boolean {
	return info.registrationType === null;
}

/**
 * 本登録ユーザーかどうかを判定する。
 * registrationType が 'email' または 'discord' の場合は本登録ユーザー。
 *
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: docs/architecture/components/user-registration.md §2 用語定義
 *
 * @param info - マイページ基本情報
 * @returns 本登録ユーザーであれば true
 */
export function isPermanentUser(info: MypageInfo): boolean {
	return info.registrationType !== null;
}

// ---------------------------------------------------------------------------
// ラベル生成
// ---------------------------------------------------------------------------

/**
 * アカウント種別ラベルを取得する。
 * - 仮ユーザー: "仮ユーザー"
 * - 本登録ユーザー: "本登録ユーザー"
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 *
 * @param info - マイページ基本情報
 * @returns アカウント種別ラベル文字列
 */
export function getAccountTypeLabel(info: MypageInfo): string {
	return isTemporaryUser(info) ? "仮ユーザー" : "本登録ユーザー";
}

/**
 * 認証方法ラベルを取得する。
 * - 'email': "メール"
 * - 'discord': "Discord"
 * - null（仮ユーザー）: null
 *
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 *
 * @param info - マイページ基本情報
 * @returns 認証方法ラベル文字列、仮ユーザーは null
 */
export function getRegistrationMethodLabel(info: MypageInfo): string | null {
	if (info.registrationType === "email") return "メール";
	if (info.registrationType === "discord") return "Discord";
	return null;
}

// ---------------------------------------------------------------------------
// PAT 操作
// ---------------------------------------------------------------------------

/**
 * 専ブラ用の PAT コピー文字列を生成する。
 * 形式: "#pat_<32文字hex>"
 *
 * See: docs/architecture/components/user-registration.md §8.2 マイページ表示
 * See: docs/architecture/components/user-registration.md §6 認証判定フロー (mail欄パース)
 * See: features/user_registration.feature @マイページでPATを確認できる
 *
 * @param patToken - PAT トークン文字列。null の場合は null を返す（仮ユーザー）
 * @returns "#pat_<token>" 形式の文字列、または null
 */
export function buildPatCopyValue(patToken: string | null): string | null {
	if (patToken === null) return null;
	return `#pat_${patToken}`;
}

/**
 * PAT 最終使用日時を表示用文字列にフォーマットする。
 * null の場合は「未使用」を返す。
 *
 * JST固定で出力する（formatDateTime と同一フォーマット）。
 *
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: docs/architecture/components/user-registration.md §8.2 マイページ表示
 * See: src/lib/utils/date.ts > formatDateTime
 *
 * @param patLastUsedAt - PAT 最終使用日時（ISO 8601 文字列）または null
 * @returns JST固定の日時文字列（YYYY/MM/DD(ddd) HH:mm:ss 形式）、または「未使用」
 */
export function formatPatLastUsedAt(patLastUsedAt: string | null): string {
	if (patLastUsedAt === null) return "未使用";
	return formatDateTime(patLastUsedAt);
}

// ---------------------------------------------------------------------------
// 課金ボタン制御
// ---------------------------------------------------------------------------

/**
 * 課金ボタンが有効かどうかを判定する。
 *
 * 有効条件:
 *   - 本登録済み（supabase_auth_id が非 null に相当する registrationType が非 null）
 *   - かつ 無料ユーザー（isPremium = false）
 *
 * See: features/user_registration.feature @仮ユーザーは課金できない
 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
 * See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 * See: docs/architecture/components/user-registration.md §4.3 課金制約
 *
 * @param info - マイページ基本情報
 * @returns 課金ボタンが有効であれば true
 */
export function canUpgrade(info: MypageInfo): boolean {
	// 本登録が前提条件（仮ユーザーは課金不可）
	if (isTemporaryUser(info)) return false;
	// 既に有料ユーザーの場合は課金不要
	if (info.isPremium) return false;
	return true;
}
