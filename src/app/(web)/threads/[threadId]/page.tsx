/**
 * スレッド閲覧ページ — /threads/{threadId}（Server Component, SSR）
 *
 * - GET /api/threads/{threadId} でスレッド情報・レス一覧を取得（APIルート経由）
 * - スレッドが存在しない場合は 404 を返す
 * - 初期レスは PostList（Server Component）で SSR レンダリング
 * - 新着レスは PostListLiveWrapper（Client Component）がポーリングで取得
 * - 書き込みフォーム（PostForm: Client Component）を表示
 *
 * See: features/phase1/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/phase1/thread.feature @一覧外のスレッドにURLで直接アクセスできる
 * See: features/phase1/posting.feature @無料ユーザーが書き込みを行う
 * See: docs/specs/screens/thread-view.yaml @SCR-002
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import PostList from "../../_components/PostList";
import PostListLiveWrapper from "../../_components/PostListLiveWrapper";
import PostForm from "../../_components/PostForm";
import { type Post } from "../../_components/PostItem";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Thread {
  id: string;
  threadKey: string;
  title: string;
  postCount: number;
  lastPostAt: string;
  createdAt: string;
}

interface ThreadDetailResponse {
  thread: Thread;
  posts: Post[];
}

// ---------------------------------------------------------------------------
// データ取得
// ---------------------------------------------------------------------------

/**
 * スレッド詳細（スレッド情報＋レス一覧）を API ルート経由で取得する。
 *
 * SSR: Next.js の Server Component から fetch を使用。
 * サービス層を直接 import しないことで、認証ロジックを APIルートに集約する。
 *
 * See: docs/architecture/components/web-ui.md §2 > Server ComponentからAPIルートを呼び出す理由
 * See: docs/specs/openapi.yaml > /api/threads/{threadId} > get
 *
 * @param threadId - スレッドID
 * @returns スレッド情報とレス一覧、スレッドが存在しない場合は null
 */
async function fetchThreadDetail(
  threadId: string
): Promise<ThreadDetailResponse | null> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/threads/${threadId}`, {
      // SSR: キャッシュなし（常に最新データを取得）
      cache: "no-store",
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      console.error(`GET /api/threads/${threadId} failed: ${res.status}`);
      return null;
    }

    return (await res.json()) as ThreadDetailResponse;
  } catch (err) {
    console.error("Failed to fetch thread detail:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

interface ThreadPageProps {
  params: Promise<{ threadId: string }>;
}

/**
 * スレッド閲覧ページ（Server Component）
 *
 * See: docs/specs/screens/thread-view.yaml @SCR-002
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 */
export default async function ThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params;

  // スレッド詳細を取得
  const data = await fetchThreadDetail(threadId);

  // スレッドが存在しない場合は 404
  if (!data) {
    notFound();
  }

  const { thread, posts } = data;

  // ポーリング基準点: SSRで取得したレスの最大post_number
  // PostListLiveWrapper はこれより大きい番号のレスだけを新着として表示する
  const lastPostNumber =
    posts.length > 0
      ? Math.max(...posts.map((p) => p.postNumber))
      : 0;

  return (
    <main className="max-w-4xl mx-auto px-4 py-4">
      {/* thread-header: スレッドヘッダ
          See: docs/specs/screens/thread-view.yaml > thread-header */}
      <div id="thread-header" className="border-b border-gray-400 pb-2 mb-3">
        {/* back-to-list: 一覧に戻るリンク
            See: docs/specs/screens/thread-view.yaml > back-to-list */}
        <Link
          href="/"
          id="back-to-list"
          className="text-xs text-blue-600 hover:underline mb-1 inline-block"
        >
          ← 一覧に戻る
        </Link>

        {/* thread-title: スレッドタイトル
            See: docs/specs/screens/thread-view.yaml > thread-title */}
        <h1
          id="thread-title"
          className="text-base font-bold text-gray-800"
        >
          {thread.title}
        </h1>
        <p className="text-xs text-gray-500">
          レス数: {thread.postCount}
        </p>
      </div>

      {/* post-form: 書き込みフォーム（Client Component）
          未認証時に401レスポンスを受けると AuthModal が表示される。
          See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点） */}
      <PostForm threadId={threadId} />

      {/* post-list: レス一覧（初期表示はSSR）
          See: docs/specs/screens/thread-view.yaml > post-list
          See: docs/architecture/components/web-ui.md §3.2 スレッドページ */}
      <PostList posts={posts} />

      {/* PostListLiveWrapper: ポーリングで新着レスを追加表示（Client Component）
          SSRで表示済みのレス番号より大きいものだけを表示することで重複を防ぐ。
          See: docs/architecture/components/web-ui.md §3.2 スレッドページ > ポーリング方式 */}
      <PostListLiveWrapper
        threadId={threadId}
        initialLastPostNumber={lastPostNumber}
      />
    </main>
  );
}
