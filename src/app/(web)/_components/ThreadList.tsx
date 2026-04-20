/**
 * ThreadList — トップページのスレッド一覧コンポーネント（Server Component）
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
import ThreadTitleRow from "./ThreadTitleRow";
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
				className="rounded border border-border bg-muted/45 px-4 py-8 text-center text-sm text-muted-foreground"
				id="thread-list-empty"
			>
				スレッドがありません
			</div>
		);
	}

	const featuredThreads = threads.slice(0, 20);
	const foldedThreads = threads.slice(20);

	return (
		<section id="thread-list">
			<div className="space-y-5">
				<section
					aria-labelledby="thread-title-list-heading"
					className="rounded border border-border/80 bg-muted/45 px-3 py-3"
				>
					<div className="mb-1 flex items-baseline justify-between gap-3">
						<h2
							id="thread-title-list-heading"
							className="text-sm font-semibold text-foreground"
						>
							スレッド一覧
						</h2>
						<span className="text-[11px] text-muted-foreground">
							上位20件を表示
						</span>
					</div>
					<ul className="list-none p-0 m-0">
						{featuredThreads.map((thread) => (
							<ThreadTitleRow
								key={thread.id}
								title={thread.title}
								postCount={thread.postCount}
								createdAt={thread.createdAt}
								lastPostAt={thread.lastPostAt}
								boardId={thread.boardId}
								threadKey={thread.threadKey}
							/>
						))}
					</ul>
					{foldedThreads.length > 0 && (
						<details className="mt-1" id="thread-title-list-more">
							<summary className="cursor-pointer text-[13px] text-blue-700 hover:underline dark:text-blue-400">
								更に表示
							</summary>
							<ul className="mt-1 list-none p-0 m-0">
								{foldedThreads.map((thread) => (
									<ThreadTitleRow
										key={thread.id}
										title={thread.title}
										postCount={thread.postCount}
										createdAt={thread.createdAt}
										lastPostAt={thread.lastPostAt}
										boardId={thread.boardId}
										threadKey={thread.threadKey}
									/>
								))}
							</ul>
						</details>
					)}
				</section>

				<section
					aria-labelledby="thread-preview-list-heading"
					className="rounded border border-border/80 bg-muted/35 px-3 py-3"
				>
					<div className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-1">
						<h2
							id="thread-preview-list-heading"
							className="text-sm font-semibold text-foreground"
						>
							ヘッドライン
						</h2>
						<span className="text-[11px] text-muted-foreground">
							上位20件を表示
						</span>
					</div>
					<ul className="list-none p-0 m-0 space-y-4">
						{featuredThreads.map((thread) => (
							<ThreadCard
								key={thread.id}
								threadId={thread.id}
								title={thread.title}
								postCount={thread.postCount}
								createdAt={thread.createdAt}
								lastPostAt={thread.lastPostAt}
								boardId={thread.boardId}
								threadKey={thread.threadKey}
								previewPosts={thread.previewPosts}
							/>
						))}
					</ul>
					{foldedThreads.length > 0 && (
						<details className="mt-2" id="thread-preview-list-more">
							<summary className="cursor-pointer text-[13px] text-blue-700 hover:underline dark:text-blue-400">
								更に表示
							</summary>
							<ul className="mt-3 list-none p-0 m-0 space-y-4">
								{foldedThreads.map((thread) => (
									<ThreadCard
										key={thread.id}
										threadId={thread.id}
										title={thread.title}
										postCount={thread.postCount}
										createdAt={thread.createdAt}
										lastPostAt={thread.lastPostAt}
										boardId={thread.boardId}
										threadKey={thread.threadKey}
										previewPosts={thread.previewPosts}
									/>
								))}
							</ul>
						</details>
					)}
				</section>
			</div>
		</section>
	);
}
