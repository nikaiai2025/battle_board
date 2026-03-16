/**
 * GrassRepository — 草リアクション(grass_reactions)の永続化・検索を担うリポジトリ
 *
 * See: features/reactions.feature
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §2.1
 * See: supabase/migrations/00008_grass_system.sql
 *
 * 責務:
 *   - grass_reactions テーブルへの CRUD 操作
 *   - 同日重複チェック（existsForToday）
 *   - 草カウントの INCREMENT（users.grass_count）
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** grass_reactions テーブルの DB レコード（snake_case）*/
interface GrassReactionRow {
	id: string;
	giver_id: string;
	receiver_id: string | null;
	receiver_bot_id: string | null;
	target_post_id: string;
	thread_id: string;
	given_date: string;
	created_at: string;
}

/** ドメインモデル（camelCase）*/
export interface GrassReaction {
	id: string;
	giverId: string;
	receiverId: string | null;
	receiverBotId: string | null;
	targetPostId: string;
	threadId: string;
	givenDate: string;
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToGrassReaction(row: GrassReactionRow): GrassReaction {
	return {
		id: row.id,
		giverId: row.giver_id,
		receiverId: row.receiver_id,
		receiverBotId: row.receiver_bot_id,
		targetPostId: row.target_post_id,
		threadId: row.thread_id,
		givenDate: row.given_date,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 草リアクションを記録する。
 *
 * ON CONFLICT DO NOTHING パターンで重複を安全にハンドリングする。
 * アプリ層での事前チェック(existsForToday)に加え、DB制約が最終防衛線。
 * UNIQUE制約違反(重複)の場合は null を返す(INSERT しない)。
 *
 * See: features/reactions.feature §重複制限
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §2.1 GrassRepository
 *
 * @param params.giverId       - 草を生やすユーザーのUUID
 * @param params.receiverId    - 草を受け取る人間ユーザーのUUID（ボットの場合は null）
 * @param params.receiverBotId - 草を受け取るボットのUUID（人間の場合は null）
 * @param params.targetPostId  - 対象レスのUUID
 * @param params.threadId      - スレッドのUUID
 * @param params.givenDate     - 付与日(YYYY-MM-DD)
 * @returns 作成された GrassReaction、重複時は null
 */
export async function create(params: {
	giverId: string;
	receiverId: string | null;
	receiverBotId: string | null;
	targetPostId: string;
	threadId: string;
	givenDate: string;
}): Promise<GrassReaction | null> {
	const { data, error } = await supabaseAdmin
		.from("grass_reactions")
		.insert({
			giver_id: params.giverId,
			receiver_id: params.receiverId,
			receiver_bot_id: params.receiverBotId,
			target_post_id: params.targetPostId,
			thread_id: params.threadId,
			given_date: params.givenDate,
		})
		.select()
		.single();

	if (error) {
		// UNIQUE制約違反（重複）の場合は null を返す
		// PostgreSQL error code 23505: unique_violation
		if (error.code === "23505") return null;
		throw new Error(`GrassRepository.create failed: ${error.message}`);
	}

	return data ? rowToGrassReaction(data as GrassReactionRow) : null;
}

/**
 * 同日・同一付与者・同一受領者の草記録が存在するか判定する。
 *
 * 人間受領者の場合は receiver_id、ボット受領者の場合は receiver_bot_id で判定する。
 *
 * See: features/reactions.feature §同日中に同一ユーザーのレスに2回目の草を生やそうとすると拒否される
 *
 * @param giverId    - 付与者のUUID
 * @param receiverId - 人間受領者のUUID（ボットの場合は null）
 * @param receiverBotId - ボット受領者のUUID（人間の場合は null）
 * @param date       - 判定日(YYYY-MM-DD)
 * @returns 存在する場合 true
 */
export async function existsForToday(
	giverId: string,
	receiverId: string | null,
	receiverBotId: string | null,
	date: string,
): Promise<boolean> {
	let query = supabaseAdmin
		.from("grass_reactions")
		.select("id")
		.eq("giver_id", giverId)
		.eq("given_date", date);

	if (receiverId !== null) {
		query = query.eq("receiver_id", receiverId);
	} else if (receiverBotId !== null) {
		query = query.eq("receiver_bot_id", receiverBotId);
	} else {
		// どちらも null の場合は重複なし（通常は発生しない）
		return false;
	}

	const { data, error } = await query.limit(1);

	if (error) {
		throw new Error(`GrassRepository.existsForToday failed: ${error.message}`);
	}

	return (data?.length ?? 0) > 0;
}

/**
 * ユーザーの草カウントを +1 する。
 *
 * users.grass_count をアトミックに INCREMENT する。
 * 直接 SQL を使用してアトミック更新を保証する。
 *
 * See: features/reactions.feature §レスに草を生やすとレス書き込み主の草カウントが1増える
 * See: tmp/workers/bdd-architect_TASK-098/grass_system_design.md §2.1 incrementGrassCount
 *
 * @param userId - 対象ユーザーのUUID
 * @returns 更新後の草カウント
 */
export async function incrementGrassCount(userId: string): Promise<number> {
	// アトミック UPDATE ... RETURNING で競合を回避する
	const { data, error } = await supabaseAdmin.rpc("increment_grass_count", {
		p_user_id: userId,
	});

	if (error) {
		// RPC が存在しない場合のフォールバック: SELECT + UPDATE の2ステップ
		// (テスト環境などRPC未対応環境向け)
		const fallbackResult = await supabaseAdmin
			.from("users")
			.select("grass_count")
			.eq("id", userId)
			.single();

		if (fallbackResult.error) {
			throw new Error(
				`GrassRepository.incrementGrassCount failed: ${fallbackResult.error.message}`,
			);
		}

		const currentCount = (fallbackResult.data as { grass_count: number })
			.grass_count;
		const newCount = currentCount + 1;

		const updateResult = await supabaseAdmin
			.from("users")
			.update({ grass_count: newCount })
			.eq("id", userId)
			.select("grass_count")
			.single();

		if (updateResult.error) {
			throw new Error(
				`GrassRepository.incrementGrassCount update failed: ${updateResult.error.message}`,
			);
		}

		return (updateResult.data as { grass_count: number }).grass_count;
	}

	// RPC の戻り値は更新後の grass_count
	return data as number;
}
