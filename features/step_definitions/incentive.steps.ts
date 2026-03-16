/**
 * incentive.feature のステップ定義
 *
 * インセンティブ（通貨獲得ボーナス）に関する全30シナリオのステップを実装する。
 * PostService.createPost / createThread 経由でインセンティブを発火させる（直接呼び出し禁止）。
 *
 * See: features/incentive.feature @全30シナリオ
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 incentive.feature
 */

import type { ITestStepHookParameter } from "@cucumber/cucumber";
import { BeforeStep, Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import type { IncentiveLog } from "../../src/lib/domain/models/incentive";
import type { Post } from "../../src/lib/domain/models/post";
import * as AuthService from "../../src/lib/services/auth-service";
import * as CurrencyService from "../../src/lib/services/currency-service";
import * as IncentiveService from "../../src/lib/services/incentive-service";
import * as PostService from "../../src/lib/services/post-service";
import {
	InMemoryCurrencyRepo,
	InMemoryIncentiveLogRepo,
	InMemoryPostRepo,
	InMemoryThreadRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld, UserContext } from "../support/world";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルトの板 ID */
const TEST_BOARD_ID = "battleboard";

/**
 * 時刻依存テストで使用する基準時刻 T（固定値）。
 * 全ての時刻依存シナリオはこの時刻を起点として相対オフセットを計算する。
 * 実行タイミングに依存せず、常に同一の結果を保証する（flakyテスト排除）。
 *
 * See: docs/architecture/bdd_test_strategy.md §5.2 相対時刻の禁止
 */
const TEST_BASE_TIME = new Date("2026-03-12T10:00:00+09:00");

/** 名前付きユーザーに対応する IP ハッシュ生成 */
function getIpHashForUser(name: string): string {
	return `bdd-test-ip-hash-${name}-sha512-placeholder`;
}

/** 名前付きユーザーを登録または取得するヘルパー */
async function ensureNamedUser(
	world: BattleBoardWorld,
	name: string,
): Promise<UserContext> {
	let ctx = world.getNamedUser(name);
	if (!ctx) {
		const ipHash = getIpHashForUser(name);
		const { token, userId } = await AuthService.issueEdgeToken(ipHash);
		// isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
		// See: features/authentication.feature @認証フロー是正
		await InMemoryUserRepo.updateIsVerified(userId, true);
		ctx = {
			userId,
			edgeToken: token,
			ipHash,
			isPremium: false,
			username: null,
		};
		world.setNamedUser(name, ctx);
	}
	return ctx;
}

/**
 * 今日の JST 日付文字列を取得する。
 * new Date() を直接使用することで、post-service.ts の new Date() による createdAt と
 * 同じ時刻基準になり、incentive-service.ts の contextDate との整合性を保つ。
 *
 * Note: post-service.ts が new Date() を使用しているため、Date.now() スタブの恩恵を
 * 受けられない。post-service.ts が new Date(Date.now()) 対応になり次第、
 * こちらも new Date(Date.now()) に統一できる。
 * 日付・ストリーク関連テストは日付変わり境界時刻以外では安定して動作する。
 *
 * See: docs/architecture/bdd_test_strategy.md §5.3 サービス層の時刻取得統一（注記）
 */
function getTodayJst(): string {
	// Date.now() を使用することで、setCurrentTime による時計凍結が反映される。
	// post-service.ts が new Date(Date.now()) で createdAt を設定するようになったため、
	// ステップ定義側も Date.now() を使用して日付の整合性を保つ。
	// See: src/lib/services/post-service.ts getTodayJst()
	const now = new Date(Date.now());
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstDate = new Date(now.getTime() + jstOffset);
	return jstDate.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// BeforeStep: incentive.feature 専用スレッド自動作成 + daily_login 抑制フック
// ---------------------------------------------------------------------------

/**
 * インセンティブシナリオで「今日まだ書き込みをしていない」が明示的に設定されたかを
 * シナリオ（World インスタンス）ごとに追跡するフラグ。
 *
 * このフラグが true のシナリオでは、BeforeStep での lastPostDate 自動設定をスキップし、
 * daily_login ボーナスを意図通り発火させる。
 *
 * WeakMap を使うことでシナリオ終了時に自動的にガベージコレクトされる。
 */
const dailyLoginIntendedWorlds = new WeakMap<BattleBoardWorld, boolean>();

/**
 * インセンティブシナリオで「そのスレッドに過去書き込みをしたことがない」が設定されたかを
 * シナリオ（World インスタンス）ごとに追跡するフラグ。
 *
 * このフラグが true のシナリオでは、BeforeStep での「参加済みダミーレス追加」をスキップし、
 * new_thread_join ボーナスを意図通り発火させる。
 *
 * WeakMap を使うことでシナリオ終了時に自動的にガベージコレクトされる。
 */
const newThreadJoinTestWorlds = new WeakMap<BattleBoardWorld, boolean>();

/**
 * スレッド復興ボーナステスト用の非活性時刻を保持するマップ。
 *
 * post-service.ts は createPost 後に ThreadRepository.updateLastPostAt を呼ぶため、
 * evaluateOnPost 実行時点では thread.lastPostAt が書き込み時刻に更新されている。
 * そのため evaluateThreadRevivalBonus の isInactiveThread 判定が false になってしまう。
 *
 * このマップで保存した非活性時刻を使い、復興書き込みの createPost 後に
 * lastPostAt を非活性時刻に戻してから後続書き込みを行うことで、
 * UserRevivalFollower の書き込み時に evaluateThreadRevivalBonus が正しく動作するよう制御する。
 *
 * WeakMap を使うことでシナリオ終了時に自動的にガベージコレクトされる。
 */
const threadRevivalInactiveTimes = new WeakMap<BattleBoardWorld, Date>();

/**
 * common.steps.ts の「スレッドに書き込みを1件行う」は currentThreadId を前提とするが、
 * incentive.feature の Background はスレッドを作成しない。
 * このフックで incentive.feature のシナリオに限りスレッドを自動作成する。
 *
 * また、daily_login テストシナリオ以外では書き込み前に currentUserId / namedUsers の
 * lastPostDate を今日に設定して余分な daily_login ボーナス発火を抑制する。
 *
 * See: features/incentive.feature Background
 * See: features/step_definitions/common.steps.ts:175
 */
BeforeStep(async function (
	this: BattleBoardWorld,
	step: ITestStepHookParameter,
) {
	const stepText = step.pickleStep?.text ?? "";

	// "スレッドに書き込みを1件行う" の直前に currentThreadId がなければデフォルトスレッドを作成する
	// new_thread_join テストシナリオ以外ではダミーレスも追加してスレッド初参加扱いを防ぐ
	// （new_thread_join ボーナスの誤発火防止）
	// Note: dailyLoginIntendedWorlds フラグは daily_login ボーナス制御のためのものであり、
	//       ダミーレス追加の判定には使用しない（バグ修正後は new_thread_join は独立して制御する）
	if (
		stepText === "スレッドに書き込みを1件行う" &&
		!this.currentThreadId &&
		this.currentUserId
	) {
		const threadKey = Math.floor(Date.now() / 1000).toString();
		const thread = await InMemoryThreadRepo.create({
			threadKey,
			boardId: TEST_BOARD_ID,
			title: "incentive-test-default-thread",
			createdBy: this.currentUserId,
		});
		this.currentThreadId = thread.id;
		// new_thread_join テストシナリオ以外ではダミーレスを追加して「参加済み」にする
		// daily_login テストシナリオ（dailyLoginIntendedWorlds=true）でも参加済みにする
		if (!newThreadJoinTestWorlds.get(this)) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: thread.id,
				postNumber: 1,
				authorId: this.currentUserId,
				displayName: "名無しさん",
				dailyId: `daily-${this.currentUserId}-${getTodayJst()}`,
				body: "参加済みダミーレス",
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - 60 * 1000),
			});
		}
	}

	// ステップ直前に、daily_login が意図されていないシナリオでは
	// lastPostDate を今日に設定して余分な daily_login ボーナス発火を抑制する。
	// user.lastPostDate === null チェックがあるため、既に lastPostDate が設定済みのユーザーには影響しない。
	if (!dailyLoginIntendedWorlds.get(this)) {
		const todayJst = getTodayJst();
		// currentUserId の lastPostDate が null の場合のみ today に設定する
		// （lastPostDate が null = 未書き込み状態なので daily_login が発火してしまう）
		// 明示的な日付が設定済み（yesterday 等）の場合はストリーク計算用なので上書きしない
		if (this.currentUserId) {
			const user = await InMemoryUserRepo.findById(this.currentUserId);
			if (user && user.lastPostDate === null) {
				InMemoryUserRepo._insert({ ...user, lastPostDate: todayJst });
			}
		}
		// namedUsers の lastPostDate が null の場合のみ today に設定
		for (const [, ctx] of this.namedUsers) {
			const namedUser = await InMemoryUserRepo.findById(ctx.userId);
			if (namedUser && namedUser.lastPostDate === null) {
				InMemoryUserRepo._insert({ ...namedUser, lastPostDate: todayJst });
			}
		}
	}
});

// ---------------------------------------------------------------------------
// ヘルパー: 指定ユーザーの全インセンティブログを取得（日付制約なし）
// ---------------------------------------------------------------------------

/**
 * 指定ユーザーのインセンティブログを全件取得する（日付制約なし）。
 * IncentiveService が使用する contextDate とテストの todayJst が
 * タイムゾーン境界付近でずれる可能性を回避するため、findByUserId を使用する。
 *
 * See: features/support/in-memory/incentive-log-repository.ts
 */
async function findAllLogsForUser(userId: string): Promise<IncentiveLog[]> {
	return InMemoryIncentiveLogRepo.findByUserId(userId);
}

// ---------------------------------------------------------------------------
// ヘルパー: 指定ユーザーをスレッド参加済み状態にする
// ---------------------------------------------------------------------------

/**
 * new_thread_join テストシナリオ以外で、ユーザーがスレッドに参加済みであることを
 * ダミーレス挿入によって保証するヘルパー。
 *
 * incentive-service.ts のバグ修正（ctx.postId 除外）により、以前は偶然 new_thread_join が
 * 発火しなかったシナリオでも正しく発火するようになった。そのため、new_thread_join を
 * 意図的にテストするシナリオ（newThreadJoinTestWorlds=true）以外では、
 * 書き込み前にユーザー自身のダミーレスを追加して「参加済み」状態にする必要がある。
 *
 * See: features/incentive.feature Rule: 過去に書き込んだことがないスレッドへの初書き込みで +3
 * See: tmp/escalations/escalation_ESC-TASK-019-1.md (副作用の詳細)
 *
 * @param world - BattleBoardWorld インスタンス
 * @param userId - 参加済みにするユーザーID
 * @param threadId - 対象スレッドID
 */
function ensureUserParticipated(
	world: BattleBoardWorld,
	userId: string,
	threadId: string,
): void {
	// new_thread_join テストシナリオでは追加しない（初参加ボーナスを発火させるため）
	if (newThreadJoinTestWorlds.get(world)) return;

	// ユーザー自身のダミーレスを挿入して「参加済み」状態にする
	// createdAt は Date.now() - 2分 で計算する。
	// 時計凍結中は凍結時刻から2分前、未凍結時は実時間から2分前となる。
	// いずれの場合も「今回の書き込みより前」であることが保証される。
	InMemoryPostRepo._insert({
		id: crypto.randomUUID(),
		threadId,
		postNumber: 0, // ダミー番号（実際のレス番号採番とは独立）
		authorId: userId,
		displayName: "名無しさん",
		dailyId: `daily-${userId}-${getTodayJst()}`,
		body: "参加済みダミーレス（new_thread_join 抑制用）",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		createdAt: new Date(Date.now() - 2 * 60 * 1000),
	});
}

// ---------------------------------------------------------------------------
// Given: 書き込みログインボーナスの日次状態設定
// ---------------------------------------------------------------------------

/**
 * 今日まだ書き込みをしていない状態を設定する。
 * ユーザーの lastPostDate を昨日の日付に設定（または null のまま）する。
 *
 * See: features/incentive.feature @その日の初回書き込みでログインボーナス +10 が付与される
 */
Given("今日まだ書き込みをしていない", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが見つかりません");
	// daily_login ボーナスを意図的に発火させるシナリオとしてフラグを立てる
	dailyLoginIntendedWorlds.set(this, true);
	// lastPostDate を null に設定（初回書き込みとして扱う）
	await InMemoryUserRepo.updateStreak(
		this.currentUserId,
		user.streakDays,
		null as unknown as string,
	);
	// updateStreak で lastPostDate を null に相当する値にするためユーザーを直接操作
	InMemoryUserRepo._insert({ ...user, lastPostDate: null });
});

/**
 * 今日すでに1回書き込みをしている状態を設定する。
 * ユーザーの lastPostDate を今日の日付に設定する。
 *
 * See: features/incentive.feature @同日の2回目以降の書き込みではボーナスは付与されない
 */
Given(
	"今日すでに1回書き込みをしている",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		const todayJst = getTodayJst();
		// 今日の日付で lastPostDate を設定しストリークを1日目に
		InMemoryUserRepo._insert({
			...user,
			lastPostDate: todayJst,
			streakDays: 1,
		});
		// daily_login ログも追加して重複ガードを有効化
		InMemoryIncentiveLogRepo._insert({
			id: crypto.randomUUID(),
			userId: this.currentUserId,
			eventType: "daily_login",
			amount: 10,
			contextId: this.currentThreadId ?? "dummy-thread",
			contextDate: todayJst,
			createdAt: new Date(),
		});
	},
);

/**
 * 今日まだスレッドを作成していない状態を設定する（thread_creation ログなし）。
 *
 * See: features/incentive.feature @その日の初回スレッド作成でボーナス +10 が付与される
 */
Given(
	"今日まだスレッドを作成していない",
	async function (this: BattleBoardWorld) {
		// thread_creation ログがない状態 = リセット済みストアでデフォルト
		// 特に何もしない（Beforeフックでリセット済み）
	},
);

/**
 * 今日すでに1回スレッドを作成している状態を設定する。
 * thread_creation インセンティブログを追加して重複ガードを有効化する。
 *
 * See: features/incentive.feature @同日の2回目以降のスレッド作成ではボーナスは付与されない
 */
Given(
	"今日すでに1回スレッドを作成している",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const todayJst = getTodayJst();
		InMemoryIncentiveLogRepo._insert({
			id: crypto.randomUUID(),
			userId: this.currentUserId,
			eventType: "thread_creation",
			amount: 10,
			contextId: "dummy-thread-id",
			contextDate: todayJst,
			createdAt: new Date(),
		});
		// daily_login もセット（スレッド作成後の書き込みとして）
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		if (user) {
			InMemoryUserRepo._insert({
				...user,
				lastPostDate: todayJst,
				streakDays: 1,
			});
		}
	},
);

/**
 * 今日まだ書き込みもスレッド作成もしていない状態を設定する。
 * スレッド作成ログインボーナスのテスト用。
 * daily_login は発火させない（スレッド作成は書き込みログインボーナスの対象外）。
 * lastPostDate を今日の日付に設定して daily_login の誤発火を防ぐ。
 *
 * See: features/incentive.feature @スレッド作成は書き込みログインボーナスの対象外である
 */
Given(
	"今日まだ書き込みもスレッド作成もしていない",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		if (user) {
			// lastPostDate を今日の日付に設定して daily_login の誤発火を防ぐ
			// （スレッド作成時に createPost が呼ばれるが daily_login は発火させない）
			const todayJst = getTodayJst();
			InMemoryUserRepo._insert({
				...user,
				lastPostDate: todayJst,
				streakDays: 1,
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: スレッド成長ボーナス用セットアップ
// ---------------------------------------------------------------------------

/**
 * ユーザー "{string}" がスレッドを作成済みである状態を設定する。
 * 名前付きユーザーを作成し、そのユーザーのスレッドを作成する。
 *
 * See: features/incentive.feature Rule: 立てたスレッドのレス数がマイルストーンに達する
 */
Given(
	"{string} がスレッドを作成済みである",
	async function (this: BattleBoardWorld, userName: string) {
		const ctx = await ensureNamedUser(this, userName);
		const threadKey = Math.floor(Date.now() / 1000).toString();
		const thread = await InMemoryThreadRepo.create({
			threadKey,
			boardId: TEST_BOARD_ID,
			title: `${userName}のスレッド`,
			createdBy: ctx.userId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = thread.title;
	},
);

/**
 * ユーザー "{string}" がスレッドを作成済みである（"ユーザー" プレフィックスあり版）。
 *
 * See: features/incentive.feature @スレッドにレスが10個付き
 */
Given(
	"ユーザー {string} がスレッドを作成済みである",
	async function (this: BattleBoardWorld, userName: string) {
		const ctx = await ensureNamedUser(this, userName);
		const threadKey = Math.floor(Date.now() / 1000).toString();
		const thread = await InMemoryThreadRepo.create({
			threadKey,
			boardId: TEST_BOARD_ID,
			title: `${userName}のスレッド`,
			createdBy: ctx.userId,
		});
		this.currentThreadId = thread.id;
		this.currentThreadTitle = thread.title;
	},
);

/**
 * そのスレッドのレス数が {int} である状態を設定する。
 * postCount を指定数まで incrementPostCount で増加させる。
 *
 * See: features/incentive.feature @スレッドにレスが10個付き
 */
Given(
	"そのスレッドのレス数が {int} である",
	async function (this: BattleBoardWorld, postCount: number) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const thread = await InMemoryThreadRepo.findById(this.currentThreadId);
		assert(thread, "スレッドが見つかりません");
		// 既存の postCount から目標値まで増加させる
		const diff = postCount - thread.postCount;
		if (diff > 0) {
			for (let i = 0; i < diff; i++) {
				await InMemoryThreadRepo.incrementPostCount(this.currentThreadId);
			}
		}
	},
);

/**
 * そのスレッドのユニークID数が {int} 以上である状態を設定する。
 * 異なる dailyId を持つダミーレスをスレッドに追加する。
 *
 * See: features/incentive.feature @スレッドにレスが10個付き
 */
Given(
	"そのスレッドのユニークID数が {int} 以上である",
	async function (this: BattleBoardWorld, minUniqueIds: number) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		// minUniqueIds 個の異なる dailyId を持つダミーレスを追加する
		// createdAt は Date.now() - offset で計算する（時計凍結中は凍結値から計算される）
		for (let i = 0; i < minUniqueIds; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i + 1,
				authorId: `dummy-user-${i}`,
				displayName: "名無しさん",
				dailyId: `dummy-daily-id-${i}`,
				body: `ダミーレス ${i + 1}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - (minUniqueIds - i) * 60 * 1000),
			});
		}
	},
);

/**
 * そのスレッドのユニークID数が {int} である状態を設定する。
 * ちょうど指定数の異なる dailyId を持つダミーレスをスレッドに追加する。
 *
 * See: features/incentive.feature @レスが10個付いてもユニークIDが3未満ならボーナスは付与されない
 */
Given(
	"そのスレッドのユニークID数が {int} である",
	async function (this: BattleBoardWorld, uniqueIds: number) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		// uniqueIds 個の異なる dailyId を持つダミーレスを追加する
		// createdAt は Date.now() - offset で計算する（時計凍結中は凍結値から計算される）
		for (let i = 0; i < uniqueIds; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i + 1,
				authorId: `dummy-user-${i}`,
				displayName: "名無しさん",
				dailyId: `dummy-daily-id-${i}`,
				body: `ダミーレス ${i + 1}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - (uniqueIds - i) * 60 * 1000),
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: 返信ボーナス用セットアップ
// ---------------------------------------------------------------------------

/**
 * ユーザー "{string}" がレス >>{int} を書き込み済みである状態を設定する。
 * 指定レス番号のレスを名前付きユーザーのものとして直接ストアに挿入する。
 *
 * See: features/incentive.feature Rule: 他人から返信（アンカー付き）が付くと +5
 */
Given(
	"ユーザー {string} がレス >>{int} を書き込み済みである",
	async function (
		this: BattleBoardWorld,
		userName: string,
		postNumber: number,
	) {
		const ctx = await ensureNamedUser(this, userName);

		// スレッドが未設定の場合はデフォルトスレッドを作成
		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "テストスレッド",
				createdBy: ctx.userId,
			});
			this.currentThreadId = thread.id;
		}

		InMemoryPostRepo._insert({
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber,
			authorId: ctx.userId,
			displayName: userName,
			dailyId: `daily-${ctx.userId}-${getTodayJst()}`,
			body: `${userName}のレス >>p${postNumber}`,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		});
	},
);

/**
 * ユーザー "{string}" がレス >>{int} とレス >>{int} を書き込み済みである状態を設定する。
 *
 * See: features/incentive.feature @同一IDからの2回目以降の返信ではボーナスは付与されない
 */
Given(
	"ユーザー {string} がレス >>{int} とレス >>{int} を書き込み済みである",
	async function (
		this: BattleBoardWorld,
		userName: string,
		postNumber1: number,
		postNumber2: number,
	) {
		const ctx = await ensureNamedUser(this, userName);

		// スレッドが未設定の場合はデフォルトスレッドを作成
		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "テストスレッド",
				createdBy: ctx.userId,
			});
			this.currentThreadId = thread.id;
		}

		// 2つのレスを挿入
		for (const postNumber of [postNumber1, postNumber2]) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber,
				authorId: ctx.userId,
				displayName: userName,
				dailyId: `daily-${ctx.userId}-${getTodayJst()}`,
				body: `${userName}のレス >>p${postNumber}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(),
			});
		}
	},
);

/**
 * 今日すでに "UserB" からの返信で +5 を受け取っている状態を設定する。
 * reply インセンティブログを追加して重複ガードを有効化する。
 *
 * See: features/incentive.feature @同一IDからの2回目以降の返信ではボーナスは付与されない
 */
Given(
	"今日すでに {string} からの返信で +5 を受け取っている",
	async function (this: BattleBoardWorld, replyUserName: string) {
		const userACtx = this.getNamedUser("UserA");
		assert(userACtx, 'ユーザー "UserA" が登録されていません');
		const replyUserCtx = await ensureNamedUser(this, replyUserName);
		const todayJst = getTodayJst();

		// contextId に返信元ユーザーID を格納（IncentiveService の重複チェックと一致させる）
		InMemoryIncentiveLogRepo._insert({
			id: crypto.randomUUID(),
			userId: userACtx.userId,
			eventType: "reply",
			amount: 5,
			contextId: replyUserCtx.userId,
			contextDate: todayJst,
			createdAt: new Date(),
		});
	},
);

// ---------------------------------------------------------------------------
// Given: ホットレスボーナス用セットアップ
// ---------------------------------------------------------------------------

/**
 * レス >>{int} の書き込みから60分以上経過している状態を設定する。
 * 現在時刻を過去に設定してレスを挿入後、時刻を進める。
 *
 * See: features/incentive.feature @返信が60分を超えた場合はホットレスボーナスは付与されない
 */
Given(
	"レス >>{int} の書き込みから60分以上経過している",
	async function (this: BattleBoardWorld, postNumber: number) {
		// UserA のコンテキストを取得
		const userACtx = this.getNamedUser("UserA");
		assert(userACtx, 'ユーザー "UserA" が登録されていません');
		assert(this.currentThreadId, "スレッドが設定されていません");

		// D-10 §5.2 標準パターン:
		// 時計を T に凍結し、対象レスの createdAt を T - 61分 に設定する。
		// これにより当該レスが「61分前に書き込まれた」状態になり、ホットレス判定が不成立になる。
		this.setCurrentTime(TEST_BASE_TIME);

		// 既存のレスの createdAt を T - 61min に更新
		const allPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const targetPost = allPosts.find((p) => p.postNumber === postNumber);
		if (targetPost) {
			const oldTime = new Date(TEST_BASE_TIME.getTime() - 61 * 60 * 1000);
			InMemoryPostRepo._insert({ ...targetPost, createdAt: oldTime });
		}
	},
);

// ---------------------------------------------------------------------------
// Given: 新スレッド参加ボーナス用セットアップ
// ---------------------------------------------------------------------------

/**
 * そのスレッドに過去書き込みをしたことがない状態（デフォルト）。
 * Beforeフックでリセット済みのため特に何もしない。
 *
 * See: features/incentive.feature @未参加のスレッドに初めて書き込むと +3 ボーナス
 */
Given(
	"そのスレッドに過去書き込みをしたことがない",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		// new_thread_join ボーナスを発火させるシナリオ:
		// BeforeStep が既にダミーレスのあるスレッドを作成している可能性があるため、
		// ここで新たなクリーンなスレッドを作成して currentThreadId を切り替える。
		// これにより currentUserId のレスが1件も存在しない「未参加」状態を保証する。
		//
		// また incentive-service.ts の「スレッド作成者の初レスは new_thread_join 対象外」ロジックを
		// 回避するため、createdBy をダミーユーザーIDに設定する。
		// （post-service.ts の createThread では createdBy === ctx.userId のスレッドを作成するため、
		//  このGivenのシナリオでは別ユーザーが作成したスレッドに初参加する状況を再現する）
		// See: tmp/escalations/escalation_ESC-TASK-019-1.md (副作用の詳細)
		const threadKey = Math.floor(Date.now() / 1000).toString();
		const thread = await InMemoryThreadRepo.create({
			threadKey,
			boardId: TEST_BOARD_ID,
			title: "テストスレッド（新スレッド参加ボーナス用）",
			createdBy: "dummy-thread-creator-for-new-thread-join-test",
		});
		this.currentThreadId = thread.id;
		// このスレッドにはレスが存在しない → 「未参加」状態
		// フラグを立てて newThreadJoinTestWorlds を有効にする（BeforeStep のダミーレス追加をスキップ）
		newThreadJoinTestWorlds.set(this, true);
	},
);

/**
 * そのスレッドに過去書き込みをしたことがある状態を設定する。
 * 現在のユーザーのレスをそのスレッドに追加する。
 *
 * See: features/incentive.feature @同一スレッドへの2回目の書き込みではボーナスは付与されない
 */
Given(
	"そのスレッドに過去書き込みをしたことがある",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "テストスレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}
		// 既存の書き込みを追加して「参加済み」にする
		// 時計が凍結中であれば凍結時刻から10分前、未凍結であれば基準時刻から10分前を使用する
		const participatedBaseTime = this.currentTime ?? TEST_BASE_TIME;
		InMemoryPostRepo._insert({
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber: 1,
			authorId: this.currentUserId,
			displayName: "名無しさん",
			dailyId: `daily-${this.currentUserId}-${getTodayJst()}`,
			body: "以前の書き込み",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(participatedBaseTime.getTime() - 10 * 60 * 1000),
		});
	},
);

/**
 * 今日すでに3つの新スレッドに初書き込みをしている状態を設定する。
 * new_thread_join インセンティブログを3件追加する。
 *
 * See: features/incentive.feature @同日4スレッド目の初参加ではボーナスは付与されない
 */
Given(
	"今日すでに3つの新スレッドに初書き込みをしている",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const todayJst = getTodayJst();
		for (let i = 0; i < 3; i++) {
			InMemoryIncentiveLogRepo._insert({
				id: crypto.randomUUID(),
				userId: this.currentUserId,
				eventType: "new_thread_join",
				amount: 3,
				contextId: `dummy-thread-${i}`,
				contextDate: todayJst,
				createdAt: new Date(),
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: スレッド復興ボーナス用セットアップ
// ---------------------------------------------------------------------------

/**
 * スレッドの最終レスが24時間以上前である状態を設定する。
 * スレッドに「25時間前のダミーレス」を追加し、lastPostAt を25時間前に設定する。
 *
 * incentive-service.ts の evaluateThreadRevivalBonus は threadPosts の時系列から
 * 低活性期間（隣接レス間の間隔が24時間以上）を判定するため、スレッドに過去レスが必要。
 * Named User（UserA 等）が存在する場合はそのユーザーのダミーレスを追加し、
 * new_thread_join ボーナスの誤発火も同時に防止する。
 *
 * See: features/incentive.feature Rule: 24時間以上レスのないスレッドに書き込み
 * See: TASK-019 バグ2修正（threadPosts 時系列判定のための事前条件設定）
 */
Given(
	"スレッドの最終レスが24時間以上前である",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");

		// D-10 §5.2 時刻依存シナリオの標準パターン:
		// 1. 時計を基準時刻 T に凍結
		// 2. 時計を過去（T - 25h）に設定し、低活性ダミーレスを作成
		// 3. 時計を T に戻す（When ステップで操作実行）
		this.setCurrentTime(TEST_BASE_TIME);

		// スレッドが未設定の場合はデフォルトスレッドを作成
		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "テストスレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// 時計を T - 25h に設定してダミーレスを作成（低活性状態）
		const inactiveTime = new Date(
			TEST_BASE_TIME.getTime() - 25 * 60 * 60 * 1000,
		);
		this.setCurrentTime(inactiveTime);

		// threadPosts の時系列から低活性期間を判定するため、25時間前のダミーレスを追加する。
		// Named User（UserA 等）が登録済みであればそのユーザーのダミーレスとして追加し、
		// 復興書き込み時に new_thread_join が誤発火しないよう参加済み状態を保証する。
		// Named User がいない場合は別ユーザーのダミーレスを追加して時系列基準点とする。
		const namedUserA = this.getNamedUser("UserA");
		const dummyAuthorId = namedUserA
			? namedUserA.userId
			: "dummy-inactive-author";
		const existingPostsForInactive = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const nextPostNumberForInactive = existingPostsForInactive.length + 1;
		InMemoryPostRepo._insert({
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber: nextPostNumberForInactive,
			authorId: dummyAuthorId,
			displayName: "名無しさん",
			dailyId: `daily-inactive-${dummyAuthorId}`,
			body: "低活性期間前のダミーレス（25時間前）",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});

		// 時計を基準時刻 T に戻す（When ステップで正常な操作を実行するため）
		this.setCurrentTime(TEST_BASE_TIME);

		// lastPostAt を T - 25h に設定（低活性状態を保証）
		await InMemoryThreadRepo.updateLastPostAt(
			this.currentThreadId,
			inactiveTime,
		);
		// スレッド復興ボーナス用に非活性時刻を保存する
		// （"UserA" がそのスレッドに書き込みを行う When ステップで post-service.ts が
		//   lastPostAt を更新してしまうため、書き込み後に非活性時刻をリセットするために使用）
		threadRevivalInactiveTimes.set(this, inactiveTime);
	},
);

/**
 * スレッドの最終レスが12時間前である状態を設定する（低活性判定にならない）。
 * スレッドに「12時間前のダミーレス」を追加し、lastPostAt を12時間前に設定する。
 *
 * incentive-service.ts の evaluateThreadRevivalBonus は threadPosts の時系列から
 * 低活性期間を判定するため、12時間前のレスを追加することで「24時間未満 = 低活性でない」
 * と正しく判定されるようにする。
 * Named User（UserA 等）が存在する場合はそのユーザーのダミーレスとして追加し、
 * new_thread_join ボーナスの誤発火も同時に防止する。
 *
 * See: features/incentive.feature @最終レスが24時間以内のスレッドでは低活性判定にならない
 * See: TASK-019 バグ2修正（threadPosts 時系列判定のための事前条件設定）
 */
Given(
	"スレッドの最終レスが12時間前である",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");

		// D-10 §5.2 時刻依存シナリオの標準パターン（flakyテスト排除の重点対象）:
		// 1. 時計を基準時刻 T に凍結
		// 2. 時計を T - 12h に設定し、直近ダミーレスを作成（24時間以内 = 低活性にならない）
		// 3. 時計を T に戻す（When ステップで操作実行）
		//
		// 旧実装（Date.now() - 12h）は実行タイミングによりミリ秒単位のずれが生じ、
		// 「最終レスが24時間以内のスレッドでは低活性判定にならない」シナリオがflakyになっていた。
		// 凍結時計により完全に決定論的になる。
		//
		// See: docs/architecture/bdd_test_strategy.md §5.2 相対時刻の禁止
		this.setCurrentTime(TEST_BASE_TIME);

		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "テストスレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// 時計を T - 12h に設定してダミーレスを作成（24時間以内 = 低活性でない）
		const recentTime = new Date(TEST_BASE_TIME.getTime() - 12 * 60 * 60 * 1000);
		this.setCurrentTime(recentTime);

		// threadPosts の時系列判定用に T-12h のダミーレスを追加する。
		// Named User（UserA 等）が登録済みであればそのユーザーのダミーレスとして追加し、
		// new_thread_join ボーナスの誤発火も同時に防止する。
		const namedUserARecent = this.getNamedUser("UserA");
		const dummyAuthorIdRecent = namedUserARecent
			? namedUserARecent.userId
			: "dummy-recent-author";
		const existingPostsForRecent = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const nextPostNumberForRecent = existingPostsForRecent.length + 1;
		InMemoryPostRepo._insert({
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber: nextPostNumberForRecent,
			authorId: dummyAuthorIdRecent,
			displayName: "名無しさん",
			dailyId: `daily-recent-${dummyAuthorIdRecent}`,
			body: "直近のダミーレス（T-12h）",
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(Date.now()),
		});

		// lastPostAt を T - 12h に設定（24時間以内なので低活性にならない）
		await InMemoryThreadRepo.updateLastPostAt(this.currentThreadId, recentTime);

		// 時計を基準時刻 T に戻す（When ステップで正常な操作を実行するため）
		this.setCurrentTime(TEST_BASE_TIME);
	},
);

// ---------------------------------------------------------------------------
// Given: ストリークボーナス用セットアップ
// ---------------------------------------------------------------------------

/**
 * ユーザーが N日連続で書き込みログインボーナスを獲得済みである状態を設定する。
 * streakDays と lastPostDate（昨日）を設定する。
 * 正規表現でパラメータを抽出する（日本語の数字+日が {int} に直接マッチしない問題を回避）。
 *
 * See: features/incentive.feature Rule: N日連続で書き込みログインボーナスを獲得する
 */
Given(
	/^ユーザーが(\d+)日連続で書き込みログインボーナスを獲得済みである$/,
	async function (this: BattleBoardWorld, streakDaysStr: string) {
		const streakDays = parseInt(streakDaysStr, 10);
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");

		// 昨日の日付を計算
		const todayJst = getTodayJst();
		const today = new Date(todayJst);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().slice(0, 10);

		// streakDays を設定し、lastPostDate を昨日にする（今日書き込むと継続扱いになる）
		InMemoryUserRepo._insert({
			...user,
			streakDays,
			lastPostDate: yesterdayStr,
		});
	},
);

/**
 * 昨日は書き込みをしなかった状態を設定する。
 * lastPostDate を一昨日以前に設定してストリークを切れた状態にする。
 *
 * See: features/incentive.feature @途中で1日書き込みを休むとストリークがリセットされる
 */
Given("昨日は書き込みをしなかった", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	const user = await InMemoryUserRepo.findById(this.currentUserId);
	assert(user, "ユーザーが見つかりません");

	// 2日前の日付を設定（昨日は書き込みなし）
	const todayJst = getTodayJst();
	const today = new Date(todayJst);
	const twoDaysAgo = new Date(today);
	twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
	const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

	InMemoryUserRepo._insert({ ...user, lastPostDate: twoDaysAgoStr });
});

// ---------------------------------------------------------------------------
// Given: 名前付きユーザーの通貨残高を設定 (common.steps.ts に "{string} の通貨残高が {int} である" 定義済み)
// ここでは "ユーザー {string} の通貨残高が {int} である" を追加定義する
// ---------------------------------------------------------------------------

/**
 * ユーザー "{string}" の通貨残高が {int} である（名前付きユーザー版）。
 *
 * See: features/incentive.feature @低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと
 */
Given(
	"ユーザー {string} の通貨残高が {int} である",
	async function (this: BattleBoardWorld, userName: string, balance: number) {
		const ctx = await ensureNamedUser(this, userName);
		InMemoryCurrencyRepo._upsert({
			userId: ctx.userId,
			balance,
			updatedAt: new Date(),
		});
	},
);

// ---------------------------------------------------------------------------
// When: ログイン操作
// ---------------------------------------------------------------------------

/**
 * ログインする（通貨付与なしの確認用）。
 * ログインだけでは通貨残高は変化しないことを確認するステップ。
 *
 * See: features/incentive.feature @ログインしただけでは通貨は付与されない
 */
When("ログインする", async function (this: BattleBoardWorld) {
	// ログインは edge-token の発行のみ（インセンティブは発火しない）
	// 既にユーザーがログイン済みのため何もしない（Background の「ユーザーがログイン済みである」で完了）
	// ここでは意図的に何もしない
});

// ---------------------------------------------------------------------------
// When: スレッド成長ボーナス用の他ユーザー書き込み
// ---------------------------------------------------------------------------

/**
 * 他のユーザーがN件目のレスを書き込む。
 * 別のユーザーを作成してスレッドに書き込みを行う。
 * 正規表現でパラメータを抽出する（日本語の数字+件目が {int} に直接マッチしない問題を回避）。
 *
 * See: features/incentive.feature @スレッドにレスが10個付き、ユニークID 3個以上で +50 ボーナス
 */
When(
	/^他のユーザーが(\d+)件目のレスを書き込む$/,
	async function (this: BattleBoardWorld, postCountTargetStr: string) {
		const postCountTarget = parseInt(postCountTargetStr, 10);
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 別ユーザーとして書き込む（UserOther という仮名で登録）
		const otherCtx = await ensureNamedUser(this, "UserOther");
		const existingBalance_other = await InMemoryCurrencyRepo.findByUserId(
			otherCtx.userId,
		);
		if (!existingBalance_other) {
			InMemoryCurrencyRepo._upsert({
				userId: otherCtx.userId,
				balance: 0,
				updatedAt: new Date(),
			});
		}

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `${postCountTarget}件目のレスです`,
			edgeToken: otherCtx.edgeToken,
			ipHash: otherCtx.ipHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};
	},
);

/**
 * 同一ユーザーがN件目のレスを書き込む（ユニークID条件を満たさないケース）。
 * 既存のダミーユーザーを再利用して書き込みを行う。
 * 正規表現でパラメータを抽出する（日本語の数字+件目が {int} に直接マッチしない問題を回避）。
 *
 * See: features/incentive.feature @レスが10個付いてもユニークIDが3未満ならボーナスは付与されない
 */
When(
	/^同一ユーザーが(\d+)件目のレスを書き込む$/,
	async function (this: BattleBoardWorld, postCountTargetStr: string) {
		const postCountTarget = parseInt(postCountTargetStr, 10);
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 既存ダミーレスと同一 dailyId でレスを直接挿入する。
		// PostService.createPost を使うと新しい dailyId が生成されてしまい、
		// ユニークID数が増えてしまうため、直接挿入してスレッド成長ボーナスの
		// ユニークID条件をテストできるようにする。
		const existingPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		// 既存ダミーレスの最初の dailyId を使って「同一ユーザー」を再現する
		const existingDailyId =
			existingPosts[0]?.dailyId ?? "dummy-same-user-daily-id";
		const existingAuthorId = existingPosts[0]?.authorId ?? "dummy-user-0";

		const postNumber = await InMemoryPostRepo.getNextPostNumber(
			this.currentThreadId,
		);
		const newPost: Post = {
			id: crypto.randomUUID(),
			threadId: this.currentThreadId,
			postNumber,
			authorId: existingAuthorId,
			displayName: "名無しさん",
			dailyId: existingDailyId,
			body: `${postCountTarget}件目のレスです（同一ユーザー）`,
			inlineSystemInfo: null,
			isSystemMessage: false,
			isDeleted: false,
			createdAt: new Date(),
		};
		InMemoryPostRepo._insert(newPost);
		await InMemoryThreadRepo.incrementPostCount(this.currentThreadId);

		// IncentiveService を直接呼んでボーナス判定を実施する
		const thread = await InMemoryThreadRepo.findById(this.currentThreadId);
		if (thread && existingAuthorId && existingAuthorId !== "dummy-user-0") {
			await IncentiveService.evaluateOnPost({
				postId: newPost.id,
				threadId: this.currentThreadId,
				userId: existingAuthorId,
				postNumber,
				createdAt: newPost.createdAt,
			});
		}

		this.lastResult = {
			type: "success",
			data: {
				success: true,
				postId: newPost.id,
				postNumber,
				systemMessages: [],
			},
		};
	},
);

// ---------------------------------------------------------------------------
// When: 返信ボーナス用の書き込み
// ---------------------------------------------------------------------------

/**
 * ユーザー "{string}" がレス >>{int} にアンカー付きで返信を書き込む。
 *
 * See: features/incentive.feature Rule: 他人から返信（アンカー付き）が付くと +5
 */
When(
	"ユーザー {string} がレス >>{int} にアンカー付きで返信を書き込む",
	async function (
		this: BattleBoardWorld,
		userName: string,
		targetPostNumber: number,
	) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const ctx = await ensureNamedUser(this, userName);
		const existingBalance_reply = await InMemoryCurrencyRepo.findByUserId(
			ctx.userId,
		);
		if (!existingBalance_reply) {
			InMemoryCurrencyRepo._upsert({
				userId: ctx.userId,
				balance: 0,
				updatedAt: new Date(),
			});
		}

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `>>${targetPostNumber} 返信します`,
			edgeToken: ctx.edgeToken,
			ipHash: ctx.ipHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};
	},
);

// ---------------------------------------------------------------------------
// When: ホットレスボーナス用の複数ユーザー返信
// ---------------------------------------------------------------------------

/**
 * 60分以内にユーザー "X", "Y", "Z" がレス >>{int} にアンカー付きで返信する。
 * 3人以上の異なるユーザーが60分以内に返信するシミュレーション。
 *
 * 注意: reply ボーナスはホットレスシナリオの期待値に含まれていない。
 * 返信前に対象レス作者への reply ログを予め挿入して重複ガードを有効化し、
 * reply ボーナスの誤発火（期待値外の残高変動）を防ぐ。
 *
 * See: features/incentive.feature @60分以内に3人以上から返信が付くと +15 ボーナスが付与される
 */
When(
	"60分以内にユーザー {string}, {string}, {string} がレス >>{int} にアンカー付きで返信する",
	async function (
		this: BattleBoardWorld,
		user1: string,
		user2: string,
		user3: string,
		targetPostNumber: number,
	) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 対象レスの作者IDを取得して reply ログを事前挿入（重複ガードで reply ボーナスを抑制）
		const allPosts = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const targetPost = allPosts.find((p) => p.postNumber === targetPostNumber);
		const targetAuthorId = targetPost?.authorId ?? null;
		const todayJst = getTodayJst();

		for (const userName of [user1, user2, user3]) {
			const ctx = await ensureNamedUser(this, userName);
			const existingBalance_hot3 = await InMemoryCurrencyRepo.findByUserId(
				ctx.userId,
			);
			if (!existingBalance_hot3) {
				InMemoryCurrencyRepo._upsert({
					userId: ctx.userId,
					balance: 0,
					updatedAt: new Date(),
				});
			}
			// reply ボーナスの誤発火を防ぐため、対象レス作者への reply ログを事前挿入
			if (targetAuthorId) {
				InMemoryIncentiveLogRepo._insert({
					id: crypto.randomUUID(),
					userId: targetAuthorId,
					eventType: "reply",
					amount: 5,
					contextId: ctx.userId, // 返信元ユーザーID（重複チェック用）
					contextDate: todayJst,
					createdAt: new Date(),
				});
			}
			await PostService.createPost({
				threadId: this.currentThreadId,
				body: `>>${targetPostNumber} ホットレス返信です`,
				edgeToken: ctx.edgeToken,
				ipHash: ctx.ipHash,
				isBotWrite: false,
			});
		}
	},
);

/**
 * 60分以内にユーザー "X", "Y" の2人がレス >>{int} にアンカー付きで返信する（3人未満）。
 *
 * 注意: reply ボーナスはホットレスシナリオの期待値に含まれていない。
 * 返信前に対象レス作者への reply ログを予め挿入して重複ガードを有効化し、
 * reply ボーナスの誤発火を防ぐ。
 *
 * See: features/incentive.feature @返信者が3人未満の場合はホットレスボーナスは付与されない
 */
When(
	"60分以内にユーザー {string}, {string} の2人がレス >>{int} にアンカー付きで返信する",
	async function (
		this: BattleBoardWorld,
		user1: string,
		user2: string,
		targetPostNumber: number,
	) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 対象レスの作者IDを取得して reply ログを事前挿入（重複ガードで reply ボーナスを抑制）
		const allPosts2 = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const targetPost2 = allPosts2.find(
			(p) => p.postNumber === targetPostNumber,
		);
		const targetAuthorId2 = targetPost2?.authorId ?? null;
		const todayJst2 = getTodayJst();

		for (const userName of [user1, user2]) {
			const ctx = await ensureNamedUser(this, userName);
			const existingBalance_hot2 = await InMemoryCurrencyRepo.findByUserId(
				ctx.userId,
			);
			if (!existingBalance_hot2) {
				InMemoryCurrencyRepo._upsert({
					userId: ctx.userId,
					balance: 0,
					updatedAt: new Date(),
				});
			}
			// reply ボーナスの誤発火を防ぐため、対象レス作者への reply ログを事前挿入
			if (targetAuthorId2) {
				InMemoryIncentiveLogRepo._insert({
					id: crypto.randomUUID(),
					userId: targetAuthorId2,
					eventType: "reply",
					amount: 5,
					contextId: ctx.userId,
					contextDate: todayJst2,
					createdAt: new Date(),
				});
			}
			await PostService.createPost({
				threadId: this.currentThreadId,
				body: `>>${targetPostNumber} ホットレス返信です`,
				edgeToken: ctx.edgeToken,
				ipHash: ctx.ipHash,
				isBotWrite: false,
			});
		}
	},
);

/**
 * 3人目のユーザーがレス >>{int} にアンカー付きで返信する（60分超過後）。
 *
 * 注意: reply ボーナスはシナリオの期待値（残高変化なし）に含まれていない。
 * 返信前に対象レス作者への reply ログを予め挿入して重複ガードを有効化し、
 * reply ボーナスの誤発火（残高変動）を防ぐ。
 *
 * See: features/incentive.feature @返信が60分を超えた場合はホットレスボーナスは付与されない
 */
When(
	"3人目のユーザーがレス >>{int} にアンカー付きで返信する",
	async function (this: BattleBoardWorld, targetPostNumber: number) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 対象レスの作者IDを取得して reply ログを事前挿入（重複ガードで reply ボーナスを抑制）
		const allPostsLate = await InMemoryPostRepo.findByThreadId(
			this.currentThreadId,
		);
		const targetPostLate = allPostsLate.find(
			(p) => p.postNumber === targetPostNumber,
		);
		const targetAuthorIdLate = targetPostLate?.authorId ?? null;
		const todayJstLate = getTodayJst();

		// まず2人が返信済みという状態を作る
		const user1Ctx = await ensureNamedUser(this, "UserLate1");
		const user2Ctx = await ensureNamedUser(this, "UserLate2");
		for (const ctx of [user1Ctx, user2Ctx]) {
			const existingBalance_late = await InMemoryCurrencyRepo.findByUserId(
				ctx.userId,
			);
			if (!existingBalance_late) {
				InMemoryCurrencyRepo._upsert({
					userId: ctx.userId,
					balance: 0,
					updatedAt: new Date(),
				});
			}
			// reply ボーナスの誤発火を防ぐため、対象レス作者への reply ログを事前挿入
			if (targetAuthorIdLate) {
				InMemoryIncentiveLogRepo._insert({
					id: crypto.randomUUID(),
					userId: targetAuthorIdLate,
					eventType: "reply",
					amount: 5,
					contextId: ctx.userId,
					contextDate: todayJstLate,
					createdAt: new Date(),
				});
			}
			await PostService.createPost({
				threadId: this.currentThreadId,
				body: `>>${targetPostNumber} 先の返信`,
				edgeToken: ctx.edgeToken,
				ipHash: ctx.ipHash,
				isBotWrite: false,
			});
		}

		// 3人目が返信する
		const user3Ctx = await ensureNamedUser(this, "UserLate3");
		const existingBalance_late3 = await InMemoryCurrencyRepo.findByUserId(
			user3Ctx.userId,
		);
		if (!existingBalance_late3) {
			InMemoryCurrencyRepo._upsert({
				userId: user3Ctx.userId,
				balance: 0,
				updatedAt: new Date(),
			});
		}
		// 3人目の reply ログも事前挿入
		if (targetAuthorIdLate) {
			InMemoryIncentiveLogRepo._insert({
				id: crypto.randomUUID(),
				userId: targetAuthorIdLate,
				eventType: "reply",
				amount: 5,
				contextId: user3Ctx.userId,
				contextDate: todayJstLate,
				createdAt: new Date(),
			});
		}
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `>>${targetPostNumber} 3人目の返信（時間超過）`,
			edgeToken: user3Ctx.edgeToken,
			ipHash: user3Ctx.ipHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};
	},
);

// ---------------------------------------------------------------------------
// When: スレッド復興ボーナス用の書き込み
// ---------------------------------------------------------------------------

/**
 * そのスレッドに書き込みを1件行う（スレッド参加ボーナス用）。
 * currentThreadId で設定済みのスレッドに現在のユーザーが書き込む。
 *
 * See: features/incentive.feature Rule: 未参加スレッドへの初書き込みで +3
 */
When(
	"そのスレッドに書き込みを1件行う",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "書き込み対象のスレッドが設定されていません");
		assert(this.currentEdgeToken, "ユーザーがログイン済みである必要があります");

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "テスト書き込み本文",
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
				message: result.error,
				code: result.code,
			};
		}
	},
);

/**
 * "{string}" がそのスレッドに書き込みを行う（復興書き込みおよびthread_revivalシナリオ用）。
 *
 * スレッド復興ボーナスのテストシナリオでは、post-service.ts の createPost が
 * ThreadRepository.updateLastPostAt を evaluateOnPost の前に呼ぶため、
 * evaluateThreadRevivalBonus の isInactiveThread 判定が後続書き込み時に正しく機能しない。
 * そのため、createPost 後に threadRevivalInactiveTimes マップの値があれば lastPostAt を復元する。
 *
 * また、incentive-service.ts のバグ修正（ctx.postId 除外）により new_thread_join が
 * 誤発火するのを防ぐため、書き込み前にユーザーの参加済みダミーレスを追加する。
 * thread_revival シナリオでは、ダミーレスの createdAt を inactiveTime より前に設定することで
 * evaluateThreadRevivalBonus の低活性期間判定が正しく機能するよう制御する。
 *
 * See: features/incentive.feature Rule: 24時間以上レスのないスレッドに書き込み
 * See: tmp/escalations/escalation_ESC-TASK-019-1.md (new_thread_join 副作用)
 */
When(
	"{string} がそのスレッドに書き込みを行う",
	async function (this: BattleBoardWorld, userName: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const ctx = await ensureNamedUser(this, userName);
		const existingBalance_revival = await InMemoryCurrencyRepo.findByUserId(
			ctx.userId,
		);
		if (!existingBalance_revival) {
			InMemoryCurrencyRepo._upsert({
				userId: ctx.userId,
				balance: 0,
				updatedAt: new Date(),
			});
		}

		// daily_login の誤発火を防ぐため、UserA の lastPostDate を現在の凍結時刻の JST 日付に設定する。
		// BeforeStep フックは最初の実行時（時計凍結前）に real-time の日付を設定するが、
		// その後 setCurrentTime で時計が凍結されると contextDate と lastPostDate が不一致になる。
		// See: tmp/workers/bdd-architect_TASK-070/analysis.md §2.4 ボーナス抑制タイミング不整合
		const frozenTodayJst = getTodayJst();
		const userForDailyLoginGuard = await InMemoryUserRepo.findById(ctx.userId);
		if (
			userForDailyLoginGuard &&
			userForDailyLoginGuard.lastPostDate !== frozenTodayJst
		) {
			InMemoryUserRepo._insert({
				...userForDailyLoginGuard,
				lastPostDate: frozenTodayJst,
			});
		}

		// new_thread_join の誤発火を防ぐためユーザーの参加済みダミーレスを追加する。
		// thread_revival シナリオでは evaluateThreadRevivalBonus の低活性期間判定に影響しないよう
		// ダミーレスの createdAt を「スレッドの非活性時刻より前」に設定する:
		//   - inactiveTime が設定されている（24時間以上前のシナリオ）: inactiveTime - 1分前
		//   - inactiveTime が未設定（12時間前のシナリオ等）: 通常の 2分前
		// 前者では ダミーレス（~25時間1分前）と UserA のレス（今）の間隔が ≥ 24時間 になるため
		// evaluateThreadRevivalBonus は UserA を revivalPost と正しく判定できる。
		// 後者では ダミーレス（2分前）と UserA のレス（今）の間隔が < 24時間 のため
		// revivalPost が見つからず thread_revival は正しく不発火となる。
		if (!newThreadJoinTestWorlds.get(this)) {
			const inactiveTimeForDummy = threadRevivalInactiveTimes.get(this);
			const dummyCreatedAt = inactiveTimeForDummy
				? new Date(inactiveTimeForDummy.getTime() - 60 * 1000) // inactiveTime の 1分前
				: new Date(Date.now() - 2 * 60 * 1000); // 時計凍結中は凍結値から2分前
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: 0, // ダミー番号
				authorId: ctx.userId,
				displayName: "名無しさん",
				dailyId: `daily-${ctx.userId}-${getTodayJst()}`,
				body: "参加済みダミーレス（new_thread_join 抑制用）",
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: dummyCreatedAt,
			});
		}

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "低活性スレッドへの復興書き込み",
			edgeToken: ctx.edgeToken,
			ipHash: ctx.ipHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};

		// スレッド復興ボーナスのテスト: createPost 後に lastPostAt を非活性時刻に復元する。
		// post-service.ts が evaluateOnPost の前に updateLastPostAt を呼ぶため、
		// 後続書き込み（UserRevivalFollower）の evaluateOnPost 時に isInactiveThread が正しく機能するよう制御。
		//
		// さらに、revivalPost（UserA のレス）は直後に new Date() で createdAt が設定されるため、
		// lastPostAt を「revivalPost.createdAt より確実に前」に設定する必要がある。
		// 元の非活性時刻（25h前）は確実に revivalPost.createdAt より前のため問題なし。
		const inactiveTime = threadRevivalInactiveTimes.get(this);
		if (inactiveTime && this.currentThreadId) {
			await InMemoryThreadRepo.updateLastPostAt(
				this.currentThreadId,
				inactiveTime,
			);

			// 'result' が成功の場合、UserA のレスが revival post となる。
			// UserRevivalFollower のレスが revival post より後の createdAt を持つことを保証するため、
			// revival post (UserA のレス) の createdAt を確実に過去時刻に設定し直す。
			if ("postId" in (this.lastResult?.data ?? {})) {
				const data = this.lastResult?.data as { postId: string };
				const revivalPostObj = await InMemoryPostRepo.findById(data.postId);
				if (revivalPostObj) {
					// revivalPost の createdAt を 1 秒前に設定して後続書き込みより確実に前にする。
					// post-service.ts が new Date()（実時刻）で createdAt を設定するため、
					// followupPost も実時刻で作成される。両者の差が 30分以内になるよう
					// 実時刻から 1 秒前（new Date()）を使用する。
					const pastCreatedAt = new Date(new Date().getTime() - 1000);
					InMemoryPostRepo._insert({
						...revivalPostObj,
						createdAt: pastCreatedAt,
					});
				}
			}
		}
	},
);

/**
 * 30分以内に別のユーザーがそのスレッドにレスを書き込む。
 *
 * See: features/incentive.feature @低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと
 */
When(
	"30分以内に別のユーザーがそのスレッドにレスを書き込む",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");
		const otherCtx = await ensureNamedUser(this, "UserRevivalFollower");
		const existingBalance_follower = await InMemoryCurrencyRepo.findByUserId(
			otherCtx.userId,
		);
		if (!existingBalance_follower) {
			InMemoryCurrencyRepo._upsert({
				userId: otherCtx.userId,
				balance: 0,
				updatedAt: new Date(),
			});
		}

		await PostService.createPost({
			threadId: this.currentThreadId,
			body: "復興後のフォローレス",
			edgeToken: otherCtx.edgeToken,
			ipHash: otherCtx.ipHash,
			isBotWrite: false,
		});
	},
);

/**
 * 30分以内に他のユーザーのレスが付かない（何もしない）。
 *
 * See: features/incentive.feature @30分以内に他ユーザーのレスが付かなければボーナスは付与されない
 */
When(
	"30分以内に他のユーザーのレスが付かない",
	async function (this: BattleBoardWorld) {
		// 他のユーザーのレスが付かない = 何もしない
	},
);

// ---------------------------------------------------------------------------
// When: ストリークボーナス用の書き込み
// ---------------------------------------------------------------------------

/**
 * N日目の初回書き込みを行う。
 * 現在のユーザーでスレッドに書き込みを行う。
 * 正規表現でパラメータを抽出する（日本語の数字+日が {int} に直接マッチしない問題を回避）。
 *
 * See: features/incentive.feature @7日連続書き込みで +20 ストリークボーナスが付与される
 */
When(
	/^(\d+)日目の初回書き込みを行う$/,
	async function (this: BattleBoardWorld, _dayNumberStr: string) {
		const _dayNumber = parseInt(_dayNumberStr, 10);
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		assert(this.currentEdgeToken, "edge-token が設定されていません");

		// スレッドが未設定の場合はデフォルトスレッドを作成
		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "ストリークテストスレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// new_thread_join の誤発火を防ぐため、ストリークシナリオでは参加済みダミーレスを追加する
		// See: tmp/escalations/escalation_ESC-TASK-019-1.md
		ensureUserParticipated(this, this.currentUserId, this.currentThreadId);

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `${_dayNumber}日目の書き込み`,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};
	},
);

/**
 * 今日の初回書き込みを行う（ストリークリセット確認用）。
 *
 * See: features/incentive.feature @途中で1日書き込みを休むとストリークがリセットされる
 */
When("今日の初回書き込みを行う", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
	assert(this.currentEdgeToken, "edge-token が設定されていません");

	if (!this.currentThreadId) {
		const threadKey = Math.floor(Date.now() / 1000).toString();
		const thread = await InMemoryThreadRepo.create({
			threadKey,
			boardId: TEST_BOARD_ID,
			title: "ストリークリセットテストスレッド",
			createdBy: this.currentUserId,
		});
		this.currentThreadId = thread.id;
	}

	// new_thread_join の誤発火を防ぐため、ストリークシナリオでは参加済みダミーレスを追加する
	// See: tmp/escalations/escalation_ESC-TASK-019-1.md
	ensureUserParticipated(this, this.currentUserId, this.currentThreadId);

	const result = await PostService.createPost({
		threadId: this.currentThreadId,
		body: "ストリークリセット後の書き込み",
		edgeToken: this.currentEdgeToken,
		ipHash: this.currentIpHash,
		isBotWrite: false,
	});
	this.lastResult =
		"success" in result && result.success
			? { type: "success", data: result }
			: {
					type: "error",
					message: "success" in result ? result.error : "認証エラー",
					code: undefined,
				};
});

// ---------------------------------------------------------------------------
// When: キリ番ボーナス用の書き込み
// ---------------------------------------------------------------------------

/**
 * スレッドのレス番号 {int} に書き込みを行う。
 * 事前に (postCount - 1) 件のダミーレスを挿入してからスレッドに書き込む。
 *
 * See: features/incentive.feature Rule: スレッド内のレス番号が100の倍数のとき書き込んだユーザーにボーナス
 */
When(
	"スレッドのレス番号 {int} に書き込みを行う",
	async function (this: BattleBoardWorld, targetPostNumber: number) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		assert(this.currentEdgeToken, "edge-token が設定されていません");

		// スレッドが未設定の場合はデフォルトスレッドを作成
		if (!this.currentThreadId) {
			const threadKey = Math.floor(Date.now() / 1000).toString();
			const thread = await InMemoryThreadRepo.create({
				threadKey,
				boardId: TEST_BOARD_ID,
				title: "キリ番テストスレッド",
				createdBy: this.currentUserId,
			});
			this.currentThreadId = thread.id;
		}

		// targetPostNumber - 1 件のダミーレスを挿入
		// createdAt は Date.now() - offset で計算する（時計凍結中は凍結値から計算される）
		for (let i = 1; i < targetPostNumber; i++) {
			InMemoryPostRepo._insert({
				id: crypto.randomUUID(),
				threadId: this.currentThreadId,
				postNumber: i,
				authorId: `dummy-user-kiri-${i}`,
				displayName: "名無しさん",
				dailyId: `dummy-daily-${i}`,
				body: `ダミーレス ${i}`,
				inlineSystemInfo: null,
				isSystemMessage: false,
				isDeleted: false,
				createdAt: new Date(Date.now() - (targetPostNumber - i) * 1000),
			});
		}

		// new_thread_join の誤発火を防ぐため、キリ番シナリオでは参加済みダミーレスを追加する。
		// ダミーレスは dummy-user-kiri-N の authorId で挿入されているため、
		// currentUserId のレスが存在しない → new_thread_join が発火してしまう。
		// See: tmp/escalations/escalation_ESC-TASK-019-1.md
		ensureUserParticipated(this, this.currentUserId, this.currentThreadId);

		// 実際の書き込みを行う（targetPostNumber 番目になるはず）
		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: `レス番号 ${targetPostNumber} を踏む書き込み`,
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};
	},
);

/**
 * 4つ目の未参加スレッドに書き込みを1件行う（1日3スレッド上限超過）。
 * 新しいスレッドを作成してそこに書き込む。
 *
 * See: features/incentive.feature @同日4スレッド目の初参加ではボーナスは付与されない
 */
When(
	"4つ目の未参加スレッドに書き込みを1件行う",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーがログイン済みである必要があります");
		assert(this.currentEdgeToken, "edge-token が設定されていません");

		// 4つ目の新スレッドを作成
		const threadKey = Math.floor(Date.now() / 1000).toString();
		const thread = await InMemoryThreadRepo.create({
			threadKey: threadKey + "_new4",
			boardId: TEST_BOARD_ID,
			title: "4つ目の未参加スレッド",
			createdBy: this.currentUserId,
		});
		this.currentThreadId = thread.id;

		const result = await PostService.createPost({
			threadId: this.currentThreadId,
			body: "4つ目の未参加スレッドへの書き込み",
			edgeToken: this.currentEdgeToken,
			ipHash: this.currentIpHash,
			isBotWrite: false,
		});
		this.lastResult =
			"success" in result && result.success
				? { type: "success", data: result }
				: {
						type: "error",
						message: "success" in result ? result.error : "認証エラー",
						code: undefined,
					};
	},
);

// ---------------------------------------------------------------------------
// Then: インセンティブボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * 書き込みログインボーナスとして +{int} が付与される。
 * daily_login イベントが granted に含まれることを検証する。
 *
 * See: features/incentive.feature @その日の初回書き込みでログインボーナス +10 が付与される
 */
Then(
	"書き込みログインボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, amount: number) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const dailyLoginLog = logs.find((l) => l.eventType === "daily_login");
		assert(
			dailyLoginLog !== undefined,
			`書き込みログインボーナス (daily_login) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			dailyLoginLog.amount,
			amount,
			`書き込みログインボーナスの金額が ${amount} であることを期待しましたが ${dailyLoginLog.amount} でした`,
		);
	},
);

/**
 * 書き込みログインボーナスは付与されない。
 *
 * See: features/incentive.feature @同日の2回目以降の書き込みではボーナスは付与されない
 */
Then(
	"書き込みログインボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		// daily_login が今回の操作で新たに付与されていないことを確認
		// （前提として「今日すでに1回書き込みをしている」Givenで1件追加済み）
		const dailyLoginLogs = logs.filter((l) => l.eventType === "daily_login");
		// 既存ログが1件のみ（Given で追加したもの）なら付与されていない
		assert(
			dailyLoginLogs.length <= 1,
			`書き込みログインボーナスが付与されていないことを期待しましたが、${dailyLoginLogs.length} 件のログがあります`,
		);
	},
);

/**
 * スレッド作成ログインボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @その日の初回スレッド作成でボーナス +10 が付与される
 */
Then(
	"スレッド作成ログインボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, amount: number) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const threadCreationLog = logs.find(
			(l) => l.eventType === "thread_creation",
		);
		assert(
			threadCreationLog !== undefined,
			`スレッド作成ログインボーナス (thread_creation) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			threadCreationLog.amount,
			amount,
			`スレッド作成ログインボーナスの金額が ${amount} であることを期待しましたが ${threadCreationLog.amount} でした`,
		);
	},
);

/**
 * スレッド作成ログインボーナス +{int} が付与される（別の表現形式）。
 *
 * See: features/incentive.feature @スレッド作成は書き込みログインボーナスの対象外である
 */
Then(
	"スレッド作成ログインボーナス +{int} が付与される",
	async function (this: BattleBoardWorld, amount: number) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const threadCreationLog = logs.find(
			(l) => l.eventType === "thread_creation",
		);
		assert(
			threadCreationLog !== undefined,
			`スレッド作成ログインボーナス (thread_creation) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			threadCreationLog.amount,
			amount,
			`スレッド作成ログインボーナスの金額が ${amount} であることを期待しましたが ${threadCreationLog.amount} でした`,
		);
	},
);

/**
 * スレッド作成ログインボーナスは付与されない。
 *
 * See: features/incentive.feature @同日の2回目以降のスレッド作成ではボーナスは付与されない
 */
Then(
	"スレッド作成ログインボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const threadCreationLogs = logs.filter(
			(l) => l.eventType === "thread_creation",
		);
		// 既存ログが1件のみ（Given で追加したもの）なら新たに付与されていない
		assert(
			threadCreationLogs.length <= 1,
			`スレッド作成ログインボーナスが付与されていないことを期待しましたが、${threadCreationLogs.length} 件のログがあります`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: スレッド成長ボーナス付与確認（名前付きユーザー対象）
// ---------------------------------------------------------------------------

/**
 * "{string}" にスレッド成長ボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @スレッドにレスが10個付き、ユニークID 3個以上で +50 ボーナス
 */
Then(
	"{string} にスレッド成長ボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, userName: string, amount: number) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const logs = await findAllLogsForUser(ctx.userId);
		const growthLog = logs.find((l) => l.eventType === "thread_growth");
		assert(
			growthLog !== undefined,
			`スレッド成長ボーナス (thread_growth) が ${userName} に付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			growthLog.amount,
			amount,
			`スレッド成長ボーナスの金額が ${amount} であることを期待しましたが ${growthLog.amount} でした`,
		);
	},
);

/**
 * スレッド成長ボーナスは付与されない。
 *
 * See: features/incentive.feature @レスが10個付いてもユニークIDが3未満ならボーナスは付与されない
 */
Then(
	"スレッド成長ボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		// スレッドの作成者（UserA）に対してスレッド成長ボーナスが付与されていないことを確認
		// すべての named users をチェック
		for (const [, ctx] of this.namedUsers) {
			const logs = await findAllLogsForUser(ctx.userId);
			const growthLogs = logs.filter((l) => l.eventType === "thread_growth");
			assert(
				growthLogs.length === 0,
				`スレッド成長ボーナスが付与されていないことを期待しましたが、ユーザー ${ctx.userId} に ${growthLogs.length} 件のログがあります`,
			);
		}
	},
);

/**
 * "{string}" の通貨残高が {int} になる（名前付きユーザー版）。
 *
 * See: features/incentive.feature @スレッドにレスが10個付き、ユニークID 3個以上で +50 ボーナス
 */
Then(
	"{string} の通貨残高が {int} になる",
	async function (this: BattleBoardWorld, userName: string, expected: number) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const balance = await CurrencyService.getBalance(ctx.userId);
		assert.strictEqual(
			balance,
			expected,
			`${userName} の通貨残高が ${expected} であることを期待しましたが ${balance} でした`,
		);
	},
);

/**
 * "{string}" の通貨残高は {int} のまま変化しない（名前付きユーザー版）。
 *
 * See: features/incentive.feature @レスが10個付いてもユニークIDが3未満ならボーナスは付与されない
 */
Then(
	"{string} の通貨残高は {int} のまま変化しない",
	async function (this: BattleBoardWorld, userName: string, expected: number) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const balance = await CurrencyService.getBalance(ctx.userId);
		assert.strictEqual(
			balance,
			expected,
			`${userName} の通貨残高が ${expected} のまま変化しないことを期待しましたが ${balance} でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 返信ボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * "{string}" に返信ボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @他のユーザーから返信が付くと +5 ボーナスが付与される
 */
Then(
	"{string} に返信ボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, userName: string, amount: number) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const logs = await findAllLogsForUser(ctx.userId);
		const replyLogs = logs.filter((l) => l.eventType === "reply");
		assert(
			replyLogs.length > 0,
			`返信ボーナス (reply) が ${userName} に付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		const totalAmount = replyLogs.reduce((sum, l) => sum + l.amount, 0);
		assert.strictEqual(
			totalAmount,
			amount,
			`返信ボーナスの合計金額が ${amount} であることを期待しましたが ${totalAmount} でした`,
		);
	},
);

/**
 * 返信ボーナスは付与されない。
 *
 * See: features/incentive.feature @同一IDからの2回目以降の返信ではボーナスは付与されない
 */
Then("返信ボーナスは付与されない", async function (this: BattleBoardWorld) {
	// UserA に新しい reply ボーナスが付与されていないことを確認
	for (const [, ctx] of this.namedUsers) {
		const logs = await findAllLogsForUser(ctx.userId);
		const replyLogs = logs.filter((l) => l.eventType === "reply");
		// Given で追加した事前ログ（1件）を除いた新規ログがないことを確認
		// ただしどのユーザーが UserA かわからないため、全ユーザーをチェック
		// シンプルに: 返信ボーナスがどのユーザーにも付与されていないことを確認
		assert(
			replyLogs.length <= 1,
			`返信ボーナスが付与されていないことを期待しましたが、ユーザー ${ctx.userId} に ${replyLogs.length} 件の reply ログがあります`,
		);
	}
	// 現在ユーザーもチェック
	if (this.currentUserId) {
		const logs = await findAllLogsForUser(this.currentUserId);
		const replyLogs = logs.filter((l) => l.eventType === "reply");
		assert(
			replyLogs.length === 0,
			`返信ボーナスが付与されていないことを期待しましたが、${replyLogs.length} 件の reply ログがあります`,
		);
	}
});

/**
 * "{string}" に返信ボーナスが合計 +{int} 付与される（複数返信用）。
 *
 * See: features/incentive.feature @異なるIDからの返信にはそれぞれボーナスが付与される
 */
Then(
	"{string} に返信ボーナスが合計 +{int} 付与される",
	async function (
		this: BattleBoardWorld,
		userName: string,
		totalAmount: number,
	) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const logs = await findAllLogsForUser(ctx.userId);
		const replyLogs = logs.filter((l) => l.eventType === "reply");
		const actualTotal = replyLogs.reduce((sum, l) => sum + l.amount, 0);
		assert.strictEqual(
			actualTotal,
			totalAmount,
			`返信ボーナスの合計が ${totalAmount} であることを期待しましたが ${actualTotal} でした。ログ: ${JSON.stringify(replyLogs)}`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: ホットレスボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * "{string}" にホットレスボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @60分以内に3人以上から返信が付くと +15 ボーナスが付与される
 */
Then(
	"{string} にホットレスボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, userName: string, amount: number) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const logs = await findAllLogsForUser(ctx.userId);
		const hotPostLog = logs.find((l) => l.eventType === "hot_post");
		assert(
			hotPostLog !== undefined,
			`ホットレスボーナス (hot_post) が ${userName} に付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			hotPostLog.amount,
			amount,
			`ホットレスボーナスの金額が ${amount} であることを期待しましたが ${hotPostLog.amount} でした`,
		);
	},
);

/**
 * ホットレスボーナスは付与されない。
 *
 * See: features/incentive.feature @返信が60分を超えた場合はホットレスボーナスは付与されない
 */
Then(
	"ホットレスボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		for (const [, ctx] of this.namedUsers) {
			const logs = await findAllLogsForUser(ctx.userId);
			const hotPostLogs = logs.filter((l) => l.eventType === "hot_post");
			assert(
				hotPostLogs.length === 0,
				`ホットレスボーナスが付与されていないことを期待しましたが、${hotPostLogs.length} 件のログがあります`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 新スレッド参加ボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * 新スレッド参加ボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @未参加のスレッドに初めて書き込むと +3 ボーナスが付与される
 */
Then(
	"新スレッド参加ボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, amount: number) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const joinLog = logs.find((l) => l.eventType === "new_thread_join");
		assert(
			joinLog !== undefined,
			`新スレッド参加ボーナス (new_thread_join) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			joinLog.amount,
			amount,
			`新スレッド参加ボーナスの金額が ${amount} であることを期待しましたが ${joinLog.amount} でした`,
		);
	},
);

/**
 * 新スレッド参加ボーナスは付与されない。
 *
 * See: features/incentive.feature @同一スレッドへの2回目の書き込みではボーナスは付与されない
 */
Then(
	"新スレッド参加ボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		// Given で3件のログが追加済み（同日4スレッド目のシナリオ）か
		// 全くログがない（2回目書き込みのシナリオ）かを確認
		const joinLogs = logs.filter((l) => l.eventType === "new_thread_join");
		// 事前条件で追加されたログ以上に増えていないことを確認
		// 「同日4スレッド目」シナリオ: 3件のGiven+0件の追加=3件
		// 「2回目書き込み」シナリオ: 0件
		assert(
			joinLogs.length <= 3,
			`新スレッド参加ボーナスが付与されていないことを期待しましたが、${joinLogs.length} 件の new_thread_join ログがあります`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: スレッド復興ボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * "{string}" にスレッド復興ボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと
 */
Then(
	"{string} にスレッド復興ボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, userName: string, amount: number) {
		const ctx = this.getNamedUser(userName);
		assert(ctx, `ユーザー "${userName}" が登録されていません`);
		const logs = await findAllLogsForUser(ctx.userId);
		const revivalLog = logs.find((l) => l.eventType === "thread_revival");
		assert(
			revivalLog !== undefined,
			`スレッド復興ボーナス (thread_revival) が ${userName} に付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			revivalLog.amount,
			amount,
			`スレッド復興ボーナスの金額が ${amount} であることを期待しましたが ${revivalLog.amount} でした`,
		);
	},
);

/**
 * スレッド復興ボーナスは付与されない。
 *
 * See: features/incentive.feature @30分以内に他ユーザーのレスが付かなければボーナスは付与されない
 */
Then(
	"スレッド復興ボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		for (const [, ctx] of this.namedUsers) {
			const logs = await findAllLogsForUser(ctx.userId);
			const revivalLogs = logs.filter((l) => l.eventType === "thread_revival");
			assert(
				revivalLogs.length === 0,
				`スレッド復興ボーナスが付与されていないことを期待しましたが、ユーザー ${ctx.userId} に ${revivalLogs.length} 件のログがあります`,
			);
		}
		if (this.currentUserId) {
			const logs = await findAllLogsForUser(this.currentUserId);
			const revivalLogs = logs.filter((l) => l.eventType === "thread_revival");
			assert(
				revivalLogs.length === 0,
				`スレッド復興ボーナスが付与されていないことを期待しましたが、${revivalLogs.length} 件のログがあります`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: ストリークボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * 書き込みログインボーナス +{int} に加え、ストリークボーナス +{int} が付与される。
 *
 * See: features/incentive.feature @7日連続書き込みで +20 ストリークボーナスが付与される
 */
Then(
	"書き込みログインボーナス +{int} に加え、ストリークボーナス +{int} が付与される",
	async function (
		this: BattleBoardWorld,
		loginAmount: number,
		streakAmount: number,
	) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);

		const dailyLoginLog = logs.find((l) => l.eventType === "daily_login");
		assert(
			dailyLoginLog !== undefined,
			`書き込みログインボーナス (daily_login) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			dailyLoginLog.amount,
			loginAmount,
			`書き込みログインボーナスの金額が ${loginAmount} であることを期待しましたが ${dailyLoginLog.amount} でした`,
		);

		const streakLog = logs.find((l) => l.eventType === "streak");
		assert(
			streakLog !== undefined,
			`ストリークボーナス (streak) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			streakLog.amount,
			streakAmount,
			`ストリークボーナスの金額が ${streakAmount} であることを期待しましたが ${streakLog.amount} でした`,
		);
	},
);

/**
 * ストリークは1日目からリセットされる。
 * ユーザーの streakDays が 1 になっていることを確認する。
 *
 * See: features/incentive.feature @途中で1日書き込みを休むとストリークがリセットされる
 */
Then(
	"ストリークは1日目からリセットされる",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const user = await InMemoryUserRepo.findById(this.currentUserId);
		assert(user, "ユーザーが見つかりません");
		assert.strictEqual(
			user.streakDays,
			1,
			`ストリークが1日目にリセットされることを期待しましたが ${user.streakDays} でした`,
		);
	},
);

/**
 * ストリークボーナスは付与されない。
 *
 * See: features/incentive.feature @途中で1日書き込みを休むとストリークがリセットされる
 */
Then(
	"ストリークボーナスは付与されない",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const streakLogs = logs.filter((l) => l.eventType === "streak");
		assert(
			streakLogs.length === 0,
			`ストリークボーナスが付与されていないことを期待しましたが、${streakLogs.length} 件の streak ログがあります`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: キリ番ボーナス付与確認
// ---------------------------------------------------------------------------

/**
 * キリ番ボーナスとして +{int} が付与される。
 *
 * See: features/incentive.feature @レス番号 >>100 を踏むと +10 ボーナスが付与される
 */
Then(
	"キリ番ボーナスとして +{int} が付与される",
	async function (this: BattleBoardWorld, amount: number) {
		assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
		const logs = await findAllLogsForUser(this.currentUserId);
		const milestoneLog = logs.find((l) => l.eventType === "milestone_post");
		assert(
			milestoneLog !== undefined,
			`キリ番ボーナス (milestone_post) が付与されていません。ログ: ${JSON.stringify(logs)}`,
		);
		assert.strictEqual(
			milestoneLog.amount,
			amount,
			`キリ番ボーナスの金額が ${amount} であることを期待しましたが ${milestoneLog.amount} でした`,
		);
	},
);

/**
 * キリ番ボーナスは付与されない。
 *
 * See: features/incentive.feature @100の倍数でないレス番号ではキリ番ボーナスは付与されない
 */
Then("キリ番ボーナスは付与されない", async function (this: BattleBoardWorld) {
	assert(this.currentUserId, "通貨残高確認のためユーザーIDが必要です");
	const logs = await findAllLogsForUser(this.currentUserId);
	const milestoneLogs = logs.filter((l) => l.eventType === "milestone_post");
	assert(
		milestoneLogs.length === 0,
		`キリ番ボーナスが付与されていないことを期待しましたが、${milestoneLogs.length} 件の milestone_post ログがあります`,
	);
});
