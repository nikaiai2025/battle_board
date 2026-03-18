/**
 * 旧スレッドURL `/threads/{UUID}` — 新URLへのリダイレクト（Server Component）
 *
 * UUID 形式の旧スレッドURL `/threads/{threadId}` を
 * 板パス付き新URL `/{boardId}/{threadKey}/` にリダイレクトする。
 *
 * 処理フロー:
 *   1. PostService.getThread(threadId) でスレッドを取得
 *   2. スレッドが存在しない場合は notFound()（404）
 *   3. redirect(`/{boardId}/{threadKey}/`) で 307 リダイレクト
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.3 旧URL /threads/{UUID} のリダイレクト実装
 * See: tmp/workers/bdd-architect_TASK-162/design.md §7.2 旧URLリダイレクト
 */

import { notFound, redirect } from "next/navigation";
import * as PostService from "@/lib/services/post-service";

interface ThreadPageProps {
	params: Promise<{ threadId: string }>;
}

/**
 * 旧スレッドURL リダイレクトページ（Server Component）
 *
 * UUID でスレッドを取得し、`/{boardId}/{threadKey}/` へリダイレクトする。
 * スレッドが存在しない場合は 404 を返す。
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.3
 */
export default async function ThreadRedirectPage({ params }: ThreadPageProps) {
	const { threadId } = await params;

	// UUID でスレッドを取得する
	// See: tmp/workers/bdd-architect_TASK-162/design.md §7.2
	const thread = await PostService.getThread(threadId);

	// スレッドが存在しない場合は 404
	if (!thread) {
		notFound();
	}

	// 新URL `/{boardId}/{threadKey}/` へリダイレクト
	redirect(`/${thread.boardId}/${thread.threadKey}/`);
}
