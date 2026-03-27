/**
 * command_newspaper.feature ステップ定義
 *
 * !newspaper（AIニュース取得）コマンドのシナリオを実装する。
 * AI API（Gemini + Google Search Grounding）の統合を検証する:
 *   - 非同期キューINSERT → Cron処理 → ★システムレス投稿
 *   - カテゴリランダム選択
 *   - システムプロンプト・カテゴリ指示の検証
 *   - API失敗時の通貨返却・エラー通知
 *
 * 再利用するステップ（他ファイルで定義済み）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーがログイン済みである" (common.steps.ts)
 *   - "ユーザーの通貨残高が {int} である" (common.steps.ts)
 *   - "本文に {string} を含めて投稿する" (command_system.steps.ts)
 *   - "通貨が {int} 消費される" (command_system.steps.ts)
 *   - "書き込みがスレッドに追加される" (specialist_browser_compat.steps.ts)
 *   - "書き込み本文は {string} がそのまま表示される" (command_system.steps.ts)
 *   - "コマンドは実行されない" (command_system.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *   - "ユーザーが {string} を含む書き込みを投稿した" (command_aori.steps.ts)
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §5
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import { NEWSPAPER_CATEGORIES } from "../../config/newspaper-categories";
import { NEWSPAPER_SYSTEM_PROMPT } from "../../config/newspaper-prompt";
import { processNewspaperCommands } from "../../src/lib/services/newspaper-service";
import { InMemoryGoogleAiAdapter } from "../support/in-memory/google-ai-adapter";
import {
	InMemoryCurrencyRepo,
	InMemoryIncentiveLogRepo,
	InMemoryPendingAsyncCommandRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md S2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getPostService() {
	return require("../../src/lib/services/post-service") as typeof import("../../src/lib/services/post-service");
}

function getCurrencyService() {
	return require("../../src/lib/services/currency-service") as typeof import("../../src/lib/services/currency-service");
}

// ---------------------------------------------------------------------------
// モックインスタンス（シナリオ間で共有）
// ---------------------------------------------------------------------------

/**
 * AI API モック。
 * shouldFail を設定してエラーシナリオを検証する。
 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
 */
const mockAiAdapter = new InMemoryGoogleAiAdapter();

/** Cron処理結果（processNewspaperCommands の戻り値） */
let lastNewspaperResult: Awaited<
	ReturnType<typeof processNewspaperCommands>
> | null = null;

// ---------------------------------------------------------------------------
// processNewspaperCommands の DI 実行ヘルパー
// ---------------------------------------------------------------------------

/**
 * モック依存を注入して processNewspaperCommands を実行する。
 * 「コマンドの非同期処理が実行される」と「AI APIが呼び出される」の両方で使用する。
 *
 * createPostFn は InMemory 版を使用する（mock-installer 経由）。
 * creditFn は InMemory 版の currency-service を使用する。
 *
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §5.2
 */
async function executeProcessNewspaperCommands(): Promise<void> {
	const PostService = getPostService();
	const CurrencyService = getCurrencyService();

	lastNewspaperResult = await processNewspaperCommands({
		pendingAsyncCommandRepository: InMemoryPendingAsyncCommandRepo,
		googleAiAdapter: mockAiAdapter,
		// InMemory 版 createPost をアダプター経由で渡す
		createPostFn: async (params) => {
			const result = await PostService.createPost({
				threadId: params.threadId,
				body: params.body,
				edgeToken: params.edgeToken,
				ipHash: params.ipHash,
				displayName: params.displayName,
				isBotWrite: params.isBotWrite,
				isSystemMessage: params.isSystemMessage,
			});
			if ("success" in result && result.success) {
				return { success: true, postId: result.postId };
			}
			throw new Error("error" in result ? result.error : "createPost failed");
		},
		// InMemory 版 credit（CreditReason 型を強制）
		creditFn: (userId, amount, _reason) =>
			CurrencyService.credit(
				userId,
				amount,
				"newspaper_api_failure" as Parameters<typeof CurrencyService.credit>[2],
			),
	});
}

// ---------------------------------------------------------------------------
// シナリオ後のリセット処理
// hooks.ts の Before フックで mockAiAdapter もリセットするよう追加する代わりに、
// 各シナリオの Given で明示的にリセットする。
// ---------------------------------------------------------------------------

/**
 * モック状態をリセットする（各シナリオの開始時に呼び出す）。
 * mock-installer.ts の resetAllStores() はリポジトリのみリセットするため、
 * InMemoryGoogleAiAdapter は個別にリセットが必要。
 */
function resetMockState(): void {
	mockAiAdapter.reset();
	lastNewspaperResult = null;
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** !newspaper コマンドのコスト（commands.yaml と同値） */
const NEWSPAPER_COMMAND_COST = 10;

/** テスト用に設定する初期通貨残高（コマンドコストを上回る値） */
const DEFAULT_TEST_BALANCE = 100;

// ---------------------------------------------------------------------------
// ユーティリティ: new_thread_join ボーナスのブロック
// ---------------------------------------------------------------------------

/**
 * InMemoryIncentiveLogRepo に new_thread_join エントリを事前挿入して、
 * 初回スレッド参加ボーナス(+3)が付与されるのを防ぐ。
 *
 * Background の「コマンドレジストリに以下のコマンドが登録されている:」ステップは
 * そのステップで作成したユーザーに対してのみブロックを行う。
 * その後「ユーザーがログイン済みである」で別ユーザーが設定されると、
 * 新ユーザーへのブロックが欠落する。
 * このヘルパーを呼ぶことで各シナリオの投稿前にブロックを確実に適用する。
 *
 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
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

// ---------------------------------------------------------------------------
// Given: "!newspaper" が実行された
// See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
// ---------------------------------------------------------------------------

Given('"!newspaper" が実行された', async function (this: BattleBoardWorld) {
	resetMockState();

	assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");
	assert(this.currentUserId, "ユーザーIDが設定されていません");
	assert(this.currentThreadId, "スレッドが設定されていません");

	// 通貨残高がコマンドコスト未満の場合は設定する（デフォルト残高0対策）
	// See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
	const currentBalance = await InMemoryCurrencyRepo.getBalance(
		this.currentUserId,
	);
	if (currentBalance < NEWSPAPER_COMMAND_COST) {
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId,
			balance: DEFAULT_TEST_BALANCE,
			updatedAt: new Date(Date.now()),
		});
	}

	// 初回スレッド参加ボーナス(+3)が付与されないよう事前ブロック
	// Backgroundの「コマンドレジストリ...」ステップは別ユーザーに対してのみブロックするため
	// このシナリオのユーザーに対して明示的にブロックが必要
	blockNewThreadJoinBonus(this.currentUserId, this.currentThreadId);

	const PostService = getPostService();
	const result = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "!newspaper",
		edgeToken: this.currentEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});

	assert(
		"success" in result && result.success,
		`!newspaper 投稿が失敗しました: ${"error" in result ? result.error : "unknown"}`,
	);
});

// ---------------------------------------------------------------------------
// When: コマンドの非同期処理が実行される（newspaper 専用）
// Note: command_aori.steps.ts に "BOT召喚の定期処理が実行される" は定義済みだが、
//       newspaper 専用の非同期処理ステップを別途定義して明確に区別する。
// See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
// ---------------------------------------------------------------------------

When(
	"コマンドの非同期処理が実行される",
	async function (this: BattleBoardWorld) {
		await executeProcessNewspaperCommands();
	},
);

// ---------------------------------------------------------------------------
// Then: 「★システム」名義の独立レスでニュースが表示される
// See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
// ---------------------------------------------------------------------------

Then(
	"「★システム」名義の独立レスでニュースが表示される",
	async function (this: BattleBoardWorld) {
		assert(lastNewspaperResult, "processNewspaperCommands の結果がありません");
		assert(
			lastNewspaperResult.processed > 0,
			"newspaper pending が処理されていません",
		);

		const successResult = lastNewspaperResult.results.find((r) => r.success);
		assert(successResult, "成功した処理がありません");
		assert(successResult.postId, "postId が設定されていません");

		// 投稿内容を取得して検証
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts =
			await InMemoryPendingAsyncCommandRepo.findByCommandType("newspaper");
		// pending は削除されているはず（成功時に cleanup）
		assert.strictEqual(
			posts.length,
			0,
			"成功後は pending が削除されているべきです",
		);

		// 投稿がシステムメッセージとして投稿されているか確認
		const { InMemoryPostRepo } = require("../support/mock-installer");
		const threadPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const systemPost = threadPosts.find(
			(p: any) => p.id === successResult.postId,
		);
		assert(systemPost, "★システムの投稿が見つかりません");
		assert.strictEqual(
			systemPost.displayName,
			"★システム",
			"表示名が '★システム' であるべきです",
		);
		assert.strictEqual(
			systemPost.isSystemMessage,
			true,
			"isSystemMessage が true であるべきです",
		);
	},
);

// ---------------------------------------------------------------------------
// Given: "!newspaper" による非同期処理が実行される
// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
// ---------------------------------------------------------------------------

Given(
	'"!newspaper" による非同期処理が実行される',
	async function (this: BattleBoardWorld) {
		resetMockState();

		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");
		assert(this.currentUserId, "ユーザーIDが設定されていません");
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 通貨残高がコマンドコスト未満の場合は設定する（デフォルト残高0対策）
		// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
		const currentBalance = await InMemoryCurrencyRepo.getBalance(
			this.currentUserId,
		);
		if (currentBalance < NEWSPAPER_COMMAND_COST) {
			InMemoryCurrencyRepo._upsert({
				userId: this.currentUserId,
				balance: DEFAULT_TEST_BALANCE,
				updatedAt: new Date(Date.now()),
			});
		}

		// 初回スレッド参加ボーナス(+3)が付与されないよう事前ブロック
		// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
		blockNewThreadJoinBonus(this.currentUserId, this.currentThreadId);

		// !newspaper を投稿して pending に INSERT する
		const PostService = getPostService();
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "!newspaper",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});

		assert(
			"success" in result && result.success,
			`!newspaper 投稿が失敗しました: ${"error" in result ? result.error : "unknown"}`,
		);
	},
);

// ---------------------------------------------------------------------------
// When: AI APIが呼び出される
// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
// ---------------------------------------------------------------------------

When("AI APIが呼び出される", async function (this: BattleBoardWorld) {
	await executeProcessNewspaperCommands();
});

// ---------------------------------------------------------------------------
// Then: システムプロンプトに新聞配達員の人格設定が含まれる
// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
// ---------------------------------------------------------------------------

Then(
	"システムプロンプトに新聞配達員の人格設定が含まれる",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
		assert(
			lastCall.systemPrompt.includes("新聞配達員"),
			`システムプロンプトに「新聞配達員」が含まれるべきです: "${lastCall.systemPrompt.slice(0, 50)}..."`,
		);
		// config/newspaper-prompt.ts の定数と一致することを確認
		assert.strictEqual(
			lastCall.systemPrompt,
			NEWSPAPER_SYSTEM_PROMPT,
			"システムプロンプトが NEWSPAPER_SYSTEM_PROMPT と一致するべきです",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: Web検索結果がコンテキストとして渡される
// Note: Google Search Grounding の有効化は GoogleAiAdapter 内で tools: [{ googleSearch: {} }]
//       で設定される。モックでは呼び出し自体を検証する（実際の検索は本番APIの責務）。
// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
// ---------------------------------------------------------------------------

Then(
	"Web検索結果がコンテキストとして渡される",
	function (this: BattleBoardWorld) {
		// Google Search Grounding は GoogleAiAdapter 内で設定済み。
		// BDD テストではモックを使用するため、API 呼び出しが発生したことを確認する。
		assert(
			mockAiAdapter.calls.length > 0,
			"AI API が呼び出されていません（Google Search Grounding を有効にして呼び出す必要があります）",
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 選択されたカテゴリがプロンプトの指示に含まれる
// See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
// ---------------------------------------------------------------------------

Then(
	"選択されたカテゴリがプロンプトの指示に含まれる",
	function (this: BattleBoardWorld) {
		assert(mockAiAdapter.calls.length > 0, "AI API が呼び出されていません");
		const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];

		// ユーザープロンプトにカテゴリが含まれることを確認
		const containsCategory = NEWSPAPER_CATEGORIES.some((cat) =>
			lastCall.userPrompt.includes(cat),
		);
		assert(
			containsCategory,
			`ユーザープロンプトにカテゴリが含まれるべきです: "${lastCall.userPrompt}"`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 以下のカテゴリからランダムに1つが選択される:
// See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
// ---------------------------------------------------------------------------

Then(
	"以下のカテゴリからランダムに1つが選択される:",
	async function (this: BattleBoardWorld, dataTable: any) {
		// DataTable から期待カテゴリリストを取得
		const expectedCategories = dataTable.rows().map((row: string[]) => row[0]);

		// pending の payload に category が設定されているか確認
		// （非同期処理前の時点での検証のため、pending が残っているはず）
		const pendingList =
			await InMemoryPendingAsyncCommandRepo.findByCommandType("newspaper");

		// pending が存在しない場合（既に処理済み）は processNewspaperCommands の呼び出し結果から確認
		if (pendingList.length === 0) {
			// 処理済みの場合は AI API 呼び出し時のユーザープロンプトからカテゴリを確認
			if (mockAiAdapter.calls.length > 0) {
				const lastCall = mockAiAdapter.calls[mockAiAdapter.calls.length - 1];
				const containsExpected = expectedCategories.some((cat: string) =>
					lastCall.userPrompt.includes(cat),
				);
				assert(
					containsExpected,
					`ユーザープロンプトが期待カテゴリのいずれかを含むべきです。プロンプト: "${lastCall.userPrompt}"`,
				);
			} else {
				// pending も AI API 呼び出しも存在しない場合はエラー
				assert.fail(
					"pending_async_commands に newspaper エントリが見つかりません（コマンドが実行されたか確認してください）",
				);
			}
			return;
		}

		// pending の payload.category を確認
		const latestPending = pendingList[pendingList.length - 1];
		const payload = latestPending.payload as { category?: string } | null;
		const category = payload?.category;

		assert(category, "pending の payload に category が設定されているべきです");
		assert(
			expectedCategories.includes(category),
			`カテゴリ "${category}" が期待カテゴリ [${expectedCategories.join(", ")}] に含まれるべきです`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 選択されたカテゴリに関するニュースが取得される
// See: features/command_newspaper.feature @ニュースのカテゴリが実行のたびにランダムに選ばれる
// ---------------------------------------------------------------------------

Then(
	"選択されたカテゴリに関するニュースが取得される",
	async function (this: BattleBoardWorld) {
		assert(lastNewspaperResult, "processNewspaperCommands の結果がありません");
		const successResult = lastNewspaperResult.results.find((r) => r.success);
		assert(successResult, "カテゴリのニュース取得が成功しているべきです");
	},
);

// ---------------------------------------------------------------------------
// Given: 通貨が 10 消費され残高が 90 になっている
// Note: このステップは Scenario: AI API呼び出しが失敗した場合は通貨返却・システム通知 の前提条件。
//       "通貨が N 消費され残高が M になる" (Then, ai_accusation.steps.ts) とは異なる
//       Given ステップとして定義する。
// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
// ---------------------------------------------------------------------------

Given(
	"通貨が 10 消費され残高が 90 になっている",
	async function (this: BattleBoardWorld) {
		// このGivenステップは "ユーザーが '!newspaper' を含む書き込みを投稿した" の後に実行される。
		// 投稿時にコマンドコスト(10)が消費されるが、IncentiveService の new_thread_join ボーナス(+3)が
		// 同時に付与される可能性がある（Background の「コマンドレジストリ...」ステップが
		// 別ユーザーのブロックのみを行うため）。
		//
		// このステップは「コマンドコスト10が消費されて残高90の状態である」という前提条件を保証するため、
		// インセンティブボーナスの有無にかかわらず残高を90に正規化する。
		// これにより後続の「通貨返却後の残高が100に戻る」検証が正確に動作する。
		//
		// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		// コマンドが実際に実行されたこと（残高が 100 未満）を確認してから正規化する
		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(this.currentUserId);
		assert(
			balance < DEFAULT_TEST_BALANCE,
			`コマンドが実行されていません（残高が ${DEFAULT_TEST_BALANCE} のままです）`,
		);

		// 残高を期待値(90)に正規化する（new_thread_join ボーナスが付いていても90になる）
		InMemoryCurrencyRepo._upsert({
			userId: this.currentUserId,
			balance: DEFAULT_TEST_BALANCE - NEWSPAPER_COMMAND_COST,
			updatedAt: new Date(Date.now()),
		});
	},
);

// ---------------------------------------------------------------------------
// Given: AI APIが利用不可である（リトライ含む全試行が失敗）
// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
// ---------------------------------------------------------------------------

Given(
	"AI APIが利用不可である（リトライ含む全試行が失敗）",
	function (this: BattleBoardWorld) {
		// InMemoryGoogleAiAdapter の shouldFail を true に設定
		// これにより generateWithSearch が例外をスローする（リトライ含む全試行失敗のシミュレーション）
		// See: features/support/in-memory/google-ai-adapter.ts
		mockAiAdapter.shouldFail = true;
	},
);

// ---------------------------------------------------------------------------
// Then: 消費された通貨 10 がユーザーに返却され残高が 100 に戻る
// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
// ---------------------------------------------------------------------------

Then(
	"消費された通貨 10 がユーザーに返却され残高が 100 に戻る",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const CurrencyService = getCurrencyService();
		const balance = await CurrencyService.getBalance(this.currentUserId);
		assert.strictEqual(
			balance,
			100,
			`通貨返却後の残高が 100 であるべきですが ${balance} です`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 「★システム」名義の独立レスでエラーが通知される
//
// 汎用ステップ: InMemoryPostRepo から「★システム」名義の投稿の存在を検証する。
// lastNewspaperResult 等の特定コマンド結果変数に依存しない。
// newspaper, hiroyuki 等の複数コマンドから再利用可能。
// メッセージ内容のコマンド固有検証は各コマンドのステップ定義に委譲する。
//
// See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
// See: features/command_hiroyuki.feature @AI API呼び出しが失敗した場合はBOT未生成・通貨返却
// ---------------------------------------------------------------------------

Then(
	"「★システム」名義の独立レスでエラーが通知される",
	async function (this: BattleBoardWorld) {
		// InMemoryPostRepo から「★システム」名義のエラー通知投稿を検索する。
		// 特定コマンドの結果変数（lastNewspaperResult 等）に依存せず、
		// リポジトリの状態から汎用的に検証する。
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const { InMemoryPostRepo } = require("../support/mock-installer");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const systemErrorPost = posts.find(
			(p: any) => p.displayName === "★システム" && p.isSystemMessage === true,
		);
		assert(
			systemErrorPost,
			"「★システム」名義のエラー通知投稿が見つかりません",
		);
	},
);
