/**
 * PendingTutorialRepository — チュートリアルBOTスポーン待ちキューのリポジトリ
 *
 * pending_tutorials テーブルに対する CRUD 操作を提供する。
 * チュートリアルBOT（Phase C）のスポーン処理（Cloudflare Cron）が
 * このテーブルを読み取り、BOTをスポーンして書き込みを行う。
 *
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.1 DB設計: pending_tutorials テーブル
 * See: supabase/migrations/00021_welcome_sequence.sql
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** pending_tutorials テーブルの DB レコード（snake_case）*/
interface PendingTutorialRow {
	id: string;
	user_id: string;
	thread_id: string;
	trigger_post_number: number;
	created_at: string;
}

/** PendingTutorial ドメインモデル（camelCase）*/
export interface PendingTutorial {
	id: string;
	userId: string;
	threadId: string;
	triggerPostNumber: number;
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToPendingTutorial(row: PendingTutorialRow): PendingTutorial {
	return {
		id: row.id,
		userId: row.user_id,
		threadId: row.thread_id,
		triggerPostNumber: row.trigger_post_number,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * チュートリアルBOTスポーン待ちキューにエントリを追加する。
 * PostService.createPost 内の Step 6.5（初回書き込み検出）から呼び出される。
 *
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §2.1 Step 6.5
 *
 * @param params.userId - 初回書き込みを行ったユーザーの UUID
 * @param params.threadId - 書き込みが行われたスレッドの UUID
 * @param params.triggerPostNumber - 初回書き込みのレス番号（チュートリアルBOTがアンカーに使用）
 */
export async function create(params: {
	userId: string;
	threadId: string;
	triggerPostNumber: number;
}): Promise<void> {
	const { error } = await supabaseAdmin.from("pending_tutorials").insert({
		user_id: params.userId,
		thread_id: params.threadId,
		trigger_post_number: params.triggerPostNumber,
	});

	if (error) {
		throw new Error(
			`PendingTutorialRepository.create failed: ${error.message}`,
		);
	}
}

/**
 * 全てのチュートリアルBOTスポーン待ちエントリを取得する。
 * Cloudflare Cron のスポーン処理（Phase C）から呼び出される。
 * created_at ASC でソートして古いものから処理する。
 *
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.1
 *
 * @returns PendingTutorial 配列（created_at ASC ソート済み）
 */
export async function findAll(): Promise<PendingTutorial[]> {
	const { data, error } = await supabaseAdmin
		.from("pending_tutorials")
		.select("*")
		.order("created_at", { ascending: true });

	if (error) {
		throw new Error(
			`PendingTutorialRepository.findAll failed: ${error.message}`,
		);
	}

	return (data as PendingTutorialRow[]).map(rowToPendingTutorial);
}

/**
 * 指定 ID のチュートリアルBOTスポーン待ちエントリを削除する。
 * スポーン処理完了後（BOT書き込み成功後）に呼び出す。
 *
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: tmp/workers/bdd-architect_TASK-236/design.md §3.1
 *
 * @param id - 削除対象の pending_tutorials レコードの UUID
 */
export async function deletePendingTutorial(id: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("pending_tutorials")
		.delete()
		.eq("id", id);

	if (error) {
		throw new Error(
			`PendingTutorialRepository.delete failed: ${error.message}`,
		);
	}
}
