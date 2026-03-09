"use client";

/**
 * PostListLiveWrapper — ポーリングで新着レスを取得するClient Component
 *
 * 初期表示は Server Component（PostList）が担い、
 * このコンポーネントは30秒ごとにポーリングして新着レスを追加表示する。
 * lastPostNumber を基準に GET /api/threads/{threadId} を定期呼び出し、
 * 取得済みのレス番号より大きいレスのみ表示する。
 *
 * 設計上の判断:
 * - WebSocket不使用（Vercel Serverless制約・初期フェーズでは不要）
 * - ポーリング間隔30秒（コスト対応答速度のバランス）
 * - SSRで取得済みのレス群との重複表示を防ぐため、lastPostNumber より大きいものだけ表示
 *
 * See: features/phase1/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ > ポーリング方式
 */

import { useState, useEffect, useCallback } from "react";
import PostItem, { type Post } from "./PostItem";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ポーリング間隔（ミリ秒） */
const POLLING_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ThreadDetailResponse {
  thread: { id: string; title: string };
  posts: Post[];
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

interface PostListLiveWrapperProps {
  /** スレッドID */
  threadId: string;
  /** SSRで取得済みのレスの最大post_number。これより大きいレスだけを新着として表示 */
  initialLastPostNumber: number;
}

/**
 * ポーリングで新着レスを取得するClient Component
 *
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ
 */
export default function PostListLiveWrapper({
  threadId,
  initialLastPostNumber,
}: PostListLiveWrapperProps) {
  const [newPosts, setNewPosts] = useState<Post[]>([]);
  const [lastPostNumber, setLastPostNumber] = useState(initialLastPostNumber);

  /**
   * 新着レスをフェッチして状態に追加する。
   * GET /api/threads/{threadId} でスレッド全体のレス一覧を取得し、
   * lastPostNumber より大きいpost_numberのレスのみを新着として扱う。
   *
   * See: docs/architecture/components/web-ui.md §3.2 > ポーリング方式
   */
  const fetchNewPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        // エラー時はサイレントに失敗（次のポーリングサイクルで再試行）
        return;
      }

      const data = (await res.json()) as ThreadDetailResponse;
      const allPosts: Post[] = data.posts ?? [];

      // lastPostNumber より大きいpost_numberのレスだけを新着として追加
      const freshPosts = allPosts.filter(
        (p) => p.postNumber > lastPostNumber
      );

      if (freshPosts.length > 0) {
        setNewPosts((prev) => {
          // 既に表示済みのレスとの重複を排除（idで判定）
          const existingIds = new Set(prev.map((p) => p.id));
          const uniqueFreshPosts = freshPosts.filter(
            (p) => !existingIds.has(p.id)
          );
          return [...prev, ...uniqueFreshPosts];
        });

        // 最新のpost_numberを更新
        const maxPostNumber = Math.max(...freshPosts.map((p) => p.postNumber));
        setLastPostNumber(maxPostNumber);
      }
    } catch {
      // ネットワークエラー等はサイレントに失敗
    }
  }, [threadId, lastPostNumber]);

  // ポーリングの開始・停止
  useEffect(() => {
    const interval = setInterval(fetchNewPosts, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNewPosts]);

  // 新着レスがない場合は何も表示しない
  if (newPosts.length === 0) {
    return null;
  }

  return (
    <section aria-label="新着レス" id="post-list-live">
      {newPosts.map((post) => (
        <PostItem key={post.id} post={post} />
      ))}
    </section>
  );
}
