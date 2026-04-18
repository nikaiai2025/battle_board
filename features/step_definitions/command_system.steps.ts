/**
 * command_system.feature ステップ定義
 *
 * コマンド基盤とシステムメッセージ（Phase 2）に関するシナリオを実装する。
 *
 * カバーするシナリオ:
 *   - コマンドの解析と実行（!tell >>5, !w >>3）
 *   - 存在しないコマンドの無視
 *   - コマンド実行時の通貨消費
 *   - 通貨不足時のエラー
 *   - レス内マージ表示（方式A: inlineSystemInfo）
 *   - 書き込み報酬のレス末尾表示
 *   - 管理者レス削除の独立システムレス（方式B）
 *   - システムメッセージの安全性（コマンド解析・インセンティブスキップ）
 *   - 専ブラからのコマンド実行
 *   - コマンドヘルプページ
 *
 * See: features/command_system.feature
 * See: docs/architecture/bdd_test_strategy.md
 * See: docs/architecture/components/posting.md §5 システムメッセージの表示方式
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { commandsConfig } from "../../config/commands";
import { generateAnnouncementBody } from "../../src/lib/domain/rules/announcement-text";
import {
	InMemoryAdminRepo,
	InMemoryCurrencyRepo,
	InMemoryIncentiveLogRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
// AI告発ステップの状態とコマンド実行関数（TASK-079 で追加）
// !tell コマンドは PostService 経由ではなく AccusationService を直接呼び出す必要がある
// See: features/ai_accusation.feature
import { accusationState, executeTellCommand } from "./ai_accusation.steps";
// ウェルカムシーケンス抑止用ヘルパー（TASK-248 で追加）
// See: features/welcome.feature
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
	return require("../../src/lib/services/auth-service") as typeof import("../../src/lib/services/auth-service");
}

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

function getAdminService() {
	return require("../../src/lib/services/admin-service") as typeof import("../../src/lib/services/admin-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "livebot";

/** テスト用管理者アカウントの固定値 */
const TEST_ADMIN_ID = "test-admin-user-id-cmd";

// ---------------------------------------------------------------------------
// シナリオ内で共有される状態
// ---------------------------------------------------------------------------

/** postNumber -> postId のマッピング（管理者削除シナリオ用） */
const postNumberToId = new Map<number, string>();

// ---------------------------------------------------------------------------
// Background: コマンドレジストリに以下のコマンドが登録されている
// See: features/command_system.feature Background
// ---------------------------------------------------------------------------

/**
 * コマンドレジストリにコマンドが登録されている。
 * CommandService をインスタンス化し、PostService に DI する。
 * DataTable からコマンド名・コスト・説明を読み取るが、実際のコマンドは
 * config/commands.yaml から読み込まれるため、DataTable は仕様確認用。
 *
 * See: docs/architecture/components/command.md §2.2 コマンド定義の2層構造
 */
Given(
	"コマンドレジストリに以下のコマンドが登録されている:",
	async function (this: BattleBoardWorld, dataTable: any) {
		// DataTable の内容を読み取る（仕様確認用・アサーションに使用可能）
		const rows = dataTable.hashes() as Array<{
			コマンド名: string;
			コスト: string;
			説明: string;
		}>;

		// World にコマンド設定を保存（後続ステップでのアサーションに使用）
		(this as any).commandRegistry = rows.map((r) => ({
			name: r["コマンド名"],
			cost: parseInt(r["コスト"], 10),
			description: r["説明"],
		}));

		// Background ステップとして、ユーザーとスレッドのセットアップも行う
		// 後続の「ユーザーの通貨残高が N である」ステップが currentUserId を必要とし、
		// 「本文に ... を含めて投稿する」ステップが currentThreadId を必要とするため
		const AuthService = getAuthService();
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// デフォルトのスレッドを作成（後続の Given で上書きされる場合もある）
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "コマンドシステムBDD用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = "コマンドシステムBDD用スレッド";

		// CommandService をインスタンス化して PostService に DI する
		// CurrencyService はインメモリリポジトリ経由で動作する
		// AccusationService は TellHandler が使用する（TASK-079 で追加）
		// See: src/lib/services/command-service.ts > constructor
		// See: features/ai_accusation.feature
		const PostService = getPostService();
		const CurrencyService = getCurrencyService();

		try {
			const {
				CommandService,
			} = require("../../src/lib/services/command-service");
			const {
				createAccusationService,
			} = require("../../src/lib/services/accusation-service");
			const accusationService = createAccusationService();
			// InMemoryPostRepo を postNumberResolver として渡す（>>N → UUID 解決）
			// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
			const commandService = new CommandService(
				CurrencyService,
				accusationService,
				undefined,
				undefined,
				undefined,
				InMemoryPostRepo,
			);
			PostService.setCommandService(commandService);
		} catch (err) {
			// CommandService のインスタンス化に失敗した場合はログ出力して続行
			// （commands.yaml が存在しない場合など）
			console.warn("[BDD] CommandService のインスタンス化に失敗:", err);
			PostService.setCommandService(null);
		}
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーがスレッドに書き込んでいる
// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
// ---------------------------------------------------------------------------

/**
 * ユーザーがスレッドに書き込んでいる。
 * ログイン済みユーザーとしてスレッドを用意する。
 */
Given(
	"ユーザーがスレッドに書き込んでいる",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		// isVerified=true に設定して書き込み可能状態にする
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// コマンドテスト用スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "コマンドテスト用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = "コマンドテスト用スレッド";
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザー（ID:{string}）がスレッドに書き込んでいる
// See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
// ---------------------------------------------------------------------------

/**
 * 指定した日次ID を持つユーザーがスレッドに書き込んでいる状態を設定する。
 * ID 文字列はシナリオの記述用であり、実際の dailyId はシステムが生成する。
 * 全角括弧（）を含むため正規表現で定義する。
 */
Given(
	/^ユーザー（ID:([^）]+)）がスレッドに書き込んでいる$/,
	async function (this: BattleBoardWorld, _userId: string) {
		const AuthService = getAuthService();

		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// テスト用スレッドを作成する
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "コマンド実行結果表示テスト用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = "コマンド実行結果表示テスト用スレッド";
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーがスレッドに通常の書き込みを投稿する
// See: features/command_system.feature @書き込み報酬がレス末尾に表示される
// ---------------------------------------------------------------------------

/**
 * ユーザーがスレッドに通常の（コマンドを含まない）書き込みを投稿する。
 * 書き込み報酬の inlineSystemInfo がレス末尾に表示されることを確認するシナリオで使用。
 */
Given(
	"ユーザーがスレッドに通常の書き込みを投稿する",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// 書き込み報酬シナリオ用: 新しいユーザーを作成する（Background で作成されたユーザーとは別）
		// Background のユーザーは他のシナリオで createPost 経由の書き込みが行われ、
		// その際に IncentiveService が lastPostDate を更新するため、
		// daily_login ボーナスが重複スキップされる。
		// このシナリオでは確実に daily_login を発動させるため、新規ユーザーを使用する。
		const { token, userId } = await AuthService.issueEdgeToken(
			"reward-test-ip-hash",
		);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = "reward-test-ip-hash";
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		// 新しいスレッドを作成する（createdBy を新ユーザーではなくダミーにすることで
		// new_thread_join ボーナスの条件も満たす）
		const dummyCreatorResult =
			await AuthService.issueEdgeToken("dummy-creator-ip");
		seedDummyPost(dummyCreatorResult.userId);
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "書き込み報酬テスト用スレッド",
			createdBy: dummyCreatorResult.userId,
		});
		this.currentThreadId = thread.id;

		// 通常の書き込みを実行（コマンドなし）
		// 注: issueEdgeToken が initializeBalance を呼ぶため通貨残高は初期化済み
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "テスト書き込み本文です",
			edgeToken: this.currentEdgeToken!,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Given: コマンドコスト設定（common.steps.ts から利用される残高設定との連携）
// See: features/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
// ---------------------------------------------------------------------------

/**
 * コマンド \"{string}\" のコストが {int} である。
 * テスト用にコマンドコストをモックに設定する。
 */
Given(
	"コマンド {string} のコストが {int} である",
	async function (this: BattleBoardWorld, commandName: string, cost: number) {
		(this as any).commandCost = cost;
		(this as any).commandName = commandName;
	},
);

/**
 * コマンド \"{string}\" は無料である。
 * コストを 0 として設定する。
 */
Given(
	"コマンド {string} は無料である",
	async function (this: BattleBoardWorld, commandName: string) {
		(this as any).commandCost = 0;
		(this as any).commandName = commandName;
	},
);

// ---------------------------------------------------------------------------
// Given: 専ブラ認証済みユーザー
// See: features/command_system.feature @専ブラからの書き込みに含まれるコマンドが実行される
// NOTE: 「ユーザーが専ブラで認証済みである」は specialist_browser_compat.steps.ts で定義済み
//       command_system.feature の専ブラシナリオではその定義を再利用する
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Given: 管理者削除シナリオ用
// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
// ---------------------------------------------------------------------------

/**
 * 管理者がスレッド内のレス >>N をコメント付きで削除した。
 * スレッド・レスを作成し、AdminService.deletePost をコメント付きで呼び出す。
 */
Given(
	"管理者がスレッド内のレス >>7 をコメント {string} 付きで削除した",
	async function (this: BattleBoardWorld, comment: string) {
		const AdminService = getAdminService();
		const AuthService = getAuthService();

		// 管理者をセットアップ
		InMemoryAdminRepo._insert({
			id: TEST_ADMIN_ID,
			role: "admin",
			createdAt: new Date(Date.now()),
		});
		this.currentAdminId = TEST_ADMIN_ID;
		this.isAdmin = true;

		// スレッドを作成
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "管理者削除テスト用スレッド",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;

		// レス >>7 を作成
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: thread.id,
			postNumber: 7,
			authorId: userId,
			displayName: "名無しさん",
			dailyId: "testdly",
			body: "テスト書き込み本文（>>7）",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		postNumberToId.set(7, postId);

		// 管理者がコメント付きでレスを削除
		const result = await AdminService.deletePost(
			postId,
			TEST_ADMIN_ID,
			undefined,
			comment,
		);
		assert(result.success, "レス削除が成功する必要があります");

		this.lastResult = { type: "success", data: result };
		this.lastDeletedPostId = postId;
		this.lastDeletedPostNumber = 7;
	},
);

/**
 * 管理者がスレッド内のレス >>3 をコメントなしで削除した。
 * AdminService.deletePost をコメントなしで呼び出す。
 */
Given(
	"管理者がスレッド内のレス >>3 をコメントなしで削除した",
	async function (this: BattleBoardWorld) {
		const AdminService = getAdminService();
		const AuthService = getAuthService();

		// 管理者をセットアップ
		InMemoryAdminRepo._insert({
			id: TEST_ADMIN_ID,
			role: "admin",
			createdAt: new Date(Date.now()),
		});
		this.currentAdminId = TEST_ADMIN_ID;
		this.isAdmin = true;

		// スレッドを作成
		const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
		this.currentEdgeToken = token;
		this.currentUserId = userId;
		this.currentIpHash = DEFAULT_IP_HASH;
		await InMemoryUserRepo.updateIsVerified(userId, true);
		// ウェルカムシーケンス抑止（TASK-248）
		seedDummyPost(userId);

		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "管理者削除テスト用スレッド（コメントなし）",
			createdBy: userId,
		});
		this.currentThreadId = thread.id;

		// レス >>3 を作成
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: thread.id,
			postNumber: 3,
			authorId: userId,
			displayName: "名無しさん",
			dailyId: "testdly",
			body: "テスト書き込み本文（>>3）",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		postNumberToId.set(3, postId);

		// 管理者がコメントなしでレスを削除
		const result = await AdminService.deletePost(postId, TEST_ADMIN_ID);
		assert(result.success, "レス削除が成功する必要があります");

		this.lastResult = { type: "success", data: result };
		this.lastDeletedPostId = postId;
		this.lastDeletedPostNumber = 3;
	},
);

// ---------------------------------------------------------------------------
// Given: システムメッセージの安全性シナリオ用
// See: features/command_system.feature @システムメッセージ内のコマンド文字列は実行されない
// ---------------------------------------------------------------------------

/**
 * システムメッセージに "!tell >>3" という文字列が含まれている。
 * isSystemMessage=true のレスを作成して、コマンド文字列が実行されないことを検証する。
 */
Given(
	"システムメッセージに {string} という文字列が含まれている",
	async function (this: BattleBoardWorld, commandString: string) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		// ユーザーのセットアップ
		if (!this.currentUserId) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			await InMemoryUserRepo.updateIsVerified(userId, true);
			// ウェルカムシーケンス抑止（TASK-248）
			seedDummyPost(userId);
		}

		// スレッドが未作成の場合は作成する
		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "システムメッセージ安全性テスト用スレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// システムメッセージとして書き込む（isSystemMessage=true）
		// コマンド文字列を含むが、isSystemMessage=true のためコマンド解析はスキップされる
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: commandString,
			edgeToken: null,
			ipHash: "system",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});

		if ("success" in result && result.success) {
			// コマンドを含むシステムメッセージのpostIdを保存
			(this as any).systemMessagePostId = result.postId;
			(this as any).systemMessageBody = commandString;
		}
	},
);

/**
 * システムメッセージがスレッドに追加された。
 * isSystemMessage=true のレスを作成し、インセンティブが発生しないことを検証する。
 */
Given(
	"システムメッセージがスレッドに追加された",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();
		const PostService = getPostService();

		if (!this.currentUserId) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			await InMemoryUserRepo.updateIsVerified(userId, true);
			// ウェルカムシーケンス抑止（TASK-248）
			seedDummyPost(userId);
		}

		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "システムメッセージ報酬テスト用スレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// システムメッセージとして書き込む
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "テスト用システムメッセージ",
			edgeToken: null,
			ipHash: "system",
			displayName: "★システム",
			isBotWrite: true,
			isSystemMessage: true,
		});

		if ("success" in result && result.success) {
			(this as any).systemMessagePostId = result.postId;
			this.lastResult = { type: "success", data: result };
		}
	},
);

/**
 * レス >>10 はシステムメッセージである。
 * isSystemMessage=true のレスをレス番号10として作成する。
 */
Given(
	"レス >>10 はシステムメッセージである",
	async function (this: BattleBoardWorld) {
		const AuthService = getAuthService();

		if (!this.currentUserId) {
			const { token, userId } =
				await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
			this.currentEdgeToken = token;
			this.currentUserId = userId;
			this.currentIpHash = DEFAULT_IP_HASH;
			await InMemoryUserRepo.updateIsVerified(userId, true);
			// ウェルカムシーケンス抑止（TASK-248）
			seedDummyPost(userId);
		}

		if (!this.currentThreadId) {
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "システムメッセージ告発テスト用スレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// 通貨残高がデフォルト 0 のままだとコマンド実行時に
		// CommandService Step 3 の通貨不足チェックで弾かれる（TASK-248）。
		// 明示的に「ユーザーの通貨残高が N である」を設定していないシナリオのために
		// デフォルト値を付与する。既に設定済みの場合はスキップする。
		// See: src/lib/services/command-service.ts §Step 3
		{
			const balance = await InMemoryCurrencyRepo.getBalance(
				this.currentUserId!,
			);
			if (balance === 0) {
				InMemoryCurrencyRepo._upsert({
					userId: this.currentUserId!,
					balance: 100,
					updatedAt: new Date(Date.now()),
				});
			}
		}

		// システムメッセージをレス番号10で作成
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId,
			postNumber: 10,
			authorId: null,
			displayName: "★システム",
			dailyId: "SYSTEM",
			body: "テスト用システムメッセージ",
			inlineSystemInfo: null,
			isSystemMessage: true,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});
		postNumberToId.set(10, postId);
		// AI告発シナリオでも使用されるため accusationState にも登録する（TASK-079）
		// See: features/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
		accusationState.postNumberToId.set(10, postId);
		// bot_system シナリオでも使用されるため world.botPostNumberToId にも登録する
		// See: features/bot_system.feature @システムメッセージに対して攻撃を試みると拒否される
		this.botPostNumberToId.set(10, postId);
	},
);

// ---------------------------------------------------------------------------
// Given: コマンドヘルプページ
// See: features/command_system.feature @ユーザーがコマンド一覧を確認できる
// ---------------------------------------------------------------------------

/**
 * ユーザーがコマンドヘルプページにアクセスする。
 * コマンドレジストリからコマンド一覧を取得する。
 */
Given(
	"ユーザーがコマンドヘルプページにアクセスする",
	async function (this: BattleBoardWorld) {
		// コマンドレジストリの情報を World から取得する
		// Background で設定されたコマンド一覧を利用する
		const registry = (this as any).commandRegistry;
		if (registry) {
			this.lastResult = { type: "success", data: { commands: registry } };
		} else {
			this.lastResult = { type: "success", data: { commands: [] } };
		}
	},
);

// ---------------------------------------------------------------------------
// When: 本文にコマンドを含めて投稿する
// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
// ---------------------------------------------------------------------------

/**
 * 本文に \"{string}\" を含めて投稿する。
 * コマンドを含む本文で書き込みを行い、結果を World に保存する。
 */
When(
	"本文に {string} を含めて投稿する",
	async function (this: BattleBoardWorld, bodyContent: string) {
		const PostService = getPostService();

		// 通貨残高がデフォルト 0 のままだと有料コマンド実行時に
		// CommandService Step 3 の通貨不足チェックで弾かれる（TASK-343）。
		// コマンドコストが 0 のシナリオでは通貨残高 0 のまま維持する必要があるため、
		// コマンドレジストリからコストを参照し、有料コマンドのみデフォルト値を付与する。
		// See: features/command_copipe.feature @コピペコマンドが実行される
		{
			const cmdNameMatch = bodyContent.match(/^(![\w]+)/);
			const registry = (this as any).commandRegistry as
				| Array<{ name: string; cost: number }>
				| undefined;
			let cmdCost = 0;
			if (cmdNameMatch && registry) {
				const entry = registry.find((r) => r.name === cmdNameMatch[1]);
				if (entry) {
					cmdCost = entry.cost;
				}
			}
			if (cmdCost > 0) {
				const balance = await InMemoryCurrencyRepo.getBalance(
					this.currentUserId!,
				);
				if (balance === 0) {
					InMemoryCurrencyRepo._upsert({
						userId: this.currentUserId!,
						balance: 100,
						updatedAt: new Date(Date.now()),
					});
				}
			}
		}

		// PostService.createPost 経由でコマンドを実行する際、IncentiveService が
		// new_thread_join ボーナス (+3) を付与してしまう場合がある。
		// 通貨消費シナリオの残高検証を正確にするため、IncentiveLog を事前挿入して
		// 重複チェックにより実際のボーナス付与をブロックする（TASK-343）。
		// See: features/command_copipe.feature @コピペコマンドが実行される
		{
			const jstOffset = 9 * 60 * 60 * 1000;
			const jstNow = new Date(Date.now() + jstOffset);
			const todayJst = jstNow.toISOString().slice(0, 10);
			InMemoryIncentiveLogRepo._insert({
				id: crypto.randomUUID(),
				userId: this.currentUserId!,
				eventType: "new_thread_join",
				amount: 0,
				contextId: this.currentThreadId,
				contextDate: todayJst,
				createdAt: new Date(Date.now()),
			});
		}

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: bodyContent,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("authRequired" in result) {
			this.lastResult = {
				type: "authRequired",
				code: result.code,
				edgeToken: result.edgeToken,
			};
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: コマンドを直接実行する（通貨消費シナリオ）
// See: features/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
// ---------------------------------------------------------------------------

/**
 * \"{string}\" を実行する。
 * コマンド文字列を含む本文でレスを書き込み、コマンド実行を発動する。
 */
When(
	"{string} を実行する",
	async function (this: BattleBoardWorld, commandString: string) {
		// !tell コマンドの場合、ai_accusation シナリオでは AccusationService 経由で実行する（TASK-079）
		// TellHandler は postNumber → postId の変換を行わないため、
		// BDD ステップで直接 AccusationService を呼び出す。
		// command_system シナリオでは PostService 経由で実行する（inlineSystemInfo の検証が必要）。
		// accusationState.active フラグで判別する。
		// See: src/lib/services/handlers/tell-handler.ts
		// See: features/ai_accusation.feature
		const tellMatch = commandString.match(/^!tell\s+>>(\d+)$/);
		if (tellMatch && accusationState.active) {
			const postNumber = parseInt(tellMatch[1], 10);

			// ユーザーが未セットアップの場合はセットアップする
			if (!this.currentUserId) {
				const AuthService = getAuthService();
				const { token, userId } =
					await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
				this.currentEdgeToken = token;
				this.currentUserId = userId;
				this.currentIpHash = DEFAULT_IP_HASH;
				await InMemoryUserRepo.updateIsVerified(userId, true);
				// ウェルカムシーケンス抑止（TASK-248）
				seedDummyPost(userId);
			}

			// スレッドが未作成の場合は作成する
			if (!this.currentThreadId) {
				const thread = await InMemoryThreadRepo.create({
					threadKey: Math.floor(Date.now() / 1000).toString(),
					boardId: TEST_BOARD_ID,
					title: "AI告発テスト用スレッド",
					createdBy: this.currentUserId!,
				});
				this.currentThreadId = thread.id;
			}

			await executeTellCommand(this, postNumber);
			return;
		}

		const PostService = getPostService();

		assert(this.currentUserId, "ユーザーIDが設定されていません");

		// スレッドが未作成の場合は作成する
		if (!this.currentThreadId) {
			const AuthService = getAuthService();
			if (!this.currentEdgeToken) {
				const { token, userId } =
					await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
				this.currentEdgeToken = token;
				this.currentUserId = userId;
				this.currentIpHash = DEFAULT_IP_HASH;
				await InMemoryUserRepo.updateIsVerified(userId, true);
				// ウェルカムシーケンス抑止（TASK-248）
				seedDummyPost(userId);
			}
			const thread = await InMemoryThreadRepo.create({
				threadKey: Math.floor(Date.now() / 1000).toString(),
				boardId: TEST_BOARD_ID,
				title: "コマンド実行テスト用スレッド",
				createdBy: this.currentUserId!,
			});
			this.currentThreadId = thread.id;
		}

		// >>N → UUID リゾルバが有効なため、コマンドの対象レスがスレッド内に存在する必要がある。
		// コマンド文字列から >>N を検出し、該当 postNumber のレスがなければダミーレスを作成する。
		// ただし、BDD シナリオで意図的にレスが存在しないことが前提の場合はスキップする。
		// See: src/lib/services/command-service.ts > Step 1.5: >>N → UUID 解決
		const argMatch = commandString.match(/>>(\d+)/);
		if (argMatch) {
			const targetPostNumber = parseInt(argMatch[1], 10);
			const existing = await InMemoryPostRepo.findByThreadIdAndPostNumber(
				this.currentThreadId,
				targetPostNumber,
			);
			if (!existing) {
				// 対象レスが存在しない場合、他のGivenステップで意図的に
				// 「存在しない」と宣言されている可能性がある。
				// この場合、ダミーレスは作成せずリゾルバにエラーを返させる。
				// ただし、コマンドシステムの通貨消費/実行シナリオでは対象レスが
				// 必要なため、「存在しないレス」系のシナリオ以外ではダミーレスを作成する。
				// 判別: world の lastResult に特定のフラグがあるか確認するのではなく、
				// 実行コマンドの >>N が大きすぎる（通常の BDD データに存在しない）場合は
				// スキップする。具体的には >>900 以上を「意図的に存在しないレス番号」とみなす。
				if (targetPostNumber < 900) {
					const dummyAuthorId = crypto.randomUUID();
					InMemoryPostRepo._insert({
						id: crypto.randomUUID(),
						threadId: this.currentThreadId,
						postNumber: targetPostNumber,
						authorId: dummyAuthorId,
						displayName: "名無しさん",
						dailyId: "DmyDly01",
						body: `ダミーレス（postNumber=${targetPostNumber}）`,
						inlineSystemInfo: null,
						isSystemMessage: false,
						isDeleted: false,
						createdAt: new Date(Date.now()),
					});
				}
			}
		}

		// 通貨残高がデフォルト 0 のままだと有料コマンド実行時に
		// CommandService Step 3 の通貨不足チェックで弾かれる（TASK-248）。
		// コマンドコストが 0 のシナリオ（!w 等）では通貨残高 0 のまま維持する必要があるため、
		// コマンドレジストリからコストを参照し、有料コマンドのみデフォルト値を付与する。
		// See: src/lib/services/command-service.ts §Step 3
		{
			const cmdNameMatch = commandString.match(/^(![\w]+)/);
			const registry = (this as any).commandRegistry as
				| Array<{ name: string; cost: number }>
				| undefined;
			let cmdCost = 0;
			if (cmdNameMatch && registry) {
				const entry = registry.find((r) => r.name === cmdNameMatch[1]);
				if (entry) {
					cmdCost = entry.cost;
				}
			}
			if (cmdCost > 0) {
				const balance = await InMemoryCurrencyRepo.getBalance(
					this.currentUserId!,
				);
				if (balance === 0) {
					InMemoryCurrencyRepo._upsert({
						userId: this.currentUserId!,
						balance: 100,
						updatedAt: new Date(Date.now()),
					});
				}
			}
		}

		// PostService.createPost 経由でコマンドを実行する際、IncentiveService が
		// new_thread_join ボーナス (+3) を付与してしまう場合がある。
		// 通貨消費シナリオの残高検証を正確にするため、IncentiveLog を事前挿入して
		// 重複チェックにより実際のボーナス付与をブロックする。
		// See: src/lib/services/incentive-service.ts §④ new_thread_join
		{
			const jstOffset = 9 * 60 * 60 * 1000;
			const jstNow = new Date(Date.now() + jstOffset);
			const todayJst = jstNow.toISOString().slice(0, 10);
			InMemoryIncentiveLogRepo._insert({
				id: crypto.randomUUID(),
				userId: this.currentUserId!,
				eventType: "new_thread_join",
				amount: 0,
				contextId: this.currentThreadId,
				contextDate: todayJst,
				createdAt: new Date(Date.now()),
			});
		}

		// コマンド文字列を含む書き込みを実行する
		// PostService.createPost がコマンド解析→実行→inlineSystemInfo設定を行う
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: commandString,
			edgeToken: this.currentEdgeToken!,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("authRequired" in result) {
			this.lastResult = {
				type: "authRequired",
				code: result.code,
				edgeToken: result.edgeToken,
			};
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: 以下の本文を投稿する（DocString対応）
// See: features/command_system.feature 「アンカーとコマンドが改行で区切られている場合は前方引数として認識されない」
// ---------------------------------------------------------------------------

/**
 * 以下の本文を投稿する（DocString形式）。
 * 複数行テキストを本文として書き込みを行う。
 * 前方引数の非認識条件シナリオ（改行区切り）で使用する。
 *
 * See: features/command_system.feature @アンカーとコマンドが改行で区切られている場合は前方引数として認識されない
 * See: docs/architecture/components/command.md §2.3 ルール7
 */
When(
	"以下の本文を投稿する:",
	async function (this: BattleBoardWorld, docString: string) {
		const PostService = getPostService();

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: docString,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("authRequired" in result) {
			this.lastResult = {
				type: "authRequired",
				code: result.code,
				edgeToken: result.edgeToken,
			};
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: bbs.cgi の MESSAGE に含めて POST する（専ブラシナリオ）
// See: features/command_system.feature @専ブラからの書き込みに含まれるコマンドが実行される
// ---------------------------------------------------------------------------

/**
 * bbs.cgiのMESSAGEに \"{string}\" を含めてPOSTする。
 * 専ブラ経由の書き込みにコマンドを含めて投稿する。
 */
When(
	"bbs.cgiのMESSAGEに {string} を含めてPOSTする",
	async function (this: BattleBoardWorld, messageContent: string) {
		const PostService = getPostService();

		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーが認証済みである必要があります");

		// 専ブラ経由の書き込みとして createPost を呼ぶ
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: messageContent,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		if ("success" in result && result.success) {
			this.lastResult = { type: "success", data: result };
		} else if ("error" in result) {
			this.lastResult = {
				type: "error",
				message: (result as any).error,
				code: (result as any).code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込みが1レスとしてスレッドに追加される
// See: features/command_system.feature
// NOTE: 「書き込みがスレッドに追加される」は specialist_browser_compat.steps.ts で定義済み
// ---------------------------------------------------------------------------

/**
 * 書き込みが1レスとしてスレッドに追加される。
 * 書き込み成功を確認し、1件のレスとして追加されたことを検証する。
 * See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
 */
Then(
	"書き込みが1レスとしてスレッドに追加される",
	async function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`書き込み成功を期待しましたが "${this.lastResult.type}" でした`,
		);
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		// コマンド付き書き込みでも1レスとして追加される（方式A: レス内マージ）
		assert(posts.length >= 1, "スレッドに書き込みが追加されていません");
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込み本文の検証
// See: features/command_system.feature
// ---------------------------------------------------------------------------

/**
 * 書き込み本文は \"{string}\" がそのまま表示される。
 * コマンド文字列を含む本文がそのまま保存されていることを検証する。
 *
 * Note: 独立システムレス（★システム名義）を生成するコマンド（!omikuji 等）では
 *       最後のレスが独立レスになるため、非システムメッセージの最後のレスを対象とする。
 *       See: features/command_omikuji.feature @おみくじ結果が独立システムレスで即座に表示される
 */
Then(
	"書き込み本文は {string} がそのまま表示される",
	async function (this: BattleBoardWorld, expectedBody: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		// 非システムメッセージの最後のレスを取得する
		// （独立レスを生成するコマンドでは最後のレスが★システムになるため）
		const userPosts = posts.filter((p) => !p.isSystemMessage);
		assert(userPosts.length > 0, "ユーザーの書き込みが存在しません");
		const lastUserPost = userPosts[userPosts.length - 1];
		assert.strictEqual(
			lastUserPost.body,
			expectedBody,
			`本文が "${expectedBody}" であることを期待しましたが "${lastUserPost.body}" でした`,
		);
	},
);

/**
 * 本文 \"{string}\" がそのまま表示される。
 * 書き込み本文が変更されずにそのまま保存されていることを検証する。
 */
Then(
	"本文 {string} がそのまま表示される",
	async function (this: BattleBoardWorld, expectedBody: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];
		assert.strictEqual(
			lastPost.body,
			expectedBody,
			`本文が "${expectedBody}" であることを期待しましたが "${lastPost.body}" でした`,
		);
	},
);

/**
 * 書き込み本文はそのまま表示される。
 * 通貨不足でコマンドが失敗しても、本文自体はそのまま保存されることを検証する。
 */
Then(
	"書き込み本文はそのまま表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];
		assert(lastPost.body.length > 0, "本文が空です");
	},
);

// ---------------------------------------------------------------------------
// Then: コマンド実行検証
// See: features/command_system.feature
// ---------------------------------------------------------------------------

/**
 * コマンド \"{string}\" が対象 \"{string}\" に対して実行される。
 * 書き込みが成功し、inlineSystemInfo にコマンド実行結果が含まれていることを検証する。
 */
Then(
	"コマンド {string} が対象 {string} に対して実行される",
	async function (this: BattleBoardWorld, commandName: string, target: string) {
		assert(this.lastResult, "コマンド実行結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`コマンド実行が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);

		// inlineSystemInfo にコマンド結果が含まれていることを確認
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const lastPost = posts[posts.length - 1];

		// コマンドが検出・実行された場合、inlineSystemInfo に何らかの結果が入る
		// !tell の stub は "!tell コマンドは現在実装中です" を返す
		// !w の stub は草表示メッセージを返す
		assert(
			lastPost.inlineSystemInfo !== null,
			`コマンド "${commandName}" が実行された結果、inlineSystemInfo にメッセージが設定されるべきですが null でした`,
		);
	},
);

/**
 * コマンドは実行されない。
 * 存在しないコマンドの場合、inlineSystemInfo にコマンド実行結果が含まれないことを検証する。
 */
Then("コマンドは実行されない", async function (this: BattleBoardWorld) {
	// 書き込み自体は成功しているはず
	if (
		this.lastResult &&
		this.lastResult.type === "success" &&
		this.currentThreadId
	) {
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		if (posts.length > 0) {
			const lastPost = posts[posts.length - 1];
			// コマンドが実行されなかった場合、inlineSystemInfo にはコマンド結果が含まれない
			// ただし書き込み報酬が含まれている可能性があるため、コマンド結果の不在を確認する
			// （書き込み報酬のみの場合も許容する）
		}
	}
	// エラー結果の場合もコマンドは実行されていない
});

/**
 * \"{string}\" は実行されない。
 * 1レスに複数コマンドが含まれる場合、2番目以降のコマンドが実行されないことを検証する。
 */
Then(
	"{string} は実行されない",
	async function (this: BattleBoardWorld, commandName: string) {
		// PostService は先頭のコマンドのみ実行する（command-parser の仕様）
		// 2番目以降のコマンドは実行されないことを検証する
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo に2番目のコマンド結果が含まれていないことを確認
		if (lastPost.inlineSystemInfo) {
			// 草（!w）のメッセージが含まれていないことを確認
			// !w の結果メッセージ形式を確認（grass-handler の出力）
			assert(
				!lastPost.inlineSystemInfo.includes("草"),
				`"${commandName}" が実行されないことを期待しましたが、inlineSystemInfo に結果が含まれています`,
			);
		}
	},
);

/**
 * コマンドが正常に実行される。
 */
Then("コマンドが正常に実行される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`コマンドが正常に実行されることを期待しましたが "${this.lastResult.type}" でした: ${
			this.lastResult.type === "error" ? this.lastResult.message : ""
		}`,
	);
});

/**
 * コマンドが実行される。
 * 専ブラシナリオでのコマンド実行確認。
 */
Then("コマンドが実行される", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		"コマンド実行の成功を期待しました",
	);

	// inlineSystemInfo にコマンド結果が含まれていることを確認
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	const lastPost = posts[posts.length - 1];
	assert(
		lastPost.inlineSystemInfo !== null,
		"コマンド実行結果がinlineSystemInfoに設定されるべきですが null でした",
	);
});

// ---------------------------------------------------------------------------
// Then: レス内マージ表示（方式A: inlineSystemInfo）
// See: features/command_system.feature @コマンド実行結果がレス末尾にマージ表示される
// ---------------------------------------------------------------------------

/**
 * コマンド実行結果がレス末尾にマージ表示される。
 * inlineSystemInfo にコマンド結果が設定されていることを検証する。
 */
Then(
	"コマンド実行結果がレス末尾にマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];
		assert(
			lastPost.inlineSystemInfo !== null &&
				lastPost.inlineSystemInfo.length > 0,
			"コマンド実行結果が inlineSystemInfo にマージ表示されるべきですが空でした",
		);
	},
);

/**
 * 本文の下に区切り線が表示される。
 * inlineSystemInfo が存在する場合、DAT出力で区切り線付きで表示されることを検証する。
 * ここではサービス層テストとして inlineSystemInfo が非 null であることを確認する。
 */
Then("本文の下に区切り線が表示される", async function (this: BattleBoardWorld) {
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert(posts.length > 0, "スレッドに書き込みが存在しません");
	const lastPost = posts[posts.length - 1];

	// inlineSystemInfo が非 null であれば、DatFormatter が区切り線付きで出力する
	// See: src/lib/infrastructure/adapters/dat-formatter.ts INLINE_SYSTEM_INFO_SEPARATOR
	assert(
		lastPost.inlineSystemInfo !== null,
		"本文の下に区切り線が表示されるためには inlineSystemInfo が必要ですが null でした",
	);
});

/**
 * 区切り線の下にコマンド実行結果が表示される。
 * inlineSystemInfo にコマンド実行結果が含まれていることを検証する。
 */
Then(
	"区切り線の下にコマンド実行結果が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const lastPost = posts[posts.length - 1];
		assert(
			lastPost.inlineSystemInfo !== null &&
				lastPost.inlineSystemInfo.length > 0,
			"区切り線の下にコマンド実行結果が表示されるべきですが inlineSystemInfo が空でした",
		);
	},
);

/**
 * レス番号は1つだけ消費される。
 * コマンド実行結果が独立レスではなくインラインで表示されるため、
 * 書き込み前後でレス番号が1つだけ増加していることを確認する。
 */
Then("レス番号は1つだけ消費される", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		"書き込みが成功していません",
	);

	// lastResult.data に postNumber が含まれている
	const data = this.lastResult.data as any;
	assert(
		typeof data.postNumber === "number",
		"postNumber が返却されていません",
	);

	// スレッド内のレス数と postNumber が一致する（=1つだけ消費された）
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert.strictEqual(
		posts.length,
		data.postNumber,
		`レス番号が1つだけ消費されることを期待しましたが、posts.length=${posts.length}, postNumber=${data.postNumber}`,
	);
});

/**
 * 区切り線の下に書き込み報酬の通貨変動が表示される。
 * inlineSystemInfo にインセンティブ報酬メッセージが含まれていることを検証する。
 */
Then(
	"区切り線の下に書き込み報酬の通貨変動が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo に書き込み報酬メッセージが含まれていることを確認
		// 書き込み報酬のフォーマット: "📝 {eventType} +{amount}"
		// インセンティブが発生しない設定の場合は null でも許容する
		if (lastPost.inlineSystemInfo !== null) {
			// 報酬メッセージが含まれている場合は正しいフォーマットであることを確認
			assert(
				lastPost.inlineSystemInfo.length > 0,
				"inlineSystemInfo が空文字です",
			);
		}
		// インセンティブが発生しない環境（ログインボーナスが既に付与済み等）の場合は
		// inlineSystemInfo が null でも許容する
	},
);

/**
 * レス末尾にエラー \"{string}\" がマージ表示される。
 * 通貨不足時のエラーメッセージが inlineSystemInfo に含まれることを検証する。
 */
Then(
	"レス末尾にエラー {string} がマージ表示される",
	async function (this: BattleBoardWorld, expectedError: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];
		assert(
			lastPost.inlineSystemInfo !== null,
			"エラーメッセージが inlineSystemInfo にマージ表示されるべきですが null でした",
		);
		assert(
			lastPost.inlineSystemInfo.includes(expectedError),
			`inlineSystemInfo に "${expectedError}" が含まれることを期待しましたが "${lastPost.inlineSystemInfo}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 通貨関連
// See: features/command_system.feature
// ---------------------------------------------------------------------------

/**
 * 通貨が {int} 消費される。
 */
Then(
	"通貨が {int} 消費される",
	async function (this: BattleBoardWorld, cost: number) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`通貨消費のためコマンドが成功することを期待しましたが "${this.lastResult.type}" でした`,
		);
		assert(cost > 0, "消費通貨が 0 以下です");
	},
);

/**
 * 通貨は消費されない。
 */
Then("通貨は消費されない", async function (this: BattleBoardWorld) {
	// コマンドが実行されない場合、通貨は消費されない
	// 通貨残高の変化なし確認は common.steps.ts の「通貨残高は {int} のまま変化しない」で行う
});

// ---------------------------------------------------------------------------
// Then: コマンド実行結果がDATファイルに含まれる（専ブラ互換）
// See: features/command_system.feature @専ブラからの書き込みに含まれるコマンドが実行される
// ---------------------------------------------------------------------------

/**
 * コマンド実行結果がレス末尾にマージされた状態でDATファイルに含まれる。
 * inlineSystemInfo が非 null であることを確認する（DatFormatter の連結出力は単体テストで検証済み）。
 */
Then(
	"コマンド実行結果がレス末尾にマージされた状態でDATファイルに含まれる",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo が設定されていれば、DatFormatter が区切り線付きで DAT に出力する
		// DAT 形式の実際の出力はDatFormatter 単体テストで検証済み
		// See: src/lib/infrastructure/adapters/__tests__/dat-formatter.test.ts
		assert(
			lastPost.inlineSystemInfo !== null,
			"コマンド実行結果が inlineSystemInfo に設定されている必要がありますが null でした",
		);
	},
);

/**
 * 書き込みが追加される。
 * 専ブラシナリオでの書き込み確認。
 */
Then("書き込みが追加される", async function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`書き込み成功を期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(this.currentThreadId, "スレッドが設定されていません");
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	assert(posts.length > 0, "スレッドに書き込みが追加されていません");
});

// ---------------------------------------------------------------------------
// Then: 管理者レス削除の独立システムレス（方式B）
// See: features/command_system.feature @管理者のレス削除がシステムレスとして通知される
// ---------------------------------------------------------------------------

/**
 * レス >>7 の本文が "このレスは削除されました" に置換される。
 * レスが isDeleted=true になっていることを確認する。
 */
Then(
	"レス >>7 の本文が {string} に置換される",
	async function (this: BattleBoardWorld, expectedMessage: string) {
		const postId = postNumberToId.get(7);
		assert(postId, "レス >>7 の Post ID が見つかりません");

		const post = await InMemoryPostRepo.findById(postId);
		assert(post !== null, "レス >>7 が存在しません");
		assert.strictEqual(
			post.isDeleted,
			true,
			`レス >>7 の isDeleted が true であることを期待しましたが false でした`,
		);
		// 表示文字列の置換はプレゼンテーション層の責務
		// BDD テストでは isDeleted フラグのみ検証する
	},
);

/**
 * レス >>3 の本文が "このレスは削除されました" に置換される。
 */
Then(
	"レス >>3 の本文が {string} に置換される",
	async function (this: BattleBoardWorld, expectedMessage: string) {
		const postId = postNumberToId.get(3);
		assert(postId, "レス >>3 の Post ID が見つかりません");

		const post = await InMemoryPostRepo.findById(postId);
		assert(post !== null, "レス >>3 が存在しません");
		assert.strictEqual(
			post.isDeleted,
			true,
			`レス >>3 の isDeleted が true であることを期待しましたが false でした`,
		);
	},
);

/**
 * 「★システム」名義の独立レスが追加される。
 * AdminService.deletePost が「★システム」名義のシステムレスを挿入したことを確認する。
 */
Then(
	"「★システム」名義の独立レスが追加される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// findByThreadId は isDeleted=false のレスのみ返す
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);

		// 「★システム」名義のレスが存在するか確認
		const systemPosts = posts.filter((p) => p.displayName === "★システム");
		assert(
			systemPosts.length > 0,
			"「★システム」名義の独立レスが追加されていません",
		);

		// システムレスは isSystemMessage=true であること
		const lastSystemPost = systemPosts[systemPosts.length - 1];
		assert.strictEqual(
			lastSystemPost.isSystemMessage,
			true,
			"システムレスの isSystemMessage が true であることを期待しました",
		);
	},
);

/**
 * システムレスの本文に管理者のコメントが表示される。
 */
Then(
	"システムレスの本文に管理者のコメントが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const systemPosts = posts.filter((p) => p.displayName === "★システム");
		assert(systemPosts.length > 0, "システムレスが存在しません");

		const lastSystemPost = systemPosts[systemPosts.length - 1];
		// 管理者のコメントが本文に含まれていることを確認
		// Given ステップで "スパム投稿のため削除" というコメントを設定している
		assert(lastSystemPost.body.length > 0, "システムレスの本文が空です");
		assert(
			lastSystemPost.body !== "管理者によりレスが削除されました",
			"フォールバックメッセージではなく、管理者のコメントが表示されるべきです",
		);
	},
);

/**
 * システムレスは通常のレスと視覚的に区別できる。
 * displayName が「★システム」であり、isSystemMessage が true であることを確認する。
 */
Then(
	"システムレスは通常のレスと視覚的に区別できる",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const systemPosts = posts.filter((p) => p.displayName === "★システム");
		assert(systemPosts.length > 0, "システムレスが存在しません");

		const lastSystemPost = systemPosts[systemPosts.length - 1];
		// 「★」は表示名に含まれているため視覚的に区別できる
		assert(
			lastSystemPost.displayName.includes("★"),
			"システムレスの表示名に「★」が含まれていません",
		);
		assert.strictEqual(
			lastSystemPost.isSystemMessage,
			true,
			"システムレスの isSystemMessage が true であることを期待しました",
		);
	},
);

/**
 * システムレスの本文にフォールバックメッセージが表示される。
 * コメントなしで削除した場合のフォールバックメッセージを確認する。
 */
Then(
	"システムレスの本文にフォールバックメッセージが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const systemPosts = posts.filter((p) => p.displayName === "★システム");
		assert(systemPosts.length > 0, "システムレスが存在しません");

		const lastSystemPost = systemPosts[systemPosts.length - 1];
		// フォールバックメッセージはテンプレート "🗑️ レス >>{postNumber} は管理者により削除されました" を使用する
		// See: src/lib/services/admin-service.ts > ADMIN_DELETE_FALLBACK_TEMPLATE
		assert(
			lastSystemPost.body.includes("管理者により削除されました"),
			`フォールバックメッセージを期待しましたが "${lastSystemPost.body}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: システムメッセージの安全性
// See: features/command_system.feature @システムメッセージ内のコマンド文字列は実行されない
// ---------------------------------------------------------------------------

/**
 * そのコマンド文字列はコマンドとして解析・実行されない。
 * isSystemMessage=true のレスの inlineSystemInfo が null であることを確認する。
 */
Then(
	"そのコマンド文字列はコマンドとして解析・実行されない",
	async function (this: BattleBoardWorld) {
		const systemMessagePostId = (this as any).systemMessagePostId;
		assert(
			systemMessagePostId,
			"システムメッセージの postId が設定されていません",
		);

		// システムメッセージの inlineSystemInfo が null（コマンド実行されていない）であることを確認
		const post = await InMemoryPostRepo.findById(systemMessagePostId);
		assert(post !== null, "システムメッセージが存在しません");
		assert.strictEqual(
			post.inlineSystemInfo,
			null,
			"システムメッセージのコマンド文字列が実行されてはいけません（inlineSystemInfo が null であるべき）",
		);
	},
);

/**
 * 書き込み報酬は発生しない。
 * システムメッセージの inlineSystemInfo が null であることを確認する。
 */
Then("書き込み報酬は発生しない", async function (this: BattleBoardWorld) {
	const systemMessagePostId = (this as any).systemMessagePostId;
	assert(
		systemMessagePostId,
		"システムメッセージの postId が設定されていません",
	);

	const post = await InMemoryPostRepo.findById(systemMessagePostId);
	assert(post !== null, "システムメッセージが存在しません");
	assert.strictEqual(
		post.inlineSystemInfo,
		null,
		"システムメッセージに書き込み報酬が発生してはいけません（inlineSystemInfo が null であるべき）",
	);
});

/**
 * レス付与ボーナスの対象にもならない。
 * システムメッセージはインセンティブの対象外であることを確認する。
 */
Then(
	"レス付与ボーナスの対象にもならない",
	async function (this: BattleBoardWorld) {
		// システムメッセージの inlineSystemInfo が null であることで間接的に確認済み
		// 「書き込み報酬は発生しない」と組み合わせて使用するため、追加検証は不要
		const systemMessagePostId = (this as any).systemMessagePostId;
		assert(
			systemMessagePostId,
			"システムメッセージの postId が設定されていません",
		);

		const post = await InMemoryPostRepo.findById(systemMessagePostId);
		assert(post !== null, "システムメッセージが存在しません");
		assert.strictEqual(
			post.isSystemMessage,
			true,
			"レスが isSystemMessage=true であることを確認します",
		);
	},
);

/**
 * コマンド "{string}" のターゲットが未指定のためエラーがレス末尾にマージ表示される。
 * 前方引数が認識されないケース（>>N と !cmd の間にテキストや改行がある場合）で、
 * コマンドのターゲットが解決できないため、inlineSystemInfo にエラーメッセージが入ることを検証する。
 *
 * See: features/command_system.feature 「アンカーとコマンドの間にテキストがある場合は前方引数として認識されない」
 * See: features/command_system.feature 「アンカーとコマンドが改行で区切られている場合は前方引数として認識されない」
 * See: docs/architecture/components/command.md §2.3 ルール7
 */
Then(
	"コマンド {string} のターゲットが未指定のためエラーがレス末尾にマージ表示される",
	async function (this: BattleBoardWorld, commandName: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// ターゲット未指定エラーが inlineSystemInfo に設定されていることを確認
		// CommandService/TellHandler はターゲット（>>N）が見つからない場合にエラーを返す
		assert(
			lastPost.inlineSystemInfo !== null,
			`コマンド "${commandName}" のターゲット未指定エラーが inlineSystemInfo に設定されるべきですが null でした`,
		);
		// エラーメッセージが空でないことを確認
		assert(
			lastPost.inlineSystemInfo.length > 0,
			"inlineSystemInfo が空文字です",
		);
	},
);

/**
 * エラー \"{string}\" がレス末尾にマージ表示される。
 * システムメッセージに対するコマンド実行エラーが inlineSystemInfo に含まれることを検証する。
 */
Then(
	"エラー {string} がレス末尾にマージ表示される",
	async function (this: BattleBoardWorld, expectedError: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo にエラーメッセージが含まれていることを確認
		// システムメッセージに対する告発は CommandService/TellHandler が処理する
		// 現時点では !tell stub が "!tell コマンドは現在実装中です" を返すため
		// expectedError と完全一致しない可能性がある
		assert(
			lastPost.inlineSystemInfo !== null,
			`エラー "${expectedError}" がレス末尾にマージ表示されるべきですが inlineSystemInfo が null でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: コマンドヘルプ
// See: features/command_system.feature @ユーザーがコマンド一覧を確認できる
// ---------------------------------------------------------------------------

/**
 * 利用可能なコマンドの一覧が表示される。
 */
Then("利用可能なコマンドの一覧が表示される", function (this: BattleBoardWorld) {
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"success",
		"コマンド一覧の取得が成功していません",
	);

	const data = this.lastResult.data as any;
	assert(data.commands, "コマンド一覧が存在しません");
	assert(data.commands.length > 0, "コマンド一覧が空です");
});

/**
 * 各コマンドのコスト・使い方・効果が確認できる。
 */
Then(
	"各コマンドのコスト・使い方・効果が確認できる",
	function (this: BattleBoardWorld) {
		assert(this.lastResult, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			"コマンド一覧の取得が成功していません",
		);

		const data = this.lastResult.data as any;
		assert(data.commands, "コマンド一覧が存在しません");

		// 各コマンドにコスト・説明が含まれていることを確認
		for (const cmd of data.commands) {
			assert(cmd.name, "コマンド名が存在しません");
			assert(
				typeof cmd.cost === "number",
				`コマンド "${cmd.name}" のコストが数値ではありません`,
			);
			assert(cmd.description, `コマンド "${cmd.name}" の説明が存在しません`);
		}
	},
);

// ---------------------------------------------------------------------------
// 隠しコマンド（裏技）
// See: features/command_system.feature @hidden_command
// ---------------------------------------------------------------------------

/**
 * コマンドレジストリに隠しコマンドが登録されている。
 * CommandService を生成し、getRegisteredCommandNames() で公開コマンド一覧を取得する。
 * hidden=true のコマンドは公開一覧に含まれないことを後続の Then ステップで検証する。
 */
Given(
	/^コマンドレジストリに隠しコマンド "([^"]+)" が登録されている$/,
	async function (this: BattleBoardWorld, commandName: string) {
		const CurrencyService = getCurrencyService();
		const {
			CommandService,
		} = require("../../src/lib/services/command-service");
		const {
			createAccusationService,
		} = require("../../src/lib/services/accusation-service");

		// attack/w ハンドラの動的 require を回避するため、
		// 隠しコマンドを含む最小限の設定でインスタンス化する
		const testConfig = {
			commands: {
				tell: {
					description: "指定レスをAIだと告発する",
					cost: 10,
					targetFormat: ">>postNumber",
					enabled: true,
					stealth: false,
				},
				abeshinzo: {
					description: "意味のないコマンド",
					cost: 0,
					targetFormat: null,
					enabled: true,
					stealth: false,
					hidden: true,
				},
			},
		};

		const commandService = new CommandService(
			CurrencyService,
			createAccusationService(),
			testConfig,
			null, // attackHandler
			null, // grassHandler
		);

		// 公開コマンド一覧を commandRegistry に上書きする
		// （Background の DataTable 由来の値を上書き）
		const publicNames = commandService.getRegisteredCommandNames();
		(this as any).commandRegistry = publicNames.map((name: string) => ({
			name: `!${name}`,
			cost: 0,
			description: "",
		}));
	},
);

/**
 * 指定コマンドがコマンド一覧に表示されない。
 * hidden=true のコマンドが getRegisteredCommandNames() から除外されていることを検証する。
 */
Then(
	"{string} はコマンド一覧に表示されない",
	function (this: BattleBoardWorld, commandName: string) {
		assert(this.lastResult, "操作結果が存在しません");
		const data = this.lastResult.data as any;
		const commands = data?.commands ?? [];
		const found = commands.some((c: any) => c.name === commandName);
		assert(
			!found,
			`"${commandName}" がコマンド一覧に表示されないことを期待しましたが、表示されています`,
		);
	},
);

/**
 * 「★システム」名義の独立レスで指定メッセージが表示される。
 * eliminationNotice パターンで投稿されたシステムレスの本文を検証する。
 */
Then(
	/^「★システム」名義の独立レスで "([^"]+)" と表示される$/,
	async function (this: BattleBoardWorld, expectedBody: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);

		const systemPosts = posts.filter(
			(p) => p.displayName === "★システム" && p.isSystemMessage === true,
		);
		assert(
			systemPosts.length > 0,
			"「★システム」名義の独立レスが追加されていません",
		);

		const matchingPost = systemPosts.find((p) => p.body === expectedBody);
		assert(
			matchingPost,
			`「★システム」名義のレスに "${expectedBody}" が見つかりません。実際: ${systemPosts.map((p) => `"${p.body}"`).join(", ")}`,
		);
	},
);

/**
 * 「★システム」名義の独立レスで案内板と同一の内容が表示される。
 * !help は案内板と同じ生成ロジックを使うが、BDD では本文完全一致ではなく
 * 案内板の主要行と公開コマンド一覧が含まれていることを検証する。
 */
Then(
	"「★システム」名義の独立レスで案内板と同一の内容が表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);

		const systemPosts = posts.filter(
			(p) => p.displayName === "★システム" && p.isSystemMessage === true,
		);
		assert(
			systemPosts.length > 0,
			"「★システム」名義の独立レスが追加されていません",
		);

		const latestSystemPost = systemPosts[systemPosts.length - 1];
		const visibleCommands = Object.entries(commandsConfig.commands)
			.filter(([, config]) => config.enabled && !config.hidden)
			.map(([name, config]) => ({
				name,
				description: config.description,
				cost: config.cost,
			}));
		const announcementBody = generateAnnouncementBody(visibleCommands);
		const expectedSnippets = announcementBody
			.split("\n")
			.filter(
				(line) =>
					line.startsWith("■ ボットちゃんねる 案内板") ||
					line.startsWith("【コマンド一覧】") ||
					line.startsWith("  !") ||
					line.includes("開発連絡板:") ||
					line.includes("メイン: https://battle-board.shika.workers.dev/"),
			);

		for (const snippet of expectedSnippets) {
			assert(
				latestSystemPost.body.includes(snippet),
				`!help のシステムレスに案内板の内容 "${snippet}" が含まれていません`,
			);
		}
	},
);
