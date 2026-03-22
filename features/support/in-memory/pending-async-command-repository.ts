/**
 * インメモリ PendingAsyncCommandRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * pending-async-command-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/command_aori.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: src/lib/infrastructure/repositories/pending-async-command-repository.ts
 */

import type { PendingAsyncCommand } from "../../../src/lib/infrastructure/repositories/pending-async-command-repository";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる pending_async_commands ストア */
const store: PendingAsyncCommand[] = [];

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
}

/**
 * テスト用ヘルパー: ストアの全エントリを返す。
 */
export function _getAll(): PendingAsyncCommand[] {
	return [...store];
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * エントリを追加する。AoriHandler から呼び出される。
 *
 * See: src/lib/infrastructure/repositories/pending-async-command-repository.ts > create
 * See: features/command_aori.feature @コマンド文字列と引数が投稿本文から除去される
 */
export async function create(params: {
	commandType: string;
	threadId: string;
	targetPostNumber: number;
	invokerUserId: string;
	payload?: Record<string, unknown> | null;
}): Promise<void> {
	assertUUID(params.threadId);
	assertUUID(params.invokerUserId);
	store.push({
		id: crypto.randomUUID(),
		commandType: params.commandType,
		threadId: params.threadId,
		targetPostNumber: params.targetPostNumber,
		invokerUserId: params.invokerUserId,
		payload: params.payload ?? null,
		createdAt: new Date(Date.now()),
	});
}

/**
 * 指定 command_type のエントリを全件取得する（created_at ASC）。
 * BotService.processAoriCommands から呼び出される。
 *
 * See: src/lib/infrastructure/repositories/pending-async-command-repository.ts > findByCommandType
 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
 */
export async function findByCommandType(
	commandType: string,
): Promise<PendingAsyncCommand[]> {
	return store
		.filter((e) => e.commandType === commandType)
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * 指定 ID のエントリを削除する。Cron 処理完了後に呼び出す。
 *
 * See: src/lib/infrastructure/repositories/pending-async-command-repository.ts > deletePendingAsyncCommand
 * See: features/command_aori.feature @Cron処理で煽りBOTがスポーンし対象レスに煽り文句を投稿する
 */
export async function deletePendingAsyncCommand(id: string): Promise<void> {
	const idx = store.findIndex((e) => e.id === id);
	if (idx !== -1) {
		store.splice(idx, 1);
	}
}
