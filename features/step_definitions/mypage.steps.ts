/**
 * mypage.feature ステップ定義
 *
 * マイページ機能（基本表示・ユーザーネーム設定・課金モック・書き込み履歴・通知欄）の
 * シナリオを実装する。
 *
 * D-10 §1 に従いサービス層（MypageService・PostService）を直接呼び出す。
 * APIルートは経由しない。
 *
 * See: features/mypage.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: src/lib/services/mypage-service.ts
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { getGrassIcon } from "../../src/lib/domain/rules/grass-icon";
import {
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用するデフォルト板 ID */
const TEST_BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getMypageService() {
	return require("../../src/lib/services/mypage-service") as typeof import("../../src/lib/services/mypage-service");
}

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

// ---------------------------------------------------------------------------
// Given: 有料ユーザーがマイページを表示している
// See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
// See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
// ---------------------------------------------------------------------------

/**
 * 有料ユーザーとしてログインし、マイページを取得した状態を作る。
 * edge-token を発行してユーザーを作成し、isPremium = true に設定してからマイページを取得する。
 */
Given(
	"有料ユーザーがマイページを表示している",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const MypageService = getMypageService();

		// 有料ユーザーを作成する
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;

		// isPremium を true に設定する
		await InMemoryUserRepo.updateIsPremium(userId, true);
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		this.currentIsPremium = true;

		// マイページを取得して World に保持する
		const result = await MypageService.getMypage(userId);
		this.mypageResult = result;
	},
);

// ---------------------------------------------------------------------------
// Given: 無料ユーザーがマイページを表示している
// See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
// See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
// ---------------------------------------------------------------------------

/**
 * 無料ユーザー（isPremium = false、本登録済み）としてログインし、マイページを取得した状態を作る。
 * 本登録済みであることが必要（仮ユーザーは課金できないため）。
 *
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: features/user_registration.feature @仮ユーザーは課金できない
 */
Given(
	"無料ユーザーがマイページを表示している",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const MypageService = getMypageService();

		// 無料ユーザーを作成する（issueEdgeToken デフォルトは isPremium = false）
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		this.currentIsPremium = false;

		// 本登録済みユーザーに設定する（mypage.feature の課金シナリオでは本登録が前提）
		// See: docs/architecture/components/user-registration.md §11.1
		await InMemoryUserRepo.updateRegistrationType(userId, "email");

		// マイページを取得して World に保持する
		const result = await MypageService.getMypage(userId);
		this.mypageResult = result;
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーが過去に3件の書き込みを行っている
// See: features/mypage.feature @自分の書き込み履歴を確認できる
// ---------------------------------------------------------------------------
// 統合済み: 汎用ステップ「ユーザーが過去に{int}件の書き込みを行っている」
// （本ファイル下部で定義）に統合。seedPostsForUser ヘルパーで任意件数に対応する。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Given: ユーザーがまだ書き込みを行っていない
// See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
// ---------------------------------------------------------------------------

/**
 * 書き込みが0件の状態を作る。
 * ログイン済みユーザーを作成するだけで、書き込みは行わない。
 */
Given(
	"ユーザーがまだ書き込みを行っていない",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		// ユーザーをログイン済みにする（書き込みは行わない）
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
	},
);

// ---------------------------------------------------------------------------
// When: マイページを表示する
// See: features/mypage.feature @マイページに基本情報が表示される
// See: features/mypage.feature @マイページに通知欄が存在する
// See: features/currency.feature @マイページで通貨残高を確認する
// ---------------------------------------------------------------------------

/**
 * MypageService.getMypage を呼び出してマイページ情報を取得する。
 * 結果は World の mypageResult に格納し、Then ステップで参照する。
 */
When("マイページを表示する", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	const MypageService = getMypageService();

	const result = await MypageService.getMypage(this.currentUserId);
	this.mypageResult = result;
	this.lastResult =
		result !== null
			? { type: "success", data: result }
			: {
					type: "error",
					message: "ユーザーが見つかりません",
					code: "USER_NOT_FOUND",
				};
});

// ---------------------------------------------------------------------------
// When: ユーザーネーム "{string}" を設定する
// See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
// ---------------------------------------------------------------------------

/**
 * MypageService.setUsername を呼び出してユーザーネームを設定する。
 */
When(
	"ユーザーネーム {string} を設定する",
	async function (this: BattleBoardWorld, username: string) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		const result = await MypageService.setUsername(
			this.currentUserId,
			username,
		);

		if (result.success) {
			this.currentUsername = result.username;
			this.lastResult = { type: "success", data: result };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: 課金ボタンを押す
// See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
// ---------------------------------------------------------------------------

/**
 * MypageService.upgradeToPremium を呼び出して有料ステータスに切り替える。
 */
When("課金ボタンを押す", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	const MypageService = getMypageService();

	const result = await MypageService.upgradeToPremium(this.currentUserId);

	if (result.success) {
		this.currentIsPremium = true;
		this.lastResult = { type: "success", data: result };
	} else {
		this.lastResult = {
			type: "error",
			message: result.error,
			code: result.code,
		};
	}
});

// ---------------------------------------------------------------------------
// When: マイページの書き込み履歴を表示する
// See: features/mypage.feature @自分の書き込み履歴を確認できる
// See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
// ---------------------------------------------------------------------------

/**
 * MypageService.getPostHistory を呼び出して書き込み履歴を取得する。
 * 結果は World の postHistoryResult（PaginatedPostHistory 型）に格納する。
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 */
When(
	"マイページの書き込み履歴を表示する",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		// getPostHistory は PaginatedPostHistory を返す
		const result = await MypageService.getPostHistory(this.currentUserId);
		this.postHistoryResult = result;
		this.lastResult = { type: "success", data: result };
	},
);

// ---------------------------------------------------------------------------
// Then: 通貨残高が表示される
// See: features/mypage.feature @マイページに基本情報が表示される
// ---------------------------------------------------------------------------

/**
 * mypageResult に balance フィールドが存在することを確認する。
 */
Then("通貨残高が表示される", function (this: BattleBoardWorld) {
	assert(this.mypageResult !== null, "マイページ情報が取得されていません");
	assert(
		typeof this.mypageResult.balance === "number",
		`通貨残高が数値であることを期待しましたが "${typeof this.mypageResult.balance}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: アカウント情報（メールアドレス、有料/無料ステータス）が表示される
// See: features/mypage.feature @マイページに基本情報が表示される
// ---------------------------------------------------------------------------

/**
 * mypageResult に userId と isPremium フィールドが存在することを確認する。
 *
 * NOTE: CR-002修正により authToken はAPIレスポンスから除去済み。
 *   authToken（edge-token）はセキュリティ上の理由でJSONレスポンスに含めない。
 *   アカウント識別子としては userId を使用する。
 *   See: tmp/reports/code_review_phase1.md CR-002
 */
Then(
	"アカウント情報（メールアドレス、有料\\/無料ステータス）が表示される",
	function (this: BattleBoardWorld) {
		assert(this.mypageResult !== null, "マイページ情報が取得されていません");
		assert(
			typeof this.mypageResult.userId === "string" &&
				this.mypageResult.userId.length > 0,
			"userId（アカウント識別子）が取得できていません",
		);
		assert(
			typeof this.mypageResult.isPremium === "boolean",
			`有料/無料ステータスが boolean であることを期待しましたが "${typeof this.mypageResult.isPremium}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザーネームが "{string}" に更新される
// See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
// ---------------------------------------------------------------------------

/**
 * setUsername が成功し、World のユーザーネームが期待値に更新されていることを確認する。
 */
Then(
	"ユーザーネームが {string} に更新される",
	function (this: BattleBoardWorld, expectedUsername: string) {
		assert(this.lastResult !== null, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`ユーザーネーム設定が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);
		assert.strictEqual(
			this.currentUsername,
			expectedUsername,
			`ユーザーネームが "${expectedUsername}" であることを期待しましたが "${this.currentUsername}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 以降の書き込みに "{string}" が表示される
// See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
// ---------------------------------------------------------------------------

/**
 * ユーザーネーム設定後に書き込みを行い、displayName にそのユーザーネームが使用されることを確認する。
 * PostService.createPost を呼び出して結果を検証する。
 */
Then(
	"以降の書き込みに {string} が表示される",
	async function (this: BattleBoardWorld, expectedUsername: string) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		assert(this.currentEdgeToken, "edgeToken が設定されていません");

		const PostService = getPostService();

		// テスト用スレッドを作成する（スレッドが設定されていない場合）
		if (!this.currentThreadId) {
			const threadResult = await PostService.createThread(
				{
					boardId: TEST_BOARD_ID,
					title: "ユーザーネームテスト用スレッド",
					firstPostBody: "テスト本文",
				},
				this.currentEdgeToken,
				this.currentIpHash,
			);
			assert(
				threadResult.success && threadResult.thread,
				"スレッドの作成に失敗しました",
			);
			this.currentThreadId = threadResult.thread.id;
		}

		// ユーザーネーム設定後に書き込みを行う
		const postResult = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "ユーザーネーム確認用書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		// 書き込みが成功したことを確認する
		assert(
			"success" in postResult && postResult.success,
			"書き込みが成功することを期待しました",
		);

		// postId を使ってインメモリリポジトリから Post を取得し displayName を確認する
		const successResult = postResult as {
			success: true;
			postId: string;
			postNumber: number;
			systemMessages: [];
		};
		const createdPost = await InMemoryPostRepo.findById(successResult.postId);
		assert(
			createdPost !== null,
			`postId "${successResult.postId}" のレスが見つかりません`,
		);
		assert.strictEqual(
			createdPost.displayName,
			expectedUsername,
			`書き込みの表示名が "${expectedUsername}" であることを期待しましたが "${createdPost.displayName}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザーネーム設定は利用不可と表示される
// See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
// ---------------------------------------------------------------------------

/**
 * 無料ユーザーがユーザーネームを設定しようとした際に NOT_PREMIUM エラーが返ることを確認する。
 * 設定を試みてエラーになることを検証する。
 */
Then(
	"ユーザーネーム設定は利用不可と表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		// 無料ユーザーがユーザーネーム設定を試みる
		const result = await MypageService.setUsername(
			this.currentUserId,
			"テストユーザー名",
		);

		assert.strictEqual(
			result.success,
			false,
			"無料ユーザーのユーザーネーム設定が失敗することを期待しました",
		);

		if (!result.success) {
			assert.strictEqual(
				result.code,
				"NOT_PREMIUM",
				`エラーコードが "NOT_PREMIUM" であることを期待しましたが "${result.code}" でした`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 有料ユーザーステータスに切り替わる
// See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
// ---------------------------------------------------------------------------

/**
 * upgradeToPremium が成功し、getMypage で取得したユーザーの isPremium が true であることを確認する。
 */
Then(
	"有料ユーザーステータスに切り替わる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		assert(this.lastResult !== null, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`課金が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);

		// マイページを再取得して isPremium が true になっていることを確認する
		const MypageService = getMypageService();
		const updatedInfo = await MypageService.getMypage(this.currentUserId);
		assert(updatedInfo !== null, "マイページ情報が取得できませんでした");
		assert.strictEqual(
			updatedInfo.isPremium,
			true,
			`有料ステータスが true であることを期待しましたが ${updatedInfo.isPremium} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: ユーザーネーム設定が利用可能になる
// See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
// ---------------------------------------------------------------------------

/**
 * 有料ステータスになった後にユーザーネーム設定が成功することを確認する。
 * setUsername を呼び出して成功することを検証する。
 */
Then(
	"ユーザーネーム設定が利用可能になる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		// 有料ステータスになった後にユーザーネームを設定できることを確認する
		const result = await MypageService.setUsername(
			this.currentUserId,
			"新ユーザーネーム",
		);

		assert.strictEqual(
			result.success,
			true,
			`有料ステータス後のユーザーネーム設定が成功することを期待しましたが失敗しました: ${
				!result.success ? result.error : ""
			}`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 課金ボタンは無効化されている
// See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
// ---------------------------------------------------------------------------

/**
 * 課金が許可されていないユーザー（既に有料 or 仮ユーザー）に対して upgradeToPremium が
 * ALREADY_PREMIUM または NOT_REGISTERED エラーを返すことを確認する。
 * ボタン無効化はUI層の責務だが、サービス層でも同等の制約を確認する。
 *
 * See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 * See: features/user_registration.feature @仮ユーザーは課金できない
 */
Then("課金ボタンは無効化されている", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	const MypageService = getMypageService();

	// 課金が許可されていないユーザーの場合は upgradeToPremium が失敗することを確認する
	const result = await MypageService.upgradeToPremium(this.currentUserId);

	assert.strictEqual(
		result.success,
		false,
		"課金が許可されていないユーザーへの課金が失敗することを期待しました",
	);

	if (!result.success) {
		const allowedCodes = ["ALREADY_PREMIUM", "NOT_REGISTERED"];
		assert(
			allowedCodes.includes(result.code),
			`エラーコードが "ALREADY_PREMIUM" または "NOT_REGISTERED" であることを期待しましたが "${result.code}" でした`,
		);
	}
});

// ---------------------------------------------------------------------------
// Then: 自分の書き込み一覧が表示される
// See: features/mypage.feature @自分の書き込み履歴を確認できる
// ---------------------------------------------------------------------------

/**
 * postHistoryResult が存在し、件数が正であることを確認する。
 * PaginatedPostHistory の posts 配列を参照する。
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 */
Then("自分の書き込み一覧が表示される", function (this: BattleBoardWorld) {
	assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
	assert(
		this.postHistoryResult.posts.length > 0,
		`書き込み履歴が 1 件以上あることを期待しましたが 0 件でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 各書き込みのスレッド名、本文、書き込み日時が含まれる
// See: features/mypage.feature @自分の書き込み履歴を確認できる
// ---------------------------------------------------------------------------

/**
 * postHistoryResult の各アイテムに threadTitle・body・createdAt が含まれることを確認する。
 * threadTitle は searchByAuthorId の threads JOIN により取得する。
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: tmp/workers/bdd-architect_TASK-237/design.md §3.2 threads JOIN の根拠
 */
Then(
	"各書き込みのスレッド名、本文、書き込み日時が含まれる",
	function (this: BattleBoardWorld) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert(
			this.postHistoryResult.posts.length > 0,
			"書き込み履歴が存在していません",
		);

		for (const item of this.postHistoryResult.posts) {
			// スレッドタイトルが存在することを確認する（threads JOIN の結果）
			assert(
				typeof item.threadTitle === "string" && item.threadTitle.length > 0,
				"threadTitle（スレッド名）が存在しません",
			);
			assert(
				typeof item.body === "string" && item.body.length > 0,
				"書き込み本文が存在しません",
			);
			assert(
				item.createdAt instanceof Date,
				"書き込み日時が Date 型であることを期待しました",
			);
		}
	},
);

// ---------------------------------------------------------------------------
// 注意: "まだ書き込みがありません" と表示される
// See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
// ---------------------------------------------------------------------------
// "{string} と表示される" ステップは thread.steps.ts で定義しており、
// そこでマイページの書き込み履歴0件ケースにも対応している。
// 重複定義を避けるため、本ファイルでは定義しない。
// See: docs/architecture/bdd_test_strategy.md §4 ファイル分割方針
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 通知欄が表示される
// See: features/mypage.feature @マイページに通知欄が存在する
// ---------------------------------------------------------------------------

/**
 * マイページに通知欄（Phase 2以降で使用予定）が存在することを確認する。
 * MVP では空配列でよい。mypageResult が取得できていれば通知欄の枠は存在する。
 *
 * See: features/mypage.feature @マイページに通知欄が存在する （Phase 2以降で本格利用）
 */
Then("通知欄が表示される", function (this: BattleBoardWorld) {
	assert(
		this.mypageResult !== null,
		"マイページ情報が取得されていません（通知欄の存在確認のためマイページが必要）",
	);
	// Phase 1 では通知欄は枠として存在するだけでよい。
	// mypageResult が取得できていれば、UI側で通知欄（空配列）を表示できる状態にある。
	// Phase 2 以降でこのステップに通知件数の検証を追加する。
});

// ---------------------------------------------------------------------------
// Given: ユーザーの草カウントが {int} である
// See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
// See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
// ---------------------------------------------------------------------------

/**
 * 指定された草カウントを持つユーザーを作成し、ログイン済み状態にする。
 * InMemoryUserRepo に直接 grassCount を設定することで、
 * GrassHandler を経由せずにテスト前提条件を構築する。
 *
 * See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
 * See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
 */
Given(
	"ユーザーの草カウントが {int} である",
	async function (this: BattleBoardWorld, grassCount: number) {
		const AuthService = getAuthService();

		// ユーザーをログイン済みにする
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;

		// 指定された草カウントを設定する（GrassHandler を経由せずに直接設定）
		// See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
		await InMemoryUserRepo.updateGrassCount(userId, grassCount);
	},
);

// ---------------------------------------------------------------------------
// Then: 草カウント "{string}" が表示される
// See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
// See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
// ---------------------------------------------------------------------------

/**
 * mypageResult の grassCount・grassIcon から「🌳 25本」形式の文字列を生成し、
 * 期待値と一致することを確認する。
 *
 * 表示フォーマット: "{grassIcon} {grassCount}本"
 * 例: "🌳 25本"（25本）、"🌱 0本"（0本）
 *
 * See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
 * See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
 * See: src/lib/domain/rules/grass-icon.ts @getGrassIcon
 */
Then(
	"草カウント {string} が表示される",
	function (this: BattleBoardWorld, expectedDisplay: string) {
		assert(
			this.mypageResult !== null,
			"マイページ情報が取得されていません（草カウント表示の確認のためマイページが必要）",
		);

		const { grassCount, grassIcon } = this.mypageResult;

		// grassCount と grassIcon が存在することを確認する
		assert(
			typeof grassCount === "number",
			`grassCount が数値であることを期待しましたが "${typeof grassCount}" でした`,
		);
		assert(
			typeof grassIcon === "string" && grassIcon.length > 0,
			`grassIcon が文字列であることを期待しましたが "${typeof grassIcon}" でした`,
		);

		// 表示フォーマット "{grassIcon} {grassCount}本" を生成して期待値と比較する
		// See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
		const actualDisplay = `${grassIcon} ${grassCount}本`;
		assert.strictEqual(
			actualDisplay,
			expectedDisplay,
			`草カウント表示が "${expectedDisplay}" であることを期待しましたが "${actualDisplay}" でした`,
		);

		// grassIcon が getGrassIcon(grassCount) と一致することを確認する（ドメインルールとの整合性）
		const expectedIcon = getGrassIcon(grassCount);
		assert.strictEqual(
			grassIcon,
			expectedIcon,
			`草アイコンが getGrassIcon(${grassCount})="${expectedIcon}" と一致することを期待しましたが "${grassIcon}" でした`,
		);
	},
);

// ===========================================================================
// ページネーション — Given/When/Then
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ===========================================================================

// ---------------------------------------------------------------------------
// ヘルパー関数: 任意件数の書き込みをシードする
// ---------------------------------------------------------------------------

/**
 * テスト用にユーザーをログイン済みにし、指定件数のレスをシードする。
 * PostService.createPost を使うと初回呼び出しでウェルカムシーケンスが発動するため、
 * InMemoryPostRepo._insert で直接挿入し、時系列順を保証する。
 *
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 */
async function seedPostsForUser(
	world: BattleBoardWorld,
	count: number,
	bodyPrefix = "テスト書き込み",
): Promise<void> {
	const AuthService = getAuthService();
	const PostService = getPostService();

	// ユーザーが未作成の場合のみ作成する
	if (!world.currentUserId) {
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		world.currentEdgeToken = token;
		world.currentUserId = userId;
		world.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止
		seedDummyPost(userId);
	}

	// スレッドが未作成の場合のみ作成する
	if (!world.currentThreadId) {
		const threadResult = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: "ページネーションテスト用スレッド",
				firstPostBody: `${bodyPrefix} 1`,
			},
			world.currentEdgeToken!,
			world.currentIpHash,
		);
		assert(
			threadResult.success && threadResult.thread,
			"スレッドの作成に失敗しました",
		);
		world.currentThreadId = threadResult.thread.id;
		world.currentThreadTitle = threadResult.thread.title;

		// createThread で1件目が作成済み。残り count - 1 件を _insert でシードする
		const baseTime = new Date("2026-03-01T00:00:00.000Z").getTime();
		for (let i = 2; i <= count; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: world.currentThreadId,
				postNumber: i,
				authorId: world.currentUserId!,
				displayName: "名無しさん",
				dailyId: "TESTPOST",
				body: `${bodyPrefix} ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				// 時系列順: i が大きいほど新しい
				createdAt: new Date(baseTime + i * 60000),
			});
		}
	} else {
		// スレッドが既に存在する場合は追加でシードする
		const baseTime = new Date("2026-03-01T00:00:00.000Z").getTime();
		for (let i = 1; i <= count; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: world.currentThreadId,
				postNumber: 100 + i,
				authorId: world.currentUserId!,
				displayName: "名無しさん",
				dailyId: "TESTPOST",
				body: `${bodyPrefix} ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(baseTime + i * 60000),
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Given: ユーザーが過去にN件の書き込みを行っている
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * 指定件数の書き込みを持つユーザーを作成する。
 * 既存の「3件」ステップとパターンが異なるため別定義。
 * N=30, 100, 120 で使用される。
 */
Given(
	"ユーザーが過去に{int}件の書き込みを行っている",
	async function (this: BattleBoardWorld, count: number) {
		await seedPostsForUser(this, count);
	},
);

// ---------------------------------------------------------------------------
// Given: うちN件の本文に "{string}" が含まれている
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 既にシードされた書き込みのうち、指定件数の本文を特定キーワードを含む内容に書き換える。
 * seedPostsForUser で作成済みのレスの一部を更新する。
 */
Given(
	"うち{int}件の本文に {string} が含まれている",
	async function (this: BattleBoardWorld, matchCount: number, keyword: string) {
		assert(this.currentUserId, "ユーザーが先に作成されている必要があります");

		// InMemoryPostRepo から該当ユーザーの書き込みを取得する
		const posts = await InMemoryPostRepo.findByAuthorId(this.currentUserId, {
			limit: 1000,
		});
		// システムメッセージとダミー投稿を除外する
		const userPosts = posts.filter(
			(p) => !p.isSystemMessage && p.body !== "__seed_for_welcome_bypass__",
		);

		assert(
			userPosts.length >= matchCount,
			`${matchCount}件の書き込みを書き換えるには少なくとも${matchCount}件のユーザー書き込みが必要ですが、${userPosts.length}件しかありません`,
		);

		// 先頭 matchCount 件のレスの本文にキーワードを含める
		for (let i = 0; i < matchCount; i++) {
			const post = userPosts[i];
			InMemoryPostRepo._insert({
				...post,
				body: `${keyword} を含むテスト書き込み ${i + 1}`,
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: 書き込み履歴の1ページ目を表示している
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * 書き込み履歴の1ページ目を取得済みの状態を作る。
 */
Given(
	"書き込み履歴の1ページ目を表示している",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		const result = await MypageService.getPostHistory(this.currentUserId, {
			page: 1,
		});
		this.postHistoryResult = result;
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーが2026年3月1日から3月21日の間に書き込みを行っている
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 2026年3月1日から3月21日の間に日付を分散させた書き込みをシードする。
 * 日付範囲フィルタのテストに使用する。
 */
Given(
	"ユーザーが2026年3月1日から3月21日の間に書き込みを行っている",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// ユーザーをログイン済みにする
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		seedDummyPost(userId);

		// スレッドを作成する
		const threadResult = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: "日付範囲テスト用スレッド",
				firstPostBody: "3月1日の書き込み",
			},
			token,
			DEFAULT_IP_HASH,
		);
		assert(
			threadResult.success && threadResult.thread,
			"スレッドの作成に失敗しました",
		);
		this.currentThreadId = threadResult.thread.id;
		this.currentThreadTitle = threadResult.thread.title;

		// 3月1日から3月21日まで各日に1件ずつレスをシードする（合計21件）
		// createThread で3月1日の1件目が作成済み。残りは _insert でシードする
		for (let day = 2; day <= 21; day++) {
			const dateStr = `2026-03-${String(day).padStart(2, "0")}`;
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: day,
				authorId: userId,
				displayName: "名無しさん",
				dailyId: "DATETEST",
				body: `${dateStr}の草テスト書き込み`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(`${dateStr}T12:00:00.000Z`),
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: キーワード "{string}" に該当する書き込みが{int}件ある
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 特定キーワードを含む書き込みを指定件数シードする。
 * 検索結果のページネーション検証に使用する。
 */
Given(
	"キーワード {string} に該当する書き込みが{int}件ある",
	async function (this: BattleBoardWorld, keyword: string, count: number) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// ユーザーをログイン済みにする
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		seedDummyPost(userId);

		// スレッドを作成する
		const threadResult = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: "検索ページネーションテスト用スレッド",
				firstPostBody: `${keyword} テスト書き込み 1`,
			},
			token,
			DEFAULT_IP_HASH,
		);
		assert(
			threadResult.success && threadResult.thread,
			"スレッドの作成に失敗しました",
		);
		this.currentThreadId = threadResult.thread.id;

		// 残り count - 1 件をシードする
		const baseTime = new Date("2026-03-01T00:00:00.000Z").getTime();
		for (let i = 2; i <= count; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: userId,
				displayName: "名無しさん",
				dailyId: "KWTEST",
				body: `${keyword} テスト書き込み ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(baseTime + i * 60000),
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーが過去に書き込みを行っている
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 少数の書き込みを持つユーザーを作成する。
 * 検索結果が0件となるシナリオの前提条件として使用する。
 */
Given(
	"ユーザーが過去に書き込みを行っている",
	async function (this: BattleBoardWorld) {
		await seedPostsForUser(this, 5, "一般的な書き込み");
	},
);

// ===========================================================================
// ページネーション — When
// ===========================================================================

// ---------------------------------------------------------------------------
// When: 2ページ目に遷移する
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * MypageService.getPostHistory を page=2 で呼び出す。
 */
When("2ページ目に遷移する", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	const MypageService = getMypageService();

	const result = await MypageService.getPostHistory(this.currentUserId, {
		page: 2,
	});
	this.postHistoryResult = result;
	this.lastResult = { type: "success", data: result };
});

// ---------------------------------------------------------------------------
// When: キーワード "{string}" で書き込み履歴を検索する
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * MypageService.getPostHistory を keyword 付きで呼び出す。
 */
When(
	"キーワード {string} で書き込み履歴を検索する",
	async function (this: BattleBoardWorld, keyword: string) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		const result = await MypageService.getPostHistory(this.currentUserId, {
			keyword,
		});
		this.postHistoryResult = result;
		this.lastResult = { type: "success", data: result };
	},
);

// ---------------------------------------------------------------------------
// When: 開始日 "{string}" 終了日 "{string}" で絞り込む
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * MypageService.getPostHistory を startDate/endDate 付きで呼び出す。
 */
When(
	"開始日 {string} 終了日 {string} で絞り込む",
	async function (this: BattleBoardWorld, startDate: string, endDate: string) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		const result = await MypageService.getPostHistory(this.currentUserId, {
			startDate,
			endDate,
		});
		this.postHistoryResult = result;
		this.lastResult = { type: "success", data: result };
	},
);

// ---------------------------------------------------------------------------
// When: キーワード "{string}" かつ開始日 "{string}" 終了日 "{string}" で検索する
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * MypageService.getPostHistory を keyword + startDate/endDate で呼び出す。
 */
When(
	"キーワード {string} かつ開始日 {string} 終了日 {string} で検索する",
	async function (
		this: BattleBoardWorld,
		keyword: string,
		startDate: string,
		endDate: string,
	) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const MypageService = getMypageService();

		const result = await MypageService.getPostHistory(this.currentUserId, {
			keyword,
			startDate,
			endDate,
		});
		this.postHistoryResult = result;
		this.lastResult = { type: "success", data: result };
	},
);

// ===========================================================================
// ページネーション — Then
// ===========================================================================

// ---------------------------------------------------------------------------
// Then: N件すべてが新しい順に表示される
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * postHistoryResult が指定件数を含み、新しい順であることを確認する。
 */
Then(
	"{int}件すべてが新しい順に表示される",
	function (this: BattleBoardWorld, expectedCount: number) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert.strictEqual(
			this.postHistoryResult.posts.length,
			expectedCount,
			`書き込み履歴が ${expectedCount} 件であることを期待しましたが ${this.postHistoryResult.posts.length} 件でした`,
		);
		// 新しい順（created_at DESC）であることを確認する
		assertDescendingOrder(this.postHistoryResult.posts);
	},
);

// ---------------------------------------------------------------------------
// Then: ページネーションは表示されない
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * totalPages が 1（= ページネーション不要）であることを確認する。
 */
Then("ページネーションは表示されない", function (this: BattleBoardWorld) {
	assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
	assert.strictEqual(
		this.postHistoryResult.totalPages,
		1,
		`totalPages が 1 であることを期待しましたが ${this.postHistoryResult.totalPages} でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 最新の50件が新しい順に表示される
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * 1ページ目の50件が返され、新しい順であることを確認する。
 */
Then("最新の50件が新しい順に表示される", function (this: BattleBoardWorld) {
	assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
	assert.strictEqual(
		this.postHistoryResult.posts.length,
		50,
		`1ページ目の件数が 50 であることを期待しましたが ${this.postHistoryResult.posts.length} 件でした`,
	);
	assert.strictEqual(
		this.postHistoryResult.page,
		1,
		`ページ番号が 1 であることを期待しましたが ${this.postHistoryResult.page} でした`,
	);
	assertDescendingOrder(this.postHistoryResult.posts);
});

// ---------------------------------------------------------------------------
// Then: ページネーションが表示される（全Nページ）
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * totalPages が期待値に一致することを確認する。
 */
Then(
	"ページネーションが表示される（全{int}ページ）",
	function (this: BattleBoardWorld, expectedPages: number) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert.strictEqual(
			this.postHistoryResult.totalPages,
			expectedPages,
			`totalPages が ${expectedPages} であることを期待しましたが ${this.postHistoryResult.totalPages} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 51件目から100件目が新しい順に表示される
// See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
// ---------------------------------------------------------------------------

/**
 * 2ページ目の50件が返され、新しい順であることを確認する。
 */
Then(
	"51件目から100件目が新しい順に表示される",
	function (this: BattleBoardWorld) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert.strictEqual(
			this.postHistoryResult.page,
			2,
			`ページ番号が 2 であることを期待しましたが ${this.postHistoryResult.page} でした`,
		);
		assert.strictEqual(
			this.postHistoryResult.posts.length,
			50,
			`2ページ目の件数が 50 であることを期待しましたが ${this.postHistoryResult.posts.length} 件でした`,
		);
		assertDescendingOrder(this.postHistoryResult.posts);
	},
);

// ===========================================================================
// 検索 — Then
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ===========================================================================

// ---------------------------------------------------------------------------
// Then: 該当するN件が新しい順に表示される
// ---------------------------------------------------------------------------

/**
 * 検索結果が指定件数で新しい順であることを確認する。
 */
Then(
	"該当する{int}件が新しい順に表示される",
	function (this: BattleBoardWorld, expectedCount: number) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert.strictEqual(
			this.postHistoryResult.total,
			expectedCount,
			`検索結果の総件数が ${expectedCount} であることを期待しましたが ${this.postHistoryResult.total} でした`,
		);
		assert.strictEqual(
			this.postHistoryResult.posts.length,
			expectedCount,
			`表示件数が ${expectedCount} であることを期待しましたが ${this.postHistoryResult.posts.length} 件でした`,
		);
		assertDescendingOrder(this.postHistoryResult.posts);
	},
);

// ---------------------------------------------------------------------------
// Then: その期間内の書き込みのみが新しい順に表示される
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 日付範囲フィルタ結果が新しい順で、全件が期間内であることを確認する。
 * テストデータ: 3/1-3/21 の21件から 3/10-3/15 の6件を抽出。
 */
Then(
	"その期間内の書き込みのみが新しい順に表示される",
	function (this: BattleBoardWorld) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert(this.postHistoryResult.posts.length > 0, "検索結果が 0 件です");

		// 全件が期間内（2026-03-10 ~ 2026-03-15）であることを確認する
		const startMs = new Date("2026-03-10T00:00:00.000Z").getTime();
		const endMs = new Date("2026-03-15T23:59:59.999Z").getTime();

		for (const post of this.postHistoryResult.posts) {
			const postMs = post.createdAt.getTime();
			assert(
				postMs >= startMs && postMs <= endMs,
				`書き込み "${post.body}" の日時 ${post.createdAt.toISOString()} が期間外です`,
			);
		}
		assertDescendingOrder(this.postHistoryResult.posts);
	},
);

// ---------------------------------------------------------------------------
// Then: 期間内かつ本文に "{string}" を含む書き込みのみが表示される
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 日付範囲+キーワード複合検索の結果を確認する。
 */
Then(
	"期間内かつ本文に {string} を含む書き込みのみが表示される",
	function (this: BattleBoardWorld, keyword: string) {
		assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
		assert(this.postHistoryResult.posts.length > 0, "検索結果が 0 件です");

		// 全件が期間内であることを確認する
		const startMs = new Date("2026-03-10T00:00:00.000Z").getTime();
		const endMs = new Date("2026-03-15T23:59:59.999Z").getTime();

		for (const post of this.postHistoryResult.posts) {
			const postMs = post.createdAt.getTime();
			assert(
				postMs >= startMs && postMs <= endMs,
				`書き込み "${post.body}" の日時 ${post.createdAt.toISOString()} が期間外です`,
			);
			// 本文にキーワードが含まれていることを確認する
			assert(
				post.body.toLowerCase().includes(keyword.toLowerCase()),
				`書き込み "${post.body}" に "${keyword}" が含まれていません`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 最新の50件が表示される
// See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
// ---------------------------------------------------------------------------

/**
 * 検索結果の1ページ目が50件であることを確認する。
 * ページネーション＋検索の組み合わせシナリオで使用する。
 */
Then("最新の50件が表示される", function (this: BattleBoardWorld) {
	assert(this.postHistoryResult !== null, "書き込み履歴が取得されていません");
	assert.strictEqual(
		this.postHistoryResult.posts.length,
		50,
		`表示件数が 50 であることを期待しましたが ${this.postHistoryResult.posts.length} 件でした`,
	);
	assert.strictEqual(
		this.postHistoryResult.page,
		1,
		`ページ番号が 1 であることを期待しましたが ${this.postHistoryResult.page} でした`,
	);
});

// ===========================================================================
// ヘルパー: 降順確認
// ===========================================================================

/**
 * posts 配列が createdAt の降順（新しい順）であることを確認する。
 *
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 */
function assertDescendingOrder(posts: { createdAt: Date }[]): void {
	for (let i = 1; i < posts.length; i++) {
		assert(
			posts[i - 1].createdAt.getTime() >= posts[i].createdAt.getTime(),
			`書き込み履歴が新しい順でありません: ` +
				`[${i - 1}] ${posts[i - 1].createdAt.toISOString()} < ` +
				`[${i}] ${posts[i].createdAt.toISOString()}`,
		);
	}
}
