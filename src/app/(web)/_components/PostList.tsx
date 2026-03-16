/**
 * PostList — 初期レス一覧（Server Component）
 *
 * SSRで取得した初期レスデータを post_number ASC 順に表示する。
 * ポーリングによる新着レス表示は PostListLiveWrapper が担う。
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 * See: docs/specs/screens/thread-view.yaml > post-list
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
 * 初期レス一覧（Server Component）
 *
 * See: docs/specs/screens/thread-view.yaml > post-list
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 */
export default function PostList({ posts }: PostListProps) {
  if (posts.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-4">
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
