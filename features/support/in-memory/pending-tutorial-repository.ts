/**
 * インメモリ PendingTutorialRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * pending-tutorial-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: src/lib/infrastructure/repositories/pending-tutorial-repository.ts
 */

import type { PendingTutorial } from "../../../src/lib/infrastructure/repositories/pending-tutorial-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる pending_tutorials ストア */
const store: PendingTutorial[] = [];

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
}

/**
 * テスト用ヘルパー: エントリを直接ストアに追加する。
 * ステップ定義から初期データを投入するために使用する。
 */
export function _insert(entry: PendingTutorial): void {
	store.push({ ...entry });
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * チュートリアルBOTスポーン待ちキューにエントリを追加する。
 * PostService.createPost 内の Step 6.5（初回書き込み検出）から呼び出される。
 *
 * See: src/lib/infrastructure/repositories/pending-tutorial-repository.ts > create
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 */
export async function create(params: {
	userId: string;
	threadId: string;
	triggerPostNumber: number;
}): Promise<void> {
	store.push({
		id: crypto.randomUUID(),
		userId: params.userId,
		threadId: params.threadId,
		triggerPostNumber: params.triggerPostNumber,
		createdAt: new Date(Date.now()),
	});
}

/**
 * 全てのチュートリアルBOTスポーン待ちエントリを取得する（created_at ASC）。
 * Cloudflare Cron のスポーン処理（Phase C）から呼び出される。
 *
 * See: src/lib/infrastructure/repositories/pending-tutorial-repository.ts > findAll
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 */
export async function findAll(): Promise<PendingTutorial[]> {
	return [...store].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
}

/**
 * 指定 ID のチュートリアルBOTスポーン待ちエントリを削除する。
 * スポーン処理完了後に呼び出す。
 *
 * See: src/lib/infrastructure/repositories/pending-tutorial-repository.ts > deletePendingTutorial
 * See: features/welcome.feature @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
 */
export async function deletePendingTutorial(id: string): Promise<void> {
	const idx = store.findIndex((e) => e.id === id);
	if (idx !== -1) {
		store.splice(idx, 1);
	}
}
