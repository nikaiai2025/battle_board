/**
 * BotRepository — bots テーブルへの CRUD 操作
 *
 * bots テーブルは RLS により anon/authenticated ロールからの全操作を拒否している。
 * service_role キーを持つ supabaseAdmin を使用して RLS をバイパスする。
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > bots
 * See: docs/architecture/architecture.md §10.1.1 RLSポリシー設計
 * See: docs/architecture/components/bot.md §5.1 bots テーブル変更 (v5)
 */

import type { Bot } from "../../domain/models/bot";
import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** bots テーブルの生レコード型 */
interface BotRow {
	id: string;
	name: string;
	persona: string;
	hp: number;
	max_hp: number;
	daily_id: string;
	daily_id_date: string;
	is_active: boolean;
	is_revealed: boolean;
	revealed_at: string | null;
	survival_days: number;
	total_posts: number;
	accused_count: number;
	/** v5追加: 被攻撃回数。撃破報酬計算に使用する */
	times_attacked: number;
	/** v5追加: config/bot_profiles.yaml のプロファイルキー */
	bot_profile_key: string | null;
	eliminated_at: string | null;
	eliminated_by: string | null;
	created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメインモデル 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToBot(row: BotRow): Bot {
	return {
		id: row.id,
		name: row.name,
		persona: row.persona,
		hp: row.hp,
		maxHp: row.max_hp,
		dailyId: row.daily_id,
		dailyIdDate: row.daily_id_date,
		isActive: row.is_active,
		isRevealed: row.is_revealed,
		revealedAt: row.revealed_at ? new Date(row.revealed_at) : null,
		survivalDays: row.survival_days,
		totalPosts: row.total_posts,
		accusedCount: row.accused_count,
		timesAttacked: row.times_attacked,
		botProfileKey: row.bot_profile_key,
		eliminatedAt: row.eliminated_at ? new Date(row.eliminated_at) : null,
		eliminatedBy: row.eliminated_by,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// カウンタインクリメント共通処理
// ---------------------------------------------------------------------------

/**
 * bots テーブルの数値カラムを 1 インクリメントする共通処理。
 * SELECT + UPDATE でアトミック性を保つ（サービス呼び出しは低頻度のため楽観的更新で十分）。
 *
 * @param botId ボットの UUID
 * @param column インクリメント対象のカラム名
 */
async function incrementColumn(
	botId: string,
	column: "total_posts" | "accused_count" | "survival_days" | "times_attacked",
): Promise<void> {
	const { data: row, error: fetchError } = await supabaseAdmin
		.from("bots")
		.select(column)
		.eq("id", botId)
		.single();

	if (fetchError) {
		throw new Error(
			`BotRepository.increment(${column}) fetch failed: ${fetchError.message}`,
		);
	}

	const current = (row as Record<string, number>)[column];

	const { error: updateError } = await supabaseAdmin
		.from("bots")
		.update({ [column]: current + 1 })
		.eq("id", botId);

	if (updateError) {
		throw new Error(
			`BotRepository.increment(${column}) update failed: ${updateError.message}`,
		);
	}
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * ボットを ID で取得する。
 * @param id ボットの UUID
 * @returns 該当ボット、または存在しない場合は null
 */
export async function findById(id: string): Promise<Bot | null> {
	const { data, error } = await supabaseAdmin
		.from("bots")
		.select("*")
		.eq("id", id)
		.single();

	if (error) {
		// PGRST116: 行が見つからない
		if (error.code === "PGRST116") {
			return null;
		}
		throw new Error(`BotRepository.findById failed: ${error.message}`);
	}

	return data ? rowToBot(data as BotRow) : null;
}

/**
 * 活動中（is_active = true）のボットを全件取得する。
 * @returns 活動中ボットの配列
 */
export async function findActive(): Promise<Bot[]> {
	const { data, error } = await supabaseAdmin
		.from("bots")
		.select("*")
		.eq("is_active", true);

	if (error) {
		throw new Error(`BotRepository.findActive failed: ${error.message}`);
	}

	return (data as BotRow[]).map(rowToBot);
}

/**
 * 全ボットを取得する（is_active フラグ問わず）。
 * 日次リセット処理で全ボットを対象にする場合に使用する。
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
 *
 * @returns 全ボットの配列
 */
export async function findAll(): Promise<Bot[]> {
	const { data, error } = await supabaseAdmin.from("bots").select("*");

	if (error) {
		throw new Error(`BotRepository.findAll failed: ${error.message}`);
	}

	return (data as BotRow[]).map(rowToBot);
}

/**
 * 新規ボットを作成する。
 * id, createdAt, survivalDays, totalPosts, accusedCount, timesAttacked,
 * eliminatedAt, eliminatedBy は DB デフォルト値で生成されるため、入力から除外する。
 *
 * @param bot 作成するボットのデータ
 * @returns 作成されたボット（DB 生成フィールドを含む）
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
	const { data, error } = await supabaseAdmin
		.from("bots")
		.insert({
			name: bot.name,
			persona: bot.persona,
			hp: bot.hp,
			max_hp: bot.maxHp,
			daily_id: bot.dailyId,
			daily_id_date: bot.dailyIdDate,
			is_active: bot.isActive,
			is_revealed: bot.isRevealed,
			revealed_at: bot.revealedAt?.toISOString() ?? null,
			bot_profile_key: bot.botProfileKey ?? null,
		})
		.select()
		.single();

	if (error) {
		throw new Error(`BotRepository.create failed: ${error.message}`);
	}

	return rowToBot(data as BotRow);
}

/**
 * ボットの HP を更新する。
 * @param botId ボットの UUID
 * @param hp 新しい HP 値
 */
export async function updateHp(botId: string, hp: number): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({ hp })
		.eq("id", botId);

	if (error) {
		throw new Error(`BotRepository.updateHp failed: ${error.message}`);
	}
}

/**
 * ボットの偽装日次リセットIDと発行日を更新する。
 * 毎日のリセット処理で使用する。
 *
 * @param botId ボットの UUID
 * @param dailyId 新しい偽装 ID（8文字）
 * @param dailyIdDate 偽装ID の発行日（YYYY-MM-DD）
 */
export async function updateDailyId(
	botId: string,
	dailyId: string,
	dailyIdDate: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({ daily_id: dailyId, daily_id_date: dailyIdDate })
		.eq("id", botId);

	if (error) {
		throw new Error(`BotRepository.updateDailyId failed: ${error.message}`);
	}
}

/**
 * ボットに BOTマークを付与する（is_revealed = true, revealed_at = 現在時刻）。
 * AI告発（!tell）成功時、または !attack による不意打ち成功時に呼ばれる。
 * See: docs/architecture/architecture.md §4.2 > bots.is_revealed
 * See: features/未実装/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
 *
 * @param botId ボットの UUID
 */
export async function reveal(botId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({ is_revealed: true, revealed_at: new Date().toISOString() })
		.eq("id", botId);

	if (error) {
		throw new Error(`BotRepository.reveal failed: ${error.message}`);
	}
}

/**
 * ボットの BOTマークを解除する（is_revealed = false, revealed_at = null）。
 * 日次リセット処理で使用する。
 *
 * @param botId ボットの UUID
 */
export async function unreveal(botId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({ is_revealed: false, revealed_at: null })
		.eq("id", botId);

	if (error) {
		throw new Error(`BotRepository.unreveal failed: ${error.message}`);
	}
}

/**
 * ボットを撃破状態にする（is_active = false, eliminated_at = 現在時刻, eliminated_by = 撃破者ID）。
 * See: features/未実装/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
 *
 * @param botId ボットの UUID
 * @param eliminatedBy 撃破した人間ユーザーの user_id
 */
export async function eliminate(
	botId: string,
	eliminatedBy: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({
			is_active: false,
			eliminated_at: new Date().toISOString(),
			eliminated_by: eliminatedBy,
		})
		.eq("id", botId);

	if (error) {
		throw new Error(`BotRepository.eliminate failed: ${error.message}`);
	}
}

/**
 * ボットの総書き込み数（total_posts）を 1 インクリメントする。
 * @param botId ボットの UUID
 */
export async function incrementTotalPosts(botId: string): Promise<void> {
	await incrementColumn(botId, "total_posts");
}

/**
 * ボットの被告発回数（accused_count）を 1 インクリメントする。
 * @param botId ボットの UUID
 */
export async function incrementAccusedCount(botId: string): Promise<void> {
	await incrementColumn(botId, "accused_count");
}

/**
 * ボットの生存日数（survival_days）を 1 インクリメントする。
 * 日次メンテナンス処理で使用する。
 *
 * @param botId ボットの UUID
 */
export async function incrementSurvivalDays(botId: string): Promise<void> {
	await incrementColumn(botId, "survival_days");
}

/**
 * ボットの被攻撃回数（times_attacked）を 1 インクリメントする。
 * !attack コマンドによるダメージ処理時に呼ばれる。
 * See: docs/architecture/components/bot.md §2.2 HP更新・ダメージ処理
 * See: features/未実装/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 *
 * @param botId ボットの UUID
 */
export async function incrementTimesAttacked(botId: string): Promise<void> {
	await incrementColumn(botId, "times_attacked");
}

/**
 * is_revealed = true の全ボットの BOTマークを一括解除する（revealed -> lurking）。
 * 日次リセット処理で使用する。
 * See: docs/specs/bot_state_transitions.yaml #daily_reset > revealed -> lurking
 * See: features/未実装/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
 *
 * @returns BOTマーク解除したボット数
 */
export async function bulkResetRevealed(): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("bots")
		.update({ is_revealed: false, revealed_at: null })
		.eq("is_revealed", true)
		.select("id");

	if (error) {
		throw new Error(`BotRepository.bulkResetRevealed failed: ${error.message}`);
	}

	return ((data ?? []) as { id: string }[]).length;
}

/**
 * eliminated 状態の全ボットを lurking に復活させる。
 * HP を max_hp に戻し、survival_days・times_attacked を 0 にリセットする。
 * 日次リセット処理で使用する。
 * See: docs/specs/bot_state_transitions.yaml #daily_reset > eliminated -> lurking
 * See: features/未実装/bot_system.feature @撃破済みボットは翌日にHP初期値で復活する
 *
 * @returns 復活させたボット数
 */
export async function bulkReviveEliminated(): Promise<number> {
	// eliminated 状態 = is_active = false のボットを取得して max_hp を参照する必要がある。
	// Supabase は UPDATE ... SET hp = max_hp のような自己参照 UPDATE をサポートしないため、
	// 一度全件取得してから個別に更新する。
	const { data: eliminated, error: fetchError } = await supabaseAdmin
		.from("bots")
		.select("id, max_hp")
		.eq("is_active", false);

	if (fetchError) {
		throw new Error(
			`BotRepository.bulkReviveEliminated fetch failed: ${fetchError.message}`,
		);
	}

	const rows = eliminated as { id: string; max_hp: number }[];
	if (rows.length === 0) return 0;

	// 各ボットを復活させる（max_hp は bot ごとに異なりうるため個別 UPDATE）
	for (const row of rows) {
		const { error: updateError } = await supabaseAdmin
			.from("bots")
			.update({
				is_active: true,
				is_revealed: false,
				hp: row.max_hp,
				revealed_at: null,
				eliminated_at: null,
				eliminated_by: null,
				survival_days: 0,
				times_attacked: 0,
			})
			.eq("id", row.id);

		if (updateError) {
			throw new Error(
				`BotRepository.bulkReviveEliminated update failed for bot ${row.id}: ${updateError.message}`,
			);
		}
	}

	return rows.length;
}
