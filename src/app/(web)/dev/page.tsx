/**
 * 開発連絡板ページ — /dev/（Server Component, SSR）
 *
 * BattleBoard メイン板と同一のコンポーネント群を再利用し、
 * boardId="dev" でスレッド一覧・スレッド作成フォームを表示する薄いラッパー。
 *
 * See: features/thread.feature @url_structure
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §3-b
 */

import * as PostService from "@/lib/services/post-service";
import ThreadCreateForm from "../_components/ThreadCreateForm";
import ThreadList from "../_components/ThreadList";
import type { ThreadSummary } from "../_components/thread-types";

// リクエストごとにSSRを実行し、Vercelのページキャッシュを無効化する。
// See: docs/architecture/architecture.md §13 TDR-006
export const dynamic = "force-dynamic";

// ThreadView は ThreadSummary に統合。
// See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.1

/**
 * dev 板のスレッド一覧をサービス層から直接取得する。
 *
 * See: features/thread.feature @url_structure
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §3-b
 */
async function fetchDevThreads(): Promise<ThreadSummary[]> {
	try {
		const threads = await PostService.getThreadList("dev");
		return threads.map((t) => ({
			id: t.id,
			title: t.title,
			postCount: t.postCount,
			lastPostAt:
				t.lastPostAt instanceof Date
					? t.lastPostAt.toISOString()
					: String(t.lastPostAt),
			threadKey: t.threadKey,
			boardId: t.boardId,
		}));
	} catch (err) {
		console.error("[fetchDevThreads] Exception:", err);
		return [];
	}
}

/**
 * 開発連絡板ページ（Server Component）
 *
 * See: features/thread.feature @url_structure
 * See: tmp/feature_plan_pinned_thread_and_dev_board.md §3-b
 */
export default async function DevBoardPage() {
	const threads = await fetchDevThreads();

	return (
		<main className="max-w-4xl mx-auto px-4 py-4">
			{/* ページタイトル */}
			<h1 className="text-base font-bold text-gray-700 border-b border-gray-400 pb-1 mb-3">
				開発連絡板
			</h1>

			{/* thread-create-form: スレッド作成フォーム（boardId="dev" を渡す）
          See: tmp/feature_plan_pinned_thread_and_dev_board.md §3-d */}
			<ThreadCreateForm boardId="dev" />

			{/* auth-prompt: 未認証ユーザーへの認証案内 */}
			<p id="auth-prompt" className="text-xs text-gray-500 mb-3">
				書き込みするには認証が必要です（送信時に認証画面が表示されます）
			</p>

			{/* thread-list: スレッド一覧
			    ThreadList → ThreadCard に boardId/threadKey を伝播し、
			    リンク先を /dev/{threadKey}/ 形式で生成する。
			    See: features/thread.feature @url_structure
			*/}
			<ThreadList threads={threads} />
		</main>
	);
}
