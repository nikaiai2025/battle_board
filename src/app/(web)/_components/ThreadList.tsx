/**
 * ThreadList — スレッド一覧コンポーネント（Server Component）
 *
 * スレッドデータを受け取り、ThreadCard のリストとしてレンダリングする。
 * スレッドが0件の場合は「スレッドがありません」メッセージを表示。
 *
 * See: features/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 * See: features/thread.feature @スレッドが0件の場合はメッセージが表示される
 * See: features/thread.feature @url_structure
 * See: docs/specs/screens/thread-list.yaml > elements > thread-list
 */

import ThreadCard from "./ThreadCard";
import type { ThreadSummary } from "./thread-types";

// ローカル Thread 型は ThreadSummary に統合。
// See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.1

interface ThreadListProps {
	threads: ThreadSummary[];
}

/**
 * スレッド一覧コンポーネント（Server Component）
 *
 * See: features/thread.feature @url_structure
 * See: docs/architecture/components/web-ui.md §3.1 スレッド一覧ページ
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > thread-list
 */
export default function ThreadList({ threads }: ThreadListProps) {
	// スレッドが0件の場合は空メッセージを表示
	if (threads.length === 0) {
		return (
			<div
				className="text-muted-foreground text-sm text-center py-8"
				id="thread-list-empty"
			>
				スレッドがありません
			</div>
		);
	}

	return (
		<section id="thread-list">
			<ul className="list-none p-0 m-0">
				{threads.map((thread) => (
					<ThreadCard
						key={thread.id}
						id={thread.id}
						title={thread.title}
						postCount={thread.postCount}
						lastPostAt={thread.lastPostAt}
						boardId={thread.boardId}
						threadKey={thread.threadKey}
					/>
				))}
			</ul>
		</section>
	);
}
