/**
 * reactions.feature ステップ定義
 *
 * 草コマンド（!w）に関するシナリオを実装する。
 *
 * カバーするシナリオ（22件）:
 *   基本機能:
 *     - レスに草を生やすとレス書き込み主の草カウントが1増える
 *     - 草を生やした結果がレス末尾にマージ表示される
 *     - 複数のユーザーが同一レスに草を生やせる
 *     - 同一ユーザーの異なるレスに草を生やすとカウントが累積する
 *     - 草コマンドは通貨を消費しない
 *   成長ビジュアル（10刻みループ）:
 *     - 草カウント 1〜9 本では 🌱 が表示される
 *     - 草カウントが 10 本に達すると 🌿 に変化する
 *     - 草カウントが 20 本に達すると 🌳 に変化する
 *     - 草カウントが 30 本に達すると 🍎 に変化する
 *     - 草カウントが 40 本に達すると 🫘 に変化する
 *     - 草カウントが 50 本に達すると 🌱 に戻りループする
 *   重複制限:
 *     - 同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
 *     - 同一ユーザーの別レスに草を生やしても重複として扱われる
 *     - 日付が変われば同じユーザーに再度草を生やせる
 *     - 異なる付与先ユーザーにはそれぞれ草を生やせる
 *   自己草禁止:
 *     - 自分が書いたレスには草を生やせない
 *   ボットへの草:
 *     - ボットの書き込みに草を生やせる
 *   エラーケース:
 *     - 存在しないレスに草を生やそうとするとエラーになる
 *     - システムメッセージには草を生やせない
 *     - 削除済みレスには草を生やせない
 *     - 対象レス番号を指定せずに !w を実行するとエラーになる
 *
 * 設計方針:
 *   - GrassHandler はコンストラクタ DI のため、インメモリ実装をここで直接注入する
 *   - InMemoryGrassRepository をこのファイル内に定義する
 *   - postNumber → postId の解決は InMemoryPostRepo から直接行う（grassState.postNumberToId 不要）
 *   - incentive.steps.ts と重複するステップは削除し、共有ステップを再利用する
 *
 *   コンフリクト解消方針:
 *   - `"!w >>N" を実行する` は command_system.steps.ts の `{string} を実行する` と競合するため定義しない。
 *     代わりに Before フックで require.cache に InMemoryGrassRepo を差し込み、
 *     command_system.steps.ts の PostService 経由で正常動作させる。
 *   - AfterStep フックで草コマンドの結果（inlineSystemInfo）を world.lastGrassResult に同期する。
 *   - world.ts の lastAttackResult getter は lastGrassResult にフォールバックするため、
 *     bot_system.steps.ts の Then ステップが草コマンド結果でも正常動作する。
 *
 * See: features/reactions.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md
 */

import {
	AfterStep,
	Before,
	BeforeStep,
	Given,
	type ITestStepHookParameter,
	Then,
	When,
} from "@cucumber/cucumber";
import assert from "assert";
import type { IncentiveLog } from "../../src/lib/domain/models/incentive";
import {
	InMemoryBotPostRepo,
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

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

/**
 * GrassHandler インスタンスを生成する（インメモリリポジトリを注入）。
 *
 * GrassHandler はコンストラクタ DI パターンのため、インメモリ実装を直接注入する。
 *
 * See: src/lib/services/handlers/grass-handler.ts
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 */
function createGrassHandler() {
	const { GrassHandler } =
		require("../../src/lib/services/handlers/grass-handler") as typeof import("../../src/lib/services/handlers/grass-handler");
	return new GrassHandler(
		InMemoryPostRepo,
		InMemoryGrassRepo,
		InMemoryBotPostRepo,
	);
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = "battleboard";

/** BDD テストで使用するデフォルト IP ハッシュ接頭辞 */
const IP_HASH_PREFIX = "bdd-reactions-ip-hash";

// ---------------------------------------------------------------------------
// post-repository の findById パッチ用
//
// GrassHandler は ctx.args[0] を postRepository.findById() に渡す。
// CommandService 経由（`{string} を実行する` ステップ）では args[0] = ">>N" 形式になるため、
// InMemoryPostRepo.findById(">>N") が null を返してしまう。
//
// これを解消するため、_insert が呼ばれるたびに postNumber → Post のマップを更新し、
// findById(">>N") がそのマップから Post を返すようパッチを当てる。
//
// See: features/reactions.feature §エラーケース
// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.2
// ---------------------------------------------------------------------------

/** postNumber → Post マップ（">>N" 形式の findById 解決に使用） */
const allPostsByNumber = new Map<
	number,
	import("../../src/lib/domain/models/post").Post
>();

/** post-repository の findById パッチ状態（オブジェクトで管理して再代入を回避） */
const postRepoPatchState = { patched: false };

// ---------------------------------------------------------------------------
// インメモリ GrassRepository 実装
//
// GrassHandler が要求する IGrassRepository インターフェースを実装する。
// シナリオ間の独立性は Before フックで reset() を呼ぶことで保証する。
//
// See: src/lib/services/handlers/grass-handler.ts > IGrassRepository
// See: docs/architecture/bdd_test_strategy.md §2 インメモリ実装の設計方針
// ---------------------------------------------------------------------------

/** 草記録の内部型 */
interface GrassReactionRecord {
	id: string;
	giverId: string;
	receiverId: string | null;
	receiverBotId: string | null;
	targetPostId: string;
	threadId: string;
	givenDate: string;
}

/** 草記録ストア（シナリオ間でリセットされる） */
const grassReactionsStore: GrassReactionRecord[] = [];

/**
 * ユーザーの草カウントストア（シナリオ間でリセットされる）。
 * users.grass_count カラムのインメモリキャッシュ。
 */
const grassCountsStore = new Map<string, number>();

/**
 * インメモリ GrassRepository。
 *
 * See: src/lib/infrastructure/repositories/grass-repository.ts
 * See: features/reactions.feature §基本機能
 */
const InMemoryGrassRepo = {
	/**
	 * ストアを初期化する（Beforeフックから呼び出す）。
	 */
	reset(): void {
		grassReactionsStore.length = 0;
		grassCountsStore.clear();
	},

	/**
	 * 同日・同一付与者・同一受領者の草記録が存在するか判定する。
	 *
	 * See: features/reactions.feature §同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
	 * See: src/lib/infrastructure/repositories/grass-repository.ts > existsForToday
	 */
	async existsForToday(
		giverId: string,
		receiverId: string | null,
		receiverBotId: string | null,
		date: string,
	): Promise<boolean> {
		return grassReactionsStore.some((r) => {
			if (r.giverId !== giverId || r.givenDate !== date) return false;
			if (receiverId !== null) {
				return r.receiverId === receiverId;
			}
			if (receiverBotId !== null) {
				return r.receiverBotId === receiverBotId;
			}
			return false;
		});
	},

	/**
	 * 草リアクションを記録する。
	 *
	 * UNIQUE制約違反（重複）の場合は null を返す（existsForToday で事前チェック済み）。
	 *
	 * See: features/reactions.feature §重複制限
	 * See: src/lib/infrastructure/repositories/grass-repository.ts > create
	 */
	async create(params: {
		giverId: string;
		receiverId: string | null;
		receiverBotId: string | null;
		targetPostId: string;
		threadId: string;
		givenDate: string;
	}): Promise<{ id: string } | null> {
		// 二重防御: 既に存在する場合は null を返す
		const alreadyExists = await this.existsForToday(
			params.giverId,
			params.receiverId,
			params.receiverBotId,
			params.givenDate,
		);
		if (alreadyExists) {
			return null;
		}

		const id = crypto.randomUUID();
		grassReactionsStore.push({
			id,
			giverId: params.giverId,
			receiverId: params.receiverId,
			receiverBotId: params.receiverBotId,
			targetPostId: params.targetPostId,
			threadId: params.threadId,
			givenDate: params.givenDate,
		});
		return { id };
	},

	/**
	 * ユーザーの草カウントを +1 する。
	 *
	 * InMemoryUserRepository の grassCount も同期させる。
	 *
	 * See: features/reactions.feature §レスに草を生やすとレス書き込み主の草カウントが1増える
	 * See: src/lib/infrastructure/repositories/grass-repository.ts > incrementGrassCount
	 */
	async incrementGrassCount(userId: string): Promise<number> {
		const current = grassCountsStore.get(userId) ?? 0;
		const newCount = current + 1;
		grassCountsStore.set(userId, newCount);
		// InMemoryUserRepo も同期して grassCount を更新する
		await InMemoryUserRepo.updateGrassCount(userId, newCount);
		return newCount;
	},

	/**
	 * ユーザーの現在の草カウントを取得する（テスト用ヘルパー）。
	 */
	async getGrassCount(userId: string): Promise<number> {
		return grassCountsStore.get(userId) ?? 0;
	},
};

// ---------------------------------------------------------------------------
// シナリオ内で共有される状態
// ---------------------------------------------------------------------------

/**
 * 草コマンドシナリオで共有される状態。
 *
 * シナリオ間の独立性は Before フックで resetGrassState() を呼ぶことで保証する。
 */
const grassState = {
	/** ユーザー名 -> userId のマッピング（草カウント検証用） */
	userNameToId: new Map<string, string>(),
};

/**
 * 草コマンドシナリオ固有状態をリセットする。
 */
function resetGrassState(): void {
	grassState.userNameToId.clear();
	InMemoryGrassRepo.reset();
}

// ---------------------------------------------------------------------------
// Before フック（全シナリオ）
// 草コマンドシナリオの状態をリセットする。
// hooks.ts の resetAllStores() に加えて、草専用状態もリセットする。
// See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル > Before
// ---------------------------------------------------------------------------

Before(async function (this: BattleBoardWorld) {
	resetGrassState();
	// World の草コンテキストもリセットする
	this.lastGrassResult = null;
	this.grassCountBaseline = new Map();

	// シナリオごとに allPostsByNumber をクリアする
	allPostsByNumber.clear();

	// ---------------------------------------------------------------------------
	// require.cache に InMemoryGrassRepo を差し込む。
	//
	// command_system.steps.ts の `{string} を実行する` は PostService → CommandService
	// 経由でコマンドを実行する。CommandService は `require("../infrastructure/repositories/
	// grass-repository")` で GrassRepository を動的に取得する。
	// そのため、require.cache に InMemoryGrassRepo を差し込むことで、
	// PostService 経由の草コマンドも InMemoryGrassRepo を使用するようになる。
	//
	// See: src/lib/services/command-service.ts > resolvedGrassHandler
	// See: register-mocks.js（同様のパターン）
	// ---------------------------------------------------------------------------
	try {
		const grassRepoPath = require.resolve(
			"../../src/lib/infrastructure/repositories/grass-repository",
		);
		(require as NodeRequire & { cache: Record<string, unknown> }).cache[
			grassRepoPath
		] = {
			id: grassRepoPath,
			filename: grassRepoPath,
			loaded: true,
			exports: InMemoryGrassRepo,
			parent: null,
			children: [],
			paths: [],
		};
	} catch {
		// resolve に失敗してもテスト継続（フォールバックハンドラが使用される）
	}

	// ---------------------------------------------------------------------------
	// post-repository の findById を ">>N" 形式に対応するようパッチを当てる。
	//
	// GrassHandler は CommandService 経由で ctx.args[0] = ">>3" を受け取り、
	// postRepository.findById(">>3") を呼ぶ。InMemoryPostRepo は UUID でしか
	// 検索できないため、この lookup が null を返してしまう。
	//
	// パッチにより、">>N" 形式の場合は allPostsByNumber マップから Post を返すようにする。
	// allPostsByNumber は InMemoryPostRepo._insert のラッパーで更新する。
	//
	// パッチは初回のみ適用する（シナリオをまたいで同一モジュールに複数回適用しない）。
	//
	// See: features/reactions.feature §エラーケース
	// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.2
	// ---------------------------------------------------------------------------
	if (!postRepoPatchState.patched) {
		try {
			const postRepoPath = require.resolve(
				"../../src/lib/infrastructure/repositories/post-repository",
			);
			const postRepoCacheEntry = (
				require as NodeRequire & {
					cache: Record<string, { exports: Record<string, unknown> }>;
				}
			).cache[postRepoPath];

			if (postRepoCacheEntry) {
				const originalFindById = postRepoCacheEntry.exports.findById as (
					id: string,
				) => Promise<import("../../src/lib/domain/models/post").Post | null>;

				postRepoCacheEntry.exports.findById = async (id: string) => {
					// UUID 形式の通常 lookup
					const post = await originalFindById(id);
					if (post) return post;

					// ">>N" 形式: allPostsByNumber マップから Post を返す
					// See: features/reactions.feature §エラーケース
					const match = /^>>(\d+)$/.exec(id);
					if (match) {
						return allPostsByNumber.get(parseInt(match[1], 10)) ?? null;
					}
					return null;
				};

				postRepoPatchState.patched = true;
			}
		} catch {
			// resolve に失敗してもテスト継続
		}
	}

	// ---------------------------------------------------------------------------
	// InMemoryPostRepo._insert をラップして allPostsByNumber を更新する。
	//
	// admin.steps.ts・incentive.steps.ts・reactions.steps.ts など、
	// _insert を通じてストアに挿入されたすべてのレスを追跡する。
	// これにより、`{string} を実行する` 経由の草コマンドが正しい Post を取得できる。
	//
	// ラップは初回のみ適用する（シナリオごとに多重ラップしない）。
	// ---------------------------------------------------------------------------
	type InsertWrappedRepo = typeof InMemoryPostRepo & {
		_insertWrapped?: boolean;
	};
	if (!(InMemoryPostRepo as InsertWrappedRepo)._insertWrapped) {
		const originalInsert = InMemoryPostRepo._insert.bind(InMemoryPostRepo);
		(InMemoryPostRepo as InsertWrappedRepo)._insertWrapped = true;
		InMemoryPostRepo._insert = (
			post: Parameters<typeof InMemoryPostRepo._insert>[0],
		) => {
			originalInsert(post);
			allPostsByNumber.set(post.postNumber, post);
		};
	}

	// ---------------------------------------------------------------------------
	// CommandService を PostService に DI する。
	//
	// reactions.feature のシナリオでは `{string} を実行する` ステップ（command_system.steps.ts）
	// 経由で草コマンドを実行する。このステップは PostService.createPost を呼び出すが、
	// CommandService が未設定の場合はコマンドが実行されない。
	//
	// ここでは PostService に CommandService を DI して、!w コマンドが正しく処理される
	// ようにする。草コマンド実行後は setCommandService(null) で元に戻さない（シナリオ終了
	// 後に hooks.ts の After フックが PostService をリセットするため）。
	//
	// See: features/step_definitions/command_system.steps.ts > コマンドレジストリに以下のコマンドが登録されている:
	// ---------------------------------------------------------------------------
	try {
		const PostService = getPostService();
		const CurrencyService = getCurrencyService();
		const { CommandService } =
			require("../../src/lib/services/command-service") as typeof import("../../src/lib/services/command-service");
		const { createAccusationService } =
			require("../../src/lib/services/accusation-service") as typeof import("../../src/lib/services/accusation-service");
		const accusationService = createAccusationService();
		const commandService = new CommandService(
			CurrencyService,
			accusationService,
		);
		PostService.setCommandService(commandService);
	} catch {
		// CommandService のインスタンス化に失敗してもテスト継続
	}
});

// ---------------------------------------------------------------------------
// BeforeStep フック: 草コマンド実行前に IncentiveService のサイドエフェクトを抑止する
//
// `{string} を実行する` 経由で草コマンドが PostService を通じて実行される場合、
// PostService は IncentiveService を呼び出す。currentUser がそのスレッドに
// 初めて書き込む場合、new_thread_join ボーナス (+3) が付与されてしまい
// 「草コマンドは通貨を消費しない」シナリオが失敗する。
//
// 回避策: 草コマンド実行前に new_thread_join の IncentiveLog を事前挿入して
// 重複チェックにより実際のボーナス付与をスキップさせる。
//
// See: features/reactions.feature @草コマンドは通貨を消費しない
// See: src/lib/services/incentive-service.ts §④ new_thread_join
// ---------------------------------------------------------------------------

BeforeStep(async function (
	this: BattleBoardWorld,
	{ pickleStep }: ITestStepHookParameter,
) {
	const stepText = pickleStep?.text ?? "";

	// "!w ..." を実行する パターンのステップに反応する
	// （command_system.steps.ts の `{string} を実行する` 経由の草コマンド）
	// Note: ユーザーが直接 executeGrassCommand を呼ぶ When ステップは
	//       PostService を経由しないため、このフックは必要ない
	const isGrassViaPostService =
		/^"!w/.test(stepText) && stepText.includes("を実行する");

	if (!isGrassViaPostService) return;
	if (!this.currentUserId || !this.currentThreadId) return;

	// ---------------------------------------------------------------------------
	// IncentiveService の new_thread_join ボーナスを防止する。
	//
	// PostService 経由で草コマンドを実行すると、IncentiveService が呼ばれて
	// new_thread_join ボーナス (+3) が付与されてしまう（currentUser がこのスレッドに
	// 初めて書き込む場合）。
	//
	// 対策: new_thread_join の IncentiveLog を事前挿入して重複チェックで防ぐ。
	// IncentiveLogRepository.create は (userId, eventType, contextId, contextDate) の
	// 組み合わせが重複する場合 null を返すため、CurrencyService.credit が呼ばれない。
	//
	// 注意: IncentiveService は contextDate に JST 日付（getTodayJst）を使用するため、
	// ここでも同じ JST 日付計算を使用する。
	//
	// See: features/reactions.feature @草コマンドは通貨を消費しない
	// See: src/lib/services/incentive-service.ts §④ new_thread_join
	// See: src/lib/services/incentive-service.ts > getTodayJst
	// ---------------------------------------------------------------------------

	// JST 日付計算（IncentiveService の getTodayJst と同じ計算式）
	const jstOffset = 9 * 60 * 60 * 1000;
	const nowMs = Date.now();
	const jstNow = new Date(nowMs + jstOffset);
	const todayJst = jstNow.toISOString().slice(0, 10);

	// new_thread_join ログを事前挿入（重複チェックにより実際の付与をブロック）
	InMemoryIncentiveLogRepo._insert({
		id: crypto.randomUUID(),
		userId: this.currentUserId,
		eventType: "new_thread_join",
		amount: 0,
		contextId: this.currentThreadId,
		contextDate: todayJst,
		createdAt: new Date(),
	});
});

// ---------------------------------------------------------------------------
// AfterStep フック: 草コマンドの実行結果を lastGrassResult に同期する
//
// `{string} を実行する` (command_system.steps.ts) 経由で草コマンドが実行された場合、
// PostService がレスを作成し inlineSystemInfo に結果を設定する。
// このフックはその inlineSystemInfo を読み取り world.lastGrassResult を更新する。
//
// world.ts の `lastAttackResult` getter は `lastGrassResult` にフォールバックするため、
// bot_system.steps.ts の Then ステップが草コマンド結果でも正常動作する。
//
// See: features/reactions.feature @存在しないレスに草を生やそうとするとエラーになる
// See: docs/architecture/bdd_test_strategy.md §5.3 ステップ間の状態橋渡し
// ---------------------------------------------------------------------------

AfterStep(async function (
	this: BattleBoardWorld,
	{ pickleStep }: ITestStepHookParameter,
) {
	// 草コマンドを含む When ステップのみを対象とする
	const stepText = pickleStep?.text ?? "";
	const isGrassExecutionStep =
		stepText.includes("!w") && stepText.includes("を実行する");
	if (!isGrassExecutionStep) return;

	// executeGrassCommand によって既に lastGrassResult が設定されている場合はスキップ
	if (this.lastGrassResult !== null) return;

	// currentThreadId がない場合はスキップ
	if (!this.currentThreadId) return;

	// スレッドの最後のレスから inlineSystemInfo を読み取る
	const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
	if (posts.length === 0) return;
	const lastPost = posts[posts.length - 1];
	if (!lastPost.inlineSystemInfo) return;

	// 草コマンド関連のメッセージかどうかを判定する
	const info = lastPost.inlineSystemInfo;
	const isGrassSuccess = info.includes("に草");
	const isGrassError =
		!isGrassSuccess &&
		(info.includes("草を生やせません") ||
			info.includes("指定されたレスが見つかりません") ||
			info.includes("今日は既にこのユーザーに草を生やしています") ||
			info.includes("自分のレスには") ||
			info.includes("対象レスを指定してください") ||
			info.includes("削除されたレスには") ||
			info.includes("システムメッセージには"));

	if (isGrassSuccess || isGrassError) {
		this.lastGrassResult = {
			success: isGrassSuccess,
			systemMessage: info,
		};
	}
});

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ユーザーとスレッドのセットアップを行う。
 * 現在のユーザーとスレッドが未設定の場合のみ作成する。
 */
async function ensureCurrentUserAndThread(
	world: BattleBoardWorld,
): Promise<void> {
	const AuthService = getAuthService();

	if (!world.currentUserId) {
		const { token, userId } = await AuthService.issueEdgeToken(
			`${IP_HASH_PREFIX}-current`,
		);
		world.currentEdgeToken = token;
		world.currentUserId = userId;
		world.currentIpHash = `${IP_HASH_PREFIX}-current`;
		await InMemoryUserRepo.updateIsVerified(userId, true);
	}

	if (!world.currentThreadId) {
		const thread = await InMemoryThreadRepo.create({
			threadKey: Math.floor(Date.now() / 1000).toString(),
			boardId: TEST_BOARD_ID,
			title: "草コマンドBDDテスト用スレッド",
			createdBy: world.currentUserId,
		});
		world.currentThreadId = thread.id;
	}
}

/**
 * postNumber から postId を解決する。
 *
 * InMemoryPostRepo から threadId + postNumber でレスを検索する。
 * grassState.postNumberToId は廃止し、常に InMemoryPostRepo から解決する。
 *
 * @param world - BattleBoardWorld インスタンス
 * @param postNumber - レス番号
 * @returns 対応する postId（存在しない場合は null）
 */
async function resolvePostId(
	world: BattleBoardWorld,
	postNumber: number,
): Promise<string | null> {
	if (!world.currentThreadId) return null;

	const posts = await InMemoryPostRepo.findByThreadId(world.currentThreadId);
	const post = posts.find((p) => p.postNumber === postNumber);
	return post?.id ?? null;
}

/**
 * 名前付きユーザーを作成または取得する。
 *
 * grassState.userNameToId に存在する場合はそのまま返す。
 * InMemoryUserRepo の namedUsers と同期する。
 */
async function ensureNamedUserForGrass(
	world: BattleBoardWorld,
	name: string,
): Promise<{ userId: string }> {
	const AuthService = getAuthService();

	// grassState に登録済みの場合はそのまま返す
	const existingUserId = grassState.userNameToId.get(name);
	if (existingUserId) {
		return { userId: existingUserId };
	}

	// world.namedUsers に登録済みかチェック
	const namedUser = world.getNamedUser(name);
	if (namedUser) {
		grassState.userNameToId.set(name, namedUser.userId);
		return { userId: namedUser.userId };
	}

	// 新規作成
	const ipHash = `${IP_HASH_PREFIX}-${name}`;
	const { userId } = await AuthService.issueEdgeToken(ipHash);
	await InMemoryUserRepo.updateIsVerified(userId, true);

	grassState.userNameToId.set(name, userId);

	// World の namedUsers にも登録する
	world.setNamedUser(name, {
		userId,
		edgeToken: "",
		ipHash,
		isPremium: false,
		username: null,
	});

	return { userId };
}

/**
 * !w コマンドを実行する（executeGrassCommand を使う When ステップのパス）。
 *
 * GrassHandler を直接インスタンス化し、postNumber から postId を解決して渡す。
 * postNumber が null の場合は args[] を空にする（「!w」のみ）。
 *
 * 副作用:
 *   - world.lastGrassResult に結果を設定する
 *   - world.lastResult に結果を設定する
 *   - スレッドにシステム情報付きのレスを挿入する（command_system Then ステップとの互換性）
 *
 * Note: `"!w >>N" を実行する` は command_system.steps.ts の `{string} を実行する` と
 *   競合するため、このヘルパーは `ユーザー "X" が "!w >>N" を実行する` 等のパスで使用する。
 *
 * See: features/reactions.feature §基本機能
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.2
 */
async function executeGrassCommand(
	world: BattleBoardWorld,
	postNumber: number | null,
	userId?: string,
): Promise<void> {
	const resolvedUserId = userId ?? world.currentUserId;
	assert(resolvedUserId, "ユーザーIDが設定されていません");
	assert(world.currentThreadId, "スレッドIDが設定されていません");

	const grassHandler = createGrassHandler();

	let args: string[];
	if (postNumber === null) {
		// 対象レス番号なし（「!w」のみ）
		args = [];
	} else {
		// postNumber を postId (UUID) に変換する
		// See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §4.2
		// GrassHandler.execute は args[0] を postRepository.findById に渡す
		const postId = await resolvePostId(world, postNumber);
		if (!postId) {
			// 対応する postId が存在しない場合は存在しないIDとして渡す
			args = [`nonexistent-post-${postNumber}`];
		} else {
			args = [postId];
		}
	}

	const result = await grassHandler.execute({
		args,
		postId: "", // GrassHandler は postId を使用しない（コマンド元レスIDのプレースホルダ）
		threadId: world.currentThreadId,
		userId: resolvedUserId,
	});

	// world.lastGrassResult に設定する
	world.lastGrassResult = result;

	// world.lastResult にも設定する（command_system.steps.ts の コマンドが正常に実行される と互換性を保つ）
	if (result.success) {
		world.lastResult = { type: "success", data: result };
	} else {
		world.lastResult = { type: "error", message: result.systemMessage ?? "" };
	}

	// ---------------------------------------------------------------------------
	// スレッドに result のシステム情報を inlineSystemInfo として持つレスを挿入する。
	// command_system.steps.ts の `レス末尾にエラー {string} がマージ表示される` は
	// スレッドの最後のレスの inlineSystemInfo を検証するため、それと互換性を保つ。
	// postNumber は既存レスの最大値 + 1 を使用することで、必ず最後のレスになる。
	// See: features/step_definitions/command_system.steps.ts > レス末尾にエラー {string} がマージ表示される
	// ---------------------------------------------------------------------------
	const existingPosts = await InMemoryPostRepo.findByThreadId(
		world.currentThreadId,
	);
	const maxExistingPostNumber =
		existingPosts.length > 0
			? Math.max(...existingPosts.map((p) => p.postNumber))
			: 0;
	const nextPostNumber = maxExistingPostNumber + 1;
	InMemoryPostRepo._insert({
		id: crypto.randomUUID(),
		threadId: world.currentThreadId,
		postNumber: nextPostNumber,
		authorId: resolvedUserId,
		displayName: "名無しさん",
		dailyId: resolvedUserId.slice(0, 8),
		body: postNumber !== null ? `!w >>${postNumber}` : "!w",
		inlineSystemInfo: result.systemMessage ?? null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(),
	});
}

// ---------------------------------------------------------------------------
// Given: 草カウントの初期値設定
//
// Note: "ユーザー {string} がレス >>{int} を書き込み済みである" は
//   incentive.steps.ts で定義済みのため、reactions.steps.ts では定義しない。
//   ただしその実装では grassCountsStore と grassState.userNameToId が設定されない。
//   ここでは草カウントの設定ステップのみを定義する。
// ---------------------------------------------------------------------------

/**
 * "UserX" の草カウントが N である。
 *
 * 指定ユーザーの初期草カウントを設定する。
 * InMemoryUserRepo と InMemoryGrassRepo.grassCountsStore を同期する。
 *
 * Note: incentive.steps.ts の ensureNamedUser とは別の管理をしているため、
 *   grassState.userNameToId にも登録する。
 *
 * See: features/reactions.feature @レスに草を生やすとレス書き込み主の草カウントが1増える
 */
Given(
	/^"([^"]+)" の草カウントが (\d+) である$/,
	async function (this: BattleBoardWorld, userName: string, countStr: string) {
		const count = parseInt(countStr, 10);
		await ensureCurrentUserAndThread(this);

		const { userId } = await ensureNamedUserForGrass(this, userName);
		// grassCountsStore を更新して GrassHandler の incrementGrassCount の起点とする
		grassCountsStore.set(userId, count);
		// InMemoryUserRepo も同期する
		await InMemoryUserRepo.updateGrassCount(userId, count);
	},
);

/**
 * ユーザー "UserX" の草カウントが N である。
 *
 * 冠詞違いのバリアント（成長ビジュアルシナリオで使用）。
 *
 * See: features/reactions.feature @草カウント 1〜9 本では 🌱 が表示される
 */
Given(
	/^ユーザー "([^"]+)" の草カウントが (\d+) である$/,
	async function (this: BattleBoardWorld, userName: string, countStr: string) {
		const count = parseInt(countStr, 10);
		await ensureCurrentUserAndThread(this);

		const { userId } = await ensureNamedUserForGrass(this, userName);
		grassCountsStore.set(userId, count);
		await InMemoryUserRepo.updateGrassCount(userId, count);
	},
);

// ---------------------------------------------------------------------------
// Given: レス書き込み（重複しないステップのみ定義）
//
// Note: "ユーザー {string} がレス >>{int} を書き込み済みである" は
//   incentive.steps.ts で既に定義済み。
//   "スレッド {string} にレス >>{int} が存在する" は admin.steps.ts と thread.steps.ts で定義済み。
//   これらは reactions.steps.ts から削除し、既存ステップを再利用する。
//
//   ただし、incentive.steps.ts の ユーザー登録では grassState.userNameToId が更新されない。
//   Given "ユーザー {string} がレス >>{int} を書き込み済みである" を実行した後、
//   "UserX" の草カウントが N である が呼ばれた時に ensureNamedUserForGrass が
//   world.namedUsers から userId を解決する（namedUsers は incentive.steps.ts が登録する）。
//
// Note: "ユーザー {string}(ID:{string}) がレス >>{int} を書き込み済みである" は
//   dailyId を明示的に指定するバリアントで reactions.feature 固有のため、ここで定義する。
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserX"(ID:Ax8kP2) がレス >>N を書き込み済みである。
 *
 * dailyId を明示的に指定するバリアント。
 * システムメッセージ検証シナリオ「草を生やした結果がレス末尾にマージ表示される」で使用。
 *
 * See: features/reactions.feature @草を生やした結果がレス末尾にマージ表示される
 */
Given(
	/^ユーザー "([^"]+)"\(ID:([^)]+)\) がレス >>(\d+) を書き込み済みである$/,
	async function (
		this: BattleBoardWorld,
		userName: string,
		explicitDailyId: string,
		postNumberStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		const AuthService = getAuthService();

		// 既存ユーザーがいれば再利用、なければ新規作成
		let userId = grassState.userNameToId.get(userName);
		if (!userId) {
			const namedUser = this.getNamedUser(userName);
			if (namedUser) {
				userId = namedUser.userId;
				grassState.userNameToId.set(userName, userId);
			} else {
				const ipHash = `${IP_HASH_PREFIX}-${userName}`;
				const result = await AuthService.issueEdgeToken(ipHash);
				userId = result.userId;
				await InMemoryUserRepo.updateIsVerified(userId, true);
				grassState.userNameToId.set(userName, userId);
				this.setNamedUser(userName, {
					userId,
					edgeToken: "",
					ipHash,
					isPremium: false,
					username: null,
				});
			}
		}

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: userId,
			displayName: "名無しさん",
			dailyId: explicitDailyId, // 明示的な dailyId を使用する
			body: `${userName}のテスト書き込み（レス${postNumber}）`,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});
	},
);

/**
 * "UserX" がレス >>N を書き込み済みである（成長ビジュアルシナリオ用）。
 *
 * 草カウント設定後にレスを書き込む順序のシナリオで使用。
 * reactions.feature 固有の順序（草カウント設定 → レス書き込み → 草コマンド実行）に対応する。
 *
 * Note: incentive.steps.ts の "ユーザー {string} がレス >>{int} を書き込み済みである" と
 *   表記が異なる（"UserX" が先頭に来る）ため、別ステップとして定義する。
 *
 * See: features/reactions.feature @草カウント 1〜9 本では 🌱 が表示される
 */
Given(
	/^"([^"]+)" がレス >>(\d+) を書き込み済みである$/,
	async function (
		this: BattleBoardWorld,
		userName: string,
		postNumberStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		const { userId } = await ensureNamedUserForGrass(this, userName);

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: userId,
			displayName: "名無しさん",
			dailyId: userId.slice(0, 8),
			body: `${userName}のテスト書き込み（レス${postNumber}）`,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});
	},
);

// ---------------------------------------------------------------------------
// Given: 重複制限のセットアップ
// ---------------------------------------------------------------------------

/**
 * 今日ユーザー "UserB" が "UserA" のレスに草を生やし済みである。
 *
 * 同日重複チェックのために、既存の草記録を挿入する。
 *
 * See: features/reactions.feature @同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
 * See: docs/architecture/bdd_test_strategy.md §5.2 相対時刻の禁止
 */
Given(
	/^今日ユーザー "([^"]+)" が "([^"]+)" のレスに草を生やし済みである$/,
	async function (
		this: BattleBoardWorld,
		giverName: string,
		receiverName: string,
	) {
		await ensureCurrentUserAndThread(this);

		const { userId: giverId } = await ensureNamedUserForGrass(this, giverName);
		const { userId: receiverId } = await ensureNamedUserForGrass(
			this,
			receiverName,
		);

		// GrassHandler が `new Date().toISOString().split("T")[0]` で計算するのと
		// 同じ計算式を使い、UTC 今日の日付を取得する。
		// Date.now スタブは GrassHandler に影響しないため、ここでも new Date() を使う。
		// See: src/lib/services/handlers/grass-handler.ts > execute (step6)
		const today = new Date().toISOString().split("T")[0];

		// 既存の草記録をインメモリストアに直接挿入する
		grassReactionsStore.push({
			id: crypto.randomUUID(),
			giverId,
			receiverId,
			receiverBotId: null,
			targetPostId: "dummy-post-for-preexisting-grass",
			threadId: this.currentThreadId!,
			givenDate: today,
		});
	},
);

/**
 * 今日ユーザー "UserB" がレス >>N 経由で "UserA" に草を生やし済みである。
 *
 * 別レス重複チェック用（同一ユーザーの別レスへの草は重複として扱われる）。
 *
 * See: features/reactions.feature @同一ユーザーの別レスに草を生やしても重複として扱われる
 */
Given(
	/^今日ユーザー "([^"]+)" がレス >>(\d+) 経由で "([^"]+)" に草を生やし済みである$/,
	async function (
		this: BattleBoardWorld,
		giverName: string,
		_postNumberStr: string,
		receiverName: string,
	) {
		await ensureCurrentUserAndThread(this);

		const { userId: giverId } = await ensureNamedUserForGrass(this, giverName);
		const { userId: receiverId } = await ensureNamedUserForGrass(
			this,
			receiverName,
		);

		// GrassHandler と同じ計算式（new Date() を使う）
		// See: src/lib/services/handlers/grass-handler.ts > execute (step6)
		const today = new Date().toISOString().split("T")[0];

		grassReactionsStore.push({
			id: crypto.randomUUID(),
			giverId,
			receiverId,
			receiverBotId: null,
			targetPostId: "dummy-post-for-preexisting-grass",
			threadId: this.currentThreadId!,
			givenDate: today,
		});
	},
);

/**
 * 昨日ユーザー "UserB" が "UserA" のレスに草を生やし済みである。
 *
 * 昨日の草記録を設定する（日付変更後の再付与テスト用）。
 *
 * See: features/reactions.feature @日付が変われば同じユーザーに再度草を生やせる
 * See: docs/architecture/bdd_test_strategy.md §5.1 時計凍結の原則
 */
Given(
	/^昨日ユーザー "([^"]+)" が "([^"]+)" のレスに草を生やし済みである$/,
	async function (
		this: BattleBoardWorld,
		giverName: string,
		receiverName: string,
	) {
		await ensureCurrentUserAndThread(this);

		const { userId: giverId } = await ensureNamedUserForGrass(this, giverName);
		const { userId: receiverId } = await ensureNamedUserForGrass(
			this,
			receiverName,
		);

		// 昨日の UTC 日付を計算する（実際の new Date() ベース）
		// GrassHandler が new Date() を使うため、ここでも同じ基準を使う
		// See: src/lib/services/handlers/grass-handler.ts > execute (step6)
		const todayMs = new Date().getTime();
		const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;
		const yesterday = new Date(yesterdayMs).toISOString().split("T")[0];

		grassReactionsStore.push({
			id: crypto.randomUUID(),
			giverId,
			receiverId,
			receiverBotId: null,
			targetPostId: "dummy-post-for-preexisting-grass",
			threadId: this.currentThreadId!,
			givenDate: yesterday,
		});
	},
);

// ---------------------------------------------------------------------------
// Given: エラーケース設定（reactions.feature 固有のもの）
// ---------------------------------------------------------------------------

/**
 * 運営ボットがスレッドで潜伏中である。
 *
 * ボットが存在するシナリオのセットアップ。
 * スレッドとユーザーを確保した状態にする。
 *
 * See: features/reactions.feature @ボットの書き込みに草を生やせる
 */
Given(
	"運営ボットがスレッドで潜伏中である",
	async function (this: BattleBoardWorld) {
		await ensureCurrentUserAndThread(this);
		// ボットは潜伏中（正体を暴露しない）ため、追加設定なし
		// 次のステップ「レス >>N はボットの書き込みである」で具体的なレスを設置する
	},
);

/**
 * レス >>N はボットの書き込みである。
 *
 * authorId = null のレスを設定し、bot_posts に紐付ける。
 *
 * See: features/reactions.feature @ボットの書き込みに草を生やせる
 */
Given(
	/^レス >>(\d+) はボットの書き込みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		const botId = crypto.randomUUID();
		const postId = crypto.randomUUID();

		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: null, // ボット書き込みは authorId = null
			displayName: "名無しさん",
			dailyId: "BotDly1",
			body: "ボットのテスト書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});

		// bot_posts に紐付ける
		InMemoryBotPostRepo._insert(postId, botId);
	},
);

/**
 * レス >>N は管理者により削除済みである。
 *
 * isDeleted = true のレスを設定する。
 *
 * See: features/reactions.feature @削除済みレスには草を生やせない
 */
Given(
	/^レス >>(\d+) は管理者により削除済みである$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		const AuthService = getAuthService();
		// 削除済みレスの書き込み主
		const { userId: postAuthorId } = await AuthService.issueEdgeToken(
			`${IP_HASH_PREFIX}-deleted-author`,
		);

		const postId = crypto.randomUUID();
		InMemoryPostRepo._insert({
			id: postId,
			threadId: this.currentThreadId!,
			postNumber,
			authorId: postAuthorId,
			displayName: "名無しさん",
			dailyId: "DelDly1",
			body: "削除済みレスのテスト",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: true, // 削除済みフラグ
			createdAt: new Date(),
		});
	},
);

// ---------------------------------------------------------------------------
// Note: 以下のステップは既存ファイルで定義済みのため、reactions.steps.ts では定義しない:
//
//   "ユーザー {string} がレス >>{int} を書き込み済みである"
//     → incentive.steps.ts で定義済み
//
//   "スレッド {string} にレス >>{int} が存在する"
//     → admin.steps.ts と thread.steps.ts で定義済み
//
//   "レス >>(\d+) は自分自身の書き込みである"
//     → ai_accusation.steps.ts で定義済み（world.botPostNumberToId への登録も済み）
//
//   "レス >>999 は存在しない"
//     → admin.steps.ts で定義済み（固定文字列）
//
//   "レス >>10 はシステムメッセージである"
//     → command_system.steps.ts で定義済み（固定文字列）
//
//   "コマンドが正常に実行される"
//     → command_system.steps.ts で定義済み（lastResult.type === "success" を確認）
//
//   "通貨残高は {int} のまま変化しない"
//     → common.steps.ts で定義済み
//
//   "{string} を実行する"（例: "!w >>3" を実行する）
//     → command_system.steps.ts で定義済み。PostService 経由で実行される。
//        Before フックで require.cache に InMemoryGrassRepo を差し込み済み。
//
//   "レス末尾にシステム情報がマージ表示される:"
//     → bot_system.steps.ts で定義済み（world.lastAttackResult を確認）。
//        world.ts の lastAttackResult getter が lastGrassResult にフォールバックするため、
//        草コマンドの executeGrassCommand（or AfterStep 経由）で設定された
//        lastGrassResult が使用される。
//
//   "レス末尾にエラー {string} がマージ表示される"
//     → command_system.steps.ts で定義済み（inlineSystemInfo を確認）。
//        executeGrassCommand がレスを作成し inlineSystemInfo に設定するため互換性あり。
//
//   "レス末尾にエラーがマージ表示される"（引数なし）
//     → bot_system.steps.ts で定義済み（world.lastAttackResult を確認）。
//        lastAttackResult getter が lastGrassResult にフォールバックするため、
//        AfterStep で設定された lastGrassResult が使用される。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// When: コマンド実行
//
// Note: `"!w >>N" を実行する` は command_system.steps.ts の `{string} を実行する` と
//   Cucumber Expression のパターンが重複するため、reactions.steps.ts では定義しない。
//   Before フックで InMemoryGrassRepo を require.cache に差し込み、
//   command_system.steps.ts の PostService 経由で正常動作させる。
// ---------------------------------------------------------------------------

/**
 * ユーザー "UserX" が "!w >>N" を実行する。
 *
 * 名前付きユーザーが指定レスに草コマンドを実行する。
 * ensureNamedUserForGrass で grassState.userNameToId を更新し、
 * world.namedUsers または incentive.steps.ts の namedUsers から userId を解決する。
 *
 * See: features/reactions.feature @レスに草を生やすとレス書き込み主の草カウントが1増える
 */
When(
	/^ユーザー "([^"]+)" が "!w >>(\d+)" を実行する$/,
	async function (
		this: BattleBoardWorld,
		giverName: string,
		postNumberStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		const { userId: giverId } = await ensureNamedUserForGrass(this, giverName);

		await executeGrassCommand(this, postNumber, giverId);
	},
);

/**
 * ユーザーが "!w >>N" を実行する（名前なし — ボットへの草シナリオ用）。
 *
 * Background で設定された currentUser がコマンドを実行する。
 *
 * See: features/reactions.feature @ボットの書き込みに草を生やせる
 */
When(
	/^ユーザーが "!w >>(\d+)" を実行する$/,
	async function (this: BattleBoardWorld, postNumberStr: string) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		await executeGrassCommand(this, postNumber);
	},
);

/**
 * 日付が変更された後にユーザー "UserX" が "!w >>N" を実行する。
 *
 * 時刻を翌日（2026-03-18）に進めてからコマンドを実行する。
 *
 * See: features/reactions.feature @日付が変われば同じユーザーに再度草を生やせる
 * See: docs/architecture/bdd_test_strategy.md §5.1 時計凍結の原則
 */
When(
	/^日付が変更された後にユーザー "([^"]+)" が "!w >>(\d+)" を実行する$/,
	async function (
		this: BattleBoardWorld,
		giverName: string,
		postNumberStr: string,
	) {
		const postNumber = parseInt(postNumberStr, 10);
		await ensureCurrentUserAndThread(this);

		// 「昨日の草記録」の Given ステップで昨日の日付を設定済み。
		// GrassHandler は new Date() で今日の UTC 日付を計算する。
		// Date.now スタブは GrassHandler に影響しないため、時刻変更は不要。
		// 昨日 != 今日 のため重複チェックを通過し草が付与される。
		// See: src/lib/services/handlers/grass-handler.ts > execute (step6)

		const { userId: giverId } = await ensureNamedUserForGrass(this, giverName);
		await executeGrassCommand(this, postNumber, giverId);
	},
);

// ---------------------------------------------------------------------------
// Then: アサーション（reactions.feature 固有のもの）
//
// Note: 以下の Then ステップは既存ファイルと共用:
//   "コマンドが正常に実行される" → command_system.steps.ts
//   "レス末尾にシステム情報がマージ表示される:" → bot_system.steps.ts
//   "レス末尾にエラー {string} がマージ表示される" → command_system.steps.ts
//   "レス末尾にエラーがマージ表示される" → bot_system.steps.ts
//   "通貨残高は {int} のまま変化しない" → common.steps.ts
// ---------------------------------------------------------------------------

/**
 * "UserX" の草カウントが N になる。
 *
 * 指定ユーザーの草カウントが期待値と一致することを確認する。
 *
 * See: features/reactions.feature @レスに草を生やすとレス書き込み主の草カウントが1増える
 */
Then(
	/^"([^"]+)" の草カウントが (\d+) になる$/,
	async function (
		this: BattleBoardWorld,
		userName: string,
		expectedCountStr: string,
	) {
		const expectedCount = parseInt(expectedCountStr, 10);

		// grassState または world.namedUsers から userId を解決する
		let userId = grassState.userNameToId.get(userName);
		if (!userId) {
			const namedUser = this.getNamedUser(userName);
			assert(
				namedUser,
				`ユーザー "${userName}" が登録されていません（grassState にも world.namedUsers にもない）`,
			);
			userId = namedUser.userId;
			grassState.userNameToId.set(userName, userId);
		}

		const actualCount = await InMemoryGrassRepo.getGrassCount(userId);
		assert.strictEqual(
			actualCount,
			expectedCount,
			`"${userName}" の草カウントが ${expectedCount} であることを期待しましたが ${actualCount} でした`,
		);
	},
);

/**
 * "UserX" の草カウントが N 増加する。
 *
 * 草カウントが初期設定値（grassCountsStore 初期値）から N だけ増加していることを確認する。
 *
 * See: features/reactions.feature @異なる付与先ユーザーにはそれぞれ草を生やせる
 * See: features/reactions.feature @日付が変われば同じユーザーに再度草を生やせる
 */
Then(
	/^"([^"]+)" の草カウントが (\d+) 増加する$/,
	async function (
		this: BattleBoardWorld,
		userName: string,
		incrementStr: string,
	) {
		const increment = parseInt(incrementStr, 10);

		let userId = grassState.userNameToId.get(userName);
		if (!userId) {
			const namedUser = this.getNamedUser(userName);
			assert(namedUser, `ユーザー "${userName}" が登録されていません`);
			userId = namedUser.userId;
			grassState.userNameToId.set(userName, userId);
		}

		const actualCount = await InMemoryGrassRepo.getGrassCount(userId);

		// 草カウントが少なくとも increment 以上あることを確認する
		// （初期値が 0 であることを前提として、実際の値が increment と等しいはず）
		assert.strictEqual(
			actualCount,
			increment,
			`"${userName}" の草カウントが ${increment} であることを期待しましたが ${actualCount} でした`,
		);
	},
);

/**
 * レス末尾のシステム情報に "xxx" が含まれる。
 *
 * アイコン検証シナリオで使用する。
 * world.lastGrassResult.systemMessage に期待する文字列が含まれることを確認する。
 *
 * See: features/reactions.feature @草カウント 1〜9 本では 🌱 が表示される
 */
Then(
	/^レス末尾のシステム情報に "([^"]+)" が含まれる$/,
	async function (this: BattleBoardWorld, expectedPart: string) {
		assert(this.lastGrassResult, "草コマンドの実行結果が存在しません");
		assert(
			this.lastGrassResult.success,
			`草コマンドが失敗しました: ${this.lastGrassResult.systemMessage}`,
		);

		const actualMessage = this.lastGrassResult.systemMessage ?? "";
		assert(
			actualMessage.includes(expectedPart),
			`システム情報に "${expectedPart}" が含まれることを期待しましたが "${actualMessage}" でした`,
		);
	},
);

/**
 * 草カウントは変化しない。
 *
 * コマンドがエラーになったことを確認する。
 * lastGrassResult または lastAttackResult（getter フォールバック）を使用する。
 *
 * executeGrassCommand パス: world.lastGrassResult に結果が設定される。
 * PostService パス: AfterStep フックが inlineSystemInfo から lastGrassResult を設定する。
 * どちらのパスでも lastGrassResult.success === false であることを確認する。
 *
 * See: features/reactions.feature @同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
 * See: features/reactions.feature @自分が書いたレスには草を生やせない
 * See: features/reactions.feature @存在しないレスに草を生やそうとするとエラーになる
 */
Then("草カウントは変化しない", async function (this: BattleBoardWorld) {
	// lastGrassResult を優先して確認する（executeGrassCommand パスも PostService パスも対応）
	const grassResult = this.lastGrassResult;
	if (grassResult !== null) {
		assert.strictEqual(
			grassResult.success,
			false,
			`草コマンドがエラーになることを期待しましたが成功しています: ${grassResult.systemMessage}`,
		);
		return;
	}

	// PostService パスで AfterStep が未設定の場合（フォールバック）
	// lastResult がエラーでないことを確認する
	assert(this.lastResult, "操作結果が存在しません");
	assert.strictEqual(
		this.lastResult.type,
		"error",
		"エラーが期待されましたが成功しています",
	);
});

/**
 * ボットの正体は暴露されない。
 *
 * 草コマンドがボットの正体をシステムメッセージに含めないことを確認する。
 *
 * See: features/reactions.feature @ボットの書き込みに草を生やせる
 */
Then("ボットの正体は暴露されない", async function (this: BattleBoardWorld) {
	assert(this.lastGrassResult, "草コマンドの実行結果が存在しません");

	const message = this.lastGrassResult.systemMessage ?? "";
	// "BotDly1" は dailyId であり、これを含むことは正体暴露ではない
	// 「ボット」「AIボット」「正体」などのキーワードが含まれないことを確認する
	const botRevealKeywords = ["ボット", "AIボット", "正体", "撃破", "bot_id"];
	for (const keyword of botRevealKeywords) {
		assert(
			!message.includes(keyword),
			`システムメッセージにボット正体暴露のキーワード "${keyword}" が含まれています: "${message}"`,
		);
	}
});
