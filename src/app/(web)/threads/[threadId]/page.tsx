/**
 * スレッド閲覧ページ — /threads/{threadId}（Server Component, SSR）
 *
 * - PostService でスレッド情報・レス一覧を直接取得（SSR）
 * - スレッドが存在しない場合は 404 を返す
 * - 初期レスは PostList（Server Component）で SSR レンダリング
 * - 新着レスは PostListLiveWrapper（Client Component）がポーリングで取得
 * - 書き込みフォーム（PostForm: Client Component）を表示
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/thread.feature @一覧外のスレッドにURLで直接アクセスできる
 * See: features/posting.feature @無料ユーザーが書き込みを行う
 * See: docs/specs/screens/thread-view.yaml @SCR-002
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import PostList from "../../_components/PostList";
import PostListLiveWrapper from "../../_components/PostListLiveWrapper";
import PostForm from "../../_components/PostForm";
import { type Post } from "../../_components/PostItem";
import * as PostService from "@/lib/services/post-service";

// リクエストごとにSSRを実行し、Vercelのページキャッシュを無効化する。
// Cloudflare Workers環境でのself-fetch禁止（error code 1042）対応として
// APIルート経由ではなくサービス層を直接importする方式に変更した結果、
// Next.jsがページを静的と判断してキャッシュする問題を回避するために必要。
// See: docs/architecture/architecture.md §13 TDR-006
export const dynamic = 'force-dynamic';

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
 * スレッド詳細（スレッド情報＋レス一覧）をサービス層から直接取得する。
 *
 * SSR: Next.js の Server Component からサービス層を直接呼び出す。
 * Cloudflare Workers 環境では自分自身への fetch が error code 1042
 * （自己参照ループ禁止）でブロックされるため、API ルート経由ではなく
 * サービス層を直接 import して呼び出す。
 *
 * See: docs/specs/openapi.yaml > /api/threads/{threadId} > get
 *
 * @param threadId - スレッドID
 * @returns スレッド情報とレス一覧、スレッドが存在しない場合は null
 */
async function fetchThreadDetail(
  threadId: string
): Promise<ThreadDetailResponse | null> {
  try {
    const [thread, posts] = await Promise.all([
      PostService.getThread(threadId),
      PostService.getPostList(threadId),
    ]);

    if (!thread) {
      return null;
    }

    // PostService は Date 型で返すが、UI表示用に string へ変換する
    // （APIルート経由の場合は JSON シリアライズで自動変換されていた）
    return {
      thread: {
        id: thread.id,
        threadKey: thread.threadKey,
        title: thread.title,
        postCount: thread.postCount,
        lastPostAt: thread.lastPostAt instanceof Date ? thread.lastPostAt.toISOString() : String(thread.lastPostAt),
        createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : String(thread.createdAt),
      },
      posts: posts.map((p) => ({
        id: p.id,
        threadId: p.threadId,
        postNumber: p.postNumber,
        displayName: p.displayName,
        dailyId: p.dailyId,
        body: p.body,
        isSystemMessage: p.isSystemMessage,
        isDeleted: p.isDeleted,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      })),
    };
  } catch (err) {
    console.error("[fetchThreadDetail] Exception:", err);
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
