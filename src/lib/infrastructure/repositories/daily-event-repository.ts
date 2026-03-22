/**
 * DailyEventRepository — daily_events テーブルへの CRUD 操作
 *
 * 1日1回制限のイベント（ラストボットボーナス等）の存在チェックと記録を行う。
 *
 * See: features/command_livingbot.feature
 * See: tmp/workers/bdd-architect_277/livingbot_design.md §3.2
 * See: supabase/migrations/00024_daily_events.sql
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** daily_events テーブルのドメインモデル型 */
export interface DailyEvent {
	id: string;
	eventType: string;
	eventDate: string; // YYYY-MM-DD
	triggeredBy: string;
	createdAt: Date;
}

/** DB レコード型（snake_case） */
interface DailyEventRow {
	id: string;
	event_type: string;
	event_date: string;
	triggered_by: string;
	created_at: string;
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 当日の指定イベントタイプが既に存在するか確認する。
 *
 * See: features/command_livingbot.feature @同日にラストボットボーナスが既に発生済みの場合は再発火しない
 *
 * @param eventType イベントタイプ（例: "last_bot_bonus"）
 * @param dateJst JST日付（YYYY-MM-DD）
 * @returns 存在すれば true
 */
export async function existsForToday(
	eventType: string,
	dateJst: string,
): Promise<boolean> {
	const { data, error } = await supabaseAdmin
		.from("daily_events")
		.select("id")
		.eq("event_type", eventType)
		.eq("event_date", dateJst)
		.maybeSingle();

	if (error) {
		throw new Error(
			`DailyEventRepository.existsForToday failed: ${error.message}`,
		);
	}

	return data !== null;
}

/**
 * イベントレコードを作成する。
 *
 * See: features/command_livingbot.feature @その日最後のBOTを撃破するとラストボットボーナス+100が付与される
 *
 * @param eventType イベントタイプ（例: "last_bot_bonus"）
 * @param dateJst JST日付（YYYY-MM-DD）
 * @param triggeredBy 発火者の user_id
 * @returns 作成されたイベントレコード
 */
export async function create(
	eventType: string,
	dateJst: string,
	triggeredBy: string,
): Promise<DailyEvent> {
	const { data, error } = await supabaseAdmin
		.from("daily_events")
		.insert({
			event_type: eventType,
			event_date: dateJst,
			triggered_by: triggeredBy,
		})
		.select()
		.single();

	if (error) {
		throw new Error(`DailyEventRepository.create failed: ${error.message}`);
	}

	const row = data as DailyEventRow;
	return {
		id: row.id,
		eventType: row.event_type,
		eventDate: row.event_date,
		triggeredBy: row.triggered_by,
		createdAt: new Date(row.created_at),
	};
}
