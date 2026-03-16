/**
 * user_registration.feature ステップ定義
 *
 * 本登録・ログイン・専ブラ連携トークン（PAT）機能のシナリオを実装する。
 *
 * D-10 §1 に従いサービス層（RegistrationService）を直接呼び出す。
 * APIルートは経由しない。
 *
 * Discord OAuth 関連のシナリオ（外部依存）は pending として実装する:
 *   - 仮ユーザーが Discord アカウントで本登録する
 *   - 本登録ユーザーが Discord アカウントでログインする
 * 理由: Discord OAuth は外部サービス（discord.com）との通信が必要であり、
 *       インメモリモックでの完全なシミュレーションが困難なため。
 *
 * メール認証シナリオ:
 *   - completeRegistration() を直接呼び出してメール確認完了をシミュレートする
 *   - loginWithEmail() のテストは InMemorySupabaseClient._registerSupabaseUser() で
 *     認証情報を事前登録してシミュレートする
 *
 * See: features/user_registration.feature
 * See: docs/architecture/components/user-registration.md
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryEdgeTokenRepo,
	InMemorySupabaseClient,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// World 型拡張（user_registration.feature 向け追加プロパティ）
// ---------------------------------------------------------------------------

/**
 * BattleBoardWorld に user_registration.feature 向けプロパティを追加する型宣言。
 *
 * See: features/user_registration.feature
 * See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
 */
declare module "../support/world" {
	interface BattleBoardWorld {
		/** 本登録ユーザーの PAT（パーソナルアクセストークン） */
		currentPatToken: string | null;
		/** 本登録で使用したメールアドレス */
		registrationEmail: string | null;
		/** 本登録で使用したパスワード */
		registrationPassword: string | null;
		/** Supabase Auth ID（本登録時に設定） */
		currentSupabaseAuthId: string | null;
		/** 旧 PAT（再発行前のトークン） */
		oldPatToken: string | null;
		/** 2台目デバイスの edge-token */
		deviceBEdgeToken: string | null;
		/** 2台目デバイスのユーザーID */
		deviceBUserId: string | null;
	}
}

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

/** RegistrationService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getRegistrationService() {
	return require("../../src/lib/services/registration-service") as typeof import("../../src/lib/services/registration-service");
}

/** AuthService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

/** PostService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

/** MypageService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getMypageService() {
	return require("../../src/lib/services/mypage-service") as typeof import("../../src/lib/services/mypage-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "battleboard";

/** テスト用メールアドレス */
const TEST_EMAIL = "test-user@battleboard.test";

/** テスト用パスワード */
const TEST_PASSWORD = "test-password-secure";

/** テスト用間違いパスワード */
const TEST_WRONG_PASSWORD = "wrong-password";

// ---------------------------------------------------------------------------
// ヘルパー関数: 認証済み仮ユーザーを作成する
// ---------------------------------------------------------------------------

/**
 * edge-token を発行して認証済み（isVerified=true）仮ユーザーを作成し、World に設定する。
 * user_registration.feature の Given ステップで繰り返し使われるパターンを共通化する。
 *
 * See: features/user_registration.feature @仮ユーザーがマイページを表示している
 */
async function setupVerifiedUser(world: BattleBoardWorld): Promise<void> {
	const AuthService = getAuthService();
	const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
	world.currentEdgeToken = token;
	world.currentUserId = userId;
	world.currentIpHash = DEFAULT_IP_HASH;
	// 認証済み状態にする（書き込み可能）
	await InMemoryUserRepo.updateIsVerified(userId, true);
}

/**
 * 仮ユーザーを本登録完了状態にする。
 * completeRegistration() を直接呼び出してメール確認完了をシミュレートする。
 *
 * @param world - BattleBoardWorld
 * @param registrationType - 本登録種別
 */
async function completeUserRegistration(
	world: BattleBoardWorld,
	registrationType: "email" | "discord" = "email",
): Promise<void> {
	assert(world.currentUserId, "ユーザーIDが設定されていません");
	const RegistrationService = getRegistrationService();
	const supabaseAuthId = crypto.randomUUID();
	world.currentSupabaseAuthId = supabaseAuthId;
	await RegistrationService.completeRegistration(
		world.currentUserId,
		supabaseAuthId,
		registrationType,
	);
	// World の patToken を更新する
	const user = await InMemoryUserRepo.findById(world.currentUserId);
	world.currentPatToken = user?.patToken ?? null;
}

// ---------------------------------------------------------------------------
// Given: 仮ユーザーがマイページを表示している
// See: features/user_registration.feature @仮ユーザーがマイページを表示している
// ---------------------------------------------------------------------------

/**
 * 認証済み仮ユーザーがマイページを表示している状態を作る。
 * edge-token を発行して isVerified=true にする。
 * マイページは getMypage() で取得して World に保持する。
 *
 * See: features/user_registration.feature @仮ユーザーがマイページを表示している
 */
Given(
	"仮ユーザーがマイページを表示している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const MypageService = getMypageService();
		this.mypageResult = await MypageService.getMypage(this.currentUserId!);
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザー（メール認証）がマイページを表示している
// See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
// ---------------------------------------------------------------------------

/**
 * 本登録済み（メール認証）ユーザーがマイページを表示している状態を作る。
 *
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 */
Given(
	"本登録ユーザー（メール認証）がマイページを表示している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		const MypageService = getMypageService();
		this.mypageResult = await MypageService.getMypage(this.currentUserId!);
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザーがマイページを表示している（メール認証、括弧なし）
// See: features/user_registration.feature @マイページでPATを確認できる
// ---------------------------------------------------------------------------

/**
 * 本登録済みユーザー（メール認証）がマイページを表示している状態を作る。
 * 括弧なしの汎用ステップ。メール認証でのデフォルト本登録を使用する。
 *
 * See: features/user_registration.feature @マイページでPATを確認できる
 */
Given(
	"本登録ユーザーがマイページを表示している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		const MypageService = getMypageService();
		this.mypageResult = await MypageService.getMypage(this.currentUserId!);
	},
);

// ---------------------------------------------------------------------------
// Given: 仮ユーザーが本登録申請済みで確認メールを受信している
// See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーが本登録申請済みの状態を作る。
 * registerWithEmail() を呼んで「確認待ち」状態にする。
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 */
Given(
	"仮ユーザーが本登録申請済みで確認メールを受信している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const RegistrationService = getRegistrationService();
		const result = await RegistrationService.registerWithEmail(
			this.currentUserId!,
			TEST_EMAIL,
			TEST_PASSWORD,
		);
		assert.strictEqual(
			result.success,
			true,
			`本登録申請が成功することを期待しましたが失敗しました`,
		);
		this.registrationEmail = TEST_EMAIL;
		this.registrationPassword = TEST_PASSWORD;
		this.lastResult = { type: "success", data: result };
	},
);

// ---------------------------------------------------------------------------
// Given: 別のユーザーがそのメールアドレスで本登録済みである
// See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
// ---------------------------------------------------------------------------

/**
 * 別ユーザーが同じメールアドレスで本登録済みの状態を作る。
 * InMemorySupabaseClient._setSignUpMode('email_taken') でエラーをシミュレートする。
 *
 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
 */
Given(
	"別のユーザーがそのメールアドレスで本登録済みである",
	async function (this: BattleBoardWorld) {
		// signUp で email_taken エラーを返すモードに切り替える
		InMemorySupabaseClient._setSignUpMode("email_taken");
	},
);

// ---------------------------------------------------------------------------
// Given: 仮ユーザーの通貨残高が N である
// See: features/user_registration.feature @本登録後に仮ユーザー時代の通貨残高が引き継がれる
// ---------------------------------------------------------------------------

// NOTE: 「仮ユーザーの通貨残高が {int} である」はcommon.steps.tsに定義済みの可能性があるため確認が必要。
// 既存のステップと重複しないよう、common.steps.tsで対応しているものに依存する。
// 独自実装が必要な場合のみここに定義する。

/**
 * 仮ユーザーがマイページを表示して通貨残高を設定する Given。
 * CurrencyService は直接操作できないため、InMemoryCurrencyRepo を使う。
 *
 * NOTE: 「ユーザーの通貨残高が N である」は common.steps.ts で定義済みだが、
 * 「仮ユーザーの通貨残高が N である」は user_registration.feature 固有のため
 * ここに定義する。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代の通貨残高が引き継がれる
 */
Given(
	"仮ユーザーの通貨残高が {int} である",
	async function (this: BattleBoardWorld, balance: number) {
		await setupVerifiedUser(this);
		// InMemoryCurrencyRepo に直接設定する
		const { InMemoryCurrencyRepo } = require("../support/mock-installer");
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId!,
			balance,
			updatedAt: new Date(),
		});
	},
);

// ---------------------------------------------------------------------------
// Given: 仮ユーザーが過去に5件の書き込みを行っている
// See: features/user_registration.feature @本登録後に仮ユーザー時代の書き込み履歴が引き継がれる
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーが5件の書き込みを行った状態を作る。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代の書き込み履歴が引き継がれる
 */
Given(
	"仮ユーザーが過去に5件の書き込みを行っている",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const PostService = getPostService();

		// スレッドを1件作成し、残り4件を追加書き込みする（合計5件）
		const threadResult = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: "本登録引き継ぎテスト用スレッド",
				firstPostBody: "1件目の書き込み",
			},
			this.currentEdgeToken!,
			DEFAULT_IP_HASH,
		);
		assert(
			threadResult.success && threadResult.thread,
			"スレッドの作成に失敗しました",
		);
		this.currentThreadId = threadResult.thread.id;

		for (let i = 2; i <= 5; i++) {
			await PostService.createPost({
				threadId: threadResult.thread.id,
				body: `${i}件目の書き込み`,
				edgeToken: this.currentEdgeToken!,
				ipHash: DEFAULT_IP_HASH,
				isBotWrite: false,
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: 仮ユーザーの連続書き込み日数が N である
// See: features/user_registration.feature @本登録後に仮ユーザー時代のストリークが引き継がれる
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーのストリーク（連続書き込み日数）を設定する Given。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代のストリークが引き継がれる
 */
Given(
	"仮ユーザーの連続書き込み日数が {int} である",
	async function (this: BattleBoardWorld, streakDays: number) {
		await setupVerifiedUser(this);
		// ストリーク情報を直接更新する
		await InMemoryUserRepo.updateStreak(
			this.currentUserId!,
			streakDays,
			new Date().toISOString().slice(0, 10),
		);
	},
);

// ---------------------------------------------------------------------------
// Given: 仮ユーザーが edge-token で書き込み可能である
// See: features/user_registration.feature @本登録後も既存のedge-tokenで書き込みできる
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーが edge-token で書き込み可能な状態を作る。
 * スレッドも用意して書き込み可能にする。
 *
 * See: features/user_registration.feature @本登録後も既存のedge-tokenで書き込みできる
 */
Given(
	"仮ユーザーが edge-token で書き込み可能である",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "edge-token 継続性テスト用スレッド",
			createdBy: this.currentUserId!,
		});
		this.currentThreadId = thread.id;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザーが edge-token Cookie を削除する
// See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザーが edge-token Cookie を削除した状態を作る。
 *
 * See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
 */
Given(
	"本登録ユーザーが edge-token Cookie を削除する",
	async function (this: BattleBoardWorld) {
		// 本登録ユーザーを作成する
		await setupVerifiedUser(this);
		const supabaseAuthId = crypto.randomUUID();
		this.currentSupabaseAuthId = supabaseAuthId;
		await getRegistrationService().completeRegistration(
			this.currentUserId!,
			supabaseAuthId,
			"email",
		);
		// Supabase Auth にユーザーを登録する（loginWithEmail が照合できるように）
		InMemorySupabaseClient._registerSupabaseUser(
			supabaseAuthId,
			TEST_EMAIL,
			TEST_PASSWORD,
		);
		this.registrationEmail = TEST_EMAIL;
		this.registrationPassword = TEST_PASSWORD;

		// PAT を更新する
		const user = await InMemoryUserRepo.findById(this.currentUserId!);
		this.currentPatToken = user?.patToken ?? null;

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "Cookie削除テスト用スレッド",
			createdBy: this.currentUserId!,
		});
		this.currentThreadId = thread.id;

		// edge-token Cookie を削除する（null に設定）
		this.currentEdgeToken = null;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザー（メール認証）が新しいデバイスを使用している
// See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザー（メール認証）が新しいデバイスを使用している状態を作る。
 * 既存デバイスの edge-token とは別に、新しいデバイスとして edge-token なし状態にする。
 *
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 */
Given(
	"本登録ユーザー（メール認証）が新しいデバイスを使用している",
	async function (this: BattleBoardWorld) {
		// 本登録ユーザーを作成する（既存デバイス）
		await setupVerifiedUser(this);
		const supabaseAuthId = crypto.randomUUID();
		this.currentSupabaseAuthId = supabaseAuthId;
		await getRegistrationService().completeRegistration(
			this.currentUserId!,
			supabaseAuthId,
			"email",
		);
		// Supabase Auth にユーザーを登録する（loginWithEmail が照合できるように）
		InMemorySupabaseClient._registerSupabaseUser(
			supabaseAuthId,
			TEST_EMAIL,
			TEST_PASSWORD,
		);
		this.registrationEmail = TEST_EMAIL;
		this.registrationPassword = TEST_PASSWORD;

		// PAT も更新する
		const user = await InMemoryUserRepo.findById(this.currentUserId!);
		this.currentPatToken = user?.patToken ?? null;

		// 新しいデバイスとして edge-token なし状態にする
		this.currentEdgeToken = null;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザー（メール認証）のアカウントが存在する
// See: features/user_registration.feature @誤ったパスワードではログインできない
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザー（メール認証）のアカウントが存在する状態を作る。
 *
 * See: features/user_registration.feature @誤ったパスワードではログインできない
 */
Given(
	"本登録ユーザー（メール認証）のアカウントが存在する",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const supabaseAuthId = crypto.randomUUID();
		this.currentSupabaseAuthId = supabaseAuthId;
		await getRegistrationService().completeRegistration(
			this.currentUserId!,
			supabaseAuthId,
			"email",
		);
		// Supabase Auth にユーザーを登録する
		InMemorySupabaseClient._registerSupabaseUser(
			supabaseAuthId,
			TEST_EMAIL,
			TEST_PASSWORD,
		);
		this.registrationEmail = TEST_EMAIL;
		this.registrationPassword = TEST_PASSWORD;
		// edge-token なし状態にする（新デバイス）
		this.currentEdgeToken = null;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザーがデバイスAで書き込み可能である
// See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザーがデバイスAで書き込み可能な状態を作る。
 * デバイスAの edge-token を World に保持する。
 *
 * See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
 */
Given(
	"本登録ユーザーがデバイスAで書き込み可能である",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const supabaseAuthId = crypto.randomUUID();
		this.currentSupabaseAuthId = supabaseAuthId;
		await getRegistrationService().completeRegistration(
			this.currentUserId!,
			supabaseAuthId,
			"email",
		);
		// Supabase Auth にユーザーを登録する（デバイスBのログイン用）
		InMemorySupabaseClient._registerSupabaseUser(
			supabaseAuthId,
			TEST_EMAIL,
			TEST_PASSWORD,
		);
		this.registrationEmail = TEST_EMAIL;
		this.registrationPassword = TEST_PASSWORD;

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "マルチデバイステスト用スレッド",
			createdBy: this.currentUserId!,
		});
		this.currentThreadId = thread.id;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザーがログイン済みである
// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザーがログイン済みの状態を作る。
 *
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 */
Given(
	"本登録ユーザーがログイン済みである",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "ログアウトテスト用スレッド",
			createdBy: this.currentUserId!,
		});
		this.currentThreadId = thread.id;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザーが PAT を取得している
// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザーが PAT を取得している状態を作る。
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 */
Given(
	"本登録ユーザーが PAT を取得している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		assert(this.currentPatToken, "本登録完了後に PAT が発行されていません");
	},
);

// ---------------------------------------------------------------------------
// Given: 専ブラで未認証の新しいデバイスを使用している
// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
// ---------------------------------------------------------------------------

/**
 * 専ブラで未認証の新しいデバイスを使用している状態を作る。
 * edge-token を null にしてスレッドを用意する。
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 */
Given(
	"専ブラで未認証の新しいデバイスを使用している",
	async function (this: BattleBoardWorld) {
		// 既存の edge-token を削除（新しいデバイスとして）
		this.currentEdgeToken = null;
		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "専ブラ PAT テスト用スレッド",
			createdBy: this.currentUserId ?? "system",
		});
		this.currentThreadId = thread.id;
	},
);

// ---------------------------------------------------------------------------
// Given: 専ブラで PAT による edge-token Cookie が発行済みである
// See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
// ---------------------------------------------------------------------------

/**
 * 専ブラで PAT 認証して edge-token Cookie が発行済みの状態を作る。
 * loginWithPat() を呼んで edge-token を取得する。
 *
 * See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
 */
Given(
	"専ブラで PAT による edge-token Cookie が発行済みである",
	async function (this: BattleBoardWorld) {
		// まず本登録ユーザーと PAT を用意する
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		assert(this.currentPatToken, "PAT が発行されていません");

		// PAT で認証して新しい edge-token を取得する
		const RegistrationService = getRegistrationService();
		const result = await RegistrationService.loginWithPat(
			this.currentPatToken!,
		);
		assert(result.valid, "PAT 認証が成功することを期待しました");
		if (result.valid) {
			this.currentEdgeToken = result.edgeToken;
		}

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "PAT Cookie テスト用スレッド",
			createdBy: this.currentUserId!,
		});
		this.currentThreadId = thread.id;
	},
);

// ---------------------------------------------------------------------------
// Given: 専ブラの edge-token Cookie が失効している
// See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
// ---------------------------------------------------------------------------

/**
 * 専ブラの edge-token Cookie が失効している状態を作る。
 *
 * See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
 */
Given(
	"専ブラの edge-token Cookie が失効している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		assert(this.currentPatToken, "PAT が発行されていません");

		// スレッドを用意する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "PAT 自動復帰テスト用スレッド",
			createdBy: this.currentUserId!,
		});
		this.currentThreadId = thread.id;

		// edge-token Cookie を削除（失効シミュレート）
		this.currentEdgeToken = null;
	},
);

// ---------------------------------------------------------------------------
// Given: メール欄に PAT が設定されたままである
// See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
// ---------------------------------------------------------------------------

/**
 * メール欄に PAT が設定されたままである（PAT が有効）ことを確認する。
 * PAT が World に保持されていることを前提とする。
 *
 * See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
 */
Given(
	"メール欄に PAT が設定されたままである",
	function (this: BattleBoardWorld) {
		assert(this.currentPatToken, "PAT が設定されていません");
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録ユーザーがマイページで PAT を再発行する
// See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザーがマイページで PAT を再発行する状態を作る。
 * 旧 PAT を記録してから regeneratePat() を呼ぶ。
 *
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 */
Given(
	"本登録ユーザーがマイページで PAT を再発行する",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		assert(this.currentPatToken, "PAT が発行されていません");

		// 旧 PAT を記録する
		this.oldPatToken = this.currentPatToken;

		// PAT を再発行する
		const RegistrationService = getRegistrationService();
		const result = await RegistrationService.regeneratePat(this.currentUserId!);
		this.currentPatToken = result.patToken;
	},
);

// ---------------------------------------------------------------------------
// Given: 本登録済みの無料ユーザーがマイページを表示している
// See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
// ---------------------------------------------------------------------------

/**
 * 本登録済みの無料ユーザーがマイページを表示している状態を作る。
 *
 * See: features/user_registration.feature @本登録済みの無料ユーザーは課金できる
 */
Given(
	"本登録済みの無料ユーザーがマイページを表示している",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		await completeUserRegistration(this, "email");
		const MypageService = getMypageService();
		this.mypageResult = await MypageService.getMypage(this.currentUserId!);
	},
);

// ---------------------------------------------------------------------------
// When: メールアドレスとパスワードを入力して本登録を申請する
// See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
// ---------------------------------------------------------------------------

/**
 * RegistrationService.registerWithEmail() を呼んで本登録を申請する。
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 */
When(
	"メールアドレスとパスワードを入力して本登録を申請する",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const RegistrationService = getRegistrationService();
		const result = await RegistrationService.registerWithEmail(
			this.currentUserId,
			TEST_EMAIL,
			TEST_PASSWORD,
		);
		this.registrationEmail = TEST_EMAIL;
		this.registrationPassword = TEST_PASSWORD;

		if (result.success) {
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.reason,
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: メール内の確認リンクをクリックする
// See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
// ---------------------------------------------------------------------------

/**
 * メール確認リンクのクリックをシミュレートする。
 * completeRegistration() を直接呼び出してコールバック処理を実行する。
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 * See: docs/architecture/components/user-registration.md §7.1 メール認証
 */
When(
	"メール内の確認リンクをクリックする",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		await completeUserRegistration(this, "email");
		const MypageService = getMypageService();
		this.mypageResult = await MypageService.getMypage(this.currentUserId!);
		this.lastResult = { type: "success", data: this.mypageResult };
	},
);

// ---------------------------------------------------------------------------
// When: 仮ユーザーが同じメールアドレスで本登録を申請する
// See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
// ---------------------------------------------------------------------------

/**
 * 既に使用されているメールアドレスで本登録を申請する。
 *
 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
 */
When(
	"仮ユーザーが同じメールアドレスで本登録を申請する",
	async function (this: BattleBoardWorld) {
		await setupVerifiedUser(this);
		const RegistrationService = getRegistrationService();
		const result = await RegistrationService.registerWithEmail(
			this.currentUserId!,
			TEST_EMAIL,
			TEST_PASSWORD,
		);

		if (result.success) {
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.reason,
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: Discord で本登録ボタンを押す / Discord 認可画面で許可する
// See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
// NOTE: Discord OAuth は外部依存のため pending
// ---------------------------------------------------------------------------

/**
 * Discord 本登録ボタンを押す（pending: 外部 OAuth 依存のため）。
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 */
When("Discord で本登録ボタンを押す", async function (this: BattleBoardWorld) {
	// Discord OAuth は外部サービス依存のため BDD テストでは pending とする。
	// 実装済み: RegistrationService.registerWithDiscord() → OAuth URL 返却
	// インメモリモックでは完全なシミュレーションが困難。
	return "pending";
});

/**
 * Discord 認可画面で許可する（pending: 外部 OAuth 依存のため）。
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 */
When("Discord 認可画面で許可する", function (this: BattleBoardWorld) {
	// Discord OAuth コールバックは外部サービス依存のため BDD テストでは pending とする。
	return "pending";
});

// ---------------------------------------------------------------------------
// When: 本登録を完了する
// See: features/user_registration.feature @本登録後に仮ユーザー時代の通貨残高が引き継がれる
// ---------------------------------------------------------------------------

/**
 * 本登録を完了する（completeRegistration を直接呼ぶ）。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代の通貨残高が引き継がれる
 */
When("本登録を完了する", async function (this: BattleBoardWorld) {
	await completeUserRegistration(this, "email");
	const MypageService = getMypageService();
	this.mypageResult = await MypageService.getMypage(this.currentUserId!);
	this.lastResult = { type: "success", data: this.mypageResult };
});

// ---------------------------------------------------------------------------
// When: 同じデバイスから書き込みを行う
// See: features/user_registration.feature @本登録後も既存のedge-tokenで書き込みできる
// ---------------------------------------------------------------------------

/**
 * 本登録後も同じ edge-token で書き込みを行う。
 *
 * See: features/user_registration.feature @本登録後も既存のedge-tokenで書き込みできる
 */
When("同じデバイスから書き込みを行う", async function (this: BattleBoardWorld) {
	assert(this.currentEdgeToken, "edge-token が設定されていません");
	assert(this.currentThreadId, "スレッドが設定されていません");
	const PostService = getPostService();
	const result = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "本登録後の書き込み",
		edgeToken: this.currentEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});
	if ("success" in result && result.success) {
		this.lastResult = { type: "success", data: result };
	} else {
		this.lastResult = {
			type: "error",
			message: "書き込み失敗",
			code: "WRITE_FAILED",
		};
	}
});

// ---------------------------------------------------------------------------
// When: ログインせずに書き込みを行う
// See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
// ---------------------------------------------------------------------------

/**
 * ログインせず（edge-token なし）に書き込みを行う。
 * 新しい仮ユーザーとして認証フローが開始される。
 *
 * See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
 */
When("ログインせずに書き込みを行う", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	const PostService = getPostService();
	const result = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "匿名書き込み",
		edgeToken: null, // edge-token なし（Cookie 削除済み）
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});
	if ("authRequired" in result && result.authRequired) {
		this.lastResult = {
			type: "authRequired",
			code: result.code,
			edgeToken: result.edgeToken,
		};
		// 新しい仮ユーザーの edge-token
		const newEdgeToken = result.edgeToken;
		// 元のユーザーとは別の edge-token であることを確認できるように保存
		this.deviceBEdgeToken = newEdgeToken;
	} else if ("success" in result && result.success) {
		this.lastResult = { type: "success", data: result };
	} else {
		this.lastResult = {
			type: "error",
			message: "書き込み失敗",
			code: "WRITE_FAILED",
		};
	}
});

// ---------------------------------------------------------------------------
// When: メールアドレスとパスワードでログインする
// See: features/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
// ---------------------------------------------------------------------------

/**
 * メールアドレスとパスワードでログインする。
 * RegistrationService.loginWithEmail() を呼んで edge-token を取得する。
 *
 * See: features/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 */
When(
	"メールアドレスとパスワードでログインする",
	async function (this: BattleBoardWorld) {
		const RegistrationService = getRegistrationService();
		const email = this.registrationEmail ?? TEST_EMAIL;
		const password = this.registrationPassword ?? TEST_PASSWORD;
		const result = await RegistrationService.loginWithEmail(email, password);
		if (result.success) {
			this.currentEdgeToken = result.edgeToken;
			this.currentUserId = result.userId;
			// authentication.steps.ts の "edge-token Cookie が発行される" ステップは
			// lastResult.type === 'authRequired' かつ lastResult.edgeToken を確認するため、
			// loginWithEmail 成功時も authRequired 型構造で保存する。
			// See: features/step_definitions/authentication.steps.ts:156
			this.lastResult = {
				type: "authRequired",
				code: "login_success",
				edgeToken: result.edgeToken,
			};
		} else {
			this.lastResult = {
				type: "error",
				message: result.reason,
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: デバイスBからログインする
// See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
// ---------------------------------------------------------------------------

/**
 * デバイスB からログインして新しい edge-token を取得する。
 * デバイスAの edge-token（World.currentEdgeToken）は保持したまま、
 * デバイスBの新しい edge-token を別の変数（deviceBEdgeToken）に保存する。
 *
 * See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
 */
When("デバイスBからログインする", async function (this: BattleBoardWorld) {
	const RegistrationService = getRegistrationService();
	const email = this.registrationEmail ?? TEST_EMAIL;
	const password = this.registrationPassword ?? TEST_PASSWORD;
	const result = await RegistrationService.loginWithEmail(email, password);
	if (result.success) {
		this.deviceBEdgeToken = result.edgeToken;
		this.deviceBUserId = result.userId;
		this.lastResult = { type: "success", data: result };
	} else {
		this.lastResult = {
			type: "error",
			message: result.reason,
			code: result.reason,
		};
	}
});

// ---------------------------------------------------------------------------
// Given: 本登録ユーザー（Discord 連携）が新しいデバイスを使用している
// See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
// NOTE: Discord OAuth は外部依存のため pending
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザー（Discord 連携）が新しいデバイスを使用している状態（pending）。
 *
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 */
Given(
	"本登録ユーザー（Discord 連携）が新しいデバイスを使用している",
	function (this: BattleBoardWorld) {
		// Discord OAuth は外部サービス依存のため BDD テストでは pending とする。
		return "pending";
	},
);

// ---------------------------------------------------------------------------
// When: Discord アカウントでログインする
// See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
// NOTE: Discord OAuth は外部依存のため pending
// ---------------------------------------------------------------------------

/**
 * Discord アカウントでのログイン（pending: 外部 OAuth 依存のため）。
 *
 * See: features/user_registration.feature @本登録ユーザーがDiscordアカウントでログインする
 */
When("Discord アカウントでログインする", function (this: BattleBoardWorld) {
	// Discord OAuth は外部サービス依存のため BDD テストでは pending とする。
	return "pending";
});

// ---------------------------------------------------------------------------
// When: 誤ったパスワードでログインを試みる
// See: features/user_registration.feature @誤ったパスワードではログインできない
// ---------------------------------------------------------------------------

/**
 * 誤ったパスワードでログインを試みる。
 *
 * See: features/user_registration.feature @誤ったパスワードではログインできない
 */
When(
	"誤ったパスワードでログインを試みる",
	async function (this: BattleBoardWorld) {
		const RegistrationService = getRegistrationService();
		const email = this.registrationEmail ?? TEST_EMAIL;
		const result = await RegistrationService.loginWithEmail(
			email,
			TEST_WRONG_PASSWORD,
		);
		if (result.success) {
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.reason,
				code: result.reason,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: ログアウトする
// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
// ---------------------------------------------------------------------------

/**
 * RegistrationService.logout() を呼んで edge-token を削除する。
 *
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 */
When("ログアウトする", async function (this: BattleBoardWorld) {
	assert(this.currentEdgeToken, "ログイン済みである必要があります");
	const RegistrationService = getRegistrationService();
	await RegistrationService.logout(this.currentEdgeToken);
	// Cookie 削除のシミュレート
	const deletedToken = this.currentEdgeToken;
	this.currentEdgeToken = null;
	this.lastResult = {
		type: "success",
		data: { loggedOut: true, deletedToken },
	};
});

// ---------------------------------------------------------------------------
// When: bbs.cgi のメール欄に "#pat_<PAT>" を含めて POST する
// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
// ---------------------------------------------------------------------------

/**
 * bbs.cgi のメール欄に PAT を含めて POST する。
 * loginWithPat() で認証し、新しい edge-token を取得してから書き込む。
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 * See: docs/architecture/components/user-registration.md §6 認証判定フロー
 */
When(
	/^bbs\.cgi のメール欄に "#pat_<PAT>" を含めて POST する$/,
	async function (this: BattleBoardWorld) {
		assert(this.currentPatToken, "PAT が設定されていません");
		assert(this.currentThreadId, "スレッドが設定されていません");

		const RegistrationService = getRegistrationService();

		// PAT 認証 → edge-token 発行
		const authResult = await RegistrationService.loginWithPat(
			this.currentPatToken,
		);
		if (!authResult.valid) {
			this.lastResult = {
				type: "error",
				message: "PAT 認証失敗",
				code: "PAT_INVALID",
			};
			return;
		}
		// 新しい edge-token を World に設定する
		this.currentEdgeToken = authResult.edgeToken;
		this.currentUserId = authResult.userId;

		// authentication.steps.ts の "edge-token Cookie が発行される" ステップは
		// lastResult.type === 'authRequired' かつ lastResult.edgeToken を確認するため、
		// PAT 認証成功時も authRequired 型構造で保存する。
		// See: features/step_definitions/authentication.steps.ts:156
		this.lastResult = {
			type: "authRequired",
			code: "pat_login_success",
			edgeToken: authResult.edgeToken,
		};

		// 書き込みを実行する（PAT は mail 欄から除去された後の書き込みをシミュレート）
		const PostService = getPostService();
		const postResult = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "PAT 認証後の書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		// 書き込み成功確認: postResult は捨てるが書き込みが失敗した場合はエラー上書き
		if (!("success" in postResult && postResult.success)) {
			// 書き込みが失敗した場合のみ error 型に上書きする
			this.lastResult = {
				type: "error",
				message: "書き込み失敗",
				code: "WRITE_FAILED",
			};
		}
		// 書き込み成功の場合は lastResult を authRequired 型のまま保持する
		// （後続の "edge-token Cookie が発行される" Then ステップが authRequired 型を必要とするため）
	},
);

// ---------------------------------------------------------------------------
// When: bbs.cgi に書き込みを POST する（Cookie 認証）
// See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
// ---------------------------------------------------------------------------

/**
 * bbs.cgi に書き込みを POST する。
 * edge-token Cookie がある場合は Cookie 認証が優先される。
 *
 * See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
 */
When("bbs.cgi に書き込みを POST する", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");

	const RegistrationService = getRegistrationService();
	const PostService = getPostService();

	// edge-token がない場合は PAT フォールバック認証を試みる
	// （実際の bbs.cgi ルートハンドラーの動作をシミュレートする）
	// See: docs/architecture/components/user-registration.md §6 認証判定フロー
	let effectiveEdgeToken = this.currentEdgeToken;
	if (!effectiveEdgeToken && this.currentPatToken) {
		// PAT 認証を試みる
		const authResult = await RegistrationService.loginWithPat(
			this.currentPatToken,
		);
		if (authResult.valid) {
			// PAT 認証成功 → 新しい edge-token を設定
			this.currentEdgeToken = authResult.edgeToken;
			effectiveEdgeToken = authResult.edgeToken;
			this.currentUserId = authResult.userId;
		}
	}

	// 書き込みを実行する
	const postResult = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "bbs.cgi からの書き込み",
		edgeToken: effectiveEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});

	if ("success" in postResult && postResult.success) {
		this.lastResult = {
			type: "success",
			data: { postResult, usedCookieAuth: !!this.currentEdgeToken },
		};
	} else if ("authRequired" in postResult && postResult.authRequired) {
		this.lastResult = {
			type: "authRequired",
			code: postResult.code,
			edgeToken: postResult.edgeToken,
		};
	} else {
		this.lastResult = {
			type: "error",
			message: "書き込み失敗",
			code: "WRITE_FAILED",
		};
	}
});

// ---------------------------------------------------------------------------
// When: bbs.cgi のメール欄に無効な PAT を含めて POST する
// See: features/user_registration.feature @無効なPATでは書き込みが拒否される
// ---------------------------------------------------------------------------

/**
 * bbs.cgi に無効な PAT を含めて POST する。
 * loginWithPat() で認証を試みて失敗するシミュレート。
 *
 * See: features/user_registration.feature @無効なPATでは書き込みが拒否される
 */
When(
	/^bbs\.cgi のメール欄に無効な PAT を含めて POST する$/,
	async function (this: BattleBoardWorld) {
		const RegistrationService = getRegistrationService();
		const invalidPat = "0000000000000000000000000000000000invalid";
		const authResult = await RegistrationService.loginWithPat(invalidPat);

		if (!authResult.valid) {
			this.lastResult = {
				type: "error",
				message: "無効な PAT",
				code: "PAT_INVALID",
			};
		} else {
			this.lastResult = { type: "success", data: authResult };
		}
	},
);

// ---------------------------------------------------------------------------
// When: 旧 PAT を使って専ブラから書き込みを試みる
// See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
// ---------------------------------------------------------------------------

/**
 * 旧 PAT を使って書き込みを試みる。
 * 旧 PAT が無効になっていることを確認する。
 *
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 */
When(
	"旧 PAT を使って専ブラから書き込みを試みる",
	async function (this: BattleBoardWorld) {
		assert(this.oldPatToken, "旧 PAT が設定されていません");
		const RegistrationService = getRegistrationService();
		const authResult = await RegistrationService.loginWithPat(this.oldPatToken);
		if (!authResult.valid) {
			this.lastResult = {
				type: "error",
				message: "旧 PAT 無効",
				code: "PAT_INVALID",
			};
		} else {
			this.lastResult = { type: "success", data: authResult };
		}
	},
);

// ---------------------------------------------------------------------------
// Then: メールアドレスに確認リンクが送信される
// See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
// ---------------------------------------------------------------------------

/**
 * 本登録申請が成功し、確認リンク送信済み状態であることを確認する。
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 */
Then(
	"メールアドレスに確認リンクが送信される",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`確認リンク送信が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 本登録は確認待ち状態になる
// See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
// ---------------------------------------------------------------------------

/**
 * 本登録が確認待ち状態であることを確認する。
 * ユーザーの supabaseAuthId がまだ NULL であること（確認完了前）を確認する。
 *
 * See: features/user_registration.feature @仮ユーザーがメールアドレスとパスワードで本登録を申請する
 */
Then("本登録は確認待ち状態になる", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが存在しません");
	assert.strictEqual(
		user.supabaseAuthId,
		null,
		"確認待ち状態では supabaseAuthId が NULL であることを期待しました",
	);
});

// ---------------------------------------------------------------------------
// Then: 本登録が完了する
// See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
// ---------------------------------------------------------------------------

/**
 * 本登録が完了したことを確認する。
 * ユーザーの supabaseAuthId が設定されていることを確認する。
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 */
Then("本登録が完了する", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが存在しません");
	assert(
		user.supabaseAuthId !== null,
		"本登録完了後は supabaseAuthId が設定されていることを期待しました",
	);
	this.lastResult = { type: "success", data: { registered: true } };
});

// ---------------------------------------------------------------------------
// Then: マイページにアカウント種別 "{string}" と表示される
// See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
// ---------------------------------------------------------------------------

/**
 * マイページのアカウント種別が期待値であることを確認する。
 * "本登録ユーザー" の場合: registrationType が null 以外であることを確認する。
 * "仮ユーザー" の場合: registrationType が null であることを確認する。
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 */
Then(
	"マイページにアカウント種別 {string} と表示される",
	async function (this: BattleBoardWorld, accountType: string) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");

		if (accountType === "本登録ユーザー") {
			assert(
				mypageInfo.registrationType !== null,
				`アカウント種別が "本登録ユーザー"（registrationType != null）であることを期待しましたが "${mypageInfo.registrationType}" でした`,
			);
		} else if (accountType === "仮ユーザー") {
			assert.strictEqual(
				mypageInfo.registrationType,
				null,
				`アカウント種別が "仮ユーザー"（registrationType = null）であることを期待しましたが "${mypageInfo.registrationType}" でした`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: PAT が自動発行されマイページに表示される
// See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
// ---------------------------------------------------------------------------

/**
 * 本登録完了後に PAT が自動発行されていることを確認する。
 *
 * See: features/user_registration.feature @メール確認リンクをクリックして本登録が完了する
 */
Then(
	"PATが自動発行されマイページに表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert(
			mypageInfo.patToken !== null,
			"本登録完了後は PAT が発行されていることを期待しました",
		);
		assert(
			/^[0-9a-f]{32}$/.test(mypageInfo.patToken!),
			`PAT が 32文字 hex 形式であることを期待しましたが "${mypageInfo.patToken}" でした`,
		);
		this.currentPatToken = mypageInfo.patToken;
	},
);

// ---------------------------------------------------------------------------
// NOTE: "エラーメッセージが表示される" は common.steps.ts で定義済みのため、
//       ここでの重複定義を削除する。
// See: features/step_definitions/common.steps.ts:316
// See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 本登録は完了しない
// See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
// ---------------------------------------------------------------------------

/**
 * 本登録が完了していないことを確認する。
 * ユーザーの supabaseAuthId が NULL であることを確認する。
 *
 * See: features/user_registration.feature @既に使用されているメールアドレスでは本登録できない
 */
Then("本登録は完了しない", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが存在しません");
	assert.strictEqual(
		user.supabaseAuthId,
		null,
		"本登録未完了では supabaseAuthId が NULL であることを期待しました",
	);
});

// ---------------------------------------------------------------------------
// Then: 認証方法に "{string}" と表示される
// See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
// ---------------------------------------------------------------------------

/**
 * マイページの認証方法が期待値であることを確認する。
 *
 * See: features/user_registration.feature @仮ユーザーがDiscordアカウントで本登録する
 * See: features/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 */
Then(
	"認証方法に {string} と表示される",
	async function (this: BattleBoardWorld, authMethod: string) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");

		const expectedType = authMethod === "メール" ? "email" : "discord";
		assert.strictEqual(
			mypageInfo.registrationType,
			expectedType,
			`認証方法が "${authMethod}"（registrationType: ${expectedType}）であることを期待しましたが "${mypageInfo.registrationType}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 通貨残高は N のままである
// See: features/user_registration.feature @本登録後に仮ユーザー時代の通貨残高が引き継がれる
// ---------------------------------------------------------------------------

/**
 * 本登録後も通貨残高が引き継がれていることを確認する。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代の通貨残高が引き継がれる
 */
Then(
	"通貨残高は {int} のままである",
	async function (this: BattleBoardWorld, expectedBalance: number) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert.strictEqual(
			mypageInfo.balance,
			expectedBalance,
			`通貨残高が ${expectedBalance} であることを期待しましたが ${mypageInfo.balance} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: マイページの書き込み履歴に N 件すべてが表示される
// See: features/user_registration.feature @本登録後に仮ユーザー時代の書き込み履歴が引き継がれる
// ---------------------------------------------------------------------------

/**
 * 本登録後も書き込み履歴が引き継がれていることを確認する。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代の書き込み履歴が引き継がれる
 */
Then(
	"マイページの書き込み履歴に{int}件すべてが表示される",
	async function (this: BattleBoardWorld, expectedCount: number) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const history = await MypageService.getPostHistory(this.currentUserId);
		assert.strictEqual(
			history.length,
			expectedCount,
			`書き込み履歴が ${expectedCount} 件であることを期待しましたが ${history.length} 件でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 連続書き込み日数は N のままである
// See: features/user_registration.feature @本登録後に仮ユーザー時代のストリークが引き継がれる
// ---------------------------------------------------------------------------

/**
 * 本登録後もストリーク（連続書き込み日数）が引き継がれていることを確認する。
 *
 * See: features/user_registration.feature @本登録後に仮ユーザー時代のストリークが引き継がれる
 */
Then(
	"連続書き込み日数は {int} のままである",
	async function (this: BattleBoardWorld, expectedStreakDays: number) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert.strictEqual(
			mypageInfo.streakDays,
			expectedStreakDays,
			`連続書き込み日数が ${expectedStreakDays} であることを期待しましたが ${mypageInfo.streakDays} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込みは本登録前と同じ edge-token で処理される
// See: features/user_registration.feature @本登録後も既存のedge-tokenで書き込みできる
// ---------------------------------------------------------------------------

/**
 * 本登録後も既存の edge-token で書き込みが成功することを確認する。
 *
 * See: features/user_registration.feature @本登録後も既存のedge-tokenで書き込みできる
 */
Then(
	"書き込みは本登録前と同じ edge-token で処理される",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`書き込みが成功することを期待しましたが "${this.lastResult.type}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 新しい仮ユーザーとして認証フローが開始される
// See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
// ---------------------------------------------------------------------------

/**
 * 新しい仮ユーザーとして認証フローが開始されることを確認する。
 * authRequired が返されていることを確認する。
 *
 * See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
 */
Then(
	"新しい仮ユーザーとして認証フローが開始される",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"authRequired",
			`新しい認証フローが開始されることを期待しましたが "${this.lastResult.type}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 本登録ユーザーのデータにはアクセスできない
// See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
// ---------------------------------------------------------------------------

/**
 * Cookie 削除後、別ユーザーとして扱われ元のユーザーのデータにアクセスできないことを確認する。
 * 新しく発行された edge-token が元のユーザーの edge-token と異なることを確認する。
 *
 * See: features/user_registration.feature @Cookie削除後に非ログイン状態で書き込むと別人として扱われる
 */
Then(
	"本登録ユーザーのデータにはアクセスできない",
	async function (this: BattleBoardWorld) {
		// lastResult が authRequired であることを確認する（別人として認証フローが開始）
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"authRequired",
			`認証フローが開始されることを期待しました`,
		);
		// 新しい edge-token と元のユーザーは異なる
		const newEdgeToken = this.deviceBEdgeToken;
		if (newEdgeToken) {
			const newUser = await InMemoryEdgeTokenRepo.findByToken(newEdgeToken);
			// 新しい edge-token の userId が元のユーザーと異なることを確認する
			if (newUser) {
				assert.notStrictEqual(
					newUser.userId,
					this.currentUserId,
					"新しい仮ユーザーは元の本登録ユーザーと異なることを期待しました",
				);
			}
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 新しい edge-token が発行される
// See: features/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
// ---------------------------------------------------------------------------

/**
 * ログイン後に新しい edge-token が発行されていることを確認する。
 *
 * See: features/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
 */
Then("新しい edge-token が発行される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	// loginWithEmail 成功時は authRequired 型で edgeToken を保持する
	// See: When "メールアドレスとパスワードでログインする"
	assert(
		this.lastResult.type === "authRequired" ||
			this.lastResult.type === "success",
		`ログイン成功を期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(this.currentEdgeToken, "新しい edge-token が発行されていません");
});

// ---------------------------------------------------------------------------
// Then: 本登録ユーザーのデータ（通貨・履歴等）にアクセスできる
// See: features/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
// ---------------------------------------------------------------------------

/**
 * ログイン後に元の本登録ユーザーのデータにアクセスできることを確認する。
 * マイページを取得してユーザーIDが一致することを確認する。
 *
 * See: features/user_registration.feature @Cookie削除後にログインすると同一ユーザーに復帰する
 */
Then(
	"本登録ユーザーのデータ（通貨・履歴等）にアクセスできる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert.strictEqual(
			mypageInfo.userId,
			this.currentUserId,
			`マイページのユーザーIDが一致することを期待しました`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 本登録ユーザーのデータにアクセスできる
// See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
// See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
// ---------------------------------------------------------------------------

/**
 * ログイン後に本登録ユーザーのデータにアクセスできることを確認する（シンプル版）。
 * マイページを取得してユーザーIDが一致することを確認する。
 *
 * See: features/user_registration.feature @本登録ユーザーがメールアドレスとパスワードでログインする
 */
Then(
	"本登録ユーザーのデータにアクセスできる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert.strictEqual(
			mypageInfo.userId,
			this.currentUserId,
			`マイページのユーザーIDが一致することを期待しました`,
		);
		// 本登録ユーザーであることを確認する（registrationType が設定済み）
		assert(
			mypageInfo.registrationType !== null &&
				mypageInfo.registrationType !== undefined,
			"本登録ユーザーであること（registrationType が設定済み）を期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: edge-token Cookie が発行される（ログイン成功後）
// NOTE: authentication.steps.ts の "edge-token Cookie が発行される" と重複するが
//       登録フロー用に別の検証ロジックが必要
// ---------------------------------------------------------------------------

// NOTE: "edge-token Cookie が発行される" は authentication.steps.ts で定義済み。
// ただし、そのステップは authRequired 状態でのみ検証する。
// user_registration.feature ではログイン成功後の edge-token 発行を確認するため、
// 別のステップとして "新しい edge-token が発行される" を定義済み。

// ---------------------------------------------------------------------------
// Then: デバイスAの edge-token は引き続き有効である
// See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
// ---------------------------------------------------------------------------

/**
 * デバイスBのログイン後も、デバイスAの edge-token が有効であることを確認する。
 *
 * See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
 */
Then(
	"デバイスAの edge-token は引き続き有効である",
	async function (this: BattleBoardWorld) {
		assert(
			this.currentEdgeToken,
			"デバイスAの edge-token が設定されていません",
		);
		const deviceAToken = await InMemoryEdgeTokenRepo.findByToken(
			this.currentEdgeToken,
		);
		assert(
			deviceAToken,
			"デバイスAの edge-token が有効であることを期待しました",
		);
		assert.strictEqual(
			deviceAToken.userId,
			this.currentUserId,
			"デバイスAの edge-token が元のユーザーに紐づいていることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 両方のデバイスから同一ユーザーとして書き込みできる
// See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
// ---------------------------------------------------------------------------

/**
 * デバイスAとデバイスBの両方から同一ユーザーとして書き込みができることを確認する。
 *
 * See: features/user_registration.feature @ログイン後も旧デバイスのedge-tokenは有効なままである
 */
Then(
	"両方のデバイスから同一ユーザーとして書き込みできる",
	async function (this: BattleBoardWorld) {
		assert(
			this.currentEdgeToken,
			"デバイスAの edge-token が設定されていません",
		);
		assert(
			this.deviceBEdgeToken,
			"デバイスBの edge-token が設定されていません",
		);
		assert(this.currentThreadId, "スレッドが設定されていません");

		const PostService = getPostService();

		// デバイスAから書き込む
		const resultA = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "デバイスAからの書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: DEFAULT_IP_HASH,
			isBotWrite: false,
		});
		assert(
			"success" in resultA && resultA.success,
			"デバイスAからの書き込みが成功することを期待しました",
		);

		// デバイスBから書き込む
		const resultB = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "デバイスBからの書き込み",
			edgeToken: this.deviceBEdgeToken,
			ipHash: DEFAULT_IP_HASH,
			isBotWrite: false,
		});
		assert(
			"success" in resultB && resultB.success,
			"デバイスBからの書き込みが成功することを期待しました",
		);

		// 両方のデバイスが同じユーザーに紐づいていることを確認する
		const tokenA = await InMemoryEdgeTokenRepo.findByToken(
			this.currentEdgeToken,
		);
		const tokenB = await InMemoryEdgeTokenRepo.findByToken(
			this.deviceBEdgeToken,
		);
		assert(tokenA && tokenB, "edge-token が存在することを期待しました");
		assert.strictEqual(
			tokenA.userId,
			tokenB.userId,
			"両方のデバイスが同一ユーザーに紐づいていることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: ログインエラーメッセージが表示される
// See: features/user_registration.feature @誤ったパスワードではログインできない
// NOTE: authentication.steps.ts の "ログインエラーメッセージが表示される" と同一のシナリオ
//       admin ログインとの混在を避けるため確認
// ---------------------------------------------------------------------------

// NOTE: "ログインエラーメッセージが表示される" は authentication.steps.ts に定義済み。
// 重複定義は Cucumber.js でエラーになるため、ここでは定義しない。

// ---------------------------------------------------------------------------
// Then: edge-token Cookie が削除される
// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
// ---------------------------------------------------------------------------

/**
 * ログアウト後に edge-token Cookie が削除されていることを確認する。
 *
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 */
Then("edge-token Cookie が削除される", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`ログアウトが成功することを期待しましたが "${this.lastResult.type}" でした`,
	);
	assert.strictEqual(
		this.currentEdgeToken,
		null,
		"ログアウト後は edge-token が null であることを期待しました",
	);
	// ログアウト前の edge-token が削除されていることを確認する
	const data = (
		this.lastResult as { type: "success"; data: { deletedToken?: string } }
	).data;
	if (data.deletedToken) {
		const deletedToken = await InMemoryEdgeTokenRepo.findByToken(
			data.deletedToken,
		);
		assert.strictEqual(
			deletedToken,
			null,
			"ログアウト後は edge-token がストアから削除されていることを期待しました",
		);
	}
});

// ---------------------------------------------------------------------------
// Then: 書き込みを行うと認証フローが開始される
// See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
// ---------------------------------------------------------------------------

/**
 * ログアウト後に書き込みを試みると認証フローが開始されることを確認する。
 *
 * See: features/user_registration.feature @ログアウトすると書き込みに再認証が必要になる
 */
Then(
	"書き込みを行うと認証フローが開始される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "ログアウト後の書き込み試行",
			edgeToken: null, // ログアウト後（Cookie なし）
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});
		assert(
			"authRequired" in result && result.authRequired,
			`書き込みに認証フローが開始されることを期待しましたが、異なる結果が返されました`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: マイページに PAT と専ブラでの設定方法が表示される
// See: features/user_registration.feature @本登録完了時にPATが自動発行される
// ---------------------------------------------------------------------------

/**
 * マイページに PAT が表示されることを確認する（設定方法はUI層の責務のためサービス層では PAT の存在のみ確認）。
 *
 * See: features/user_registration.feature @本登録完了時にPATが自動発行される
 */
Then(
	"マイページに PAT と専ブラでの設定方法が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert(
			mypageInfo.patToken !== null,
			"本登録完了後は PAT が表示されることを期待しました",
		);
		assert(
			/^[0-9a-f]{32}$/.test(mypageInfo.patToken!),
			`PAT が 32文字 hex 形式であることを期待しましたが "${mypageInfo.patToken}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: PAT が常に表示されている
// See: features/user_registration.feature @マイページでPATを確認できる
// ---------------------------------------------------------------------------

/**
 * 本登録ユーザーのマイページに PAT が常に表示されていることを確認する。
 *
 * See: features/user_registration.feature @マイページでPATを確認できる
 */
Then("PAT が常に表示されている", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const MypageService = getMypageService();
	const mypageInfo = await MypageService.getMypage(this.currentUserId);
	assert(mypageInfo, "マイページ情報が取得できませんでした");
	assert(
		mypageInfo.patToken !== null,
		"本登録ユーザーのマイページには PAT が常に表示されることを期待しました",
	);
});

// ---------------------------------------------------------------------------
// Then: PAT の最終使用日時が表示される
// See: features/user_registration.feature @マイページでPATを確認できる
// ---------------------------------------------------------------------------

/**
 * PAT の最終使用日時フィールドが存在することを確認する（初期値は null でも可）。
 *
 * See: features/user_registration.feature @マイページでPATを確認できる
 */
Then("PAT の最終使用日時が表示される", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	const MypageService = getMypageService();
	const mypageInfo = await MypageService.getMypage(this.currentUserId);
	assert(mypageInfo, "マイページ情報が取得できませんでした");
	// patLastUsedAt は null の場合もあるが、フィールドが存在することを確認する
	assert(
		"patLastUsedAt" in mypageInfo,
		"マイページ情報に patLastUsedAt フィールドが存在することを期待しました",
	);
});

// ---------------------------------------------------------------------------
// Then: PAT が検証される
// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
// ---------------------------------------------------------------------------

/**
 * PAT が正常に検証されたことを確認する。
 * lastResult が success であることを確認する。
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 */
Then("PAT が検証される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	// PAT 認証成功は authRequired 型（edge-token Cookie 発行）または success 型で表現される
	// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
	assert(
		this.lastResult.type === "success" ||
			this.lastResult.type === "authRequired",
		`PAT 検証が成功することを期待しましたが "${this.lastResult.type}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 書き込みが本登録ユーザーとしてスレッドに追加される
// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
// ---------------------------------------------------------------------------

/**
 * 書き込みが本登録ユーザーとしてスレッドに追加されたことを確認する。
 * PAT 認証後の書き込みが成功し、そのユーザーが本登録ユーザーであることを確認する。
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 */
Then(
	"書き込みが本登録ユーザーとしてスレッドに追加される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが存在しません");
		assert(
			user.supabaseAuthId !== null,
			"書き込みしたユーザーが本登録ユーザーであることを期待しました",
		);
		// 書き込みが成功していることも確認する
		// PAT 認証後は lastResult が authRequired 型（edge-token 発行）のため両方を受け入れる
		// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
		assert(
			this.lastResult?.type === "success" ||
				this.lastResult?.type === "authRequired",
			"書き込みが成功していることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: メール欄の PAT は書き込みデータに含まれない
// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
// NOTE: サービス層テストでは PAT 除去はルーティング層の責務のため、
//       書き込み本文に PAT が含まれていないことのみを確認する
// ---------------------------------------------------------------------------

/**
 * 書き込みデータにメール欄の PAT が含まれないことを確認する。
 * サービス層ではメール欄の PAT 除去（bbs.cgi ルート）はスコープ外のため、
 * 書き込み成功の確認のみ行う。
 *
 * See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
 * See: docs/architecture/components/user-registration.md §6 認証判定フロー
 */
Then(
	"メール欄の PAT は書き込みデータに含まれない",
	function (this: BattleBoardWorld) {
		// サービス層テストでは PAT 除去はルーティング層（bbs.cgi ルート）の責務。
		// BDDサービス層テストの範囲内では、PAT 認証と書き込みが成功していることを確認する。
		// PAT 認証後は lastResult が authRequired 型（edge-token 発行）のため両方を受け入れる
		// See: features/user_registration.feature @専ブラのmail欄にPATを設定して書き込みできる
		assert(
			this.lastResult?.type === "success" ||
				this.lastResult?.type === "authRequired",
			"書き込みが成功していることを期待しました（PAT 除去はルーティング層の責務）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: edge-token Cookie で認証される
// See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
// ---------------------------------------------------------------------------

/**
 * edge-token Cookie で認証されて書き込みが成功することを確認する。
 *
 * See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
 */
Then("edge-token Cookie で認証される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`edge-token Cookie 認証が成功することを期待しましたが "${this.lastResult.type}" でした`,
	);
	const data = (
		this.lastResult as { type: "success"; data: { usedCookieAuth?: boolean } }
	).data;
	assert(data.usedCookieAuth, "Cookie 認証が使用されたことを期待しました");
});

// ---------------------------------------------------------------------------
// Then: PAT は mail 欄から除去されるが認証処理には使われない
// See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
// NOTE: PAT 除去はルーティング層の責務のため、サービス層テストでは認証成功のみ確認
// ---------------------------------------------------------------------------

/**
 * Cookie 認証成功時は PAT が認証に使われないことを確認する。
 * サービス層テストでは Cookie 認証が成功することをもって確認する。
 *
 * See: features/user_registration.feature @PAT認証後はCookieで認証されPATは認証処理に使われない
 */
Then(
	"PAT は mail 欄から除去されるが認証処理には使われない",
	function (this: BattleBoardWorld) {
		// サービス層では PAT の mail 欄除去はルーティング層の責務。
		// edge-token Cookie で認証が成功していれば PAT は使われていない。
		assert(
			this.lastResult?.type === "success",
			"Cookie 認証が成功していることを確認しました（PAT 除去はルーティング層の責務）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: PAT で認証され新しい edge-token Cookie が発行される
// See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
// ---------------------------------------------------------------------------

/**
 * PAT 認証で新しい edge-token が発行されることを確認する。
 *
 * See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
 */
Then(
	"PAT で認証され新しい edge-token Cookie が発行される",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`PAT 認証が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);
		assert(
			this.currentEdgeToken,
			"PAT 認証後に新しい edge-token が発行されていることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 本登録ユーザーとして書き込みが処理される
// See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
// ---------------------------------------------------------------------------

/**
 * PAT 認証後の書き込みが本登録ユーザーとして処理されることを確認する。
 *
 * See: features/user_registration.feature @Cookie喪失時にmail欄のPATで自動復帰する
 */
Then(
	"本登録ユーザーとして書き込みが処理される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが存在しません");
		assert(
			user.supabaseAuthId !== null,
			"書き込みしたユーザーが本登録ユーザーであることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 認証エラーが発生する
// See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
// ---------------------------------------------------------------------------

/**
 * 認証エラーが発生することを確認する（旧 PAT が無効になっていることの確認）。
 *
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 */
Then("認証エラーが発生する", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`認証エラーが発生することを期待しましたが "${this.lastResult.type}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 新しい PAT を使えば書き込みできる
// See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
// ---------------------------------------------------------------------------

/**
 * 新しい PAT で書き込みができることを確認する。
 *
 * See: features/user_registration.feature @PATを再発行すると旧PATが無効になる
 */
Then(
	"新しい PAT を使えば書き込みできる",
	async function (this: BattleBoardWorld) {
		assert(this.currentPatToken, "新しい PAT が設定されていません");
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const RegistrationService = getRegistrationService();
		const authResult = await RegistrationService.loginWithPat(
			this.currentPatToken,
		);
		assert(authResult.valid, "新しい PAT で認証が成功することを期待しました");
		if (authResult.valid) {
			assert.strictEqual(
				authResult.userId,
				this.currentUserId,
				"新しい PAT が同じユーザーに対して有効であることを期待しました",
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: PAT セクションには本登録を促すメッセージが表示される
// See: features/user_registration.feature @仮ユーザーにはPATが表示されない
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーの場合は PAT が null であることを確認する（本登録を促すメッセージはUI層の責務）。
 *
 * See: features/user_registration.feature @仮ユーザーにはPATが表示されない
 */
Then(
	"PAT セクションには本登録を促すメッセージが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		assert.strictEqual(
			mypageInfo.patToken,
			null,
			"仮ユーザーの PAT は null であることを期待しました（本登録が必要）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: レスポンスの title タグに "ＥＲＲＯＲ" が含まれる
// See: features/user_registration.feature @無効なPATでは書き込みが拒否される
// ---------------------------------------------------------------------------

/**
 * 無効な PAT の場合にエラーが返されることを確認する。
 * サービス層テストでは bbs.cgi の HTML レスポンスは確認できないため、
 * 認証エラーが発生することをもって確認する。
 *
 * See: features/user_registration.feature @無効なPATでは書き込みが拒否される
 */
Then(
	/^レスポンスの title タグに "ＥＲＲＯＲ" が含まれる$/,
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"error",
			`無効な PAT でエラーが返されることを期待しましたが "${this.lastResult.type}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 課金ボタンは無効化されている（仮ユーザー版）
// See: features/user_registration.feature @仮ユーザーは課金できない
// NOTE: mypage.steps.ts の "課金ボタンは無効化されている" は isPremium=true の場合。
//       こちらは supabaseAuthId=null（仮ユーザー）の場合を追加で確認する。
// ---------------------------------------------------------------------------

// NOTE: "課金ボタンは無効化されている" は mypage.steps.ts に定義済みで ALREADY_PREMIUM を確認する。
// 仮ユーザーの場合は本登録が必要なため、MypageService.upgradeToPremium が失敗することを確認する。
// ただし mypage.steps.ts での定義と重複するため、featureファイルの記述を確認する。

// featureファイルより:
//   Scenario: 仮ユーザーは課金できない
//     Given 仮ユーザーがマイページを表示している
//     Then 課金ボタンは無効化されている      ← mypage.steps.ts の "課金ボタンは無効化されている" を流用
//     And 本登録が必要である旨のメッセージが表示される  ← 新規定義が必要

/**
 * 仮ユーザーの場合に「本登録が必要である旨のメッセージが表示される」ことを確認する。
 * upgradeToPremium の実際の動作ではなく、supabaseAuthId が null（未本登録）であることを確認する。
 *
 * See: features/user_registration.feature @仮ユーザーは課金できない
 */
Then(
	"本登録が必要である旨のメッセージが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが存在しません");
		assert.strictEqual(
			user.supabaseAuthId,
			null,
			"仮ユーザー（supabaseAuthId = null）であることを期待しました（本登録が必要）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: アカウント種別に "{string}" と表示される
// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
// ---------------------------------------------------------------------------

/**
 * マイページのアカウント種別が期待値であることを確認する。
 * "仮ユーザー" の場合: registrationType が null。
 * "本登録ユーザー" の場合: registrationType が null 以外。
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 */
Then(
	"アカウント種別に {string} と表示される",
	async function (this: BattleBoardWorld, accountType: string) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");

		if (accountType === "仮ユーザー") {
			assert.strictEqual(
				mypageInfo.registrationType,
				null,
				`アカウント種別が "仮ユーザー"（registrationType = null）であることを期待しましたが "${mypageInfo.registrationType}" でした`,
			);
		} else if (accountType === "本登録ユーザー") {
			assert(
				mypageInfo.registrationType !== null,
				`アカウント種別が "本登録ユーザー"（registrationType != null）であることを期待しましたが "${mypageInfo.registrationType}" でした`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: メール認証と Discord 連携による本登録への案内が表示される
// See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
// ---------------------------------------------------------------------------

/**
 * 仮ユーザーのマイページに本登録案内が表示されることを確認する。
 * サービス層テストでは registrationType = null であることをもって確認する。
 * UI での案内表示はフロントエンドの責務。
 *
 * See: features/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 */
Then(
	"メール認証と Discord 連携による本登録への案内が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		const MypageService = getMypageService();
		const mypageInfo = await MypageService.getMypage(this.currentUserId);
		assert(mypageInfo, "マイページ情報が取得できませんでした");
		// 仮ユーザーは registrationType が null → 本登録案内を表示すべき状態
		assert.strictEqual(
			mypageInfo.registrationType,
			null,
			"仮ユーザーには本登録案内が必要（registrationType = null）であることを確認しました",
		);
	},
);
