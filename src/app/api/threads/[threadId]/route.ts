/**
 * GET /api/threads/{threadId} — スレッド閲覧（レス一覧）
 *
 * See: features/phase1/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/phase1/thread.feature @一覧外のスレッドにURLで直接アクセスできる
 * See: docs/specs/openapi.yaml > /api/threads/{threadId}
 * See: docs/architecture/components/posting.md §2.3 getThread / getPostList
 *
 * 責務:
 *   - threadId パラメータの受け取り
 *   - PostService.getThread + PostService.getPostList への委譲
 *   - レスポンス整形（200 / 404）
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、PostService への委譲のみ行う
 *   - スレッド不存在時は 404 + ErrorResponse
 */

import { NextRequest, NextResponse } from 'next/server'
import * as PostService from '@/lib/services/post-service'

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/threads/{threadId} — スレッド詳細とレス一覧取得
 *
 * See: features/phase1/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/specs/openapi.yaml > /api/threads/{threadId} > get
 *
 * レスポンス:
 *   200: { thread: Thread; posts: Post[] }（レスは post_number ASC 順）
 *   404: ErrorResponse（スレッドが存在しない）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
): Promise<NextResponse> {
  const { threadId } = await params

  // --- PostService への委譲 ---
  const [thread, posts] = await Promise.all([
    PostService.getThread(threadId),
    PostService.getPostList(threadId),
  ])

  // スレッドが存在しない場合: 404
  if (!thread) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'スレッドが見つかりません' },
      { status: 404 }
    )
  }

  // 成功: 200 + { thread, posts }
  return NextResponse.json(
    { thread, posts },
    { status: 200 }
  )
}
