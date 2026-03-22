/**
 * PendingAsyncCommandRepository
 * -- pending_async_commands テーブルの CRUD
 *
 * 非同期コマンド副作用のキューイングテーブルに対する操作を提供する。
 * AoriHandler（同期フェーズ: INSERT）と BotService.processAoriCommands（非同期フェーズ: 読取・削除）から使用される。
 *
 * See: features/command_aori.feature
 * See: docs/architecture/components/command.md SS5 非同期副作用のキューイングパターン
 * See: supabase/migrations/00023_pending_async_commands.sql
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** pending_async_commands テーブルの DB レコード（snake_case） */
interface PendingAsyncCommandRow {
	id: string;
	command_type: string;
	thread_id: string;
	target_post_number: number;
	invoker_user_id: string;
	payload: Record<string, unknown> | null;
	created_at: string;
}

/** PendingAsyncCommand ドメインモデル（camelCase） */
export interface PendingAsyncCommand {
	id: string;
	commandType: string;
	threadId: string;
	targetPostNumber: number;
	invokerUserId: string;
	payload: Record<string, unknown> | null;
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToModel(row: PendingAsyncCommandRow): PendingAsyncCommand {
	return {
		id: row.id,
		commandType: row.command_type,
		threadId: row.thread_id,
		targetPostNumber: row.target_post_number,
		invokerUserId: row.invoker_user_id,
		payload: row.payload,
		createdAt: new Date(row.created_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * エントリを追加する。AoriHandler から呼び出される。
 *
 * See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
 */
export async function create(params: {
	commandType: string;
	threadId: string;
	targetPostNumber: number;
	invokerUserId: string;
	payload?: Record<string, unknown> | null;
}): Promise<void> {
	const { error } = await supabaseAdmin.from("pending_async_commands").insert({
		command_type: params.commandType,
		thread_id: params.threadId,
		target_post_number: params.targetPostNumber,
		invoker_user_id: params.invokerUserId,
		payload: params.payload ?? null,
	});
	if (error) {
		throw new Error(
			`PendingAsyncCommandRepository.create failed: ${error.message}`,
		);
	}
}

/**
 * 指定 command_type のエントリを全件取得する（created_at ASC）。
 * BotService.processAoriCommands から呼び出される。
 *
 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
 */
export async function findByCommandType(
	commandType: string,
): Promise<PendingAsyncCommand[]> {
	const { data, error } = await supabaseAdmin
		.from("pending_async_commands")
		.select("*")
		.eq("command_type", commandType)
		.order("created_at", { ascending: true });
	if (error) {
		throw new Error(
			`PendingAsyncCommandRepository.findByCommandType failed: ${error.message}`,
		);
	}
	return (data as PendingAsyncCommandRow[]).map(rowToModel);
}

/**
 * 指定 ID のエントリを削除する。Cron 処理完了後に呼び出す。
 *
 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
 */
export async function deletePendingAsyncCommand(id: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("pending_async_commands")
		.delete()
		.eq("id", id);
	if (error) {
		throw new Error(
			`PendingAsyncCommandRepository.delete failed: ${error.message}`,
		);
	}
}
