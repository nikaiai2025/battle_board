/**
 * インメモリ BotRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * bot-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/bot_system.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { Bot } from "../../../src/lib/domain/models/bot";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされるボットストア */
const store: Bot[] = [];

/**
 * 生存BOTカウントの静的オーバーライド値。
 * null の場合はストアからのデフォルトカウントを使用する。
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §1.5
 */
let _livingBotCountOverride: number | null = null;

/**
 * スレッド内生存BOTカウントの静的オーバーライド値。
 * null の場合はデフォルト 0 を返す（InMemoryではbot_posts→postsのJOINを省略）。
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.6
 */
// biome-ignore lint: mutable override variable for BDD test control
let _livingBotInThreadCountOverride: number | null = null;

/**
 * 生存BOTカウントを静的値でオーバーライドする。
 * InMemoryストアだけでは表現しにくいシナリオで使用する。
 *
 * See: features/command_livingbot.feature @休眠スレッドにいるスレッド固定BOTはカウントされない
 */
export function _setLivingBotCount(count: number): void {
	_livingBotCountOverride = count;
}

/**
 * 生存BOTカウントのオーバーライドをクリアする。
 */
export function _clearLivingBotCountOverride(): void {
	_livingBotCountOverride = null;
}

/**
 * スレッド内の生存BOTカウントを静的値でオーバーライドする。
 * InMemoryではbot_posts→postsのJOINを省略しており、
 * BDDテストの目的は「ハンドラが正しいカウントをフォーマットして返すこと」の検証。
 *
 * See: features/command_livingbot.feature @スレッド内にBOTの書き込みがない場合は0体と表示される
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.6
 */
export function _setLivingBotInThreadCount(count: number): void {
	_livingBotInThreadCountOverride = count;
}

/**
 * スレッド内生存BOTカウントのオーバーライドをクリアする。
 */
export function _clearLivingBotInThreadCountOverride(): void {
	_livingBotInThreadCountOverride = null;
}

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
	_livingBotCountOverride = null;
	_livingBotInThreadCountOverride = null;
}

/**
 * テスト用ヘルパー: ボットを直接ストアに追加する。
 * 同一IDが存在する場合は上書きする（ステップ定義でのボット状態更新を容易にする）。
 *
 * See: features/bot_system.feature @荒らし役ボットはHP 10の潜伏中状態で配置される
 */
export function _insert(bot: Bot): void {
	const idx = store.findIndex((b) => b.id === bot.id);
	if (idx !== -1) {
		store[idx] = { ...bot };
	} else {
		store.push({ ...bot });
	}
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ボットを ID で取得する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function findById(id: string): Promise<Bot | null> {
	assertUUID(id, "BotRepository.findById.id");
	const bot = store.find((b) => b.id === id);
	return bot ? { ...bot } : null;
}

/**
 * 全ボットを取得する（is_active フラグ問わず）。
 * 日次リセット処理で使用する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function findAll(): Promise<Bot[]> {
	return [...store];
}

/**
 * 全ボットの件数を取得する（is_active フラグ問わず）。
 * ダッシュボードのBOT総数表示に使用する。
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts > countAll
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function countAll(): Promise<number> {
	return store.length;
}

/**
 * 活動中ボットのみ取得する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function findActive(): Promise<Bot[]> {
	return store.filter((b) => b.isActive);
}

/**
 * 撃破済み（eliminatedAt !== null）のボットを全件取得する。
 * 管理画面のBOT一覧（撃破済みタブ）で使用する。
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts > findEliminated
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 *
 * @returns 撃破済みボットの配列（eliminatedAt 降順）
 */
export async function findEliminated(): Promise<Bot[]> {
	return store
		.filter((b) => b.eliminatedAt !== null)
		.sort(
			(a, b) =>
				(b.eliminatedAt?.getTime() ?? 0) - (a.eliminatedAt?.getTime() ?? 0),
		)
		.map((b) => ({ ...b }));
}

/**
 * 複数のbot_idに対応するボット情報を一括取得する。
 * スレッド詳細のBOT情報表示（botInfoMap構築）に使用する。
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts > findByIds
 * See: features/admin.feature @管理者がスレッド詳細で投稿者の種別を識別できる
 *
 * @param botIds bot_idの配列
 * @returns Bot配列（見つかったものだけ返される）
 */
export async function findByIds(botIds: string[]): Promise<Bot[]> {
	if (botIds.length === 0) {
		return [];
	}
	for (const id of botIds) {
		assertUUID(id, "BotRepository.findByIds.botId");
	}
	const idSet = new Set(botIds);
	return store.filter((b) => idSet.has(b.id)).map((b) => ({ ...b }));
}

/**
 * 新規ボットを作成する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function create(
	bot: Omit<
		Bot,
		| "id"
		| "createdAt"
		| "survivalDays"
		| "totalPosts"
		| "accusedCount"
		| "timesAttacked"
		| "eliminatedAt"
		| "eliminatedBy"
	>,
): Promise<Bot> {
	const newBot: Bot = {
		...bot,
		id: crypto.randomUUID(),
		createdAt: new Date(Date.now()),
		survivalDays: 0,
		totalPosts: 0,
		accusedCount: 0,
		timesAttacked: 0,
		eliminatedAt: null,
		eliminatedBy: null,
	};
	store.push(newBot);
	return newBot;
}

/**
 * ボットの HP を更新する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function updateHp(botId: string, hp: number): Promise<void> {
	assertUUID(botId, "BotRepository.updateHp.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.hp = hp;
	}
}

/**
 * ボットに BOTマークを付与する（is_revealed = true）。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function reveal(botId: string): Promise<void> {
	assertUUID(botId, "BotRepository.reveal.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.isRevealed = true;
		bot.revealedAt = new Date(Date.now());
	}
}

/**
 * ボットの BOTマークを解除する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function unreveal(botId: string): Promise<void> {
	assertUUID(botId, "BotRepository.unreveal.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.isRevealed = false;
		bot.revealedAt = null;
	}
}

/**
 * ボットを撃破状態にする（is_active = false）。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function eliminate(
	botId: string,
	eliminatedBy: string,
): Promise<void> {
	assertUUID(botId, "BotRepository.eliminate.botId");
	assertUUID(eliminatedBy, "BotRepository.eliminate.eliminatedBy");
	const bot = store.find((b) => b.id === botId);
	if (bot && bot.isActive) {
		bot.isActive = false;
		bot.eliminatedAt = new Date(Date.now());
		bot.eliminatedBy = eliminatedBy;
		// オーバーライド値が設定されている場合はデクリメントする。
		// ラストボットボーナス判定（checkLastBotBonus）が countLivingBots() で
		// 正しい値を取得できるようにする。
		// See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
		if (_livingBotCountOverride !== null && _livingBotCountOverride > 0) {
			_livingBotCountOverride--;
		}
	} else if (bot) {
		bot.isActive = false;
		bot.eliminatedAt = new Date(Date.now());
		bot.eliminatedBy = eliminatedBy;
	}
}

/**
 * ボットの被攻撃回数（timesAttacked）を 1 インクリメントする。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function incrementTimesAttacked(botId: string): Promise<void> {
	assertUUID(botId, "BotRepository.incrementTimesAttacked.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.timesAttacked += 1;
	}
}

/**
 * ボットの生存日数（survivalDays）を 1 インクリメントする。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function incrementSurvivalDays(botId: string): Promise<void> {
	assertUUID(botId, "BotRepository.incrementSurvivalDays.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.survivalDays += 1;
	}
}

/**
 * ボットの総書き込み数（totalPosts）を 1 インクリメントする。
 * executeBotPost の bot_posts INSERT 成功直後に呼び出される。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 * See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
 */
export async function incrementTotalPosts(botId: string): Promise<void> {
	assertUUID(botId, "BotRepository.incrementTotalPosts.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.totalPosts += 1;
	}
}

/**
 * ボットの被告発回数（accusedCount）を 1 インクリメントする。
 * AccusationService.accuse() の告発成功（isBot=true）後に呼び出される。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
 */
export async function incrementAccusedCount(botId: string): Promise<void> {
	assertUUID(botId, "BotRepository.incrementAccusedCount.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.accusedCount += 1;
	}
}

/**
 * ボットの偽装日次リセットIDと発行日を更新する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function updateDailyId(
	botId: string,
	dailyId: string,
	dailyIdDate: string,
): Promise<void> {
	assertUUID(botId, "BotRepository.updateDailyId.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.dailyId = dailyId;
		bot.dailyIdDate = dailyIdDate;
	}
}

/**
 * 全BOTの偽装IDを一括更新する（TASK-355: 日次リセット Step 1 バッチ化）。
 * entries 配列の各要素 { botId, dailyId } を受け取り、全件の dailyId と dailyIdDate を更新する。
 * 本番実装（bot-repository.ts > bulkUpdateDailyIds）と同一の振る舞いを持つ。
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts > bulkUpdateDailyIds
 * See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
 */
export async function bulkUpdateDailyIds(
	entries: Array<{ botId: string; dailyId: string }>,
	dailyIdDate: string,
): Promise<void> {
	for (const entry of entries) {
		assertUUID(entry.botId, "BotRepository.bulkUpdateDailyIds.botId");
		const bot = store.find((b) => b.id === entry.botId);
		if (bot) {
			bot.dailyId = entry.dailyId;
			bot.dailyIdDate = dailyIdDate;
		}
	}
}

/**
 * is_active=true の全BOTの survival_days を一括 +1 する（TASK-355: 日次リセット Step 3 バッチ化）。
 * 本番実装（bot-repository.ts > bulkIncrementSurvivalDays）と同一の振る舞いを持つ。
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts > bulkIncrementSurvivalDays
 * See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる
 */
export async function bulkIncrementSurvivalDays(): Promise<void> {
	for (const bot of store) {
		if (bot.isActive) {
			bot.survivalDays += 1;
		}
	}
}

/**
 * ボットの次回投稿予定時刻を更新する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function updateNextPostAt(
	botId: string,
	nextPostAt: Date,
): Promise<void> {
	assertUUID(botId, "BotRepository.updateNextPostAt.botId");
	const bot = store.find((b) => b.id === botId);
	if (bot) {
		bot.nextPostAt = nextPostAt;
	}
}

/**
 * 投稿対象のBOT一覧を取得する（is_active=true AND next_post_at <= NOW()）。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function findDueForPost(): Promise<Bot[]> {
	const now = new Date();
	return store.filter(
		(b) =>
			b.isActive &&
			b.nextPostAt !== null &&
			b.nextPostAt.getTime() <= now.getTime(),
	);
}

/**
 * is_revealed = true の全ボットの BOTマークを一括解除する（revealed -> lurking）。
 * 日次リセット処理で使用する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function bulkResetRevealed(): Promise<number> {
	let count = 0;
	for (const bot of store) {
		if (bot.isRevealed) {
			bot.isRevealed = false;
			bot.revealedAt = null;
			count++;
		}
	}
	return count;
}

/**
 * 撃破済みチュートリアルBOTおよび7日経過の未撃破チュートリアルBOTを削除する。
 *
 * 削除対象:
 *   - 撃破済みチュートリアルBOT: botProfileKey = 'tutorial' AND isActive = false
 *   - 7日経過の未撃破チュートリアルBOT: botProfileKey = 'tutorial' AND createdAt < NOW() - 7日
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts > deleteEliminatedTutorialBots
 * See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
 *
 * @returns 削除したボット数
 */
export async function deleteEliminatedTutorialBots(): Promise<number> {
	const now = Date.now();
	const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

	// 削除対象のインデックスを後方から収集して splice する
	let count = 0;
	for (let i = store.length - 1; i >= 0; i--) {
		const bot = store[i];
		if (bot.botProfileKey !== "tutorial") continue;

		const isEliminated = !bot.isActive;
		const isStale = bot.createdAt.getTime() < now - sevenDaysMs;

		if (isEliminated || isStale) {
			store.splice(i, 1);
			count++;
		}
	}
	return count;
}

/**
 * 掲示板全体の生存BOT数をカウントする。
 *
 * 2つの動作モード:
 * - デフォルト: ストアから isActive === true のBOTを全件カウント
 * - オーバーライド: _setLivingBotCount() で設定された静的値を返す
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §1.5
 */
export async function countLivingBots(): Promise<number> {
	if (_livingBotCountOverride !== null) {
		return _livingBotCountOverride;
	}
	return store.filter((b) => b.isActive).length;
}

/**
 * スレッド内の生存BOT数をカウントする。
 *
 * 2つの動作モード:
 * - オーバーライド: _setLivingBotInThreadCount() で設定された静的値を返す
 * - デフォルト: 0を返す（InMemoryではbot_posts→postsのJOINを省略）
 *
 * See: features/command_livingbot.feature @スレッド内にBOTの書き込みがない場合は0体と表示される
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.6
 *
 * @param threadId スレッドID
 * @returns スレッド内の生存BOT数
 */
export async function countLivingBotsInThread(
	threadId: string,
): Promise<number> {
	assertUUID(threadId, "BotRepository.countLivingBotsInThread.threadId");
	if (_livingBotInThreadCountOverride !== null) {
		return _livingBotInThreadCountOverride;
	}
	// デフォルト: 0（InMemoryではbot_posts→postsのJOINを省略）
	return 0;
}

/**
 * 撃破済みボットをインカーネーションモデルで復活させる（日次リセット処理）。
 *
 * 旧レコードは store 内にそのまま残す（is_active=false 凍結）。
 * 新 UUID を生成し、同一 name/persona/bot_profile_key/max_hp で新レコードを push する。
 * 本番実装（BotRepository.bulkReviveEliminated）と同一の振る舞いを持つ。
 *
 * チュートリアルBOT（botProfileKey = 'tutorial'）・煽りBOT（'aori'）は復活対象外。
 *
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 * See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
 * See: features/bot_system.feature @撃破済みボットは翌日にHP初期値で復活する
 * See: features/welcome.feature @チュートリアルBOTは日次リセットで復活しない
 * See: features/command_aori.feature @煽りBOTは日次リセットで復活しない
 */
export async function bulkReviveEliminated(): Promise<Bot[]> {
	// チュートリアルBOT・煽りBOT（使い切りBOT）は復活させない
	const NON_REVIVABLE_PROFILE_KEYS = ["tutorial", "aori"];

	// 当日 JST 日付を取得する（daily_id_date に使用）
	const jstOffset = 9 * 60 * 60 * 1000;
	const jstDate = new Date(Date.now() + jstOffset);
	const today = jstDate.toISOString().slice(0, 10);

	// ランダム偽装IDを生成する（人間の daily_id と同形式: 英数字8文字）
	// See: docs/specs/bot_state_transitions.yaml #fake_daily_id > generation
	const fakeDailyIdChars =
		"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
	function generateFakeDailyId(): string {
		let result = "";
		for (let i = 0; i < 8; i++) {
			result +=
				fakeDailyIdChars[Math.floor(Math.random() * fakeDailyIdChars.length)];
		}
		return result;
	}

	// store のスナップショットを取る（ループ中に push しても対象外になるよう先に絞り込む）
	const eliminated = store.filter(
		(bot) =>
			!bot.isActive &&
			!NON_REVIVABLE_PROFILE_KEYS.includes(bot.botProfileKey ?? ""),
	);

	const revivedBots: Bot[] = [];
	for (const oldBot of eliminated) {
		// 旧レコードは store 内に変更せず残す（凍結保持）
		// 新世代ボットを別 UUID で作成して push する
		const newBot: Bot = {
			id: crypto.randomUUID(),
			name: oldBot.name,
			persona: oldBot.persona,
			botProfileKey: oldBot.botProfileKey,
			hp: oldBot.maxHp,
			maxHp: oldBot.maxHp,
			isActive: true,
			isRevealed: false,
			revealedAt: null,
			dailyId: generateFakeDailyId(),
			dailyIdDate: today,
			survivalDays: 0,
			totalPosts: 0,
			accusedCount: 0,
			timesAttacked: 0,
			grassCount: 0,
			eliminatedAt: null,
			eliminatedBy: null,
			nextPostAt: null,
			createdAt: new Date(Date.now()),
		};
		store.push(newBot);
		revivedBots.push({ ...newBot });
	}

	return revivedBots;
}
