/**
 * 単体テスト: mypage-display-rules.ts（マイページ表示ロジック）
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: features/user_registration.feature @仮ユーザーには PAT が表示されない
 * See: features/user_registration.feature @仮ユーザーは課金できない
 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
 * See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 */

import { describe, expect, it } from "vitest";
import type { MypageInfo } from "../../services/mypage-service";
import {
	buildPatCopyValue,
	canUpgrade,
	formatPatLastUsedAt,
	getAccountTypeLabel,
	getRegistrationMethodLabel,
	isPermanentUser,
	isTemporaryUser,
} from "../mypage-display-rules";

// ---------------------------------------------------------------------------
// テストデータファクトリー
// ---------------------------------------------------------------------------

/** 仮ユーザー用の MypageInfo を生成する。各テストで上書き可能なフィールドを引数で受け取る */
function makeTemporaryUser(overrides: Partial<MypageInfo> = {}): MypageInfo {
	return {
		userId: "user-id-temp",
		balance: 0,
		isPremium: false,
		username: null,
		streakDays: 0,
		registrationType: null,
		patToken: null,
		patLastUsedAt: null,
		grassCount: 0,
		grassIcon: "🌱",
		...overrides,
	};
}

/** 本登録済みユーザー（メール）用の MypageInfo を生成する */
function makePermanentEmailUser(
	overrides: Partial<MypageInfo> = {},
): MypageInfo {
	return {
		userId: "user-id-email",
		balance: 100,
		isPremium: false,
		username: null,
		streakDays: 5,
		registrationType: "email",
		patToken: "abcdef1234567890abcdef1234567890",
		patLastUsedAt: null,
		grassCount: 0,
		grassIcon: "🌱",
		...overrides,
	};
}

/** 本登録済みユーザー（Discord）用の MypageInfo を生成する */
function makePermanentDiscordUser(
	overrides: Partial<MypageInfo> = {},
): MypageInfo {
	return {
		userId: "user-id-discord",
		balance: 200,
		isPremium: false,
		username: "てすとユーザー",
		streakDays: 10,
		registrationType: "discord",
		patToken: "fedcba0987654321fedcba0987654321",
		patLastUsedAt: null,
		grassCount: 3,
		grassIcon: "🌿",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// ① isTemporaryUser — 仮ユーザー判定
// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
// ---------------------------------------------------------------------------

describe("isTemporaryUser", () => {
	it("registrationType が null なら true（仮ユーザー）", () => {
		expect(isTemporaryUser(makeTemporaryUser())).toBe(true);
	});

	it("registrationType が 'email' なら false（本登録済み）", () => {
		expect(isTemporaryUser(makePermanentEmailUser())).toBe(false);
	});

	it("registrationType が 'discord' なら false（本登録済み）", () => {
		expect(isTemporaryUser(makePermanentDiscordUser())).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// ② isPermanentUser — 本登録ユーザー判定
// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
// ---------------------------------------------------------------------------

describe("isPermanentUser", () => {
	it("registrationType が null なら false（仮ユーザー）", () => {
		expect(isPermanentUser(makeTemporaryUser())).toBe(false);
	});

	it("registrationType が 'email' なら true（本登録済み）", () => {
		expect(isPermanentUser(makePermanentEmailUser())).toBe(true);
	});

	it("registrationType が 'discord' なら true（本登録済み）", () => {
		expect(isPermanentUser(makePermanentDiscordUser())).toBe(true);
	});

	it("isTemporaryUser と isPermanentUser は常に逆の値を返す", () => {
		const temp = makeTemporaryUser();
		const perm = makePermanentEmailUser();
		expect(isTemporaryUser(temp)).toBe(!isPermanentUser(temp));
		expect(isTemporaryUser(perm)).toBe(!isPermanentUser(perm));
	});
});

// ---------------------------------------------------------------------------
// ③ getAccountTypeLabel — アカウント種別ラベル取得
// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
// ---------------------------------------------------------------------------

describe("getAccountTypeLabel", () => {
	it("仮ユーザーは '仮ユーザー' を返す", () => {
		expect(getAccountTypeLabel(makeTemporaryUser())).toBe("仮ユーザー");
	});

	it("本登録済みメールユーザーは '本登録ユーザー' を返す", () => {
		expect(getAccountTypeLabel(makePermanentEmailUser())).toBe(
			"本登録ユーザー",
		);
	});

	it("本登録済みDiscordユーザーは '本登録ユーザー' を返す", () => {
		expect(getAccountTypeLabel(makePermanentDiscordUser())).toBe(
			"本登録ユーザー",
		);
	});
});

// ---------------------------------------------------------------------------
// ④ getRegistrationMethodLabel — 認証方法ラベル取得
// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
// ---------------------------------------------------------------------------

describe("getRegistrationMethodLabel", () => {
	it("registrationType が 'email' なら 'メール' を返す", () => {
		expect(getRegistrationMethodLabel(makePermanentEmailUser())).toBe("メール");
	});

	it("registrationType が 'discord' なら 'Discord' を返す", () => {
		expect(getRegistrationMethodLabel(makePermanentDiscordUser())).toBe(
			"Discord",
		);
	});

	it("registrationType が null（仮ユーザー）なら null を返す", () => {
		expect(getRegistrationMethodLabel(makeTemporaryUser())).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// ⑤ buildPatCopyValue — PAT コピー文字列生成
// See: features/user_registration.feature @マイページでPATを確認できる
// See: features/user_registration.feature @仮ユーザーには PAT が表示されない
// ---------------------------------------------------------------------------

describe("buildPatCopyValue", () => {
	it("32文字の PAT トークンから '#pat_<token>' 形式の文字列を生成する", () => {
		const token = "abcdef1234567890abcdef1234567890";
		expect(buildPatCopyValue(token)).toBe(`#pat_${token}`);
	});

	it("別の PAT トークンでも正しく '#pat_<token>' 形式になる", () => {
		const token = "fedcba0987654321fedcba0987654321";
		expect(buildPatCopyValue(token)).toBe(`#pat_${token}`);
	});

	it("null（仮ユーザー）の場合は null を返す", () => {
		expect(buildPatCopyValue(null)).toBeNull();
	});

	it("空文字列の PAT トークンでも '#pat_' を返す（境界値）", () => {
		expect(buildPatCopyValue("")).toBe("#pat_");
	});

	it("特殊文字を含む文字列でも '#pat_<token>' 形式になる", () => {
		const token = "abc-123_xyz";
		expect(buildPatCopyValue(token)).toBe("#pat_abc-123_xyz");
	});
});

// ---------------------------------------------------------------------------
// ⑥ formatPatLastUsedAt — PAT 最終使用日時フォーマット
// See: features/user_registration.feature @マイページでPATを確認できる
// ---------------------------------------------------------------------------

describe("formatPatLastUsedAt", () => {
	it("null の場合は '未使用' を返す", () => {
		expect(formatPatLastUsedAt(null)).toBe("未使用");
	});

	it("ISO 8601 形式の日時文字列を日本語ロケール形式に変換する", () => {
		// ロケール依存のため、変換結果に "未使用" が含まれないこと・非空文字であることを検証する
		const result = formatPatLastUsedAt("2026-03-12T10:00:00+09:00");
		expect(result).not.toBe("未使用");
		expect(result.length).toBeGreaterThan(0);
	});

	it("異なる日時でも文字列を返す", () => {
		const result = formatPatLastUsedAt("2025-01-01T00:00:00Z");
		expect(typeof result).toBe("string");
		expect(result).not.toBe("未使用");
	});
});

// ---------------------------------------------------------------------------
// ⑦ canUpgrade — 課金ボタン有効判定
// See: features/user_registration.feature @仮ユーザーは課金できない
// See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
// See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
// ---------------------------------------------------------------------------

describe("canUpgrade", () => {
	it("本登録済み無料ユーザーは true（課金可能）", () => {
		expect(canUpgrade(makePermanentEmailUser({ isPremium: false }))).toBe(true);
	});

	it("本登録済みDiscordユーザーも true（課金可能）", () => {
		expect(canUpgrade(makePermanentDiscordUser({ isPremium: false }))).toBe(
			true,
		);
	});

	it("仮ユーザーは false（本登録が前提条件）", () => {
		expect(canUpgrade(makeTemporaryUser({ isPremium: false }))).toBe(false);
	});

	it("既に有料ユーザーの場合は false（課金不要）", () => {
		expect(canUpgrade(makePermanentEmailUser({ isPremium: true }))).toBe(false);
	});

	it("仮ユーザーかつ isPremium: true でも false（仮ユーザー制限が優先）", () => {
		// 通常は発生しないが、境界値として検証する
		expect(canUpgrade(makeTemporaryUser({ isPremium: true }))).toBe(false);
	});
});
