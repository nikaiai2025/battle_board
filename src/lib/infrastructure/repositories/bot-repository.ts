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
	/** TDR-010追加: 次回投稿予定時刻 */
	next_post_at: string | null;
	eliminated_at: string | null;
	eliminated_by: string | null;
	created_at: string;
	/** TASK-307追加: ボットへの草カウント（通算）。See: supabase/migrations/00029_bot_grass_count.sql */
	grass_count: number;
}

/**
 * countLivingBots 区分B — クエリ1の結果型。
 * bots → bot_posts の one-to-many 結合結果。
 */
interface ThreadFixedBotRow {
	id: string;
	bot_posts: Array<{
		post_id: string;
	}>;
}

/**
 * countLivingBots 区分B — クエリ2の結果型。
 * posts → threads の many-to-one 結合結果。
 * PostgREST は many-to-one FK を単一オブジェクト（or null）で返すが、
 * SDK バージョンによっては配列で返す可能性があるため、
 * Array.isArray() で安全にハンドリングする。
 */
interface PostWithThread {
	id: string;
	thread_id: string;
	threads: { is_dormant: boolean } | Array<{ is_dormant: boolean }> | null;
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
		nextPostAt: row.next_post_at ? new Date(row.next_post_at) : null,
		eliminatedAt: row.eliminated_at ? new Date(row.eliminated_at) : null,
		eliminatedBy: row.eliminated_by,
		createdAt: new Date(row.created_at),
		// TASK-307: ボット草カウント。00029マイグレーションで追加。DEFAULT 0 のため undefined 時は 0 にフォールバック
		// See: features/reactions.feature @ボットへの草でも正しい草カウントが表示される
		grassCount: row.grass_count ?? 0,
	};
}

// ---------------------------------------------------------------------------
// カウンタインクリメント共通処理
// ---------------------------------------------------------------------------

/**
 * bots テーブルの数値カラムを 1 アトミックにインクリメントする共通処理。
 * PostgreSQL RPC 関数 `increment_bot_column` を呼び出すことで、
 * UPDATE bots SET {column} = {column} + 1 をアトミックに実行する。
 * SELECT + UPDATE の2ステップによるレースコンディション（HIGH-004）を排除する。
 *
 * See: supabase/migrations/00014_add_increment_column_rpc.sql
 * See: docs/architecture/architecture.md §7.2 同時実行制御（楽観的ロック）TDR-003
 *
 * @param botId ボットの UUID
 * @param column インクリメント対象のカラム名
 * @returns インクリメント後のカラム値
 */
async function incrementColumn(
	botId: string,
	column: "total_posts" | "accused_count" | "survival_days" | "times_attacked",
): Promise<number> {
	const { data, error } = await supabaseAdmin.rpc("increment_bot_column", {
		p_bot_id: botId,
		p_column: column,
	});

	if (error) {
		throw new Error(
			`BotRepository.increment(${column}) failed: ${error.message}`,
		);
	}

	return data as number;
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 複数のbot_idに対応するボット情報を一括取得する。
 * 撃破済みBOT表示のbotMark合成に使用する。
 *
 * See: features/bot_system.feature @撃破済みボットのレスはWebブラウザで目立たない表示になる
 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.3 BotRepository.findByIds
 *
 * @param botIds bot_idの配列
 * @returns Bot配列（見つかったものだけ返される）
 */
export async function findByIds(botIds: string[]): Promise<Bot[]> {
	if (botIds.length === 0) {
		return [];
	}

	const { data, error } = await supabaseAdmin
		.from("bots")
		.select("*")
		.in("id", botIds);

	if (error) {
		throw new Error(`BotRepository.findByIds failed: ${error.message}`);
	}

	return (data as BotRow[]).map(rowToBot);
}

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
 * 撃破済み（eliminated_at IS NOT NULL）のボットを全件取得する。
 * 管理画面のBOT一覧（撃破済みタブ）で使用する。
 *
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 *
 * @returns 撃破済みボットの配列
 */
export async function findEliminated(): Promise<Bot[]> {
	const { data, error } = await supabaseAdmin
		.from("bots")
		.select("*")
		.not("eliminated_at", "is", null)
		.order("eliminated_at", { ascending: false });

	if (error) {
		throw new Error(`BotRepository.findEliminated failed: ${error.message}`);
	}

	return (data as BotRow[]).map(rowToBot);
}

/**
 * 全ボットの件数を取得する（is_active フラグ問わず）。
 * ダッシュボードのBOT総数表示に使用する。
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 *
 * @returns 全ボットの件数
 */
export async function countAll(): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("bots")
		.select("*", { count: "exact", head: true });

	if (error) {
		throw new Error(`BotRepository.countAll failed: ${error.message}`);
	}
	return count ?? 0;
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
 * 全BOTの偽装IDを一括更新する（TASK-355: 日次リセット Step 1 バッチ化）。
 *
 * 偽装IDはBOTごとに異なるランダム値が必要なため、アプリ側で生成した entries を受け取り、
 * PostgreSQL の unnest + UPDATE ... FROM で1回のSQLにまとめる。
 * 旧実装（N回の個別 updateDailyId）では BOT数増加時に Vercel Hobby 10秒制限を超過していた。
 *
 * See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理
 *
 * @param entries 各BOTの { botId, dailyId } ペア配列
 * @param dailyIdDate 偽装IDの発行日（YYYY-MM-DD）。全BOT共通。
 */
export async function bulkUpdateDailyIds(
	entries: Array<{ botId: string; dailyId: string }>,
	dailyIdDate: string,
): Promise<void> {
	if (entries.length === 0) return;

	// PostgreSQL の unnest を使い、1回の UPDATE で全BOTの daily_id を更新する。
	// unnest(text[], text[]) で (bot_id, daily_id) のペアをテーブル化し、
	// UPDATE ... FROM で JOIN 更新する。
	const botIds = entries.map((e) => e.botId);
	const dailyIds = entries.map((e) => e.dailyId);

	const { error } = await supabaseAdmin.rpc("bulk_update_daily_ids", {
		p_bot_ids: botIds,
		p_daily_ids: dailyIds,
		p_daily_id_date: dailyIdDate,
	});

	if (error) {
		throw new Error(
			`BotRepository.bulkUpdateDailyIds failed: ${error.message}`,
		);
	}
}

/**
 * is_active=true の全BOTの survival_days を一括 +1 する（TASK-355: 日次リセット Step 3 バッチ化）。
 *
 * 旧実装: for ループ内で isActive を判定し N回の個別 RPC 呼び出し。
 * 新実装: 1回の UPDATE 文で is_active=true の全レコードを +1。
 *
 * See: features/bot_system.feature @日次リセットでボットの生存日数がカウントされる
 * See: docs/specs/bot_state_transitions.yaml #daily_reset
 */
export async function bulkIncrementSurvivalDays(): Promise<void> {
	const { error } = await supabaseAdmin.rpc("bulk_increment_survival_days");

	if (error) {
		throw new Error(
			`BotRepository.bulkIncrementSurvivalDays failed: ${error.message}`,
		);
	}
}

/**
 * ボットに BOTマークを付与する（is_revealed = true, revealed_at = 現在時刻）。
 * AI告発（!tell）成功時、または !attack による不意打ち成功時に呼ばれる。
 * See: docs/architecture/architecture.md §4.2 > bots.is_revealed
 * See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
 *
 * @param botId ボットの UUID
 */
export async function reveal(botId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({
			is_revealed: true,
			revealed_at: new Date(Date.now()).toISOString(),
		})
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
 * See: features/bot_system.feature @HPが0になったボットが撃破され戦歴が全公開される
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
			eliminated_at: new Date(Date.now()).toISOString(),
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
 * See: features/bot_system.feature @撃破報酬は基本報酬＋生存日数ボーナス＋被攻撃ボーナスで計算される
 *
 * @param botId ボットの UUID
 */
export async function incrementTimesAttacked(botId: string): Promise<void> {
	await incrementColumn(botId, "times_attacked");
}

/**
 * ボットの次回投稿予定時刻を更新する。
 * 投稿成功後に NOW() + SchedulingStrategy.getNextPostDelay() で設定される。
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: docs/architecture/components/bot.md §2.1 書き込み実行
 *
 * @param botId ボットの UUID
 * @param nextPostAt 次回投稿予定時刻
 */
export async function updateNextPostAt(
	botId: string,
	nextPostAt: Date | null,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("bots")
		.update({ next_post_at: nextPostAt?.toISOString() ?? null })
		.eq("id", botId);

	if (error) {
		throw new Error(`BotRepository.updateNextPostAt failed: ${error.message}`);
	}
}

/**
 * 投稿対象のBOT一覧を取得する。
 * is_active = true かつ next_post_at <= NOW() の条件で絞り込む。
 * See: docs/architecture/architecture.md §13 TDR-010
 * See: docs/architecture/components/bot.md §2.1 書き込み実行
 *
 * @returns 投稿対象のボット配列
 */
export async function findDueForPost(): Promise<Bot[]> {
	const now = new Date().toISOString();
	const { data, error } = await supabaseAdmin
		.from("bots")
		.select("*")
		.eq("is_active", true)
		.lte("next_post_at", now);

	if (error) {
		throw new Error(`BotRepository.findDueForPost failed: ${error.message}`);
	}

	return (data as BotRow[]).map(rowToBot);
}

/**
 * is_revealed = true の全ボットの BOTマークを一括解除する（revealed -> lurking）。
 * 日次リセット処理で使用する。
 * See: docs/specs/bot_state_transitions.yaml #daily_reset > revealed -> lurking
 * See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
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
 * 撃破済みボットをインカーネーションモデルで復活させる。
 *
 * 旧レコードは is_active=false のまま凍結保持し（bot_posts 紐付けを維持）、
 * 同一 name/persona/bot_profile_key/max_hp で新レコードを INSERT する。
 * 新世代ボットは新しい UUID・偽装ID を持ち、旧日の書き込みとは無関係になる。
 *
 * チュートリアルBOT（bot_profile_key = 'tutorial'）・煽りBOT（'aori'）は
 * 復活対象から除外する。
 *
 * See: docs/architecture/components/bot.md §6.11 インカーネーションモデル
 * See: docs/specs/bot_state_transitions.yaml #transitions > eliminated -> lurking
 * See: features/bot_system.feature @撃破済みボットは翌日にHP初期値で復活する
 * See: features/welcome.feature @チュートリアルBOTは日次リセットで復活しない
 * See: features/command_aori.feature @煽りBOTは日次リセットで復活しない
 *
 * @returns 新規作成された Bot レコードの配列
 */
export async function bulkReviveEliminated(): Promise<Bot[]> {
	// eliminated 状態（is_active=false）かつ復活対象のボットを取得する。
	// チュートリアルBOT・煽りBOT（使い切りBOT）は復活させない。
	const { data: eliminated, error: fetchError } = await supabaseAdmin
		.from("bots")
		.select("*")
		.eq("is_active", false)
		.or("bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori)");

	if (fetchError) {
		throw new Error(
			`BotRepository.bulkReviveEliminated fetch failed: ${fetchError.message}`,
		);
	}

	const rows = eliminated as BotRow[];
	if (rows.length === 0) return [];

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

	// 旧レコードは UPDATE せず凍結保持。新レコードを INSERT して新世代ボットを作成する。
	const revivedBots: Bot[] = [];
	for (const row of rows) {
		const { data: newRow, error: insertError } = await supabaseAdmin
			.from("bots")
			.insert({
				name: row.name,
				persona: row.persona,
				bot_profile_key: row.bot_profile_key,
				hp: row.max_hp,
				max_hp: row.max_hp,
				is_active: true,
				is_revealed: false,
				revealed_at: null,
				daily_id: generateFakeDailyId(),
				daily_id_date: today,
				survival_days: 0,
				total_posts: 0,
				accused_count: 0,
				times_attacked: 0,
				grass_count: 0,
				eliminated_at: null,
				eliminated_by: null,
				next_post_at: null,
			})
			.select()
			.single();

		if (insertError) {
			throw new Error(
				`BotRepository.bulkReviveEliminated insert failed for bot "${row.name}": ${insertError.message}`,
			);
		}

		revivedBots.push(rowToBot(newRow as BotRow));
	}

	return revivedBots;
}

/**
 * 掲示板全体の生存BOT数をカウントする。
 *
 * カウントルール（区分AとBの和集合）:
 *   A. 定期活動BOT: is_active=true かつ非スレッド固定（bot_profile_key NOT IN ('tutorial','aori')）
 *   B. スレッド固定BOT: is_active=true かつ bot_profile_key IN ('tutorial','aori')
 *      かつ書き込み先スレッドが is_dormant=false
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §1.3
 *
 * @returns 生存BOT数
 */
export async function countLivingBots(): Promise<number> {
	// 区分A: 定期活動BOT
	const { count: countA, error: errorA } = await supabaseAdmin
		.from("bots")
		.select("*", { count: "exact", head: true })
		.eq("is_active", true)
		.or("bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori)");

	if (errorA) {
		throw new Error(
			`BotRepository.countLivingBots (category A) failed: ${errorA.message}`,
		);
	}

	// 区分B: スレッド固定BOTのうちアクティブスレッドにいるもの
	// 2クエリに分離し、PostgREST の many-to-one FK 戻り値の型不安定性を回避する。
	// クエリ1: スレッド固定BOTのIDとbot_postsのpost_idを取得
	const { data: threadFixedBots, error: errorB1 } = await supabaseAdmin
		.from("bots")
		.select("id, bot_posts(post_id)")
		.eq("is_active", true)
		.in("bot_profile_key", ["tutorial", "aori"]);

	if (errorB1) {
		throw new Error(
			`BotRepository.countLivingBots (category B query 1) failed: ${errorB1.message}`,
		);
	}

	const bots = (threadFixedBots ?? []) as ThreadFixedBotRow[];
	if (bots.length === 0) {
		return countA ?? 0;
	}

	// bot_posts から post_id 一覧を抽出（重複除去）
	const allPostIds = [
		...new Set(
			bots.flatMap((bot) => (bot.bot_posts ?? []).map((bp) => bp.post_id)),
		),
	];

	// allPostIds が空の場合は早期リターン（Supabase .in() に空配列を渡すとエラー）
	if (allPostIds.length === 0) {
		return countA ?? 0;
	}

	// クエリ2: post_id → posts → threads の is_dormant を取得
	// posts.threads は many-to-one FK なので単一オブジェクトが返る想定だが、
	// Array.isArray() で安全にハンドリングする。
	const { data: postsData, error: errorB2 } = await supabaseAdmin
		.from("posts")
		.select("id, thread_id, threads(is_dormant)")
		.in("id", allPostIds);

	if (errorB2) {
		throw new Error(
			`BotRepository.countLivingBots (category B query 2) failed: ${errorB2.message}`,
		);
	}

	// post_id → is_dormant のマップを構築
	const postIdToDormant = new Map<string, boolean>();
	for (const post of (postsData ?? []) as PostWithThread[]) {
		const threads = post.threads;
		let isDormant = true; // デフォルト: 不明な場合は休眠扱い（安全側に倒す）
		if (threads != null) {
			// PostgREST many-to-one: 通常は単一オブジェクト、念のため配列にも対応
			if (Array.isArray(threads)) {
				isDormant = threads.length === 0 || threads.every((t) => t.is_dormant);
			} else {
				isDormant = threads.is_dormant;
			}
		}
		postIdToDormant.set(post.id, isDormant);
	}

	// 各BOTについて、書き込み先スレッドに is_dormant=false が1つ以上あればカウントする
	let countB = 0;
	for (const bot of bots) {
		const hasActiveThread = (bot.bot_posts ?? []).some((bp) => {
			const isDormant = postIdToDormant.get(bp.post_id);
			return isDormant === false;
		});
		if (hasActiveThread) {
			countB++;
		}
	}

	return (countA ?? 0) + countB;
}

/**
 * スレッド内の生存BOT数をカウントする。
 *
 * 当該スレッドに1件以上の書き込み（bot_posts経由）を持ち、
 * かつ is_active=true のBOTの数（DISTINCT bot_id）。
 *
 * 3クエリ構成:
 *   1. posts テーブルから当該スレッドの post_id 一覧を取得
 *   2. bot_posts テーブルから該当 post_id の bot_id を取得（DISTINCT）
 *   3. bots テーブルで is_active=true のBOTをカウント
 *
 * See: features/command_livingbot.feature @スレッド内にBOTの書き込みがない場合は0体と表示される
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §6.3
 *
 * @param threadId スレッドID
 * @returns スレッド内の生存BOT数
 */
export async function countLivingBotsInThread(
	threadId: string,
): Promise<number> {
	// Step 1: 当該スレッドの post_id 一覧を取得
	const { data: posts, error: postsError } = await supabaseAdmin
		.from("posts")
		.select("id")
		.eq("thread_id", threadId);

	if (postsError) {
		throw new Error(
			`BotRepository.countLivingBotsInThread (posts) failed: ${postsError.message}`,
		);
	}

	const postIds = (posts ?? []).map((p: { id: string }) => p.id);
	// 空配列で .in() を呼ぶと PostgREST エラーになるため早期リターン
	if (postIds.length === 0) return 0;

	// Step 2: bot_posts から該当 post_id の bot_id を取得（DISTINCT）
	const { data: botPosts, error: bpError } = await supabaseAdmin
		.from("bot_posts")
		.select("bot_id")
		.in("post_id", postIds);

	if (bpError) {
		throw new Error(
			`BotRepository.countLivingBotsInThread (bot_posts) failed: ${bpError.message}`,
		);
	}

	const uniqueBotIds = [
		...new Set((botPosts ?? []).map((bp: { bot_id: string }) => bp.bot_id)),
	];
	// 空配列で .in() を呼ぶと PostgREST エラーになるため早期リターン
	if (uniqueBotIds.length === 0) return 0;

	// Step 3: is_active=true のBOTをカウント
	const { count, error: countError } = await supabaseAdmin
		.from("bots")
		.select("*", { count: "exact", head: true })
		.in("id", uniqueBotIds)
		.eq("is_active", true);

	if (countError) {
		throw new Error(
			`BotRepository.countLivingBotsInThread (bots) failed: ${countError.message}`,
		);
	}

	return count ?? 0;
}

/**
 * 撃破済みチュートリアルBOT および古い未撃破チュートリアルBOTを削除する。
 * daily-maintenance（performDailyReset 末尾）で呼び出す。
 *
 * 削除対象:
 *   - 撃破済みチュートリアルBOT: bot_profile_key = 'tutorial' AND is_active = false
 *   - 7日経過の未撃破チュートリアルBOT: bot_profile_key = 'tutorial' AND created_at < NOW() - INTERVAL '7 days'
 *
 * See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.8 撃破済みチュートリアルBOTクリーンアップ
 *
 * @returns 削除したボット数
 */
export async function deleteEliminatedTutorialBots(): Promise<number> {
	// 撃破済みチュートリアルBOTを削除（is_active = false）
	const { data: eliminated, error: eliminatedError } = await supabaseAdmin
		.from("bots")
		.delete()
		.eq("bot_profile_key", "tutorial")
		.eq("is_active", false)
		.select("id");

	if (eliminatedError) {
		throw new Error(
			`BotRepository.deleteEliminatedTutorialBots (eliminated) failed: ${eliminatedError.message}`,
		);
	}

	const eliminatedCount = ((eliminated as { id: string }[]) ?? []).length;

	// 7日経過の未撃破チュートリアルBOTを削除
	const sevenDaysAgo = new Date(
		Date.now() - 7 * 24 * 60 * 60 * 1000,
	).toISOString();
	const { data: stale, error: staleError } = await supabaseAdmin
		.from("bots")
		.delete()
		.eq("bot_profile_key", "tutorial")
		.lt("created_at", sevenDaysAgo)
		.select("id");

	if (staleError) {
		throw new Error(
			`BotRepository.deleteEliminatedTutorialBots (stale) failed: ${staleError.message}`,
		);
	}

	const staleCount = ((stale as { id: string }[]) ?? []).length;

	return eliminatedCount + staleCount;
}
