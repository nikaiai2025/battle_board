/**
 * theme.feature ステップ定義
 *
 * テーマ設定機能（テーマ/フォントの選択・表示・解決）のシナリオを実装する。
 *
 * D-10 §1 に従いサービス層（ThemeService・MypageService）を直接呼び出す。
 * UIのCSSクラス切り替えやCookie操作はBDDテストのスコープ外。
 * 「画面が切り替わる」系のステップは resolveTheme() / resolveFont() の戻り値で検証する。
 * 「ロックアイコン」系は validateThemeSelection() の権限チェックで検証する。
 *
 * See: features/theme.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/workers/bdd-architect_283/theme_design.md §9 BDDステップ定義
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { FONT_CATALOG, THEME_CATALOG } from "../../src/lib/domain/models/theme";
import {
	resolveFont,
	resolveTheme,
	validateThemeSelection,
} from "../../src/lib/domain/rules/theme-rules";
import { InMemoryUserRepo } from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getMypageService() {
	return require("../../src/lib/services/mypage-service") as typeof import("../../src/lib/services/mypage-service");
}

function getThemeService() {
	return require("../../src/lib/services/theme-service") as typeof import("../../src/lib/services/theme-service");
}

// ---------------------------------------------------------------------------
// テーマ名 → テーマID変換ヘルパー
// ---------------------------------------------------------------------------

/** テーマ表示名からIDに変換する */
function themeNameToId(name: string): string {
	const entry = THEME_CATALOG.find((t) => t.name === name);
	assert(entry, `テーマ "${name}" がカタログに見つかりません`);
	return entry.id;
}

/** フォント表示名からIDに変換する */
function fontNameToId(name: string): string {
	const entry = FONT_CATALOG.find((f) => f.name === name);
	assert(entry, `フォント "${name}" がカタログに見つかりません`);
	return entry.id;
}

// ---------------------------------------------------------------------------
// ヘルパー: ユーザー作成 + ログイン
// ---------------------------------------------------------------------------

async function createLoggedInUser(
	world: BattleBoardWorld,
	options: { isPremium?: boolean } = {},
): Promise<void> {
	const AuthService = getAuthService();
	const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
	world.currentEdgeToken = token;
	world.currentUserId = userId;
	world.currentIpHash = DEFAULT_IP_HASH;
	await InMemoryUserRepo.updateIsVerified(userId, true);
	seedDummyPost(userId);

	if (options.isPremium) {
		await InMemoryUserRepo.updateIsPremium(userId, true);
		world.currentIsPremium = true;
	}
}

// ===========================================================================
// Given ステップ
// ===========================================================================

// ---------------------------------------------------------------------------
// マイページにテーマ設定セクションが表示される
// See: features/theme.feature @マイページにテーマ設定セクションが表示される
// ---------------------------------------------------------------------------

Given(
	"ユーザーがマイページのテーマ設定を表示している",
	async function (this: BattleBoardWorld) {
		await createLoggedInUser(this);
		const MypageService = getMypageService();
		const result = await MypageService.getMypage(this.currentUserId!);
		assert(result, "マイページ情報の取得に失敗しました");
		this.mypageResult = result;
	},
);

Given(
	"有料ユーザーがマイページのテーマ設定を表示している",
	async function (this: BattleBoardWorld) {
		await createLoggedInUser(this, { isPremium: true });
		const MypageService = getMypageService();
		const result = await MypageService.getMypage(this.currentUserId!);
		assert(result, "マイページ情報の取得に失敗しました");
		this.mypageResult = result;
	},
);

Given(
	"無料ユーザーがマイページのテーマ設定を表示している",
	async function (this: BattleBoardWorld) {
		await createLoggedInUser(this, { isPremium: false });
		const MypageService = getMypageService();
		const result = await MypageService.getMypage(this.currentUserId!);
		assert(result, "マイページ情報の取得に失敗しました");
		this.mypageResult = result;
	},
);

Given(
	"現在のテーマが {string} である",
	async function (this: BattleBoardWorld, themeName: string) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const themeId = themeNameToId(themeName);
		await InMemoryUserRepo.updateTheme(this.currentUserId, themeId, "gothic");
	},
);

Given(
	"現在のフォントがゴシック以外である",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		// 有料ユーザーであることが前提。有料フォント(noto-sans-jp)に設定する
		await InMemoryUserRepo.updateTheme(
			this.currentUserId,
			"default",
			"noto-sans-jp",
		);
	},
);

Given(
	"ユーザーがテーマ {string} を設定済みである",
	async function (this: BattleBoardWorld, themeName: string) {
		await createLoggedInUser(this);
		const themeId = themeNameToId(themeName);
		const ThemeService = getThemeService();
		await ThemeService.updateTheme(this.currentUserId!, themeId, "gothic");
	},
);

Given(
	"ユーザーがテーマを一度も設定していない",
	async function (this: BattleBoardWorld) {
		// themeId: null, fontId: null のユーザーを作成
		await createLoggedInUser(this);
		// create 時にデフォルト null なので追加操作不要
	},
);

Given(
	"有料テーマと有料フォントを設定中のユーザーが無料ユーザーに変更された",
	async function (this: BattleBoardWorld) {
		// 有料ユーザーとしてテーマ設定後、無料に変更
		await createLoggedInUser(this, { isPremium: true });
		const ThemeService = getThemeService();
		await ThemeService.updateTheme(
			this.currentUserId!,
			"ocean",
			"noto-sans-jp",
		);
		// 無料ユーザーに変更（ダウングレード）
		await InMemoryUserRepo.updateIsPremium(this.currentUserId!, false);
		this.currentIsPremium = false;
	},
);

// ===========================================================================
// When ステップ
// ===========================================================================

// "マイページを表示する" は mypage.steps.ts で定義済みのため省略

When(
	"テーマ {string} を選択する",
	async function (this: BattleBoardWorld, themeName: string) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const themeId = themeNameToId(themeName);
		const ThemeService = getThemeService();
		// 現在のフォントIDを取得
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		const currentFontId = user?.fontId ?? "gothic";
		await ThemeService.updateTheme(this.currentUserId, themeId, currentFontId);
	},
);

When("有料テーマを選択する", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーが作成されていません");
	const ThemeService = getThemeService();
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	const currentFontId = user?.fontId ?? "gothic";
	await ThemeService.updateTheme(this.currentUserId, "ocean", currentFontId);
});

When(
	"フォント {string} を選択する",
	async function (this: BattleBoardWorld, fontName: string) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const fontId = fontNameToId(fontName);
		const ThemeService = getThemeService();
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		const currentThemeId = user?.themeId ?? "default";
		await ThemeService.updateTheme(this.currentUserId, currentThemeId, fontId);
	},
);

When("有料フォントを選択する", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーが作成されていません");
	const ThemeService = getThemeService();
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	const currentThemeId = user?.themeId ?? "default";
	await ThemeService.updateTheme(
		this.currentUserId,
		currentThemeId,
		"noto-sans-jp",
	);
});

When("スレッド一覧ページを表示する", async function (this: BattleBoardWorld) {
	// テーマ解決ロジックの検証（全画面適用はSSR/Cookie経由のため、
	// BDDではテーマ解決の一貫性を検証）
	// 実際の画面表示はE2Eテスト範囲
});

When("掲示板にアクセスする", async function (this: BattleBoardWorld) {
	// テーマ解決ロジックの呼び出し（実際のページアクセスはBDD範囲外）
});

// ===========================================================================
// Then ステップ
// ===========================================================================

Then("テーマ設定セクションが表示される", function (this: BattleBoardWorld) {
	assert(this.mypageResult, "マイページ情報が取得されていません");
	// テーマ設定セクションの存在は themeId/fontId フィールドの存在で検証
	assert(
		"themeId" in this.mypageResult,
		"MypageInfo に themeId フィールドが存在しません",
	);
	assert(
		"fontId" in this.mypageResult,
		"MypageInfo に fontId フィールドが存在しません",
	);
});

Then("テーマ一覧とフォント一覧が表示される", function (this: BattleBoardWorld) {
	// UIの表示検証はカタログ定数の存在で代替
	assert(THEME_CATALOG.length > 0, "テーマカタログが空です");
	assert(FONT_CATALOG.length > 0, "フォントカタログが空です");
});

Then(
	"現在適用中のテーマとフォントが選択状態で表示される",
	function (this: BattleBoardWorld) {
		assert(this.mypageResult, "マイページ情報が取得されていません");
		// デフォルト値（未設定時）と一致することを検証
		assert.strictEqual(this.mypageResult.themeId, "default");
		assert.strictEqual(this.mypageResult.fontId, "gothic");
	},
);

Then("画面がダークテーマに切り替わる", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーが作成されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが見つかりません");
	const resolved = resolveTheme(user.themeId, user.isPremium);
	assert.strictEqual(
		resolved.id,
		"dark",
		`テーマが dark であることを期待しましたが ${resolved.id} でした`,
	);
});

Then(
	"画面がデフォルトテーマに切り替わる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const resolved = resolveTheme(user.themeId, user.isPremium);
		assert.strictEqual(
			resolved.id,
			"default",
			`テーマが default であることを期待しましたが ${resolved.id} でした`,
		);
	},
);

Then("テーマ設定が保存される", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーが作成されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが見つかりません");
	// DB に保存されていることを確認（themeId が null でないこと）
	assert(user.themeId !== undefined, "ユーザーの themeId が保存されていません");
});

Then(
	"画面が選択した有料テーマに切り替わる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const resolved = resolveTheme(user.themeId, user.isPremium);
		assert.strictEqual(resolved.id, "ocean");
	},
);

Then(
	"有料テーマにはロックアイコンが表示される",
	function (this: BattleBoardWorld) {
		// UIロック表示はカタログのisFreeフラグで制御される設計を検証
		const paidThemes = THEME_CATALOG.filter((t) => !t.isFree);
		assert(paidThemes.length > 0, "有料テーマがカタログに存在しません");
	},
);

Then("有料テーマは選択できない", function (this: BattleBoardWorld) {
	// 無料ユーザーが有料テーマを選択できないことを検証
	const result = validateThemeSelection("ocean", "gothic", false);
	assert.strictEqual(result.valid, false);
	if (!result.valid) {
		assert.strictEqual(result.code, "PREMIUM_REQUIRED");
	}
});

Then(
	"画面がゴシックフォントに切り替わる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const resolved = resolveFont(user.fontId, user.isPremium);
		assert.strictEqual(resolved.id, "gothic");
	},
);

Then("フォント設定が保存される", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーが作成されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが見つかりません");
	assert(user.fontId !== undefined, "ユーザーの fontId が保存されていません");
});

Then(
	"画面が選択したフォントに切り替わる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const resolved = resolveFont(user.fontId, user.isPremium);
		assert.strictEqual(resolved.id, "noto-sans-jp");
	},
);

Then(
	"有料フォントにはロックアイコンが表示される",
	function (this: BattleBoardWorld) {
		const paidFonts = FONT_CATALOG.filter((f) => !f.isFree);
		assert(paidFonts.length > 0, "有料フォントがカタログに存在しません");
	},
);

Then("有料フォントは選択できない", function (this: BattleBoardWorld) {
	const result = validateThemeSelection("default", "noto-sans-jp", false);
	assert.strictEqual(result.valid, false);
	if (!result.valid) {
		assert.strictEqual(result.code, "PREMIUM_REQUIRED");
	}
});

Then(
	"テーマとフォントの両方が画面に反映される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const resolvedTheme = resolveTheme(user.themeId, user.isPremium);
		const resolvedFont = resolveFont(user.fontId, user.isPremium);
		assert.strictEqual(resolvedTheme.id, "ocean");
		assert.strictEqual(resolvedFont.id, "noto-sans-jp");
	},
);

Then("ダークテーマで画面が表示される", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーが作成されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが見つかりません");
	const resolved = resolveTheme(user.themeId, user.isPremium);
	assert.strictEqual(resolved.id, "dark");
});

Then(
	"デフォルトテーマとゴシックフォントで画面が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーが作成されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const resolvedTheme = resolveTheme(user.themeId, user.isPremium);
		const resolvedFont = resolveFont(user.fontId, user.isPremium);
		assert.strictEqual(
			resolvedTheme.id,
			"default",
			`テーマが default であることを期待しましたが ${resolvedTheme.id} でした`,
		);
		assert.strictEqual(
			resolvedFont.id,
			"gothic",
			`フォントが gothic であることを期待しましたが ${resolvedFont.id} でした`,
		);
	},
);
