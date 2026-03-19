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
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
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
 * 活動中ボットのみ取得する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function findActive(): Promise<Bot[]> {
	return store.filter((b) => b.isActive);
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
	if (bot) {
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
 * eliminated 状態の全ボットを lurking に復活させる。
 * HP を maxHp に戻し、survivalDays・timesAttacked を 0 にリセットする。
 * 日次リセット処理で使用する。
 * See: src/lib/infrastructure/repositories/bot-repository.ts
 */
export async function bulkReviveEliminated(): Promise<number> {
	let count = 0;
	for (const bot of store) {
		if (!bot.isActive) {
			bot.isActive = true;
			bot.isRevealed = false;
			bot.revealedAt = null;
			bot.hp = bot.maxHp;
			bot.eliminatedAt = null;
			bot.eliminatedBy = null;
			bot.survivalDays = 0;
			bot.timesAttacked = 0;
			count++;
		}
	}
	return count;
}
