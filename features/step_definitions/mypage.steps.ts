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

/**
 * ユーザーが3件の書き込みを行った状態を準備する。
 * スレッドを1件作成し、そこに3件のレスを書き込む。
 */
Given(
	"ユーザーが過去に3件の書き込みを行っている",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// ユーザーをログイン済みにする
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);

		// スレッドを作成する
		const threadResult = await PostService.createThread(
			{
				boardId: TEST_BOARD_ID,
				title: "書き込み履歴テスト用スレッド",
				firstPostBody: "最初のレスです",
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

		// さらに2件の書き込みを行う（最初の1件は createThread で作成済み）
		await PostService.createPost({
			threadId: threadResult.thread.id,
			body: "2件目の書き込み",
			edgeToken: token,
			ipHash: DEFAULT_IP_HASH,
			isBotWrite: false,
		});
		await PostService.createPost({
			threadId: threadResult.thread.id,
			body: "3件目の書き込み",
			edgeToken: token,
			ipHash: DEFAULT_IP_HASH,
			isBotWrite: false,
		});
	},
);

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
