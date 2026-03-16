/**
 * AttackRepository — attacks テーブルへの CRUD 操作
 *
 * attacks テーブルは同一ユーザー同一ボット1日1回攻撃制限の管理テーブル。
 * RLS により anon/authenticated ロールからの全操作を拒否している。
 * service_role キーを持つ supabaseAdmin を使用して RLS をバイパスする。
 *
 * See: docs/architecture/components/bot.md §5.2 attacks テーブル（新規）
 * See: docs/architecture/components/attack.md §2.2 コマンド設定
 * See: docs/specs/bot_state_transitions.yaml #attack_limits
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// ドメインモデル型
// ---------------------------------------------------------------------------

/**
 * 攻撃記録エンティティ。
 * 同一ユーザーが同一ボットに同日2回以上攻撃することを防ぐための制限管理に使用する。
 * See: features/未実装/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
 */
export interface Attack {
	/** 内部識別子 (UUID) */
	id: string;
	/** 攻撃者の user_id */
	attackerId: string;
	/** 攻撃対象ボットの bot_id */
	botId: string;
	/** 攻撃実施日（JST, YYYY-MM-DD） */
	attackDate: string;
	/** 攻撃が含まれたレスの post_id */
	postId: string;
	/** 与ダメージ */
	damage: number;
	/** 攻撃日時 */
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** attacks テーブルの生レコード型 */
interface AttackRow {
	id: string;
	attacker_id: string;
	bot_id: string;
	attack_date: string;
	post_id: string;
	damage: number;
	created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメインモデル 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToAttack(row: AttackRow): Attack {
	return {
		id: row.id,
		attackerId: row.attacker_id,
		botId: row.bot_id,
		attackDate: row.attack_date,
		postId: row.post_id,
		damage: row.damage,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 攻撃記録を作成する。
 * !attack コマンド実行時に BotService.recordAttack() 経由で呼ばれる。
 * (attacker_id, bot_id, attack_date) UNIQUE 制約により同日2回目の攻撃は DB レベルで拒否される。
 *
 * See: docs/architecture/components/bot.md §2.9 攻撃記録
 * See: features/未実装/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
 *
 * @param attack 攻撃記録データ（id, createdAt を除く）
 * @returns 作成された攻撃記録
 */
export async function create(
	attack: Omit<Attack, "id" | "createdAt">,
): Promise<Attack> {
	const { data, error } = await supabaseAdmin
		.from("attacks")
		.insert({
			attacker_id: attack.attackerId,
			bot_id: attack.botId,
			attack_date: attack.attackDate,
			post_id: attack.postId,
			damage: attack.damage,
		})
		.select()
		.single();

	if (error) {
		throw new Error(`AttackRepository.create failed: ${error.message}`);
	}

	return rowToAttack(data as AttackRow);
}

/**
 * 指定した攻撃者・ボット・日付の攻撃記録を取得する。
 * 1日1回攻撃制限のチェックに使用する。
 *
 * See: docs/architecture/components/bot.md §2.8 攻撃制限チェック
 * See: features/未実装/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
 *
 * @param attackerId 攻撃者の user_id
 * @param botId 攻撃対象ボットの bot_id
 * @param attackDate 攻撃実施日（YYYY-MM-DD）
 * @returns 攻撃記録が存在する場合は Attack、存在しない場合は null
 */
export async function findByAttackerAndBotAndDate(
	attackerId: string,
	botId: string,
	attackDate: string,
): Promise<Attack | null> {
	const { data, error } = await supabaseAdmin
		.from("attacks")
		.select("*")
		.eq("attacker_id", attackerId)
		.eq("bot_id", botId)
		.eq("attack_date", attackDate)
		.single();

	if (error) {
		// PGRST116: 行が見つからない（当日未攻撃）
		if (error.code === "PGRST116") {
			return null;
		}
		throw new Error(
			`AttackRepository.findByAttackerAndBotAndDate failed: ${error.message}`,
		);
	}

	return data ? rowToAttack(data as AttackRow) : null;
}

/**
 * 指定日より古い攻撃記録を全件削除する。
 * 日次リセット処理で前日以前の攻撃記録をクリーンアップするために使用する。
 *
 * See: docs/architecture/components/bot.md §2.10 日次リセット処理（step 5）
 * See: docs/specs/bot_state_transitions.yaml #daily_reset > attacks テーブル
 * See: features/未実装/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
 *
 * @param beforeDate この日付より前の記録を削除する（YYYY-MM-DD）
 * @returns 削除した件数
 */
export async function deleteByDateBefore(beforeDate: string): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from("attacks")
		.delete()
		.lt("attack_date", beforeDate)
		.select("id");

	if (error) {
		throw new Error(
			`AttackRepository.deleteByDateBefore failed: ${error.message}`,
		);
	}

	return ((data ?? []) as { id: string }[]).length;
}
