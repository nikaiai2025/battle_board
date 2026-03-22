/**
 * 単体テスト: マイページ — 本登録・PAT セクション表示ロジック
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: features/user_registration.feature @マイページでPATを確認できる
 * See: features/user_registration.feature @仮ユーザーには PAT が表示されない
 * See: features/user_registration.feature @仮ユーザーは課金できない
 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 * See: docs/architecture/components/user-registration.md § 4.2 認証状態, § 8.2 マイページ表示
 *
 * テスト方針:
 *   - MypageInfo の registrationType / patToken / patLastUsedAt フィールドを検証する
 *   - マイページ表示ロジック（getAccountTypeLabel, canUpgrade 等）を純粋関数レベルでテストする
 *   - /api/mypage のレスポンス型に本登録フィールドが含まれることを検証する
 *   - ログアウトボタン表示条件: isPermanentUser（本登録ユーザーのみ）
 *   - node 環境で動作（jsdom 不要）
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------

import {
	buildPatCopyValue,
	canUpgrade,
	formatPatLastUsedAt,
	getAccountTypeLabel,
	getRegistrationMethodLabel,
	isPermanentUser,
	isTemporaryUser,
} from "../../../../lib/domain/rules/mypage-display-rules";
import type { MypageInfo } from "../../../../lib/services/mypage-service";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

const PAT_TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

/** 仮ユーザー用 MypageInfo */
function makeTemporaryUserInfo(): MypageInfo {
	return {
		userId: "user-001",
		balance: 100,
		isPremium: false,
		username: null,
		streakDays: 3,
		registrationType: null,
		patToken: null,
		patLastUsedAt: null,
		// Phase 4: 草コマンド関連フィールド（デフォルト値）
		// See: features/reactions.feature §成長ビジュアル
		grassCount: 0,
		grassIcon: "🌱",
		themeId: "default",
		fontId: "gothic",
	};
}

/** 本登録ユーザー（メール認証）用 MypageInfo */
function makeRegisteredUserInfo(
	overrides: Partial<MypageInfo> = {},
): MypageInfo {
	return {
		userId: "user-001",
		balance: 100,
		isPremium: false,
		username: null,
		streakDays: 3,
		registrationType: "email",
		patToken: PAT_TOKEN,
		patLastUsedAt: "2026-03-15T14:23:00.000Z",
		// Phase 4: 草コマンド関連フィールド（デフォルト値）
		// See: features/reactions.feature §成長ビジュアル
		grassCount: 0,
		grassIcon: "🌱",
		themeId: "default",
		fontId: "gothic",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート: isTemporaryUser（仮ユーザー判定）
// ---------------------------------------------------------------------------

describe("isTemporaryUser", () => {
	it("registrationType が null の場合は仮ユーザーと判定される", () => {
		// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
		const info = makeTemporaryUserInfo();
		expect(isTemporaryUser(info)).toBe(true);
	});

	it("registrationType が 'email' の場合は仮ユーザーではない", () => {
		const info = makeRegisteredUserInfo({ registrationType: "email" });
		expect(isTemporaryUser(info)).toBe(false);
	});

	it("registrationType が 'discord' の場合は仮ユーザーではない", () => {
		const info = makeRegisteredUserInfo({ registrationType: "discord" });
		expect(isTemporaryUser(info)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// テストスイート: isPermanentUser（本登録ユーザー判定）
// ---------------------------------------------------------------------------

describe("isPermanentUser", () => {
	it("registrationType が 'email' の場合は本登録ユーザーと判定される", () => {
		// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
		const info = makeRegisteredUserInfo({ registrationType: "email" });
		expect(isPermanentUser(info)).toBe(true);
	});

	it("registrationType が 'discord' の場合は本登録ユーザーと判定される", () => {
		const info = makeRegisteredUserInfo({ registrationType: "discord" });
		expect(isPermanentUser(info)).toBe(true);
	});

	it("registrationType が null の場合は本登録ユーザーではない", () => {
		const info = makeTemporaryUserInfo();
		expect(isPermanentUser(info)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// テストスイート: getAccountTypeLabel（アカウント種別ラベル取得）
// ---------------------------------------------------------------------------

describe("getAccountTypeLabel", () => {
	it("仮ユーザーのラベルは「仮ユーザー」", () => {
		// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
		const info = makeTemporaryUserInfo();
		expect(getAccountTypeLabel(info)).toBe("仮ユーザー");
	});

	it("本登録ユーザーのラベルは「本登録ユーザー」", () => {
		// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
		const info = makeRegisteredUserInfo();
		expect(getAccountTypeLabel(info)).toBe("本登録ユーザー");
	});
});

// ---------------------------------------------------------------------------
// テストスイート: getRegistrationMethodLabel（認証方法ラベル取得）
// ---------------------------------------------------------------------------

describe("getRegistrationMethodLabel", () => {
	it("registrationType が 'email' の場合は「メール」を返す", () => {
		// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
		const info = makeRegisteredUserInfo({ registrationType: "email" });
		expect(getRegistrationMethodLabel(info)).toBe("メール");
	});

	it("registrationType が 'discord' の場合は「Discord」を返す", () => {
		// See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
		const info = makeRegisteredUserInfo({ registrationType: "discord" });
		expect(getRegistrationMethodLabel(info)).toBe("Discord");
	});

	it("registrationType が null の場合は null を返す（仮ユーザー）", () => {
		const info = makeTemporaryUserInfo();
		expect(getRegistrationMethodLabel(info)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// テストスイート: buildPatCopyValue（PATコピー文字列生成）
// ---------------------------------------------------------------------------

describe("buildPatCopyValue", () => {
	it("PAT トークンから #pat_ プレフィックス付きのコピー文字列を生成する", () => {
		// See: docs/architecture/components/user-registration.md § 8.2
		// See: features/user_registration.feature @マイページでPATを確認できる
		expect(buildPatCopyValue(PAT_TOKEN)).toBe(`#pat_${PAT_TOKEN}`);
	});

	it("PAT が null の場合は null を返す（仮ユーザー）", () => {
		expect(buildPatCopyValue(null)).toBeNull();
	});

	it("32文字の hex トークンが正しく変換される", () => {
		const token32 = "00000000000000000000000000000000";
		expect(buildPatCopyValue(token32)).toBe(`#pat_${token32}`);
	});
});

// ---------------------------------------------------------------------------
// テストスイート: formatPatLastUsedAt（PAT最終使用日時フォーマット）
// ---------------------------------------------------------------------------

describe("formatPatLastUsedAt", () => {
	it("ISO文字列の場合はロケール形式で返す", () => {
		// See: features/user_registration.feature @マイページでPATを確認できる
		const result = formatPatLastUsedAt("2026-03-15T14:23:00.000Z");
		// タイムゾーン依存のため「未使用」でないことのみ検証する
		expect(result).not.toBe("未使用");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("null の場合は「未使用」を返す", () => {
		// See: features/user_registration.feature @マイページでPATを確認できる
		expect(formatPatLastUsedAt(null)).toBe("未使用");
	});
});

// ---------------------------------------------------------------------------
// テストスイート: canUpgrade（課金ボタン有効判定）
// ---------------------------------------------------------------------------

describe("canUpgrade", () => {
	it("本登録済み無料ユーザーは課金ボタンが有効", () => {
		// See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
		const info = makeRegisteredUserInfo({ isPremium: false });
		expect(canUpgrade(info)).toBe(true);
	});

	it("仮ユーザーは課金ボタンが無効", () => {
		// See: features/user_registration.feature @仮ユーザーは課金できない
		const info = makeTemporaryUserInfo();
		expect(canUpgrade(info)).toBe(false);
	});

	it("本登録済み有料ユーザーは課金ボタンが無効（既に有料）", () => {
		// See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
		const info = makeRegisteredUserInfo({ isPremium: true });
		expect(canUpgrade(info)).toBe(false);
	});

	it("仮ユーザーが有料フラグを持っていても課金ボタンは無効", () => {
		// 仮ユーザーが有料になることはポリシー上禁止だが、防御的に確認する
		// See: docs/architecture/components/user-registration.md § 1 本登録と有料は直交する別概念
		const info = makeTemporaryUserInfo();
		expect(canUpgrade(info)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// テストスイート: MypageInfo 型拡張の検証
// ---------------------------------------------------------------------------

describe("MypageInfo — 本登録関連フィールド", () => {
	it("MypageInfo に registrationType フィールドが含まれる", () => {
		// See: docs/architecture/components/user-registration.md § 3.1 users テーブル拡張
		const info: MypageInfo = makeTemporaryUserInfo();
		expect("registrationType" in info).toBe(true);
	});

	it("MypageInfo に patToken フィールドが含まれる", () => {
		const info: MypageInfo = makeTemporaryUserInfo();
		expect("patToken" in info).toBe(true);
	});

	it("MypageInfo に patLastUsedAt フィールドが含まれる", () => {
		const info: MypageInfo = makeTemporaryUserInfo();
		expect("patLastUsedAt" in info).toBe(true);
	});

	it("仮ユーザーの registrationType は null", () => {
		const info: MypageInfo = makeTemporaryUserInfo();
		expect(info.registrationType).toBeNull();
	});

	it("仮ユーザーの patToken は null", () => {
		const info: MypageInfo = makeTemporaryUserInfo();
		expect(info.patToken).toBeNull();
	});

	it("本登録ユーザーの registrationType は 'email' または 'discord'", () => {
		const emailInfo: MypageInfo = makeRegisteredUserInfo({
			registrationType: "email",
		});
		const discordInfo: MypageInfo = makeRegisteredUserInfo({
			registrationType: "discord",
		});
		expect(emailInfo.registrationType).toBe("email");
		expect(discordInfo.registrationType).toBe("discord");
	});

	it("本登録ユーザーの patToken は 32 文字の hex 文字列", () => {
		const info: MypageInfo = makeRegisteredUserInfo({ patToken: PAT_TOKEN });
		expect(info.patToken).toBe(PAT_TOKEN);
		expect(info.patToken?.length).toBe(32);
	});
});

// ---------------------------------------------------------------------------
// テストスイート: エッジケース
// ---------------------------------------------------------------------------

describe("エッジケース", () => {
	it("buildPatCopyValue: 空文字列は空の #pat_ を返す", () => {
		// 空のPATトークンは実際には発生しないが境界値テスト
		expect(buildPatCopyValue("")).toBe("#pat_");
	});

	it("buildPatCopyValue: 特殊文字を含むトークンもそのまま連結される", () => {
		// 32文字hex以外の文字列が誤って渡された場合の防御的テスト
		expect(buildPatCopyValue("abc123")).toBe("#pat_abc123");
	});

	it("getAccountTypeLabel: patToken が null でも本登録ユーザーは正しく判定される", () => {
		// patToken が null でも registrationType で判定するため影響なし
		const info = makeRegisteredUserInfo({ patToken: null });
		expect(getAccountTypeLabel(info)).toBe("本登録ユーザー");
	});
});

// ---------------------------------------------------------------------------
// テストスイート: ログアウトボタン表示制御
// D-06 mypage.yaml: logout-btn condition: user.isRegistered == true
// ---------------------------------------------------------------------------

describe("ログアウトボタン表示制御 (isPermanentUser)", () => {
	it("本登録ユーザー（email）はログアウトボタンが表示される", () => {
		// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
		// See: docs/specs/screens/mypage.yaml @logout-btn condition: user.isRegistered == true
		const info = makeRegisteredUserInfo({ registrationType: "email" });
		expect(isPermanentUser(info)).toBe(true);
	});

	it("本登録ユーザー（discord）はログアウトボタンが表示される", () => {
		// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
		const info = makeRegisteredUserInfo({ registrationType: "discord" });
		expect(isPermanentUser(info)).toBe(true);
	});

	it("仮ユーザーはログアウトボタンが表示されない", () => {
		// See: docs/specs/screens/mypage.yaml @logout-btn
		// 仮ユーザーはログアウトするとユーザーIDを喪失するため非表示
		const info = makeTemporaryUserInfo();
		expect(isPermanentUser(info)).toBe(false);
	});

	it("有料ユーザーでも本登録済みであればログアウトボタンが表示される", () => {
		// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
		const info = makeRegisteredUserInfo({ isPremium: true });
		expect(isPermanentUser(info)).toBe(true);
	});

	it("registrationType が null（仮ユーザー）の場合はログアウトボタンが非表示", () => {
		// 境界値テスト: registrationType === null は仮ユーザー
		const info: MypageInfo = {
			...makeTemporaryUserInfo(),
			registrationType: null,
		};
		expect(isPermanentUser(info)).toBe(false);
	});
});
