/**
 * GET /test/read.cgi/{boardId}/{key}/ — スレッド閲覧リダイレクト
 *
 * 5ch専用ブラウザがスレッドURLとして構築する /test/read.cgi/{boardId}/{key}/ に
 * 対応するルートハンドラ。Web UIのスレッド表示ページへ302リダイレクトする。
 *
 * 専ブラのスレッドリンクコピーや通常ブラウザでのリンク開封時に
 * Web UI でスレッドを表示できるようにする。
 *
 * リダイレクト先は /threads/{threadId}（Web UIスレッド表示ページ）。
 * threadKey から threadId を逆引きするため ThreadRepository を使用する。
 * スレッドが存在しない場合は404を返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @read.cgiのURLでスレッドが閲覧できる
 * See: docs/architecture/components/senbra-adapter.md
 */

import { NextRequest } from 'next/server'
import * as ThreadRepository from '@/lib/infrastructure/repositories/thread-repository'

/**
 * GET /test/read.cgi/{boardId}/{key}/ — Web UIスレッド表示ページへ302リダイレクト
 *
 * threadKey で Thread を検索し、存在すれば /threads/{threadId} へリダイレクトする。
 * スレッドが存在しない場合は404を返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @read.cgiのURLでスレッドが閲覧できる
 *
 * @param req - リクエスト
 * @param params - ルートパラメータ（boardId, key）
 * @returns 302リダイレクトまたは404レスポンス
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string; key: string }> }
): Promise<Response> {
  const { key } = await params

  // threadKey でスレッドを検索する
  const thread = await ThreadRepository.findByThreadKey(key)
  if (!thread) {
    return new Response('Not Found', { status: 404 })
  }

  // Web UIスレッド表示ページ（/threads/{threadId}）へ302リダイレクトする
  const redirectUrl = `/threads/${thread.id}`
  return Response.redirect(new URL(redirectUrl, req.url), 302)
}
