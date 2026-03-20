/**
 * investigation.feature ステップ定義
 *
 * 調査系コマンド（!hissi, !kinou）に関するシナリオを実装する。
 *
 * カバーするシナリオ（11件）:
 *   - !hissi: 対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 *   - !hissi: 書き込みが4件以上ある場合は最新3件が表示される
 *   - !hissi: 書き込みが1件のみの場合は1件だけ表示される
 *   - !hissi: 対象ユーザーの本日の書き込みが0件の場合
 *   - !hissi: 異なるスレッドの書き込みもまとめて表示される
 *   - !kinou: 対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 *   - !kinou: 対象ユーザーが昨日書き込みをしていない場合
 *   - エラー: システムメッセージを対象に !hissi を実行するとエラーになる
 *   - エラー: 削除済みレスを対象に !hissi を実行するとエラーになる
 *   - エラー: システムメッセージを対象に !kinou を実行するとエラーになる
 *   - エラー: 削除済みレスを対象に !kinou を実行するとエラーになる
 *
 * See: features/investigation.feature
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §4
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryCurrencyRepo,
	InMemoryIncentiveLogRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

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

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = "bdd-test-ip-hash-default-sha512-placeholder";

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// シナリオ内で共有される状態
// ---------------------------------------------------------------------------

/** 被調査者（対象ユーザー）の authorId */
let targetAuthorId: string | null = null;

/** 被調査者の dailyId */
let targetDailyId: string | null = null;

/** 被調査者が書き込んだスレッドのマップ（スレッド名 → threadId） */
const threadNameToId = new Map<string, string>();

/** 被調査者のレス一覧（postNumber → postId） */
const targetPostNumberToId = new Map<number, string>();

/**
 * シナリオ間で状態をリセットする。
 * investigation.steps.ts 内のモジュールスコープ変数をリセットする。
 * hooks.ts の Before で呼び出すのではなく、各 Given ステップの先頭でリセットする。
 */
function resetInvestigationState(): void {
	targetAuthorId = null;
	targetDailyId = null;
	threadNameToId.clear();
	targetPostNumberToId.clear();
}

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * 被調査者をインメモリリポジトリに作成する。
 * 指定した dailyId を持つユーザーを作成し、そのユーザーの authorId を返す。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §4.3
 */
async function ensureTargetUser(dailyId: string): Promise<string> {
	if (targetAuthorId && targetDailyId === dailyId) {
		return targetAuthorId;
	}
	const AuthService = getAuthService();
	const ipHash = `bdd-investigation-target-${dailyId}`;
	const { userId } = await AuthService.issueEdgeToken(ipHash);
	await InMemoryUserRepo.updateIsVerified(userId, true);
	targetAuthorId = userId;
	targetDailyId = dailyId;
	return userId;
}

/**
 * スレッドをインメモリリポジトリに作成する（名前で重複を防ぐ）。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §4.3
 */
async function ensureThread(
	threadName: string,
	createdBy: string,
): Promise<string> {
	const existing = threadNameToId.get(threadName);
	if (existing) return existing;

	const thread = await InMemoryThreadRepo.create({
		threadKey: `${Math.floor(Date.now() / 1000)}-${threadName}`,
		boardId: TEST_BOARD_ID,
		title: threadName,
		createdBy,
	});
	threadNameToId.set(threadName, thread.id);
	return thread.id;
}

/**
 * コマンド実行前の IncentiveLog 挿入を行い、new_thread_join ボーナスをブロックする。
 * command_system.steps.ts の "{string} を実行する" ステップと同じパターン。
 *
 * See: src/lib/services/incentive-service.ts §4 new_thread_join
 */
function blockNewThreadJoinBonus(userId: string, threadId: string): void {
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstNow = new Date(Date.now() + jstOffset);
	const todayJst = jstNow.toISOString().slice(0, 10);
	InMemoryIncentiveLogRepo._insert({
		id: crypto.randomUUID(),
		userId,
		eventType: "new_thread_join",
		amount: 0,
		contextId: threadId,
		contextDate: todayJst,
		createdAt: new Date(Date.now()),
	});
}

/**
 * 最新の独立システムレス（★システム名義・isSystemMessage=true）を取得する。
 * スレッド内の全レスから displayName="★システム" かつ isSystemMessage=true のレスを検索する。
 */
async function findLatestSystemPost(
	threadId: string,
): Promise<import("../../src/lib/domain/models/post").Post | null> {
	const posts = await InMemoryPostRepo.findByThreadId(threadId);
	const systemPosts = posts.filter(
		(p) => p.displayName === "★システム" && p.isSystemMessage === true,
	);
	if (systemPosts.length === 0) return null;
	return systemPosts[systemPosts.length - 1];
}

/**
 * PostService.createPost を呼び出してコマンドを実行する。
 * command_system.steps.ts の "{string} を実行する" ステップと同じパターンだが、
 * スレッドIDを明示的に指定できるバリアント。
 *
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §4.2
 */
async function executeCommandInThread(
	world: BattleBoardWorld,
	commandString: string,
	threadId: string,
): Promise<void> {
	const PostService = getPostService();

	assert(world.currentUserId, "ユーザーIDが設定されていません");
	assert(world.currentEdgeToken, "ユーザーがログイン済みである必要があります");

	// IncentiveService の new_thread_join ボーナスをブロックする
	blockNewThreadJoinBonus(world.currentUserId, threadId);

	const result = await PostService.createPost({
		threadId,
		body: commandString,
		edgeToken: world.currentEdgeToken,
		ipHash: world.currentIpHash,
		isBotWrite: false,
	});

	if ("success" in result && result.success) {
		world.lastResult = { type: "success", data: result };
	} else if ("authRequired" in result) {
		world.lastResult = {
			type: "authRequired",
			code: result.code,
			edgeToken: result.edgeToken,
		};
	} else if ("error" in result) {
		world.lastResult = {
			type: "error",
			message: (result as any).error,
			code: (result as any).code,
		};
	}
}

// ---------------------------------------------------------------------------
// Given: 以下のレスが今日書き込まれている
// See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * 以下のレスが今日書き込まれている。
 *
 * DataTable 形式で被調査者の書き込みをセットアップする。
 * 各レスを in-memory post-repository に _insert で直接追加する。
 *
 * DataTable カラム: スレッド, レス番号, 表示名, ID, 時刻, 本文
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §4.3
 */
Given(
	"以下のレスが今日書き込まれている:",
	async function (this: BattleBoardWorld, dataTable: any) {
		resetInvestigationState();

		const rows = dataTable.hashes() as Array<{
			スレッド: string;
			レス番号: string;
			表示名: string;
			ID: string;
			時刻: string;
			本文: string;
		}>;

		// 最初の行の dailyId を使って被調査者を作成する
		const dailyId = rows[0].ID;
		const authorId = await ensureTargetUser(dailyId);

		// 今日の日付（UTC）を計算する
		const today = new Date(Date.now()).toISOString().slice(0, 10); // YYYY-MM-DD

		for (const row of rows) {
			// スレッドを作成する（重複防止）
			const threadId = await ensureThread(row.スレッド, authorId);

			// 時刻を UTC として今日の日付に組み合わせる
			const postNumber = parseInt(row.レス番号.replace(">>", ""), 10);
			const createdAt = new Date(`${today}T${row.時刻}Z`);

			const postId = crypto.randomUUID();
			InMemoryPostRepo._insert({
				id: postId,
				threadId,
				postNumber,
				authorId,
				displayName: row.表示名,
				dailyId: row.ID,
				body: row.本文,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt,
			});
			targetPostNumberToId.set(postNumber, postId);
		}
	},
);

// ---------------------------------------------------------------------------
// Given: ID:{string} のユーザーが本日N件の書き込みをしている
// See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
// ---------------------------------------------------------------------------

/**
 * ID:{dailyId} のユーザーが本日 N 件の書き込みをしている。
 *
 * 指定した件数のレスを in-memory post-repository に追加する。
 * スレッドはデフォルトの "テストスレッド" に作成する。
 *
 * See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
 */
Given(
	/^ID:([^ ]+) のユーザーが本日(\d+)件の書き込みをしている$/,
	async function (this: BattleBoardWorld, dailyId: string, countStr: string) {
		resetInvestigationState();

		const count = parseInt(countStr, 10);
		const authorId = await ensureTargetUser(dailyId);
		const threadId = await ensureThread("テストスレッド", authorId);

		// currentThreadId を設定する（後続の When ステップで使用）
		this.currentThreadId = threadId;

		const today = new Date(Date.now()).toISOString().slice(0, 10);

		for (let i = 1; i <= count; i++) {
			const timeStr = `${String(10 + i).padStart(2, "0")}:00:00`;
			const postId = crypto.randomUUID();
			InMemoryPostRepo._insert({
				id: postId,
				threadId,
				postNumber: i,
				authorId,
				displayName: "名無しさん",
				dailyId,
				body: `テスト書き込み${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(`${today}T${timeStr}Z`),
			});
			targetPostNumberToId.set(i, postId);
		}
	},
);

// ---------------------------------------------------------------------------
// Given: ID:{string} のユーザーの本日の書き込みがレス >>N の1件のみである
// See: features/investigation.feature @書き込みが1件のみの場合は1件だけ表示される
// ---------------------------------------------------------------------------

/**
 * ID:{dailyId} のユーザーの本日の書き込みがレス >>N の1件のみである。
 *
 * See: features/investigation.feature @書き込みが1件のみの場合は1件だけ表示される
 */
Given(
	/^ID:([^ ]+) のユーザーの本日の書き込みがレス >>(\d+) の1件のみである$/,
	async function (
		this: BattleBoardWorld,
		dailyId: string,
		postNumberStr: string,
	) {
		resetInvestigationState();

		const postNumber = parseInt(postNumberStr, 10);
		const authorId = await ensureTargetUser(dailyId);
		const threadId = await ensureThread("テストスレッド", authorId);

		this.currentThreadId = threadId;

		const today = new Date(Date.now()).toISOString().slice(0, 10);

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId,
			postNumber,
			authorId,
			displayName: "名無しさん",
			dailyId,
			body: "テスト書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(`${today}T14:00:00Z`),
		});
		targetPostNumberToId.set(postNumber, postId);
	},
);

// ---------------------------------------------------------------------------
// Given: レス >>N は昨日の ID:{string} の書き込みである
// See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
// ---------------------------------------------------------------------------

/**
 * レス >>N は昨日の ID:{dailyId} の書き込みである。
 *
 * 昨日の日付で書き込みを作成する。本日の書き込みは0件となる。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
 */
Given(
	/^レス >>(\d+) は昨日の ID:([^ ]+) の書き込みである$/,
	async function (
		this: BattleBoardWorld,
		postNumberStr: string,
		dailyId: string,
	) {
		resetInvestigationState();

		const postNumber = parseInt(postNumberStr, 10);
		const authorId = await ensureTargetUser(dailyId);
		const threadId = await ensureThread("テストスレッド", authorId);

		this.currentThreadId = threadId;

		// 昨日の日付を計算する（UTC ベース）
		const yesterday = new Date(Date.now());
		yesterday.setUTCDate(yesterday.getUTCDate() - 1);
		const yesterdayStr = yesterday.toISOString().slice(0, 10);

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId,
			postNumber,
			authorId,
			displayName: "名無しさん",
			dailyId,
			body: "昨日のテスト書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(`${yesterdayStr}T14:00:00Z`),
		});
		targetPostNumberToId.set(postNumber, postId);
	},
);

/**
 * そのユーザーは本日まだ書き込んでいない。
 *
 * 前段の Given で昨日のみの書き込みが作成されているため、
 * 追加の操作は不要。状態確認のためのステップ。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
 */
Given(
	"そのユーザーは本日まだ書き込んでいない",
	async function (this: BattleBoardWorld) {
		// 前段の Given で昨日の書き込みのみ作成済み。本日の書き込みは存在しない。
		// 確認: targetAuthorId が設定されていること
		assert(targetAuthorId, "対象ユーザーが未設定です");
	},
);

// ---------------------------------------------------------------------------
// Given: ID:{string} のユーザーが以下の書き込みをしている
// See: features/investigation.feature @異なるスレッドの書き込みもまとめて表示される
// ---------------------------------------------------------------------------

/**
 * ID:{dailyId} のユーザーが以下の書き込みをしている。
 *
 * 複数スレッドにまたがる書き込みを DataTable 形式でセットアップする。
 *
 * DataTable カラム: スレッド, レス番号, 時刻, 本文
 *
 * See: features/investigation.feature @異なるスレッドの書き込みもまとめて表示される
 */
Given(
	/^ID:([^ ]+) のユーザーが以下の書き込みをしている:$/,
	async function (this: BattleBoardWorld, dailyId: string, dataTable: any) {
		resetInvestigationState();

		const rows = dataTable.hashes() as Array<{
			スレッド: string;
			レス番号: string;
			時刻: string;
			本文: string;
		}>;

		const authorId = await ensureTargetUser(dailyId);
		const today = new Date(Date.now()).toISOString().slice(0, 10);

		for (const row of rows) {
			const threadId = await ensureThread(row.スレッド, authorId);
			const postNumber = parseInt(row.レス番号.replace(">>", ""), 10);
			const createdAt = new Date(`${today}T${row.時刻}Z`);

			const postId = crypto.randomUUID();
			InMemoryPostRepo._insert({
				id: postId,
				threadId,
				postNumber,
				authorId,
				displayName: "名無しさん",
				dailyId,
				body: row.本文,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt,
			});
			targetPostNumberToId.set(postNumber, postId);
		}
	},
);

// ---------------------------------------------------------------------------
// Given: !kinou シナリオ用 — 昨日のIDの設定
// See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * ID:{todayDailyId} のユーザーの昨日のIDが "{yesterdayDailyId}" である。
 *
 * 今日の書き込み（todayDailyId）と昨日の書き込み（yesterdayDailyId）を
 * 同一 authorId で作成する。
 *
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 */
Given(
	/^ID:([^ ]+) のユーザーの昨日のIDが "([^"]+)" である$/,
	async function (
		this: BattleBoardWorld,
		todayDailyId: string,
		yesterdayDailyId: string,
	) {
		resetInvestigationState();

		const authorId = await ensureTargetUser(todayDailyId);
		const threadId = await ensureThread("テストスレッド", authorId);

		this.currentThreadId = threadId;

		const today = new Date(Date.now()).toISOString().slice(0, 10);

		// 今日の書き込みを作成する（>>4 として指定される）
		const todayPostId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: todayPostId,
			threadId,
			postNumber: 4,
			authorId,
			displayName: "名無しさん",
			dailyId: todayDailyId,
			body: "今日のテスト書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(`${today}T12:00:00Z`),
		});
		targetPostNumberToId.set(4, todayPostId);

		// 昨日の書き込みを作成する（yesterdayDailyId で）
		const yesterday = new Date(Date.now());
		yesterday.setUTCDate(yesterday.getUTCDate() - 1);
		const yesterdayStr = yesterday.toISOString().slice(0, 10);

		const yesterdayPostId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: yesterdayPostId,
			threadId,
			postNumber: 3,
			authorId,
			displayName: "名無しさん",
			dailyId: yesterdayDailyId,
			body: "昨日のテスト書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(`${yesterdayStr}T12:00:00Z`),
		});
	},
);

/**
 * ID:{dailyId} のユーザーは昨日書き込みをしていない。
 *
 * 今日の書き込みのみ作成する。昨日の書き込みは存在しない。
 *
 * See: features/investigation.feature @対象ユーザーが昨日書き込みをしていない場合
 */
Given(
	/^ID:([^ ]+) のユーザーは昨日書き込みをしていない$/,
	async function (this: BattleBoardWorld, dailyId: string) {
		resetInvestigationState();

		const authorId = await ensureTargetUser(dailyId);
		const threadId = await ensureThread("テストスレッド", authorId);

		this.currentThreadId = threadId;

		const today = new Date(Date.now()).toISOString().slice(0, 10);

		// 今日の書き込みのみ作成する（>>4 として指定される）
		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId,
			postNumber: 4,
			authorId,
			displayName: "名無しさん",
			dailyId,
			body: "今日のテスト書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(`${today}T12:00:00Z`),
		});
		targetPostNumberToId.set(4, postId);
	},
);

// ---------------------------------------------------------------------------
// When: スレッド "{string}" で "{string}" を実行する
// See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{threadName}" で "{commandString}" を実行する。
 *
 * 指定したスレッドでコマンドを実行する。スレッドが threadNameToId に存在する場合は
 * そのスレッドで実行し、存在しない場合は新規スレッドを作成する。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: features/investigation.feature @異なるスレッドの書き込みもまとめて表示される
 */
When(
	/^スレッド "([^"]+)" で "([^"]+)" を実行する$/,
	async function (
		this: BattleBoardWorld,
		threadName: string,
		commandString: string,
	) {
		// 実行用のスレッドIDを取得する
		let threadId = threadNameToId.get(threadName);
		if (!threadId) {
			threadId = await ensureThread(threadName, this.currentUserId ?? "system");
		}

		// currentThreadId を実行対象のスレッドに設定する
		this.currentThreadId = threadId;

		await executeCommandInThread(this, commandString, threadId);
	},
);

// ---------------------------------------------------------------------------
// When: "{string}" を実行する（>>N は ID:{string} の書き込み）
// See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
// ---------------------------------------------------------------------------

/**
 * "{commandString}" を実行する（>>N は ID:{dailyId} の書き込み）。
 *
 * コマンドを現在のスレッドで実行する。>>N が対象ユーザーの書き込みであることを
 * 補足説明するフレーバーテキスト付きのステップ。
 *
 * See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 */
When(
	/^"([^"]+)" を実行する（>>(\d+) は ID:([^ ）]+) の書き込み）$/,
	async function (
		this: BattleBoardWorld,
		commandString: string,
		_postNumberStr: string,
		_dailyId: string,
	) {
		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		await executeCommandInThread(this, commandString, this.currentThreadId);
	},
);

// ---------------------------------------------------------------------------
// Then: 「★システム」名義の独立システムレスが追加される
// See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * 「★システム」名義の独立システムレスが追加される。
 *
 * スレッド内に displayName="★システム" かつ isSystemMessage=true のレスが
 * 存在することを検証する。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 */
Then(
	"「★システム」名義の独立システムレスが追加される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(
			systemPost !== null,
			"「★システム」名義の独立システムレスが追加されていません",
		);
		assert.strictEqual(
			systemPost.isSystemMessage,
			true,
			"システムレスの isSystemMessage が true であることを期待しました",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: システムレスに ID:{string} の本日の書き込み件数が表示される
// See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * システムレスに ID:{dailyId} の本日の書き込み件数 "{count}" が表示される。
 *
 * 独立システムレスの本文に件数情報が含まれていることを検証する。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 */
Then(
	/^システムレスに ID:([^ ]+) の本日の書き込み件数 "([^"]+)" が表示される$/,
	async function (this: BattleBoardWorld, dailyId: string, countStr: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		// ヘッダに dailyId と件数が含まれていることを確認する
		assert(
			systemPost.body.includes(`ID:${dailyId}`),
			`システムレスに "ID:${dailyId}" が含まれることを期待しましたが "${systemPost.body}" でした`,
		);
		assert(
			systemPost.body.includes(countStr),
			`システムレスに "${countStr}" が含まれることを期待しましたが "${systemPost.body}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 各書き込みがレス番号・表示名・ID・時刻・本文のヘッダ付きで表示される
// See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * 各書き込みがレス番号・表示名・ID・時刻・本文のヘッダ付きで表示される。
 *
 * 独立システムレスの本文にヘッダフォーマット（>>N 名前 ID:xxx HH:MM:SS）が
 * 含まれていることを検証する。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込み3件が独立システムレスで表示される
 * See: tmp/workers/bdd-architect_TASK-208/implementation_plan.md §3.1 メッセージフォーマット
 */
Then(
	"各書き込みがレス番号・表示名・ID・時刻・本文のヘッダ付きで表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		// ヘッダフォーマット: [スレッド名] >>N 表示名 ID:xxx HH:MM:SS
		// レス番号 ">>" が含まれていることを確認する
		assert(
			systemPost.body.includes(">>"),
			"レス番号 (>>) がシステムレスに含まれていません",
		);
		// ID: が含まれていることを確認する
		assert(
			systemPost.body.includes("ID:"),
			"ID情報がシステムレスに含まれていません",
		);
		// 時刻パターン (HH:MM:SS) が含まれていることを確認する
		assert(
			/\d{2}:\d{2}:\d{2}/.test(systemPost.body),
			"時刻パターン (HH:MM:SS) がシステムレスに含まれていません",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 独立システムレスに最新3件の書き込みがヘッダ付きで表示される
// See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
// ---------------------------------------------------------------------------

/**
 * 独立システムレスに最新3件の書き込みがヘッダ付きで表示される。
 *
 * 独立システムレスの本文に >>N パターンが3個含まれていることを検証する。
 *
 * See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
 */
Then(
	"独立システムレスに最新3件の書き込みがヘッダ付きで表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		// >>N パターンの出現回数をカウントする
		const matches = systemPost.body.match(/>>\d+/g);
		assert(
			matches !== null && matches.length === 3,
			`独立システムレスに最新3件（>>N パターン3個）が含まれることを期待しましたが ${matches?.length ?? 0} 個でした: "${systemPost.body}"`,
		);
	},
);

/**
 * 総件数 "{countLabel}" が表示される。
 *
 * 独立システムレスの本文に件数ラベルが含まれていることを検証する。
 *
 * See: features/investigation.feature @書き込みが4件以上ある場合は最新3件が表示される
 * See: features/investigation.feature @書き込みが1件のみの場合は1件だけ表示される
 */
Then(
	/^総件数 "([^"]+)" が表示される$/,
	async function (this: BattleBoardWorld, countLabel: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		assert(
			systemPost.body.includes(countLabel),
			`独立システムレスに "${countLabel}" が含まれることを期待しましたが "${systemPost.body}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 独立システムレスに1件の書き込みがヘッダ付きで表示される
// See: features/investigation.feature @書き込みが1件のみの場合は1件だけ表示される
// ---------------------------------------------------------------------------

/**
 * 独立システムレスに1件の書き込みがヘッダ付きで表示される。
 *
 * 独立システムレスの本文に >>N パターンが1個含まれていることを検証する。
 *
 * See: features/investigation.feature @書き込みが1件のみの場合は1件だけ表示される
 */
Then(
	"独立システムレスに1件の書き込みがヘッダ付きで表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		// >>N パターンの出現回数をカウントする
		const matches = systemPost.body.match(/>>\d+/g);
		assert(
			matches !== null && matches.length === 1,
			`独立システムレスに1件（>>N パターン1個）が含まれることを期待しましたが ${matches?.length ?? 0} 個でした: "${systemPost.body}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 独立システムレスに "{string}" と表示される
// See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
// See: features/investigation.feature @対象ユーザーが昨日書き込みをしていない場合
// ---------------------------------------------------------------------------

/**
 * 独立システムレスに "{expectedText}" と表示される。
 *
 * 独立システムレスの本文に指定した文字列が含まれていることを検証する。
 *
 * See: features/investigation.feature @対象ユーザーの本日の書き込みが0件の場合
 * See: features/investigation.feature @対象ユーザーが昨日書き込みをしていない場合
 */
Then(
	/^独立システムレスに "([^"]+)" と表示される$/,
	async function (this: BattleBoardWorld, expectedText: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		assert(
			systemPost.body.includes(expectedText),
			`独立システムレスに "${expectedText}" が含まれることを期待しましたが "${systemPost.body}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 独立システムレスに3件すべての書き込みが表示される
// See: features/investigation.feature @異なるスレッドの書き込みもまとめて表示される
// ---------------------------------------------------------------------------

/**
 * 独立システムレスに3件すべての書き込みが表示される。
 *
 * 独立システムレスの本文に >>N パターンが3個含まれていることを検証する。
 *
 * See: features/investigation.feature @異なるスレッドの書き込みもまとめて表示される
 */
Then(
	"独立システムレスに3件すべての書き込みが表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		// >>N パターンの出現回数をカウントする
		const matches = systemPost.body.match(/>>\d+/g);
		assert(
			matches !== null && matches.length === 3,
			`独立システムレスに3件すべて（>>N パターン3個）が含まれることを期待しましたが ${matches?.length ?? 0} 個でした: "${systemPost.body}"`,
		);
	},
);

/**
 * 各書き込みにスレッド名が含まれる。
 *
 * 独立システムレスの本文に各スレッド名が [スレッド名] 形式で含まれていることを検証する。
 *
 * See: features/investigation.feature @異なるスレッドの書き込みもまとめて表示される
 */
Then(
	"各書き込みにスレッド名が含まれる",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		// [スレッド名] 形式が含まれていることを確認する
		assert(
			/\[.+\]/.test(systemPost.body),
			`独立システムレスに [スレッド名] 形式が含まれることを期待しましたが "${systemPost.body}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: システムレスに "{string}" と表示される（!kinou）
// See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
// ---------------------------------------------------------------------------

/**
 * システムレスに "{expectedText}" と表示される。
 *
 * 独立システムレスの本文に指定した文字列が含まれていることを検証する。
 * !kinou の結果メッセージの検証に使用する。
 *
 * See: features/investigation.feature @対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される
 */
Then(
	/^システムレスに "([^"]+)" と表示される$/,
	async function (this: BattleBoardWorld, expectedText: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		const systemPost = await findLatestSystemPost(this.currentThreadId);
		assert(systemPost !== null, "独立システムレスが見つかりません");

		assert(
			systemPost.body.includes(expectedText),
			`システムレスに "${expectedText}" が含まれることを期待しましたが "${systemPost.body}" でした`,
		);
	},
);
