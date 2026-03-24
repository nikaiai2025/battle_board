"use client";

/**
 * PostList — 初期レス一覧（Client Component）
 *
 * SSRで取得した初期レスデータを post_number ASC 順に表示する。
 * ポーリングによる新着レス表示は PostListLiveWrapper が担う。
 *
 * PostItem が PostFormContext を消費するため、PostList も Client Component に変更。
 * SSRの初期レスデータは Server Component（page.tsx）からpropsで受け取るため
 * SSRのメリットは維持される。
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 * See: docs/specs/screens/thread-view.yaml > post-list
 * See: tmp/workers/bdd-architect_TASK-162/design.md §6.2
 */

import PostItem, { type Post } from "./PostItem";

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

interface PostListProps {
	/** 初期レス一覧（SSRで取得済み）。post_number ASC 順に並んでいることを前提とする */
	posts: Post[];
}

/**
 * 初期レス一覧（Client Component）
 *
 * See: docs/specs/screens/thread-view.yaml > post-list
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 * See: features/thread.feature @post_number_display
 */
export default function PostList({ posts }: PostListProps) {
	if (posts.length === 0) {
		return (
			<p className="text-muted-foreground text-sm py-4">
				まだレスがありません。
			</p>
		);
	}

	return (
		<section aria-label="レス一覧" id="post-list">
			{posts.map((post) => (
				<PostItem key={post.id} post={post} />
			))}
		</section>
	);
}
